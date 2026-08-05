# Event Server — Central Event Broker

[![Tests](https://github.com/fwmakc/event-server/actions/workflows/test.yml/badge.svg)](https://github.com/fwmakc/event-server/actions/workflows/test.yml)
[![Version](https://img.shields.io/badge/version-v0.5.1-blue)](https://github.com/fwmakc/event-server/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](https://github.com/fwmakc/event-server/blob/main/LICENSE)

> Reference implementation: event bus pattern — pluggable transport (HTTP now, Kafka/Redis ready), typed contracts, circuit breaker.

## What This Is

A **working scaffold** — not a demo, not a toy. Production-ready event broker
that receives events via HTTP POST and delivers them to subscribers via webhooks.
Includes retry with exponential backoff, circuit breaker (auto-deactivate after
5 failures), and typed event contracts (DTOs with validation).

Part of a [microservices stack](https://github.com/fwmakc/gateway-server) —
any service can publish events; subscribers register webhook URLs and receive
deliveries.

**Thin pipe**: receives events, routes to subscribers via webhooks. No business logic, no payload transformation, no domain knowledge.

```
auth-server ──[POST /events]──> event-server ──[POST /webhook]──> message-server
                                   │
                                   ├── validates payload (if EVENT_STRICT_MODE)
                                   ├── stores events (if log:true)
                                   ├── manages subscriptions
                                   ├── delivers via HTTP with retry + circuit breaker
                                   └── cleans up old data (TTL)
```

---

## Pattern

This service demonstrates the **event bus pattern** in the toolkit stack:

- **Pluggable transport** — `IEventClient` abstraction, `HttpEventClient` now, Kafka/Redis later
- **Typed contracts** — DTOs with validation, shared via `event-server/contracts` subpath
- **Circuit breaker** — auto-deactivate subscriber after 5 permanent failures
- **Thin pipe** — receives events, routes to subscribers, no business logic

Clone this when you need: service-to-service communication without tight coupling.

---

## Event Contracts (Schema Registry)

Event-server owns all event contracts as typed DTOs, exported via the npm subpath `event-server/contracts`. Other services import these for type-safe publishing and consuming.

### Available contracts

| Pattern | DTO | Required fields |
|---------|-----|-----------------|
| `user.registered` | `UserRegisteredDto` | userId, username, email (+ subject?, confirmUrl?) |
| `user.confirmed` | `UserConfirmedDto` | userId, username, email |
| `password.reset` | `PasswordResetDto` | username, email, subject, resetUrl |
| `user.deactivated` | `UserDeactivatedDto` | userId, username, email |
| `user.deleted` | `UserDeletedDto` | userId, username, email |
| *(webhook envelope)* | `WebhookEnvelopeDto` | eventId, pattern, payload, source, timestamp, attempt |

### Importing contracts

```typescript
import { UserRegisteredDto, WebhookEnvelopeDto, EventContracts } from "event-server/contracts";
```

### Payload validation

When `EVENT_STRICT_MODE=true`, incoming events with unknown patterns are rejected with HTTP 400. Registered DTOs provide Swagger documentation and optional validation.

### Contract catalog

```
GET /contracts/catalog
```

Returns all registered event contracts with their DTO field definitions.

### Building contracts

Contracts are pre-compiled and committed to `dist/contracts/`:

```bash
npm run build:contracts   # compiles src/contracts/** → dist/contracts/
```

`tsconfig.contracts.json` compiles only the contracts directory (no NestJS dependencies, just class-validator/class-transformer). The `dist/contracts/` directory is committed despite `/dist/*` being gitignored.

---

## Architecture

```
CORE (stable, shared across projects)
  auth-server/     OAuth2, JWT/JWKS, social login
  api-server-toolkit/  api-server-toolkit (CRUD engine, guards)
  gateway-server/  nginx + docker-compose
  event-server/    this repo (central event broker)

DOMAIN (clone per project)
  api-server/      CRUD entities

OPTIONAL
  file-server/     file upload + resize
  message-server/  email + notifications (subscribes to events)
  chat-server/     WebSocket chat (subscribes to events)
```

### Data flow

```
1. Vue frontend ──> auth-server (REST, JWT)
2. auth-server   ──> event-server (POST /events, INTERNAL_API_KEY)
3. event-server  ──> message-server (POST /webhook, INTERNAL_API_KEY)
4. message-server ──> sends email
```

The frontend never talks to event-server directly. It goes through domain services.

---

## Security model

### Layer 1: Network isolation

event-server is **not exposed in nginx**. Only accessible within Docker network (`http://event-server:3005`). No external request can reach it.

### Layer 2: INTERNAL_API_KEY (inbound)

All endpoints except `GET /health` require `X-Internal-Api-Key` header:

```
auth-server   --[X-Internal-Api-Key]-->  event-server   (POST /events)
message-server --[X-Internal-Api-Key]--> event-server   (POST /subscribe)
```

### Layer 3: INTERNAL_API_KEY (webhook delivery)

When event-server delivers an event to a subscriber, it includes the same header:

```
event-server  --[X-Internal-Api-Key]-->  message-server  (POST /webhook/:pattern)
```

The receiving service verifies this header. Nobody can impersonate event-server.

### Trust circle

```
auth-server ──[key]──> event-server ──[key]──> message-server
     ^                                           ^
     └──── Docker network only, shared key ─────┘
```

---

## Event parameters

### 1. Identification (required)

| Parameter | Type | Description |
|-----------|------|-------------|
| `pattern` | `string` | Event name / routing key (e.g. `"user.registered"`) |
| `payload` | `any` | Event body (what to deliver) |
| `source` | `string` | Who published (e.g. `"auth-server"`) |

### 2. Delivery

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `broadcast` | `boolean` | `true` | `true` = all subscribers (pub/sub). `false` = one subscriber (round-robin queue). |
| `awaitResponse` | `boolean` | `false` | `true` = synchronous (wait for webhook response). `false` = fire-and-forget (returns 202). |
| `timeout` | `number` (sec) | `30` | How long to wait for webhook response before considering it failed. |

### 3. Retry behavior

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `maxAttempts` | `number` | `5` | Maximum delivery attempts on failure. |
| `retryDelay` | `number` (sec) | `1` | Base delay. Exponential backoff: `retryDelay * 2^attempt` (1s, 2s, 4s, 8s, 16s). |

### 4. Storage

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `log` | `boolean` | `true` | Store event in DB for audit/history. |
| `ttl` | `number \| null` (days) | `7` | Log retention. `0` = delete after delivery. `null` = keep forever. |

### 5. Scheduling

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `priority` | `"low" \| "normal" \| "high"` | `"normal"` | Worker processes high-priority events first. |
| `delay` | `number` (sec) | `0` | Delay before delivery. `0` = immediate. |

### Examples

**Critical event (user registration):**
```json
{
  "pattern": "user.registered",
  "payload": { "userId": 123, "email": "user@example.com" },
  "source": "auth-server",
  "broadcast": true,
  "awaitResponse": false,
  "log": true,
  "ttl": 30,
  "maxAttempts": 10,
  "priority": "high"
}
```

**Fire-and-forget (analytics):**
```json
{
  "pattern": "page.viewed",
  "payload": { "path": "/home", "userId": 123 },
  "source": "api-server",
  "broadcast": false,
  "awaitResponse": false,
  "log": false,
  "maxAttempts": 1
}
```

**Synchronous request (need subscriber response):**
```json
{
  "pattern": "email.validate",
  "payload": { "email": "test@example.com" },
  "source": "auth-server",
  "broadcast": false,
  "awaitResponse": true,
  "timeout": 10,
  "maxAttempts": 1
}
```

---

## Subscriber parameters

```typescript
POST /subscribe
{
  service: string       // "message-server" (required)
  url: string           // "http://message-server:3003/webhook" (required)
  patterns: string[]    // ["user.registered", "user.confirmed"] (required)
  active?: boolean      // pause/resume (default: true)
}
```

Subscribers are simple: they declare which patterns to listen to and where to send webhooks. All delivery options (timeout, retry, broadcast) live on the event itself.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/subscribe` | `POST` | Register new subscriber |
| `/subscribe/:id` | `PATCH` | Update patterns, url, active |
| `/subscribe/:id` | `DELETE` | Remove subscriber |
| `/subscribers` | `GET` | List all subscribers |

---

## API reference

All endpoints require `X-Internal-Api-Key` header (except `GET /health`).

### POST /events — Publish event

**Request body:** see [Event parameters](#event-parameters) above. Only `pattern`, `payload`, `source` are required. All others have defaults.

**Response — async (`awaitResponse: false`, default):**
```json
HTTP 202
{
  "eventId": 42,
  "status": "pending"
}
```

**Response — sync (`awaitResponse: true`), success:**
```json
HTTP 200
{
  "eventId": 42,
  "status": "delivered",
  "deliveries": [
    {
      "service": "message-server",
      "status": "delivered",
      "responseCode": 200,
      "responseBody": "{\"ok\":true}",
      "durationMs": 145
    }
  ]
}
```

**Response — sync (`awaitResponse: true`), delivery failed:**
```json
HTTP 200
{
  "eventId": 42,
  "status": "failed",
  "deliveries": [
    {
      "service": "message-server",
      "status": "failed",
      "responseCode": 500,
      "responseBody": "Internal Server Error",
      "durationMs": 3022
    }
  ]
}
```

> HTTP 200 even on delivery failure. The event-server itself worked fine; the subscriber failed. The publisher checks `deliveries[].status`.

**Response — sync, no subscribers:**
```json
HTTP 200
{
  "eventId": 42,
  "status": "delivered",
  "deliveries": [],
  "message": "No subscribers for pattern 'user.registered'"
}
```

### GET /events — List events

**Query params:** `?pattern=user.&status=delivered&source=auth-server&page=1&limit=20`

```json
HTTP 200
{
  "total": 142,
  "page": 1,
  "limit": 20,
  "data": [
    {
      "id": 42,
      "pattern": "user.registered",
      "source": "auth-server",
      "status": "delivered",
      "priority": "high",
      "createdAt": "2026-07-21T14:30:00.000Z",
      "deliveries": [
        { "service": "message-server", "status": "delivered" }
      ]
    }
  ]
}
```

### GET /events/:id — Event details

Full event with payload, options, and delivery log:

```json
HTTP 200
{
  "id": 42,
  "pattern": "user.registered",
  "payload": { "userId": 123, "email": "user@example.com" },
  "source": "auth-server",
  "broadcast": true,
  "awaitResponse": false,
  "timeout": 30,
  "maxAttempts": 5,
  "retryDelay": 1,
  "log": true,
  "ttl": 7,
  "priority": "high",
  "status": "delivered",
  "createdAt": "2026-07-21T14:30:00.000Z",
  "expiresAt": "2026-07-28T14:30:00.000Z",
  "deliveries": [
    {
      "id": 1,
      "subscriberId": 1,
      "service": "message-server",
      "status": "delivered",
      "attempts": 1,
      "responseCode": 200,
      "lastAttemptAt": "2026-07-21T14:30:00.145Z"
    }
  ]
}
```

### POST /subscribe — Register subscriber

```json
// Request
{
  "service": "message-server",
  "url": "http://message-server:3003/webhook",
  "patterns": ["user.registered", "user.confirmed", "password.reset"]
}

// Response
HTTP 201
{
  "id": 1,
  "service": "message-server",
  "url": "http://message-server:3003/webhook",
  "patterns": ["user.registered", "user.confirmed", "password.reset"],
  "active": true,
  "createdAt": "2026-07-21T14:30:00.000Z"
}
```

### PATCH /subscribe/:id — Update subscriber

```json
// Request (all fields optional)
{
  "patterns": ["user.registered", "password.changed"],
  "active": false,
  "url": "http://message-server:3003/webhook-v2"
}

// Response
HTTP 200
{
  "id": 1,
  "service": "message-server",
  "url": "http://message-server:3003/webhook-v2",
  "patterns": ["user.registered", "password.changed"],
  "active": false,
  "updatedAt": "2026-07-21T14:35:00.000Z"
}
```

### DELETE /subscribe/:id — Remove subscriber

```json
HTTP 200
{ "id": 1, "deleted": true }
```

### GET /subscribers — List subscribers

```json
HTTP 200
{
  "total": 3,
  "data": [
    {
      "id": 1,
      "service": "message-server",
      "url": "http://message-server:3003/webhook",
      "patterns": ["user.registered", "user.confirmed", "password.reset"],
      "active": true,
      "createdAt": "2026-07-21T14:30:00.000Z"
    }
  ]
}
```

### GET /deliveries — Delivery log

**Query params:** `?status=failed&subscriberId=1&eventId=42&page=1&limit=20`

```json
HTTP 200
{
  "total": 87,
  "page": 1,
  "limit": 20,
  "data": [
    {
      "id": 1,
      "eventId": 42,
      "pattern": "user.registered",
      "subscriberId": 1,
      "service": "message-server",
      "status": "failed",
      "attempts": 5,
      "maxAttempts": 5,
      "responseCode": 500,
      "responseBody": "Connection refused",
      "lastAttemptAt": "2026-07-21T14:32:00.000Z",
      "nextAttemptAt": null
    }
  ]
}
```

### GET /contracts/catalog — Event contract catalog

Returns all registered event contracts with DTO field definitions:

```json
HTTP 200
{
  "contracts": [
    {
      "pattern": "user.registered",
      "dto": "UserRegisteredDto",
      "fields": [
        { "name": "userId", "type": "number", "required": true },
        { "name": "username", "type": "string", "required": true },
        ...
      ]
    }
  ]
}
```

### GET /health — Health check (no auth)

```json
HTTP 200
{ "status": "ok", "timestamp": "2026-07-21T14:30:00.000Z" }
```

---

## Webhook format

When event-server delivers an event to a subscriber:

```json
POST http://message-server:3003/webhook
X-Internal-Api-Key: <shared-key>
Content-Type: application/json

{
  "eventId": 42,
  "pattern": "user.registered",
  "payload": { "userId": 123, "email": "user@example.com" },
  "source": "auth-server",
  "timestamp": "2026-07-21T14:30:00.000Z",
  "attempt": 1
}
```

**Subscriber response rules:**
- **2xx** = success (delivery marked as `delivered`)
- **non-2xx or timeout** = failure (triggers retry up to `maxAttempts`)
- `attempt` field indicates which attempt this is (1 = first try, 2 = first retry, ...)

---

## Worker logic

### Delivery loop (every `WORKER_INTERVAL_MS`)

```
1. SELECT events
   WHERE status = 'pending'
     AND deliver_after <= NOW()           -- respects delay
   ORDER BY
     CASE priority
       WHEN 'high'   THEN 0
       WHEN 'normal' THEN 1
       WHEN 'low'    THEN 2
     END,
     created_at ASC
   LIMIT BATCH_SIZE

2. For each event:
   - Find subscribers WHERE patterns @> ARRAY[event.pattern] AND active = true
   - broadcast=true  -> create delivery for EVERY subscriber
   - broadcast=false -> create delivery for ONE subscriber (random)
   - Mark event as 'processing'

3. For each pending delivery WHERE next_attempt_at <= NOW():
   - Deliver to ALL matching subscribers **in parallel** (`Promise.allSettled`)
   - POST to subscriber.url (with X-Internal-Api-Key)
   - Timeout from event.timeout
   - 2xx -> status=delivered
   - non-2xx/timeout -> attempts++, next_attempt_at = NOW() + retryDelay * 2^attempts
   - attempts >= max_attempts -> status=failed (permanent failure)

4. **Circuit breaker:** After `CIRCUIT_BREAKER_THRESHOLD` (default: 5) permanent failures
   for a subscriber, the subscriber is **auto-deactivated** (active=false). This prevents
   event-server from endlessly retrying a dead endpoint.

5. If all deliveries for an event are resolved:
   - Mark event as 'delivered' (if all succeeded) or 'failed' (if any failed)
```

### TTL cleanup (every `CLEANUP_INTERVAL_MS`)

```
DELETE FROM events
WHERE log = true
  AND expires_at < NOW()

Cascade delete related deliveries.
```

---

## Configuration (environment variables)

```env
# Server
PORT=3005
IP=0.0.0.0
NODE_ENV=production

# Database
DB_TYPE=postgres
DB_HOST=postgres
DB_PORT=5432
DB_NAME=event_server
DB_USER=root
DB_PASSWORD=1234
DB_SYNCHRONIZE=false                # set true for dev schema sync
DB_POOL_MAX=50                      # connection pool size

# Security
INTERNAL_API_KEY=changeme
EVENT_STRICT_MODE=false             # reject unknown event patterns (default: false)
CIRCUIT_BREAKER_THRESHOLD=5         # permanent failures before subscriber deactivated

# Worker
WORKER_INTERVAL_MS=500          # processing cycle (default: 500ms)
WORKER_MAX_INTERVAL_MS=2000     # adaptive backoff ceiling
CLEANUP_INTERVAL_MS=3600000     # TTL cleanup cycle (default: 3600000 = 1h)
BATCH_SIZE=50                   # max events/deliveries per cycle

# HTTP client (webhook delivery)
DEFAULT_HTTP_TIMEOUT_MS=10000   # default timeout (overridden by event.timeout)

# Swagger (optional)
SWAGGER_PREFIX=docs
SWAGGER_TITLE=Event Server API
SWAGGER_DESCRIPTION=Central event broker
SWAGGER_VERSION=1.0
```

---

## Database schema

### events

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL PK | Auto-increment |
| `pattern` | VARCHAR | Event name (routing key) |
| `payload` | JSONB | Event body |
| `source` | VARCHAR | Publishing service name |
| `broadcast` | BOOLEAN | Delivery mode (default: true) |
| `await_response` | BOOLEAN | Sync/async (default: false) |
| `timeout` | INT | Webhook timeout in seconds (default: 30) |
| `max_attempts` | INT | Max retries (default: 5) |
| `retry_delay` | INT | Base retry delay in seconds (default: 1) |
| `log` | BOOLEAN | Store for audit (default: true) |
| `ttl` | INT NULL | Days to keep (null = forever, default: 7) |
| `priority` | VARCHAR | low/normal/high (default: normal) |
| `delay` | INT | Seconds to delay delivery (default: 0) |
| `status` | VARCHAR | pending/processing/delivered/failed |
| `expires_at` | TIMESTAMP NULL | Calculated: created_at + ttl days |
| `deliver_after` | TIMESTAMP NULL | Calculated: created_at + delay seconds |
| `created_at` | TIMESTAMP | Auto |

### subscribers

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL PK | Auto-increment |
| `service` | VARCHAR | Service name |
| `url` | VARCHAR | Webhook URL |
| `patterns` | TEXT[] | Array of pattern names |
| `active` | BOOLEAN | Pause/resume (default: true) |
| `created_at` | TIMESTAMP | Auto |
| `updated_at` | TIMESTAMP | Auto |

### deliveries

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL PK | Auto-increment |
| `event_id` | INT FK | References events.id |
| `subscriber_id` | INT FK | References subscribers.id |
| `status` | VARCHAR | pending/delivered/failed |
| `attempts` | INT | Current attempt count |
| `max_attempts` | INT | Copied from event |
| `last_attempt_at` | TIMESTAMP NULL | Last delivery attempt time |
| `next_attempt_at` | TIMESTAMP NULL | When to retry (backoff schedule) |
| `response_code` | INT NULL | HTTP status from webhook |
| `response_body` | TEXT NULL | Response body from webhook |
| `created_at` | TIMESTAMP | Auto |

---

## Integration guide

### Publishing events (from any service)

**Recommended:** Use the toolkit's `IEventClient` for type-safe publishing with contract DTOs:

```typescript
// Example: auth-server emitting user.registered
import { IEventClient } from "api-server-toolkit/client";
import { UserRegisteredDto } from "event-server/contracts";

@Injectable()
export class MethodsAccountService {
  constructor(
    @Inject(IEventClient) private readonly eventClient: IEventClient,
  ) {}

  async register(/* ... */) {
    // ... create account ...

    const payload: UserRegisteredDto = {
      userId: account.id,
      username: account.username,
      email: account.username,
      subject: "Registration Confirmation",
      confirmUrl: `${process.env.FORM_CONFIRM}/${confirm.code}`,
    };

    await this.eventClient.publish({
      pattern: "user.registered",
      payload,
      source: "auth-server",
      broadcast: true,
      log: true,
      ttl: 30,
      priority: "high",
    });
  }
}
```

The `EventClientModule` from the toolkit handles the HTTP call to event-server with the `X-Internal-Api-Key` header automatically.

**Alternative:** Raw HTTP call (for non-NestJS services):

```typescript
import axios from 'axios';

await axios.post('http://event-server:3005/events', {
  pattern: 'user.registered',
  payload: { userId, email },
  source: 'auth-server',
  broadcast: true,
}, {
  headers: { 'X-Internal-Api-Key': process.env.INTERNAL_API_KEY },
});
```

### Subscribing to events (webhook receiver)

```typescript
// Example: message-server webhook handler with typed contracts
import { WebhookEnvelopeDto, UserRegisteredDto } from "event-server/contracts";

@Controller('webhooks')
@UseGuards(InternalAuthGuard)
export class WebhooksController {
  @Post('events')
  async handleEvent(@Body() event: WebhookEnvelopeDto) {
    switch (event.pattern) {
      case 'user.registered':
        await this.onUserRegistered(event.payload as UserRegisteredDto);
        break;
      case 'password.reset':
        await this.onPasswordReset(event.payload as PasswordResetDto);
        break;
    }
    return { received: true };
  }
}
```

### Registering on startup

```typescript
import { OnModuleInit } from '@nestjs/common';
import axios from 'axios';

export class SubscriptionService implements OnModuleInit {
  async onModuleInit() {
    try {
      await axios.post('http://event-server:3005/subscribe', {
        service: 'message-server',
        url: 'http://message-server:3003/webhook',
        patterns: ['user.registered', 'user.confirmed', 'password.reset'],
      }, {
        headers: { 'X-Internal-Api-Key': process.env.INTERNAL_API_KEY },
      });
      console.log('[EventServer] Subscribed successfully');
    } catch (err) {
      console.error('[EventServer] Subscription failed, will retry...');
      setTimeout(() => this.onModuleInit(), 30000);
    }
  }
}
```

---

## Quick start

```bash
cp .env.example .env
npm install
npm run dev
```

Event server runs on port **3005**.
Swagger UI at `http://localhost:3005/swagger`.

### Docker

```yaml
# docker-compose.yml (in gateway-server/)
event-server:
  build:
    context: ..
    dockerfile: event-server/Dockerfile
  environment:
    - NODE_ENV=production
    - IP=0.0.0.0
    - PORT=3005
    - DB_TYPE=postgres
    - DB_HOST=postgres
    - DB_PORT=5432
    - DB_NAME=event_server
    - DB_USER=root
    - DB_PASSWORD=1234
    - DB_SYNCHRONIZE=${DB_SYNCHRONIZE:-false}
    - INTERNAL_API_KEY=${INTERNAL_API_KEY:-changeme}
    - WORKER_INTERVAL_MS=500
    - WORKER_MAX_INTERVAL_MS=2000
    - CLEANUP_INTERVAL_MS=3600000
    - BATCH_SIZE=50
    - DEFAULT_HTTP_TIMEOUT_MS=10000
    - DB_POOL_MAX=50
  depends_on:
    - postgres
  restart: unless-stopped
```

```bash
# init-databases.sh — add:
CREATE DATABASE event_server;
GRANT ALL PRIVILEGES ON DATABASE event_server TO $POSTGRES_USER;
```

---

## Why HTTP webhook bus?

The event-server uses HTTP webhooks for delivery — no message broker to install, operate,
or debug. Subscribers register a URL, event-server POSTs events to it.

**When to migrate:** ~1000 events/sec or when you need persistence guarantees beyond the
delivery table. Replace event-server with:
- **NATS JetStream** — lightweight, persistent, at-least-once delivery
- **Redis Streams** — if you already run Redis

**Broker replacement does NOT affect domain services.** They already expose webhook
endpoints — only the event-server changes.

### How to replace the transport

The toolkit's `IEventClient` is a single-method interface. Domain services call
`eventClient.publish(pattern, payload)` — they don't know or care how the event reaches
the broker. See the [Event Publishing section](../api-server-toolkit/README.md#event-publishing)
in the toolkit README for a complete Redis Streams example.

**Publisher side** (domain service → broker): implement `IEventClient` with your broker
of choice (~20 lines). Override in `AppModule`.

**Delivery side** (broker → subscriber): this is where event-server's `DeliveryService`
uses HTTP webhooks. For high-volume subscribers, you can:
1. Keep HTTP webhooks (sufficient for most cases)
2. Add a message queue consumer alongside the HTTP delivery
3. Replace event-server entirely with a managed broker (loses retry, circuit breaker, audit trail)

## Throughput Tuning

Default config yields ~500 events/sec (`BATCH_SIZE=50`, `WORKER_INTERVAL_MS=500`).
Parallel fan-out, GIN-indexed subscriber lookups, and per-cycle subscriber caching
keep the bottleneck on subscriber response time, not event-server processing.

| Target | Config | Notes |
|--------|--------|-------|
| 500 ev/s | Defaults (no tuning needed) | Single instance |
| 2,000 ev/s | `BATCH_SIZE=200`, `WORKER_INTERVAL_MS=200`, `DB_POOL_MAX=80` | Single instance |
| 5,000+ ev/s | Above + 3-5 worker replicas | `SKIP LOCKED` ensures no duplicate processing |
| 10,000+ ev/s | Above + 10 replicas | Or switch to `IEventClient` with Redis Streams |

### Horizontal scaling

Run N replicas of event-server behind Docker Compose. `SKIP LOCKED` row locking
(`delivery.worker.ts:101-102`) ensures each event is claimed by exactly one worker:

```yaml
services:
  event-server:
    deploy:
      replicas: 3
```

No code changes needed — workers coordinate via the database.

## AI-Friendly Documentation

This service is designed for AI-assisted development. You can feed context
to any LLM (ChatGPT, Claude, Cursor, Copilot) and get code that follows
all conventions — without reading the entire codebase.

### ai-context.md
Auto-generated structured reference: every controller, route, service,
entity, and DTO. Run `npm run ai-context` to regenerate.

### Event contracts catalog
Browse available event patterns and payloads at `GET /contracts/catalog` —
or explore the typed DTOs in [dist/contracts/](dist/contracts/).

### Swagger UI
Interactive API exploration at `/swagger` — publish test events, register
subscribers, inspect delivery status.

### ReDoc
Clean, readable documentation at `/redoc` — share with your team.

### Why this matters
An LLM with `ai-context.md` + the event contract DTOs can generate correct
publish/subscribe code — event patterns, payload shapes, retry logic —
without reading the source. The contracts ARE the documentation.

## Backend-Only — Bring Your Own Frontend

This service is internal infrastructure — the frontend never talks to
event-server directly. Your services publish events via HTTP POST;
event-server delivers them to subscribers via webhooks.

All APIs are REST + JSON. Integrate with any backend language: Node.js,
Python, Go, Java, PHP — anything that can receive an HTTP webhook.

## Integrating into existing infrastructure

Already have an event system? You can adopt event-server selectively:

- **Already have Kafka/RabbitMQ/NATS?** Keep your existing broker for
  high-volume streams. Use event-server for domain events that need
  HTTP webhooks (user.registered, password.reset) — it's simpler to
  integrate with services that already expose HTTP endpoints.
- **Migrating from a monolith?** Extract event publishing one event at
  a time. Your monolith already has webhook endpoints (or can add them) —
  point event-server at them and gradually move publishers from inline
  calls to `POST /events`.
- **Need to replace event-server?** Domain services don't change — they
  already expose webhook endpoints. Swap event-server for NATS JetStream
  or Redis Streams; only the delivery mechanism changes.

## Related Services

| Service | Role | Repo |
|---------|------|------|
| auth-server | Publishes auth events (user.registered, password.reset) | [fwmakc/auth-server](https://github.com/fwmakc/auth-server) |
| api-server | Publishes domain events | [fwmakc/api-server](https://github.com/fwmakc/api-server) |
| message-server | Subscribes to events → sends email | [fwmakc/message-server](https://github.com/fwmakc/message-server) |
| api-server-toolkit | Shared library (InternalAuthGuard, httpPost) | [fwmakc/api-server-toolkit](https://github.com/fwmakc/api-server-toolkit) |
| gateway-server | Nginx reverse proxy + Docker Compose | [fwmakc/gateway-server](https://github.com/fwmakc/gateway-server) |
| scaffold | Template for new services | [fwmakc/scaffold](https://github.com/fwmakc/scaffold) |

---

## Port assignments

| Service | Port |
|---------|------|
| auth-server | 3001 |
| file-server | 3002 |
| message-server | 3003 |
| chat-server | 3004 |
| **event-server** | **3005** |
| api-server | 5000 |
| postgres | 5432 |
| redis | 6379 |
| nginx | 80 |

---

## Versioning

All services in the fwmakc stack share the same **major version**. Same major = guaranteed compatibility.

| Level | Scope | Example |
|-------|-------|---------|
| **Major** | Shared across ALL services. A breaking change in any service bumps the major for everyone. | toolkit 2.x → 3.0.0 ⟹ all services tag v3.0.0 |
| **Minor** | Independent per service. New features (additive). | auth-server 2.1.0 → 2.2.0 |
| **Patch** | Independent per service. Bug fixes. | event-server 2.0.0 → 2.0.1 |

### What triggers a major bump

A breaking change at any intersection point:

- **api-server-toolkit** — guards, columns, decorators, EntityController, bootstrap, services
- **event-server contracts** — DTO field removed/renamed, required field added
- **Inter-service API** — JWT claim format, `X-Internal-Api-Key` scheme, webhook contract
- **Public API** — any endpoint that another service depends on

### What does NOT trigger a major bump

- Bug fixes, performance improvements
- New features (additive — new optional fields, new endpoints)
- Internal refactoring that doesn't change interfaces

### Alignment process

When a service makes a breaking change (e.g., toolkit 2.x → 3.0.0):

1. The changing service bumps its major and tags the release
2. **All other services** get a stack alignment commit:
   - Bump `version` in `package.json`
   - Add CHANGELOG entry: `chore: stack v3 alignment`
   - Update dependency pins if needed
   - Tag `v3.0.0`
3. All services are now on stack v3

### Current versions

| Service | Version |
|---------|---------|
| [api-server-toolkit](https://github.com/fwmakc/api-server-toolkit) | v2.1.0 |
| [event-server](https://github.com/fwmakc/event-server) | v2.0.0 |
| [auth-server](https://github.com/fwmakc/auth-server) | v2.0.0 |
| [message-server](https://github.com/fwmakc/message-server) | v2.0.0 |
| [file-server](https://github.com/fwmakc/file-server) | v2.0.0 |
| [chat-server](https://github.com/fwmakc/chat-server) | v2.0.0 |
| [api-server](https://github.com/fwmakc/api-server) | v2.0.0 |
| [gateway-server](https://github.com/fwmakc/gateway-server) | v2.0.0 |
| [scaffold](https://github.com/fwmakc/scaffold) | v2.0.0 |
