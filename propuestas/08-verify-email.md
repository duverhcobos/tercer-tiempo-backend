# Propuesta: POST /auth/verify-email

Implementación de la verificación de email por token. Incluye la actualización del `RegisterUseCase` para que genere y persista el token de verificación al registrar.

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/modules/auth/domain/exceptions/verification-token-invalid.exception.ts` | Crear |
| `src/modules/auth/domain/exceptions/verification-token-expired.exception.ts` | Crear |
| `src/modules/auth/domain/repositories/verification.repository.interface.ts` | Crear |
| `src/modules/auth/application/dtos/verify-email.dto.ts` | Crear |
| `src/modules/auth/application/use-cases/verify-email.use-case.ts` | Crear |
| `src/modules/auth/application/use-cases/register.use-case.ts` | Actualizar (genera token al registrar) |
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
        super('Verification token is invalid or has already been used', 400);
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
        super('Verification token has expired', 400);
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

## 6. register.use-case.ts (actualizado)

Se agrega la generación del token de verificación de email al final del registro.

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

@Injectable()
export class RegisterUseCase {
    constructor(
        @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
        @Inject(VERIFICATION_REPOSITORY)
        private readonly verificationRepository: IVerificationRepository,
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

        // TODO: enviar email con el token (EmailNotificationService — Propuesta 09)

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

## 7. verification.schema.ts

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

## 8. verification.repository.ts

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

## 9. auth.service.ts (acumulativo)

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

## 10. auth-controller.swagger.ts (acumulativo)

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

## 11. auth.controller.ts (acumulativo)

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

## 12. auth.module.ts (acumulativo)

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

1. Crear los dos archivos de excepciones (`verification-token-invalid`, `verification-token-expired`)
2. Crear `verification.repository.interface.ts`
3. Crear `verify-email.dto.ts`
4. Crear `verification.schema.ts`
5. Crear `verification.repository.ts`
6. Crear `verify-email.use-case.ts`
7. Actualizar `register.use-case.ts` (agrega generación de token al final)
8. Actualizar `auth.service.ts`
9. Actualizar `auth-controller.swagger.ts`
10. Actualizar `auth.controller.ts`
11. Actualizar `auth.module.ts`
