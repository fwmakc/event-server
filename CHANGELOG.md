# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
