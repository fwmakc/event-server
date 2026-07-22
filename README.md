# Event Server — Central Event Broker

Standalone microservice for event-driven communication between services. Replaces Redis Streams event bus with HTTP-based publish/subscribe pattern.

**Thin pipe**: receives events, routes to subscribers via webhooks. No business logic, no payload transformation, no domain knowledge.

```
auth-server ──[POST /events]──> event-server ──[POST /webhook]──> message-server
                                   │
                                   ├── stores events (if log:true)
                                   ├── manages subscriptions
                                   ├── delivers via HTTP with retry
                                   └── cleans up old data (TTL)
```

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
   - POST to subscriber.url (with X-Internal-Api-Key)
   - Timeout from event.timeout
   - 2xx -> status=delivered
   - non-2xx/timeout -> attempts++, next_attempt_at = NOW() + retryDelay * 2^attempts
   - attempts >= max_attempts -> status=failed

4. If all deliveries for an event are resolved:
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
DB_SYNCHRONIZE=true

# Security
INTERNAL_API_KEY=changeme

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

```typescript
// Example: auth-server emitting user.registered
import axios from 'axios';

async function emitUserRegistered(userId: number, email: string) {
  await axios.post('http://event-server:3005/events', {
    pattern: 'user.registered',
    payload: { userId, email },
    source: 'auth-server',
    broadcast: true,
    log: true,
    ttl: 30,
    priority: 'high',
  }, {
    headers: { 'X-Internal-Api-Key': process.env.INTERNAL_API_KEY },
  });
}
```

### Subscribing to events (webhook receiver)

```typescript
// Example: message-server webhook controller
import { Controller, Post, Headers, Param, Body, HttpException, HttpStatus } from '@nestjs/common';

@Controller('webhook')
export class WebhookController {
  @Post(':pattern')
  async handleEvent(
    @Headers('x-internal-api-key') apiKey: string,
    @Body() body: { eventId: number; pattern: string; payload: any; source: string; attempt: number },
  ) {
    if (apiKey !== process.env.INTERNAL_API_KEY) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }

    switch (body.pattern) {
      case 'user.registered':
        await this.sendWelcomeEmail(body.payload);
        break;
      case 'password.reset':
        await this.sendPasswordResetEmail(body.payload);
        break;
    }

    return { ok: true };
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
# docker-compose.yml (in gateway/)
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
    - DB_SYNCHRONIZE=true
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
