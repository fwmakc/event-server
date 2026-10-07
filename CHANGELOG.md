# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.0] - 2026-10-07
### Added
- **`user.roles_changed` contract (`UserRolesChangedDto`)** — emitted by
  auth-server on every role mutation (`assign`, `removeByAccount`).
  Required: userId, username, email, roles (string[] — the full role-name
  set after the change; empty = all revoked). Consumers use it for
  cross-replica auth-client cache invalidation (role revocation takes
  effect immediately instead of after the 30s cache TTL). Registered in
  `EventContracts`, shipped in `dist/contracts/`.

## [1.2.0] - 2026-10-03
### Added
- **`user.login` contract (`UserLoginDto`)** — emitted by auth-server on every
  successful password login (not on a 2FA challenge). Required: userId,
  username; optional: email, ip, userAgent, os, browser. Registered in
  `EventContracts`, shipped in `dist/contracts/`.

## [0.10.0] - 2026-10-06
### Added
- **Audit retention CLI (`src/scripts/audit-retention.ts`)** — manual
  export/purge primitives for the append-only store, cron-wirable (the
  schedule stays outside the service). Three modes: export+purge (default,
  safe order enforced — export → archive re-verify → purge), `--export-only`,
  `--purge-only` (requires `--force`: destroying unarchived records must be
  explicit). Ranges by `--before <date>` and/or `--to-id <id>`; deletes run
  in batches to keep transactions short. Exports stream NDJSON (one row per
  line, chain fields included) through sha256 into a gzip archive plus a
  `.meta.json` sidecar carrying the chain boundary (`lastId`/`lastHash` —
  the seed for post-purge verification) and the uncompressed digest. Runs
  under a `pg_try_advisory_lock` — overlapping cron invocations are rejected
  with exit code 1. A purge appends `audit.purged` through the normal
  chained path, documenting the truncation in the journal itself. Exit
  codes: 0 ok, 1 misuse/lock, 2 archive verification failure (purge
  aborted), 3 unexpected.
- **`GET /audit/verify?baseHash=`** — seeds the expected prev-hash when the
  boundary row is gone (post-purge chain-base verification from the export
  meta). Validated as 64-hex (400 otherwise); a real row at/below the range
  always wins over the supplied base.
- `verify(fromId)` contract made self-consistent: an existing boundary row
  is trusted and its own hash seeds the walk (before, the seed was taken
  from the row below, which only ever matched when the boundary id was
  absent).

### Fixed
- **No-subscriber TTL age is measured with the DB clock, not the app clock.**
  The worker compared `Date.now()` (app) against `created_at` (written by the
  database) — any app/database clock skew (docker VM drift, multi-node drift)
  inflated the apparent age. With a short `EVENT_NO_SUBSCRIBER_TTL_MS` a fresh
  event could finalize on its very first claim, skipping the re-pend window
  entirely (surfaced as a flaky `worker.no-subscriber-ttl.spec.ts` under a
  ~1.5-2s host/VM drift on Windows/Docker Desktop). The claim query now selects
  `now() - created_at` from the database and the TTL decision uses that value —
  age semantics live in one clock domain.
- **TTL finalization tells the truth; orphaned claims re-pend (Wave 6.1).**
  Two follow-ups on the bounded re-pend fix above:
  - A pattern with subscribers that are **all inactive** (circuit breaker
    after 5 permanent failures) is delivery debt, not noise: past the TTL the
    event now finalizes `failed` with a warn — visible in the ledger and
    replayable after reactivation — instead of a silent `delivered` with zero
    deliveries. A pattern nobody has ever subscribed to still finalizes
    `delivered` quietly (fire-and-forget by definition, no failed noise for
    `audit.event`).
  - A crash between the event claim (`status=processing`) and the
    delivery-creation pass left a `processing` event with zero delivery rows,
    which `resolveEvents` counted as fully delivered
    (`[].every(d => d.delivered)` on an empty array). Such orphans are now
    re-pended (`EVENT_NO_SUBSCRIBER_RETRY_MS`) instead.
- **No-subscriber events now leave the queue (High — queue starvation).**
  An event whose pattern has no active subscriber (`audit.event` fires on
  every request) was re-pended forever (+60s each cycle — the late-subscriber
  race protection). Past a few thousand dead rows the oldest-50 claim query
  saturated the worker and fresh events with live subscribers
  (`user.registered` → mail) starved: deliveries silently stopped. The
  re-pend protection is now bounded: after `EVENT_NO_SUBSCRIBER_TTL_MS`
  (default 300000) the event is finalized `delivered` without deliveries and
  leaves the pending pool. `EVENT_NO_SUBSCRIBER_RETRY_MS` (default 60000)
  controls the re-pend delay within the window.
