# Contributing to event-server

Thanks for your interest in contributing! This service is part of the
[fwmakc microservices stack](https://github.com/fwmakc/gateway-server).

## Prerequisites

- **Node.js** 20+ (`node -v`)
- **npm** 10+
- **PostgreSQL** 14+ (or use Docker: `docker compose up -d postgres`)

## Development Setup

```bash
git clone https://github.com/fwmakc/event-server.git
cd event-server
cp .env.example .env
npm install
npm run dev
```

Service runs on port **3005**. Swagger UI at `http://localhost:3005/swagger`.

## Testing

```bash
npm test
```

5 test suites, 33 tests. Tests use real PostgreSQL with `dropSchema: true` +
`synchronize: true`. Tests cover: events CRUD, subscriber CRUD, delivery worker
retry/backoff, auth guard, health.

## Adding Event Contracts

1. Create DTO in `src/contracts/dto/`
2. Register in `src/contracts/index.ts` (`EventContracts` registry)
3. Run `npm run build:contracts`
4. Commit `dist/contracts/` (pre-built for cross-service imports)

## Code Style

- TypeScript with strict type checking
- NestJS conventions
- Use `InternalAuthGuard` for service-to-service endpoints
- Use `httpPost` from toolkit (native fetch, not axios)
- See `AGENTS.md` for detailed conventions

## Pull Request Process

1. Fork the repo, create a branch from `main`
2. Make your changes
3. Ensure tests pass: `npm test`
4. Ensure TypeScript compiles: `npm run build`
5. If contracts changed, run `npm run build:contracts` and commit `dist/contracts/`
6. Create a pull request with a clear description
