# Propuesta: POST /auth/verify-email

Implementación de la verificación de email por token. Incluye la creación del `EmailNotificationService` (stub reemplazable) y la actualización del `RegisterUseCase` para que genere el token, lo persista **y envíe el correo automáticamente** dentro del mismo endpoint de registro.

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/modules/auth/domain/exceptions/verification-token-invalid.exception.ts` | Crear |
| `src/modules/auth/domain/exceptions/verification-token-expired.exception.ts` | Crear |
| `src/modules/auth/domain/repositories/verification.repository.interface.ts` | Crear |
| `src/modules/auth/application/dtos/verify-email.dto.ts` | Crear |
| `src/modules/auth/application/use-cases/verify-email.use-case.ts` | Crear |
| `src/config/email.config.ts` | Crear |
| `src/config/env.validation.ts` | Actualizar (agregar RESEND\_API\_KEY, EMAIL\_FROM, APP\_URL) |
| `src/app.module.ts` | Actualizar (cargar emailConfig) |
| `src/modules/auth/infrastructure/services/email-notification.service.ts` | Crear (implementación Resend) |
| `src/modules/auth/application/use-cases/register.use-case.ts` | Actualizar (genera token y envía correo al registrar) |
| `src/modules/auth/application/services/auth.service.ts` | Actualizar |
| `src/infrastructure/database/schemas/verification.schema.ts` | Crear |
| `src/modules/auth/infrastructure/repositories/verification.repository.ts` | Crear |
| `src/modules/auth/presentation/controllers/auth.controller.ts` | Actualizar |
| `src/modules/auth/presentation/swagger/auth-controller.swagger.ts` | Actualizar |
| `src/modules/auth/auth.module.ts` | Actualizar |

> **Dependencia:** Requiere propuesta 07 (login) aplicada previamente.

---

## 1. verification-token-invalid.exception.ts

**Ruta:** `src/modules/auth/domain/exceptions/verification-token-invalid.exception.ts`

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class VerificationTokenInvalidException extends DomainException {
    constructor() {
        super('Verification token is invalid or has already been used', 400, 'VERIFICATION_TOKEN_INVALID');
    }
}
```

---

## 2. verification-token-expired.exception.ts

**Ruta:** `src/modules/auth/domain/exceptions/verification-token-expired.exception.ts`

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class VerificationTokenExpiredException extends DomainException {
    constructor() {
        super('Verification token has expired', 400, 'VERIFICATION_TOKEN_EXPIRED');
    }
}
```

---

## 3. verification.repository.interface.ts

**Ruta:** `src/modules/auth/domain/repositories/verification.repository.interface.ts`

```typescript
export interface CreateVerificationParams {
    userId: string;
    type: string;
    token: string;
    expiresAt: Date;
}

export interface VerificationRecord {
    id: string;
    userId: string;
    type: string;
    token: string;
    expiresAt: Date;
    usedAt: Date | null;
    attempts: number;
    maxAttempts: number;
    createdAt: Date;
}

export interface IVerificationRepository {
    create(params: CreateVerificationParams): Promise<void>;
    findByToken(token: string, type: string): Promise<VerificationRecord | null>;
    markAsUsed(id: string): Promise<void>;
    invalidatePreviousTokens(userId: string, type: string): Promise<void>;
}

export const VERIFICATION_REPOSITORY = Symbol('IVerificationRepository');
```

---

## 4. verify-email.dto.ts

**Ruta:** `src/modules/auth/application/dtos/verify-email.dto.ts`

```typescript
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyEmailDto {
    @IsString()
    @IsNotEmpty()
    @Length(64, 64, { message: 'token must be exactly 64 characters' })
    token!: string;
}
```

---

## 5. verify-email.use-case.ts

**Ruta:** `src/modules/auth/application/use-cases/verify-email.use-case.ts`

```typescript
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
    ) {}

    async execute(token: string): Promise<void> {
        const record = await this.verificationRepository.findByToken(token, 'email_verification');

        if (!record || record.usedAt !== null) {
            throw new VerificationTokenInvalidException();
        }

        if (new Date() > record.expiresAt) {
            throw new VerificationTokenExpiredException();
        }

        await this.verificationRepository.markAsUsed(record.id);
        await this.userRepository.updateStatus(record.userId, 'active');
    }
}
```

---

## 6. email.config.ts

**Ruta:** `src/config/email.config.ts`

```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('email', () => ({
    resendApiKey: process.env.RESEND_API_KEY!,
    fromEmail: process.env.EMAIL_FROM ?? 'noreply@3tiempo.com',
    appUrl: process.env.APP_URL ?? 'http://localhost:3000',
}));
```

---

## 6b. env.validation.ts (actualizado)

Agregar las tres variables al final de la clase `EnvironmentVariables`.

**Ruta:** `src/config/env.validation.ts`

```typescript
// Agregar al final de la clase EnvironmentVariables existente:

    @IsString()
    @IsNotEmpty()
    RESEND_API_KEY: string;

    @IsString()
    @IsNotEmpty()
    EMAIL_FROM: string;

    @IsString()
    @IsNotEmpty()
    APP_URL: string;
