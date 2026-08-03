import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';

// Infrastructure
import { UserSchema } from '../../infrastructure/database/schemas/user.schema';
import { UserRepository } from './infrastructure/repositories/user.repository';
import { BcryptService } from './infrastructure/services/bcrypt.service';
import { JwtService } from './infrastructure/services/jwt.service';
import { JwtStrategy } from './infrastructure/strategies/jwt.strategy';
// import { GoogleStrategy } from './infrastructure/strategies/google.strategy';

// Application
import { RegisterUseCase } from './application/use-cases/register.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { AuthService } from './application/services/auth.service';
// import { GoogleLoginUseCase } from './application/use-cases/google-login.use-case';

// Presentation
import { AuthController } from './presentation/controllers/auth.controller';
import { JwtAuthGuard } from './presentation/guards/jwt-auth.guard';

// Domain
import { USER_REPOSITORY } from './domain/repositories/user.repository.interface';
import { VerificationSchema } from 'src/infrastructure/database/schemas/verification.schema';
import { VERIFICATION_REPOSITORY } from './domain/repositories/verification.repository.interface';
import { EMAIL_NOTIFICATION_SERVICE, EmailNotificationService } from './infrastructure/services/email-notification.service';
import { VerificationRepository } from './infrastructure/repositories/verification.repository';
import { VerifyEmailUseCase } from './application/use-cases/verify-email.use-case';

@Module({
    imports: [
        ConfigModule,
        PassportModule,
        TypeOrmModule.forFeature([UserSchema, VerificationSchema]),
    ],
    controllers: [AuthController],
    providers: [
        // Infrastructure
        {
            provide: USER_REPOSITORY,
            useClass: UserRepository,
        },
        { provide: VERIFICATION_REPOSITORY, useClass: VerificationRepository },
        { provide: EMAIL_NOTIFICATION_SERVICE, useClass: EmailNotificationService },
        BcryptService,
        JwtService,
        JwtStrategy,
        // GoogleStrategy,

        // Application
        RegisterUseCase,
        LoginUseCase,
        VerifyEmailUseCase,
        // GoogleLoginUseCase,
        AuthService,

        // Presentation
        JwtAuthGuard,
    ],
    exports: [JwtAuthGuard, JwtService],
})
export class AuthModule { }
