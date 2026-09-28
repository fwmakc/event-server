# AI Context — event-server

> Auto-generated. Run `npm run ai-context` to regenerate.
> Generated: 2026-09-28T16:46:30.237Z

---

## Controllers

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
| `GET` | `/subscribers` |

---

## Services

### DeliveryService

- `deliver(event: EventEntity,
    subscriber: SubscriberEntity,
    delivery: DeliveryEntity,): Promise<DeliveryResult>`
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
- `replayEvent(eventId: number): Promise<`
- `replayDelivery(id: number): Promise<DeliveryEntity>`
- `findMatchingSubscribers(pattern: string): Promise<SubscriberEntity[]>`
- `findOne(id: number): Promise<EventEntity | null>`
- `getMany(): []`
- `getMany(): []`

### SubscribersService

- `create(dto: CreateSubscriberDto): Promise<SubscriberEntity>`
- `update(id: number, dto: UpdateSubscriberDto): Promise<SubscriberEntity>`
- `remove(id: number): Promise<`
- `findAll(): Promise<`
- `findOne(id: number): Promise<SubscriberEntity | null>`

---

## Entities

### DeliveryEntity (table: `deliveries`)


### EventEntity (table: `events`)


### SubscriberEntity (table: `subscribers`)


---

## DTOs

### PasswordResetDto

| Field | Type | Optional |
|-------|------|----------|
| `username` | `string` | no |
| `email` | `string` | no |
| `subject` | `string` | no |
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

### UserRegisteredDto

| Field | Type | Optional |
|-------|------|----------|
| `userId` | `number` | no |
| `username` | `string` | no |
| `email` | `string` | no |
| `subject` | `string` | yes |
| `confirmUrl` | `string` | yes |

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
| `active` | `boolean` | yes |
| `url` | `string` | yes |
| `patterns` | `string[]` | yes |
| `active` | `boolean` | yes |