- `tsconfig.build.json`: `rootDir: src` + exclude `scripts` — без него `allowJs` втягивал `scripts/wiring.ts`/`audit-gate.mjs` в компиляцию, и Docker-образ эмитил `dist/src/main.js` (нестартуемо через `CMD dist/main`); тот же режим отказа, что починен в api-server.

### Tests
- `worker.no-subscriber-ttl.spec.ts` (own app instance — the TTL is read at
  boot): a fresh no-subscriber event re-pends (the late-subscriber protection
  stays on), then finalizes after the TTL; a batch of 10 dead events drains
  to zero pending. 64/64 green under the canonical `jest --runInBand`.
- `scripts/wiring.ts`: кредиты БД переопределяются через env (`DB_PASSWORD`), дефолт не изменился.

### Changed
- `POST /events/:id/replay` on a `failed` event with **zero delivery rows**
  (the TTL-debt case) requeues the event itself and reports
  `{replayed: 0, eventRequeued: true}` — previously such events were
  unreplayable (`result.affected === 0`). A `failed` event that still has a
  delivery ledger stays a no-op: its deliveries own their retries, and
  re-running delivery creation would duplicate rows.

### Tests
- `worker.no-subscriber-ttl.spec.ts` +2 (Wave 6.1): circuit-broken subscriber —
  the event finalizes `failed` with zero deliveries, replay while inactive
  requeues it (`eventRequeued`), reactivation → real delivery lands; an
  orphaned `processing` event with zero delivery rows is re-pended instead of
  being counted delivered. 66/66 green under the canonical `jest --runInBand`.
- **Wiring check for a real boot** (`scripts/wiring.ts`, `npm run test:wiring`): boots the real `AppModule` in an application context against a fresh `event_server_wiring_test` database (drop/create + real boot migrations — catches entity↔migrations drift), then live probes on real Postgres: subscriber registration with HMAC secret generation, `publish → delivery` (a delivery row actually lands for a registered subscriber), audit hash-chain append (the second entry's `prevHash` equals the first entry's `hash`). 6/6 checks, exit code for CI. Runs via ts-node (this service has no `typeorm-transactional` — no bootstrap call needed, unlike auth/api).
- CI: new `wiring` job with a TZ matrix (UTC + Europe/Moscow).

## [0.9.0] - 2026-10-01
### Security (Wave 6 audit)
- **Deliveries no longer follow redirects blindly**: `httpPost` is called with `redirect: "manual"`; every hop is re-validated against the same egress policy as subscription time (`WEBHOOK_EGRESS_MODE`/`WEBHOOK_ALLOW_HOSTS`) — an open redirect on a subscriber must not become an SSRF bridge into the internal network. Only 307/308 are followed (they preserve POST method+body, up to 3 hops); 301/302/303 fail the delivery permanently with a clear response body, and a policy-rejected target is a permanent failure counted by the circuit breaker.
- **`/contracts/catalog` requires the internal API key** — the contract registry was the only unguarded event-server endpoint (gateway exposure would leak the full event schema inventory).
- **Contract lookup uses own-property check** — `EventContracts[pattern]` walked the prototype chain, so a pattern like `constructor` resolved to a bogus "schema" and skipped payload validation on non-strict configs. Only real registry keys validate now.
- **Audit chain `verify(fromId)` works on sparse ranges** — the seed looked up `fromId - 1` exactly, so `verify(1)` always failed («no record before id 1») and any TTL-trimmed history broke mid-range verification. The seed is now the greatest id below `fromId` (genesis when none), and a truncated chain fails loudly as a broken link instead of refusing to verify.

### Changed
- **Zero-delivery events are no longer finalized as "delivered"**: with no active subscriber the event is re-pended with `deliverAfter` pushed out by `EVENT_NO_SUBSCRIBER_RETRY_MS` (default 60s) — nothing was delivered, and the old mark-as-delivered also lost the race where a subscriber registers (or the circuit breaker reactivates) moments later. If the pattern never gains a subscriber, TTL cleanup deletes the event as usual. Worker spec updated to the new semantics.

### Tests
- 62 integration tests green (real Postgres); worker spec asserts the re-pend (status stays `pending`, `deliverAfter` in the future, zero delivery rows).

