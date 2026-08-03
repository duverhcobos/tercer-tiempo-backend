import { UserMapper } from './user.mapper';
import { UserSchema } from '../../../../infrastructure/database/schemas/user.schema';
import { User } from '../../domain/entities/user.entity';
import { UserRole } from '../../domain/enums/user-role.enum';

describe('UserMapper', () => {
    describe('toDomain', () => {
        it('mapea un UserSchema a una entidad User de dominio', () => {
            const schema: UserSchema = {
                id: 'user-id-1',
                syncId: null as unknown as string,
                email: 'test@example.com',
                username: 'test_user',
                passwordHash: 'hashed_password',
                status: 'active',
                lastLoginAt: null,
                createdAt: new Date('2025-01-01'),
                updatedAt: new Date('2025-01-02'),
            };

            const result = UserMapper.toDomain(schema);

            expect(result).toBeInstanceOf(User);
            expect(result.id).toBe(schema.id);
            expect(result.email).toBe(schema.email);
            expect(result.username).toBe(schema.username);
            expect(result.password).toBe(schema.passwordHash);
            expect(result.status).toBe(schema.status);
            expect(result.createdAt).toBe(schema.createdAt);
            expect(result.updatedAt).toBe(schema.updatedAt);
        });
    });

    describe('toSchema', () => {
        it('mapea una entidad User nueva (sin id) a un UserSchema sin id asignado', () => {
            const user = User.create({
                email: 'nuevo@ejemplo.com',
                username: 'nuevo_user',
                password: 'hashed_password',
                status: 'pending_verification',
                role: UserRole.PLAYER,
            });

            const schema = UserMapper.toSchema(user);

            expect(schema.id).toBeUndefined();
            expect(schema.email).toBe(user.email);
            expect(schema.username).toBe(user.username);
            expect(schema.passwordHash).toBe(user.password);
        });

        it('conserva el id cuando el usuario ya existe', () => {
            const user = new User(
                'existing-id',
                'existente@ejemplo.com',
                'existente_user',
                'hashed_password',
                'active',
                new Date(),
                new Date(),
            );

            const schema = UserMapper.toSchema(user);

            expect(schema.id).toBe('existing-id');
        });
    });

    describe('toDomainList', () => {
        it('mapea una lista de schemas a una lista de entidades User', () => {
            const schemas: UserSchema[] = [
                {
                    id: '1',
                    syncId: null as unknown as string,
                    email: 'a@ejemplo.com',
                    username: 'user_a',
                    passwordHash: 'hash-a',
                    status: 'active',
                    lastLoginAt: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    id: '2',
                    syncId: null as unknown as string,
                    email: 'b@ejemplo.com',
                    username: 'user_b',
                    passwordHash: 'hash-b',
                    status: 'active',
                    lastLoginAt: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ];

            const result = UserMapper.toDomainList(schemas);

            expect(result).toHaveLength(2);
            expect(result[0]).toBeInstanceOf(User);
            expect(result[0].email).toBe('a@ejemplo.com');
            expect(result[1].email).toBe('b@ejemplo.com');
        });

        it('retorna una lista vacía si recibe una lista vacía', () => {
            expect(UserMapper.toDomainList([])).toEqual([]);
        });
    });
});
