# AI Context — event-server

> Auto-generated. Run `npm run ai-context` to regenerate.
> Generated: 2026-10-06T05:47:03.790Z

---

## Controllers

### AuditController

Base path: `/audit`

| Method | Path |
|--------|------|
| `GET` | `/audit/events` |
| `GET` | `/audit/verify` |

### ContractsController [Event Contracts]

Base path: `/contracts`

| Method | Path |
|--------|------|
| `GET` | `/contracts/catalog` |

### EventsController

| Method | Path |
|--------|------|
| `POST` | `/events` |
| `GET` | `/events` |
| `POST` | `/events/:id/replay` |
| `POST` | `/deliveries/:id/replay` |
| `GET` | `/events/:id` |

### SubscribersController

| Method | Path |
|--------|------|
| `POST` | `/subscribe` |
| `PATCH` | `/subscribe/:id` |
| `DELETE` | `/subscribe/:id` |
| `POST` | `/subscribe/:id/rotate` |
| `GET` | `/subscribers` |

---

## Services

### AuditStoreService

- `canonicalJson(value: unknown): string`
- `computeAuditHash(prevHash: string,
  ts: Date,
  entry: {
    action: string;
    outcome: string;
    accountId?: number | null;
    accountUsername?: string | null;
    tenantId?: number | null;
    ip?: string | null;
    userAgent?: string | null;
    requestId?: string | null;
    targetType?: string | null;
    targetId?: string | null;
    details?: Record<string, unknown> | null;
  },): string`
- `canonicalJson(entry.details): "",
  ].join("|")`
- `append(dto: AuditEventDto): Promise<AuditEventEntity>`
- `verify(fromId?: number,
    toId?: number,
    baseHash?: string,): Promise<`
- `gone(purge): ids are sparse, so look for the
        // greatest surviving row below it — `fromId - 1` itself may not exist
        const prior = await this.repo.findOne(`
- `findMany(query: AuditQuery): Promise<`
- `min(query.limit, 100): 20`

### DeliveryService

- `deliver(event: EventEntity,
    subscriber: SubscriberEntity,
    delivery: DeliveryEntity,): Promise<DeliveryResult>`
- `delivery(preferred transport): // the signature + freshness window authenticates the payload and the
    // shared internal key stays off the wire entirely. Legacy subscribers
    // without a secret keep the old shared-key transport.
    const rawBody = JSON.stringify(payload)`
- `policy(${this.egressMode}): $`
- `handleFailure(delivery: DeliveryEntity,
    event: EventEntity,
    subscriber: SubscriberEntity,
    code: number | null,
    body: string,
    durationMs: number,): Promise<void>`
- `checkCircuitBreaker(subscriber: SubscriberEntity): Promise<void>`
- `publishDeactivationAlert(subscriber: SubscriberEntity, failures: number): Promise<void>`

### EventsService

- `publish(dto: PublishEventDto): Promise<PublishResult>`
- `processSync(event: EventEntity): Promise<PublishResult>`
- `replayEvent(eventId: number,): Promise<`
- `replayDelivery(id: number): Promise<DeliveryEntity>`
- `findMatchingSubscribers(pattern: string): Promise<SubscriberEntity[]>`
- `findOne(id: number): Promise<EventEntity | null>`
- `getMany(): []`
- `getMany(): []`

### SubscribersService