```

---

## 6c. app.module.ts (actualizado — agregar emailConfig)

Solo se agrega `emailConfig` al array `load`.

**Ruta:** `src/app.module.ts`

```typescript
import emailConfig from './config/email.config';
// ...resto de imports existentes...

// Dentro de ConfigModule.forRoot:
load: [databaseConfig, jwtConfig, appConfig, throttleConfig, loggerConfig, emailConfig],
```

---

## 6d. Variables en .env

Agregar al archivo `.env` del proyecto:

```env
# Email — Resend
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=noreply@tudominio.com
APP_URL=https://tudominio.com
```

> **Pasos en Resend (resend.com):**
> 1. Crear cuenta gratuita
> 2. Settings → Domains → Add Domain → verificar el dominio con DNS
> 3. API Keys → Create API Key → copiar en `RESEND_API_KEY`
> 4. El `EMAIL_FROM` debe usar el dominio verificado

---

## 6e. email-notification.service.ts

Implementación real con Resend. Para cambiar de proveedor en el futuro, solo se modifica este archivo.

**Ruta:** `src/modules/auth/infrastructure/services/email-notification.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface VerificationEmailPayload {
    to: string;
    token: string;
    expiresAt: Date;
}

export const EMAIL_NOTIFICATION_SERVICE = Symbol('IEmailNotificationService');

export interface IEmailNotificationService {
    sendVerificationEmail(payload: VerificationEmailPayload): Promise<void>;
}

@Injectable()
export class EmailNotificationService implements IEmailNotificationService {
    private readonly resend: Resend;
    private readonly logger = new Logger(EmailNotificationService.name);
    private readonly fromEmail: string;
    private readonly appUrl: string;

    constructor(private readonly configService: ConfigService) {
        this.resend    = new Resend(this.configService.get<string>('email.resendApiKey')!);
        this.fromEmail = this.configService.get<string>('email.fromEmail')!;
        this.appUrl    = this.configService.get<string>('email.appUrl')!;
    }

