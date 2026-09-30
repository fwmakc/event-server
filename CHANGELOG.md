# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
