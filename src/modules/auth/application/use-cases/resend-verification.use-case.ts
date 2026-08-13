import * as crypto from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { EmailAlreadyVerifiedException } from '../../domain/exceptions/email-already-verified.exception';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import {
    IVerificationRepository,
    VERIFICATION_REPOSITORY,
} from '../../domain/repositories/verification.repository.interface';
import {
    EMAIL_NOTIFICATION_SERVICE,
    IEmailNotificationService,
} from '../../infrastructure/services/email-notification.service';

@Injectable()
export class ResendVerificationUseCase {
    constructor(
        @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
        @Inject(VERIFICATION_REPOSITORY)
        private readonly verificationRepository: IVerificationRepository,
        @Inject(EMAIL_NOTIFICATION_SERVICE)
        private readonly emailService: IEmailNotificationService,
    ) { }

    async execute(email: string): Promise<void> {
        const user = await this.userRepository.findByEmail(email);

        // Si el email no existe, retornamos sin error para no enumerar usuarios
        if (!user) return;

        if (user.status === 'active') {
            throw new EmailAlreadyVerifiedException();
        }

        // Invalidar tokens anteriores del mismo tipo
        await this.verificationRepository.invalidatePreviousTokens(user.id, 'email_verification');

        // Generar nuevo token (válido 24 horas)
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await this.verificationRepository.create({
            userId: user.id,
            type: 'email_verification',
            token,
            expiresAt,
        });

        await this.emailService.sendVerificationEmail({
            to: user.email,
            token,
            expiresAt,
        });
    }
}