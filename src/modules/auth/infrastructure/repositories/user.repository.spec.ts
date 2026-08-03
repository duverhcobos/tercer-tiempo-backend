import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { UserRepository } from './user.repository';
import { UserSchema } from '../../../../infrastructure/database/schemas/user.schema';
import { User } from '../../domain/entities/user.entity';
import { UserRole } from '../../domain/enums/user-role.enum';

describe('UserRepository', () => {
    let repository: UserRepository;
    let ormRepo: jest.Mocked<Repository<UserSchema>>;
    let dataSource: jest.Mocked<DataSource>;

    const ROW = {
        id: 'user-id-1',
        email: 'test@example.com',
        username: 'test_user',
        password_hash: 'hashed_password',
        status: 'active',
        created_at: new Date('2025-01-01'),
        updated_at: new Date('2025-01-02'),
        role: 'PLAYER',
    };

    beforeEach(async () => {
        const mockOrmRepo = {
            update: jest.fn(),
            createQueryBuilder: jest.fn(),
        };

        const mockDataSource = {
            query: jest.fn(),
            createQueryRunner: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UserRepository,
                { provide: getRepositoryToken(UserSchema), useValue: mockOrmRepo },
                { provide: DataSource, useValue: mockDataSource },
            ],
        }).compile();

        repository = module.get<UserRepository>(UserRepository);
        ormRepo = module.get(getRepositoryToken(UserSchema));
        dataSource = module.get(DataSource);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('findById', () => {
        it('retorna null si no existe la fila', async () => {
            dataSource.query.mockResolvedValue([]);

            const result = await repository.findById('no-existe');

            expect(result).toBeNull();
        });

        it('mapea la fila encontrada a un User con su role', async () => {
            dataSource.query.mockResolvedValue([ROW]);

            const result = await repository.findById(ROW.id);

            expect(result).toBeInstanceOf(User);
            expect(result?.id).toBe(ROW.id);
            expect(result?.email).toBe(ROW.email);
            expect(result?.role).toBe(UserRole.PLAYER);
        });

        it('retorna role null si la fila no tiene rol asignado', async () => {
            dataSource.query.mockResolvedValue([{ ...ROW, role: null }]);

            const result = await repository.findById(ROW.id);

            expect(result?.role).toBeNull();
        });
    });

    describe('findByEmailWithRole', () => {
        it('retorna null si no existe el email', async () => {
            dataSource.query.mockResolvedValue([]);

            const result = await repository.findByEmailWithRole('nadie@ejemplo.com');

            expect(result).toBeNull();
        });

        it('mapea la fila encontrada a un User con su role', async () => {
            dataSource.query.mockResolvedValue([ROW]);

            const result = await repository.findByEmailWithRole(ROW.email);

            expect(result?.email).toBe(ROW.email);
            expect(result?.role).toBe(UserRole.PLAYER);
        });
    });

    describe('updateLastLoginAt', () => {
        it('actualiza last_login_at del usuario', async () => {
            await repository.updateLastLoginAt('user-id-1');

            expect(ormRepo.update).toHaveBeenCalledWith('user-id-1', { lastLoginAt: expect.any(Date) });
        });
    });

    describe('updateStatus', () => {
        it('actualiza el status del usuario', async () => {
            await repository.updateStatus('user-id-1', 'active');

            expect(ormRepo.update).toHaveBeenCalledWith('user-id-1', { status: 'active' });
        });
    });

    describe('hasProfile', () => {
        it('retorna true cuando la query devuelve exists=true', async () => {
            dataSource.query.mockResolvedValue([{ exists: true }]);

            const result = await repository.hasProfile('user-id-1');

            expect(result).toBe(true);
        });

        it('retorna true cuando la query devuelve exists="t" (driver pg como string)', async () => {
            dataSource.query.mockResolvedValue([{ exists: 't' }]);

            const result = await repository.hasProfile('user-id-1');

            expect(result).toBe(true);
        });

        it('retorna false cuando no existe perfil', async () => {
            dataSource.query.mockResolvedValue([{ exists: false }]);

            const result = await repository.hasProfile('user-id-1');

            expect(result).toBe(false);
        });
    });

    describe('findByEmail / findByUsername', () => {
        function mockQueryBuilder(returnValue: UserSchema | null) {
            const getOne = jest.fn().mockResolvedValue(returnValue);
            const where = jest.fn().mockReturnValue({ getOne });
            ormRepo.createQueryBuilder.mockReturnValue({ where } as never);
            return { where, getOne };
        }

        it('findByEmail retorna null si no encuentra coincidencia', async () => {
            mockQueryBuilder(null);

            const result = await repository.findByEmail('nadie@ejemplo.com');

            expect(result).toBeNull();
        });

        it('findByEmail mapea el schema encontrado a un User de dominio', async () => {
            const schema: UserSchema = {
                id: 'user-id-1',
                syncId: null as unknown as string,
                email: ROW.email,
                username: ROW.username,
                passwordHash: ROW.password_hash,
                status: ROW.status,
                lastLoginAt: null,
                createdAt: ROW.created_at,
                updatedAt: ROW.updated_at,
            };
            mockQueryBuilder(schema);

            const result = await repository.findByEmail(ROW.email);

            expect(result?.email).toBe(ROW.email);
            expect(result?.password).toBe(ROW.password_hash);
        });

        it('findByUsername retorna null si no encuentra coincidencia', async () => {
            mockQueryBuilder(null);

            const result = await repository.findByUsername('nadie');

            expect(result).toBeNull();
        });
    });

    describe('registerWithRole', () => {
        it('guarda el usuario, asigna el rol y confirma la transacción', async () => {
            const queryRunner = {
                connect: jest.fn(),
                startTransaction: jest.fn(),
                commitTransaction: jest.fn(),
                rollbackTransaction: jest.fn(),
                release: jest.fn(),
                query: jest.fn(),
                manager: { save: jest.fn() },
            };
            dataSource.createQueryRunner.mockReturnValue(queryRunner as never);

            const savedSchema: UserSchema = {
                id: 'new-user-id',
                syncId: null as unknown as string,
                email: 'nuevo@ejemplo.com',
                username: 'nuevo_user',
                passwordHash: 'hashed',
                status: 'pending_verification',
                lastLoginAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            queryRunner.manager.save.mockResolvedValue(savedSchema);

            const userToRegister = User.create({
                email: savedSchema.email,
                username: savedSchema.username,
                password: savedSchema.passwordHash,
                status: savedSchema.status,
                role: UserRole.PLAYER,
            });

            const result = await repository.registerWithRole(userToRegister, UserRole.PLAYER);

            expect(queryRunner.connect).toHaveBeenCalled();
            expect(queryRunner.startTransaction).toHaveBeenCalled();
            expect(queryRunner.manager.save).toHaveBeenCalled();
            expect(queryRunner.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO "user_roles"'), [
                savedSchema.id,
                UserRole.PLAYER,
            ]);
            expect(queryRunner.commitTransaction).toHaveBeenCalled();
            expect(queryRunner.release).toHaveBeenCalled();
            expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
            expect(result.email).toBe(savedSchema.email);
        });

        it('revierte la transacción y re-lanza el error si falla el guardado', async () => {
            const queryRunner = {
                connect: jest.fn(),
                startTransaction: jest.fn(),
                commitTransaction: jest.fn(),
                rollbackTransaction: jest.fn(),
                release: jest.fn(),
                query: jest.fn(),
                manager: { save: jest.fn() },
            };
            dataSource.createQueryRunner.mockReturnValue(queryRunner as never);

            const dbError = new Error('constraint violation');
            queryRunner.manager.save.mockRejectedValue(dbError);

            const userToRegister = User.create({
                email: 'nuevo@ejemplo.com',
                username: 'nuevo_user',
                password: 'hashed',
                status: 'pending_verification',
                role: UserRole.PLAYER,
            });

            await expect(repository.registerWithRole(userToRegister, UserRole.PLAYER)).rejects.toThrow(dbError);

            expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
            expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
            expect(queryRunner.release).toHaveBeenCalled();
        });
    });
});
