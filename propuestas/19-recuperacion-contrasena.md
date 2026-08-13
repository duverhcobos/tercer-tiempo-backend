# Propuesta: Recuperación de contraseña (POST /auth/forgot-password + POST /auth/reset-password)

Habilita el flujo de "olvidé mi contraseña" para usuarios que no pueden iniciar sesión: `POST /auth/forgot-password` genera un token de un solo uso (tipo `password_reset`, ya soportado por el enum `verification_type` desde la migración de Fase 1) y lo envía por email; `POST /auth/reset-password` consume ese token y establece la nueva contraseña. Ambos endpoints son públicos y siguen el mismo patrón de no-enumeración de emails que `09-resend-verification.md`.

Reutiliza la tabla `verifications` (sin migración nueva) y las excepciones de token ya existentes (`VerificationTokenInvalidException`, `VerificationTokenExpiredException`), creadas en `08-verify-email.md`.

> **Dependencia:** Requiere las propuestas 07, 08 y 09 ya aplicadas (usan las mismas piezas: `IVerificationRepository`, `IEmailNotificationService`, excepciones de token).

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/modules/auth/application/dtos/forgot-password.dto.ts` | Crear |
| `src/modules/auth/application/dtos/reset-password.dto.ts` | Crear |
| `src/modules/auth/presentation/controllers/auth.controller.ts` | Actualizar |
| `src/modules/auth/application/services/auth.service.ts` | Actualizar |
| `src/modules/auth/application/use-cases/forgot-password.use-case.ts` | Crear |
| `src/modules/auth/application/use-cases/reset-password.use-case.ts` | Crear |
| `src/modules/auth/domain/repositories/user.repository.interface.ts` | Actualizar — agregar `updatePassword` |
| `src/modules/auth/infrastructure/services/email-notification.service.ts` | Actualizar — agregar `sendPasswordResetEmail` |
| `src/modules/auth/infrastructure/repositories/user.repository.ts` | Actualizar — implementar `updatePassword` |
| `src/modules/auth/auth.module.ts` | Actualizar |

---

## 1. forgot-password.dto.ts (archivo nuevo)

**Ruta:** `src/modules/auth/application/dtos/forgot-password.dto.ts`

```typescript
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgotPasswordDto {
    @IsEmail({}, { message: 'email must be an email' })
    @IsNotEmpty({ message: 'email should not be empty' })
    email!: string;
}
```

---

## 2. reset-password.dto.ts (archivo nuevo)

**Ruta:** `src/modules/auth/application/dtos/reset-password.dto.ts`

```typescript
import { IsNotEmpty, IsString, Length, MinLength } from 'class-validator';

export class ResetPasswordDto {
    @IsString()
    @IsNotEmpty()
    @Length(64, 64, { message: 'token must be exactly 64 characters' })
    token!: string;

    @IsString()
    @MinLength(8, { message: 'Password must be at least 8 characters long' })
    @IsNotEmpty({ message: 'Password is required' })
    newPassword!: string;
}
```

---

## 3. auth.controller.ts (archivo existente — actualización)

**Ruta:** `src/modules/auth/presentation/controllers/auth.controller.ts`

**Antes:**
```typescript
import { AuthResponseDto } from '../../application/dtos/auth-response.dto';
import { LoginDto } from '../../application/dtos/login.dto';
import { MeResponseDto } from '../../application/dtos/me-response.dto';
import { RegisterDto } from '../../application/dtos/register.dto';
import { ResendVerificationDto } from '../../application/dtos/resend-verification.dto';
import { VerifyEmailDto } from '../../application/dtos/verify-email.dto';
import { AuthService } from '../../application/services/auth.service';
```

```typescript
    @Public()
    @Post('resend-verification')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 3, ttl: 300000 } })
    // @ApiResendVerification()
    async resendVerification(@Body() dto: ResendVerificationDto): Promise<{ message: string }> {
        return this.authService.resendVerification(dto);
    }

    // Requiere JWT — JwtAuthGuard global activo (no @Public)
    @Get('me')
