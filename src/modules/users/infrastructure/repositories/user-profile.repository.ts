import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserProfile } from '../../domain/entities/user-profile.entity';
import { IUserProfileRepository } from '../../domain/repositories/user-profile.repository.interface';
import { UserProfileSchema } from '../../../../infrastructure/database/schemas/user-profile.schema';
import { UserProfileMapper } from '../mappers/user-profile.mapper';

@Injectable()
export class UserProfileRepository implements IUserProfileRepository {
    constructor(
        @InjectRepository(UserProfileSchema)
        private readonly repo: Repository<UserProfileSchema>,
    ) {}

    async findByUserId(userId: string): Promise<UserProfile | null> {
        const schema = await this.repo.findOne({
            where: { userId, deletedAt: undefined },
        });
        return schema ? UserProfileMapper.toDomain(schema) : null;
    }

    async create(profile: UserProfile): Promise<UserProfile> {
        const schema = UserProfileMapper.toSchema(profile);
        const saved = await this.repo.save(schema);
        return UserProfileMapper.toDomain(saved);
    }
}