## [0.8.4] - 2026-10-01
### Added
- **Signed webhook delivery (HMAC-SHA256)**: subscribers can provision a
  per-subscriber secret — pass `secret` (min 32 chars) at `POST /subscribe`
  (both sides know it), or set `generateSecret: true` to have one generated
  and returned exactly once in the create response; rotate via
  `POST /subscribe/:id/rotate`. Deliveries to subscribers with a secret
  carry `X-Event-Signature: sha256=<hmac>` + `X-Event-Timestamp` (signed
  `<ts>.<rawBody>`, 300s replay window; verify with toolkit
  `EventDeliveryGuard` + `WEBHOOK_SECRET`) instead of the shared internal
  key. Subscribers without a secret keep the legacy internal-key transport
  (no silent auto-generation — the registrant must know the secret).
  Secrets are never returned by list/read — only `hasSecret: boolean`.
- **Egress policy for subscriber URLs (anti-SSRF)**: `WEBHOOK_EGRESS_MODE`
  = `internal` (default, any host — trusted docker network) | `public`
  (private/loopback/link-local/metadata/CGNAT/TEST-NET/multicast blocked,
  v4 + v6) | `allowlist` (+ `WEBHOOK_ALLOW_HOSTS`). Violations rejected
  with 400 at create/update.
- Migration `AddSubscriberSecret` (nullable `subscribers.secret` — legacy
  subscribers keep the shared-key transport until a secret is provisioned).
### Changed
- Toolkit pinned `#v0.24.0`: `webhook-signature.helper` (sign/verify/egress)
  + `EventDeliveryGuard`.

## [0.8.3] - 2026-09-30
### Changed (dependency)
- `api-server-toolkit` v0.23.0: boot migrations now run through
  `runMigrationsUnderLock()` (pg advisory xact lock) in `dataSourceFactory` —
  simultaneously booting replicas serialize instead of racing `InitialSchema`
  on a cold database (TypeORM 0.3.x has no built-in migration locking).
### Fixed
- **Every `audit.event` publish 500'd**: `AuditEventEntity` was never
  registered in the DataSource (`entities: [...]` listed only the bus
  entities; `forFeature` alone does not add metadata), so the audit store
  threw `EntityMetadataNotFoundError` on every append — the whole audit
  chain was silently dead in deployed stacks. Registered in both `forRoot`
  and `forFeature`.

## [0.8.2] - 2026-09-30
### Changed
- Toolkit pinned `#v0.22.0` (self-pentest wave 4): Access-бины fail-closed (rule.filter компилируется, scope-all — явный bind), delete-гварды покрывают tenant-бинды, scoped `movePosition`, search не расширяет загрузку связей, `getClientIp()`/`TRUST_PROXY`.

## [0.8.1] - 2026-09-30
### Changed
- Pin: toolkit `#v0.21.1` (AuditModule DI fix; event-server itself owns the audit store, so no behavioral change here).

## [0.8.0] - 2026-09-30
### Added
- **Audit log store** — event-server becomes the owner of the security audit trail. New contract `audit.event` (`AuditEventDto`: action, outcome, accountId/username, tenant, ip, user-agent, requestId, target, details) registered in `EventContracts`; `EventsService.publish` routes payloads with this pattern into the append-only `audit_events` table instead of the webhook bus. Storage is tamper-evident via a SHA-256 hash chain (`hash = sha256(prevHash|ts|fields)`, canonical JSON with sorted keys), writes are serialized with a `pg_advisory_xact_lock` so concurrent appends can't fork the chain.
- `AuditModule`: `GET /audit/events` (filters: action prefix, outcome, account, target, time range, pagination) and `GET /audit/verify` (recomputes the chain over a range and reports `brokenAt`), both behind `InternalAuthGuard`.
- Migration `1791000000000-AddAuditEvents` creates the table + indexes; drift-checked (migration:run on a clean DB then migration:generate finds zero diff).
- Toolkit 0.21.0 (`AuditService` / `AuditInterceptor` / `AccessGuard` deny hook) publishes into this store.

## [0.7.3] - 2026-09-30
### Added
- Swagger UI: `main.ts` now calls the toolkit `Swagger.setup(app)` like every other service — it was the only one without it, so its routes (`/events`, `/subscribers`, `/webhooks`) had no OpenAPI document. Activated by `SWAGGER_PREFIX` (verified in-network: `/swagger` 200, `/swagger-json` serves the spec).

## [0.7.2] - 2026-09-29
### Changed
- Toolkit pinned to v0.20.3 (QueueWorker claim: Postgres forbids FOR UPDATE on the nullable side of an outer join — relations are now hydrated by a second lock-free query inside the claim transaction).

