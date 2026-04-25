import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

describe('AuthController (e2e)', () => {
    let app: INestApplication;
    let dataSource: DataSource;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();

        // Aplicar las mismas configuraciones que en main.ts
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
        // Limpiar la base de datos antes de cada test
        await dataSource.query('DELETE FROM users');
    });

    describe('/auth/register (POST)', () => {
        it('should register a new user successfully', () => {
            return request(app.getHttpServer())
                .post('/auth/register')
                .send({
                    email: 'test@example.com',
                    password: 'Password123',
                })
                .expect(201)
                .expect((res) => {
                    expect(res.body).toHaveProperty('id');
                    expect(res.body).toHaveProperty('email', 'test@example.com');
                    expect(res.body).toHaveProperty('accessToken');
                    expect(res.body).toHaveProperty('createdAt');
                    expect(res.body).not.toHaveProperty('password');
                });
        });

        it('should return 409 when email already exists', async () => {
            // Registrar usuario primero
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({
                    email: 'test@example.com',
                    password: 'Password123',
                });

            // Intentar registrar de nuevo
            return request(app.getHttpServer())
                .post('/auth/register')
                .send({
                    email: 'test@example.com',
                    password: 'Password123',
                })
                .expect(409)
                .expect((res) => {
                    expect(res.body.message).toContain('ya existe');
                });
        });

        it('should return 400 when email is invalid', () => {
            return request(app.getHttpServer())
                .post('/auth/register')
                .send({
                    email: 'invalid-email',
                    password: 'Password123',
                })
                .expect(400);
        });

        it('should return 400 when password is too short', () => {
            return request(app.getHttpServer())
                .post('/auth/register')
                .send({
                    email: 'test@example.com',
                    password: '123',
                })
                .expect(400);
        });

        it('should return 400 when email is missing', () => {
            return request(app.getHttpServer())
                .post('/auth/register')
                .send({
                    password: 'Password123',
                })
                .expect(400);
        });

        it('should return 400 when password is missing', () => {
            return request(app.getHttpServer())
                .post('/auth/register')
                .send({
                    email: 'test@example.com',
                })
                .expect(400);
        });
    });

    describe('/auth/login (POST)', () => {
        beforeEach(async () => {
            // Registrar un usuario para los tests de login
            await request(app.getHttpServer())
                .post('/auth/register')
                .send({
                    email: 'test@example.com',
                    password: 'Password123',
                });
        });

        it('should login successfully with valid credentials', () => {
            return request(app.getHttpServer())
                .post('/auth/login')
                .send({
                    email: 'test@example.com',
                    password: 'Password123',
                })
                .expect(200)
                .expect((res) => {
                    expect(res.body).toHaveProperty('id');
                    expect(res.body).toHaveProperty('email', 'test@example.com');
                    expect(res.body).toHaveProperty('accessToken');
                    expect(res.body).toHaveProperty('createdAt');
                    expect(res.body).not.toHaveProperty('password');
                });
        });

        it('should return 401 with invalid password', () => {
            return request(app.getHttpServer())
                .post('/auth/login')
                .send({
                    email: 'test@example.com',
                    password: 'WrongPassword',
                })
                .expect(401)
                .expect((res) => {
                    expect(res.body.message).toContain('inválidas');
                });
        });

        it('should return 401 with non-existent email', () => {
            return request(app.getHttpServer())
                .post('/auth/login')
                .send({
                    email: 'nonexistent@example.com',
                    password: 'Password123',
                })
                .expect(401);
        });

        it('should return 400 when email is invalid', () => {
            return request(app.getHttpServer())
                .post('/auth/login')
                .send({
                    email: 'invalid-email',
                    password: 'Password123',
                })
                .expect(400);
        });

        it('should return valid JWT token', async () => {
            const response = await request(app.getHttpServer())
                .post('/auth/login')
                .send({
                    email: 'test@example.com',
                    password: 'Password123',
                });

            expect(response.body.accessToken).toBeDefined();
            expect(typeof response.body.accessToken).toBe('string');
            expect(response.body.accessToken.split('.')).toHaveLength(3); // JWT format
        });
    });
});
