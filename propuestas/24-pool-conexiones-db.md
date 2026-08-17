# Propuesta: Pool de conexiones TypeORM y tuning de base de datos para alta concurrencia

**Estado:** ⭕ Pendiente — no aplicada aún.

## Problema

`DatabaseModule` (`src/infrastructure/database/database.module.ts`) configura la conexión de TypeORM sin definir el pool de conexiones (`extra` / `poolSize`). El driver `pg` usa por defecto **10 conexiones** en su pool interno.

Con tráfico de miles de peticiones concurrentes, cualquier endpoint que toque la base de datos (prácticamente todos) va a agotar ese pool casi de inmediato: las peticiones nuevas quedan encoladas esperando una conexión libre, y si la espera supera el timeout, revientan con error. Esto no se nota con tráfico bajo (desarrollo, pruebas manuales) — solo aparece bajo carga real, que es exactamente lo que se quiere anticipar.

Tampoco hay `connectionTimeoutMillis` ni `idleTimeoutMillis` configurados, así que una conexión problemática puede quedarse colgada indefinidamente en vez de liberarse.

## Solución

Configurar explícitamente el pool de `pg` a través de la opción `extra` de TypeORM, con valores parametrizables por variable de entorno (para poder ajustarlos por ambiente sin tocar código). Se agregan también valores de referencia para `postgres` en `docker-compose.yml` (`max_connections`), porque el pool de la app no puede ser mayor de lo que la base de datos puede aceptar en total (pool_por_instancia × número_de_instancias ≤ max_connections de Postgres, dejando margen para herramientas externas).

No se cambia el driver ni la librería (`pg` sigue siendo la usada por `@nestjs/typeorm`), solo se agregan parámetros de configuración.

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/config/database.config.ts` | Actualizar — agregar valores de pool parametrizables |
| `src/infrastructure/database/database.module.ts` | Actualizar — pasar `extra` con la config del pool a TypeORM |
| `src/config/env.validation.ts` | Actualizar — agregar validación opcional de las nuevas variables |
| `.env.example` | Actualizar — documentar las nuevas variables |
| `docker-compose.yml` | Actualizar — subir `max_connections` de Postgres y exponerlo como variable |

---

## 1. `src/config/database.config.ts` (archivo existente — actualización)

**Antes:**
```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '1234',
    database: process.env.DB_DATABASE || 'app_db',
}));
```

**Después:**
```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '1234',
    database: process.env.DB_DATABASE || 'app_db',
    pool: {
        // Máximo de conexiones simultáneas que esta instancia puede abrir contra Postgres.
        // pool_max × número_de_instancias debe quedar por debajo de max_connections de Postgres.
        max: parseInt(process.env.DB_POOL_MAX || '20', 10),
        min: parseInt(process.env.DB_POOL_MIN || '5', 10),
        // Tiempo máximo esperando una conexión libre del pool antes de fallar.
        connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONN_TIMEOUT_MS || '5000', 10),
        // Tiempo que una conexión puede estar inactiva antes de cerrarse y liberar el slot.
        idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MS || '30000', 10),
    },
}));
```

## 2. `src/infrastructure/database/database.module.ts` (archivo existente — actualización)

**Antes:**
```typescript
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                type: 'postgres',
                host: configService.get('DB_HOST'),
                port: configService.get('DB_PORT'),
                username: configService.get('DB_USERNAME'),
                password: configService.get('DB_PASSWORD'),
                database: configService.get('DB_DATABASE'),
                // Auto-discovers all *.schema.ts files under /src
                entities: [path.join(__dirname, '/../../**/*.schema{.ts,.js}')],
                migrations: ['dist/src/infrastructure/database/migrations/*.js'],
                migrationsRun: true,
                // 'each' → cada migración en su propia transacción,
                // requerido para las que usan transaction = false
                // (ALTER TYPE ADD VALUE no admite BEGIN/COMMIT).
                migrationsTransactionMode: 'each',
                synchronize: false,
                logging: configService.get('NODE_ENV') === 'development',
            }),
        }),
```

**Después:**
```typescript
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                type: 'postgres',
                host: configService.get('DB_HOST'),
                port: configService.get('DB_PORT'),
                username: configService.get('DB_USERNAME'),
                password: configService.get('DB_PASSWORD'),
                database: configService.get('DB_DATABASE'),
                // Auto-discovers all *.schema.ts files under /src
                entities: [path.join(__dirname, '/../../**/*.schema{.ts,.js}')],
                migrations: ['dist/src/infrastructure/database/migrations/*.js'],
                migrationsRun: true,
                // 'each' → cada migración en su propia transacción,
                // requerido para las que usan transaction = false
                // (ALTER TYPE ADD VALUE no admite BEGIN/COMMIT).
                migrationsTransactionMode: 'each',
                synchronize: false,
                logging: configService.get('NODE_ENV') === 'development',
                // Pool de conexiones — evita agotar el pool default de `pg` (10) bajo carga alta.
                extra: {
                    max: configService.get('database.pool.max'),
                    min: configService.get('database.pool.min'),
                    connectionTimeoutMillis: configService.get('database.pool.connectionTimeoutMillis'),
                    idleTimeoutMillis: configService.get('database.pool.idleTimeoutMillis'),
                },
            }),
        }),
