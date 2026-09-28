import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { Repository } from "typeorm";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DeliveryEntity, EventEntity, SubscriberEntity } from "@src/database/entities";
import { createTestApp } from "../app.testingModule";

const mockFetch = jest.fn() as jest.Mock;
global.fetch = mockFetch;

describe("Replay — failed deliveries", () => {
  let app: INestApplication;
  let eventRepo: Repository<EventEntity>;
  let deliveryRepo: Repository<DeliveryEntity>;
  let subscriberRepo: Repository<SubscriberEntity>;
  const headers = { "X-Internal-Api-Key": "test-api-key" };

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    eventRepo = result.moduleRef.get(getRepositoryToken(EventEntity));
    deliveryRepo = result.moduleRef.get(getRepositoryToken(DeliveryEntity));
    subscriberRepo = result.moduleRef.get(getRepositoryToken(SubscriberEntity));
  });

  afterAll(async () => {
    await app.close();
  });

  async function seedFailedDelivery(): Promise<{ event: EventEntity; delivery: DeliveryEntity }> {
    const subscriber = await subscriberRepo.save({
      service: "dead-service",
      url: "http://dead-service:9999/webhook",
      patterns: ["replay.test"],
      active: true,
    });
    const event = await eventRepo.save({
      pattern: "replay.test",
      payload: { n: 1 },
      source: "test",
      broadcast: true,
      awaitResponse: false,
      timeout: 30,
      maxAttempts: 5,
      retryDelay: 1,
      log: true,
      ttl: 7,
      priority: "normal",
      delay: 0,
      status: "failed",
      expiresAt: null,
      deliverAfter: null,
    });
    const delivery = await deliveryRepo.save({
      eventId: event.id,
      subscriberId: subscriber.id,
      status: "failed",
      attempts: 5,
      maxAttempts: 5,
      lastAttemptAt: new Date(),
      nextAttemptAt: null,
      responseCode: 500,
      responseBody: "boom",
    });
    return { event, delivery };
  }

  it("POST /events/:id/replay — 401 without key", async () => {
    await request(app.getHttpServer()).post("/events/1/replay").expect(401);
  });

  it("POST /events/:id/replay — unknown event — 404", async () => {
    await request(app.getHttpServer())
      .post("/events/999999/replay")
      .set(headers)
      .expect(404);
  });

  it("POST /events/:id/replay — requeues failed deliveries, reopens event", async () => {
    mockFetch.mockResolvedValue({ status: 200, ok: true, text: () => Promise.resolve("{}") });
    const { event, delivery } = await seedFailedDelivery();

    const res = await request(app.getHttpServer())
      .post(`/events/${event.id}/replay`)
      .set(headers)
      .expect(200);

    expect(res.body).toEqual({ eventId: event.id, replayed: 1 });

    const requeued = await deliveryRepo.findOne({ where: { id: delivery.id } });
    expect(requeued?.status).toBe("pending");
    expect(requeued?.attempts).toBe(0);
    expect(requeued?.responseBody).toBeNull();

    const reopened = await eventRepo.findOne({ where: { id: event.id } });
    expect(reopened?.status).toBe("processing");

    // the worker redelivers to the mocked endpoint
    await new Promise((r) => setTimeout(r, 3000));
    const redelivered = await deliveryRepo.findOne({ where: { id: delivery.id } });
    expect(redelivered?.status).toBe("delivered");
  });

  it("POST /events/:id/replay — nothing failed — replayed 0", async () => {
    const { event } = await seedFailedDelivery();
    await deliveryRepo.update({ eventId: event.id }, { status: "delivered" });

    const res = await request(app.getHttpServer())
      .post(`/events/${event.id}/replay`)
      .set(headers)
      .expect(200);

    expect(res.body).toEqual({ eventId: event.id, replayed: 0 });
  });

  it("POST /deliveries/:id/replay — unknown delivery — 404", async () => {
    await request(app.getHttpServer())
      .post("/deliveries/999999/replay")
      .set(headers)
      .expect(404);
  });

  it("POST /deliveries/:id/replay — pending delivery — 400", async () => {
    const { delivery } = await seedFailedDelivery();
    await deliveryRepo.update(delivery.id, { status: "pending", nextAttemptAt: null });

    await request(app.getHttpServer())
      .post(`/deliveries/${delivery.id}/replay`)
      .set(headers)
      .expect(400);
  });

  it("POST /deliveries/:id/replay — requeues one delivery", async () => {
    mockFetch.mockResolvedValue({ status: 200, ok: true, text: () => Promise.resolve("{}") });
    const { event, delivery } = await seedFailedDelivery();

    const res = await request(app.getHttpServer())
      .post(`/deliveries/${delivery.id}/replay`)
      .set(headers)
      .expect(200);

    expect(res.body.status).toBe("pending");
    expect(res.body.attempts).toBe(0);

    const reopened = await eventRepo.findOne({ where: { id: event.id } });
    expect(reopened?.status).toBe("processing");
  });
});

describe("Circuit breaker — subscriber.deactivated alert", () => {
  let app: INestApplication;
  let eventRepo: Repository<EventEntity>;
  let subscriberRepo: Repository<SubscriberEntity>;
  const headers = { "X-Internal-Api-Key": "test-api-key" };

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    eventRepo = result.moduleRef.get(getRepositoryToken(EventEntity));
    subscriberRepo = result.moduleRef.get(getRepositoryToken(SubscriberEntity));

    await request(app.getHttpServer())
      .post("/subscribe")
      .set(headers)
      .send({
        service: "flaky-service",
        url: "http://flaky-service:9999/webhook",
        patterns: ["breaker.test"],
      });
  });

  afterAll(async () => {
    await app.close();
  });

  it("deactivates the subscriber after the threshold and publishes the alert event", async () => {
    // CIRCUIT_BREAKER_THRESHOLD is 5 by default; permanent 4xx failures hit
    // checkCircuitBreaker on every terminal failure.
    mockFetch.mockResolvedValue({ status: 400, ok: false, text: () => Promise.resolve("bad") });

    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post("/events")
        .set(headers)
        .send({
          pattern: "breaker.test",
          payload: { i },
          source: "test",
          awaitResponse: true,
          maxAttempts: 1,
        })
        .expect(200);
    }

    const subscriber = await subscriberRepo.findOne({ where: { service: "flaky-service" } });
    expect(subscriber?.active).toBe(false);

    const alerts = await eventRepo.find({ where: { pattern: "subscriber.deactivated" } });
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    const payload = alerts[alerts.length - 1].payload as Record<string, unknown>;
    expect(payload.service).toBe("flaky-service");
    expect(payload.failures).toBeGreaterThanOrEqual(1);
    expect(typeof payload.deactivatedAt).toBe("string");
  }, 30000);
});
