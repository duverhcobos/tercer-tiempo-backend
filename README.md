# NestJS DDD Template

A production-ready NestJS backend template following **Domain-Driven Design (DDD)** principles with a clean 4-layer architecture.

## Features

- ✅ **NestJS 11** — latest version
- ✅ **TypeScript 5.7** — strict typing
- ✅ **PostgreSQL + TypeORM** — with auto-running migrations
- ✅ **JWT authentication** — Passport.js + Bearer token
- ✅ **DDD Architecture** — Domain / Application / Infrastructure / Presentation
- ✅ **Swagger / OpenAPI** — auto-generated docs at `/api/docs`
- ✅ **Winston Logger** — structured JSON logs with daily file rotation
- ✅ **Rate Limiting** — `@nestjs/throttler` (configurable per-route)
- ✅ **Helmet + CORS** — HTTP security headers out of the box
- ✅ **Health check** — TypeORM DB ping at `/health`
- ✅ **Unit tests** — Jest with mocked repositories

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in environment variables
cp .env.example .env

# 3. Start the PostgreSQL database (requires Docker)
npm run docker:up

# 4. Start in development mode (auto migrations + hot reload)
npm run start:dev
```

Open:
- API: http://localhost:3000
- Swagger: http://localhost:3000/api/docs
- Health: http://localhost:3000/health

---

## Project Structure

```
src/
├── common/
│   ├── decorators/        # @SkipThrottle
│   ├── exceptions/        # DomainException base class ← shared by all modules
│   ├── filters/           # Global DomainExceptionFilter
│   └── logger/            # Winston LoggerModule (global)
│
├── config/                # registerAs config namespaces
│   ├── app.config.ts
│   ├── database.config.ts
│   ├── env.validation.ts  # startup env validation
│   ├── jwt.config.ts
│   ├── logger.config.ts
│   └── throttle.config.ts
│
├── infrastructure/
│   ├── database/          # TypeORM module + migrations + schemas
│   └── health/            # /health endpoint
│
└── modules/
    └── auth/              # Example DDD module (copy to add new domains)
        ├── domain/        # Entities, Value Objects, Repository interfaces, Exceptions
        ├── application/   # Use Cases, Services, DTOs, Mappers
        ├── infrastructure/ # Repository impl, Bcrypt, JWT, Passport Strategy
        └── presentation/  # Controllers, Guards, Decorators, Swagger decorators
```

---

## Adding a New Module

1. **Create the folder**: `src/modules/<your-module>/`
2. **Domain layer** — define your Entity, Value Objects, Repository interface, and Domain Exceptions (extend `DomainException` from `common/exceptions/`)
3. **Application layer** — create Use Cases and DTOs
4. **Infrastructure layer** — implement the Repository with TypeORM; add a `*.schema.ts` (auto-discovered by `DatabaseModule`)
5. **Presentation layer** — add a Controller and register the module in `app.module.ts`

> No changes to `DomainExceptionFilter` or `DatabaseModule` are needed — both are already generic.

---

## Available Scripts

| Script | Description |
|---|---|
| `npm run start:dev` | Development server with hot reload |
| `npm run start:prod` | Production server (`dist/main`) |
| `npm run build` | Compile TypeScript |
| `npm run test` | Run unit tests |
| `npm run test:cov` | Run tests with coverage |
| `npm run migration:generate` | Generate a new TypeORM migration |
| `npm run migration:run` | Run pending migrations |
| `npm run migration:revert` | Revert the last migration |
| `npm run docker:up` | Start PostgreSQL via Docker Compose |
| `npm run docker:down` | Stop Docker containers |

---

## Environment Variables

See `.env.example` for all available variables with descriptions.
