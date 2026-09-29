# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0] - 2026-09-29
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
