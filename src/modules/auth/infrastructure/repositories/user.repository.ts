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
