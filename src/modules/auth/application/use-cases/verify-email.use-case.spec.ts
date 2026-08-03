import { Test, TestingModule } from '@nestjs/testing';
import { VerifyEmailUseCase } from './verify-email.use-case';
import {
    IVerificationRepository,
    VERIFICATION_REPOSITORY,
    VerificationRecord,
} from '../../domain/repositories/verification.repository.interface';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import { VerificationTokenInvalidException } from '../../domain/exceptions/verification-token-invalid.exception';
import { VerificationTokenExpiredException } from '../../domain/exceptions/verification-token-expired.exception';

describe('VerifyEmailUseCase', () => {
    let useCase: VerifyEmailUseCase;
    let verificationRepository: jest.Mocked<IVerificationRepository>;
    let userRepository: jest.Mocked<IUserRepository>;

    const TOKEN = 'a'.repeat(64);

    function buildRecord(overrides: Partial<VerificationRecord> = {}): VerificationRecord {
        return {
            id: '1',
            userId: 'user-id-123',
            type: 'email_verification',
            token: TOKEN,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000), // vence en 1 hora
            usedAt: null,
            attempts: 0,
            maxAttempts: 5,
            createdAt: new Date(),
            ...overrides,
        };
    }

    beforeEach(async () => {
        const mockVerificationRepository = {
            create: jest.fn(),
            findByToken: jest.fn(),
            markAsUsed: jest.fn(),
            invalidatePreviousTokens: jest.fn(),
        };

        const mockUserRepository = {
            findByEmail: jest.fn(),
            findByUsername: jest.fn(),
            findById: jest.fn(),
            findByEmailWithRole: jest.fn(),
            registerWithRole: jest.fn(),
            updateLastLoginAt: jest.fn(),
            updateStatus: jest.fn(),
            hasProfile: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                VerifyEmailUseCase,
                { provide: VERIFICATION_REPOSITORY, useValue: mockVerificationRepository },
                { provide: USER_REPOSITORY, useValue: mockUserRepository },
            ],
        }).compile();

        useCase = module.get<VerifyEmailUseCase>(VerifyEmailUseCase);
        verificationRepository = module.get(VERIFICATION_REPOSITORY);
        userRepository = module.get(USER_REPOSITORY);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('execute', () => {
        it('verifica la cuenta cuando el token es válido, sin usar y no expirado', async () => {
            const record = buildRecord();
            verificationRepository.findByToken.mockResolvedValue(record);

            await useCase.execute(TOKEN);

            expect(verificationRepository.findByToken).toHaveBeenCalledWith(TOKEN, 'email_verification');
            expect(verificationRepository.markAsUsed).toHaveBeenCalledWith(record.id);
            expect(userRepository.updateStatus).toHaveBeenCalledWith(record.userId, 'active');
        });

        it('lanza VerificationTokenInvalidException si el token no existe', async () => {
            verificationRepository.findByToken.mockResolvedValue(null);

            await expect(useCase.execute(TOKEN)).rejects.toThrow(VerificationTokenInvalidException);
            expect(verificationRepository.markAsUsed).not.toHaveBeenCalled();
            expect(userRepository.updateStatus).not.toHaveBeenCalled();
        });

        it('lanza VerificationTokenInvalidException si el token ya fue usado', async () => {
            const record = buildRecord({ usedAt: new Date() });
            verificationRepository.findByToken.mockResolvedValue(record);

            await expect(useCase.execute(TOKEN)).rejects.toThrow(VerificationTokenInvalidException);
            expect(verificationRepository.markAsUsed).not.toHaveBeenCalled();
            expect(userRepository.updateStatus).not.toHaveBeenCalled();
        });

        it('lanza VerificationTokenExpiredException si el token está expirado', async () => {
            const record = buildRecord({ expiresAt: new Date(Date.now() - 1000) });
            verificationRepository.findByToken.mockResolvedValue(record);

            await expect(useCase.execute(TOKEN)).rejects.toThrow(VerificationTokenExpiredException);
            expect(verificationRepository.markAsUsed).not.toHaveBeenCalled();
            expect(userRepository.updateStatus).not.toHaveBeenCalled();
        });

        it('no activa la cuenta si markAsUsed o updateStatus no se llegan a ejecutar', async () => {
            verificationRepository.findByToken.mockResolvedValue(null);

            await expect(useCase.execute(TOKEN)).rejects.toThrow();
            expect(userRepository.updateStatus).not.toHaveBeenCalled();
        });
    });
});
