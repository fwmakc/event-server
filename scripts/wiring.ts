/**
 * Wiring check (Wave 6, stage 2): boots the REAL AppModule (real entities,
 * boot migrations through runMigrationsUnderLock, real DI graph) against a
 * fresh throwaway database, then probes one real write per critical
 * subsystem: subscribers (with HMAC secret), the publish pipeline (event +
 * delivery rows), and the tamper-evident audit chain. Runs under ts-node —
 * the production module system — because jest's module registry races with
 * pg's lazy native getter here.
 *
 * Usage: npm run test:wiring   (requires postgres on 127.0.0.1:5432 root/1234)
 * Exit code 0 = all probes green.
 */
process.env.DB_TYPE = "postgres";
process.env.DB_HOST = "127.0.0.1";
process.env.DB_PORT = "5432";
process.env.DB_USER = "root";
process.env.DB_PASSWORD = "1234";
process.env.DB_NAME = "event_server_wiring_test";
process.env.INTERNAL_API_KEY = "wiring-internal-key";

import { Client } from "pg";
import { DataSource } from "typeorm";

const WIRING_DB = "event_server_wiring_test";

let passed = 0;
let failed = 0;

function ok(label: string, cond: boolean, extra?: string): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}${extra ? ` — ${extra}` : ""}`);
  }
}

async function recreateDatabase(): Promise<void> {
  const client = new Client({
    host: "127.0.0.1",
    port: 5432,
    user: "root",
    password: "1234",
    database: "postgres",
  });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS ${WIRING_DB} WITH (FORCE)`);
  await client.query(`CREATE DATABASE ${WIRING_DB}`);
  await client.end();
}

async function main(): Promise<void> {
  console.log("Wiring check — event-server real boot");
  await recreateDatabase();

  const { AppModule } = await import("../src/app.module");
  const { NestFactory } = await import("@nestjs/core");
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const dataSource = app.get(DataSource);
  console.log("  ✓ AppModule booted (real DI graph, boot migrations ran)");

  const migrations: any[] = await dataSource.query(
    "SELECT count(*)::int AS n FROM migrations_typeorm",
  );
  ok("boot migrations applied", migrations[0].n > 0, `count=${migrations[0].n}`);

  // ── Probe: subscribers (HMAC secret issuance) ──
  console.log("probe: subscribers");
  const { SubscribersService } = await import(
    "../src/subscribers/subscribers.service"
  );
  const subscribersService = app.get(SubscribersService);
  const subscriber = await subscribersService.create({
    service: "wiring-probe",
    url: "http://127.0.0.1:9/webhook",
    patterns: ["user.registered"],
    generateSecret: true,
  } as any);
  ok("subscriber create issues an HMAC secret (generateSecret: true)",
    typeof subscriber?.secret === "string" && subscriber.secret.length > 0,
    `keys=${Object.keys(subscriber ?? {}).join(",")}`);

  // ── Probe: publish pipeline (event + delivery rows) ──
  console.log("probe: publish pipeline");
  const { EventsService } = await import("../src/events/events.service");
  const eventsService = app.get(EventsService);
  const result = await eventsService.publish({
    pattern: "user.registered",
    payload: { userId: 1, username: "wiring@test", email: "wiring@test" },
    source: "wiring",
  } as any);
  ok("publish() accepted the event", !!result);

  // The delivery worker runs on an interval; give it a bounded window to
  // attempt the webhook (which refuses instantly on port 9).
  await new Promise((r) => setTimeout(r, 2500));
  const deliveries: any[] = await dataSource.query(
    "SELECT count(*)::int AS n FROM deliveries WHERE subscriber_id = $1",
    [subscriber.id],
  );
  ok("delivery row created for the subscriber", deliveries[0].n > 0,
    `count=${deliveries[0].n}`);

  // ── Probe: tamper-evident audit chain ──
  console.log("probe: audit chain");
  const { AuditStoreService } = await import("../src/audit/audit-store.service");
  const auditStore = app.get(AuditStoreService);
  const first = await auditStore.append({ action: "wiring.first" } as any);
  ok("audit append writes genesis-chained row", !!first?.id && !!first?.hash);
  const second = await auditStore.append({
    action: "wiring.second",
    outcome: "allow",
    accountId: 1,
  } as any);
  ok("second row chains to the previous hash",
    !!second?.id && second.prevHash === first.hash,
    `prev=${second?.prevHash} first=${first?.hash}`);

  await app.close();

  console.log(`\nWiring: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Wiring check crashed:", e);
  process.exit(1);
});
