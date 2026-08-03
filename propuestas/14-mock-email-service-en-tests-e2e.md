# Propuesta: Mockear EmailNotificationService en la suite e2e

## Problema

Las suites `test/auth.e2e-spec.ts` y `test/login.e2e-spec.ts` ejecutan `POST /auth/register` en sus bloques `beforeEach`/tests, lo que dispara `RegisterUseCase` → `EmailNotificationService.sendVerificationEmail()` → una llamada **real** a la API de Resend.

Como la cuenta de Resend está en modo de prueba, solo permite enviar a la dirección verificada del dueño de la cuenta. Cualquier otro destinatario (todos los emails de prueba usados en los tests) responde `403 validation_error`, lo cual:

- Ensucia la salida de la consola con decenas de `console.error` y logs `ERROR [EmailNotificationService]` por cada test.
- Acopla la suite e2e a un servicio externo real (Resend), su disponibilidad y sus límites de cuota — algo que un test e2e de *login* o *registro* no debería depender.
- No rompe los tests hoy porque `EmailNotificationService` atrapa el error y no relanza excepción, pero es un riesgo latente: si Resend cambia de comportamiento (p.ej. empieza a lanzar timeout en vez de 403), la suite se volvería lenta o inestable.

## Solución

`AuthModule` ya registra `EmailNotificationService` detrás de un token de inyección (`EMAIL_NOTIFICATION_SERVICE`), siguiendo el patrón interface + token del proyecto:

```typescript
// auth.module.ts (ya existente)
{ provide: EMAIL_NOTIFICATION_SERVICE, useClass: EmailNotificationService },
```

Esto permite reemplazarlo en los tests con `overrideProvider(...).useValue(...)` de `@nestjs/testing`, sin tocar ningún archivo de `src/`. Se agrega:

1. Un mock reutilizable en `test/mocks/email-notification.service.mock.ts`.
2. Dos líneas en el `beforeAll` de cada spec (`auth.e2e-spec.ts`, `login.e2e-spec.ts`) que registran el override antes de `.compile()`.

No se modifica ningún archivo de `src/`.

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `test/mocks/email-notification.service.mock.ts` | Crear — mock de `IEmailNotificationService` |
| `test/auth.e2e-spec.ts` | Actualizar — `beforeAll` usa `overrideProvider` |
| `test/login.e2e-spec.ts` | Actualizar — `beforeAll` usa `overrideProvider` |

---

## 1. Mock de EmailNotificationService

**Ruta:** `test/mocks/email-notification.service.mock.ts`

```typescript
import { IEmailNotificationService } from '../../src/modules/auth/infrastructure/services/email-notification.service';

/**
 * Mock de IEmailNotificationService para tests e2e.
 *
 * Evita llamadas reales a la API de Resend durante la suite de tests:
 * - Elimina el ruido de errores 403 (dominio no verificado en modo de prueba).
 * - Desacopla los tests de un servicio externo real (disponibilidad, cuota, latencia).
 *
 * Uso en cada spec (dentro de beforeAll, antes de .compile()):
 *
 *   const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
 *       .overrideProvider(EMAIL_NOTIFICATION_SERVICE)
 *       .useValue(mockEmailNotificationService)
 *       .compile();
 */
export const mockEmailNotificationService: IEmailNotificationService = {
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
};
```

---

## 2. auth.e2e-spec.ts — bloque de setup actualizado

**Ruta:** `test/auth.e2e-spec.ts`

Solo cambia el bloque de imports y el `beforeAll` (líneas 1–58 del archivo actual). El resto de la suite (todos los `describe`/`it`) permanece exactamente igual.

```typescript
/// <reference types="jest" />

// Deshabilitar throttling para toda la suite de tests e2e
jest.mock('@nestjs/throttler', () => {
    const actual = jest.requireActual<typeof import('@nestjs/throttler')>('@nestjs/throttler');
    return {
        ...actual,
        ThrottlerGuard: class MockThrottlerGuard {
            canActivate() { return true; }
        },
    };
});

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { App } from 'supertest/types';
import supertest = require('supertest');
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { EMAIL_NOTIFICATION_SERVICE } from '../src/modules/auth/infrastructure/services/email-notification.service';
import { mockEmailNotificationService } from './mocks/email-notification.service.mock';

const request = (server: App) => supertest(server);

// ─── Payload base válido ─────────────────────────────────────────────────────
const VALID = {
    email: 'jugador@ejemplo.com',
    username: 'duver_10',
    password: 'Password123',
    role: 'PLAYER',
};

describe('POST /auth/register (e2e)', () => {
    let app: INestApplication;
    let dataSource: DataSource;

    // ─── Setup ────────────────────────────────────────────────────────────────
    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        })
            .overrideProvider(EMAIL_NOTIFICATION_SERVICE)
            .useValue(mockEmailNotificationService)
            .compile();

        app = moduleFixture.createNestApplication();

        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
                forbidNonWhitelisted: true,
                transform: true,
            }),
        );

        await app.init();
        dataSource = moduleFixture.get<DataSource>(DataSource);
    });

    afterAll(async () => {
        await dataSource.destroy();
        await app.close();
    });

    beforeEach(async () => {
        jest.clearAllMocks();
        await dataSource.query('DELETE FROM "user_roles"');
        await dataSource.query('DELETE FROM "verifications"');
        await dataSource.query('DELETE FROM "user_sessions"');
        await dataSource.query('DELETE FROM "users"');
    });

    // ... el resto del archivo (todos los describe/it de las categorías 1-N) no cambia ...
});
```

