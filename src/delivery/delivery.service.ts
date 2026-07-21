import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import axios, { AxiosError } from "axios";
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

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(DeliveryEntity)
    private readonly deliveryRepo: Repository<DeliveryEntity>,
  ) {
    this.apiKey = this.config.get<string>("INTERNAL_API_KEY", "changeme");
    this.defaultTimeout = Number(this.config.get("DEFAULT_HTTP_TIMEOUT_MS", 30000));
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
      ? Math.min(event.timeout * 1000, this.defaultTimeout)
      : this.defaultTimeout;

    try {
      const response = await axios.post(subscriber.url, payload, {
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Api-Key": this.apiKey,
        },
        timeout: timeoutMs,
        validateStatus: () => true,
      });

      const durationMs = Date.now() - startTime;
      const isSuccess = response.status >= 200 && response.status < 300;

      const body = typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data);

      if (isSuccess) {
        await this.deliveryRepo.update(delivery.id, {
          status: "delivered",
          attempts: attemptNumber,
          lastAttemptAt: new Date(),
          nextAttemptAt: null,
          responseCode: response.status,
          responseBody: body,
        });

        this.logger.log(`Delivery ${delivery.id} to ${subscriber.service} succeeded (${response.status}, ${durationMs}ms)`);

        return {
          status: "delivered",
          responseCode: response.status,
          responseBody: body,
          durationMs,
        };
      }

      await this.handleFailure(delivery, event, response.status, body, durationMs);

      return {
        status: "failed",
        responseCode: response.status,
        responseBody: body,
        durationMs,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const axiosErr = err as AxiosError;
      const code = axiosErr.response?.status ?? null;
      const body = axiosErr.response?.data
        ? (typeof axiosErr.response.data === "string"
            ? axiosErr.response.data
            : JSON.stringify(axiosErr.response.data))
        : axiosErr.message || "Connection error";

      await this.handleFailure(delivery, event, code, body, durationMs);

      return {
        status: "failed",
        responseCode: code,
        responseBody: body,
        durationMs,
      };
    }
  }

  private async handleFailure(
    delivery: DeliveryEntity,
    event: EventEntity,
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
    } else {
      const backoffMs = event.retryDelay * 1000 * Math.pow(2, attemptNumber - 1);
      const nextAttempt = new Date(Date.now() + backoffMs);

      await this.deliveryRepo.update(delivery.id, {
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
}
