import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AuditEventEntity, EventEntity } from "@src/database/entities";
import { createTestApp } from "../app.testingModule";

describe("Audit — append-only hash-chained store", () => {
  let app: INestApplication;
  let moduleRef: any;
  let auditRepo: Repository<AuditEventEntity>;
  let eventRepo: Repository<EventEntity>;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    moduleRef = result.moduleRef;
    auditRepo = moduleRef.get(getRepositoryToken(AuditEventEntity));
    eventRepo = moduleRef.get(getRepositoryToken(EventEntity));
  });

  afterAll(async () => {
    await app.close();
  });

  const headers = { "X-Internal-Api-Key": "test-api-key" };
  const publish = (payload: object) =>
    request(app.getHttpServer())
      .post("/events")
      .set(headers)
      .send({ pattern: "audit.event", payload, source: "auth-server" });

  it("appends a record and chains the next one to it", async () => {
    const res1 = await publish({ action: "auth.login.success", outcome: "success", accountId: 42 });
    expect(res1.status).toBe(200);

    const first = await auditRepo.findOne({ where: { action: "auth.login.success" } });
    expect(first).toBeDefined();
    expect(first.accountId).not.toBeNull();
    expect(first.prevHash).toBe("0".repeat(64));
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);

    const res2 = await publish({
      action: "access.denied",
      outcome: "deny",
      ip: "10.0.0.1",
      requestId: "req-1",
    });
    expect(res2.status).toBe(200);

    const second = await auditRepo.findOne({ where: { action: "access.denied" } });
    expect(second.prevHash).toBe(first.hash);
  });

  it("stores the event row as well as the audit record", async () => {
    const res = await publish({ action: "auth.password.change", outcome: "success", accountId: 7 });
    const event = await eventRepo.findOne({ where: { id: res.body.eventId } });
    expect(event.pattern).toBe("audit.event");
  });

  it("rejects an invalid audit payload and appends nothing", async () => {
    const before = await auditRepo.count();
    const res = await publish({ outcome: "success" }); // no action
    expect(res.status).toBe(400);
    expect(await auditRepo.count()).toBe(before);
  });

  it("verifies the intact chain", async () => {
    const res = await request(app.getHttpServer())
      .get("/audit/verify")
      .set(headers)
      .expect(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.brokenAt).toBeNull();
    expect(res.body.checked).toBeGreaterThanOrEqual(3);
  });

  it("accepts baseHash when it matches the chain base", async () => {
    const res = await request(app.getHttpServer())
      .get("/audit/verify")
      .query({ baseHash: "0".repeat(64) }) // this table still chains from genesis
      .set(headers)
      .expect(200);
    expect(res.body.valid).toBe(true);
  });

  it("a real row below the range wins over the supplied baseHash", async () => {
    const res = await request(app.getHttpServer())
      .get("/audit/verify")
      .query({ fromId: "2", baseHash: "f".repeat(64) })
      .set(headers)
      .expect(200);
    expect(res.body.valid).toBe(true);
  });

  it("rejects a malformed baseHash", async () => {
    await request(app.getHttpServer())
      .get("/audit/verify")
      .query({ baseHash: "not-hex" })
      .set(headers)
      .expect(400);
  });

  it("filters the query endpoint", async () => {
    const res = await request(app.getHttpServer())
      .get("/audit/events")
      .query({ actionPrefix: "auth.", outcome: "success" })
      .set(headers)
      .expect(200);

    expect(res.body.total).toBeGreaterThanOrEqual(2);
    for (const row of res.body.data) {
      expect(row.action).toMatch(/^auth\./);
      expect(row.outcome).toBe("success");
    }
  });

  it("detects a tampered record", async () => {
    const target = await auditRepo.findOne({ where: { action: "auth.login.success" } });
    await auditRepo.query(`UPDATE audit_events SET action = 'auth.evil' WHERE id = ${target.id}`);

    const res = await request(app.getHttpServer())
      .get("/audit/verify")
      .set(headers)
      .expect(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.brokenAt).toBe(target.id);
  });

  it("detects a removed record (broken link)", async () => {
    // drop the row between the first and the last: the link must not close
    const rows = await auditRepo.find({ order: { id: "ASC" } });
    const middle = rows[Math.floor(rows.length / 2)];
    await auditRepo.query(`DELETE FROM audit_events WHERE id = ${middle.id}`);

    const res = await request(app.getHttpServer())
      .get("/audit/verify")
      .set(headers)
      .expect(200);
    expect(res.body.valid).toBe(false);
  });
});
