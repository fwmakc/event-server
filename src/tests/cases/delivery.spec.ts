import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { Repository, DataSource } from "typeorm";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DeliveryEntity } from "@src/database/entities";
import {
  verifyEventDelivery,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
} from "api-server-toolkit/helper";
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
  let dataSource: DataSource;
  let subscriberSecret: string;
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
    dataSource = result.moduleRef.get(DataSource);

    const created = await request(app.getHttpServer())
      .post("/subscribe")
      .set(headers)
      .send({
        service: "mock-service",
        url: "http://mock-service:9999/webhook",
        patterns: ["delivery.test"],
        generateSecret: true,
      });
    // Subscribers with a secret get HMAC-signed deliveries.
    subscriberSecret = created.body.secret;
    expect(subscriberSecret).toMatch(/^[0-9a-f]{64}$/);
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
    // Signed delivery: HMAC headers instead of the shared internal key.
    expect(lastCall[1].headers["X-Internal-Api-Key"]).toBeUndefined();
    expect(lastCall[1].headers[WEBHOOK_SIGNATURE_HEADER]).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(lastCall[1].headers[WEBHOOK_TIMESTAMP_HEADER]).toBeDefined();
    expect(
      verifyEventDelivery(
        subscriberSecret,
        lastCall[1].body,
        lastCall[1].headers[WEBHOOK_SIGNATURE_HEADER],
        lastCall[1].headers[WEBHOOK_TIMESTAMP_HEADER],
      ),
    ).toBe(true);
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

  it("legacy subscriber without secret still gets the shared internal key", async () => {
    // Simulate a pre-migration row: secret provisioned never happened.
    await dataSource.query(
      `UPDATE subscribers SET secret = NULL WHERE service = 'mock-service'`,
    );

    await request(app.getHttpServer())
      .post("/events")
      .set(headers)
      .send({
        pattern: "delivery.test",
        payload: { legacy: true },
        source: "test",
        awaitResponse: true,
      })
      .expect(200);

    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    expect(lastCall[1].headers["X-Internal-Api-Key"]).toBe("test-api-key");
    expect(lastCall[1].headers[WEBHOOK_SIGNATURE_HEADER]).toBeUndefined();

    // Restore the secret for the remaining tests.
    await dataSource.query(
      `UPDATE subscribers SET secret = $1 WHERE service = 'mock-service'`,
      [subscriberSecret],
    );
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
