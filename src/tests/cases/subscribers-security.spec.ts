import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { createTestApp } from "../app.testingModule";

const headers = { "X-Internal-Api-Key": "test-api-key" };

describe("Subscribers — webhook secrets (default egress mode)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    delete process.env.WEBHOOK_EGRESS_MODE;
    delete process.env.WEBHOOK_ALLOW_HOSTS;
    app = (await createTestApp()).app;
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /subscribe — no secret by default (legacy transport)", async () => {
    const res = await request(app.getHttpServer())
      .post("/subscribe")
      .set(headers)
      .send({
        service: "legacy-svc",
        url: "http://legacy-svc:3000/webhooks/events",
        patterns: ["user.registered"],
      })
      .expect(201);

    expect(res.body.hasSecret).toBe(false);
    expect("secret" in res.body).toBe(false);
  });

  it("POST /subscribe — generateSecret: true generates and returns it once", async () => {
    const res = await request(app.getHttpServer())
      .post("/subscribe")
      .set(headers)
      .send({
        service: "secure-svc",
        url: "http://secure-svc:3000/webhooks/events",
        patterns: ["user.registered"],
        generateSecret: true,
      })
      .expect(201);

    expect(res.body.hasSecret).toBe(true);
    expect(typeof res.body.secret).toBe("string");
    expect(res.body.secret).toMatch(/^[0-9a-f]{64}$/);
  });

  it("GET /subscribers — never returns secrets", async () => {
    const res = await request(app.getHttpServer())
      .get("/subscribers")
      .set(headers)
      .expect(200);

    expect(res.body.total).toBeGreaterThan(0);
    for (const sub of res.body.data) {
      expect("secret" in sub).toBe(false);
      expect(typeof sub.hasSecret).toBe("boolean");
    }
  });

  it("POST /subscribe — short caller secret rejected (min 32)", async () => {
    await request(app.getHttpServer())
      .post("/subscribe")
      .set(headers)
      .send({
        service: "short-secret-svc",
        url: "http://short-secret-svc:3000/webhooks/events",
        patterns: ["user.registered"],
        secret: "too-short",
      })
      .expect(400);
  });

  it("POST /subscribe — caller-provided secret wins on merge", async () => {
    const secret = "a".repeat(64);
    const res = await request(app.getHttpServer())
      .post("/subscribe")
      .set(headers)
      .send({
        service: "merge-secret-svc",
        url: "http://merge-secret-svc:3000/webhooks/events",
        patterns: ["user.registered"],
        secret,
      })
      .expect(201);

    expect(res.body.secret).toBe(secret);

    // Same service+url again: patterns merge, secret can be rotated via create.
    const res2 = await request(app.getHttpServer())
      .post("/subscribe")
      .set(headers)
      .send({
        service: "merge-secret-svc",
        url: "http://merge-secret-svc:3000/webhooks/events",
        patterns: ["user.confirmed"],
        secret: "b".repeat(64),
      })
      .expect(201);

    expect(res2.body.secret).toBe("b".repeat(64));
    expect(res2.body.patterns).toEqual(
      expect.arrayContaining(["user.registered", "user.confirmed"]),
    );
  });

  it("POST /subscribe/:id/rotate — returns a fresh secret exactly once", async () => {
    const created = await request(app.getHttpServer())
      .post("/subscribe")
      .set(headers)
      .send({
        service: "rotate-svc",
        url: "http://rotate-svc:3000/webhooks/events",
        patterns: ["password.reset"],
      })
      .expect(201);
    const original = created.body.secret;

    const res = await request(app.getHttpServer())
      .post(`/subscribe/${created.body.id}/rotate`)
      .set(headers)
      .expect(201);

    expect(res.body.id).toBe(created.body.id);
    expect(res.body.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.secret).not.toBe(original);

    const list = await request(app.getHttpServer())
      .get("/subscribers")
      .set(headers)
      .expect(200);
    const rotated = list.body.data.find((s) => s.id === created.body.id);
    expect(rotated.hasSecret).toBe(true);
    expect("secret" in rotated).toBe(false);
  });

  it("POST /subscribe/:id/rotate — 404 for non-existent", async () => {
    await request(app.getHttpServer())
      .post("/subscribe/99999/rotate")
      .set(headers)
      .expect(404);
  });
});

describe("Subscribers — egress policy: public", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.WEBHOOK_EGRESS_MODE = "public";
    app = (await createTestApp()).app;
  });

  afterAll(async () => {
    delete process.env.WEBHOOK_EGRESS_MODE;
    await app.close();
  });

  it("rejects docker-internal hostname", async () => {
    const res = await request(app.getHttpServer())
      .post("/subscribe")
      .set(headers)
      .send({
        service: "evil-svc",
        url: "http://message-server:3003/webhooks/events",
        patterns: ["user.registered"],
      })
      .expect(400);
    expect(res.body.message).toContain("egress policy (public)");
  });

  it("rejects loopback IP literal", async () => {
    await request(app.getHttpServer())
      .post("/subscribe")
      .set(headers)
      .send({
        service: "evil-loopback",
        url: "http://127.0.0.1:3005/webhooks/events",
        patterns: ["user.registered"],
      })
      .expect(400);
  });

  it("rejects non-http scheme", async () => {
    await request(app.getHttpServer())
      .post("/subscribe")
      .set(headers)
      .send({
        service: "evil-file",
        url: "file:///etc/passwd",
        patterns: ["user.registered"],
      })
      .expect(400);
  });

  it("accepts a public hostname", async () => {
    await request(app.getHttpServer())
      .post("/subscribe")
      .set(headers)
      .send({
        service: "external-svc",
        url: "https://hooks.example.com/events",
        patterns: ["user.registered"],
      })
      .expect(201);
  });
});

describe("Subscribers — egress policy: allowlist", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.WEBHOOK_EGRESS_MODE = "allowlist";
    process.env.WEBHOOK_ALLOW_HOSTS = "message-server, chat-server";
    app = (await createTestApp()).app;
  });

  afterAll(async () => {
    delete process.env.WEBHOOK_EGRESS_MODE;
    delete process.env.WEBHOOK_ALLOW_HOSTS;
    await app.close();
  });

  it("accepts an allowlisted internal hostname", async () => {
    await request(app.getHttpServer())
      .post("/subscribe")
      .set(headers)
      .send({
        service: "message-server",
        url: "http://message-server:3003/webhooks/events",
        patterns: ["user.registered"],
      })
      .expect(201);
  });

  it("rejects a non-allowlisted hostname", async () => {
    await request(app.getHttpServer())
      .post("/subscribe")
      .set(headers)
      .send({
        service: "rogue-svc",
        url: "http://rogue-svc:3000/webhooks/events",
        patterns: ["user.registered"],
      })
      .expect(400);
  });
});
