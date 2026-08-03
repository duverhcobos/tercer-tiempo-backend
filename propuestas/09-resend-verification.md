# Propuesta: POST /auth/resend-verification

Reenvío del token de verificación de email. Invalida tokens anteriores, genera uno nuevo e integra un `EmailNotificationService` stub para el envío del correo (reemplazable por un proveedor real sin tocar el dominio).

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/modules/auth/domain/exceptions/email-already-verified.exception.ts` | Crear |
| `src/modules/auth/application/dtos/resend-verification.dto.ts` | Crear |
| `src/modules/auth/application/use-cases/resend-verification.use-case.ts` | Crear |
| `src/modules/auth/infrastructure/services/email-notification.service.ts` | Ya creado en propuesta 08 — no recrear |
| `src/modules/auth/application/services/auth.service.ts` | Actualizar |
| `src/modules/auth/presentation/controllers/auth.controller.ts` | Actualizar |
| `src/modules/auth/presentation/swagger/auth-controller.swagger.ts` | Actualizar |
| `src/modules/auth/auth.module.ts` | Actualizar |

> **Dependencia:** Requiere propuestas 07 y 08 aplicadas previamente.

---

## 1. email-already-verified.exception.ts

**Ruta:** `src/modules/auth/domain/exceptions/email-already-verified.exception.ts`

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class EmailAlreadyVerifiedException extends DomainException {
    constructor() {
        super('Email address is already verified', 409, 'EMAIL_ALREADY_VERIFIED');
    }
}
```

---

## 2. resend-verification.dto.ts

**Ruta:** `src/modules/auth/application/dtos/resend-verification.dto.ts`

```typescript
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ResendVerificationDto {
    @IsEmail({}, { message: 'email must be an email' })
    @IsNotEmpty({ message: 'email should not be empty' })
    email!: string;
}
```

---

## 3. resend-verification.use-case.ts

**Ruta:** `src/modules/auth/application/use-cases/resend-verification.use-case.ts`

```typescript
import * as crypto from 'crypto';

import { Inject, Injectable } from '@nestjs/common';

import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import {
    IVerificationRepository,
    VERIFICATION_REPOSITORY,
} from '../../domain/repositories/verification.repository.interface';
import {
    EMAIL_NOTIFICATION_SERVICE,
    IEmailNotificationService,
} from '../../infrastructure/services/email-notification.service';
import { EmailAlreadyVerifiedException } from '../../domain/exceptions/email-already-verified.exception';

@Injectable()
export class ResendVerificationUseCase {
    constructor(
        @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
        @Inject(VERIFICATION_REPOSITORY)
        private readonly verificationRepository: IVerificationRepository,
        @Inject(EMAIL_NOTIFICATION_SERVICE)
        private readonly emailService: IEmailNotificationService,
    ) {}

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
```

---

## 5. auth.service.ts (acumulativo)

**Ruta:** `src/modules/auth/application/services/auth.service.ts`

