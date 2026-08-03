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

    // =========================================================
    // 1. HAPPY PATH
    // =========================================================

    describe('Happy path', () => {
        it('200 — login con credenciales válidas devuelve token y datos básicos', async () => {
            const res = await request(app.getHttpServer())
                .post('/auth/login')
                .send(ACTIVE_CREDENTIALS)
                .expect(200);

            expect(res.body).toHaveProperty('accessToken');
            expect(typeof res.body.accessToken).toBe('string');
            expect(res.body.accessToken.split('.')).toHaveLength(3);

            expect(res.body).toHaveProperty('id');
            expect(res.body).toHaveProperty('email');
            expect(res.body).toHaveProperty('username');
            expect(res.body).toHaveProperty('role', 'PLAYER');
            expect(res.body).toHaveProperty('isNewUser', false);

            const parts = res.body.accessToken.split('.');
            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

            expect(payload).toHaveProperty('sub');
            expect(payload).toHaveProperty('email');
            expect(payload).toHaveProperty('iat');
            expect(payload).toHaveProperty('exp');
            expect(payload.exp).toBeGreaterThan(payload.iat);
        });

        it('la respuesta NO expone password ni hash', async () => {
            const res = await request(app.getHttpServer())
                .post('/auth/login')
                .send(ACTIVE_CREDENTIALS)
                .expect(200);

            expect(res.body).not.toHaveProperty('password');
            expect(res.body).not.toHaveProperty('passwordHash');
            expect(res.body).not.toHaveProperty('password_hash');
        });
    });

    // =========================================================
    // 2. AUTENTICACIÓN
    // =========================================================

    describe('Autenticación', () => {
        it('401 — contraseña incorrecta', async () => {
            const res = await request(app.getHttpServer())
                .post('/auth/login')
                .send({ ...ACTIVE_CREDENTIALS, password: 'OtraClave123!' })
                .expect(401);

            expect(res.body.message).toBe('Invalid credentials');
        });

        it('401 — email no registrado', async () => {
            const res = await request(app.getHttpServer())
                .post('/auth/login')
                .send({ email: 'noexiste@ejemplo.com', password: 'Password123!' })
                .expect(401);

            expect(res.body.message).toBe('Invalid credentials');
        });

        it('el mensaje de error es idéntico para email y contraseña inválidos', async () => {
            const wrongEmail = await request(app.getHttpServer())
                .post('/auth/login')
                .send({ email: 'noexiste@ejemplo.com', password: 'Password123!' });

            const wrongPassword = await request(app.getHttpServer())
                .post('/auth/login')
                .send({ ...ACTIVE_CREDENTIALS, password: 'OtraClave123!' });

            expect(wrongEmail.body.message).toBe(wrongPassword.body.message);
            expect(wrongEmail.body.statusCode).toBe(wrongPassword.body.statusCode);
        });
    });

    // =========================================================
    // 3. ESTADOS DE CUENTA (enumeración por diferencias)
    // =========================================================

    describe('Estados de cuenta', () => {
        it('403 — cuenta pendiente de verificación', async () => {
            const pending = {
                email: 'pending@ejemplo.com',
                username: 'pending_user',
                password: 'Password123!',
                role: 'PLAYER',
            };

            await request(app.getHttpServer())
                .post('/auth/register')
                .send(pending)
                .expect(201);

            const res = await request(app.getHttpServer())
                .post('/auth/login')
                .send({ email: pending.email, password: pending.password })
                .expect(403);

            expect(res.body.message).toContain('verified');
        });

        it('403 — cuenta suspendida', async () => {
            const suspended = {
                email: 'suspended@ejemplo.com',
                username: 'suspended_user',
                password: 'Password123!',
                role: 'PLAYER',
            };

            await request(app.getHttpServer())
                .post('/auth/register')
                .send(suspended)
                .expect(201);

            await dataSource.query(
                `UPDATE "users" SET status = 'suspended' WHERE LOWER(email) = LOWER($1)`,
                [suspended.email],
            );

            const res = await request(app.getHttpServer())
                .post('/auth/login')
                .send({ email: suspended.email, password: suspended.password })
                .expect(403);

            expect(res.body.message.toLowerCase()).toContain('suspended');
        });

        it('403 — cuenta baneada', async () => {
            const banned = {
                email: 'banned@ejemplo.com',
                username: 'banned_user',
                password: 'Password123!',
                role: 'PLAYER',
            };

            await request(app.getHttpServer())
                .post('/auth/register')
                .send(banned)
                .expect(201);

            await dataSource.query(
                `UPDATE "users" SET status = 'banned' WHERE LOWER(email) = LOWER($1)`,
                [banned.email],
            );

            const res = await request(app.getHttpServer())
                .post('/auth/login')
                .send({ email: banned.email, password: banned.password })
                .expect(403);

            expect(res.body.message.toLowerCase()).toContain('banned');
        });
    });

    // =========================================================
    // 4. VALIDACIÓN DE ENTRADAS
    // =========================================================

    describe('Validación de entradas', () => {
        it('400 — email omitido', async () => {
            await request(app.getHttpServer())
                .post('/auth/login')
                .send({ password: VALID_USER.password })
                .expect(400);
        });

        it('400 — password omitido', async () => {
            await request(app.getHttpServer())
                .post('/auth/login')
                .send({ email: VALID_USER.email })
                .expect(400);
        });

        it('400 — email vacío', async () => {
            await request(app.getHttpServer())
                .post('/auth/login')
                .send({ ...ACTIVE_CREDENTIALS, email: '' })
                .expect(400);
        });

        it('400 — password vacío', async () => {
            await request(app.getHttpServer())
                .post('/auth/login')
                .send({ ...ACTIVE_CREDENTIALS, password: '' })
                .expect(400);
        });

        it('400 — email con formato inválido', async () => {
            await request(app.getHttpServer())
                .post('/auth/login')
                .send({ email: 'not-an-email', password: VALID_USER.password })
                .expect(400);
        });

        it('400 — email como número', async () => {
            await request(app.getHttpServer())
                .post('/auth/login')
                .send({ email: 12345, password: VALID_USER.password } as any)
                .expect(400);
        });

        it('400 — password como array', async () => {
            await request(app.getHttpServer())
                .post('/auth/login')
                .send({ email: VALID_USER.email, password: ['a', 'b'] } as any)
                .expect(400);
        });

        it('400 — cuerpo vacío', async () => {
            await request(app.getHttpServer())
                .post('/auth/login')
                .send({})
                .expect(400);
        });

        it('400 — campos no permitidos son rechazados', async () => {
            await request(app.getHttpServer())
                .post('/auth/login')
                .send({ ...ACTIVE_CREDENTIALS, admin: true, role: 'ADMIN' })
                .expect(400);
        });
    });

    // =========================================================
    // 5. INYECCIÓN / PAYLOADS MALICIOSOS
    // =========================================================

    describe('Inyección y payloads maliciosos', () => {
        it('400 — SQLi clásica en email es rechazada por validación de formato', async () => {
            // El payload no es un email válido, por lo que @IsEmail lo bloquea
            // antes de llegar a la capa de persistencia (defensa en profundidad).
            await request(app.getHttpServer())
                .post('/auth/login')
                .send({
                    email: "' OR '1'='1",
                    password: VALID_USER.password,
                })
                .expect(400);
        });

        it('400 — SQLi con DROP en email es rechazada por validación de formato', async () => {
            await request(app.getHttpServer())
                .post('/auth/login')
                .send({
                    email: "'; DROP TABLE \"users\"; --",
                    password: VALID_USER.password,
                })
                .expect(400);

            // La tabla sigue existiendo: la siguiente petición legítima funciona con normalidad.
            const after = await request(app.getHttpServer())
                .post('/auth/login')
                .send(ACTIVE_CREDENTIALS)
                .expect(200);

            expect(after.body).toHaveProperty('accessToken');
        });

        it('401 — SQLi en password', async () => {
            const res = await request(app.getHttpServer())
                .post('/auth/login')
                .send({
                    email: VALID_USER.email,
                    password: "' OR '1'='1",
                })
                .expect(401);

            expect(res.body.message).toBe('Invalid credentials');
        });

        it('no refleja ni ejecuta payloads XSS', async () => {
            const xss = '<script>alert(1)</script>';

            const res = await request(app.getHttpServer())
                .post('/auth/login')
                .send({
                    email: VALID_USER.email,
                    password: xss,
                })
                .expect(401);

            expect(res.body.message).toBe('Invalid credentials');
            expect(res.text).not.toContain(xss);
        });

        it('400 — Content-Type incorrecto', async () => {
            await request(app.getHttpServer())
                .post('/auth/login')
                .set('Content-Type', 'text/plain')
                .send(JSON.stringify(ACTIVE_CREDENTIALS))
                .expect(400);
        });
    });

    // =========================================================
    // 6. NORMALIZACIÓN Y CASOS ESQUINA
    // =========================================================

    describe('Normalización y casos esquina', () => {
        it('200 — login insensible a mayúsculas/minúsculas en email', async () => {
            await request(app.getHttpServer())
                .post('/auth/login')
                .send({
                    email: VALID_USER.email.toUpperCase(),
                    password: VALID_USER.password,
                })
                .expect(200);
        });

        it('200 — espacios en password se respetan literalmente', async () => {
            // Solo valida que un password con espacios no rompa el endpoint.
            await request(app.getHttpServer())
                .post('/auth/login')
                .send({
                    email: VALID_USER.email,
                    password: ' ' + VALID_USER.password,
                })
                .expect(401);
        });

        it('rechaza payloads extremadamente grandes', async () => {
            const huge = {
                email: VALID_USER.email,
                password: 'a'.repeat(20000),
            };

            const res = await request(app.getHttpServer())
                .post('/auth/login')
                .send(huge);

            expect(res.status).not.toBe(200);
        });
    });

    // =========================================================
    // 7. FIRMA DEL TOKEN (estructura)
    // =========================================================

    describe('Firma del token', () => {
        it('el accessToken es un JWT de 3 partes con expiración', async () => {
            const res = await request(app.getHttpServer())
                .post('/auth/login')
                .send(ACTIVE_CREDENTIALS)
                .expect(200);

            const token = res.body.accessToken;
            const parts = token.split('.');

            expect(parts).toHaveLength(3);

            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

            expect(payload).toHaveProperty('sub');
            expect(payload).toHaveProperty('email');
            expect(payload).toHaveProperty('iat');
            expect(payload).toHaveProperty('exp');
            expect(payload.exp).toBeGreaterThan(payload.iat);
        });
    });
});
