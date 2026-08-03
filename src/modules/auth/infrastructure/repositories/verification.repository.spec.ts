import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { VerificationRepository } from './verification.repository';
import { VerificationSchema } from '../../../../infrastructure/database/schemas/verification.schema';

describe('VerificationRepository', () => {
    let repository: VerificationRepository;
    let ormRepo: jest.Mocked<Repository<VerificationSchema>>;

    beforeEach(async () => {
        const mockOrmRepo = {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            createQueryBuilder: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                VerificationRepository,
                { provide: getRepositoryToken(VerificationSchema), useValue: mockOrmRepo },
            ],
        }).compile();

        repository = module.get<VerificationRepository>(VerificationRepository);
        ormRepo = module.get(getRepositoryToken(VerificationSchema));
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('create', () => {
        it('crea y guarda una nueva entidad de verificación', async () => {
            const params = {
                userId: 'user-1',
                type: 'email_verification',
                token: 'a'.repeat(64),
                expiresAt: new Date(),
            };
            const entity = { ...params } as VerificationSchema;
            ormRepo.create.mockReturnValue(entity);
            ormRepo.save.mockResolvedValue(entity);

            await repository.create(params);

            expect(ormRepo.create).toHaveBeenCalledWith(params);
            expect(ormRepo.save).toHaveBeenCalledWith(entity);
        });
    });

    describe('findByToken', () => {
        it('retorna null si no encuentra el token', async () => {
            ormRepo.findOne.mockResolvedValue(null);

            const result = await repository.findByToken('token', 'email_verification');

            expect(ormRepo.findOne).toHaveBeenCalledWith({ where: { token: 'token', type: 'email_verification' } });
            expect(result).toBeNull();
        });

        it('mapea la entidad encontrada a VerificationRecord', async () => {
            const entity: VerificationSchema = {
                id: '1',
                userId: 'user-1',
                type: 'email_verification',
                token: 'a'.repeat(64),
                expiresAt: new Date('2030-01-01'),
                usedAt: null,
                attempts: 0,
                maxAttempts: 5,
                createdAt: new Date('2025-01-01'),
            };
            ormRepo.findOne.mockResolvedValue(entity);

            const result = await repository.findByToken(entity.token, entity.type);

            expect(result).toEqual({
                id: entity.id,
                userId: entity.userId,
                type: entity.type,
                token: entity.token,
                expiresAt: entity.expiresAt,
                usedAt: entity.usedAt,
                attempts: entity.attempts,
                maxAttempts: entity.maxAttempts,
                createdAt: entity.createdAt,
            });
        });
    });

    describe('markAsUsed', () => {
        it('actualiza usedAt de la fila con el id dado', async () => {
            await repository.markAsUsed('record-id-1');

            expect(ormRepo.update).toHaveBeenCalledWith('record-id-1', { usedAt: expect.any(Date) });
        });
    });

    describe('invalidatePreviousTokens', () => {
        it('marca como usados todos los tokens previos no usados del usuario y tipo dados', async () => {
            const execute = jest.fn().mockResolvedValue(undefined);
            const where = jest.fn().mockReturnValue({ execute });
            const set = jest.fn().mockReturnValue({ where });
            const update = jest.fn().mockReturnValue({ set });
            ormRepo.createQueryBuilder.mockReturnValue({ update } as never);

            await repository.invalidatePreviousTokens('user-1', 'email_verification');

            expect(update).toHaveBeenCalledWith(VerificationSchema);
            expect(set).toHaveBeenCalledWith({ usedAt: expect.any(Date) });
            expect(where).toHaveBeenCalledWith(
                'user_id = :userId AND type = :type AND used_at IS NULL',
                { userId: 'user-1', type: 'email_verification' },
            );
            expect(execute).toHaveBeenCalled();
        });
    });
});
