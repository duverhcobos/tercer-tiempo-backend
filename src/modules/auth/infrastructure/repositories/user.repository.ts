import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UserSchema } from '../../../../infrastructure/database/schemas/user.schema';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';
import { User } from '../../domain/entities/user.entity';
import { UserRole } from '../../domain/enums/user-role.enum';
import { UserMapper } from '../mappers/user.mapper';

@Injectable()
export class UserRepository implements IUserRepository {
    constructor(
        @InjectRepository(UserSchema)
        private readonly userSchemaRepository: Repository<UserSchema>,
        private readonly dataSource: DataSource,
    ) { }

    async findById(id: string): Promise<User | null> {
        const rows = await this.dataSource.query(
            `SELECT u.id, u.email, u.username, u.password_hash, u.status,
                    u.created_at, u.updated_at, r.name AS role
             FROM "users" u
             LEFT JOIN "user_roles" ur ON ur.user_id = u.id
             LEFT JOIN "roles" r       ON r.id = ur.role_id
             WHERE u.id = $1
               AND u.deleted_at IS NULL`,
            [id],
        );

        if (!rows.length) return null

        const row = rows[0];

        return new User(
            row.id,
            row.email,
            row.username,
            row.password_hash,
            row.status,
            row.created_at,
            row.updated_at,
            (row.role as UserRole) ?? null,
        );
    }


    async findByEmailWithRole(email: string): Promise<User | null> {
        const rows = await this.dataSource.query(
            `SELECT u.id, u.email, u.username, u.password_hash, u.status,
                    u.created_at, u.updated_at, r.name AS role
             FROM "users" u
             LEFT JOIN "user_roles" ur ON ur.user_id = u.id
             LEFT JOIN "roles" r       ON r.id = ur.role_id
             WHERE LOWER(u.email) = LOWER($1)
               AND u.deleted_at IS NULL`,
            [email],
        );
        if (!rows.length) return null;
        const row = rows[0];
        return new User(
            row.id,
            row.email,
            row.username,
            row.password_hash,
            row.status,
            row.created_at,
            row.updated_at,
            (row.role as UserRole) ?? null,
        );
    }


    async updateLastLoginAt(userId: string): Promise<void> {
        await this.userSchemaRepository.update(userId, { lastLoginAt: new Date() });
    }


    async updateStatus(userId: string, status: string): Promise<void> {
        await this.userSchemaRepository.update(userId, { status });
    }

    async hasProfile(userId: string): Promise<boolean> {
        const rows = await this.dataSource.query(
            `SELECT EXISTS(
               SELECT 1 FROM "user_profiles"
               WHERE user_id = $1 AND deleted_at IS NULL
             ) AS "exists"`,
            [userId],
        );
        return rows[0].exists === true || rows[0].exists === 't';
    }

    async findByEmail(email: string): Promise<User | null> {
        const userSchema = await this.userSchemaRepository
            .createQueryBuilder('user')
            .where('LOWER(user.email) = LOWER(:email)', { email })
            .getOne();
        return userSchema ? UserMapper.toDomain(userSchema) : null;
    }

    async findByUsername(username: string): Promise<User | null> {
        const userSchema = await this.userSchemaRepository
            .createQueryBuilder('user')
            .where('LOWER(user.username) = LOWER(:username)', { username })
            .getOne();
        return userSchema ? UserMapper.toDomain(userSchema) : null;
    }



    async registerWithRole(user: User, role: UserRole): Promise<User> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const userSchema = UserMapper.toSchema(user);
            const savedSchema = await queryRunner.manager.save(UserSchema, userSchema);

            await queryRunner.query(
                `INSERT INTO "user_roles" (user_id, role_id)
                 SELECT $1, id FROM "roles" WHERE name = $2
                 ON CONFLICT DO NOTHING`,
                [savedSchema.id, role],
            );

            await queryRunner.commitTransaction();
            return UserMapper.toDomain(savedSchema);
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }
}
