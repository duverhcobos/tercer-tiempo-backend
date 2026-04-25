import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSchema } from '../../../../infrastructure/database/schemas/user.schema';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';
import { User } from '../../domain/entities/user.entity';
import { UserMapper } from '../mappers/user.mapper';

@Injectable()
export class UserRepository implements IUserRepository {
    constructor(
        @InjectRepository(UserSchema)
        private readonly userSchemaRepository: Repository<UserSchema>,
    ) { }

    async findByEmail(email: string): Promise<User | null> {
        const userSchema = await this.userSchemaRepository.findOne({
            where: { email },
        });

        if (!userSchema) {
            return null;
        }

        return UserMapper.toDomain(userSchema);
    }

    async save(user: User): Promise<User> {
        const userSchema = UserMapper.toSchema(user);
        const savedSchema = await this.userSchemaRepository.save(userSchema);
        return UserMapper.toDomain(savedSchema);
    }
}
