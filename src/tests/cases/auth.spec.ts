import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { createTestApp } from "../app.testingModule";

describe("InternalAuthGuard", () => {
  let app: INestApplication;
  let moduleRef: Awaited<ReturnType<typeof createTestApp>>["moduleRef"];

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    moduleRef = result.moduleRef;
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health — open, no key needed", async () => {
    await request(app.getHttpServer())
      .get("/health")
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe("ok");
      });
  });

  it("POST /events without X-Internal-Api-Key — 401", async () => {
    await request(app.getHttpServer())
      .post("/events")
      .send({ pattern: "test.event", payload: {}, source: "test" })
      .expect(401);
  });

  it("POST /events with wrong key — 401", async () => {
    await request(app.getHttpServer())
      .post("/events")
      .set("X-Internal-Api-Key", "wrong-key")
      .send({ pattern: "test.event", payload: {}, source: "test" })
      .expect(401);
  });

  it("POST /events with correct key — passes guard", async () => {
    await request(app.getHttpServer())
      .post("/events")
      .set("X-Internal-Api-Key", "test-api-key")
      .send({ pattern: "test.event", payload: { hello: "world" }, source: "test" })
      .expect((res) => {
        expect(res.status).toBeLessThan(400);
      });
  });

  it("POST /subscribe without key — 401", async () => {
    await request(app.getHttpServer())
      .post("/subscribe")
      .send({ service: "test", url: "http://localhost:9999/webhook", patterns: ["test"] })
      .expect(401);
  });

  it("GET /events without key — 401", async () => {
    await request(app.getHttpServer())
      .get("/events")
      .expect(401);
  });
});