- `validateUrl(url: string): void`
- `BadRequestException(`Subscriber URL rejected by egress policy (${this.egressMode}): $`
- `create(dto: CreateSubscriberDto): Promise<SubscriberPublic &`
- `generateWebhookSecret(): null),
      active: dto.active ?? true,
    })`
- `update(id: number, dto: UpdateSubscriberDto): Promise<SubscriberPublic>`
- `rotateSecret(id: number): Promise<`
- `remove(id: number): Promise<`
- `findAll(): Promise<`
- `findOne(id: number): Promise<SubscriberEntity | null>`

---

## Entities

### AuditEventEntity (table: `audit_events`)


### DeliveryEntity (table: `deliveries`)


### EventEntity (table: `events`)


### SubscriberEntity (table: `subscribers`)


---

## DTOs

### AuditEventDto

| Field | Type | Optional |
|-------|------|----------|
| `action` | `string` | no |
| `outcome` | `string` | yes |
| `accountId` | `number` | yes |
| `accountUsername` | `string` | yes |
| `tenantId` | `number` | yes |
| `ip` | `string` | yes |
| `userAgent` | `string` | yes |
| `requestId` | `string` | yes |
| `targetType` | `string` | yes |
| `targetId` | `string` | yes |

### MailBouncedDto

| Field | Type | Optional |
|-------|------|----------|
| `email` | `string` | no |
| `provider` | `string` | no |
| `reason` | `string` | yes |
| `messageId` | `string` | yes |
| `bouncedAt` | `string` | no |

### MailComplainedDto

| Field | Type | Optional |
|-------|------|----------|
| `email` | `string` | no |
| `provider` | `string` | no |
| `reason` | `string` | yes |
| `messageId` | `string` | yes |
| `complainedAt` | `string` | no |

### PasswordResetDto

| Field | Type | Optional |
|-------|------|----------|
| `username` | `string` | no |
| `email` | `string` | no |
| `subject` | `string` | yes |
| `resetUrl` | `string` | no |

### SubscriberDeactivatedDto

| Field | Type | Optional |
|-------|------|----------|
| `subscriberId` | `number` | no |
| `service` | `string` | no |
| `url` | `string` | no |
| `failures` | `number` | no |
| `deactivatedAt` | `string` | no |

### UserConfirmedDto

| Field | Type | Optional |
|-------|------|----------|
| `userId` | `number` | no |
| `username` | `string` | no |
| `email` | `string` | no |

### UserDeactivatedDto

| Field | Type | Optional |
|-------|------|----------|
| `userId` | `number` | no |
| `username` | `string` | no |
| `email` | `string` | no |

### UserDeletedDto

| Field | Type | Optional |
|-------|------|----------|
| `userId` | `number` | no |
| `username` | `string` | no |
| `email` | `string` | no |

### UserLoginDto

| Field | Type | Optional |
|-------|------|----------|
| `userId` | `number` | no |
| `username` | `string` | no |
| `email` | `string` | yes |
| `ip` | `string` | yes |
| `userAgent` | `string` | yes |
| `os` | `string` | yes |
| `browser` | `string` | yes |

### UserRegisteredDto

| Field | Type | Optional |
|-------|------|----------|
| `userId` | `number` | no |
| `username` | `string` | no |
| `email` | `string` | no |
| `subject` | `string` | yes |
| `confirmUrl` | `string` | yes |

### UserTwoFactorCodeDto

| Field | Type | Optional |
|-------|------|----------|
| `userId` | `number` | no |
| `username` | `string` | no |
| `email` | `string` | no |
| `code` | `string` | no |
| `subject` | `string` | yes |

### WebhookEnvelopeDto

| Field | Type | Optional |
|-------|------|----------|
| `eventId` | `number` | no |
| `pattern` | `string` | no |
| `source` | `string` | no |
| `timestamp` | `string` | no |
| `attempt` | `number` | no |

### PublishEventDto

| Field | Type | Optional |
|-------|------|----------|
| `pattern` | `string` | no |
| `payload` | `any` | no |
| `source` | `string` | no |
| `broadcast` | `boolean` | yes |
| `awaitResponse` | `boolean` | yes |
| `timeout` | `number` | yes |
| `maxAttempts` | `number` | yes |
| `retryDelay` | `number` | yes |
| `log` | `boolean` | yes |
| `delay` | `number` | yes |

### CreateSubscriberDto

| Field | Type | Optional |
|-------|------|----------|
| `service` | `string` | no |
| `url` | `string` | no |
| `patterns` | `string[]` | no |
| `secret` | `string` | yes |
| `generateSecret` | `boolean` | yes |
| `active` | `boolean` | yes |
| `url` | `string` | yes |
| `patterns` | `string[]` | yes |
| `secret` | `string` | yes |
| `active` | `boolean` | yes |
