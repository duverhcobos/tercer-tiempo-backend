import { Test, TestingModule } from '@nestjs/testing';

import { BcryptService } from './bcrypt.service';

describe('BcryptService', () => {
    let service: BcryptService;

    const PLAIN_PASSWORD = 'Password123!'; // NOSONAR: credencial de fixture para tests, no es un secreto real

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [BcryptService],
        }).compile();

        service = module.get<BcryptService>(BcryptService);
    });

    describe('hash', () => {
        it('genera un hash distinto del password en texto plano', async () => {
            const hashed = await service.hash(PLAIN_PASSWORD);

            expect(hashed).not.toBe(PLAIN_PASSWORD);
            expect(typeof hashed).toBe('string');
        });

        it('usa bcrypt con 10 salt rounds (prefijo $2b$10$)', async () => {
            const hashed = await service.hash(PLAIN_PASSWORD);

            expect(hashed).toMatch(/^\$2[aby]\$10\$/);
        });

        it('genera hashes distintos para el mismo password (salt aleatorio)', async () => {
            const hash1 = await service.hash(PLAIN_PASSWORD);
            const hash2 = await service.hash(PLAIN_PASSWORD);

            expect(hash1).not.toBe(hash2);
        });
    });

    describe('compare', () => {
        it('retorna true cuando el password coincide con el hash', async () => {
            const hashed = await service.hash(PLAIN_PASSWORD);

            await expect(service.compare(PLAIN_PASSWORD, hashed)).resolves.toBe(true);
        });

        it('retorna false cuando el password no coincide', async () => {
            const hashed = await service.hash(PLAIN_PASSWORD);

            await expect(service.compare('OtraClave123!', hashed)).resolves.toBe(false);
        });

        it('retorna false ante un hash mal formado en vez de lanzar excepción', async () => {
            await expect(service.compare(PLAIN_PASSWORD, 'no-es-un-hash-bcrypt')).resolves.toBe(false);
        });

        it('es sensible a mayúsculas/minúsculas', async () => {
            const hashed = await service.hash(PLAIN_PASSWORD);

            await expect(service.compare(PLAIN_PASSWORD.toUpperCase(), hashed)).resolves.toBe(false);
        });
    });
});
