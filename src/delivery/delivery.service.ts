import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  httpPost,
  signEventDelivery,
  validateWebhookEgress,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  WebhookEgressMode,
} from "api-server-toolkit/helper";
import { EventEntity, SubscriberEntity, DeliveryEntity, DeliveryStatus } from "@src/database/entities";

export interface DeliveryResult {
  status: DeliveryStatus;
  responseCode: number | null;
  responseBody: string | null;
  durationMs: number;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
/** Only these keep method+body intact for a POST — everything else would
 * silently turn the event delivery into a GET on the target. */
const FOLLOWABLE_REDIRECTS = new Set([307, 308]);
const MAX_REDIRECT_HOPS = 3;

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);
  private readonly apiKey: string;
  private readonly defaultTimeout: number;
  private readonly circuitBreakerThreshold: number;
  private readonly egressMode: WebhookEgressMode;
  private readonly egressAllowlist: string[];

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(DeliveryEntity)
    private readonly deliveryRepo: Repository<DeliveryEntity>,
    @InjectRepository(EventEntity)
    private readonly eventRepo: Repository<EventEntity>,
    @InjectRepository(SubscriberEntity)
    private readonly subscriberRepo: Repository<SubscriberEntity>,
  ) {
    this.apiKey = this.config.get<string>("INTERNAL_API_KEY", "changeme");
    this.defaultTimeout = Number(this.config.get("DEFAULT_HTTP_TIMEOUT_MS", 10000));
    this.circuitBreakerThreshold = Number(this.config.get("CIRCUIT_BREAKER_THRESHOLD", 5));
    // Same policy the subscription endpoint enforces — re-applied per delivery
    // hop, because stored URLs and redirect targets are both outbound calls.
    this.egressMode = (config.get<string>("WEBHOOK_EGRESS_MODE", "internal") || "internal") as WebhookEgressMode;
    this.egressAllowlist = (config.get<string>("WEBHOOK_ALLOW_HOSTS", "") || "")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
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

    // Per-subscriber secret → HMAC-signed delivery (preferred transport):
    // the signature + freshness window authenticates the payload and the
    // shared internal key stays off the wire entirely. Legacy subscribers
    // without a secret keep the old shared-key transport.
    const rawBody = JSON.stringify(payload);
    const headers: Record<string, string> = {};
    if (subscriber.secret) {
      const timestamp = Math.floor(Date.now() / 1000);
      headers[WEBHOOK_SIGNATURE_HEADER] = signEventDelivery(subscriber.secret, timestamp, rawBody);
      headers[WEBHOOK_TIMESTAMP_HEADER] = String(timestamp);
    } else {
      headers["X-Internal-Api-Key"] = this.apiKey;
    }

    try {
      let targetUrl = subscriber.url;
      let response = await httpPost(targetUrl, payload, {
        headers,
        timeout: timeoutMs,
        raw: true,
        // Redirects are followed by hand below: fetch's default `follow`
        // would hop to any Location unchecked — an open redirect on a
        // subscriber must not become an SSRF bridge into the network.
        redirect: "manual",
      });

      let redirectRejection: string | null = null;
      for (let hop = 0; REDIRECT_STATUSES.has(response.status); hop++) {
        if (!FOLLOWABLE_REDIRECTS.has(response.status)) {
          redirectRejection = `redirect ${response.status} changes POST semantics; refusing to re-deliver the event as GET`;
          break;
        }
        if (hop >= MAX_REDIRECT_HOPS) {
          redirectRejection = `redirect chain exceeded ${MAX_REDIRECT_HOPS} hops`;
          break;
        }
        const location = response.headers?.["location"];
        if (!location) {
          redirectRejection = `redirect ${response.status} without a Location header`;
          break;
        }
        const nextUrl = new URL(location, targetUrl).toString();
        const check = validateWebhookEgress(nextUrl, this.egressMode, this.egressAllowlist);
        if (!check.ok) {
          redirectRejection = `redirect target rejected by egress policy (${this.egressMode}): ${check.reason}`;
          break;
        }
        targetUrl = nextUrl;
        response = await httpPost(targetUrl, payload, {
          headers,
          timeout: timeoutMs,
          raw: true,
          redirect: "manual",
        });
      }

      const durationMs = Date.now() - startTime;

      const body = typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data);

      if (redirectRejection) {
        // Permanent by nature: the subscriber's redirect config will not fix
        // itself between retries, and a policy rejection must not be retried.
        await this.deliveryRepo.update(delivery.id, {
          status: "failed",
          attempts: attemptNumber,
          lastAttemptAt: new Date(),
          nextAttemptAt: null,
          responseCode: response.status,
          responseBody: redirectRejection,
        });

        this.logger.warn(`Delivery ${delivery.id} to subscriber ${delivery.subscriberId} FAILED permanently (${redirectRejection})`);
        await this.checkCircuitBreaker(subscriber);

        return {
          status: "failed",
          responseCode: response.status,
          responseBody: redirectRejection,
          durationMs,
        };
      }

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
      this.logger.error(
        `ALERT: circuit breaker deactivated subscriber ${subscriber.service} (id=${subscriber.id}) ` +
        `after ${newStreak} consecutive permanent failures`,
      );
      await this.publishDeactivationAlert(subscriber, newStreak);
    }
  }

  /**
   * Fan a subscriber.deactivated event through the bus itself: any service
   * subscribed to the pattern (e.g. message-server emailing an operator)
   * learns about the deactivation. Must never break delivery handling.
   */
  private async publishDeactivationAlert(subscriber: SubscriberEntity, failures: number): Promise<void> {
    try {
      const now = new Date();
      const event = this.eventRepo.create({
        pattern: "subscriber.deactivated",
        payload: {
          subscriberId: Number(subscriber.id),
          service: subscriber.service,
          url: subscriber.url,
          failures,
          deactivatedAt: now.toISOString(),
        },
        source: "event-server",
        broadcast: true,
        awaitResponse: false,
        timeout: 30,
        maxAttempts: 5,
        retryDelay: 5,
        log: true,
        ttl: 30,
        priority: "high",
        delay: 0,
        status: "pending",
        expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        deliverAfter: null,
      });
      const saved = await this.eventRepo.save(event);
      this.logger.log(`Deactivation alert published: event ${saved.id} (pattern subscriber.deactivated)`);
    } catch (err) {
      this.logger.error(`Failed to publish subscriber.deactivated alert: ${err.message}`);
    }
  }
}
