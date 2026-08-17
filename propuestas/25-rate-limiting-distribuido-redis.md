# Propuesta: Rate limiting distribuido con Redis

**Estado:** ⭕ Pendiente — no aplicada aún. Depende de `24-pool-conexiones-db.md` en el orden recomendado.

## Problema

`ThrottlerModule` (`app.module.ts`) usa el storage en memoria que trae `@nestjs/throttler` por defecto. Esto funciona bien con una sola instancia de la app, pero es un requisito de la propuesta de escalado horizontal (`26-escalado-horizontal-graceful-shutdown.md`) tener más de una instancia corriendo detrás de un balanceador para soportar 10,000 peticiones simultáneas.

Con storage en memoria y múltiples instancias:

- Cada instancia lleva su propio contador de peticiones por IP/usuario. Un cliente que reparte sus requests entre 3 instancias distintas (por el balanceo del load balancer) puede terminar haciendo 3× el límite configurado (`THROTTLE_LIMIT`) sin que ninguna instancia lo detecte individualmente.
- El límite de `@Throttle()` deja de ser una garantía real de protección contra abuso/DDoS, que es justamente uno de los objetivos del rate limiting.

## Solución

Reemplazar el storage in-memory por un storage compartido en Redis (`@nest-lab/throttler-storage-redis`), de forma que todas las instancias de la app consulten y actualicen el mismo contador. Esto no cambia el comportamiento de `@Throttle()` ni de `@SkipThrottle()` en ningún controller existente — solo cambia dónde se guarda el estado.

Se agrega Redis como servicio nuevo en `docker-compose.yml`. Este mismo Redis queda disponible para usos futuros (caché de lecturas frecuentes, colas de trabajo) sin tener que levantar infraestructura adicional.

### Dependencias nuevas

| Paquete | Versión | Motivo |
|---------|---------|--------|
| `ioredis` | `^6.0.0` | Cliente Redis, requerido por `@nest-lab/throttler-storage-redis` |
| `@nest-lab/throttler-storage-redis` | `^1.2.0` | Storage provider oficial recomendado para `@nestjs/throttler` (sucesor del deprecado `nestjs-throttler-storage-redis`), compatible con `@nestjs/throttler ^6.5.0` ya usado en el proyecto |

Instalación (`npm install`, no `pnpm`/`yarn`, ver `AGENTS.md`):
```powershell
npm install ioredis@^6.0.0 @nest-lab/throttler-storage-redis@^1.2.0
```

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `package.json` | Actualizar — agregar `ioredis` y `@nest-lab/throttler-storage-redis` |
| `src/config/redis.config.ts` | Crear |
| `src/config/env.validation.ts` | Actualizar — agregar validación de variables de Redis |
| `src/app.module.ts` | Actualizar — cargar `redisConfig` y configurar `storage` en `ThrottlerModule.forRootAsync` |
| `.env.example` | Actualizar — documentar variables de Redis |
| `docker-compose.yml` | Actualizar — agregar servicio `redis` |

---

## 1. `src/config/redis.config.ts` (archivo nuevo)

**Ruta:** `src/config/redis.config.ts`

```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => ({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
}));
```

## 2. `src/config/env.validation.ts` (archivo existente — actualización)

**Antes:**
```typescript
    @IsString()
    @IsNotEmpty()
    GOOGLE_CALLBACK_URL!: string;
}
```

**Después:**
```typescript
    @IsString()
    @IsNotEmpty()
    GOOGLE_CALLBACK_URL!: string;

    @IsString()
    @IsNotEmpty()
    REDIS_HOST!: string;

    @IsInt()
    @Min(1)
    @Max(65535)
    REDIS_PORT!: number;

    @IsOptional()
    @IsString()
    REDIS_PASSWORD?: string;
}
```

## 3. `src/app.module.ts` (archivo existente — actualización)

**Antes:**
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { plainToClass } from 'class-transformer';
import { validateSync } from 'class-validator';

import { DomainExceptionFilter } from './common/filters/domain-exception.filter';
import { LoggerModule } from './common/logger/logger.module';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import emailConfig from './config/email.config';
import { EnvironmentVariables } from './config/env.validation';
import jwtConfig from './config/jwt.config';
import loggerConfig from './config/logger.config';
import throttleConfig from './config/throttle.config';
```

**Después:**
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { plainToClass } from 'class-transformer';
import { validateSync } from 'class-validator';

import { DomainExceptionFilter } from './common/filters/domain-exception.filter';
import { LoggerModule } from './common/logger/logger.module';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import emailConfig from './config/email.config';
import { EnvironmentVariables } from './config/env.validation';
import jwtConfig from './config/jwt.config';
import loggerConfig from './config/logger.config';
import redisConfig from './config/redis.config';
import throttleConfig from './config/throttle.config';
```

**Antes:**
```typescript
      load: [databaseConfig, jwtConfig, appConfig, throttleConfig, loggerConfig, emailConfig],
```

**Después:**
```typescript
      load: [databaseConfig, jwtConfig, appConfig, throttleConfig, loggerConfig, emailConfig, redisConfig],
```