---

## 3. login.e2e-spec.ts — bloque de setup actualizado

**Ruta:** `test/login.e2e-spec.ts`

Igual que el anterior: solo cambia el bloque de imports y el `beforeAll` (líneas 1–63 del archivo actual). El resto de la suite no cambia.

```typescript
/// <reference types="jest" />

// Nota: Throttling se mockea para permitir la ejecución de la suite.
// En producción el endpoint tiene @Throttle 5 req / 60 s.
jest.mock('@nestjs/throttler', () => {
    const actual = jest.requireActual<typeof import('@nestjs/throttler')>('@nestjs/throttler');
    return {
        ...actual,
        ThrottlerGuard: class MockThrottlerGuard {
            canActivate() { return true; }
        },
    };
});

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { App } from 'supertest/types';
import supertest = require('supertest');
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { EMAIL_NOTIFICATION_SERVICE } from '../src/modules/auth/infrastructure/services/email-notification.service';
import { mockEmailNotificationService } from './mocks/email-notification.service.mock';

const request = (server: App) => supertest(server);

// Usuario base. Se crea en beforeEach y se activa vía SQL para permitir login.
const VALID_USER = {
    email: 'login.test@ejemplo.com',
    username: 'login_test',
    password: 'Password123!',
    role: 'PLAYER',
};

const ACTIVE_CREDENTIALS = {
    email: VALID_USER.email,
    password: VALID_USER.password,
};

describe('POST /auth/login (e2e) — seguridad', () => {
    let app: INestApplication;
    let dataSource: DataSource;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        })
            .overrideProvider(EMAIL_NOTIFICATION_SERVICE)
            .useValue(mockEmailNotificationService)
            .compile();

        app = moduleFixture.createNestApplication();

        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
                forbidNonWhitelisted: true,
                transform: true,
            }),
        );

        await app.init();
        dataSource = moduleFixture.get<DataSource>(DataSource);
    });

    afterAll(async () => {
        await dataSource.destroy();
        await app.close();
    });

    beforeEach(async () => {
        jest.clearAllMocks();
        await dataSource.query('DELETE FROM "user_profiles"');
        await dataSource.query('DELETE FROM "user_roles"');
        await dataSource.query('DELETE FROM "verifications"');
        await dataSource.query('DELETE FROM "user_sessions"');
        await dataSource.query('DELETE FROM "users"');

        await request(app.getHttpServer())
            .post('/auth/register')
            .send(VALID_USER)
            .expect(201);

        await dataSource.query(
            `UPDATE "users" SET status = 'active' WHERE LOWER(email) = LOWER($1)`,
            [VALID_USER.email],
        );
    });

    // ... el resto del archivo (todos los describe/it de las categorías 1-7) no cambia ...
});
```

---

## Notas

- No se modifica `src/modules/auth/auth.module.ts` ni `email-notification.service.ts`: la sustitución ocurre únicamente dentro del `TestingModule` de cada suite, vía `overrideProvider`, que es el mecanismo estándar de NestJS para testing.
- `jest.clearAllMocks()` en `beforeEach` asegura que el contador de llamadas del mock no se acumule entre tests (útil si en el futuro se quiere `expect(mockEmailNotificationService.sendVerificationEmail).toHaveBeenCalledWith(...)`).
- Si en el futuro se agregan más suites e2e que registren usuarios (p.ej. para `/users/profile`), deben aplicar el mismo `overrideProvider` para mantener la suite aislada de Resend.

## Orden de aplicación

1. Crear `test/mocks/email-notification.service.mock.ts`.
2. Actualizar `test/auth.e2e-spec.ts` (imports + `beforeAll` + `beforeEach`).
3. Actualizar `test/login.e2e-spec.ts` (imports + `beforeAll` + `beforeEach`).
4. Ejecutar `npm run test:e2e` y confirmar que ya no aparecen logs de `[Resend API Error]` y que los 121 tests (95 + 26) siguen en verde.
