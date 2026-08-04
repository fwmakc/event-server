import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, LessThan, IsNull, Not } from "typeorm";
import {
  EventEntity,
  SubscriberEntity,
  DeliveryEntity,
} from "@src/database/entities";
import { DeliveryService } from "./delivery.service";

@Injectable()
export class DeliveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeliveryWorker.name);
  private deliveryTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private readonly workerInterval: number;
  private readonly maxInterval: number;
  private readonly cleanupInterval: number;
  private readonly batchSize: number;
  private readonly staleTimeout: number;
  private currentDelay: number;
  private destroyed = false;

  constructor(
    private readonly config: ConfigService,
    private readonly deliveryService: DeliveryService,
    @InjectRepository(EventEntity)
    private readonly eventRepo: Repository<EventEntity>,
    @InjectRepository(SubscriberEntity)
    private readonly subscriberRepo: Repository<SubscriberEntity>,
    @InjectRepository(DeliveryEntity)
    private readonly deliveryRepo: Repository<DeliveryEntity>,
  ) {
    this.workerInterval = Number(this.config.get("WORKER_INTERVAL_MS", 500));
    this.maxInterval = Number(this.config.get("WORKER_MAX_INTERVAL_MS", 2000));
    this.cleanupInterval = Number(this.config.get("CLEANUP_INTERVAL_MS", 3600000));
    this.batchSize = Number(this.config.get("BATCH_SIZE", 50));
    this.staleTimeout = Number(this.config.get("WORKER_STALE_TIMEOUT_MS", 300000));
    this.currentDelay = this.workerInterval;
  }

  onModuleInit() {
    this.scheduleNextDelivery();

    this.cleanupTimer = setInterval(() => {
      this.runCleanupCycle().catch((err) =>
        this.logger.error(`Cleanup cycle error: ${err.message}`, err.stack),
      );
    }, this.cleanupInterval);

    this.logger.log(
      `Worker started (interval=${this.workerInterval}-${this.maxInterval}ms adaptive, batch=${this.batchSize})`,
    );
  }

  onModuleDestroy() {
    this.destroyed = true;
    if (this.deliveryTimer) clearTimeout(this.deliveryTimer);
    clearInterval(this.cleanupTimer);
    this.logger.log("Worker stopped");
  }

  private scheduleNextDelivery(): void {
    if (this.destroyed) return;
    this.deliveryTimer = setTimeout(async () => {
      await this.runDeliveryCycle().catch((err) =>
        this.logger.error(`Delivery cycle error: ${err.message}`, err.stack),
      );
      this.scheduleNextDelivery();
    }, this.currentDelay);
  }

  private async runDeliveryCycle() {
    const hadEvents = await this.processPendingEvents();
    const hadDeliveries = await this.processPendingDeliveries();

    if (hadEvents || hadDeliveries) {
      await this.resolveEvents();
      if (this.currentDelay !== this.workerInterval) {
        this.logger.log(`Work found, resuming at ${this.workerInterval}ms`);
      }
      this.currentDelay = this.workerInterval;
    } else {
      const prev = this.currentDelay;
      this.currentDelay = Math.min(this.currentDelay * 2, this.maxInterval);
      if (prev !== this.currentDelay) {
        this.logger.debug(`Idle, back off to ${this.currentDelay}ms`);
      }
    }
  }

  private async processPendingEvents(): Promise<boolean> {
    const now = new Date();

    const events = await this.eventRepo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(EventEntity);

      const events = await repo
        .createQueryBuilder("e")
        .setLock("pessimistic_write")
        .setOnLocked("skip_locked")
        .where("e.status = :status", { status: "pending" })
        .andWhere("(e.deliverAfter IS NULL OR e.deliverAfter <= :now)", { now })
        .orderBy(
          `CASE e.priority 
            WHEN 'high' THEN 0 
            WHEN 'normal' THEN 1 
            ELSE 2 END`,
        )
        .addOrderBy("e.createdAt", "ASC")
        .take(this.batchSize)
        .getMany();

      if (events.length > 0) {
        await repo
          .createQueryBuilder("e")
          .update()
          .set({ status: "processing" })
          .where("id IN (:...ids)", { ids: events.map((e) => e.id) })
          .execute();
      }

      return events;
    });

    const subscriberCache = new Map<string, SubscriberEntity[]>();

    await Promise.all(
      events.map((event) => this.createDeliveriesForEvent(event, subscriberCache)),
    );

    return events.length > 0;
  }

  private async createDeliveriesForEvent(
    event: EventEntity,
    subscriberCache?: Map<string, SubscriberEntity[]>,
  ) {
    let subscribers: SubscriberEntity[];

    if (subscriberCache && subscriberCache.has(event.pattern)) {
      subscribers = subscriberCache.get(event.pattern)!;
    } else {
      subscribers = await this.subscriberRepo
        .createQueryBuilder("sub")
        .where("sub.patterns @> ARRAY[:pattern]::text[]", { pattern: event.pattern })
        .andWhere("sub.active = :active", { active: true })
        .getMany();
      if (subscriberCache) subscriberCache.set(event.pattern, subscribers);
    }

    if (subscribers.length === 0) {
      await this.eventRepo.update(event.id, { status: "delivered" });
      return;
    }

    const targets = event.broadcast
      ? subscribers
      : [subscribers[Math.floor(Math.random() * subscribers.length)]];

    const deliveries = targets.map((sub) =>
      this.deliveryRepo.create({
        eventId: event.id,
        subscriberId: sub.id,
        status: "pending",
        attempts: 0,
        maxAttempts: event.maxAttempts,
      }),
    );

    await this.deliveryRepo.save(deliveries);
  }

  private async processPendingDeliveries(): Promise<boolean> {
    const now = new Date();
    const staleBefore = new Date(Date.now() - this.staleTimeout);

    const deliveries = await this.deliveryRepo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(DeliveryEntity);

      const deliveries = await repo
        .createQueryBuilder("d")
        .setLock("pessimistic_write")
        .setOnLocked("skip_locked")
        .where(
          `(d.status = 'pending' AND (d.nextAttemptAt IS NULL OR d.nextAttemptAt <= :now))
           OR (d.status = 'processing' AND d.lastAttemptAt < :staleBefore)`,
          { now, staleBefore },
        )
        .take(this.batchSize)
        .getMany();

      if (deliveries.length > 0) {
        await repo
          .createQueryBuilder("d")
          .update()
          .set({ status: "processing", lastAttemptAt: new Date() })
          .where("id IN (:...ids)", { ids: deliveries.map((d) => d.id) })
          .execute();
      }

      return deliveries;
    });

    if (deliveries.length === 0) return false;

    const eventIds = [...new Set(deliveries.map((d) => d.eventId))];
    const subscriberIds = [...new Set(deliveries.map((d) => d.subscriberId))];

    const [events, subscribers] = await Promise.all([
      this.eventRepo
        .createQueryBuilder("e")
        .where("e.id IN (:...ids)", { ids: eventIds })
        .getMany(),
      this.subscriberRepo
        .createQueryBuilder("sub")
        .where("sub.id IN (:...ids)", { ids: subscriberIds })
        .getMany(),
    ]);

    const eventMap = new Map(events.map((e) => [e.id, e]));
    const subscriberMap = new Map(subscribers.map((s) => [s.id, s]));

    const tasks = deliveries.map(async (delivery) => {
      const event = eventMap.get(delivery.eventId);
      const subscriber = subscriberMap.get(delivery.subscriberId);

      if (!event || !subscriber) {
        await this.deliveryRepo.update(delivery.id, {
          status: "failed",
          responseBody: "Event or subscriber no longer exists",
        });
        return;
      }

      await this.deliveryService.deliver(event, subscriber, delivery);
    });

    await Promise.allSettled(tasks);
    return true;
  }

  private async resolveEvents() {
    const processingEvents = await this.eventRepo.find({
      where: { status: "processing" },
      take: 500,
    });

    if (processingEvents.length === 0) return;

    const eventIds = processingEvents.map((e) => e.id);

    const allDeliveries = await this.deliveryRepo
      .createQueryBuilder("d")
      .select(["d.id", "d.eventId", "d.status"])
      .where("d.eventId IN (:...eventIds)", { eventIds })
      .getMany();

    const deliveriesByEvent = new Map<number, { id: number; status: string }[]>();
    for (const d of allDeliveries) {
      const list = deliveriesByEvent.get(d.eventId);
      if (list) {
        list.push({ id: d.id, status: d.status });
      } else {
        deliveriesByEvent.set(d.eventId, [{ id: d.id, status: d.status }]);
      }
    }

    const deliveredIds: number[] = [];
    const failedIds: number[] = [];
    const eventsToDelete: number[] = [];
    const deliveriesToDelete: number[] = [];

    for (const event of processingEvents) {
      const deliveries = deliveriesByEvent.get(event.id) ?? [];

      const hasPending = deliveries.some(
        (d) => d.status === "pending" || d.status === "processing",
      );
      if (hasPending) continue;

      const allDelivered = deliveries.every((d) => d.status === "delivered");

      if (event.log === false) {
        eventsToDelete.push(event.id);
        deliveriesToDelete.push(...deliveries.map((d) => d.id));
      } else {
        if (allDelivered) {
          deliveredIds.push(event.id);
        } else {
          failedIds.push(event.id);
        }
        if (event.ttl === 0) {
          deliveriesToDelete.push(...deliveries.map((d) => d.id));
        }
      }
    }

    if (deliveredIds.length > 0) {
      await this.eventRepo
        .createQueryBuilder()
        .update()
        .set({ status: "delivered" })
        .where("id IN (:...ids)", { ids: deliveredIds })
        .execute();
    }
    if (failedIds.length > 0) {
      await this.eventRepo
        .createQueryBuilder()
        .update()
        .set({ status: "failed" })
        .where("id IN (:...ids)", { ids: failedIds })
        .execute();
    }

    if (deliveriesToDelete.length > 0) {
      await this.deliveryRepo
        .createQueryBuilder()
        .delete()
        .where("id IN (:...ids)", { ids: deliveriesToDelete })
        .execute();
    }
    if (eventsToDelete.length > 0) {
      await this.eventRepo
        .createQueryBuilder()
        .delete()
        .where("id IN (:...ids)", { ids: eventsToDelete })
        .execute();
    }
  }

  private async runCleanupCycle() {
    const now = new Date();
    this.logger.log("Running TTL cleanup...");

    const expiredEvents = await this.eventRepo.find({
      where: { expiresAt: LessThan(now) },
    });

    if (expiredEvents.length === 0) {
      this.logger.log("TTL cleanup: nothing to delete");
      return;
    }

    const eventIds = expiredEvents.map((e) => e.id);

    const deliveryResult = await this.deliveryRepo
      .createQueryBuilder()
      .delete()
      .where("eventId IN (:...ids)", { ids: eventIds })
      .execute();

    const eventResult = await this.eventRepo
      .createQueryBuilder()
      .delete()
      .where("id IN (:...ids)", { ids: eventIds })
      .execute();

    this.logger.log(
      `TTL cleanup: deleted ${eventResult.affected} events, ${deliveryResult.affected} deliveries`,
    );
  }
}
