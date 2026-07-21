import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { Repository } from "typeorm";
import { getRepositoryToken } from "@nestjs/typeorm";
import axios from "axios";
import { EventEntity, DeliveryEntity } from "@src/database/entities";
import { createTestApp } from "../app.testingModule";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const waitForCondition = async (
  fn: () => Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 100,
): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return true;
    await sleep(intervalMs);
  }
  return false;
};

describe("Worker — async delivery + retry + cleanup", () => {
  let app: INestApplication;
  let eventRepo: Repository<EventEntity>;
  let deliveryRepo: Repository<DeliveryEntity>;
  const apiKey = "test-api-key";
  const headers = { "X-Internal-Api-Key": apiKey };

  beforeAll(async () => {
    process.env.WORKER_INTERVAL_MS = "100";
    process.env.CLEANUP_INTERVAL_MS = "500";
    process.env.BATCH_SIZE = "5";

    const result = await createTestApp();
    app = result.app;
    eventRepo = result.moduleRef.get(getRepositoryToken(EventEntity));
    deliveryRepo = result.moduleRef.get(getRepositoryToken(DeliveryEntity));

    await request(app.getHttpServer())
      .post("/subscribe")
      .set(headers)
      .send({
        service: "worker-test-service",
        url: "http://worker-test:9999/webhook",
        patterns: ["worker.test"],
      });
  });

  beforeEach(() => {
    mockedAxios.post.mockResolvedValue({
      status: 200,
      data: { ok: true },
    } as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it("async event: worker delivers within 5s", async () => {
    const publishRes = await request(app.getHttpServer())
      .post("/events")
      .set(headers)
      .send({
        pattern: "worker.test",
        payload: { async: true },
        source: "test",
        awaitResponse: false,
      })
      .expect(200);

    expect(publishRes.body.status).toBe("pending");

    const delivered = await waitForCondition(async () => {
      const e = await eventRepo.findOne({ where: { id: publishRes.body.eventId } });
      return e?.status === "delivered";
    });

    expect(delivered).toBe(true);

    const deliveries = await deliveryRepo.find({
      where: { eventId: publishRes.body.eventId },
    });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].status).toBe("delivered");
  });

  it("broadcast: delivers to ALL matching subscribers", async () => {
    await request(app.getHttpServer())
      .post("/subscribe")
      .set(headers)
      .send({
        service: "worker-test-service-2",
        url: "http://worker-test-2:9999/webhook",
        patterns: ["worker.test"],
      });

    const publishRes = await request(app.getHttpServer())
      .post("/events")
      .set(headers)
      .send({
        pattern: "worker.test",
        payload: { broadcast: true },
        source: "test",
        broadcast: true,
        awaitResponse: false,
      });

    const delivered = await waitForCondition(async () => {
      const e = await eventRepo.findOne({ where: { id: publishRes.body.eventId } });
      return e?.status === "delivered";
    });

    expect(delivered).toBe(true);

    const deliveries = await deliveryRepo.find({
      where: { eventId: publishRes.body.eventId },
    });
    expect(deliveries.length).toBeGreaterThanOrEqual(2);
    expect(deliveries.every((d) => d.status === "delivered")).toBe(true);
  });

  it("non-broadcast: delivers to ONE subscriber", async () => {
    const publishRes = await request(app.getHttpServer())
      .post("/events")
      .set(headers)
      .send({
        pattern: "worker.test",
        payload: { broadcast: false },
        source: "test",
        broadcast: false,
        awaitResponse: false,
      });

    const resolved = await waitForCondition(async () => {
      const e = await eventRepo.findOne({ where: { id: publishRes.body.eventId } });
      return e?.status === "delivered" || e?.status === "failed";
    });

    expect(resolved).toBe(true);

    const deliveries = await deliveryRepo.find({
      where: { eventId: publishRes.body.eventId },
    });
    expect(deliveries).toHaveLength(1);
  });

  it("delayed event: not delivered until delay passes", async () => {
    const publishRes = await request(app.getHttpServer())
      .post("/events")
      .set(headers)
      .send({
        pattern: "worker.test",
        payload: { delayed: true },
        source: "test",
        delay: 3,
        awaitResponse: false,
      });

    await sleep(500);

    const eventBefore = await eventRepo.findOne({ where: { id: publishRes.body.eventId } });
    expect(eventBefore.status).toBe("pending");

    const delivered = await waitForCondition(async () => {
      const e = await eventRepo.findOne({ where: { id: publishRes.body.eventId } });
      return e?.status === "delivered";
    }, 10000);

    expect(delivered).toBe(true);
  });

  it("inactive subscriber: skipped by worker", async () => {
    await request(app.getHttpServer())
      .post("/subscribe")
      .set(headers)
      .send({
        service: "inactive-service",
        url: "http://inactive:9999/webhook",
        patterns: ["worker.inactive"],
      });

    const subs = await request(app.getHttpServer())
      .get("/subscribers")
      .set(headers);

    const inactiveSub = subs.body.data.find(
      (s: any) => s.service === "inactive-service",
    );
    await request(app.getHttpServer())
      .patch(`/subscribe/${inactiveSub.id}`)
      .set(headers)
      .send({ active: false });

    const publishRes = await request(app.getHttpServer())
      .post("/events")
      .set(headers)
      .send({
        pattern: "worker.inactive",
        payload: {},
        source: "test",
        awaitResponse: false,
      });

    const delivered = await waitForCondition(async () => {
      const e = await eventRepo.findOne({ where: { id: publishRes.body.eventId } });
      return e?.status === "delivered";
    });

    expect(delivered).toBe(true);

    const deliveries = await deliveryRepo.find({
      where: { eventId: publishRes.body.eventId },
    });
    expect(deliveries).toHaveLength(0);
  });
});
