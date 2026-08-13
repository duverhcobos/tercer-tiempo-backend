/// <reference types="jest" />

// Nota: el helper registerUser() llama a POST /auth/register (3 req / 60s),
// así que se mockea el ThrottlerGuard para toda la suite.
jest.mock('@nestjs/throttler', () => {
    const actual = jest.requireActual<typeof import('@nestjs/throttler')>('@nestjs/throttler');
    return {
        ...actual,
        ThrottlerGuard: class MockThrottlerGuard {
            canActivate() { return true; }
        },
    };
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import supertest = require('supertest');
import * as jwt from 'jsonwebtoken';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { EMAIL_NOTIFICATION_SERVICE } from '../src/modules/auth/infrastructure/services/email-notification.service';

import { mockEmailNotificationService } from './mocks/email-notification.service.mock';

const request = (server: App) => supertest(server);

const VALID_USER = {
    email: 'profile.attack@ejemplo.com',
    username: 'profile_attack',
    password: 'Password123!', // NOSONAR: credencial de fixture para tests, no es un secreto real
    role: 'PLAYER',
};

// Payload base válido, usado únicamente para preparar el estado necesario
// en los tests de ataque (IDOR, duplicado, etc). No es un test de happy path.
const VALID_PROFILE = {
    firstName1: 'Duver',
    lastName1: 'Cobos',
    birthDate: '2000-01-01',
    gender: 'M',
};

describe('POST /users/profile (e2e) — seguridad / ataques', () => {
    let app: INestApplication;
    let dataSource: DataSource;
    let validCountryCode: string;

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

        const [{ code }] = await dataSource.query<{ code: string }[]>(
            'SELECT code FROM "countries" LIMIT 1',
        );
        validCountryCode = code;
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
    });

    /** Registra un usuario y devuelve su id, email y accessToken real emitido por /auth/register. */
    async function registerUser(overrides: Partial<typeof VALID_USER> = {}) {
        const payload = { ...VALID_USER, ...overrides };

        const res = await request(app.getHttpServer())
            .post('/auth/register')
            .send(payload)
            .expect(201);

        return {
            id: res.body.id as string,
            email: payload.email,
            accessToken: res.body.accessToken as string,
        };
    }

    function authHeader(token: string) {
        return { Authorization: `Bearer ${token}` };
    }

    function validPayload(overrides: Record<string, unknown> = {}) {
        return { ...VALID_PROFILE, countryId: validCountryCode, ...overrides };
    }

    // =========================================================
    // 1. AUTENTICACIÓN: ausencia / formato inválido / manipulación de token
    // =========================================================

    describe('Autenticación requerida', () => {
        it('401 — sin header Authorization', async () => {
            await request(app.getHttpServer())
                .post('/users/profile')
                .send(validPayload())
                .expect(401);
        });

        it('401 — header Authorization sin el prefijo "Bearer "', async () => {
            const { accessToken } = await registerUser();

            await request(app.getHttpServer())
                .post('/users/profile')
                .set({ Authorization: accessToken })
                .send(validPayload())
                .expect(401);
        });

        it('401 — token con formato inválido (no es un JWT)', async () => {
            await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader('esto-no-es-un-jwt'))
                .send(validPayload())
                .expect(401);
        });

        it('401 — token vacío', async () => {
            await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(''))
                .send(validPayload())
                .expect(401);
        });

        it('401 — token firmado con un secreto distinto es rechazado', async () => {
            const { id } = await registerUser();

            const forgedToken = jwt.sign(
                { sub: id, email: VALID_USER.email },
                'un-secreto-distinto-al-configurado',
                { expiresIn: '1h' },
            );

            await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(forgedToken))
                .send(validPayload())
                .expect(401);
        });

        it('401 — token expirado es rechazado', async () => {
            const { id } = await registerUser();
            const secret = process.env.JWT_SECRET!;

            const expiredToken = jwt.sign(
                { sub: id, email: VALID_USER.email },
                secret,
                { expiresIn: -10 }, // ya expirado
            );

            await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(expiredToken))
                .send(validPayload())
                .expect(401);
        });

        it('401 — token con "sub" de un usuario inexistente', async () => {
            const secret = process.env.JWT_SECRET!;
            const fakeUserId = '00000000-0000-0000-0000-000000000000';

            const token = jwt.sign(
                { sub: fakeUserId, email: 'nadie@ejemplo.com' },
                secret,
                { expiresIn: '1h' },
            );

            await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(token))
                .send(validPayload())
                .expect(401);
        });

        it('401 — token con algoritmo "none" es rechazado (protección de jsonwebtoken)', async () => {
            const { id } = await registerUser();

            const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
            const body = Buffer.from(JSON.stringify({ sub: id, email: VALID_USER.email })).toString('base64url');
            const noneToken = `${header}.${body}.`;

            await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(noneToken))
                .send(validPayload())
                .expect(401);
        });
    });

    // =========================================================
    // 2. IDOR / MASS ASSIGNMENT — intentos de fijar userId u otros campos protegidos
    // =========================================================

    describe('IDOR y mass assignment', () => {
        it('400 — rechaza campos no declarados en el DTO (forbidNonWhitelisted)', async () => {
            const { accessToken } = await registerUser();

            await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(accessToken))
                .send(validPayload({ isAdmin: true }))
                .expect(400);
        });

        it('400 — el userId del body es rechazado (whitelist), no puede usarse para suplantar a otro usuario', async () => {
            const userA = await registerUser({ email: 'a.attack@ejemplo.com', username: 'a_attack' });
            const userB = await registerUser({ email: 'b.attack@ejemplo.com', username: 'b_attack' });

            await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(userA.accessToken))
                .send(validPayload({ userId: userB.id }))
                .expect(400);
        });

        it('el perfil creado siempre pertenece al dueño del token, sin importar qué se envíe en el body', async () => {
            const { id, accessToken } = await registerUser();

            const res = await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(accessToken))
                .send(validPayload())
                .expect(201);

            expect(res.body.userId).toBe(id);
        });

        it('400 — rechaza intento de inyectar createdAt/updatedAt vía body', async () => {
            const { accessToken } = await registerUser();

            await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(accessToken))
                .send(validPayload({ createdAt: '1970-01-01T00:00:00.000Z' }))
                .expect(400);
        });
    });

    // =========================================================
    // 3. DUPLICACIÓN — intento de crear más de un perfil por usuario
    // =========================================================

    describe('Duplicación de perfil', () => {
        it('409 — un segundo intento de creación para el mismo usuario es rechazado', async () => {
            const { accessToken } = await registerUser();

            await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(accessToken))
                .send(validPayload())
                .expect(201);

            await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(accessToken))
                .send(validPayload({ firstName1: 'Otro' }))
                .expect(409);
        });

        it('creaciones concurrentes del mismo usuario: como máximo una tiene éxito', async () => {
            const { accessToken } = await registerUser();

            const results = await Promise.all(
                Array.from({ length: 5 }, () =>
                    request(app.getHttpServer())
                        .post('/users/profile')
                        .set(authHeader(accessToken))
                        .send(validPayload()),
                ),
            );

            const successCount = results.filter((r) => r.status === 201).length;
            expect(successCount).toBe(1);
        });
    });

    // =========================================================
    // 4. INYECCIÓN — SQLi / XSS / NoSQL / prototype pollution en campos de texto
    // =========================================================

    describe('Payloads de inyección', () => {
        it('201 — un intento de SQLi en firstName1 se almacena como texto plano, sin efecto en la BD', async () => {
            const { accessToken } = await registerUser();
            const sqli = "Robert'); DROP TABLE users;--";

            const res = await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(accessToken))
                .send(validPayload({ firstName1: sqli }))
                .expect(201);

            expect(res.body.firstName1).toBe(sqli);

            const [{ count }] = await dataSource.query<{ count: string }[]>(
                'SELECT COUNT(*)::int as count FROM "users"',
            );
            expect(Number(count)).toBeGreaterThan(0);
        });

        it('201 — un payload XSS en lastName1 se almacena literalmente (sin sanitizar en backend, sin ejecutar)', async () => {
            const { accessToken } = await registerUser();
            const xss = '<script>alert(1)</script>';

            const res = await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(accessToken))
                .send(validPayload({ lastName1: xss }))
                .expect(201);

            expect(res.body.lastName1).toBe(xss);
        });

        it('un payload con clave "__proto__" no contamina Object.prototype globalmente', async () => {
            const { accessToken } = await registerUser();

            // Nota: "__proto__" como clave literal en JSON no crea una propiedad
            // propia enumerable; al copiarla, class-transformer hace
            // `instance['__proto__'] = value`, que solo reasigna el prototipo
            // interno de esa instancia puntual del DTO (se descarta al terminar
            // el request). Por eso class-validator no la ve como "propiedad no
            // declarada" y no responde 400 — pero eso no significa que sea
            // explotable. El ataque real a evaluar es si Object.prototype queda
            // contaminado globalmente, afectando a todo el proceso.
            const maliciousBody = JSON.parse(
                JSON.stringify(validPayload()).slice(0, -1) + ',"__proto__":{"polluted":true}}',
            );

            await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(accessToken))
                .send(maliciousBody);

            expect(({} as Record<string, unknown>).polluted).toBeUndefined();
            expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false);
        });

        it('400 — countryId con intento de inyección SQL es rechazado por el validador ISO-3166', async () => {
            const { accessToken } = await registerUser();

            await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(accessToken))
                .send(validPayload({ countryId: "CO'; DROP TABLE countries;--" }))
                .expect(400);
        });
    });

    // =========================================================
    // 5. ABUSO DE VALIDACIÓN — límites de tamaño, tipos y enums
    // =========================================================

    describe('Abuso de validación', () => {
        it('400 — firstName1 excede la longitud máxima permitida (payload flood)', async () => {
            const { accessToken } = await registerUser();

            await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(accessToken))
                .send(validPayload({ firstName1: 'A'.repeat(5000) }))
                .expect(400);
        });

        it('400 — gender con valor fuera del enum permitido', async () => {
            const { accessToken } = await registerUser();

            await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(accessToken))
                .send(validPayload({ gender: 'admin' }))
                .expect(400);
        });

        it('400 — birthDate con formato no fecha (intento de bypass de tipo)', async () => {
            const { accessToken } = await registerUser();

            await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(accessToken))
                .send(validPayload({ birthDate: 'no-es-una-fecha' }))
                .expect(400);
        });

        it('400 — firstName1 enviado como objeto en lugar de string (type confusion)', async () => {
            const { accessToken } = await registerUser();

            await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(accessToken))
                .send(validPayload({ firstName1: { toString: () => 'x' } }))
                .expect(400);
        });

        it('400 — firstName1 enviado como array (type confusion)', async () => {
            const { accessToken } = await registerUser();

            await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(accessToken))
                .send(validPayload({ firstName1: ['a', 'b'] }))
                .expect(400);
        });

        it('400 — body vacío es rechazado por los campos obligatorios', async () => {
            const { accessToken } = await registerUser();

            await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(accessToken))
                .send({})
                .expect(400);
        });
    });

    // =========================================================
    // 6. VALIDACIONES DE CAMPOS INDIVIDUALES
    // =========================================================

    describe('Validaciones de campos individuales', () => {
        it('400 — falta solo firstName1', async () => {
            const { accessToken } = await registerUser();
            const { firstName1, ...rest } = validPayload();

            await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(accessToken))
                .send(rest)
                .expect(400);
        });

        it('400 — falta solo lastName1', async () => {
            const { accessToken } = await registerUser();
            const { lastName1, ...rest } = validPayload();

            await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(accessToken))
                .send(rest)
                .expect(400);
        });

        it('400 — falta solo birthDate', async () => {
            const { accessToken } = await registerUser();
            const { birthDate, ...rest } = validPayload();

            await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(accessToken))
                .send(rest)
                .expect(400);
        });

        it('400 — falta solo gender', async () => {
            const { accessToken } = await registerUser();
            const { gender, ...rest } = validPayload();

            await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(accessToken))
                .send(rest)
                .expect(400);
        });

        it('400 — firstName1 string vacío (distinto de ausente)', async () => {
            const { accessToken } = await registerUser();

            await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(accessToken))
                .send(validPayload({ firstName1: '' }))
                .expect(400);
        });

        it('400 — firstName1 solo espacios en blanco (trim antes de validar)', async () => {
            const { accessToken } = await registerUser();

            await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(accessToken))
                .send(validPayload({ firstName1: '   ' }))
                .expect(400);
        });

        it('400 — campo opcional firstName2 enviado como string vacío', async () => {
            const { accessToken } = await registerUser();

            await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(accessToken))
                .send(validPayload({ firstName2: '' }))
                .expect(400);
        });

        it('400 — countryId con formato alpha-3 en vez de alpha-2', async () => {
            const { accessToken } = await registerUser();

            await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(accessToken))
                .send(validPayload({ countryId: 'COL' }))
                .expect(400);
        });

        it('400 — timezone sin formato Región/Ciudad', async () => {
            const { accessToken } = await registerUser();

            await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(accessToken))
                .send(validPayload({ timezone: 'Bogota' }))
                .expect(400);
        });

        it('400 — locale fuera de la whitelist permitida', async () => {
            const { accessToken } = await registerUser();

            await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(accessToken))
                .send(validPayload({ locale: 'it' }))
                .expect(400);
        });

        it('400 — gender con case distinto (minúscula)', async () => {
            const { accessToken } = await registerUser();

            await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(accessToken))
                .send(validPayload({ gender: 'm' }))
                .expect(400);
        });

        it('201 — campo opcional en null explícito usa el valor por defecto', async () => {
            const { accessToken } = await registerUser();

            const res = await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(accessToken))
                .send(validPayload({ timezone: null }))
                .expect(201);

            expect(res.body.timezone).toBe('UTC');
        });

        it('201 — espacios al inicio/fin se recortan (trim)', async () => {
            const { accessToken } = await registerUser();

            const res = await request(app.getHttpServer())
                .post('/users/profile')
                .set(authHeader(accessToken))
                .send(validPayload({ firstName1: '  Duver  ' }))
                .expect(201);

            expect(res.body.firstName1).toBe('Duver');
        });
    });
});
