import { Inject, Injectable } from '@nestjs/common';

import {
    IVerificationRepository,
    VERIFICATION_REPOSITORY,
} from '../../domain/repositories/verification.repository.interface';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import { VerificationTokenInvalidException } from '../../domain/exceptions/verification-token-invalid.exception';
import { VerificationTokenExpiredException } from '../../domain/exceptions/verification-token-expired.exception';

@Injectable()
export class VerifyEmailUseCase {
    constructor(
        @Inject(VERIFICATION_REPOSITORY)
        private readonly verificationRepository: IVerificationRepository,
        @Inject(USER_REPOSITORY)
        private readonly userRepository: IUserRepository,
    ) { }

    async execute(token: string): Promise<void> {
        const record = await this.verificationRepository.findByToken(token, 'email_verification');

        if (record?.usedAt !== null) {
            throw new VerificationTokenInvalidException();
        }

        if (new Date() > record.expiresAt) {
            throw new VerificationTokenExpiredException();
        }

        await this.verificationRepository.markAsUsed(record.id);
        await this.userRepository.updateStatus(record.userId, 'active');
    }
}