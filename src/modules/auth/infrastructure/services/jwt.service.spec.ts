import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

import { JwtService } from './jwt.service';

describe('JwtService', () => {
    let service: JwtService;
    let configService: jest.Mocked<ConfigService>;

    const PAYLOAD = { sub: 'user-id-123', email: 'user@ejemplo.com' };

    async function buildService(config: Record<string, string | undefined>) {
        const mockConfigService = {
            get: jest.fn((key: string) => config[key]),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                JwtService,
                { provide: ConfigService, useValue: mockConfigService },
            ],
        }).compile();

        service = module.get<JwtService>(JwtService);
        configService = module.get(ConfigService);
    }

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('generateToken', () => {
        it('genera un JWT válido de 3 partes firmado con JWT_SECRET', async () => {
            await buildService({ JWT_SECRET: 'test-secret', JWT_EXPIRES_IN: '1h' });

            const token = service.generateToken(PAYLOAD);

            expect(typeof token).toBe('string');
            expect(token.split('.')).toHaveLength(3);

            const decoded = jwt.verify(token, 'test-secret') as jwt.JwtPayload;
            expect(decoded.sub).toBe(PAYLOAD.sub);
            expect(decoded.email).toBe(PAYLOAD.email);
        });

        it('usa JWT_EXPIRES_IN de la configuración cuando está presente', async () => {
            await buildService({ JWT_SECRET: 'test-secret', JWT_EXPIRES_IN: '2h' });

            const token = service.generateToken(PAYLOAD);
            const decoded = jwt.verify(token, 'test-secret') as jwt.JwtPayload;

            const durationSeconds = decoded.exp! - decoded.iat!;
            expect(durationSeconds).toBe(2 * 60 * 60);
        });

        it('usa 24h por defecto cuando JWT_EXPIRES_IN no está configurado', async () => {
            await buildService({ JWT_SECRET: 'test-secret' });

            const token = service.generateToken(PAYLOAD);
            const decoded = jwt.verify(token, 'test-secret') as jwt.JwtPayload;

            const durationSeconds = decoded.exp! - decoded.iat!;
            expect(durationSeconds).toBe(24 * 60 * 60);
        });

        it('lanza InternalServerErrorException si JWT_SECRET no está configurado', async () => {
            await buildService({ JWT_SECRET: undefined });

            expect(() => service.generateToken(PAYLOAD)).toThrow(InternalServerErrorException);
            expect(() => service.generateToken(PAYLOAD)).toThrow(
                'JWT_SECRET is not configured in environment variables',
            );
        });

        it('lanza InternalServerErrorException si JWT_SECRET es cadena vacía', async () => {
            await buildService({ JWT_SECRET: '' });

            expect(() => service.generateToken(PAYLOAD)).toThrow(InternalServerErrorException);
        });
    });

    describe('verifyToken', () => {
        it('decodifica correctamente un token válido', async () => {
            await buildService({ JWT_SECRET: 'test-secret' });

            const token = service.generateToken(PAYLOAD);
            const decoded = service.verifyToken(token);

            expect(decoded.sub).toBe(PAYLOAD.sub);
            expect(decoded.email).toBe(PAYLOAD.email);
        });

        it('lanza error si el token fue firmado con un secret distinto', async () => {
            await buildService({ JWT_SECRET: 'test-secret' });
            const foreignToken = jwt.sign(PAYLOAD, 'otro-secret', { expiresIn: '1h' });

            expect(() => service.verifyToken(foreignToken)).toThrow(jwt.JsonWebTokenError);
        });

        it('lanza error si el token está expirado', async () => {
            await buildService({ JWT_SECRET: 'test-secret' });
            const expiredToken = jwt.sign(PAYLOAD, 'test-secret', { expiresIn: '-10s' });

            expect(() => service.verifyToken(expiredToken)).toThrow(jwt.TokenExpiredError);
        });

        it('lanza error si el token está mal formado', async () => {
            await buildService({ JWT_SECRET: 'test-secret' });

            expect(() => service.verifyToken('esto-no-es-un-jwt')).toThrow(jwt.JsonWebTokenError);
        });

        it('lanza InternalServerErrorException si JWT_SECRET no está configurado', async () => {
            await buildService({ JWT_SECRET: undefined });

            expect(() => service.verifyToken('cualquier-token')).toThrow(InternalServerErrorException);
        });
    });
});