```

**Después:**
```typescript
import { AuthResponseDto } from '../../application/dtos/auth-response.dto';
import { ForgotPasswordDto } from '../../application/dtos/forgot-password.dto';
import { LoginDto } from '../../application/dtos/login.dto';
import { MeResponseDto } from '../../application/dtos/me-response.dto';
import { RegisterDto } from '../../application/dtos/register.dto';
import { ResendVerificationDto } from '../../application/dtos/resend-verification.dto';
import { ResetPasswordDto } from '../../application/dtos/reset-password.dto';
import { VerifyEmailDto } from '../../application/dtos/verify-email.dto';
import { AuthService } from '../../application/services/auth.service';
```

```typescript
    @Public()
    @Post('resend-verification')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 3, ttl: 300000 } })
    // @ApiResendVerification()
    async resendVerification(@Body() dto: ResendVerificationDto): Promise<{ message: string }> {
        return this.authService.resendVerification(dto);
    }

    @Public()
    @Post('forgot-password')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 3, ttl: 300000 } })
    // @ApiForgotPassword()
    async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ message: string }> {
        return this.authService.forgotPassword(dto);
    }

    @Public()
    @Post('reset-password')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    // @ApiResetPassword()
    async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
        return this.authService.resetPassword(dto);
    }

    // Requiere JWT — JwtAuthGuard global activo (no @Public)
    @Get('me')
```

---

## 4. auth.service.ts (archivo existente — actualización)

**Ruta:** `src/modules/auth/application/services/auth.service.ts`

**Antes:**
```typescript
import { JwtService } from '../../infrastructure/services/jwt.service';
import { AuthResponseDto } from '../dtos/auth-response.dto';
import { LoginDto } from '../dtos/login.dto';
import { MeResponseDto } from '../dtos/me-response.dto';
import { RegisterDto } from '../dtos/register.dto';
import { ResendVerificationDto } from '../dtos/resend-verification.dto';
import { VerifyEmailDto } from '../dtos/verify-email.dto';
import { AuthMapper } from '../mappers/auth.mapper';
import { GetMeUseCase } from '../use-cases/get-me.use-case';
import { LoginUseCase } from '../use-cases/login.use-case';
import { RegisterUseCase } from '../use-cases/register.use-case';
import { ResendVerificationUseCase } from '../use-cases/resend-verification.use-case';
import { VerifyEmailUseCase } from '../use-cases/verify-email.use-case';

@Injectable()
export class AuthService {
    constructor(
        private readonly registerUseCase: RegisterUseCase,
        private readonly loginUseCase: LoginUseCase,
        private readonly verifyEmailUseCase: VerifyEmailUseCase,
        private readonly resendVerificationUseCase: ResendVerificationUseCase,
        private readonly getMeUseCase: GetMeUseCase,
        private readonly jwtService: JwtService,
    ) { }
```

```typescript
    async resendVerification(dto: ResendVerificationDto): Promise<{ message: string }> {
        await this.resendVerificationUseCase.execute(dto.email);
        // Siempre responde con el mismo mensaje para no enumerar si el email existe
        return { message: 'If the email exists and is unverified, a new code has been sent' };
    }

    async getMe(userId: string): Promise<MeResponseDto> {
        return this.getMeUseCase.execute(userId);
    }
}
```

**Después:**
```typescript
import { JwtService } from '../../infrastructure/services/jwt.service';
import { AuthResponseDto } from '../dtos/auth-response.dto';
import { ForgotPasswordDto } from '../dtos/forgot-password.dto';
import { LoginDto } from '../dtos/login.dto';
import { MeResponseDto } from '../dtos/me-response.dto';
import { RegisterDto } from '../dtos/register.dto';
import { ResendVerificationDto } from '../dtos/resend-verification.dto';
import { ResetPasswordDto } from '../dtos/reset-password.dto';
import { VerifyEmailDto } from '../dtos/verify-email.dto';
import { AuthMapper } from '../mappers/auth.mapper';
import { ForgotPasswordUseCase } from '../use-cases/forgot-password.use-case';
import { GetMeUseCase } from '../use-cases/get-me.use-case';
import { LoginUseCase } from '../use-cases/login.use-case';
import { RegisterUseCase } from '../use-cases/register.use-case';
import { ResendVerificationUseCase } from '../use-cases/resend-verification.use-case';
import { ResetPasswordUseCase } from '../use-cases/reset-password.use-case';
import { VerifyEmailUseCase } from '../use-cases/verify-email.use-case';

