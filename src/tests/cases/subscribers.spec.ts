import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { createTestApp } from "../app.testingModule";

describe("Subscribers — CRUD", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
  });

  afterAll(async () => {
    await app.close();
  });

  const apiKey = "test-api-key";
  const headers = { "X-Internal-Api-Key": apiKey };

  it("POST /subscribe — creates subscriber", async () => {
    const res = await request(app.getHttpServer())
      .post("/subscribe")
      .set(headers)
      .send({
        service: "message-server",
        url: "http://message-server:3003/webhook",
        patterns: ["user.registered", "user.confirmed"],
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.service).toBe("message-server");
    expect(res.body.url).toBe("http://message-server:3003/webhook");
    expect(res.body.patterns).toEqual(
      expect.arrayContaining(["user.registered", "user.confirmed"]),
    );
    expect(res.body.active).toBe(true);
  });

  it("POST /subscribe — idempotent (same service+url merges patterns)", async () => {
    await request(app.getHttpServer())
      .post("/subscribe")
      .set(headers)
      .send({
        service: "message-server",
        url: "http://message-server:3003/webhook",
        patterns: ["user.registered"],
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post("/subscribe")
      .set(headers)
      .send({
        service: "message-server",
        url: "http://message-server:3003/webhook",
        patterns: ["password.reset"],
      })
      .expect(201);

    expect(res.body.patterns).toEqual(
      expect.arrayContaining(["user.registered", "password.reset"]),
    );
  });

  it("PATCH /subscribe/:id — updates patterns and active", async () => {
    const created = await request(app.getHttpServer())
      .post("/subscribe")
      .set(headers)
      .send({
        service: "chat-server",
        url: "http://chat-server:3004/webhook",
        patterns: ["chat.message.sent"],
      });

    const res = await request(app.getHttpServer())
      .patch(`/subscribe/${created.body.id}`)
      .set(headers)
      .send({
        patterns: ["chat.message.sent", "user.joined"],
        active: false,
      })
      .expect(200);

    expect(res.body.patterns).toEqual(
      expect.arrayContaining(["chat.message.sent", "user.joined"]),
    );
    expect(res.body.active).toBe(false);
  });

  it("DELETE /subscribe/:id — removes subscriber", async () => {
    const created = await request(app.getHttpServer())
      .post("/subscribe")
      .set(headers)
      .send({
        service: "temp-service",
        url: "http://temp:9999/webhook",
        patterns: ["temp.event"],
      });

    await request(app.getHttpServer())
      .delete(`/subscribe/${created.body.id}`)
      .set(headers)
      .expect(200)
      .expect((res) => {
        expect(res.body.deleted).toBe(true);
      });
  });

  it("GET /subscribers — lists all", async () => {
    const res = await request(app.getHttpServer())
      .get("/subscribers")
      .set(headers)
      .expect(200);

    expect(res.body.total).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("PATCH /subscribe/:id — 404 for non-existent", async () => {
    await request(app.getHttpServer())
      .patch("/subscribe/99999")
      .set(headers)
      .send({ active: false })
      .expect(404);
  });
});
