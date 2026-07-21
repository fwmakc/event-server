import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { Repository } from "typeorm";
import { getRepositoryToken } from "@nestjs/typeorm";
import { EventEntity } from "@src/database/entities";
import { createTestApp } from "../app.testingModule";

describe("Events — publish and query", () => {
  let app: INestApplication;
  let eventRepo: Repository<EventEntity>;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    eventRepo = result.moduleRef.get(getRepositoryToken(EventEntity));
  });

  afterAll(async () => {
    await app.close();
  });

  const apiKey = "test-api-key";
  const headers = { "X-Internal-Api-Key": apiKey };

  describe("POST /events (async)", () => {
    it("publishes event with defaults", async () => {
      const res = await request(app.getHttpServer())
        .post("/events")
        .set(headers)
        .send({
          pattern: "user.registered",
          payload: { userId: 1, email: "test@example.com" },
          source: "auth-server",
        })
        .expect(200);

      expect(res.body.eventId).toBeDefined();
      expect(res.body.status).toBe("pending");

      const event = await eventRepo.findOne({ where: { id: res.body.eventId } });
      expect(event.pattern).toBe("user.registered");
      expect(event.broadcast).toBe(true);
      expect(event.awaitResponse).toBe(false);
      expect(event.timeout).toBe(30);
      expect(event.maxAttempts).toBe(5);
      expect(event.retryDelay).toBe(1);
      expect(event.log).toBe(true);
      expect(event.priority).toBe("normal");
      expect(event.status).toBe("pending");
    });

    it("publishes event with custom options", async () => {
      const res = await request(app.getHttpServer())
        .post("/events")
        .set(headers)
        .send({
          pattern: "email.validate",
          payload: { email: "test@example.com" },
          source: "auth-server",
          broadcast: false,
          awaitResponse: true,
          timeout: 10,
          maxAttempts: 3,
          retryDelay: 2,
          log: false,
          priority: "high",
          delay: 5,
        });

      const event = await eventRepo.findOne({ where: { id: res.body.eventId } });
      expect(event.broadcast).toBe(false);
      expect(event.awaitResponse).toBe(true);
      expect(event.timeout).toBe(10);
      expect(event.maxAttempts).toBe(3);
      expect(event.retryDelay).toBe(2);
      expect(event.log).toBe(false);
      expect(event.priority).toBe("high");
      expect(event.delay).toBe(5);
    });

    it("calculates expiresAt from ttl", async () => {
      const res = await request(app.getHttpServer())
        .post("/events")
        .set(headers)
        .send({
          pattern: "test.ttl",
          payload: {},
          source: "test",
          ttl: 7,
        });

      const event = await eventRepo.findOne({ where: { id: res.body.eventId } });
      expect(event.expiresAt).toBeDefined();
      const diffMs = event.expiresAt.getTime() - event.createdAt.getTime();
      const days = diffMs / (24 * 60 * 60 * 1000);
      expect(Math.round(days)).toBe(7);
    });

    it("calculates deliverAfter from delay", async () => {
      const res = await request(app.getHttpServer())
        .post("/events")
        .set(headers)
        .send({
          pattern: "test.delay",
          payload: {},
          source: "test",
          delay: 60,
        });

      const event = await eventRepo.findOne({ where: { id: res.body.eventId } });
      expect(event.deliverAfter).toBeDefined();
      const diffMs = event.deliverAfter.getTime() - event.createdAt.getTime();
      const seconds = diffMs / 1000;
      expect(seconds).toBeGreaterThanOrEqual(55);
      expect(seconds).toBeLessThanOrEqual(70);
    });

    it("ttl=0 sets expiresAt to null", async () => {
      const res = await request(app.getHttpServer())
        .post("/events")
        .set(headers)
        .send({
          pattern: "test.noexpiry",
          payload: {},
          source: "test",
          ttl: 0,
        });

      const event = await eventRepo.findOne({ where: { id: res.body.eventId } });
      expect(event.expiresAt).toBeNull();
    });
  });

  describe("POST /events (sync, no subscribers)", () => {
    it("returns delivered with empty deliveries when no subscribers", async () => {
      const res = await request(app.getHttpServer())
        .post("/events")
        .set(headers)
        .send({
          pattern: "no.subscribers.for.this",
          payload: {},
          source: "test",
          awaitResponse: true,
        })
        .expect(200);

      expect(res.body.status).toBe("delivered");
      expect(res.body.deliveries).toEqual([]);
      expect(res.body.message).toBeDefined();
    });
  });

  describe("GET /events", () => {
    beforeAll(async () => {
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer())
          .post("/events")
          .set(headers)
          .send({
            pattern: `list.test.${i}`,
            payload: { index: i },
            source: i === 0 ? "auth-server" : "api-server",
          });
      }
    });

    it("lists events with pagination", async () => {
      const res = await request(app.getHttpServer())
        .get("/events")
        .set(headers)
        .expect(200);

      expect(res.body.total).toBeGreaterThanOrEqual(3);
      expect(res.body.page).toBe(1);
      expect(res.body.data.length).toBeLessThanOrEqual(20);
    });

    it("filters by pattern", async () => {
      const res = await request(app.getHttpServer())
        .get("/events?pattern=list.test.0")
        .set(headers)
        .expect(200);

      expect(res.body.data.every((e: any) => e.pattern.includes("list.test.0"))).toBe(true);
    });

    it("filters by source", async () => {
      const res = await request(app.getHttpServer())
        .get("/events?source=auth-server")
        .set(headers)
        .expect(200);

      expect(res.body.data.every((e: any) => e.source === "auth-server")).toBe(true);
    });
  });

  describe("GET /events/:id", () => {
    it("returns event details with deliveries", async () => {
      const publishRes = await request(app.getHttpServer())
        .post("/events")
        .set(headers)
        .send({
          pattern: "detail.test",
          payload: { foo: "bar" },
          source: "test",
        });

      const res = await request(app.getHttpServer())
        .get(`/events/${publishRes.body.eventId}`)
        .set(headers)
        .expect(200);

      expect(res.body.id).toBe(publishRes.body.eventId);
      expect(res.body.pattern).toBe("detail.test");
      expect(res.body.payload).toEqual({ foo: "bar" });
    });

    it("returns 404 for non-existent event", async () => {
      await request(app.getHttpServer())
        .get("/events/99999")
        .set(headers)
        .expect(404);
    });
  });
});
