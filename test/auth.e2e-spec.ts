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
        }).compile();

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
        await dataSource.query('DELETE FROM "user_roles"');
        await dataSource.query('DELETE FROM "verifications"');
        await dataSource.query('DELETE FROM "user_sessions"');
        await dataSource.query('DELETE FROM "users"');
    });

    // =========================================================================
    // CATEGORÍA 1 — HAPPY PATH
    // =========================================================================

    describe('Happy Path', () => {
        it('201 — registro válido con rol PLAYER', async () => {
            const res = await request(app.getHttpServer())
                .post('/auth/register')
                .send(VALID)
                .expect(201);

            expect(res.body.email).toBe(VALID.email);
            expect(res.body.username).toBe(VALID.username);
            expect(res.body.role).toBe('PLAYER');
            expect(res.body.accessToken).toBeDefined();
            expect(typeof res.body.accessToken).toBe('string');
            expect(res.body.accessToken.split('.')).toHaveLength(3);
            expect(res.body).not.toHaveProperty('password');
            expect(res.body).not.toHaveProperty('passwordHash');
        });

        it('201 — registro válido con rol ORGANIZER', async () => {
            const res = await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: 'org@ejemplo.com', username: 'org_user', role: 'ORGANIZER' })
                .expect(201);

            expect(res.body.role).toBe('ORGANIZER');
        });

        it('201 — registro válido con rol SPECTATOR', async () => {
            const res = await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: 'spec@ejemplo.com', username: 'spec_user', role: 'SPECTATOR' })
                .expect(201);

            expect(res.body.role).toBe('SPECTATOR');
        });

        it('201 — username con underscore', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: 'under@ejemplo.com', username: 'user_name_123' })
                .expect(201);
        });

        it('201 — username exactamente 3 caracteres (mínimo)', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: 'min3@ejemplo.com', username: 'abc' })
                .expect(201);
        });

        it('201 — username exactamente 50 caracteres (máximo)', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: 'max50@ejemplo.com', username: 'abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTU12' })
                .expect(201);
        });

        it('201 — password exactamente 8 caracteres (mínimo)', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: 'minpass@ejemplo.com', username: 'minpass_u', password: 'Pass1234' })
                .expect(201);
        });

        it('201 — respuesta NO contiene campos sensibles', async () => {
            const res = await request(app.getHttpServer())
                .post('/auth/register')
                .send(VALID)
                .expect(201);

            expect(res.body).not.toHaveProperty('password');
            expect(res.body).not.toHaveProperty('passwordHash');
            expect(res.body).not.toHaveProperty('syncId');
        });
    });

    // =========================================================================
    // CATEGORÍA 2 — VALIDACIÓN DE EMAIL
    // =========================================================================

    describe('Email — validación', () => {
        it('400 — email vacío', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: '' })
                .expect(400);
        });

        it('400 — email null', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: null })
                .expect(400);
        });

        it('400 — email omitido', async () => {
            const { email: _, ...body } = VALID;
            await request(app.getHttpServer())
                .post('/auth/register')
                .send(body)
                .expect(400);
        });

        it('400 — email sin @', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: 'sinArrobajemplo.com' })
                .expect(400);
        });

        it('400 — email sin dominio', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: 'usuario@' })
                .expect(400);
        });

        it('400 — email con doble @', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: 'usuario@@ejemplo.com' })
                .expect(400);
        });

        it('400 — email con espacios', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: 'usuario @ejemplo.com' })
                .expect(400);
        });

        it('400 — email solo espacios', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: '   ' })
                .expect(400);
        });

        it('400 — email boolean', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: true })
                .expect(400);
        });

        it('400 — email number', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: 12345 })
                .expect(400);
        });

        it('400 — email array', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: ['user@ejemplo.com'] })
                .expect(400);
        });

        it('400 — email objeto', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: { value: 'user@ejemplo.com' } })
                .expect(400);
        });

        it('201 — email con subdominios', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: 'user@mail.empresa.com', username: 'subdomain_u' })
                .expect(201);
        });

        it('201 — email con múltiples puntos', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: 'user.name.test@sub.domain.ejemplo.com', username: 'multipoint_u' })
                .expect(201);
        });
    });

    // =========================================================================
    // CATEGORÍA 3 — VALIDACIÓN DE USERNAME
    // =========================================================================

    describe('Username — validación', () => {
        it('400 — username vacío', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, username: '' })
                .expect(400);
        });

        it('400 — username null', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, username: null })
                .expect(400);
        });

        it('400 — username omitido', async () => {
            const { username: _, ...body } = VALID;
            await request(app.getHttpServer())
                .post('/auth/register')
                .send(body)
                .expect(400);
        });

        it('400 — username solo espacios', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, username: '   ' })
                .expect(400);
        });

        it('400 — username 2 caracteres (mínimo - 1)', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, username: 'ab' })
                .expect(400);
        });

        it('201 — username 4 caracteres (mínimo + 1)', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: 'u4char@e.com', username: 'abcd' })
                .expect(201);
        });

        it('400 — username 51 caracteres (máximo + 1)', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, username: 'abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTU123' })
                .expect(400);
        });

        it('400 — username con espacio en medio', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, username: 'user name' })
                .expect(400);
        });

        it('400 — username con espacio al inicio', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, username: ' username' })
                .expect(400);
        });

        it('400 — username con espacio al final', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, username: 'username ' })
                .expect(400);
        });

        it('400 — username con @', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, username: 'user@name' })
                .expect(400);
        });

        it('400 — username con guion (-)', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, username: 'user-name' })
                .expect(400);
        });

        it('400 — username con punto (.)', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, username: 'user.name' })
                .expect(400);
        });

        it('400 — username con caracteres especiales (#$%&)', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, username: 'user#$%&' })
                .expect(400);
        });

        it('400 — username con emoji', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, username: 'user😀' })
                .expect(400);
        });

        it('400 — username con caracteres unicode (acentos)', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, username: 'usuárío' })
                .expect(400);
        });

        it('400 — username number (tipo incorrecto)', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, username: 123456 })
                .expect(400);
        });

        it('400 — username boolean (tipo incorrecto)', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, username: true })
                .expect(400);
        });

        it('400 — username array (tipo incorrecto)', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, username: ['validuser'] })
                .expect(400);
        });

        it('400 — username objeto (tipo incorrecto)', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, username: { value: 'validuser' } })
                .expect(400);
        });

        it('201 — username solo números', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: 'numuser@e.com', username: '12345' })
                .expect(201);
        });

        it('201 — username solo underscores', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: 'underuser@e.com', username: '___' })
                .expect(201);
        });

        it('201 — username con mayúsculas y minúsculas', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: 'mixuser@e.com', username: 'UserName123' })
                .expect(201);
        });
    });

    // =========================================================================
    // CATEGORÍA 4 — VALIDACIÓN DE PASSWORD
    // =========================================================================

    describe('Password — validación', () => {
        it('400 — password vacío', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, password: '' })
                .expect(400);
        });

        it('400 — password null', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, password: null })
                .expect(400);
        });

        it('400 — password omitido', async () => {
            const { password: _, ...body } = VALID;
            await request(app.getHttpServer())
                .post('/auth/register')
                .send(body)
                .expect(400);
        });

        it('400 — password 7 caracteres (mínimo - 1)', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, password: 'Pass123' })
                .expect(400);
        });

        it('201 — password 9 caracteres (mínimo + 1)', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: 'p9char@e.com', username: 'p9char_u', password: 'Password1' })
                .expect(201);
        });

        it('201 — password solo espacios es técnicamente válido (MinLength lo permite)', async () => {
            // class-validator: IsNotEmpty NO descarta espacios, MinLength cuenta los 8 chars
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: 'spacespass@e.com', username: 'spacespass_u', password: '        ' })
                .expect(201);
        });

        it('400 — password number (tipo incorrecto)', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, password: 12345678 })
                .expect(400);
        });

        it('400 — password boolean (tipo incorrecto)', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, password: false })
                .expect(400);
        });

        it('400 — password array (tipo incorrecto)', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, password: ['Password123'] })
                .expect(400);
        });

        it('no 500 — password extremadamente larga', async () => {
            const longPass = 'a'.repeat(1000);
            const res = await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: 'longpass@e.com', username: 'longpass_u', password: longPass });
            expect(res.status).not.toBe(500);
        });
    });

    // =========================================================================
    // CATEGORÍA 5 — VALIDACIÓN DE ROLE
    // =========================================================================

    describe('Role — validación', () => {
        it('400 — role en minúsculas (player)', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, role: 'player' })
                .expect(400);
        });

        it('400 — role mezcla de mayúsculas (Player)', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, role: 'Player' })
                .expect(400);
        });

        it('400 — role valor inexistente (ADMIN)', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, role: 'ADMIN' })
                .expect(400);
        });

        it('400 — role SUPERADMIN no permitido en registro', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, role: 'SUPERADMIN' })
                .expect(400);
        });

        it('400 — role REFEREE no permitido en registro', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, role: 'REFEREE' })
                .expect(400);
        });

        it('400 — role vacío', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, role: '' })
                .expect(400);
        });

        it('400 — role null', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, role: null })
                .expect(400);
        });

        it('400 — role omitido', async () => {
            const { role: _, ...body } = VALID;
            await request(app.getHttpServer())
                .post('/auth/register')
                .send(body)
                .expect(400);
        });

        it('400 — role number', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, role: 1 })
                .expect(400);
        });

        it('400 — role boolean', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, role: true })
                .expect(400);
        });

        it('400 — role array', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, role: ['PLAYER'] })
                .expect(400);
        });

        it('400 — role objeto', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, role: { name: 'PLAYER' } })
                .expect(400);
        });
    });

    // =========================================================================
    // CATEGORÍA 6 — ESTRUCTURA DEL BODY
    // =========================================================================

    describe('Estructura del body', () => {
        it('400 — body vacío {}', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({})
                .expect(400);
        });

        it('400 — body null', async () => {
            const res = await request(app.getHttpServer())
                .post('/auth/register')
                .set('Content-Type', 'application/json')
                .send('null');
            expect(res.status).toBe(400);
        });

        it('400 — body array vacío', async () => {
            const res = await request(app.getHttpServer())
                .post('/auth/register')
                .set('Content-Type', 'application/json')
                .send('[]');
            expect(res.status).toBe(400);
        });

        it('400 — body boolean', async () => {
            const res = await request(app.getHttpServer())
                .post('/auth/register')
                .set('Content-Type', 'application/json')
                .send('true');
            expect(res.status).toBe(400);
        });

        it('400 — body número', async () => {
            const res = await request(app.getHttpServer())
                .post('/auth/register')
                .set('Content-Type', 'application/json')
                .send('123');
            expect(res.status).toBe(400);
        });

        it('400 — múltiples campos inválidos a la vez', async () => {
            const res = await request(app.getHttpServer())
                .post('/auth/register')
                .send({ email: 'notanemail', username: 'a', password: 'short', role: 'INVALID' })
                .expect(400);

            expect(Array.isArray(res.body.message)).toBe(true);
            expect(res.body.message.length).toBeGreaterThan(1);
        });
    });

    // =========================================================================
    // CATEGORÍA 7 — CAMPOS ADICIONALES (WHITELIST)
    // =========================================================================

    describe('Whitelist — campos extra rechazados', () => {
        it('400 — campo isAdmin no permitido', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, isAdmin: true })
                .expect(400);
        });

        it('400 — campo passwordHash no permitido', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, passwordHash: '$2b$10$xxxx' })
                .expect(400);
        });

        it('400 — campo id no permitido', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, id: '00000000-0000-0000-0000-000000000001' })
                .expect(400);
        });

        it('400 — campo permissions no permitido', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, permissions: ['manage_users'] })
                .expect(400);
        });

        it('400 — campos de timestamps no permitidos', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, createdAt: '2020-01-01', updatedAt: '2020-01-01' })
                .expect(400);
        });

        it('400 — campo status no permitido', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, status: 'active' })
                .expect(400);
        });
    });

    // =========================================================================
    // CATEGORÍA 8 — SEGURIDAD
    // =========================================================================

    describe('Seguridad', () => {
        it('400 — SQL Injection en email (email inválido)', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: "'; DROP TABLE users; --@ejemplo.com" })
                .expect(400);
        });

        it('400 — SQL Injection en username (Matches filtra)', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, username: "admin'--" })
                .expect(400);
        });

        it('no 500 — SQL Injection en password (se hashea, no se ejecuta)', async () => {
            const res = await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: 'sqlpass@e.com', username: 'sqlpass_u', password: "' OR '1'='1" });
            expect(res.status).not.toBe(500);
        });

        it('400 — NoSQL Injection: email como objeto', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: { $gt: '' } })
                .expect(400);
        });

        it('400 — XSS en username (Matches filtra tags HTML)', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, username: '<script>alert(1)</script>' })
                .expect(400);
        });

        it('400 — XSS en email (IsEmail filtra)', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: '<script>alert(1)</script>@ejemplo.com' })
                .expect(400);
        });

        it('no 500 — HTML en password (se hashea, no se interpreta)', async () => {
            const res = await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: 'htmlpass@e.com', username: 'htmlpass_u', password: '<h1>Password</h1>' });
            expect(res.status).not.toBe(500);
        });

        it('400 — Command Injection en username', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, username: 'user;rm -rf /' })
                .expect(400);
        });

        it('400 — Path Traversal en username', async () => {
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, username: '../../etc/passwd' })
                .expect(400);
        });

        it('400 — username extremadamente largo (no DoS)', async () => {
            const res = await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, username: 'a'.repeat(300) });
            expect(res.status).toBe(400);
            expect(res.status).not.toBe(500);
        });
    });

    // =========================================================================
    // CATEGORÍA 9 — REGLAS DE NEGOCIO
    // =========================================================================

    describe('Reglas de negocio', () => {
        it('409 — email duplicado', async () => {
            await request(app.getHttpServer()).post('/auth/register').send(VALID).expect(201);

            const res = await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, username: 'otro_usuario' })
                .expect(409);

            expect(res.body.statusCode).toBe(409);
        });

        it('409 — username duplicado', async () => {
            await request(app.getHttpServer()).post('/auth/register').send(VALID).expect(201);

            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: 'otro@ejemplo.com' })
                .expect(409);
        });

        it('409 — email duplicado case-insensitive (índice LOWER en BD)', async () => {
            await request(app.getHttpServer()).post('/auth/register').send(VALID).expect(201);

            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: VALID.email.toUpperCase(), username: 'nuevo_user' })
                .expect(409);
        });

        it('409 — username duplicado case-insensitive (índice LOWER en BD)', async () => {
            await request(app.getHttpServer()).post('/auth/register').send(VALID).expect(201);

            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: 'nuevo@ejemplo.com', username: VALID.username.toUpperCase() })
                .expect(409);
        });

        it('201 — dos usuarios con emails distintos coexisten', async () => {
            await request(app.getHttpServer()).post('/auth/register').send(VALID).expect(201);

            await request(app.getHttpServer())
                .post('/auth/register')
                .send({ ...VALID, email: 'otro@ejemplo.com', username: 'otro_username' })
                .expect(201);
        });

        it('rol queda registrado en user_roles después del registro', async () => {
            const res = await request(app.getHttpServer())
                .post('/auth/register')
                .send(VALID)
                .expect(201);

            const [row] = await dataSource.query(
                `SELECT r.name FROM "user_roles" ur
                 JOIN "roles" r ON ur.role_id = r.id
                 WHERE ur.user_id = $1`,
                [res.body.id],
            );

            expect(row?.name).toBe('PLAYER');
        });
    });
});

