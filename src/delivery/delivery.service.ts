import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { httpPost } from "api-server-toolkit/helper";
import { EventEntity, SubscriberEntity, DeliveryEntity, DeliveryStatus } from "@src/database/entities";

export interface DeliveryResult {
  status: DeliveryStatus;
  responseCode: number | null;
  responseBody: string | null;
  durationMs: number;
}

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);
  private readonly apiKey: string;
  private readonly defaultTimeout: number;
  private readonly circuitBreakerThreshold: number;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(DeliveryEntity)
    private readonly deliveryRepo: Repository<DeliveryEntity>,
    @InjectRepository(SubscriberEntity)
    private readonly subscriberRepo: Repository<SubscriberEntity>,
  ) {
    this.apiKey = this.config.get<string>("INTERNAL_API_KEY", "changeme");
    this.defaultTimeout = Number(this.config.get("DEFAULT_HTTP_TIMEOUT_MS", 10000));
    this.circuitBreakerThreshold = Number(this.config.get("CIRCUIT_BREAKER_THRESHOLD", 5));
  }

  async deliver(
    event: EventEntity,
    subscriber: SubscriberEntity,
    delivery: DeliveryEntity,
  ): Promise<DeliveryResult> {
    const startTime = Date.now();
    const attemptNumber = delivery.attempts + 1;

    const payload = {
      eventId: event.id,
      pattern: event.pattern,
      payload: event.payload,
      source: event.source,
      timestamp: new Date().toISOString(),
      attempt: attemptNumber,
    };

    const timeoutMs = event.timeout
      ? event.timeout * 1000
      : this.defaultTimeout;

    try {
      const response = await httpPost(subscriber.url, payload, {
        headers: {
          "X-Internal-Api-Key": this.apiKey,
        },
        timeout: timeoutMs,
        raw: true,
      });

      const durationMs = Date.now() - startTime;

      const body = typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data);

      if (response.ok) {
        await this.deliveryRepo.update(delivery.id, {
          status: "delivered",
          attempts: attemptNumber,
          lastAttemptAt: new Date(),
          nextAttemptAt: null,
          responseCode: response.status,
          responseBody: body,
        });

        await this.subscriberRepo
          .createQueryBuilder()
          .update()
          .set({ failureStreak: 0 })
          .where("id = :id AND failure_streak > 0", { id: delivery.subscriberId })
          .execute();

        this.logger.log(`Delivery ${delivery.id} to ${subscriber.service} succeeded (${response.status}, ${durationMs}ms)`);

        return {
          status: "delivered",
          responseCode: response.status,
          responseBody: body,
          durationMs,
        };
      }

      const isPermanent4xx =
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 408 &&
        response.status !== 429;

      if (isPermanent4xx) {
        await this.deliveryRepo.update(delivery.id, {
          status: "failed",
          attempts: attemptNumber,
          lastAttemptAt: new Date(),
          nextAttemptAt: null,
          responseCode: response.status,
          responseBody: body,
        });

        this.logger.warn(
          `Delivery ${delivery.id} to subscriber ${delivery.subscriberId} FAILED permanently ` +
          `(4xx ${response.status}, ${durationMs}ms)`,
        );

        await this.checkCircuitBreaker(subscriber);

        return {
          status: "failed",
          responseCode: response.status,
          responseBody: body,
          durationMs,
        };
      }

      await this.handleFailure(delivery, event, subscriber, response.status, body, durationMs);

      return {
        status: "failed",
        responseCode: response.status,
        responseBody: body,
        durationMs,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const body = err.message || "Connection error";

      await this.handleFailure(delivery, event, subscriber, null, body, durationMs);

      return {
        status: "failed",
        responseCode: null,
        responseBody: body,
        durationMs,
      };
    }
  }

  private async handleFailure(
    delivery: DeliveryEntity,
    event: EventEntity,
    subscriber: SubscriberEntity,
    code: number | null,
    body: string,
    durationMs: number,
  ): Promise<void> {
    const attemptNumber = delivery.attempts + 1;

    if (attemptNumber >= delivery.maxAttempts) {
      await this.deliveryRepo.update(delivery.id, {
        status: "failed",
        attempts: attemptNumber,
        lastAttemptAt: new Date(),
        nextAttemptAt: null,
        responseCode: code,
        responseBody: body,
      });

      this.logger.warn(
        `Delivery ${delivery.id} to subscriber ${delivery.subscriberId} FAILED permanently ` +
        `(attempt ${attemptNumber}/${delivery.maxAttempts}, code=${code}, ${durationMs}ms)`,
      );

      await this.checkCircuitBreaker(subscriber);
    } else {
      const backoffMs = event.retryDelay * 1000 * Math.pow(2, attemptNumber - 1);
      const nextAttempt = new Date(Date.now() + backoffMs);

      await this.deliveryRepo.update(delivery.id, {
        status: "pending",
        attempts: attemptNumber,
        lastAttemptAt: new Date(),
        nextAttemptAt: nextAttempt,
        responseCode: code,
        responseBody: body,
      });

      this.logger.warn(
        `Delivery ${delivery.id} to subscriber ${delivery.subscriberId} failed ` +
        `(attempt ${attemptNumber}/${delivery.maxAttempts}, code=${code}), retry at ${nextAttempt.toISOString()}`,
      );
    }
  }

  private async checkCircuitBreaker(subscriber: SubscriberEntity): Promise<void> {
    const result = await this.subscriberRepo
      .createQueryBuilder()
      .update()
      .set({ failureStreak: () => "failure_streak + 1" })
      .where("id = :id", { id: subscriber.id })
      .returning("failure_streak")
      .execute();

    const newStreak: number = result.raw[0]?.failure_streak ?? 0;

    if (newStreak >= this.circuitBreakerThreshold) {
      await this.subscriberRepo.update(subscriber.id, { active: false, failureStreak: 0 });
      this.logger.warn(
        `Circuit breaker: deactivated subscriber ${subscriber.service} (id=${subscriber.id}) ` +
        `after ${newStreak} consecutive permanent failures`,
      );
    }
  }
}
