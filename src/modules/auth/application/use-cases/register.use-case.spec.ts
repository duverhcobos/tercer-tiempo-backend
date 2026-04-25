import { Test, TestingModule } from '@nestjs/testing';
import { RegisterUseCase } from './register.use-case';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import { BcryptService } from '../../infrastructure/services/bcrypt.service';
import { UserAlreadyExistsException } from '../../domain/exceptions/user-already-exists.exception';
import { User } from '../../domain/entities/user.entity';

describe('RegisterUseCase', () => {
    let useCase: RegisterUseCase;
    let userRepository: jest.Mocked<IUserRepository>;
    let bcryptService: jest.Mocked<BcryptService>;

    beforeEach(async () => {
        // Mock del repositorio
        const mockUserRepository = {
            findByEmail: jest.fn(),
            save: jest.fn(),
            findById: jest.fn(),
        };

        // Mock del servicio bcrypt
        const mockBcryptService = {
            hash: jest.fn(),
            compare: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RegisterUseCase,
                {
                    provide: USER_REPOSITORY,
                    useValue: mockUserRepository,
                },
                {
                    provide: BcryptService,
                    useValue: mockBcryptService,
                },
            ],
        }).compile();

        useCase = module.get<RegisterUseCase>(RegisterUseCase);
        userRepository = module.get(USER_REPOSITORY);
        bcryptService = module.get(BcryptService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('execute', () => {
        const validEmail = 'test@example.com';
        const validPassword = 'Password123';
        const hashedPassword = 'hashed_password_123';

        it('should register a new user successfully', async () => {
            // Arrange
            userRepository.findByEmail.mockResolvedValue(null);
            bcryptService.hash.mockResolvedValue(hashedPassword);

            const savedUser = new User(
                '123e4567-e89b-12d3-a456-426614174000',
                validEmail,
                hashedPassword,
                null,
                new Date(),
                new Date(),
            );
            userRepository.save.mockResolvedValue(savedUser);

            // Act
            const result = await useCase.execute(validEmail, validPassword);

            // Assert
            expect(userRepository.findByEmail).toHaveBeenCalledWith(validEmail);
            expect(bcryptService.hash).toHaveBeenCalledWith(validPassword);
            expect(userRepository.save).toHaveBeenCalled();
            expect(result).toEqual(savedUser);
        });

        it('should throw UserAlreadyExistsException when email is already registered', async () => {
            // Arrange
            const existingUser = new User(
                '123e4567-e89b-12d3-a456-426614174000',
                validEmail,
                hashedPassword,
                null,
                new Date(),
                new Date(),
            );
            userRepository.findByEmail.mockResolvedValue(existingUser);

            // Act & Assert
            await expect(useCase.execute(validEmail, validPassword)).rejects.toThrow(
                UserAlreadyExistsException,
            );
            expect(userRepository.findByEmail).toHaveBeenCalledWith(validEmail);
            expect(bcryptService.hash).not.toHaveBeenCalled();
            expect(userRepository.save).not.toHaveBeenCalled();
        });

        it('should hash the password before saving', async () => {
            // Arrange
            userRepository.findByEmail.mockResolvedValue(null);
            bcryptService.hash.mockResolvedValue(hashedPassword);

            const savedUser = new User(
                '123e4567-e89b-12d3-a456-426614174000',
                validEmail,
                hashedPassword,
                null,
                new Date(),
                new Date(),
            );
            userRepository.save.mockResolvedValue(savedUser);

            // Act
            await useCase.execute(validEmail, validPassword);

            // Assert
            expect(bcryptService.hash).toHaveBeenCalledWith(validPassword);
            const saveCall = userRepository.save.mock.calls[0][0];
            expect(saveCall.password).toBe(hashedPassword);
        });

        it('should create user with correct email and password', async () => {
            // Arrange
            userRepository.findByEmail.mockResolvedValue(null);
            bcryptService.hash.mockResolvedValue(hashedPassword);

            const savedUser = new User(
                '123e4567-e89b-12d3-a456-426614174000',
                validEmail,
                hashedPassword,
                null,
                new Date(),
                new Date(),
            );
            userRepository.save.mockResolvedValue(savedUser);

            // Act
            await useCase.execute(validEmail, validPassword);

            // Assert
            const saveCall = userRepository.save.mock.calls[0][0];
            expect(saveCall.email).toBe(validEmail);
            expect(saveCall.password).toBe(hashedPassword);
        });
    });
});