// =============================================================================
// POST /auth/login (e2e)
// =============================================================================

// TODO: habilitar cuando LoginUseCase esté implementado en auth.module.ts
describe.skip('POST /auth/login (e2e)', () => {
    let app: INestApplication;
    let dataSource: DataSource;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

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
        await dataSource.query('DELETE FROM "user_roles"');
        await dataSource.query('DELETE FROM "verifications"');
        await dataSource.query('DELETE FROM "user_sessions"');
        await dataSource.query('DELETE FROM "users"');

        await request(app.getHttpServer())
            .post('/auth/register')
            .send(VALID);
    });

    it('200 — login exitoso con credenciales válidas', async () => {
        const res = await request(app.getHttpServer())
            .post('/auth/login')
            .send({ email: VALID.email, password: VALID.password })
            .expect(200);

        expect(res.body.accessToken).toBeDefined();
        expect(res.body.email).toBe(VALID.email);
        expect(res.body).not.toHaveProperty('password');
        expect(res.body.accessToken.split('.')).toHaveLength(3);
    });

    it('401 — password incorrecta', async () => {
        await request(app.getHttpServer())
            .post('/auth/login')
            .send({ email: VALID.email, password: 'WrongPassword' })
            .expect(401);
    });

    it('401 — email inexistente', async () => {
        await request(app.getHttpServer())
            .post('/auth/login')
            .send({ email: 'noexiste@ejemplo.com', password: VALID.password })
            .expect(401);
    });

    it('400 — email inválido en login', async () => {
        await request(app.getHttpServer())
            .post('/auth/login')
            .send({ email: 'notanemail', password: VALID.password })
            .expect(400);
    });

    it('200 — JWT tiene formato válido (3 partes)', async () => {
        const res = await request(app.getHttpServer())
            .post('/auth/login')
            .send({ email: VALID.email, password: VALID.password });

        const parts = res.body.accessToken.split('.');
        expect(parts).toHaveLength(3);
        expect(parts[0].length).toBeGreaterThan(0);
        expect(parts[1].length).toBeGreaterThan(0);
        expect(parts[2].length).toBeGreaterThan(0);
    });
});