```typescript
import { Injectable } from '@nestjs/common';

import { RegisterDto } from '../dtos/register.dto';
import { LoginDto } from '../dtos/login.dto';
import { VerifyEmailDto } from '../dtos/verify-email.dto';
import { ResendVerificationDto } from '../dtos/resend-verification.dto';
import { AuthResponseDto } from '../dtos/auth-response.dto';
import { AuthMapper } from '../mappers/auth.mapper';
import { RegisterUseCase } from '../use-cases/register.use-case';
import { LoginUseCase } from '../use-cases/login.use-case';
import { VerifyEmailUseCase } from '../use-cases/verify-email.use-case';
import { ResendVerificationUseCase } from '../use-cases/resend-verification.use-case';
import { JwtService } from '../../infrastructure/services/jwt.service';

@Injectable()
export class AuthService {
    constructor(
        private readonly registerUseCase: RegisterUseCase,
        private readonly loginUseCase: LoginUseCase,
        private readonly verifyEmailUseCase: VerifyEmailUseCase,
        private readonly resendVerificationUseCase: ResendVerificationUseCase,
        private readonly jwtService: JwtService,
    ) {}

    async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
        const user = await this.registerUseCase.execute({
            email: registerDto.email,
            username: registerDto.username,
            password: registerDto.password,
            role: registerDto.role,
        });
        const accessToken = this.jwtService.generateToken({ sub: user.id, email: user.email });
        return AuthMapper.toAuthResponse(user, accessToken, true);
    }

    async login(loginDto: LoginDto): Promise<AuthResponseDto> {
        const user = await this.loginUseCase.execute({
            email: loginDto.email,
            password: loginDto.password,
        });
        const accessToken = this.jwtService.generateToken({ sub: user.id, email: user.email });
        return AuthMapper.toAuthResponse(user, accessToken, false);
    }

    async verifyEmail(dto: VerifyEmailDto): Promise<{ message: string }> {
        await this.verifyEmailUseCase.execute(dto.token);
        return { message: 'Email verified successfully' };
    }

    async resendVerification(dto: ResendVerificationDto): Promise<{ message: string }> {
        await this.resendVerificationUseCase.execute(dto.email);
        // Siempre responde con el mismo mensaje para no enumerar si el email existe
        return { message: 'If the email exists and is unverified, a new code has been sent' };
    }
}
```

---

## 6. auth-controller.swagger.ts (acumulativo)

**Ruta:** `src/modules/auth/presentation/swagger/auth-controller.swagger.ts`

```typescript
import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';

import { RegisterSchema } from '../../application/swagger-schemas/register.schema';
import { LoginSchema } from '../../application/swagger-schemas/login.schema';
import { AuthResponseSchema } from '../../application/swagger-schemas/auth-response.schema';

export function ApiRegister() {
    return applyDecorators(
        ApiOperation({ summary: 'Registrar nuevo usuario' }),
        ApiBody({ type: RegisterSchema }),
        ApiResponse({ status: HttpStatus.CREATED, type: AuthResponseSchema }),
        ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Datos inválidos' }),
        ApiResponse({ status: HttpStatus.CONFLICT, description: 'Email o username ya registrado' }),
        ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Demasiados intentos' }),
    );
}

export function ApiLogin() {
    return applyDecorators(
        ApiOperation({ summary: 'Iniciar sesión' }),
        ApiBody({ type: LoginSchema }),
        ApiResponse({ status: HttpStatus.OK, type: AuthResponseSchema }),
        ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Datos inválidos' }),
        ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Credenciales incorrectas' }),
        ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Email no verificado o cuenta suspendida' }),
        ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Demasiados intentos' }),
    );
}

export function ApiVerifyEmail() {
    return applyDecorators(
        ApiOperation({ summary: 'Verificar email con token' }),
        ApiQuery({ name: 'token', required: true, description: 'Token hex de 64 caracteres' }),
        ApiResponse({ status: HttpStatus.OK, description: 'Email verificado correctamente' }),
        ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Token inválido o expirado' }),
    );
}

export function ApiResendVerification() {
    return applyDecorators(
        ApiOperation({ summary: 'Reenviar email de verificación' }),
        ApiBody({
            schema: {
                type: 'object',
                properties: { email: { type: 'string', example: 'jugador@ejemplo.com' } },
                required: ['email'],
            },
        }),
        ApiResponse({ status: HttpStatus.OK, description: 'Respuesta genérica (no revela si el email existe)' }),
        ApiResponse({ status: HttpStatus.CONFLICT, description: 'Email ya verificado' }),
        ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Demasiados intentos' }),
    );
}
```

---

## 7. auth.controller.ts (acumulativo)

**Ruta:** `src/modules/auth/presentation/controllers/auth.controller.ts`

