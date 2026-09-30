import { Injectable, Logger, BadRequestException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { EventEntity, SubscriberEntity, DeliveryEntity, DeliveryStatus } from "@src/database/entities";
import { PublishEventDto } from "./dto/publish-event.dto";
import { DeliveryService } from "@src/delivery/delivery.service";
import { EventContracts, AuditEventDto } from "@src/contracts";
import { AUDIT_EVENT_PATTERN, AuditStoreService } from "@src/audit/audit-store.service";

export interface PublishResult {
  eventId: number;
  status: string;
  deliveries?: Array<{
    subscriberId: number;
    service: string;
    status: DeliveryStatus;
    responseCode: number | null;
    responseBody: string | null;
    durationMs: number;
  }>;
  message?: string;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private readonly strictMode: boolean;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(EventEntity)
    private readonly eventRepo: Repository<EventEntity>,
    @InjectRepository(SubscriberEntity)
    private readonly subscriberRepo: Repository<SubscriberEntity>,
    @InjectRepository(DeliveryEntity)
    private readonly deliveryRepo: Repository<DeliveryEntity>,
    private readonly deliveryService: DeliveryService,
    private readonly auditStore: AuditStoreService,
  ) {
    this.strictMode = config.get<string>("EVENT_STRICT_MODE", "false") === "true";
  }

  async publish(dto: PublishEventDto): Promise<PublishResult> {
    const Schema = EventContracts[dto.pattern];
    if (Schema) {
      const instance = plainToInstance(Schema, dto.payload);
      const errors = await validate(instance);
      if (errors.length > 0) {
        throw new BadRequestException({
          message: `Invalid payload for pattern "${dto.pattern}"`,
          errors: errors.map((e) => ({ property: e.property, constraints: e.constraints })),
        });
      }
    } else if (this.strictMode) {
      throw new BadRequestException(`Unknown event pattern: "${dto.pattern}"`);
    }

    // Audit records go to the append-only store before the event row: if the
    // store write fails the whole publish fails, so a client retry cannot
    // silently drop a security record.
    if (dto.pattern === AUDIT_EVENT_PATTERN) {
      const entry = plainToInstance(AuditEventDto, dto.payload);
      await this.auditStore.append(entry);
    }

    const now = new Date();

    const expiresAt = dto.ttl !== undefined && dto.ttl !== null && dto.ttl > 0
      ? new Date(now.getTime() + dto.ttl * 24 * 60 * 60 * 1000)
      : null;

    const deliverAfter = dto.delay && dto.delay > 0
      ? new Date(now.getTime() + dto.delay * 1000)
      : null;

    const event = this.eventRepo.create({
      pattern: dto.pattern,
      payload: dto.payload,
      source: dto.source,
      broadcast: dto.broadcast ?? true,
      awaitResponse: dto.awaitResponse ?? false,
      timeout: dto.timeout ?? 30,
      maxAttempts: dto.maxAttempts ?? 5,
      retryDelay: dto.retryDelay ?? 1,
      log: dto.log ?? true,
      ttl: dto.ttl !== undefined ? dto.ttl : 7,
      priority: dto.priority ?? "normal",
      delay: dto.delay ?? 0,
      status: "pending",
      expiresAt,
      deliverAfter,
    });

    const saved = await this.eventRepo.save(event);
    this.logger.log(`Event ${saved.id} published: ${dto.pattern} from ${dto.source}`);

    if (event.awaitResponse) {
      return await this.processSync(saved);
    }

    return { eventId: saved.id, status: "pending" };
  }

  private async processSync(event: EventEntity): Promise<PublishResult> {
    const subscribers = await this.findMatchingSubscribers(event.pattern);

    if (subscribers.length === 0) {
      await this.eventRepo.update(event.id, { status: "delivered" });
      return {
        eventId: event.id,
        status: "delivered",
        deliveries: [],
        message: `No subscribers for pattern '${event.pattern}'`,
      };
    }

    const targets = event.broadcast
      ? subscribers
      : [subscribers[Math.floor(Math.random() * subscribers.length)]];

    const results = await Promise.all(
      targets.map(async (sub) => {
        const delivery = this.deliveryRepo.create({
          eventId: event.id,
          subscriberId: sub.id,
          status: "pending",
          attempts: 0,
          maxAttempts: event.maxAttempts,
        });
        const savedDelivery = await this.deliveryRepo.save(delivery);

        const result = await this.deliveryService.deliver(event, sub, savedDelivery);
        return {
          subscriberId: sub.id,
          service: sub.service,
          status: result.status,
          responseCode: result.responseCode,
          responseBody: result.responseBody,
          durationMs: result.durationMs,
        };
      }),
    );

    const allDelivered = results.every((r) => r.status === "delivered");
    const eventStatus = allDelivered ? "delivered" : "failed";
    await this.eventRepo.update(event.id, { status: eventStatus });

    return {
      eventId: event.id,
      status: eventStatus,
      deliveries: results,
    };
  }

  /**
   * Requeue every failed delivery of an event. Returns how many were requeued.
   */
  async replayEvent(eventId: number): Promise<{ eventId: number; replayed: number }> {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found`);
    }

    const result = await this.deliveryRepo
      .createQueryBuilder()
      .update()
      .set({
        status: "pending",
        attempts: 0,
        nextAttemptAt: null,
        responseCode: null,
        responseBody: null,
      })
      .where("eventId = :id AND status = :status", { id: eventId, status: "failed" })
      .execute();

    const replayed = result.affected ?? 0;
    if (replayed > 0) {
      await this.eventRepo.update(eventId, { status: "processing" });
      this.logger.log(`Event ${eventId} replay: ${replayed} failed delivery(ies) requeued`);
    }

    return { eventId, replayed };
  }

  /**
   * Requeue a single terminal (failed/delivered) delivery.
   */
  async replayDelivery(id: number): Promise<DeliveryEntity> {
    const delivery = await this.deliveryRepo.findOne({ where: { id } });
    if (!delivery) {
      throw new NotFoundException(`Delivery ${id} not found`);
    }
    if (delivery.status === "pending" || delivery.status === "processing") {
      throw new BadRequestException(
        `Delivery ${id} is ${delivery.status} — nothing to replay`,
      );
    }

    await this.deliveryRepo.update(id, {
      status: "pending",
      attempts: 0,
      nextAttemptAt: null,
      responseCode: null,
      responseBody: null,
    });
    // Re-open a terminal event so resolveEvents() re-evaluates it
    // once the replayed delivery settles.
    await this.eventRepo
      .createQueryBuilder()
      .update()
      .set({ status: "processing" })
      .where("id = :id AND status IN ('failed', 'delivered')", { id: delivery.eventId })
      .execute();

    this.logger.log(
      `Delivery ${id} replay requested (event ${delivery.eventId}, subscriber ${delivery.subscriberId})`,
    );
    return (await this.deliveryRepo.findOne({ where: { id } }))!;
  }

  async findMatchingSubscribers(pattern: string): Promise<SubscriberEntity[]> {
    return this.subscriberRepo
      .createQueryBuilder("sub")
      .where("sub.patterns @> ARRAY[:pattern]::text[] AND sub.active = true", { pattern })
      .getMany();
  }

  async findOne(id: number): Promise<EventEntity | null> {
    return this.eventRepo.findOne({ where: { id } });
  }

  async findOneWithDeliveries(id: number) {
    const event = await this.eventRepo.findOne({ where: { id } });
    if (!event) return null;

    const deliveries = await this.deliveryRepo.find({
      where: { eventId: id },
    });

    const subscriberIds = [...new Set(deliveries.map((d) => d.subscriberId))];
    const subscribers = subscriberIds.length > 0
      ? await this.subscriberRepo
          .createQueryBuilder("s")
          .where("s.id IN (:...ids)", { ids: subscriberIds })
          .getMany()
      : [];

    const subMap = new Map(subscribers.map((s) => [s.id, s.service]));

    return {
      ...event,
      deliveries: deliveries.map((d) => ({
        ...d,
        service: subMap.get(d.subscriberId) || null,
      })),
    };
  }

  async findMany(filters: {
    pattern?: string;
    status?: string;
    source?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    const qb = this.eventRepo.createQueryBuilder("e");

    if (filters.pattern) {
      qb.andWhere("e.pattern LIKE :pattern", { pattern: `%${filters.pattern}%` });
    }
    if (filters.status) {
      qb.andWhere("e.status = :status", { status: filters.status });
    }
    if (filters.source) {
      qb.andWhere("e.source = :source", { source: filters.source });
    }

    qb.orderBy("e.createdAt", "DESC")
      .skip(offset)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    const eventIds = data.map((e) => e.id);
    const allDeliveries = eventIds.length > 0
      ? await this.deliveryRepo
          .createQueryBuilder("d")
          .select(["d.id", "d.eventId", "d.subscriberId", "d.status"])
          .where("d.eventId IN (:...ids)", { ids: eventIds })
          .getMany()
      : [];

    const deliveriesByEvent = new Map<number, typeof allDeliveries>();
    for (const d of allDeliveries) {
      const list = deliveriesByEvent.get(d.eventId);
      if (list) list.push(d);
      else deliveriesByEvent.set(d.eventId, [d]);
    }

    const dataWithDeliveries = data.map((e) => ({
      ...e,
      deliveries: (deliveriesByEvent.get(e.id) ?? []).map((d) => ({
        subscriberId: d.subscriberId,
        status: d.status,
      })),
    }));

    return { total, page, limit, data: dataWithDeliveries };
  }
}