**Antes:**
```typescript
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ([
        {
          ttl: config.get<number>('throttle.ttl')!,
          limit: config.get<number>('throttle.limit')!,
        },
      ]),
    }),
```

**Después:**
```typescript
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('throttle.ttl')!,
            limit: config.get<number>('throttle.limit')!,
          },
        ],
        // Storage compartido en Redis — obligatorio en cuanto hay más de una
        // instancia de la app corriendo detrás de un balanceador (ver
        // propuesta de escalado horizontal); sin esto cada instancia cuenta
        // las peticiones por separado y el límite deja de cumplirse.
        storage: new ThrottlerStorageRedisService({
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
          password: config.get<string>('redis.password'),
        }),
      }),
    }),
```

## 4. `.env.example` (archivo existente — actualización)

**Antes:**
```
# ==============================================
# Rate Limiting (Throttler)
# ==============================================
THROTTLE_TTL=60000
THROTTLE_LIMIT=10
```

**Después:**
```
# ==============================================
# Rate Limiting (Throttler)
# ==============================================
THROTTLE_TTL=60000
THROTTLE_LIMIT=10

# ==============================================
# Redis (storage compartido del throttler entre instancias)
# ==============================================
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

## 5. `docker-compose.yml` (archivo existente — actualización)

**Antes:**
```yaml
  # Aplicación NestJS
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: 3tiempo-app
    restart: unless-stopped
    ports:
      - '${PORT:-3000}:3000'
    environment:
      NODE_ENV: ${NODE_ENV:-production}
      PORT: ${PORT:-3000}
      DB_HOST: postgres
      DB_PORT: 5432
      DB_USERNAME: ${DB_USERNAME:-postgres}
      DB_PASSWORD: ${DB_PASSWORD:-postgres}
      DB_DATABASE: ${DB_DATABASE:-nestjs_ddd_starter}
      JWT_SECRET: ${JWT_SECRET}
      JWT_EXPIRES_IN: ${JWT_EXPIRES_IN:-24h}
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - 3tiempo-network

volumes:
  postgres_data:
    driver: local
```

**Después:**
```yaml
  # Redis — storage compartido del throttler (y futuro caché/colas)
  redis:
    image: redis:7-alpine
    container_name: 3tiempo-redis
    restart: unless-stopped
    command: ['redis-server', '--appendonly', 'no']
    ports:
      - '${REDIS_PORT:-6379}:6379'
    networks:
      - 3tiempo-network
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s
      timeout: 5s
      retries: 5

  # Aplicación NestJS
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: 3tiempo-app
    restart: unless-stopped
    ports:
      - '${PORT:-3000}:3000'
    environment:
      NODE_ENV: ${NODE_ENV:-production}
      PORT: ${PORT:-3000}
      DB_HOST: postgres
      DB_PORT: 5432
      DB_USERNAME: ${DB_USERNAME:-postgres}
      DB_PASSWORD: ${DB_PASSWORD:-postgres}
      DB_DATABASE: ${DB_DATABASE:-nestjs_ddd_starter}
      JWT_SECRET: ${JWT_SECRET}
      JWT_EXPIRES_IN: ${JWT_EXPIRES_IN:-24h}
      REDIS_HOST: redis
      REDIS_PORT: 6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - 3tiempo-network

volumes:
  postgres_data:
    driver: local
```

---

## Notas

- `redis:7-alpine` se levanta sin persistencia (`--appendonly no`) a propósito: los contadores del throttler son efímeros por diseño (se resetean cada `THROTTLE_TTL`), no hace falta persistirlos a disco. Si más adelante se usa el mismo Redis para sesiones o caché de datos que sí deban sobrevivir un reinicio, se debe revisar esta configuración.
- No se agrega contraseña a Redis en el `docker-compose.yml` de desarrollo/single-host porque la red `3tiempo-network` ya es interna y no expone el puerto fuera del host salvo por el mapeo explícito. En un despliegue real (múltiples hosts, Redis administrado, etc.) sí se debe configurar `REDIS_PASSWORD` y usar TLS si el proveedor lo soporta.
- Existe un issue reportado en el repositorio de `@nest-lab/throttler-storage-redis` sobre incrementos que no se reflejaban en Redis con ciertas versiones de `@nestjs/throttler` v6. Antes de aplicar esta propuesta en producción, verificar manualmente (o con un test e2e) que al superar `THROTTLE_LIMIT` la respuesta sea `429 Too Many Requests`, y que la clave correspondiente aparezca en Redis (`redis-cli KEYS "*throttler*"`).
- Esta propuesta no cambia ningún `@Throttle()` ni `@SkipThrottle()` existente en los controllers.

## Orden de aplicación

1. `npm install ioredis@^6.0.0 @nest-lab/throttler-storage-redis@^1.2.0`.
2. Crear `src/config/redis.config.ts`.
3. Actualizar `src/config/env.validation.ts`.
4. Actualizar `src/app.module.ts` (imports, `load`, `ThrottlerModule.forRootAsync`).
5. Actualizar `.env.example` (y el `.env` real de cada ambiente).
6. Actualizar `docker-compose.yml`.
7. Levantar `docker-compose up -d redis postgres app` y verificar el comportamiento del rate limit descrito en "Notas".
