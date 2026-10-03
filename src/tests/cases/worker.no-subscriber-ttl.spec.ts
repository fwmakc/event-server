import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { Repository } from "typeorm";
import { getRepositoryToken } from "@nestjs/typeorm";
import { EventEntity, DeliveryEntity, SubscriberEntity } from "@src/database/entities";
import { createTestApp } from "../app.testingModule";

const mockFetch = jest.fn() as jest.Mock;
global.fetch = mockFetch as unknown as typeof global.fetch;

function mockResponse(status: number, data: unknown) {
  const body = typeof data === "string" ? data : JSON.stringify(data);
  return {
    status,
    ok: status >= 200 && status < 300,
    text: () => Promise.resolve(body),
  };
}

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
  let deliveryRepo: Repository<DeliveryEntity>;
  let subscriberRepo: Repository<SubscriberEntity>;
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
    deliveryRepo = result.moduleRef.get(getRepositoryToken(DeliveryEntity));
    subscriberRepo = result.moduleRef.get(getRepositoryToken(SubscriberEntity));
    // the reactivated-delivery leg must succeed against the mocked endpoint
    mockFetch.mockResolvedValue(mockResponse(200, { ok: true }));
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

  it("circuit-broken subscriber: TTL finalizes as failed, replay requeues after reactivation", async () => {
    // a subscriber EXISTS for the pattern but is inactive (circuit breaker
    // after 5 permanent failures) — that is delivery debt, not noise
    await subscriberRepo.save({
      service: "ttl-debt-service",
      url: "http://ttl-debt:9999/webhook",
      patterns: ["nobody.debt"],
      active: false,
    } as Partial<SubscriberEntity>);

    const publishRes = await request(app.getHttpServer())
      .post("/events")
      .set(headers)
      .send({
        pattern: "nobody.debt",
        payload: { tick: 1 },
        source: "test",
        awaitResponse: false,
      });
    expect(publishRes.status).toBe(200);
    const id = publishRes.body.eventId;

    // past the TTL: failed (the debt ledger), not a lying delivered
    const failedOut = await waitForCondition(async () => {
      const e = await eventRepo.findOne({ where: { id } });
      return e.status === "failed";
    });
    expect(failedOut).toBe(true);
    expect(await deliveryRepo.count({ where: { eventId: id } })).toBe(0);

    // replay while the subscriber is still inactive: event goes back to
    // pending (no delivery rows to requeue), the worker re-runs it, finds
    // zero active subscribers and re-pends — the debt is back in the pool
    const replayRes = await request(app.getHttpServer())
      .post(`/events/${id}/replay`)
      .set(headers);
    expect(replayRes.status).toBe(200);
    expect(replayRes.body.eventRequeued).toBe(true);
    expect(replayRes.body.replayed).toBe(0);

    // reactivation → the requeued event delivers for real
    await subscriberRepo.update({ service: "ttl-debt-service" }, { active: true });
    const deliveredOut = await waitForCondition(async () => {
      const e = await eventRepo.findOne({ where: { id } });
      return e.status === "delivered";
    });
    expect(deliveredOut).toBe(true);
    const deliveries = await deliveryRepo.find({ where: { eventId: id } });
    expect(deliveries.length).toBe(1);
    expect(deliveries[0].status).toBe("delivered");
  }, 20000);

  it("processing event that lost its delivery-creation pass is re-pended, not marked delivered", async () => {
    // the crash window: claimed (processing) but zero delivery rows —
    // [].every(delivered) must not call it delivered
    await eventRepo.save({
      pattern: "nobody.orphan",
      payload: { tick: 1 },
      source: "test",
      status: "processing",
    } as Partial<EventEntity>);

    // a work cycle must run for resolveEvents to fire (it only runs when
    // the cycle found work) — publish one normal event to guarantee that
    await request(app.getHttpServer())
      .post("/events")
      .set(headers)
      .send({
        pattern: "nobody.orphan-waker",
        payload: { tick: 1 },
        source: "test",
        awaitResponse: false,
      });

    const repended = await waitForCondition(async () => {
      const orphans = await eventRepo.find({ where: { pattern: "nobody.orphan" } });
      return orphans.some((e) => e.status === "pending");
    });
    expect(repended).toBe(true);
  }, 15000);
});