```typescript
import { Body, Controller, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { RegisterDto } from '../../application/dtos/register.dto';
import { LoginDto } from '../../application/dtos/login.dto';
import { VerifyEmailDto } from '../../application/dtos/verify-email.dto';
import { ResendVerificationDto } from '../../application/dtos/resend-verification.dto';
import { AuthResponseDto } from '../../application/dtos/auth-response.dto';
import { AuthService } from '../../application/services/auth.service';
import { Public } from '../decorators/public.decorator';
import {
    ApiLogin,
    ApiRegister,
    ApiResendVerification,
    ApiVerifyEmail,
} from '../swagger/auth-controller.swagger';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Public()
    @Post('register')
    @HttpCode(HttpStatus.CREATED)
    @Throttle({ default: { limit: 3, ttl: 60000 } })
    @ApiRegister()
    async register(@Body() registerDto: RegisterDto): Promise<AuthResponseDto> {
        return this.authService.register(registerDto);
    }

    @Public()
    @Post('login')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @ApiLogin()
    async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
        return this.authService.login(loginDto);
    }

    @Public()
    @Post('verify-email')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 10, ttl: 60000 } })
    @ApiVerifyEmail()
    async verifyEmail(@Query('token') token: string): Promise<{ message: string }> {
        return this.authService.verifyEmail({ token });
    }

    @Public()
    @Post('resend-verification')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 3, ttl: 300000 } })
    @ApiResendVerification()
    async resendVerification(@Body() dto: ResendVerificationDto): Promise<{ message: string }> {
        return this.authService.resendVerification(dto);
    }
}
```

---

## 8. auth.module.ts (acumulativo)

**Ruta:** `src/modules/auth/auth.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';

import { UserSchema } from '../../infrastructure/database/schemas/user.schema';
import { VerificationSchema } from '../../infrastructure/database/schemas/verification.schema';
import { UserRepository } from './infrastructure/repositories/user.repository';
import { VerificationRepository } from './infrastructure/repositories/verification.repository';
import { BcryptService } from './infrastructure/services/bcrypt.service';
import { JwtService } from './infrastructure/services/jwt.service';
import { JwtStrategy } from './infrastructure/strategies/jwt.strategy';
import {
    EMAIL_NOTIFICATION_SERVICE,
    EmailNotificationService,
} from './infrastructure/services/email-notification.service';

import { RegisterUseCase } from './application/use-cases/register.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { VerifyEmailUseCase } from './application/use-cases/verify-email.use-case';
import { ResendVerificationUseCase } from './application/use-cases/resend-verification.use-case';
import { AuthService } from './application/services/auth.service';

import { AuthController } from './presentation/controllers/auth.controller';
import { JwtAuthGuard } from './presentation/guards/jwt-auth.guard';

import { USER_REPOSITORY } from './domain/repositories/user.repository.interface';
import { VERIFICATION_REPOSITORY } from './domain/repositories/verification.repository.interface';

@Module({
    imports: [
        ConfigModule,
        PassportModule,
        TypeOrmModule.forFeature([UserSchema, VerificationSchema]),
    ],
    controllers: [AuthController],
    providers: [
        { provide: USER_REPOSITORY, useClass: UserRepository },
        { provide: VERIFICATION_REPOSITORY, useClass: VerificationRepository },
        { provide: EMAIL_NOTIFICATION_SERVICE, useClass: EmailNotificationService },
        BcryptService,
        JwtService,
        JwtStrategy,
        RegisterUseCase,
        LoginUseCase,
        VerifyEmailUseCase,
        ResendVerificationUseCase,
        AuthService,
        JwtAuthGuard,
    ],
    exports: [JwtAuthGuard, JwtService],
})
export class AuthModule {}
```

---

## Orden de aplicación

1. Crear `email-already-verified.exception.ts`
2. Crear `resend-verification.dto.ts`
3. Crear `email-notification.service.ts`
4. Crear `resend-verification.use-case.ts`
5. Actualizar `auth.service.ts`
6. Actualizar `auth-controller.swagger.ts`
7. Actualizar `auth.controller.ts`
8. Actualizar `auth.module.ts`