## [0.7.1] - 2026-09-29
### Changed
- Toolkit pinned to v0.20.2 (bootstrap binds 0.0.0.0 by default).

## [0.7.0] - 2026-09-29
] - 2026-09-29
### Fixed
- The GIN index on subscribers.patterns is now declared in the entity (synchronize: false) so entities have no drift against the migration chain.
- src/config/typeorm.config.ts no longer self-initializes the DataSource on import — it raced with the CLI initialization and made migration commands flaky.
### Changed
- Database schema is now owned exclusively by TypeORM migrations. DB_SYNCHRONIZE is removed: pending migrations are applied on every boot (hardcoded migrationsRun: true), so the first boot on an empty database initializes the schema.

## [0.6.0] - 2026-09-28

- Access logging added (`Morgan.setup`); JSON logs + request id via toolkit v0.20.0 (`LOG_FORMAT=json`, compose sets it in production).

### Added
- `POST /events/:id/replay` — requeue every failed delivery of an event; `POST /deliveries/:id/replay` — requeue one terminal delivery (400 on pending/processing). Events are reopened as `processing` and re-resolved by the worker.
- Circuit breaker now publishes a `subscriber.deactivated` event through the bus (payload: subscriberId, service, url, failures, deactivatedAt; high priority, TTL 30d) and logs at `error` level — subscribe to the pattern to alert an operator (e.g. email via message-server).
- Contract `SubscriberDeactivatedDto` registered in `EventContracts` and the `GET /contracts/catalog`.
- Prometheus `/metrics` endpoint via toolkit `MetricsModule` v0.19.0 (`http_requests_total`, `http_request_duration_seconds`, Node.js defaults; internal networks only).
- 8 tests: replay endpoints (requeue, 404/400 paths, worker redelivery) + circuit-breaker deactivation alert.

## [0.5.2] - 2026-09-28
### Changed
- Node.js runtime bumped 22 → 24 LTS: Docker images `node:24-alpine`, CI `node-version: 24`.
- Toolkit pinned to `api-server-toolkit#v0.18.0` (adds `ApiKeyGuard` / `@ApiKey()`; no behavior change for existing routes).

## [0.5.0] - 2026-08-03

Version reset to pre-release. The event server is functional (33 tests, HTTP webhook bus, circuit breaker, subscriber management) but the overall stack is not yet production-hardened. Pinned to `api-server-toolkit#v0.9.0`.

## [2.0.0] - 2026-08-03

### Changed
- Stack v2 alignment — major version aligned with api-server-toolkit v2.x
- Pinned to `api-server-toolkit#v2.1.0`

## [1.0.0] - 2026-08-02

### Core
- Webhook-based publish/subscribe event broker (replaces Redis Streams)
- `POST /events` — publish event with `{ pattern, payload, source }`
- `POST /subscribe` — register webhook URL + event patterns
- Background delivery worker with parallel execution
- `SELECT FOR UPDATE SKIP LOCKED` — safe horizontal scaling (multiple workers, no double-delivery)
- Adaptive polling — back off when idle (2s → 10s), resume instantly on new work
- Circuit breaker — auto-deactivate subscriber after 5 permanent failures

### Contracts
- Event contracts with typed DTOs + validation:
  - `user.registered` (UserRegisteredDto)
  - `user.confirmed` (UserConfirmedDto)
  - `password.reset` (PasswordResetDto)
  - `user.deactivated` (UserDeactivatedDto)
  - `user.deleted` (UserDeletedDto)
- Schema registry + `GET /contracts/catalog` endpoint
- Pre-built `dist/contracts/` committed for cross-service imports
- `npm run build:contracts` for standalone contract compilation

### Infrastructure
- `bootstrap()` + `HealthModule` from api-server-toolkit v2.1.0
- `InternalAuthGuard` from toolkit (no passport dependency)
- `httpPost` from toolkit (native fetch, replaces axios)
- Sentry error tracking
- Swagger UI + ReDoc documentation
- Multi-stage Dockerfile (node:22-alpine, USER node, HEALTHCHECK)
- TypeORM migrations: InitialSchema (events, subscribers, deliveries)
- `DB_MIGRATIONS_RUN=true` in docker-compose

### Tests
- 5 suites, 33 tests (events CRUD, subscriber CRUD, delivery worker retry/backoff, auth guard, health)
- Real PostgreSQL with `dropSchema: true` for clean state

### Versioning
- Pinned to `api-server-toolkit#v2.1.0`
- This tag (`v1.0.0`) is referenced by consumers: `auth-server`, `message-server`
