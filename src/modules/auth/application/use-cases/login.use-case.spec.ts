import { Test, TestingModule } from '@nestjs/testing';
import { LoginUseCase } from './login.use-case';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import { BcryptService } from '../../infrastructure/services/bcrypt.service';
import { InvalidCredentialsException } from '../../domain/exceptions/invalid-credentials.exception';
import { EmailNotVerifiedException } from '../../domain/exceptions/email-not-verified.exception';
import { AccountSuspendedException } from '../../domain/exceptions/account-suspended.exception';
import { AccountBannedException } from '../../domain/exceptions/account-banned.exception';
import { User } from '../../domain/entities/user.entity';
import { UserRole } from '../../domain/enums/user-role.enum';

describe('LoginUseCase', () => {
    let useCase: LoginUseCase;
    let userRepository: jest.Mocked<IUserRepository>;
    let bcryptService: jest.Mocked<BcryptService>;

    const COMMAND = {
        email: 'test@example.com',
        password: 'Password123!', // NOSONAR: credencial de fixture para tests, no es un secreto real
    };
    const HASHED_PASSWORD = 'hashed_password_123';

    function buildUser(status: string): User {
        return new User(
            '123e4567-e89b-12d3-a456-426614174000',
            COMMAND.email,
            'test_user',
            HASHED_PASSWORD,
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

        const mockBcryptService = {
            hash: jest.fn(),
            compare: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                LoginUseCase,
                { provide: USER_REPOSITORY, useValue: mockUserRepository },
                { provide: BcryptService, useValue: mockBcryptService },
            ],
        }).compile();

        useCase = module.get<LoginUseCase>(LoginUseCase);
        userRepository = module.get(USER_REPOSITORY);
        bcryptService = module.get(BcryptService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('execute', () => {
        it('inicia sesión correctamente con credenciales válidas y cuenta activa', async () => {
            const activeUser = buildUser('active');
            userRepository.findByEmailWithRole.mockResolvedValue(activeUser);
            bcryptService.compare.mockResolvedValue(true);

            const result = await useCase.execute(COMMAND);

            expect(userRepository.findByEmailWithRole).toHaveBeenCalledWith(COMMAND.email);
            expect(bcryptService.compare).toHaveBeenCalledWith(COMMAND.password, HASHED_PASSWORD);
            expect(userRepository.updateLastLoginAt).toHaveBeenCalledWith(activeUser.id);
            expect(result).toEqual(activeUser);
        });

        it('lanza InvalidCredentialsException cuando el usuario no existe', async () => {
            userRepository.findByEmailWithRole.mockResolvedValue(null);

            await expect(useCase.execute(COMMAND)).rejects.toThrow(InvalidCredentialsException);
            expect(bcryptService.compare).not.toHaveBeenCalled();
            expect(userRepository.updateLastLoginAt).not.toHaveBeenCalled();
        });

        it('lanza InvalidCredentialsException cuando el password es incorrecto', async () => {
            userRepository.findByEmailWithRole.mockResolvedValue(buildUser('active'));
            bcryptService.compare.mockResolvedValue(false);

            await expect(useCase.execute(COMMAND)).rejects.toThrow(InvalidCredentialsException);
            expect(userRepository.updateLastLoginAt).not.toHaveBeenCalled();
        });

        it('lanza EmailNotVerifiedException cuando la cuenta está pending_verification', async () => {
            userRepository.findByEmailWithRole.mockResolvedValue(buildUser('pending_verification'));
            bcryptService.compare.mockResolvedValue(true);

            await expect(useCase.execute(COMMAND)).rejects.toThrow(EmailNotVerifiedException);
            expect(userRepository.updateLastLoginAt).not.toHaveBeenCalled();
        });

        it('lanza AccountSuspendedException cuando la cuenta está suspendida', async () => {
            userRepository.findByEmailWithRole.mockResolvedValue(buildUser('suspended'));
            bcryptService.compare.mockResolvedValue(true);

            await expect(useCase.execute(COMMAND)).rejects.toThrow(AccountSuspendedException);
            expect(userRepository.updateLastLoginAt).not.toHaveBeenCalled();
        });

        it('lanza AccountBannedException cuando la cuenta está baneada', async () => {
            userRepository.findByEmailWithRole.mockResolvedValue(buildUser('banned'));
            bcryptService.compare.mockResolvedValue(true);

            await expect(useCase.execute(COMMAND)).rejects.toThrow(AccountBannedException);
            expect(userRepository.updateLastLoginAt).not.toHaveBeenCalled();
        });

        it('compara el password recibido contra el hash guardado del usuario', async () => {
            const activeUser = buildUser('active');
            userRepository.findByEmailWithRole.mockResolvedValue(activeUser);
            bcryptService.compare.mockResolvedValue(true);

            await useCase.execute(COMMAND);

            expect(bcryptService.compare).toHaveBeenCalledWith(COMMAND.password, activeUser.password);
        });
    });
});
