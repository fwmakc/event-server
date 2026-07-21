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
  private deliveryTimer: NodeJS.Timeout;
  private cleanupTimer: NodeJS.Timeout;
  private running = false;

  private readonly workerInterval: number;
  private readonly cleanupInterval: number;
  private readonly batchSize: number;

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
    this.workerInterval = Number(this.config.get("WORKER_INTERVAL_MS", 2000));
    this.cleanupInterval = Number(this.config.get("CLEANUP_INTERVAL_MS", 3600000));
    this.batchSize = Number(this.config.get("BATCH_SIZE", 10));
  }

  onModuleInit() {
    this.deliveryTimer = setInterval(() => {
      this.runDeliveryCycle().catch((err) =>
        this.logger.error(`Delivery cycle error: ${err.message}`, err.stack),
      );
    }, this.workerInterval);

    this.cleanupTimer = setInterval(() => {
      this.runCleanupCycle().catch((err) =>
        this.logger.error(`Cleanup cycle error: ${err.message}`, err.stack),
      );
    }, this.cleanupInterval);

    this.logger.log(`Worker started (interval=${this.workerInterval}ms, batch=${this.batchSize})`);
  }

  onModuleDestroy() {
    clearInterval(this.deliveryTimer);
    clearInterval(this.cleanupTimer);
    this.logger.log("Worker stopped");
  }

  private async runDeliveryCycle() {
    if (this.running) return;
    this.running = true;

    try {
      await this.processPendingEvents();
      await this.processPendingDeliveries();
      await this.resolveEvents();
    } finally {
      this.running = false;
    }
  }

  private async processPendingEvents() {
    const now = new Date();

    const events = await this.eventRepo
      .createQueryBuilder("e")
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

    for (const event of events) {
      await this.createDeliveriesForEvent(event);
    }
  }

  private async createDeliveriesForEvent(event: EventEntity) {
    const subscribers = await this.subscriberRepo
      .createQueryBuilder("sub")
      .where(":pattern = ANY(sub.patterns)", { pattern: event.pattern })
      .andWhere("sub.active = :active", { active: true })
      .getMany();

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
    await this.eventRepo.update(event.id, { status: "processing" });
  }

  private async processPendingDeliveries() {
    const now = new Date();

    const deliveries = await this.deliveryRepo
      .createQueryBuilder("d")
      .where("d.status = :status", { status: "pending" })
      .andWhere("(d.nextAttemptAt IS NULL OR d.nextAttemptAt <= :now)", { now })
      .take(this.batchSize)
      .getMany();

    for (const delivery of deliveries) {
      const [event, subscriber] = await Promise.all([
        this.eventRepo.findOne({ where: { id: delivery.eventId } }),
        this.subscriberRepo.findOne({ where: { id: delivery.subscriberId } }),
      ]);

      if (!event || !subscriber) {
        await this.deliveryRepo.update(delivery.id, {
          status: "failed",
          responseBody: "Event or subscriber no longer exists",
        });
        continue;
      }

      await this.deliveryService.deliver(event, subscriber, delivery);
    }
  }

  private async resolveEvents() {
    const processingEvents = await this.eventRepo.find({
      where: { status: "processing" },
    });

    for (const event of processingEvents) {
      const deliveries = await this.deliveryRepo.find({
        where: { eventId: event.id },
      });

      const hasPending = deliveries.some((d) => d.status === "pending");
      if (hasPending) continue;

      const allDelivered = deliveries.every((d) => d.status === "delivered");
      const newStatus = allDelivered ? "delivered" : "failed";

      await this.eventRepo.update(event.id, { status: newStatus });

      if (event.log === false || event.ttl === 0) {
        await this.deliveryRepo.delete({ eventId: event.id });
        if (event.log === false) {
          await this.eventRepo.delete(event.id);
        }
      }
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