@Injectable()
export class AuthService {
    constructor(
        private readonly registerUseCase: RegisterUseCase,
        private readonly loginUseCase: LoginUseCase,
        private readonly verifyEmailUseCase: VerifyEmailUseCase,
        private readonly resendVerificationUseCase: ResendVerificationUseCase,
        private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
        private readonly resetPasswordUseCase: ResetPasswordUseCase,
        private readonly getMeUseCase: GetMeUseCase,
        private readonly jwtService: JwtService,
    ) { }
```

```typescript
    async resendVerification(dto: ResendVerificationDto): Promise<{ message: string }> {
        await this.resendVerificationUseCase.execute(dto.email);
        // Siempre responde con el mismo mensaje para no enumerar si el email existe
        return { message: 'If the email exists and is unverified, a new code has been sent' };
    }

    async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
        await this.forgotPasswordUseCase.execute(dto.email);
        // Siempre responde con el mismo mensaje para no enumerar si el email existe
        return { message: 'If the email exists, password reset instructions have been sent' };
    }

    async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
        await this.resetPasswordUseCase.execute(dto.token, dto.newPassword);
        return { message: 'Password has been reset successfully' };
    }

    async getMe(userId: string): Promise<MeResponseDto> {
        return this.getMeUseCase.execute(userId);
    }
}
```

---

## 5. forgot-password.use-case.ts (archivo nuevo)

**Ruta:** `src/modules/auth/application/use-cases/forgot-password.use-case.ts`

```typescript
import * as crypto from 'node:crypto';

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

@Injectable()
export class ForgotPasswordUseCase {
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

        // Invalidar tokens de reset anteriores del mismo usuario
        await this.verificationRepository.invalidatePreviousTokens(user.id, 'password_reset');

        // Token de reset: más corto que el de verificación de email (1h vs 24h)
        // porque otorga control total de la cuenta si se filtra.
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

        await this.verificationRepository.create({
            userId: user.id,
            type: 'password_reset',
            token,
            expiresAt,
        });

        await this.emailService.sendPasswordResetEmail({
            to: user.email,
            token,
            expiresAt,
        });
    }
}
```

---

## 6. reset-password.use-case.ts (archivo nuevo)

**Ruta:** `src/modules/auth/application/use-cases/reset-password.use-case.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';

import { Password } from '../../domain/value-objects/password.vo';
import { VerificationTokenExpiredException } from '../../domain/exceptions/verification-token-expired.exception';
import { VerificationTokenInvalidException } from '../../domain/exceptions/verification-token-invalid.exception';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import {
    IVerificationRepository,
    VERIFICATION_REPOSITORY,
} from '../../domain/repositories/verification.repository.interface';
import { BcryptService } from '../../infrastructure/services/bcrypt.service';

@Injectable()
export class ResetPasswordUseCase {
    constructor(
        @Inject(VERIFICATION_REPOSITORY)
        private readonly verificationRepository: IVerificationRepository,
        @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
        private readonly bcryptService: BcryptService,
    ) { }

    async execute(token: string, newPassword: string): Promise<void> {
        const record = await this.verificationRepository.findByToken(token, 'password_reset');

        if (record?.usedAt !== null) {
            throw new VerificationTokenInvalidException();
        }

        if (new Date() > record.expiresAt) {
            throw new VerificationTokenExpiredException();
        }

        const passwordVO = new Password(newPassword);
        const hashedPassword = await this.bcryptService.hash(passwordVO.getValue());

        await this.verificationRepository.markAsUsed(record.id);
        await this.userRepository.updatePassword(record.userId, hashedPassword);
    }
}
```

---

## 7. user.repository.interface.ts (archivo existente — actualización)

**Ruta:** `src/modules/auth/domain/repositories/user.repository.interface.ts`

**Antes:**
```typescript
export interface IUserRepository {
    findByEmail(email: string): Promise<User | null>;
    findByUsername(username: string): Promise<User | null>;
    findById(id: string): Promise<User | null>;
    findByEmailWithRole(email: string): Promise<User | null>;
    registerWithRole(user: User, role: UserRole): Promise<User>;
    updateLastLoginAt(userId: string): Promise<void>;
    updateStatus(userId: string, status: string): Promise<void>;
    hasProfile(userId: string): Promise<boolean>;
}
```

**Después:**
```typescript
export interface IUserRepository {
    findByEmail(email: string): Promise<User | null>;
    findByUsername(username: string): Promise<User | null>;
    findById(id: string): Promise<User | null>;
    findByEmailWithRole(email: string): Promise<User | null>;
    registerWithRole(user: User, role: UserRole): Promise<User>;
    updateLastLoginAt(userId: string): Promise<void>;
    updateStatus(userId: string, status: string): Promise<void>;
    updatePassword(userId: string, passwordHash: string): Promise<void>;
    hasProfile(userId: string): Promise<boolean>;
}
```

---

## 8. email-notification.service.ts (archivo existente — actualización)

**Ruta:** `src/modules/auth/infrastructure/services/email-notification.service.ts`

**Antes:**
```typescript
export const EMAIL_NOTIFICATION_SERVICE = Symbol('IEmailNotificationService');

