/// <reference types="jest" />

// Nota: Throttling se mockea para permitir la ejecución de la suite.
// En producción el endpoint tiene @Throttle 3 req / 5 min.
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
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { EMAIL_NOTIFICATION_SERVICE } from '../src/modules/auth/infrastructure/services/email-notification.service';

import { mockEmailNotificationService } from './mocks/email-notification.service.mock';

const request = (server: App) => supertest(server);

const VALID_USER = {
    email: 'resend.test@ejemplo.com',
    username: 'resend_test',
    password: 'Password123!', // NOSONAR: credencial de fixture para tests, no es un secreto real
    role: 'PLAYER',
};

const GENERIC_MESSAGE = 'If the email exists and is unverified, a new code has been sent';

describe('POST /auth/resend-verification (e2e) — seguridad', () => {
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

    async function registerUser(overrides: Partial<typeof VALID_USER> = {}) {
        const payload = { ...VALID_USER, ...overrides };
        await request(app.getHttpServer())
            .post('/auth/register')
            .send(payload)
            .expect(201);
        return payload;
    }

    async function setUserStatus(email: string, status: 'pending_verification' | 'active' | 'suspended' | 'banned') {
        await dataSource.query(
            `UPDATE "users" SET status = $1 WHERE LOWER(email) = LOWER($2)`,
            [status, email],
        );
    }

    async function getUserStatus(email: string): Promise<string> {
        const rows = await dataSource.query(`SELECT status FROM "users" WHERE LOWER(email) = LOWER($1)`, [email]);
        return rows[0]?.status;
    }

    /** Devuelve el token de verificación más reciente (no usado o no) para un email. */
    async function getLatestToken(email: string): Promise<{ token: string; usedAt: string | null }> {
        const rows = await dataSource.query(
            `SELECT v.token, v.used_at
             FROM "verifications" v
             JOIN "users" u ON u.id = v.user_id
             WHERE u.email = $1 AND v.type = 'email_verification'
             ORDER BY v.created_at DESC
             LIMIT 1`,
            [email],
        );
        return { token: rows[0]?.token, usedAt: rows[0]?.used_at };
    }

    async function countTokens(email: string): Promise<number> {
        const rows = await dataSource.query(
            `SELECT COUNT(*)::int AS count
             FROM "verifications" v
             JOIN "users" u ON u.id = v.user_id
             WHERE u.email = $1 AND v.type = 'email_verification'`,
            [email],
        );
        return rows[0].count;
    }

    // =========================================================
    // 1. ENUMERACIÓN DE USUARIOS (hallazgo crítico)
    // =========================================================
    // El comentario en auth.service.ts afirma "Siempre responde con el mismo
    // mensaje para no enumerar si el email existe", pero el use-case lanza
    // EmailAlreadyVerifiedException (409) SOLO cuando el email existe Y está
    // 'active'. Un atacante puede usar el código de estado (200 vs 409) para
    // enumerar cuentas ya verificadas.

    describe('Enumeración de usuarios vía código de respuesta', () => {
        it('200 con mensaje genérico si el email NO existe', async () => {
            const res = await request(app.getHttpServer())
                .post('/auth/resend-verification')
                .send({ email: 'no.existe@ejemplo.com' })
                .expect(200);

            expect(res.body).toEqual({ message: GENERIC_MESSAGE });
        });

        it('200 con mensaje genérico si el email existe y está pendiente de verificar', async () => {
            const { email } = await registerUser();

            const res = await request(app.getHttpServer())
                .post('/auth/resend-verification')
                .send({ email })
                .expect(200);

            expect(res.body).toEqual({ message: GENERIC_MESSAGE });
        });

        it('[VULNERABILIDAD] 409 cuando el email existe y ya está verificado — permite enumerar cuentas activas', async () => {
            const { email } = await registerUser();
            await setUserStatus(email, 'active');

            const res = await request(app.getHttpServer())
                .post('/auth/resend-verification')
                .send({ email })
                .expect(409);

            // El status code y el mensaje difieren de la respuesta genérica (200),
            // filtrando que ese email SÍ existe y SÍ está verificado.
            expect(res.body.message).toMatch(/already verified/i);
        });

        it('[VULNERABILIDAD] un atacante puede distinguir "no existe" de "existe y verificado" probando ambos casos', async () => {
            const { email: verifiedEmail } = await registerUser({
                email: 'verified.enum@ejemplo.com',
                username: 'verified_enum',
            });
            await setUserStatus(verifiedEmail, 'active');

            const resUnknown = await request(app.getHttpServer())
                .post('/auth/resend-verification')
                .send({ email: 'unknown.enum@ejemplo.com' });

            const resVerified = await request(app.getHttpServer())
                .post('/auth/resend-verification')
                .send({ email: verifiedEmail });

            expect(resUnknown.status).toBe(200);
            expect(resVerified.status).toBe(409);
            expect(resUnknown.status).not.toBe(resVerified.status);
        });
    });

    // =========================================================
    // 2. ESCALADA DE PRIVILEGIOS: reactivación de cuentas
    //    suspendidas/banneadas (hallazgo crítico)
    // =========================================================
    // resend-verification solo bloquea si status === 'active'. Para
    // 'suspended' o 'banned' continúa y emite un token válido. Luego
    // verify-email hace updateStatus(userId, 'active') sin comprobar el
    // estado previo, permitiendo que el propio usuario se reactive.

    describe('[VULNERABILIDAD] Escalada de privilegios vía suspensión/ban', () => {
        it('un usuario SUSPENDIDO puede pedir un nuevo token y reactivarse a sí mismo', async () => {
            const { email } = await registerUser({
                email: 'suspended.bypass@ejemplo.com',
                username: 'suspended_bypass',
            });
            await setUserStatus(email, 'suspended');

            // 1. Pide un nuevo token de verificación estando suspendido.
            await request(app.getHttpServer())
                .post('/auth/resend-verification')
                .send({ email })
                .expect(200);

            const { token } = await getLatestToken(email);
            expect(token).toBeTruthy();

            // 2. Usa el token para "verificar" su email.
            const verifyRes = await request(app.getHttpServer())
                .post('/auth/verify-email')
                .query({ token })
                .expect(200);

            expect(verifyRes.body).toEqual({ message: 'Email verified successfully' });

            // 3. La cuenta quedó 'active' de nuevo, saltándose la suspensión.
            expect(await getUserStatus(email)).toBe('active');
        });

        it('un usuario BANNEADO puede pedir un nuevo token y reactivarse a sí mismo', async () => {
            const { email } = await registerUser({
                email: 'banned.bypass@ejemplo.com',
                username: 'banned_bypass',
            });
            await setUserStatus(email, 'banned');

            await request(app.getHttpServer())
                .post('/auth/resend-verification')
                .send({ email })
                .expect(200);

            const { token } = await getLatestToken(email);

            await request(app.getHttpServer())
                .post('/auth/verify-email')
                .query({ token })
                .expect(200);

            expect(await getUserStatus(email)).toBe('active');
        });
    });

    // =========================================================
    // 3. INVALIDACIÓN DE TOKENS ANTERIORES
    // =========================================================

    describe('Invalidación de tokens anteriores', () => {
        it('el token anterior deja de ser válido tras pedir uno nuevo', async () => {
            const { email } = await registerUser();
            const { token: oldToken } = await getLatestToken(email);

            await request(app.getHttpServer())
                .post('/auth/resend-verification')
                .send({ email })
                .expect(200);

            const { token: newToken, usedAt } = await getLatestToken(email);

            expect(newToken).not.toBe(oldToken);
            expect(usedAt).toBeNull();

            // El token viejo ya no debe servir para verificar la cuenta.
            const res = await request(app.getHttpServer())
                .post('/auth/verify-email')
                .query({ token: oldToken })
                .expect(400);

            expect(res.body.message).toMatch(/invalid|already been used/i);
            expect(await getUserStatus(email)).toBe('pending_verification');
        });

        it('el nuevo token sí permite verificar la cuenta', async () => {
            const { email } = await registerUser();

            await request(app.getHttpServer())
                .post('/auth/resend-verification')
                .send({ email })
                .expect(200);

            const { token } = await getLatestToken(email);

            await request(app.getHttpServer())
                .post('/auth/verify-email')
                .query({ token })
                .expect(200);

            expect(await getUserStatus(email)).toBe('active');
        });

        it('llamadas repetidas generan un token distinto cada vez (no hay token fijo reutilizable)', async () => {
            const { email } = await registerUser();

            await request(app.getHttpServer())
                .post('/auth/resend-verification')
                .send({ email })
                .expect(200);
            const { token: token1 } = await getLatestToken(email);

            await request(app.getHttpServer())
                .post('/auth/resend-verification')
                .send({ email })
                .expect(200);
            const { token: token2 } = await getLatestToken(email);

            expect(token1).not.toBe(token2);
            expect(await countTokens(email)).toBeGreaterThanOrEqual(3); // registro + 2 resends
        });
    });

    // =========================================================
    // 4. VALIDACIÓN DE ENTRADA / INTENTOS DE INYECCIÓN
    // =========================================================

    describe('Validación de entrada', () => {
        it('400 — email omitido', async () => {
            const res = await request(app.getHttpServer())
                .post('/auth/resend-verification')
                .send({})
                .expect(400);

            expect(res.body.message).toEqual(
                expect.arrayContaining([expect.stringContaining('email')]),
            );
        });

        it('400 — email vacío', async () => {
            await request(app.getHttpServer())
                .post('/auth/resend-verification')
                .send({ email: '' })
                .expect(400);
        });

        it('400 — formato de email inválido', async () => {
            await request(app.getHttpServer())
                .post('/auth/resend-verification')
                .send({ email: 'no-es-un-email' })
                .expect(400);
        });

        it('400 — email enviado como array (bypass de tipo)', async () => {
            await request(app.getHttpServer())
                .post('/auth/resend-verification')
                .send({ email: ['a@ejemplo.com', 'b@ejemplo.com'] })
                .expect(400);
        });

        it('400 — payload de SQLi en el campo email es rechazado por @IsEmail antes de tocar la BD', async () => {
            const { email } = await registerUser();

            await request(app.getHttpServer())
                .post('/auth/resend-verification')
                .send({ email: "' OR '1'='1" })
                .expect(400);

            // No debe haberse generado ningún token adicional por el intento.
            expect(await countTokens(email)).toBe(1);
        });

        it('400 — campos extra no declarados en el DTO son rechazados (whitelist)', async () => {
            const { email } = await registerUser();

            await request(app.getHttpServer())
                .post('/auth/resend-verification')
                .send({ email, role: 'SUPERADMIN', status: 'active' })
                .expect(400);

            // El intento de mass-assignment no debe haber tenido efecto.
            expect(await getUserStatus(email)).toBe('pending_verification');
        });
    });

    // =========================================================
    // 5. FUGA DE INFORMACIÓN EN LA RESPUESTA
    // =========================================================

    describe('Fuga de información en la respuesta', () => {
        it('la respuesta exitosa no incluye datos del usuario ni el token generado', async () => {
            const { email } = await registerUser();

            const res = await request(app.getHttpServer())
                .post('/auth/resend-verification')
                .send({ email })
                .expect(200);

            expect(Object.keys(res.body)).toEqual(['message']);
            const { token } = await getLatestToken(email);
            expect(JSON.stringify(res.body)).not.toContain(token);
        });
    });

    // =========================================================
    // 6. NORMALIZACIÓN DE EMAIL (case-insensitive, sin bypass)
    // =========================================================

    describe('Normalización de email', () => {
        it('el lookup es case-insensitive: mayúsculas siguen resolviendo al mismo usuario', async () => {
            const { email } = await registerUser({
                email: 'case.test@ejemplo.com',
                username: 'case_test',
            });

            await request(app.getHttpServer())
                .post('/auth/resend-verification')
                .send({ email: email.toUpperCase() })
                .expect(200);

            // Se generó un nuevo token para el usuario real (no se creó ninguno "fantasma").
            expect(await countTokens(email)).toBe(2);
        });
    });
});
