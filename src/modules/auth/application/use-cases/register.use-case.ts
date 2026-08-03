import * as crypto from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { User } from '../../domain/entities/user.entity';
import { UserRole } from '../../domain/enums/user-role.enum';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import {
    IVerificationRepository,
    VERIFICATION_REPOSITORY,
} from '../../domain/repositories/verification.repository.interface';
import { UserAlreadyExistsException } from '../../domain/exceptions/user-already-exists.exception';
import { UsernameAlreadyExistsException } from '../../domain/exceptions/username-already-exists.exception';
import { Email } from '../../domain/value-objects/email.vo';
import { Password } from '../../domain/value-objects/password.vo';
import { BcryptService } from '../../infrastructure/services/bcrypt.service';
import {
    EMAIL_NOTIFICATION_SERVICE,
    IEmailNotificationService,
} from '../../infrastructure/services/email-notification.service';

@Injectable()
export class RegisterUseCase {
    constructor(
        @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
        @Inject(VERIFICATION_REPOSITORY)
        private readonly verificationRepository: IVerificationRepository,
        @Inject(EMAIL_NOTIFICATION_SERVICE)
        private readonly emailService: IEmailNotificationService,
        private readonly bcryptService: BcryptService,
    ) { }

    async execute(command: {
        email: string;
        username: string;
        password: string;
        role: UserRole;
    }): Promise<User> {
        const emailVO = new Email(command.email);
        const passwordVO = new Password(command.password);

        const [existingByEmail, existingByUsername] = await Promise.all([
            this.userRepository.findByEmail(emailVO.getValue()),
            this.userRepository.findByUsername(command.username),
        ]);

        if (existingByEmail) throw new UserAlreadyExistsException(emailVO.getValue());
        if (existingByUsername) throw new UsernameAlreadyExistsException(command.username);

        const hashedPassword = await this.bcryptService.hash(passwordVO.getValue());
        const user = User.create({
            role: command.role,
            password: hashedPassword,
            username: command.username,
            email: emailVO.getValue(),
            status: 'pending_verification',
        });

        const savedUser = await this.userRepository.registerWithRole(user, command.role);

        // Generar token de verificación de email (válido 24 horas)
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await this.verificationRepository.create({
            userId: savedUser.id,
            type: 'email_verification',
            token,
            expiresAt,
        });

        await this.emailService.sendVerificationEmail({
            to: savedUser.email,
            token,
            expiresAt,
        });

        return new User(
            savedUser.id,
            savedUser.email,
            savedUser.username,
            savedUser.password,
            savedUser.status,
            savedUser.createdAt,
            savedUser.updatedAt,
            command.role,
        );
    }
}