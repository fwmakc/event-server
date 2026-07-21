import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EventEntity, SubscriberEntity, DeliveryEntity, DeliveryStatus } from "@src/database/entities";
import { PublishEventDto } from "./dto/publish-event.dto";
import { DeliveryService } from "@src/delivery/delivery.service";

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

  constructor(
    @InjectRepository(EventEntity)
    private readonly eventRepo: Repository<EventEntity>,
    @InjectRepository(SubscriberEntity)
    private readonly subscriberRepo: Repository<SubscriberEntity>,
    @InjectRepository(DeliveryEntity)
    private readonly deliveryRepo: Repository<DeliveryEntity>,
    private readonly deliveryService: DeliveryService,
  ) {}

  async publish(dto: PublishEventDto): Promise<PublishResult> {
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

    const results: PublishResult["deliveries"] = [];

    for (const sub of targets) {
      const delivery = this.deliveryRepo.create({
        eventId: event.id,
        subscriberId: sub.id,
        status: "pending",
        attempts: 0,
        maxAttempts: event.maxAttempts,
      });
      const savedDelivery = await this.deliveryRepo.save(delivery);

      const result = await this.deliveryService.deliver(event, sub, savedDelivery);
      results.push({
        subscriberId: sub.id,
        service: sub.service,
        status: result.status,
        responseCode: result.responseCode,
        responseBody: result.responseBody,
        durationMs: result.durationMs,
      });
    }

    const allDelivered = results.every((r) => r.status === "delivered");
    const eventStatus = allDelivered ? "delivered" : "failed";
    await this.eventRepo.update(event.id, { status: eventStatus });

    return {
      eventId: event.id,
      status: eventStatus,
      deliveries: results,
    };
  }

  async findMatchingSubscribers(pattern: string): Promise<SubscriberEntity[]> {
    return this.subscriberRepo
      .createQueryBuilder("sub")
      .where(":pattern = ANY(sub.patterns) AND sub.active = true", { pattern })
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

    const dataWithDeliveries = await Promise.all(
      data.map(async (e) => {
        const deliveries = await this.deliveryRepo.find({
          where: { eventId: e.id },
        });
        return {
          ...e,
          deliveries: deliveries.map((d) => ({
            subscriberId: d.subscriberId,
            status: d.status,
          })),
        };
      }),
    );

    return { total, page, limit, data: dataWithDeliveries };
  }
}