export interface IEmailNotificationService {
    sendVerificationEmail(payload: VerificationEmailPayload): Promise<void>;
}
```

```typescript
        if (error) {
            this.logger.error(
                `Failed to send verification email to ${payload.to}: ${JSON.stringify(error)}`,
            );
            // No lanzamos excepción: el usuario ya fue registrado.
            // El correo puede reenviarse con POST /auth/resend-verification.
            return;
        }

        this.logger.log(`Verification email sent to ${payload.to}`);
    }
}
```

**Después:**
```typescript
export const EMAIL_NOTIFICATION_SERVICE = Symbol('IEmailNotificationService');

export interface IEmailNotificationService {
    sendVerificationEmail(payload: VerificationEmailPayload): Promise<void>;
    sendPasswordResetEmail(payload: VerificationEmailPayload): Promise<void>;
}
```

```typescript
        if (error) {
            this.logger.error(
                `Failed to send verification email to ${payload.to}: ${JSON.stringify(error)}`,
            );
            // No lanzamos excepción: el usuario ya fue registrado.
            // El correo puede reenviarse con POST /auth/resend-verification.
            return;
        }

        this.logger.log(`Verification email sent to ${payload.to}`);
    }

    async sendPasswordResetEmail(payload: VerificationEmailPayload): Promise<void> {
        const resetUrl = `${this.appUrl}/auth/reset-password?token=${payload.token}`;

        const { error } = await this.resend.emails.send({
            from: this.fromEmail,
            to: payload.to,
            subject: 'Restablece tu contraseña en 3TIEMPO',
            html: `
                <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
                    <h2 style="color:#1e293b">Restablece tu contraseña</h2>
                    <p>Haz clic en el botón para elegir una nueva contraseña:</p>
                    <a href="${resetUrl}"
                       style="display:inline-block;padding:12px 24px;background:#2563eb;
                              color:#fff;text-decoration:none;border-radius:6px;
                              font-weight:600;margin:16px 0">
                        Restablecer contraseña
                    </a>
                    <p style="color:#64748b;font-size:14px">
                        O copia este token en la aplicación:
                    </p>
                    <code style="display:block;background:#f1f5f9;padding:12px;
                                 border-radius:6px;font-size:13px;word-break:break-all">
                        ${payload.token}
                    </code>
                    <p style="color:#94a3b8;font-size:12px;margin-top:24px">
                        Este enlace expira el
                        ${payload.expiresAt.toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' })}.
                        Si no solicitaste este cambio, ignora este correo: tu contraseña actual sigue siendo válida.
                    </p>
                </div>
            `,
        });

        if (error) {
            this.logger.error(
                `Failed to send password reset email to ${payload.to}: ${JSON.stringify(error)}`,
            );
            // No lanzamos excepción: si el envío falla, el usuario puede solicitar
            // un nuevo link con POST /auth/forgot-password.
            return;
        }

        this.logger.log(`Password reset email sent to ${payload.to}`);
    }
}
```

---

## 9. user.repository.ts (archivo existente — actualización)

**Ruta:** `src/modules/auth/infrastructure/repositories/user.repository.ts`

**Antes:**
```typescript
    async updateStatus(userId: string, status: string): Promise<void> {
        await this.userSchemaRepository.update(userId, { status });
    }

    async hasProfile(userId: string): Promise<boolean> {
```

**Después:**
```typescript
    async updateStatus(userId: string, status: string): Promise<void> {
        await this.userSchemaRepository.update(userId, { status });
    }

    async updatePassword(userId: string, passwordHash: string): Promise<void> {
        await this.userSchemaRepository.update(userId, { passwordHash });
    }

    async hasProfile(userId: string): Promise<boolean> {
```

---

## 10. auth.module.ts (archivo existente — actualización)

**Ruta:** `src/modules/auth/auth.module.ts`

**Antes:**
```typescript
import { AuthService } from './application/services/auth.service';
import { GetMeUseCase } from './application/use-cases/get-me.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
// Application
import { RegisterUseCase } from './application/use-cases/register.use-case';
import { ResendVerificationUseCase } from './application/use-cases/resend-verification.use-case';
import { VerifyEmailUseCase } from './application/use-cases/verify-email.use-case';
```

```typescript
        // Application
        RegisterUseCase,
        LoginUseCase,
        VerifyEmailUseCase,
        ResendVerificationUseCase,
        GetMeUseCase,
        AuthService,
```

**Después:**
```typescript
import { AuthService } from './application/services/auth.service';
import { ForgotPasswordUseCase } from './application/use-cases/forgot-password.use-case';
import { GetMeUseCase } from './application/use-cases/get-me.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
// Application
import { RegisterUseCase } from './application/use-cases/register.use-case';
import { ResendVerificationUseCase } from './application/use-cases/resend-verification.use-case';
import { ResetPasswordUseCase } from './application/use-cases/reset-password.use-case';
import { VerifyEmailUseCase } from './application/use-cases/verify-email.use-case';
```

```typescript
        // Application
        RegisterUseCase,
        LoginUseCase,
        VerifyEmailUseCase,
        ResendVerificationUseCase,
        ForgotPasswordUseCase,
        ResetPasswordUseCase,
        GetMeUseCase,
        AuthService,
```

---

## Notas

- **No-enumeración de emails:** `forgot-password` siempre responde `200` con un mensaje genérico, exista o no el email — mismo patrón que `resend-verification`.
- **Expiración corta:** el token de `password_reset` expira en 1 hora (vs. 24h de `email_verification`) porque otorga control total de la cuenta si se filtra por el canal de email.
- **Un solo token activo:** igual que en `resend-verification`, cada solicitud invalida los tokens `password_reset` previos del usuario antes de crear uno nuevo.
- **Reutilización de excepciones:** no se crean excepciones nuevas; `reset-password` reutiliza `VerificationTokenInvalidException` y `VerificationTokenExpiredException` (ya existentes desde `08-verify-email.md`), porque la lógica de validación de token es idéntica (token inexistente/usado → inválido; token vencido → expirado).
- **Sin migración:** no se requiere cambio de esquema. `password_hash` en `users` y el valor `'password_reset'` de `verification_type` ya existen desde la migración de Fase 1 (`1706140000000-CreateUsersTable.ts`).
- **Pendiente fuera de alcance:** el proyecto todavía no implementa `user_sessions` (refresh tokens). Cuando se implemente la gestión de sesiones multi-dispositivo, esta propuesta debería extenderse para revocar todas las sesiones activas del usuario tras un reset de contraseña exitoso — hoy no hay sesiones que revocar.
- **Mapper de aplicación:** no aplica en esta propuesta. Igual que `verifyEmail`/`resendVerification` en `auth.service.ts`, ambos use-cases retornan `void` (no una entidad de dominio) y el `service` construye directamente el objeto `{ message }`; no hay transformación domain entity → DTO que requiera `application/mappers/`.
- **Sin `.spec.ts` en esta propuesta:** siguiendo el flujo del proyecto, las pruebas unitarias de `forgot-password.use-case.ts` y `reset-password.use-case.ts` se agregan en una propuesta/aplicación separada una vez aplicado este código (ver checklist de pruebas en `AGENTS.md`).

## Orden de aplicación

1. Crear `forgot-password.dto.ts`
2. Crear `reset-password.dto.ts`
3. Actualizar `auth.controller.ts`
4. Actualizar `auth.service.ts`
5. Crear `forgot-password.use-case.ts`
6. Crear `reset-password.use-case.ts`
7. Actualizar `user.repository.interface.ts`
8. Actualizar `email-notification.service.ts`
9. Actualizar `user.repository.ts`
10. Actualizar `auth.module.ts`
