# Event Server — Central Event Broker

Standalone microservice for event-driven communication between services. Replaces Redis Streams event bus with HTTP-based publish/subscribe pattern.

**Thin pipe**: receives events, routes to subscribers via webhooks. No business logic, no payload transformation, no domain knowledge. Includes a **schema registry** for type-safe event contracts.

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

# Security
INTERNAL_API_KEY=changeme
EVENT_STRICT_MODE=false             # reject unknown event patterns (default: false)
CIRCUIT_BREAKER_THRESHOLD=5         # permanent failures before subscriber deactivated

# Worker
WORKER_INTERVAL_MS=2000         # processing cycle (default: 2000 = 2s)
CLEANUP_INTERVAL_MS=3600000     # TTL cleanup cycle (default: 3600000 = 1h)
BATCH_SIZE=10                   # max events per cycle

# HTTP client (webhook delivery)
DEFAULT_HTTP_TIMEOUT_MS=30000   # default timeout (overridden by event.timeout)

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

## Docker

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
    - WORKER_INTERVAL_MS=2000
    - CLEANUP_INTERVAL_MS=3600000
    - BATCH_SIZE=10
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

## AI-friendly documentation

- Swagger UI at `/swagger` — interactive API exploration
- ReDoc at `/redoc` — readable API documentation
- Event contracts catalog at `GET /contracts/catalog`

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
