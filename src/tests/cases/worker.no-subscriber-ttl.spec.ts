import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { Repository } from "typeorm";
import { getRepositoryToken } from "@nestjs/typeorm";
import { EventEntity } from "@src/database/entities";
import { createTestApp } from "../app.testingModule";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const waitForCondition = async (
  fn: () => Promise<boolean>,
  timeoutMs = 8000,
  intervalMs = 100,
): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return true;
    await sleep(intervalMs);
  }
  return false;
};

/**
 * Bounded no-subscriber re-pend (Wave 6 / Stage 4 fix). A pattern nobody
 * subscribes to (audit.event fires on every request) used to re-pend forever;
 * past a few thousand dead rows the claim query drowned and fresh events with
 * live subscribers stopped being delivered at all. Now: re-pend protects the
 * late-subscriber race only within EVENT_NO_SUBSCRIBER_TTL_MS, then the event
 * is finalized without deliveries and leaves the pool.
 *
 * Own app instance: the TTL is read at boot, so it cannot share the worker
 * spec's module (which tests the fresh-event re-pend path).
 */
describe("Worker — no-subscriber events leave the queue after the TTL", () => {
  let app: INestApplication;
  let eventRepo: Repository<EventEntity>;
  const apiKey = "test-api-key";
  const headers = { "X-Internal-Api-Key": apiKey };

  beforeAll(async () => {
    process.env.WORKER_INTERVAL_MS = "100";
    process.env.EVENT_NO_SUBSCRIBER_TTL_MS = "1500";
    // short re-pend delay: the finalized event is only seen by the worker
    // after the previous re-pend's deliverAfter expires (claim filter)
    process.env.EVENT_NO_SUBSCRIBER_RETRY_MS = "300";

    const result = await createTestApp();
    app = result.app;
    eventRepo = result.moduleRef.get(getRepositoryToken(EventEntity));
  });

  afterAll(async () => {
    await app.close();
  });

  it("fresh no-subscriber event re-pends, then finalizes after the TTL", async () => {
    const publishRes = await request(app.getHttpServer())
      .post("/events")
      .set(headers)
      .send({
        pattern: "nobody.ever",
        payload: { tick: 1 },
        source: "test",
        awaitResponse: false,
      });
    // publish is always @HttpCode(OK) — async events are not 201
    expect(publishRes.status).toBe(200);
    const id = publishRes.body.eventId;
    expect(id).toBeDefined();

    // fresh: re-pended by the first worker cycle (late-subscriber race
    // protection stays on) — wait for the cycle rather than racing it
    const repended = await waitForCondition(async () => {
      const e = await eventRepo.findOne({ where: { id } });
      return e.status === "pending" && e.deliverAfter !== null;
    });
    expect(repended).toBe(true);

    // after the TTL: finalized, out of the pending pool
    const finalized = await waitForCondition(async () => {
      const e = await eventRepo.findOne({ where: { id } });
      return e.status === "delivered";
    });
    expect(finalized).toBe(true);

    const e = await eventRepo.findOne({ where: { id } });
    expect(e.status).toBe("delivered");
  }, 15000);

  it("queue sheds a batch of dead events instead of accumulating them", async () => {
    const publish = (tick: number) =>
      request(app.getHttpServer())
        .post("/events")
        .set(headers)
        .send({
          pattern: "nobody.bulk",
          payload: { tick },
          source: "test",
          awaitResponse: false,
        });

    await Promise.all(Array.from({ length: 10 }, (_, i) => publish(i)));

    const drained = await waitForCondition(async () => {
      const pending = await eventRepo.count({
        where: { pattern: "nobody.bulk", status: "pending" },
      });
      return pending === 0;
    });
    expect(drained).toBe(true);
  }, 15000);
});
