import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { Repository } from "typeorm";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DeliveryEntity } from "@src/database/entities";
import { createTestApp } from "../app.testingModule";

const mockFetch = jest.fn() as jest.Mock;
global.fetch = mockFetch;

function mockResponse(status: number, data: unknown) {
  const body = typeof data === "string" ? data : JSON.stringify(data);
  return {
    status,
    ok: status >= 200 && status < 300,
    text: () => Promise.resolve(body),
  };
}

describe("Delivery — webhook delivery + retry", () => {
  let app: INestApplication;
  let deliveryRepo: Repository<DeliveryEntity>;
  const apiKey = "test-api-key";
  const headers = { "X-Internal-Api-Key": apiKey };

  beforeEach(() => {
    mockFetch.mockResolvedValue(mockResponse(200, { ok: true }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    deliveryRepo = result.moduleRef.get(getRepositoryToken(DeliveryEntity));

    await request(app.getHttpServer())
      .post("/subscribe")
      .set(headers)
      .send({
        service: "mock-service",
        url: "http://mock-service:9999/webhook",
        patterns: ["delivery.test"],
      });
  });

  afterAll(async () => {
    await app.close();
  });

  it("sync delivery: success — 200 response", async () => {
    const res = await request(app.getHttpServer())
      .post("/events")
      .set(headers)
      .send({
        pattern: "delivery.test",
        payload: { msg: "hello" },
        source: "test",
        awaitResponse: true,
      })
      .expect(200);

    expect(res.body.status).toBe("delivered");
    expect(res.body.deliveries).toHaveLength(1);
    expect(res.body.deliveries[0].status).toBe("delivered");
    expect(res.body.deliveries[0].responseCode).toBe(200);

    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    expect(lastCall[0]).toBe("http://mock-service:9999/webhook");
    expect(lastCall[1].method).toBe("POST");
    expect(lastCall[1].headers).toEqual(
      expect.objectContaining({
        "X-Internal-Api-Key": "test-api-key",
        "Content-Type": "application/json",
      }),
    );
    const webhookBody = JSON.parse(lastCall[1].body);
    expect(webhookBody).toEqual(
      expect.objectContaining({
        pattern: "delivery.test",
        payload: { msg: "hello" },
        source: "test",
      }),
    );
  });

  it("sync delivery: webhook returns 500 — marked failed", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(500, "Internal Server Error"));

    const res = await request(app.getHttpServer())
      .post("/events")
      .set(headers)
      .send({
        pattern: "delivery.test",
        payload: { fail: true },
        source: "test",
        awaitResponse: true,
        maxAttempts: 1,
      })
      .expect(200);

    expect(res.body.status).toBe("failed");
    expect(res.body.deliveries[0].status).toBe("failed");
    expect(res.body.deliveries[0].responseCode).toBe(500);
  });

  it("sync delivery: connection error — marked failed", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

    const res = await request(app.getHttpServer())
      .post("/events")
      .set(headers)
      .send({
        pattern: "delivery.test",
        payload: {},
        source: "test",
        awaitResponse: true,
        maxAttempts: 1,
      })
      .expect(200);

    expect(res.body.status).toBe("failed");
    expect(res.body.deliveries[0].status).toBe("failed");
    expect(res.body.deliveries[0].responseBody).toContain("Connection refused");
  });

  it("webhook payload includes eventId, pattern, payload, source, attempt", async () => {
    await request(app.getHttpServer())
      .post("/events")
      .set(headers)
      .send({
        pattern: "delivery.test",
        payload: { custom: "data" },
        source: "test-service",
        awaitResponse: true,
      });

    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    const webhookBody = JSON.parse(lastCall[1].body);

    expect(webhookBody).toHaveProperty("eventId");
    expect(webhookBody).toHaveProperty("pattern", "delivery.test");
    expect(webhookBody).toHaveProperty("payload", { custom: "data" });
    expect(webhookBody).toHaveProperty("source", "test-service");
    expect(webhookBody).toHaveProperty("timestamp");
    expect(webhookBody).toHaveProperty("attempt", 1);
  });

  it("delivery record stores responseCode and responseBody", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(201, { created: true }));

    const res = await request(app.getHttpServer())
      .post("/events")
      .set(headers)
      .send({
        pattern: "delivery.test",
        payload: {},
        source: "test",
        awaitResponse: true,
      });

    const deliveries = await deliveryRepo.find({
      where: { eventId: res.body.eventId },
    });

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].responseCode).toBe(201);
    expect(deliveries[0].responseBody).toBe(JSON.stringify({ created: true }));
    expect(deliveries[0].status).toBe("delivered");
    expect(deliveries[0].attempts).toBe(1);
  });
});
