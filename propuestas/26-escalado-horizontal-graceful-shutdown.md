# Propuesta: Escalado horizontal, graceful shutdown, tuning del proceso y métricas básicas

**Estado:** ⭕ Pendiente — no aplicada aún. El diff de `docker-compose.yml` asume `24` y `25` ya aplicadas (ver notas dentro del documento si se aplica sin ellas).

## Problema

Hoy la app corre como **un único proceso Node** en **un único contenedor** (`docker-compose.yml`, servicio `app`), sin balanceador delante. Node es single-threaded para ejecutar JavaScript: un solo proceso satura ~1 core de CPU bajo carga alta, sin importar cuánta RAM o CPU tenga la máquina disponible. Para sostener 10,000 peticiones simultáneas no alcanza con optimizar el código de un proceso — hace falta correr **varias instancias en paralelo** y repartir el tráfico entre ellas.

Además, hoy:

- No hay `app.enableShutdownHooks()` en `main.ts`: al reiniciar/desplegar, el proceso puede cortarse a mitad de una petición en curso en vez de terminarla y cerrar limpio.
- No hay tuning de `keepAliveTimeout`/`headersTimeout` del servidor HTTP subyacente (Express). Con un balanceador delante, un valor de `keepAliveTimeout` menor al del balanceador puede provocar errores intermitentes `502` bajo carga (condición de carrera muy conocida en Node detrás de un load balancer).
- `UV_THREADPOOL_SIZE` no está configurado (default: 4 threads). Operaciones bloqueantes de CPU que usan el threadpool de libuv (`bcrypt.hash`/`compare`, entre otras) compiten por esos 4 threads; con tráfico alto de login/registro esto se satura y ralentiza también otras operaciones async que no tienen nada que ver (DNS, algunas de `crypto`, `fs`).
- No hay ninguna métrica expuesta (latencia, throughput, tasa de error, saturación del pool de DB). Sin esto, no hay forma de ver un problema de capacidad venir — se detecta cuando ya afectó usuarios.

## Solución

1. Escalar horizontalmente la app con **múltiples réplicas del mismo contenedor** detrás de un **reverse proxy Nginx** que actúa de balanceador de carga (round-robin), dentro del mismo `docker-compose.yml`. Como la autenticación ya es JWT stateless (sin sesión en memoria del servidor — ver `AGENTS.md`), el código actual de `auth`/`users` es compatible con esto sin cambios de lógica.
2. Agregar `app.enableShutdownHooks()` y tuning de timeouts del servidor HTTP en `main.ts`.
3. Configurar `UV_THREADPOOL_SIZE` en el `Dockerfile`.
4. Exponer un endpoint `/metrics` (formato Prometheus) con métricas HTTP básicas (latencia por ruta, conteo de requests, tasa de error) usando `@willsoto/nestjs-prometheus`.
5. Agregar un script de prueba de carga (`k6`) para validar el objetivo de 10,000 peticiones simultáneas de forma medible, en vez de asumirlo.

### Dependencias nuevas

| Paquete | Versión | Motivo |
|---------|---------|--------|
| `@willsoto/nestjs-prometheus` | `^6.1.0` | Integración de Prometheus con el DI de Nest, expone `/metrics` |
| `prom-client` | `^15.1.3` | Requerido como peer dependency por `@willsoto/nestjs-prometheus` |

```powershell
npm install @willsoto/nestjs-prometheus@^6.1.0 prom-client@^15.1.3
```

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `package.json` | Actualizar — agregar `@willsoto/nestjs-prometheus` y `prom-client` |
| `src/main.ts` | Actualizar — shutdown hooks + tuning de timeouts del servidor HTTP |
| `Dockerfile` | Actualizar — `ENV UV_THREADPOOL_SIZE` |
| `src/infrastructure/metrics/metrics.module.ts` | Crear |
| `src/infrastructure/metrics/metrics.controller.ts` | Crear |
| `src/app.module.ts` | Actualizar — importar `MetricsModule` |
| `docker-compose.yml` | Actualizar — quitar publicación directa de puerto del servicio `app`, agregar servicio `nginx` como balanceador |
| `nginx/nginx.conf` | Crear |
| `loadtest/10k-concurrent.js` | Crear — script de k6 para verificar el objetivo |

---

## 1. `src/main.ts` (archivo existente — actualización)

**Antes:**
```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Custom logger
  const logger = app.get(LoggerService);
  app.useLogger(logger);
```

**Después:**
```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Custom logger
  const logger = app.get(LoggerService);
  app.useLogger(logger);

  // Permite que los módulos reaccionen a SIGTERM/SIGINT (ej. cerrar el pool
  // de DB) y que las peticiones en curso terminen antes de que el proceso
  // muera durante un despliegue/reinicio detrás del balanceador.
  app.enableShutdownHooks();
```