    async sendVerificationEmail(payload: VerificationEmailPayload): Promise<void> {
        const verifyUrl = `${this.appUrl}/auth/verify-email?token=${payload.token}`;

        const { error } = await this.resend.emails.send({
            from: this.fromEmail,
            to:   payload.to,
            subject: 'Verifica tu cuenta en 3TIEMPO',
            html: `
                <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
                    <h2 style="color:#1e293b">Bienvenido a 3TIEMPO ⚽</h2>
                    <p>Haz clic en el botón para verificar tu correo electrónico:</p>
                    <a href="${verifyUrl}"
                       style="display:inline-block;padding:12px 24px;background:#2563eb;
                              color:#fff;text-decoration:none;border-radius:6px;
                              font-weight:600;margin:16px 0">
                        Verificar correo
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
                        Si no creaste esta cuenta, ignora este correo.
                    </p>
                </div>
            `,
        });

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

---

## 7. register.use-case.ts (actualizado)

Se agrega la generación del token de verificación y el **envío automático del correo** al final del registro.

**Ruta:** `src/modules/auth/application/use-cases/register.use-case.ts`

```typescript
import * as crypto from 'crypto';

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
    ) {}

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
```

---

## 8. verification.schema.ts

**Ruta:** `src/infrastructure/database/schemas/verification.schema.ts`

```typescript
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('verifications')
export class VerificationSchema {
    @PrimaryGeneratedColumn({ type: 'bigint' })
    id!: string;

    @Column({ name: 'user_id', type: 'uuid' })
    userId!: string;

    @Column({ type: 'varchar', length: 50 })
    type!: string;

    @Column({ type: 'varchar', length: 255 })
    token!: string;

    @Column({ name: 'expires_at', type: 'timestamp' })
    expiresAt!: Date;

    @Column({ name: 'used_at', type: 'timestamp', nullable: true })
    usedAt!: Date | null;

    @Column({ type: 'smallint', default: 0 })
    attempts!: number;

    @Column({ name: 'max_attempts', type: 'smallint', default: 5 })
    maxAttempts!: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;
}
```

---

## 9. verification.repository.ts

**Ruta:** `src/modules/auth/infrastructure/repositories/verification.repository.ts`

```typescript
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
    ) {}

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
```

---

## 10. auth.service.ts (acumulativo)

**Ruta:** `src/modules/auth/application/services/auth.service.ts`

```typescript
import { Injectable } from '@nestjs/common';

import { RegisterDto } from '../dtos/register.dto';
import { LoginDto } from '../dtos/login.dto';
import { VerifyEmailDto } from '../dtos/verify-email.dto';
import { AuthResponseDto } from '../dtos/auth-response.dto';
import { AuthMapper } from '../mappers/auth.mapper';
import { RegisterUseCase } from '../use-cases/register.use-case';
import { LoginUseCase } from '../use-cases/login.use-case';
import { VerifyEmailUseCase } from '../use-cases/verify-email.use-case';
import { JwtService } from '../../infrastructure/services/jwt.service';

@Injectable()
export class AuthService {
    constructor(
        private readonly registerUseCase: RegisterUseCase,
        private readonly loginUseCase: LoginUseCase,
        private readonly verifyEmailUseCase: VerifyEmailUseCase,
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
}
```

---

## 11. auth-controller.swagger.ts (acumulativo)

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
        ApiQuery({ name: 'token', required: true, description: 'Token de 64 caracteres recibido por email' }),
        ApiResponse({ status: HttpStatus.OK, description: 'Email verificado correctamente' }),
        ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Token inválido o expirado' }),
    );
}
```

---

## 12. auth.controller.ts (acumulativo)

**Ruta:** `src/modules/auth/presentation/controllers/auth.controller.ts`

```typescript
import { Body, Controller, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { RegisterDto } from '../../application/dtos/register.dto';
import { LoginDto } from '../../application/dtos/login.dto';
import { VerifyEmailDto } from '../../application/dtos/verify-email.dto';
import { AuthResponseDto } from '../../application/dtos/auth-response.dto';
import { AuthService } from '../../application/services/auth.service';
import { Public } from '../decorators/public.decorator';
import { ApiRegister, ApiLogin, ApiVerifyEmail } from '../swagger/auth-controller.swagger';

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
}
```

---

## 13. auth.module.ts (acumulativo)

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
        AuthService,
        JwtAuthGuard,
    ],
    exports: [JwtAuthGuard, JwtService],
})
export class AuthModule {}
```

---

## Orden de aplicación

0. Instalar Resend: `npm install resend`
1. Crear cuenta en resend.com, verificar dominio, obtener API key
2. Agregar `RESEND_API_KEY`, `EMAIL_FROM` y `APP_URL` al `.env`
3. Crear `src/config/email.config.ts`
4. Actualizar `src/config/env.validation.ts` (agregar las 3 variables)
5. Actualizar `src/app.module.ts` (agregar `emailConfig` al array `load`)
6. Crear los dos archivos de excepciones (`verification-token-invalid`, `verification-token-expired`)
7. Crear `verification.repository.interface.ts`
8. Crear `verify-email.dto.ts`
9. Crear `verification.schema.ts`
10. Crear `verification.repository.ts`
11. Crear `verify-email.use-case.ts`
12. Crear `email-notification.service.ts`
13. Actualizar `register.use-case.ts` (genera token + envía correo automáticamente)
14. Actualizar `auth.service.ts`
15. Actualizar `auth-controller.swagger.ts`
16. Actualizar `auth.controller.ts`
17. Actualizar `auth.module.ts`
