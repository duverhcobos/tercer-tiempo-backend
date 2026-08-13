import { Test, TestingModule } from '@nestjs/testing';

import { User } from '../../domain/entities/user.entity';
import { UserRole } from '../../domain/enums/user-role.enum';
import { EmailAlreadyVerifiedException } from '../../domain/exceptions/email-already-verified.exception';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import {
    CreateVerificationParams,
    IVerificationRepository,
    VERIFICATION_REPOSITORY,
} from '../../domain/repositories/verification.repository.interface';
import {
    EMAIL_NOTIFICATION_SERVICE,
    IEmailNotificationService,
} from '../../infrastructure/services/email-notification.service';

import { ResendVerificationUseCase } from './resend-verification.use-case';

describe('ResendVerificationUseCase', () => {
    let useCase: ResendVerificationUseCase;
    let userRepository: jest.Mocked<IUserRepository>;
    let verificationRepository: jest.Mocked<IVerificationRepository>;
    let emailService: jest.Mocked<IEmailNotificationService>;

    const EMAIL = 'jugador@ejemplo.com';

    function buildUser(status: string): User {
        return new User(
            '123e4567-e89b-12d3-a456-426614174000',
            EMAIL,
            'jugador_10',
            'hashed_password',
            status,
            new Date(),
            new Date(),
            UserRole.PLAYER,
        );
    }

    beforeEach(async () => {
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

        const mockVerificationRepository = {
            create: jest.fn(),
            findByToken: jest.fn(),
            markAsUsed: jest.fn(),
            invalidatePreviousTokens: jest.fn(),
        };

        const mockEmailService = {
            sendVerificationEmail: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ResendVerificationUseCase,
                { provide: USER_REPOSITORY, useValue: mockUserRepository },
                { provide: VERIFICATION_REPOSITORY, useValue: mockVerificationRepository },
                { provide: EMAIL_NOTIFICATION_SERVICE, useValue: mockEmailService },
            ],
        }).compile();

        useCase = module.get<ResendVerificationUseCase>(ResendVerificationUseCase);
        userRepository = module.get(USER_REPOSITORY);
        verificationRepository = module.get(VERIFICATION_REPOSITORY);
        emailService = module.get(EMAIL_NOTIFICATION_SERVICE);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('execute', () => {
        it('no hace nada (sin error) si el email no existe, para no enumerar usuarios', async () => {
            userRepository.findByEmail.mockResolvedValue(null);

            await expect(useCase.execute(EMAIL)).resolves.toBeUndefined();
            // eslint-disable-next-line @typescript-eslint/unbound-method -- falso positivo: jest.Mocked<T> no usa `this`
            expect(verificationRepository.invalidatePreviousTokens).not.toHaveBeenCalled();
            // eslint-disable-next-line @typescript-eslint/unbound-method -- falso positivo: jest.Mocked<T> no usa `this`
            expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
        });

        it('lanza EmailAlreadyVerifiedException si la cuenta ya está activa', async () => {
            userRepository.findByEmail.mockResolvedValue(buildUser('active'));

            await expect(useCase.execute(EMAIL)).rejects.toThrow(EmailAlreadyVerifiedException);
            // eslint-disable-next-line @typescript-eslint/unbound-method -- falso positivo: jest.Mocked<T> no usa `this`
            expect(verificationRepository.invalidatePreviousTokens).not.toHaveBeenCalled();
            // eslint-disable-next-line @typescript-eslint/unbound-method -- falso positivo: jest.Mocked<T> no usa `this`
            expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
        });

        it('invalida tokens previos, crea uno nuevo y envía el email cuando la cuenta está pendiente', async () => {
            const user = buildUser('pending_verification');
            userRepository.findByEmail.mockResolvedValue(user);

            await useCase.execute(EMAIL);

            // eslint-disable-next-line @typescript-eslint/unbound-method -- falso positivo: jest.Mocked<T> no usa `this`
            expect(verificationRepository.invalidatePreviousTokens).toHaveBeenCalledWith(
                user.id,
                'email_verification',
            );

            const [createCall] = verificationRepository.create.mock.calls[0] as [CreateVerificationParams];
            expect(createCall.userId).toBe(user.id);
            expect(createCall.type).toBe('email_verification');
            expect(typeof createCall.token).toBe('string');
            expect(createCall.expiresAt).toBeInstanceOf(Date);

            const [emailCall] = emailService.sendVerificationEmail.mock.calls[0] as [{ to: string }];
            expect(emailCall.to).toBe(user.email);
        });

        it('genera un token nuevo de 64 caracteres hexadecimales', async () => {
            userRepository.findByEmail.mockResolvedValue(buildUser('pending_verification'));

            await useCase.execute(EMAIL);

            const [createCall] = verificationRepository.create.mock.calls[0] as [CreateVerificationParams];
            expect(createCall.token).toMatch(/^[0-9a-f]{64}$/);
        });

        it('fija la expiración del token en 24 horas', async () => {
            const now = Date.now();
            userRepository.findByEmail.mockResolvedValue(buildUser('pending_verification'));

            await useCase.execute(EMAIL);

            const [createCall] = verificationRepository.create.mock.calls[0] as [CreateVerificationParams];
            const diffHours = (createCall.expiresAt.getTime() - now) / (1000 * 60 * 60);
            // `now` se captura antes de invocar execute(), así que expiresAt siempre queda
            // unos milisegundos por encima de +24h exactas; se usa un margen de tolerancia.
            expect(diffHours).toBeGreaterThan(23.9);
            expect(diffHours).toBeLessThanOrEqual(24.01);
        });
    });
});
