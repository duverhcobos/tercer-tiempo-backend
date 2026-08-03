/// <reference types="jest" />

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

const VALID_USER = {
    email: 'verify.test@ejemplo.com',
    username: 'verify_test',
    password: 'Password123!', // NOSONAR: credencial de fixture para tests, no es un secreto real
    role: 'PLAYER',
};

describe('POST /auth/verify-email (e2e) — seguridad', () => {
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
    });

    /** Registra un usuario y devuelve su id + el token de verificación real guardado en BD. */
    async function registerAndGetToken(overrides: Partial<typeof VALID_USER> = {}) {
        const payload = { ...VALID_USER, ...overrides };

        await request(app.getHttpServer())
            .post('/auth/register')
            .send(payload)
            .expect(201);

        const rows = await dataSource.query(
            `SELECT v.token, v.user_id, u.status
             FROM "verifications" v
             JOIN "users" u ON u.id = v.user_id
             WHERE u.email = $1 AND v.type = 'email_verification'
             ORDER BY v.created_at DESC
             LIMIT 1`,
            [payload.email],
        );

        return { token: rows[0].token as string, userId: rows[0].user_id as string, email: payload.email };
    }

    async function getUserStatus(email: string): Promise<string> {
        const rows = await dataSource.query(`SELECT status FROM "users" WHERE email = $1`, [email]);
        return rows[0]?.status;
    }

    // =========================================================
    // 1. HAPPY PATH
    // =========================================================

    describe('Happy path', () => {
        it('200 — token válido verifica la cuenta y la deja "active"', async () => {
            const { token, email } = await registerAndGetToken();

            expect(await getUserStatus(email)).toBe('pending_verification');

            const res = await request(app.getHttpServer())
                .post('/auth/verify-email')
                .query({ token })
                .expect(200);

            expect(res.body).toEqual({ message: 'Email verified successfully' });
            expect(await getUserStatus(email)).toBe('active');
        });

        it('después de verificar, el usuario puede hacer login', async () => {
            const { token, email } = await registerAndGetToken();

            await request(app.getHttpServer())
                .post('/auth/verify-email')
                .query({ token })
                .expect(200);

            const res = await request(app.getHttpServer())
                .post('/auth/login')
                .send({ email, password: VALID_USER.password })
                .expect(200);

            expect(res.body).toHaveProperty('accessToken');
        });
    });

    // =========================================================
    // 2. REPLAY / REUTILIZACIÓN DE TOKEN
    // =========================================================

    describe('Replay de token', () => {
        it('400 — un token ya usado no puede reutilizarse', async () => {
            const { token } = await registerAndGetToken();

            await request(app.getHttpServer())
                .post('/auth/verify-email')
                .query({ token })
                .expect(200);

            const res = await request(app.getHttpServer())
                .post('/auth/verify-email')
                .query({ token })
                .expect(400);

            expect(res.body.message).toMatch(/invalid|already been used/i);
        });
    });

    // =========================================================
    // 3. TOKEN EXPIRADO
    // =========================================================

    describe('Expiración', () => {
        it('400 — token expirado es rechazado y NO activa la cuenta', async () => {
            const { token, email } = await registerAndGetToken();

            await dataSource.query(
                `UPDATE "verifications" SET expires_at = NOW() - INTERVAL '1 hour' WHERE token = $1`,
                [token],
            );

            const res = await request(app.getHttpServer())
                .post('/auth/verify-email')
                .query({ token })
                .expect(400);

            expect(res.body.message.toLowerCase()).toContain('expired');
            expect(await getUserStatus(email)).toBe('pending_verification');
        });
    });

    // =========================================================
    // 4. TOKEN INEXISTENTE / MAL FORMADO
    // =========================================================

    describe('Token inexistente o inválido', () => {
        it('400 — token que no existe en BD', async () => {
            const res = await request(app.getHttpServer())
                .post('/auth/verify-email')
                .query({ token: 'a'.repeat(64) })
                .expect(400);

            expect(res.body.message).toMatch(/invalid/i);
        });

        it('token de otro tipo (p.ej. password_reset) no debe servir para verificar email', async () => {
            const { userId, email } = await registerAndGetToken();

            const foreignToken = 'f'.repeat(64);
            await dataSource.query(
                `INSERT INTO "verifications" (user_id, type, token, expires_at)
                 VALUES ($1, 'password_reset', $2, NOW() + INTERVAL '1 day')`,
                [userId, foreignToken],
            );

            await request(app.getHttpServer())
                .post('/auth/verify-email')
                .query({ token: foreignToken })
                .expect(400);

            expect(await getUserStatus(email)).toBe('pending_verification');
        });
    });

    // =========================================================
    // 5. VALIDACIÓN DE ENTRADA (posible falta de DTO en el controller)
    // =========================================================

    describe('Validación de entrada', () => {
        it('400 — token omitido por completo', async () => {
            const res = await request(app.getHttpServer())
                .post('/auth/verify-email')
                .expect(400);

            expect(res.body.message).toEqual(
                expect.arrayContaining([expect.stringContaining('token')]),
            );
        });

        it('400 — token vacío', async () => {
            const res = await request(app.getHttpServer())
                .post('/auth/verify-email')
                .query({ token: '' })
                .expect(400);

            expect(res.body.message).toEqual(
                expect.arrayContaining([expect.stringContaining('token')]),
            );
        });

        it('400 — token con longitud distinta a 64 caracteres es rechazado por validación de formato', async () => {
            await registerAndGetToken();

            const res = await request(app.getHttpServer())
                .post('/auth/verify-email')
                .query({ token: 'short' })
                .expect(400);

            expect(res.body.message).toEqual(
                expect.arrayContaining([expect.stringContaining('64 characters')]),
            );
        });

        it('400 — token enviado dos veces (array) es rechazado por validación de tipo', async () => {
            const { token: token1 } = await registerAndGetToken({ email: 'v1@ejemplo.com', username: 'v1_user' });
            const { email: email2 } = await registerAndGetToken({ email: 'v2@ejemplo.com', username: 'v2_user' });

            // token=<válido de user1>&token=otro-valor -> Express arma un array,
            // que @IsString() ahora rechaza explícitamente.
            await request(app.getHttpServer())
                .post(`/auth/verify-email?token=${token1}&token=otro-valor`)
                .send()
                .expect(400);

            expect(await getUserStatus(email2)).toBe('pending_verification');
        });

        it('SQLi en el query param token no verifica cuentas arbitrarias', async () => {
            const { email } = await registerAndGetToken();

            // "' OR '1'='1" no mide 64 caracteres, así que ahora se rechaza en la
            // validación de formato (400) antes de llegar al use-case.
            await request(app.getHttpServer())
                .post('/auth/verify-email')
                .query({ token: "' OR '1'='1" })
                .expect(400);

            expect(await getUserStatus(email)).toBe('pending_verification');
        });
    });

    // =========================================================
    // 6. AISLAMIENTO ENTRE USUARIOS
    // =========================================================

    describe('Aislamiento entre usuarios', () => {
        it('el token de un usuario no afecta el estado de otro usuario', async () => {
            const userA = await registerAndGetToken({ email: 'a@ejemplo.com', username: 'user_a' });
            const userB = await registerAndGetToken({ email: 'b@ejemplo.com', username: 'user_b' });

            await request(app.getHttpServer())
                .post('/auth/verify-email')
                .query({ token: userA.token })
                .expect(200);

            expect(await getUserStatus(userA.email)).toBe('active');
            expect(await getUserStatus(userB.email)).toBe('pending_verification');
        });
    });
});
