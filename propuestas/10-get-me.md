# Propuesta: GET /auth/me

**Estado:** ✅ Completado — superada en el orden de aplicación por `10.2-get-me.md` (misma funcionalidad, orden de archivos actualizado), pero el resultado final ya está en `src/`.

Estado actual del usuario autenticado. Devuelve `status` y `profileComplete` para que el frontend sepa en qué paso del flujo de registro está el usuario al abrir la app.

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/modules/auth/application/dtos/me-response.dto.ts` | Crear |
| `src/modules/auth/application/use-cases/get-me.use-case.ts` | Crear |
| `src/modules/auth/application/services/auth.service.ts` | Actualizar |
| `src/modules/auth/presentation/controllers/auth.controller.ts` | Actualizar |
| `src/modules/auth/presentation/swagger/auth-controller.swagger.ts` | Actualizar |

> **Dependencia:** Requiere propuestas 07, 08 y 09 aplicadas previamente.  
> `findById` y `hasProfile` ya están definidos en la interfaz y repositorio de la propuesta 07.

---

## 1. me-response.dto.ts

**Ruta:** `src/modules/auth/application/dtos/me-response.dto.ts`

```typescript
import { UserRole } from '../../domain/enums/user-role.enum';

export class MeResponseDto {
    id!: string;
    email!: string;
    username!: string;
    role!: UserRole | null;
    status!: string;
    profileComplete!: boolean;
    createdAt!: Date;

    constructor(params: {
        id: string;
        email: string;
        username: string;
        role: UserRole | null;
        status: string;
        profileComplete: boolean;
        createdAt: Date;
    }) {
        Object.assign(this, params);
    }
}
```

---

## 2. get-me.use-case.ts

**Ruta:** `src/modules/auth/application/use-cases/get-me.use-case.ts`

```typescript
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';

import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import { MeResponseDto } from '../dtos/me-response.dto';

@Injectable()
export class GetMeUseCase {
    constructor(
        @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
    ) {}

    async execute(userId: string): Promise<MeResponseDto> {
        const user = await this.userRepository.findById(userId);

        if (!user) {
            // El JWT era válido pero el usuario fue eliminado después de emitirlo
            throw new UnauthorizedException('User no longer exists');
        }

        const profileComplete = await this.userRepository.hasProfile(userId);

        return new MeResponseDto({
            id: user.id,
            email: user.email,
            username: user.username,
            role: user.role,
            status: user.status,
            profileComplete,
            createdAt: user.createdAt,
        });
    }
}
```

---

## 3. auth.service.ts (acumulativo — estado final Fase 1)

**Ruta:** `src/modules/auth/application/services/auth.service.ts`

```typescript
import { Injectable } from '@nestjs/common';

import { RegisterDto } from '../dtos/register.dto';
import { LoginDto } from '../dtos/login.dto';
import { VerifyEmailDto } from '../dtos/verify-email.dto';
import { ResendVerificationDto } from '../dtos/resend-verification.dto';
import { AuthResponseDto } from '../dtos/auth-response.dto';
import { MeResponseDto } from '../dtos/me-response.dto';
import { AuthMapper } from '../mappers/auth.mapper';
import { RegisterUseCase } from '../use-cases/register.use-case';
import { LoginUseCase } from '../use-cases/login.use-case';
import { VerifyEmailUseCase } from '../use-cases/verify-email.use-case';
import { ResendVerificationUseCase } from '../use-cases/resend-verification.use-case';
import { GetMeUseCase } from '../use-cases/get-me.use-case';
import { JwtService } from '../../infrastructure/services/jwt.service';

@Injectable()
export class AuthService {
    constructor(
        private readonly registerUseCase: RegisterUseCase,
        private readonly loginUseCase: LoginUseCase,
        private readonly verifyEmailUseCase: VerifyEmailUseCase,
        private readonly resendVerificationUseCase: ResendVerificationUseCase,
        private readonly getMeUseCase: GetMeUseCase,
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
        return { message: 'If the email exists and is unverified, a new code has been sent' };
    }

    async getMe(userId: string): Promise<MeResponseDto> {
        return this.getMeUseCase.execute(userId);
    }
}
```

---

## 4. auth-controller.swagger.ts (acumulativo — estado final Fase 1)

**Ruta:** `src/modules/auth/presentation/swagger/auth-controller.swagger.ts`

```typescript
import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';

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

export function ApiGetMe() {
    return applyDecorators(
        ApiBearerAuth(),
        ApiOperation({ summary: 'Estado actual del usuario autenticado' }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Devuelve status y profileComplete para navegación del frontend',
            schema: {
                type: 'object',
                properties: {
                    id:              { type: 'string', example: 'uuid-v4' },
                    email:           { type: 'string', example: 'jugador@ejemplo.com' },
                    username:        { type: 'string', example: 'duver_10' },
                    role:            { type: 'string', enum: ['PLAYER', 'ORGANIZER', 'SPECTATOR'] },
                    status:          { type: 'string', enum: ['pending_verification', 'active', 'suspended', 'banned'] },
                    profileComplete: { type: 'boolean', example: false },
                    createdAt:       { type: 'string', format: 'date-time' },
                },
            },
        }),
        ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token inválido o expirado' }),
    );
}
```

---

## 5. auth.controller.ts (acumulativo — estado final Fase 1)

**Ruta:** `src/modules/auth/presentation/controllers/auth.controller.ts`

```typescript
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { RegisterDto } from '../../application/dtos/register.dto';
import { LoginDto } from '../../application/dtos/login.dto';
import { VerifyEmailDto } from '../../application/dtos/verify-email.dto';
import { ResendVerificationDto } from '../../application/dtos/resend-verification.dto';
import { AuthResponseDto } from '../../application/dtos/auth-response.dto';
import { MeResponseDto } from '../../application/dtos/me-response.dto';
import { AuthService } from '../../application/services/auth.service';
import { Public } from '../decorators/public.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import {
    ApiGetMe,
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

    // Requiere JWT — JwtAuthGuard global activo (no @Public)
    @Get('me')
    @HttpCode(HttpStatus.OK)
    @ApiGetMe()
    async getMe(@CurrentUser() user: { userId: string }): Promise<MeResponseDto> {
        return this.authService.getMe(user.userId);
    }
}
```

---

## 6. auth.module.ts (acumulativo — estado final Fase 1)

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
import { GetMeUseCase } from './application/use-cases/get-me.use-case';
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
        GetMeUseCase,
        AuthService,
        JwtAuthGuard,
    ],
    exports: [JwtAuthGuard, JwtService],
})
export class AuthModule {}
```

---

## Orden de aplicación

1. Crear `me-response.dto.ts`
2. Crear `get-me.use-case.ts`
3. Actualizar `auth.service.ts`
4. Actualizar `auth-controller.swagger.ts`
5. Actualizar `auth.controller.ts`
6. Actualizar `auth.module.ts`
