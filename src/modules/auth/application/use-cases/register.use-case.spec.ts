import { Test, TestingModule } from '@nestjs/testing';
import { RegisterUseCase } from './register.use-case';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import {
    IVerificationRepository,
    VERIFICATION_REPOSITORY,
} from '../../domain/repositories/verification.repository.interface';
import {
    EMAIL_NOTIFICATION_SERVICE,
    IEmailNotificationService,
} from '../../infrastructure/services/email-notification.service';
import { BcryptService } from '../../infrastructure/services/bcrypt.service';
import { UserAlreadyExistsException } from '../../domain/exceptions/user-already-exists.exception';
import { UsernameAlreadyExistsException } from '../../domain/exceptions/username-already-exists.exception';
import { User } from '../../domain/entities/user.entity';
import { UserRole } from '../../domain/enums/user-role.enum';

describe('RegisterUseCase', () => {
    let useCase: RegisterUseCase;
    let userRepository: jest.Mocked<IUserRepository>;
    let verificationRepository: jest.Mocked<IVerificationRepository>;
    let emailService: jest.Mocked<IEmailNotificationService>;
    let bcryptService: jest.Mocked<BcryptService>;

    const COMMAND = {
        email: 'test@example.com',
        username: 'test_user',
        password: 'Password123!', // NOSONAR: credencial de fixture para tests, no es un secreto real
        role: UserRole.PLAYER,
    };
    const HASHED_PASSWORD = 'hashed_password_123';

    function buildSavedUser(): User {
        return new User(
            '123e4567-e89b-12d3-a456-426614174000',
            COMMAND.email,
            COMMAND.username,
            HASHED_PASSWORD,
            'pending_verification',
            new Date(),
            new Date(),
            COMMAND.role,
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

        const mockBcryptService = {
            hash: jest.fn(),
            compare: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RegisterUseCase,
                { provide: USER_REPOSITORY, useValue: mockUserRepository },
                { provide: VERIFICATION_REPOSITORY, useValue: mockVerificationRepository },
                { provide: EMAIL_NOTIFICATION_SERVICE, useValue: mockEmailService },
                { provide: BcryptService, useValue: mockBcryptService },
            ],
        }).compile();

        useCase = module.get<RegisterUseCase>(RegisterUseCase);
        userRepository = module.get(USER_REPOSITORY);
        verificationRepository = module.get(VERIFICATION_REPOSITORY);
        emailService = module.get(EMAIL_NOTIFICATION_SERVICE);
        bcryptService = module.get(BcryptService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('execute', () => {
        it('registra un usuario nuevo correctamente', async () => {
            userRepository.findByEmail.mockResolvedValue(null);
            userRepository.findByUsername.mockResolvedValue(null);
            bcryptService.hash.mockResolvedValue(HASHED_PASSWORD);
            userRepository.registerWithRole.mockResolvedValue(buildSavedUser());
            verificationRepository.create.mockResolvedValue(undefined);
            emailService.sendVerificationEmail.mockResolvedValue(undefined);

            const result = await useCase.execute(COMMAND);

            expect(userRepository.findByEmail).toHaveBeenCalledWith(COMMAND.email);
            expect(userRepository.findByUsername).toHaveBeenCalledWith(COMMAND.username);
            expect(bcryptService.hash).toHaveBeenCalledWith(COMMAND.password);
            expect(userRepository.registerWithRole).toHaveBeenCalledWith(
                expect.objectContaining({ email: COMMAND.email, username: COMMAND.username, password: HASHED_PASSWORD }),
                COMMAND.role,
            );
            expect(result.email).toBe(COMMAND.email);
            expect(result.username).toBe(COMMAND.username);
            expect(result.role).toBe(COMMAND.role);
        });

        it('lanza UserAlreadyExistsException si el email ya está registrado', async () => {
            userRepository.findByEmail.mockResolvedValue(buildSavedUser());
            userRepository.findByUsername.mockResolvedValue(null);

            await expect(useCase.execute(COMMAND)).rejects.toThrow(UserAlreadyExistsException);
            expect(bcryptService.hash).not.toHaveBeenCalled();
            expect(userRepository.registerWithRole).not.toHaveBeenCalled();
        });

        it('lanza UsernameAlreadyExistsException si el username ya está tomado', async () => {
            userRepository.findByEmail.mockResolvedValue(null);
            userRepository.findByUsername.mockResolvedValue(buildSavedUser());

            await expect(useCase.execute(COMMAND)).rejects.toThrow(UsernameAlreadyExistsException);
            expect(bcryptService.hash).not.toHaveBeenCalled();
            expect(userRepository.registerWithRole).not.toHaveBeenCalled();
        });

        it('rechaza un email con formato inválido antes de tocar el repositorio', async () => {
            await expect(
                useCase.execute({ ...COMMAND, email: 'no-es-un-email' }),
            ).rejects.toThrow('Invalid email address');

            expect(userRepository.findByEmail).not.toHaveBeenCalled();
        });

        it('rechaza un password menor a 8 caracteres antes de tocar el repositorio', async () => {
            await expect(
                useCase.execute({ ...COMMAND, password: 'short' }),
            ).rejects.toThrow('Password must be at least 8 characters long');

            expect(userRepository.findByEmail).not.toHaveBeenCalled();
        });

        it('genera un token de verificación de 64 caracteres hexadecimales, válido por 24 horas', async () => {
            userRepository.findByEmail.mockResolvedValue(null);
            userRepository.findByUsername.mockResolvedValue(null);
            bcryptService.hash.mockResolvedValue(HASHED_PASSWORD);
            const savedUser = buildSavedUser();
            userRepository.registerWithRole.mockResolvedValue(savedUser);

            const before = Date.now();
            await useCase.execute(COMMAND);
            const after = Date.now();

            expect(verificationRepository.create).toHaveBeenCalledTimes(1);
            const createArgs = verificationRepository.create.mock.calls[0][0];

            expect(createArgs.userId).toBe(savedUser.id);
            expect(createArgs.type).toBe('email_verification');
            expect(createArgs.token).toMatch(/^[a-f0-9]{64}$/);

            const expectedMin = before + 24 * 60 * 60 * 1000;
            const expectedMax = after + 24 * 60 * 60 * 1000;
            expect(createArgs.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin);
            expect(createArgs.expiresAt.getTime()).toBeLessThanOrEqual(expectedMax);
        });

        it('envía el email de verificación con el mismo token generado', async () => {
            userRepository.findByEmail.mockResolvedValue(null);
            userRepository.findByUsername.mockResolvedValue(null);
            bcryptService.hash.mockResolvedValue(HASHED_PASSWORD);
            userRepository.registerWithRole.mockResolvedValue(buildSavedUser());

            await useCase.execute(COMMAND);

            const createArgs = verificationRepository.create.mock.calls[0][0];
            expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
                expect.objectContaining({ to: COMMAND.email, token: createArgs.token }),
            );
        });

        it('guarda el password hasheado, nunca el texto plano', async () => {
            userRepository.findByEmail.mockResolvedValue(null);
            userRepository.findByUsername.mockResolvedValue(null);
            bcryptService.hash.mockResolvedValue(HASHED_PASSWORD);
            userRepository.registerWithRole.mockResolvedValue(buildSavedUser());

            await useCase.execute(COMMAND);

            const registerArgs = userRepository.registerWithRole.mock.calls[0][0];
            expect(registerArgs.password).toBe(HASHED_PASSWORD);
            expect(registerArgs.password).not.toBe(COMMAND.password);
        });
    });
});