**Antes:**
```typescript
  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.log(`🚀 Application running at: http://localhost:${port}`, 'Bootstrap');
  logger.log(`📚 Swagger docs: http://localhost:${port}/api/docs`, 'Bootstrap');
  logger.log(`❤️  Health check: http://localhost:${port}/health`, 'Bootstrap');
}
bootstrap();
```

**Después:**
```typescript
  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  // Detrás de un balanceador (nginx, ALB, etc.), keepAliveTimeout del
  // servidor Node debe ser MAYOR que el idle timeout del balanceador; si no,
  // hay una condición de carrera clásica donde Node cierra el socket justo
  // cuando el balanceador está por reenviar una petición por esa misma
  // conexión keep-alive, produciendo 502 intermitentes bajo carga.
  const httpServer = app.getHttpServer();
  httpServer.keepAliveTimeout = parseInt(process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS || '65000', 10);
  httpServer.headersTimeout = httpServer.keepAliveTimeout + 5000;

  logger.log(`🚀 Application running at: http://localhost:${port}`, 'Bootstrap');
  logger.log(`📚 Swagger docs: http://localhost:${port}/api/docs`, 'Bootstrap');
  logger.log(`❤️  Health check: http://localhost:${port}/health`, 'Bootstrap');
}
bootstrap();
```

## 2. `Dockerfile` (archivo existente — actualización)

**Antes:**
```dockerfile
# Copiar build desde etapa anterior
COPY --from=builder /app/dist ./dist

# Copiar typeorm config para migraciones
COPY --from=builder /app/typeorm.config.ts ./typeorm.config.ts

# Exponer puerto
EXPOSE 3000
```

**Después:**
```dockerfile
# Copiar build desde etapa anterior
COPY --from=builder /app/dist ./dist

# Copiar typeorm config para migraciones
COPY --from=builder /app/typeorm.config.ts ./typeorm.config.ts

# Threadpool de libuv usado por operaciones bloqueantes (bcrypt, algunas de
# crypto/fs/dns). El default (4) se satura rápido con muchos logins/registros
# concurrentes y ralentiza también operaciones async no relacionadas.
ENV UV_THREADPOOL_SIZE=16

# Exponer puerto
EXPOSE 3000
```

## 3. `src/infrastructure/metrics/metrics.module.ts` (archivo nuevo)

**Ruta:** `src/infrastructure/metrics/metrics.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

@Module({
    imports: [
        PrometheusModule.register({
            defaultMetrics: {
                enabled: true,
            },
        }),
    ],
})
export class MetricsModule { }
```

## 4. `src/infrastructure/metrics/metrics.controller.ts` (archivo nuevo)

`@willsoto/nestjs-prometheus` ya expone `/metrics` automáticamente vía `PrometheusModule.register()` (usa su propio controller interno). Este archivo agrega únicamente las anotaciones de acceso público y exclusión de throttling sobre esa ruta, reutilizando los mismos decoradores ya usados en `HealthController`.

**Ruta:** `src/infrastructure/metrics/metrics.controller.ts`

```typescript
import { Controller, Get } from '@nestjs/common';
import { Public } from '../../modules/auth/presentation/decorators/public.decorator';
import { SkipThrottle } from '../../common/decorators/skip-throttle.decorator';

// PrometheusModule.register() ya define su propio controller en /metrics.
// Este archivo queda como referencia explícita de que /metrics es pública
// y no debe pasar por rate limiting; si en el futuro se reemplaza el
// controller default por uno propio, debe conservar estos dos decoradores.
@Controller()
export class MetricsAccessNoteController {
    @Public()
    @SkipThrottle()
    @Get('__metrics_access_note')
    note() {
        return { note: 'Ver /metrics, expuesto por PrometheusModule' };
    }
}
```

**Nota de implementación:** si al aplicar esta propuesta se confirma que `PrometheusModule.register()` no permite marcar su ruta interna como `@Public()`/`@SkipThrottle()` directamente, reemplazar este archivo por un controller propio que llame a `register.metrics()` de `prom-client` manualmente, con los decoradores aplicados sobre el método real.

## 5. `src/app.module.ts` (archivo existente — actualización)

**Antes:**
```typescript
import { DatabaseModule } from './infrastructure/database/database.module';
import { HealthModule } from './infrastructure/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
```

**Después:**
```typescript
import { DatabaseModule } from './infrastructure/database/database.module';
import { HealthModule } from './infrastructure/health/health.module';
import { MetricsModule } from './infrastructure/metrics/metrics.module';
import { AuthModule } from './modules/auth/auth.module';
```

**Antes:**
```typescript
    LoggerModule,
    DatabaseModule,
    HealthModule,
    AuthModule,
    UsersModule
  ],
```

**Después:**
```typescript
    LoggerModule,
    DatabaseModule,
    HealthModule,
    MetricsModule,
    AuthModule,
    UsersModule
  ],
```

## 6. `nginx/nginx.conf` (archivo nuevo)

**Ruta:** `nginx/nginx.conf`

```nginx
worker_processes auto;

events {
    worker_connections 4096;
}

