import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { User } from '../../domain/entities/user.entity';
import { UserRole } from '../../domain/enums/user-role.enum';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';

import { GetMeUseCase } from './get-me.use-case';

describe('GetMeUseCase', () => {
    let useCase: GetMeUseCase;
    let userRepository: jest.Mocked<IUserRepository>;

    const USER_ID = '123e4567-e89b-12d3-a456-426614174000';

    function buildUser(status: string = 'active'): User {
        return new User(
            USER_ID,
            'jugador@ejemplo.com',
            'jugador_10',
            'hashed_password',
            status,
            new Date('2026-01-01T00:00:00Z'),
            new Date('2026-01-01T00:00:00Z'),
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

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                GetMeUseCase,
                { provide: USER_REPOSITORY, useValue: mockUserRepository },
            ],
        }).compile();

        useCase = module.get<GetMeUseCase>(GetMeUseCase);
        userRepository = module.get(USER_REPOSITORY);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('execute', () => {
        it('retorna el MeResponseDto con profileComplete=true cuando el usuario tiene perfil', async () => {
            const user = buildUser();
            userRepository.findById.mockResolvedValue(user);
            userRepository.hasProfile.mockResolvedValue(true);

            const result = await useCase.execute(USER_ID);

            // eslint-disable-next-line @typescript-eslint/unbound-method -- falso positivo: jest.Mocked<T> no usa `this`
            expect(userRepository.findById).toHaveBeenCalledWith(USER_ID);
            // eslint-disable-next-line @typescript-eslint/unbound-method -- falso positivo: jest.Mocked<T> no usa `this`
            expect(userRepository.hasProfile).toHaveBeenCalledWith(USER_ID);
            expect(result).toEqual({
                id: user.id,
                email: user.email,
                username: user.username,
                role: user.role,
                status: user.status,
                profileComplete: true,
                createdAt: user.createdAt,
            });
        });

        it('retorna profileComplete=false cuando el usuario no ha completado el onboarding', async () => {
            userRepository.findById.mockResolvedValue(buildUser());
            userRepository.hasProfile.mockResolvedValue(false);

            const result = await useCase.execute(USER_ID);

            expect(result.profileComplete).toBe(false);
        });

        it('lanza UnauthorizedException si el usuario ya no existe', async () => {
            userRepository.findById.mockResolvedValue(null);

            await expect(useCase.execute(USER_ID)).rejects.toThrow(UnauthorizedException);
            // eslint-disable-next-line @typescript-eslint/unbound-method -- falso positivo: jest.Mocked<T> no usa `this`
            expect(userRepository.hasProfile).not.toHaveBeenCalled();
        });
    });
});