```

## 3. `src/config/env.validation.ts` (archivo existente — actualización)

Se agregan las nuevas variables como opcionales (tienen defaults en `database.config.ts`, no son obligatorias para levantar la app).

**Antes:**
```typescript
import { IsString, IsInt, Min, Max, IsNotEmpty } from 'class-validator';

export class EnvironmentVariables {
    @IsString()
    @IsNotEmpty()
    DB_HOST!: string;

    @IsInt()
    @Min(1)
    @Max(65535)
    DB_PORT!: number;
```

**Después:**
```typescript
import { IsString, IsInt, Min, Max, IsNotEmpty, IsOptional } from 'class-validator';

export class EnvironmentVariables {
    @IsString()
    @IsNotEmpty()
    DB_HOST!: string;

    @IsInt()
    @Min(1)
    @Max(65535)
    DB_PORT!: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    DB_POOL_MAX?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    DB_POOL_MIN?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    DB_POOL_CONN_TIMEOUT_MS?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    DB_POOL_IDLE_TIMEOUT_MS?: number;
```

(el resto de la clase queda igual)

## 4. `.env.example` (archivo existente — actualización)

**Antes:**
```
# ==============================================
# Database (PostgreSQL)
# ==============================================
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password_here
DB_DATABASE=app_db
```

**Después:**
```
# ==============================================
# Database (PostgreSQL)
# ==============================================
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password_here
DB_DATABASE=app_db

# Pool de conexiones — ajustar según recursos del servidor de Postgres
# y número de instancias de la app corriendo en paralelo.
# Regla: (DB_POOL_MAX * num_instancias_app) debe quedar por debajo de
# max_connections de Postgres, dejando margen para conexiones externas
# (migraciones, herramientas de administración, etc.)
DB_POOL_MAX=20
DB_POOL_MIN=5
DB_POOL_CONN_TIMEOUT_MS=5000
DB_POOL_IDLE_TIMEOUT_MS=30000
```

## 5. `docker-compose.yml` (archivo existente — actualización)

**Antes:**
```yaml
  postgres:
    image: postgres:16-alpine
    container_name: 3tiempo-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${DB_DATABASE:-3tiempo}
      POSTGRES_USER: ${DB_USERNAME:-postgres}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-postgres}
    ports:
      - '${DB_PORT:-5432}:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - 3tiempo-network
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${DB_USERNAME:-postgres}']
      interval: 10s
      timeout: 5s
      retries: 5
```

**Después:**
```yaml
  postgres:
    image: postgres:16-alpine
    container_name: 3tiempo-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${DB_DATABASE:-3tiempo}
      POSTGRES_USER: ${DB_USERNAME:-postgres}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-postgres}
    # max_connections debe ser mayor que (DB_POOL_MAX * número de réplicas de `app`)
    # más margen para conexiones administrativas/migraciones.
    command: ['postgres', '-c', 'max_connections=${DB_MAX_CONNECTIONS:-200}']
    ports:
      - '${DB_PORT:-5432}:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - 3tiempo-network
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${DB_USERNAME:-postgres}']
      interval: 10s
      timeout: 5s
      retries: 5
```

---

## Notas

- Los valores por defecto (`DB_POOL_MAX=20`) son un punto de partida razonable para una sola instancia; deben ajustarse con datos reales de una prueba de carga (ver propuesta de escalado horizontal) y con el tamaño real del servidor de Postgres (CPU/RAM disponibles — cada conexión de Postgres consume memoria).
- Esta propuesta **no** resuelve por sí sola el soporte de 10,000 peticiones simultáneas: es la base indispensable para que las siguientes propuestas (rate limiting distribuido, escalado horizontal) funcionen sin que la base de datos sea el cuello de botella.
- No se modifica ningún repositorio ni query existente.

## Orden de aplicación

1. Actualizar `src/config/database.config.ts`.
2. Actualizar `src/infrastructure/database/database.module.ts`.
3. Actualizar `src/config/env.validation.ts`.
4. Actualizar `.env.example` (y el `.env` real de cada desarrollador/ambiente, que no está versionado).
5. Actualizar `docker-compose.yml`.
6. Verificar en un ambiente de pruebas que la app levanta correctamente y que `SELECT count(*) FROM pg_stat_activity;` no supera el `DB_POOL_MAX` configurado bajo carga.
