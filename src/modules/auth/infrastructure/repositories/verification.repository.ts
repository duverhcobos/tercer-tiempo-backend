import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { VerificationSchema } from '../../../../infrastructure/database/schemas/verification.schema';
import {
    CreateVerificationParams,
    IVerificationRepository,
    VerificationRecord,
} from '../../domain/repositories/verification.repository.interface';

@Injectable()
export class VerificationRepository implements IVerificationRepository {
    constructor(
        @InjectRepository(VerificationSchema)
        private readonly repo: Repository<VerificationSchema>,
    ) { }

    async create(params: CreateVerificationParams): Promise<void> {
        const entity = this.repo.create({
            userId: params.userId,
            type: params.type,
            token: params.token,
            expiresAt: params.expiresAt,
        });
        await this.repo.save(entity);
    }

    async findByToken(token: string, type: string): Promise<VerificationRecord | null> {
        const entity = await this.repo.findOne({
            where: { token, type },
        });
        if (!entity) return null;
        return this.toRecord(entity);
    }

    async markAsUsed(id: string): Promise<void> {
        await this.repo.update(id, { usedAt: new Date() });
    }

    async invalidatePreviousTokens(userId: string, type: string): Promise<void> {
        await this.repo
            .createQueryBuilder()
            .update(VerificationSchema)
            .set({ usedAt: new Date() })
            .where('user_id = :userId AND type = :type AND used_at IS NULL', { userId, type })
            .execute();
    }

    private toRecord(entity: VerificationSchema): VerificationRecord {
        return {
            id: entity.id,
            userId: entity.userId,
            type: entity.type,
            token: entity.token,
            expiresAt: entity.expiresAt,
            usedAt: entity.usedAt,
            attempts: entity.attempts,
            maxAttempts: entity.maxAttempts,
            createdAt: entity.createdAt,
        };
    }
}