// import { Test, TestingModule } from '@nestjs/testing';
// import { LoginUseCase } from './login.use-case';
// import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
// import { BcryptService } from '../../infrastructure/services/bcrypt.service';
// import { InvalidCredentialsException } from '../../domain/exceptions/invalid-credentials.exception';
// import { User } from '../../domain/entities/user.entity';

// describe('LoginUseCase', () => {
//     let useCase: LoginUseCase;
//     let userRepository: jest.Mocked<IUserRepository>;
//     let bcryptService: jest.Mocked<BcryptService>;

//     beforeEach(async () => {
//         const mockUserRepository = {
//             findByEmail: jest.fn(),
//             save: jest.fn(),
//             findById: jest.fn(),
//         };

//         const mockBcryptService = {
//             hash: jest.fn(),
//             compare: jest.fn(),
//         };

//         const module: TestingModule = await Test.createTestingModule({
//             providers: [
//                 LoginUseCase,
//                 {
//                     provide: USER_REPOSITORY,
//                     useValue: mockUserRepository,
//                 },
//                 {
//                     provide: BcryptService,
//                     useValue: mockBcryptService,
//                 },
//             ],
//         }).compile();

//         useCase = module.get<LoginUseCase>(LoginUseCase);
//         userRepository = module.get(USER_REPOSITORY);
//         bcryptService = module.get(BcryptService);
//     });

//     afterEach(() => {
//         jest.clearAllMocks();
//     });

//     describe('execute', () => {
//         const validEmail = 'test@example.com';
//         const validPassword = 'Password123';
//         const hashedPassword = 'hashed_password_123';

//         const mockUser = new User(
//             '123e4567-e89b-12d3-a456-426614174000',
//             validEmail,
//             hashedPassword,
//             null,
//             new Date(),
//             new Date(),
//         );

//         it('should login successfully with valid credentials', async () => {
//             // Arrange
//             userRepository.findByEmail.mockResolvedValue(mockUser);
//             bcryptService.compare.mockResolvedValue(true);

//             // Act
//             const result = await useCase.execute(validEmail, validPassword);

//             // Assert
//             expect(userRepository.findByEmail).toHaveBeenCalledWith(validEmail);
//             expect(bcryptService.compare).toHaveBeenCalledWith(
//                 validPassword,
//                 hashedPassword,
//             );
//             expect(result).toEqual(mockUser);
//         });

//         it('should throw InvalidCredentialsException when user does not exist', async () => {
//             // Arrange
//             userRepository.findByEmail.mockResolvedValue(null);

//             // Act & Assert
//             await expect(useCase.execute(validEmail, validPassword)).rejects.toThrow(
//                 InvalidCredentialsException,
//             );
//             expect(userRepository.findByEmail).toHaveBeenCalledWith(validEmail);
//             expect(bcryptService.compare).not.toHaveBeenCalled();
//         });

//         it('should throw InvalidCredentialsException when password is incorrect', async () => {
//             // Arrange
//             userRepository.findByEmail.mockResolvedValue(mockUser);
//             bcryptService.compare.mockResolvedValue(false);

//             // Act & Assert
//             await expect(useCase.execute(validEmail, 'WrongPassword')).rejects.toThrow(
//                 InvalidCredentialsException,
//             );
//             expect(userRepository.findByEmail).toHaveBeenCalledWith(validEmail);
//             expect(bcryptService.compare).toHaveBeenCalledWith(
//                 'WrongPassword',
//                 hashedPassword,
//             );
//         });

//         it('should compare password with hashed password from database', async () => {
//             // Arrange
//             userRepository.findByEmail.mockResolvedValue(mockUser);
//             bcryptService.compare.mockResolvedValue(true);

//             // Act
//             await useCase.execute(validEmail, validPassword);

//             // Assert
//             expect(bcryptService.compare).toHaveBeenCalledWith(
//                 validPassword,
//                 mockUser.password,
//             );
//         });
//     });
// });