http {
    # Resolver embebido de Docker — necesario para que nginx re-resuelva
    # el nombre "app" cuando se escala con `docker compose up --scale app=N`
    # (por defecto nginx resuelve el hostname una sola vez al arrancar).
    resolver 127.0.0.11 valid=10s;

    keepalive_timeout 65;
    keepalive_requests 10000;

    server {
        listen 80;

        location / {
            set $app_upstream app:3000;
            proxy_pass http://$app_upstream;

            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            proxy_connect_timeout 5s;
            proxy_send_timeout 30s;
            proxy_read_timeout 30s;
        }
    }
}
```

## 7. `docker-compose.yml` (archivo existente — actualización)

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

**Después:**
```yaml
  # Aplicación NestJS — sin container_name ni publicación de puerto fija:
  # se escala con `docker compose up -d --scale app=3` y solo se accede
  # a través de nginx.
  app:
    build:
      context: .
      dockerfile: Dockerfile
    restart: unless-stopped
    expose:
      - '3000'
    environment:
      NODE_ENV: ${NODE_ENV:-production}
      PORT: 3000
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

  # Balanceador de carga — único punto de entrada externo
  nginx:
    image: nginx:1.27-alpine
    container_name: 3tiempo-nginx
    restart: unless-stopped
    ports:
      - '${PORT:-3000}:80'
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - app
    networks:
      - 3tiempo-network

volumes:
  postgres_data:
    driver: local
```

## 8. `loadtest/10k-concurrent.js` (archivo nuevo)

**Ruta:** `loadtest/10k-concurrent.js`

Script de [k6](https://k6.io/) para validar el objetivo de forma medible, en vez de asumirlo. No se agrega `k6` como dependencia de npm porque es un binario externo (se instala aparte, no forma parte del runtime de la app).

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

// Objetivo: 10,000 usuarios virtuales concurrentes sostenidos.
// Ajustar BASE_URL al balanceador (nginx), nunca a una instancia de app directamente.
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
    stages: [
        { duration: '1m', target: 1000 },
        { duration: '2m', target: 5000 },
        { duration: '3m', target: 10000 },
        { duration: '2m', target: 10000 },
        { duration: '1m', target: 0 },
    ],
    thresholds: {
        http_req_failed: ['rate<0.01'],
        http_req_duration: ['p(95)<800'],
    },
};

export default function () {
    const res = http.get(`${BASE_URL}/health`);
    check(res, { 'status is 200': (r) => r.status === 200 });
    sleep(1);
}
```

---

## Notas

- Con `docker compose up -d --scale app=3`, Docker Compose asigna un nombre único a cada réplica (`3tiempo-backend-app-1`, `-2`, `-3`), por eso se quitó `container_name` fijo del servicio `app` — un nombre fijo impide tener más de un contenedor con ese nombre.
- El número de réplicas y el tamaño del pool de conexiones (propuesta `24-pool-conexiones-db.md`) están acoplados: `DB_POOL_MAX × réplicas` no debe superar `max_connections` de Postgres.
- Esta propuesta cubre escalado **en un solo host** (varios contenedores + nginx local) como paso intermedio verificable. Para producción real a la escala de 10,000 peticiones simultáneas sostenidas, lo recomendable es migrar este mismo patrón a un orquestador (Kubernetes con HPA, o el equivalente gestionado del proveedor cloud), donde el balanceo, el auto-scaling y los health checks (`/health`, ya existente) se integran de forma nativa. El `nginx.conf` y el cambio en `docker-compose.yml` de esta propuesta sirven para *demostrar y medir* la mejora sin depender todavía de esa infraestructura.
- El script de k6 apunta a `/health` porque es la ruta más liviana ya existente (no toca lógica de negocio); antes de dar por válido el objetivo de 10,000 concurrentes, se debe repetir la prueba contra los endpoints reales de `auth` (`/auth/login`, `/auth/register`) para medir el efecto del pool de DB y de bcrypt bajo carga real.
- No se modifica ninguna lógica de dominio ni de los módulos `auth`/`users`.

## Orden de aplicación

1. `npm install @willsoto/nestjs-prometheus@^6.1.0 prom-client@^15.1.3`.
2. Actualizar `src/main.ts` (shutdown hooks + timeouts del servidor HTTP).
3. Actualizar `Dockerfile` (`UV_THREADPOOL_SIZE`).
4. Crear `src/infrastructure/metrics/metrics.module.ts`.
5. Crear `src/infrastructure/metrics/metrics.controller.ts`.
6. Actualizar `src/app.module.ts` (importar `MetricsModule`).
7. Crear `nginx/nginx.conf`.
8. Actualizar `docker-compose.yml` (servicio `app` sin puerto fijo, nuevo servicio `nginx`).
9. Crear `loadtest/10k-concurrent.js`.
10. Levantar con `docker compose up -d --build --scale app=3` y correr `k6 run loadtest/10k-concurrent.js` contra `http://localhost:3000` (el puerto publicado por nginx) para verificar el objetivo.
