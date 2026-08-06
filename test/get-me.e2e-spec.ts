/// <reference types="jest" />

// Nota: /auth/me no tiene @Throttle propio, pero el helper registerUser() llama a
// POST /auth/register (3 req / 60s), así que igual se mockea el ThrottlerGuard.
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
    email: 'me.test@ejemplo.com',
    username: 'me_test',
    password: 'Password123!', // NOSONAR: credencial de fixture para tests, no es un secreto real
    role: 'PLAYER',
};

describe('GET /auth/me (e2e) — seguridad', () => {
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

    async function setUserStatus(email: string, status: 'pending_verification' | 'active' | 'suspended' | 'banned') {
        await dataSource.query(
            `UPDATE "users" SET status = $1 WHERE LOWER(email) = LOWER($2)`,
            [status, email],
        );
    }

    async function softDeleteUser(email: string) {
        await dataSource.query(
            `UPDATE "users" SET deleted_at = NOW() WHERE LOWER(email) = LOWER($1)`,
            [email],
        );
    }

    function authHeader(token: string) {
        return { Authorization: `Bearer ${token}` };
    }

    // =========================================================
    // 1. HAPPY PATH
    // =========================================================

    describe('Happy path', () => {
        it('200 — devuelve el perfil del usuario autenticado', async () => {
            const { id, email, accessToken } = await registerUser();

            const res = await request(app.getHttpServer())
                .get('/auth/me')
                .set(authHeader(accessToken))
                .expect(200);

            expect(res.body).toMatchObject({
                id,
                email,
                username: VALID_USER.username,
                role: VALID_USER.role,
                status: 'pending_verification',
                profileComplete: false,
            });
            expect(res.body).toHaveProperty('createdAt');
        });

        it('la respuesta nunca incluye el password hash ni otros campos sensibles', async () => {
            const { accessToken } = await registerUser();

            const res = await request(app.getHttpServer())
                .get('/auth/me')
                .set(authHeader(accessToken))
                .expect(200);

            expect(res.body).not.toHaveProperty('password');
            expect(res.body).not.toHaveProperty('passwordHash');
            expect(res.body).not.toHaveProperty('password_hash');
        });
    });

    // =========================================================
    // 2. AUTENTICACIÓN: ausencia / formato inválido del token
    // =========================================================

    describe('Autenticación requerida', () => {
        it('401 — sin header Authorization', async () => {
            await request(app.getHttpServer())
                .get('/auth/me')
                .expect(401);
        });

        it('401 — header Authorization sin el prefijo "Bearer "', async () => {
            const { accessToken } = await registerUser();

            await request(app.getHttpServer())
                .get('/auth/me')
                .set({ Authorization: accessToken })
                .expect(401);
        });

        it('401 — token con formato inválido (no es un JWT)', async () => {
            await request(app.getHttpServer())
                .get('/auth/me')
                .set(authHeader('esto-no-es-un-jwt'))
                .expect(401);
        });

        it('401 — token vacío', async () => {
            await request(app.getHttpServer())
                .get('/auth/me')
                .set(authHeader(''))
                .expect(401);
        });
    });

    // =========================================================
    // 3. MANIPULACIÓN / FALSIFICACIÓN DE TOKEN
    // =========================================================

    describe('Manipulación de token', () => {
        it('401 — token firmado con un secreto distinto es rechazado', async () => {
            const { id } = await registerUser();

            const forgedToken = jwt.sign(
                { sub: id, email: VALID_USER.email },
                'un-secreto-distinto-al-configurado',
                { expiresIn: '1h' },
            );

            await request(app.getHttpServer())
                .get('/auth/me')
                .set(authHeader(forgedToken))
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
                .get('/auth/me')
                .set(authHeader(expiredToken))
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
                .get('/auth/me')
                .set(authHeader(token))
                .expect(401);
        });

        it('401 — token con algoritmo "none" es rechazado (protección de jsonwebtoken)', async () => {
            const { id } = await registerUser();

            // Construye manualmente un JWT con alg "none" y sin firma.
            const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
            const body = Buffer.from(JSON.stringify({ sub: id, email: VALID_USER.email })).toString('base64url');
            const noneToken = `${header}.${body}.`;

            await request(app.getHttpServer())
                .get('/auth/me')
                .set(authHeader(noneToken))
                .expect(401);
        });
    });

    // =========================================================
    // 4. CICLO DE VIDA DEL USUARIO
    // =========================================================

    describe('Ciclo de vida del usuario', () => {
        it('401 — el token deja de servir si el usuario fue eliminado (soft delete) después de emitirlo', async () => {
            const { email, accessToken } = await registerUser();
            await softDeleteUser(email);

            const res = await request(app.getHttpServer())
                .get('/auth/me')
                .set(authHeader(accessToken))
                .expect(401);

            expect(res.body.message).toMatch(/no longer exists/i);
        });

        it('200 — un usuario suspendido puede seguir viendo su propio estado en /me', async () => {
            const { accessToken, email } = await registerUser();
            await setUserStatus(email, 'suspended');

            const res = await request(app.getHttpServer())
                .get('/auth/me')
                .set(authHeader(accessToken))
                .expect(200);

            expect(res.body.status).toBe('suspended');
        });

        it('200 — profileComplete refleja si existe un user_profile asociado', async () => {
            const { accessToken, id } = await registerUser();

            await dataSource.query(
                `INSERT INTO "user_profiles" (user_id, first_name_1, last_name_1, birth_date, gender, country_id)
                 SELECT $1, 'Test', 'User', '2000-01-01', 'M', code FROM "countries" LIMIT 1`,
                [id],
            );

            const res = await request(app.getHttpServer())
                .get('/auth/me')
                .set(authHeader(accessToken))
                .expect(200);

            expect(res.body.profileComplete).toBe(true);
        });
    });

    // =========================================================
    // 5. AISLAMIENTO ENTRE USUARIOS
    // =========================================================

    describe('Aislamiento entre usuarios', () => {
        it('cada token solo devuelve el perfil de su propio dueño', async () => {
            const userA = await registerUser({ email: 'a.me@ejemplo.com', username: 'a_me' });
            const userB = await registerUser({ email: 'b.me@ejemplo.com', username: 'b_me' });

            const resA = await request(app.getHttpServer())
                .get('/auth/me')
                .set(authHeader(userA.accessToken))
                .expect(200);

            const resB = await request(app.getHttpServer())
                .get('/auth/me')
                .set(authHeader(userB.accessToken))
                .expect(200);

            expect(resA.body.id).toBe(userA.id);
            expect(resB.body.id).toBe(userB.id);
            expect(resA.body.id).not.toBe(resB.body.id);
        });

        it('no es posible pedir el perfil de otro usuario aunque se conozca su id (sin query/param de id)', async () => {
            const userA = await registerUser({ email: 'a2.me@ejemplo.com', username: 'a2_me' });
            const userB = await registerUser({ email: 'b2.me@ejemplo.com', username: 'b2_me' });

            // El endpoint no acepta ningún id externo: siempre usa el "sub" del JWT.
            const res = await request(app.getHttpServer())
                .get('/auth/me')
                .query({ id: userB.id, userId: userB.id })
                .set(authHeader(userA.accessToken))
                .expect(200);

            expect(res.body.id).toBe(userA.id);
            expect(res.body.id).not.toBe(userB.id);
        });
    });
});
