# Propuesta: Gestión de sesiones multi-dispositivo (refresh tokens + user_sessions)

Habilita el uso real de la tabla `user_sessions` (creada desde la migración de Fase 1, hoy sin ningún código que la use). `register` y `login` pasan a emitir, además del `accessToken` (JWT de corta vida), un `refreshToken` opaco de un solo uso que se persiste **hasheado con SHA-256** en `user_sessions` junto con metadata del dispositivo (ip, user-agent, nombre de dispositivo). Se agregan 4 endpoints nuevos:

| Método | Ruta | Auth | Propósito |
|--------|------|------|-----------|
| `POST` | `/auth/refresh` | Público (requiere `refreshToken` válido en el body) | Rota el refresh token y emite un nuevo `accessToken` |
| `POST` | `/auth/logout` | JWT | Revoca la sesión asociada al `refreshToken` enviado (cierra sesión en el dispositivo actual) |
| `GET` | `/auth/sessions` | JWT | Lista las sesiones activas del usuario (para mostrar "dispositivos conectados") |
| `DELETE` | `/auth/sessions/:id` | JWT | Revoca una sesión específica del usuario (cerrar sesión remota en otro dispositivo) |

> **Dependencia:** Ninguna de las propuestas anteriores es prerequisito estricto, pero reutiliza el mismo patrón de `IVerificationRepository`/`verify-email` para el manejo de tokens y excepciones. Es independiente de `19-recuperacion-contrasena.md`; si ambas se aplican, los fragmentos "Antes" de `auth.controller.ts`, `auth.service.ts` y `auth.module.ts` de esta propuesta asumen el estado **actual** del código (sin la propuesta 19 aplicada) — si se aplica primero la 19, ubica el fragmento equivalente manualmente por contexto.

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/modules/auth/application/dtos/register.dto.ts` | Actualizar — agregar `deviceId`/`deviceName` opcionales |
| `src/modules/auth/application/dtos/login.dto.ts` | Actualizar — agregar `deviceId`/`deviceName` opcionales |
| `src/modules/auth/application/dtos/auth-response.dto.ts` | Actualizar — agregar `refreshToken` |
| `src/modules/auth/application/dtos/refresh-token.dto.ts` | Crear |
| `src/modules/auth/application/dtos/logout.dto.ts` | Crear |
| `src/modules/auth/application/dtos/session-response.dto.ts` | Crear |
| `src/modules/auth/presentation/controllers/auth.controller.ts` | Actualizar |
| `src/modules/auth/application/services/auth.service.ts` | Actualizar |
| `src/modules/auth/application/use-cases/register.use-case.ts` | Actualizar |
| `src/modules/auth/application/use-cases/login.use-case.ts` | Actualizar |
| `src/modules/auth/application/use-cases/refresh-token.use-case.ts` | Crear |
| `src/modules/auth/application/use-cases/logout.use-case.ts` | Crear |
| `src/modules/auth/application/use-cases/list-sessions.use-case.ts` | Crear |
| `src/modules/auth/application/use-cases/revoke-session.use-case.ts` | Crear |
| `src/modules/auth/domain/repositories/session.repository.interface.ts` | Crear |
| `src/modules/auth/domain/exceptions/invalid-refresh-token.exception.ts` | Crear |
| `src/modules/auth/domain/exceptions/session-not-found.exception.ts` | Crear |
| `src/infrastructure/database/schemas/user-session.schema.ts` | Crear *(sin migración: la tabla `user_sessions` ya existe desde Fase 1)* |
| `src/modules/auth/infrastructure/repositories/session.repository.ts` | Crear |
| `src/modules/auth/application/mappers/auth.mapper.ts` | Actualizar |
| `src/modules/auth/application/mappers/session.mapper.ts` | Crear |
| `src/modules/auth/auth.module.ts` | Actualizar |

---

## 1. register.dto.ts (archivo existente — actualización)

**Ruta:** `src/modules/auth/application/dtos/register.dto.ts`

**Antes:**
```typescript
import { IsEmail, IsEnum, IsNotEmpty, IsString, Matches, MaxLength, MinLength, } from "class-validator";
import { UserRole } from "../../domain/enums/user-role.enum";

export class RegisterDto {

    @IsEmail()
    @IsNotEmpty()
    email!: string;

    @IsString()
    @IsNotEmpty()
    @MinLength(3, { message: 'Username must be at least 3 characters' })
    @MaxLength(50, { message: 'Username must be at most 50 characters' })
    @Matches(/^[a-zA-Z0-9_]+$/, { message: 'Username can only contain letters, numbers and underscores' })
    username!: string;

    @IsString()
    @MinLength(8, { message: 'Password must be at least 8 characters long' })
    @IsNotEmpty({ message: 'Password is required' })
    password!: string;

    @IsEnum(UserRole, {
        message: `Role must be one of: ${Object.values(UserRole).join(', ')}`,
    })
    @IsNotEmpty({ message: 'Role is required' })
    role!: UserRole;
}
```

**Después:**
```typescript
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength, } from "class-validator";
import { UserRole } from "../../domain/enums/user-role.enum";

export class RegisterDto {

    @IsEmail()
    @IsNotEmpty()
    email!: string;

    @IsString()
    @IsNotEmpty()
    @MinLength(3, { message: 'Username must be at least 3 characters' })
    @MaxLength(50, { message: 'Username must be at most 50 characters' })
    @Matches(/^[a-zA-Z0-9_]+$/, { message: 'Username can only contain letters, numbers and underscores' })
    username!: string;

    @IsString()
    @MinLength(8, { message: 'Password must be at least 8 characters long' })
    @IsNotEmpty({ message: 'Password is required' })
    password!: string;

    @IsEnum(UserRole, {
        message: `Role must be one of: ${Object.values(UserRole).join(', ')}`,
    })
    @IsNotEmpty({ message: 'Role is required' })
    role!: UserRole;

    // Identificador/nombre de dispositivo, opcionales — enviados por apps móviles
    // para poder listar "dispositivos conectados" en GET /auth/sessions.
    @IsOptional()
    @IsString()
    @MaxLength(255)
    deviceId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    deviceName?: string;
}
```

---

## 2. login.dto.ts (archivo existente — actualización)

**Ruta:** `src/modules/auth/application/dtos/login.dto.ts`

**Antes:**
```typescript
import { IsEmail, IsNotEmpty, IsString } from "class-validator";

export class LoginDto {

    @IsEmail({}, { message: 'email must be an email' })
    @IsNotEmpty({ message: 'email should not be empty' })
    email!: string;

    @IsString({ message: 'password must be a string' })
    @IsNotEmpty({ message: 'password is required' })
    password!: string;
}
```

**Después:**
```typescript
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class LoginDto {

    @IsEmail({}, { message: 'email must be an email' })
    @IsNotEmpty({ message: 'email should not be empty' })
    email!: string;

    @IsString({ message: 'password must be a string' })
    @IsNotEmpty({ message: 'password is required' })
    password!: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    deviceId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    deviceName?: string;
}
```

---

## 3. auth-response.dto.ts (archivo existente — actualización)

**Ruta:** `src/modules/auth/application/dtos/auth-response.dto.ts`

**Antes:**
```typescript
export class AuthResponseDto {
    id: string;
    email: string;
    username: string;
    role: UserRole | null;
    accessToken: string;
    createdAt: Date;
    isNewUser: boolean;
    constructor(
        id: string,
        email: string,
        username: string,
        role: UserRole | null,
        accessToken: string,
        createdAt: Date,
        isNewUser: boolean
    ){
        this.id = id;
        this.email = email;
        this.username = username;
        this.role = role;
        this.accessToken = accessToken;
        this.createdAt = createdAt;
        this.isNewUser = isNewUser;
    }
}
```

**Después:**
```typescript
export class AuthResponseDto {
    id: string;
    email: string;
    username: string;
    role: UserRole | null;
    accessToken: string;
    refreshToken: string;
    createdAt: Date;
    isNewUser: boolean;
    constructor(
        id: string,
        email: string,
        username: string,
        role: UserRole | null,
        accessToken: string,
        refreshToken: string,
        createdAt: Date,
        isNewUser: boolean
    ){
        this.id = id;
        this.email = email;
        this.username = username;
        this.role = role;
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        this.createdAt = createdAt;
        this.isNewUser = isNewUser;
    }
}
```

---

## 4. refresh-token.dto.ts (archivo nuevo)

**Ruta:** `src/modules/auth/application/dtos/refresh-token.dto.ts`

```typescript
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class RefreshTokenDto {
    @IsString()
    @IsNotEmpty()
    @Length(64, 64, { message: 'refreshToken must be exactly 64 characters' })
    refreshToken!: string;
}
```

---

## 5. logout.dto.ts (archivo nuevo)

**Ruta:** `src/modules/auth/application/dtos/logout.dto.ts`

```typescript
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class LogoutDto {
    @IsString()
    @IsNotEmpty()
    @Length(64, 64, { message: 'refreshToken must be exactly 64 characters' })
    refreshToken!: string;
}
```

---

## 6. session-response.dto.ts (archivo nuevo)

**Ruta:** `src/modules/auth/application/dtos/session-response.dto.ts`

```typescript
export class SessionResponseDto {
    id!: string;
    deviceName!: string | null;
    ipAddress!: string | null;
    createdAt!: Date;
    expiresAt!: Date;

    constructor(
        id: string,
        deviceName: string | null,
        ipAddress: string | null,
        createdAt: Date,
        expiresAt: Date,
    ) {
        this.id = id;
        this.deviceName = deviceName;
        this.ipAddress = ipAddress;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
    }
}
```

---

## 7. auth.controller.ts (archivo existente — actualización)

**Ruta:** `src/modules/auth/presentation/controllers/auth.controller.ts`

**Antes:**
```typescript
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { AuthResponseDto } from '../../application/dtos/auth-response.dto';
import { LoginDto } from '../../application/dtos/login.dto';
import { MeResponseDto } from '../../application/dtos/me-response.dto';
import { RegisterDto } from '../../application/dtos/register.dto';
import { ResendVerificationDto } from '../../application/dtos/resend-verification.dto';
import { VerifyEmailDto } from '../../application/dtos/verify-email.dto';
import { AuthService } from '../../application/services/auth.service';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Public } from '../decorators/public.decorator';
```

```typescript
    @Public()
    @Post('register')
    @HttpCode(HttpStatus.CREATED)
    @Throttle({ default: { limit: 3, ttl: 60000 } })
    // @ApiRegister()
    async register(@Body() registerDto: RegisterDto): Promise<AuthResponseDto> {
        return this.authService.register(registerDto);
    }

    @Public()
    @Post('login')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    // @ApiLogin()
    async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
        return this.authService.login(loginDto);
    }
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
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';

import { AuthResponseDto } from '../../application/dtos/auth-response.dto';
import { LoginDto } from '../../application/dtos/login.dto';
import { LogoutDto } from '../../application/dtos/logout.dto';
import { MeResponseDto } from '../../application/dtos/me-response.dto';
import { RefreshTokenDto } from '../../application/dtos/refresh-token.dto';
import { RegisterDto } from '../../application/dtos/register.dto';
import { ResendVerificationDto } from '../../application/dtos/resend-verification.dto';
import { SessionResponseDto } from '../../application/dtos/session-response.dto';
import { VerifyEmailDto } from '../../application/dtos/verify-email.dto';
import { AuthService } from '../../application/services/auth.service';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Public } from '../decorators/public.decorator';
```

```typescript
    @Public()
    @Post('register')
    @HttpCode(HttpStatus.CREATED)
    @Throttle({ default: { limit: 3, ttl: 60000 } })
    // @ApiRegister()
    async register(@Body() registerDto: RegisterDto, @Req() req: Request): Promise<AuthResponseDto> {
        return this.authService.register(registerDto, {
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
        });
    }

    @Public()
    @Post('login')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    // @ApiLogin()
    async login(@Body() loginDto: LoginDto, @Req() req: Request): Promise<AuthResponseDto> {
        return this.authService.login(loginDto, {
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
        });
    }
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
    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 10, ttl: 60000 } })
    // @ApiRefresh()
    async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request): Promise<AuthResponseDto> {
        return this.authService.refresh(dto, {
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
        });
    }

    // Requiere JWT — JwtAuthGuard global activo (no @Public)
    @Post('logout')
    @HttpCode(HttpStatus.OK)
    // @ApiLogout()
    async logout(
        @Body() dto: LogoutDto,
        @CurrentUser() user: { userId: string },
    ): Promise<{ message: string }> {
        return this.authService.logout(dto, user.userId);
    }

    // Requiere JWT — JwtAuthGuard global activo (no @Public)
    @Get('sessions')
    @HttpCode(HttpStatus.OK)
    // @ApiListSessions()
    async listSessions(@CurrentUser() user: { userId: string }): Promise<SessionResponseDto[]> {
        return this.authService.listSessions(user.userId);
    }

    // Requiere JWT — JwtAuthGuard global activo (no @Public)
    @Delete('sessions/:id')
    @HttpCode(HttpStatus.OK)
    // @ApiRevokeSession()
    async revokeSession(
        @Param('id') sessionId: string,
        @CurrentUser() user: { userId: string },
    ): Promise<{ message: string }> {
        return this.authService.revokeSession(sessionId, user.userId);
    }

    // Requiere JWT — JwtAuthGuard global activo (no @Public)
    @Get('me')
```

---

## 8. auth.service.ts (archivo existente — actualización)

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
import { LoginDto } from '../dtos/login.dto';
import { LogoutDto } from '../dtos/logout.dto';
import { MeResponseDto } from '../dtos/me-response.dto';
import { RefreshTokenDto } from '../dtos/refresh-token.dto';
import { RegisterDto } from '../dtos/register.dto';
import { ResendVerificationDto } from '../dtos/resend-verification.dto';
import { SessionResponseDto } from '../dtos/session-response.dto';
import { VerifyEmailDto } from '../dtos/verify-email.dto';
import { AuthMapper } from '../mappers/auth.mapper';
import { SessionMapper } from '../mappers/session.mapper';
import { GetMeUseCase } from '../use-cases/get-me.use-case';
import { ListSessionsUseCase } from '../use-cases/list-sessions.use-case';
import { LoginUseCase } from '../use-cases/login.use-case';
import { LogoutUseCase } from '../use-cases/logout.use-case';
import { RefreshTokenUseCase } from '../use-cases/refresh-token.use-case';
import { RegisterUseCase } from '../use-cases/register.use-case';
import { ResendVerificationUseCase } from '../use-cases/resend-verification.use-case';
import { RevokeSessionUseCase } from '../use-cases/revoke-session.use-case';
import { VerifyEmailUseCase } from '../use-cases/verify-email.use-case';

interface RequestMeta {
    ipAddress?: string;
    userAgent?: string;
}

@Injectable()
export class AuthService {
    constructor(
        private readonly registerUseCase: RegisterUseCase,
        private readonly loginUseCase: LoginUseCase,
        private readonly verifyEmailUseCase: VerifyEmailUseCase,
        private readonly resendVerificationUseCase: ResendVerificationUseCase,
        private readonly refreshTokenUseCase: RefreshTokenUseCase,
        private readonly logoutUseCase: LogoutUseCase,
        private readonly listSessionsUseCase: ListSessionsUseCase,
        private readonly revokeSessionUseCase: RevokeSessionUseCase,
        private readonly getMeUseCase: GetMeUseCase,
        private readonly jwtService: JwtService,
    ) { }

    async register(registerDto: RegisterDto, meta: RequestMeta): Promise<AuthResponseDto> {
        const { user, refreshToken } = await this.registerUseCase.execute({
            email: registerDto.email,
            username: registerDto.username,
            password: registerDto.password,
            role: registerDto.role,
            deviceId: registerDto.deviceId,
            deviceName: registerDto.deviceName,
            ipAddress: meta.ipAddress,
            userAgent: meta.userAgent,
        });
        const accessToken = this.jwtService.generateToken({ sub: user.id, email: user.email });
        return AuthMapper.toAuthResponse(user, accessToken, refreshToken, true);
    }

    async login(loginDto: LoginDto, meta: RequestMeta): Promise<AuthResponseDto> {
        const { user, refreshToken } = await this.loginUseCase.execute({
            email: loginDto.email,
            password: loginDto.password,
            deviceId: loginDto.deviceId,
            deviceName: loginDto.deviceName,
            ipAddress: meta.ipAddress,
            userAgent: meta.userAgent,
        });
        const accessToken = this.jwtService.generateToken({ sub: user.id, email: user.email });
        return AuthMapper.toAuthResponse(user, accessToken, refreshToken, false);
    }
```

```typescript
    async resendVerification(dto: ResendVerificationDto): Promise<{ message: string }> {
        await this.resendVerificationUseCase.execute(dto.email);
        // Siempre responde con el mismo mensaje para no enumerar si el email existe
        return { message: 'If the email exists and is unverified, a new code has been sent' };
    }

    async refresh(dto: RefreshTokenDto, meta: RequestMeta): Promise<AuthResponseDto> {
        const { user, refreshToken } = await this.refreshTokenUseCase.execute(dto.refreshToken, meta);
        const accessToken = this.jwtService.generateToken({ sub: user.id, email: user.email });
        return AuthMapper.toAuthResponse(user, accessToken, refreshToken, false);
    }

    async logout(dto: LogoutDto, userId: string): Promise<{ message: string }> {
        await this.logoutUseCase.execute(dto.refreshToken, userId);
        return { message: 'Logged out successfully' };
    }

    async listSessions(userId: string): Promise<SessionResponseDto[]> {
        const sessions = await this.listSessionsUseCase.execute(userId);
        return SessionMapper.toSessionResponseList(sessions);
    }

    async revokeSession(sessionId: string, userId: string): Promise<{ message: string }> {
        await this.revokeSessionUseCase.execute(sessionId, userId);
        return { message: 'Session revoked successfully' };
    }

    async getMe(userId: string): Promise<MeResponseDto> {
        return this.getMeUseCase.execute(userId);
    }
}
```

---

## 9. register.use-case.ts (archivo existente — actualización)

**Ruta:** `src/modules/auth/application/use-cases/register.use-case.ts`

**Antes:**
```typescript
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
```

**Después:**
```typescript
import * as crypto from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { User } from '../../domain/entities/user.entity';
import { UserRole } from '../../domain/enums/user-role.enum';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import {
    ISessionRepository,
    SESSION_REPOSITORY,
} from '../../domain/repositories/session.repository.interface';
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

// Duración del refresh token: 30 días (mucho más largo que el access token,
// que expira según JWT_EXPIRES_IN — típicamente horas).
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class RegisterUseCase {
    constructor(
        @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
        @Inject(VERIFICATION_REPOSITORY)
        private readonly verificationRepository: IVerificationRepository,
        @Inject(SESSION_REPOSITORY) private readonly sessionRepository: ISessionRepository,
        @Inject(EMAIL_NOTIFICATION_SERVICE)
        private readonly emailService: IEmailNotificationService,
        private readonly bcryptService: BcryptService,
    ) { }

    async execute(command: {
        email: string;
        username: string;
        password: string;
        role: UserRole;
        deviceId?: string;
        deviceName?: string;
        ipAddress?: string;
        userAgent?: string;
    }): Promise<{ user: User; refreshToken: string }> {
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

        // Crear sesión (refresh token) para el dispositivo desde el que se registró
        const refreshToken = crypto.randomBytes(32).toString('hex');
        const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

        await this.sessionRepository.create({
            userId: savedUser.id,
            refreshTokenHash,
            deviceId: command.deviceId,
            deviceName: command.deviceName,
            ipAddress: command.ipAddress,
            userAgent: command.userAgent,
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        });

        return {
            user: new User(
                savedUser.id,
                savedUser.email,
                savedUser.username,
                savedUser.password,
                savedUser.status,
                savedUser.createdAt,
                savedUser.updatedAt,
                command.role,
            ),
            refreshToken,
        };
    }
}
```

---

## 10. login.use-case.ts (archivo existente — actualización)

**Ruta:** `src/modules/auth/application/use-cases/login.use-case.ts`

**Antes:**
```typescript
import { Inject, Injectable } from "@nestjs/common";
import { IUserRepository, USER_REPOSITORY } from "../../domain/repositories/user.repository.interface";
import { BcryptService } from "../../infrastructure/services/bcrypt.service";
import { User } from "../../domain/entities/user.entity";
import { InvalidCredentialsException } from "../../domain/exceptions/invalid-credentials.exception";
import { EmailNotVerifiedException } from "../../domain/exceptions/email-not-verified.exception";
import { AccountSuspendedException } from "../../domain/exceptions/account-suspended.exception";
import { AccountBannedException } from "../../domain/exceptions/account-banned.exception";



@Injectable()
export class LoginUseCase {
    constructor(
        @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
        private readonly bcryptService: BcryptService
    ) { }

    async execute(command: { email: string, password: string }): Promise<User> {

        const user = await this.userRepository.findByEmailWithRole(command.email);
        user || (() => { throw new InvalidCredentialsException() })();

        const isPasswordValid = await this.bcryptService.compare(command.password, user.password);
        isPasswordValid || (() => { throw new InvalidCredentialsException() })();

        user.status === 'pending_verification' && (() => { throw new EmailNotVerifiedException() })();
        user.status === 'suspended' && (() => { throw new AccountSuspendedException() })();
        user.status === 'banned' && (() => { throw new AccountBannedException() })();

        await this.userRepository.updateLastLoginAt(user.id);

        return user;
    }

}
```

**Después:**
```typescript
import * as crypto from 'node:crypto';

import { Inject, Injectable } from "@nestjs/common";
import { IUserRepository, USER_REPOSITORY } from "../../domain/repositories/user.repository.interface";
import {
    ISessionRepository,
    SESSION_REPOSITORY,
} from "../../domain/repositories/session.repository.interface";
import { BcryptService } from "../../infrastructure/services/bcrypt.service";
import { User } from "../../domain/entities/user.entity";
import { InvalidCredentialsException } from "../../domain/exceptions/invalid-credentials.exception";
import { EmailNotVerifiedException } from "../../domain/exceptions/email-not-verified.exception";
import { AccountSuspendedException } from "../../domain/exceptions/account-suspended.exception";
import { AccountBannedException } from "../../domain/exceptions/account-banned.exception";

// Duración del refresh token: 30 días.
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class LoginUseCase {
    constructor(
        @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
        @Inject(SESSION_REPOSITORY) private readonly sessionRepository: ISessionRepository,
        private readonly bcryptService: BcryptService
    ) { }

    async execute(command: {
        email: string;
        password: string;
        deviceId?: string;
        deviceName?: string;
        ipAddress?: string;
        userAgent?: string;
    }): Promise<{ user: User; refreshToken: string }> {

        const user = await this.userRepository.findByEmailWithRole(command.email);
        user || (() => { throw new InvalidCredentialsException() })();

        const isPasswordValid = await this.bcryptService.compare(command.password, user.password);
        isPasswordValid || (() => { throw new InvalidCredentialsException() })();

        user.status === 'pending_verification' && (() => { throw new EmailNotVerifiedException() })();
        user.status === 'suspended' && (() => { throw new AccountSuspendedException() })();
        user.status === 'banned' && (() => { throw new AccountBannedException() })();

        await this.userRepository.updateLastLoginAt(user.id);

        const refreshToken = crypto.randomBytes(32).toString('hex');
        const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

        await this.sessionRepository.create({
            userId: user.id,
            refreshTokenHash,
            deviceId: command.deviceId,
            deviceName: command.deviceName,
            ipAddress: command.ipAddress,
            userAgent: command.userAgent,
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        });

        return { user, refreshToken };
    }

}
```

---

## 11. refresh-token.use-case.ts (archivo nuevo)

**Ruta:** `src/modules/auth/application/use-cases/refresh-token.use-case.ts`

```typescript
import * as crypto from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { User } from '../../domain/entities/user.entity';
import { InvalidRefreshTokenException } from '../../domain/exceptions/invalid-refresh-token.exception';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import {
    ISessionRepository,
    SESSION_REPOSITORY,
} from '../../domain/repositories/session.repository.interface';

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class RefreshTokenUseCase {
    constructor(
        @Inject(SESSION_REPOSITORY) private readonly sessionRepository: ISessionRepository,
        @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
    ) { }

    async execute(
        refreshToken: string,
        meta: { ipAddress?: string; userAgent?: string },
    ): Promise<{ user: User; refreshToken: string }> {
        const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
        const session = await this.sessionRepository.findByRefreshTokenHash(refreshTokenHash);

        if (!session || session.isRevoked || session.expiresAt < new Date()) {
            throw new InvalidRefreshTokenException();
        }

        const user = await this.userRepository.findById(session.userId);
        if (!user) {
            throw new InvalidRefreshTokenException();
        }

        // Rotación: se revoca la sesión usada y se emite una nueva para el mismo dispositivo.
        // Si el refresh token robado se reintenta después, ya estará revocado (detecta reuso).
        await this.sessionRepository.revoke(session.id);

        const newRefreshToken = crypto.randomBytes(32).toString('hex');
        const newRefreshTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');

        await this.sessionRepository.create({
            userId: session.userId,
            refreshTokenHash: newRefreshTokenHash,
            deviceId: session.deviceId ?? undefined,
            deviceName: session.deviceName ?? undefined,
            ipAddress: meta.ipAddress ?? session.ipAddress ?? undefined,
            userAgent: meta.userAgent ?? session.userAgent ?? undefined,
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        });

        return { user, refreshToken: newRefreshToken };
    }
}
```

---

## 12. logout.use-case.ts (archivo nuevo)

**Ruta:** `src/modules/auth/application/use-cases/logout.use-case.ts`

```typescript
import * as crypto from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import {
    ISessionRepository,
    SESSION_REPOSITORY,
} from '../../domain/repositories/session.repository.interface';

@Injectable()
export class LogoutUseCase {
    constructor(
        @Inject(SESSION_REPOSITORY) private readonly sessionRepository: ISessionRepository,
    ) { }

    async execute(refreshToken: string, userId: string): Promise<void> {
        const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
        const session = await this.sessionRepository.findByRefreshTokenHash(refreshTokenHash);

        // Idempotente: si el token no existe, ya fue revocado, o pertenece a otro
        // usuario (JWT/refresh token no correlacionados), no hay nada que hacer.
        if (!session || session.userId !== userId) return;

        await this.sessionRepository.revoke(session.id);
    }
}
```

---

## 13. list-sessions.use-case.ts (archivo nuevo)

**Ruta:** `src/modules/auth/application/use-cases/list-sessions.use-case.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';

import {
    ISessionRepository,
    SESSION_REPOSITORY,
    SessionRecord,
} from '../../domain/repositories/session.repository.interface';

@Injectable()
export class ListSessionsUseCase {
    constructor(
        @Inject(SESSION_REPOSITORY) private readonly sessionRepository: ISessionRepository,
    ) { }

    async execute(userId: string): Promise<SessionRecord[]> {
        return this.sessionRepository.findActiveByUserId(userId);
    }
}
```

---

## 14. revoke-session.use-case.ts (archivo nuevo)

**Ruta:** `src/modules/auth/application/use-cases/revoke-session.use-case.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';

import { SessionNotFoundException } from '../../domain/exceptions/session-not-found.exception';
import {
    ISessionRepository,
    SESSION_REPOSITORY,
} from '../../domain/repositories/session.repository.interface';

@Injectable()
export class RevokeSessionUseCase {
    constructor(
        @Inject(SESSION_REPOSITORY) private readonly sessionRepository: ISessionRepository,
    ) { }

    async execute(sessionId: string, userId: string): Promise<void> {
        const session = await this.sessionRepository.findById(sessionId);

        // 404 genérico (no 403) para no confirmar la existencia de una sesión ajena.
        if (!session || session.userId !== userId) {
            throw new SessionNotFoundException();
        }

        await this.sessionRepository.revoke(session.id);
    }
}
```

---

## 15. session.repository.interface.ts (archivo nuevo)

**Ruta:** `src/modules/auth/domain/repositories/session.repository.interface.ts`

```typescript
export interface CreateSessionParams {
    userId: string;
    refreshTokenHash: string;
    deviceId?: string;
    deviceName?: string;
    ipAddress?: string;
    userAgent?: string;
    expiresAt: Date;
}

export interface SessionRecord {
    id: string;
    userId: string;
    refreshTokenHash: string;
    deviceId: string | null;
    deviceName: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    isRevoked: boolean;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface ISessionRepository {
    create(params: CreateSessionParams): Promise<void>;
    findByRefreshTokenHash(refreshTokenHash: string): Promise<SessionRecord | null>;
    findById(id: string): Promise<SessionRecord | null>;
    findActiveByUserId(userId: string): Promise<SessionRecord[]>;
    revoke(id: string): Promise<void>;
}

export const SESSION_REPOSITORY = Symbol('ISessionRepository');
```

---

## 16. invalid-refresh-token.exception.ts (archivo nuevo)

**Ruta:** `src/modules/auth/domain/exceptions/invalid-refresh-token.exception.ts`

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class InvalidRefreshTokenException extends DomainException {
    constructor() {
        super('Refresh token is invalid, revoked or has expired', 401, 'INVALID_REFRESH_TOKEN');
    }
}
```

---

## 17. session-not-found.exception.ts (archivo nuevo)

**Ruta:** `src/modules/auth/domain/exceptions/session-not-found.exception.ts`

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class SessionNotFoundException extends DomainException {
    constructor() {
        super('Session not found', 404, 'SESSION_NOT_FOUND');
    }
}
```

---

## 18. user-session.schema.ts (archivo nuevo)

**Ruta:** `src/infrastructure/database/schemas/user-session.schema.ts`

> Sin migración nueva: la tabla `user_sessions` ya fue creada por `1706140000000-CreateUsersTable.ts` (Fase 1). Este archivo solo define el entity TypeORM que mapea esa tabla existente, siguiendo el mismo patrón que `verification.schema.ts`.

```typescript
import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

@Entity('user_sessions')
export class UserSessionSchema {
    @PrimaryGeneratedColumn({ type: 'bigint' })
    id!: string;

    @Column({ name: 'user_id', type: 'uuid' })
    userId!: string;

    @Column({ name: 'refresh_token_hash', type: 'char', length: 64, unique: true })
    refreshTokenHash!: string;

    @Column({ name: 'device_id', type: 'varchar', length: 255, nullable: true })
    deviceId!: string | null;

    @Column({ name: 'device_name', type: 'varchar', length: 255, nullable: true })
    deviceName!: string | null;

    @Column({ name: 'ip_address', type: 'inet', nullable: true })
    ipAddress!: string | null;

    @Column({ name: 'user_agent', type: 'text', nullable: true })
    userAgent!: string | null;

    @Column({ name: 'is_revoked', type: 'boolean', default: false })
    isRevoked!: boolean;

    @Column({ name: 'expires_at', type: 'timestamp' })
    expiresAt!: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
```

---

## 19. session.repository.ts (archivo nuevo)

**Ruta:** `src/modules/auth/infrastructure/repositories/session.repository.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserSessionSchema } from '../../../../infrastructure/database/schemas/user-session.schema';
import {
    CreateSessionParams,
    ISessionRepository,
    SessionRecord,
} from '../../domain/repositories/session.repository.interface';

@Injectable()
export class SessionRepository implements ISessionRepository {
    constructor(
        @InjectRepository(UserSessionSchema)
        private readonly repo: Repository<UserSessionSchema>,
    ) { }

    async create(params: CreateSessionParams): Promise<void> {
        const entity = this.repo.create({
            userId: params.userId,
            refreshTokenHash: params.refreshTokenHash,
            deviceId: params.deviceId ?? null,
            deviceName: params.deviceName ?? null,
            ipAddress: params.ipAddress ?? null,
            userAgent: params.userAgent ?? null,
            expiresAt: params.expiresAt,
        });
        await this.repo.save(entity);
    }

    async findByRefreshTokenHash(refreshTokenHash: string): Promise<SessionRecord | null> {
        const entity = await this.repo.findOne({ where: { refreshTokenHash } });
        return entity ? this.toRecord(entity) : null;
    }

    async findById(id: string): Promise<SessionRecord | null> {
        const entity = await this.repo.findOne({ where: { id } });
        return entity ? this.toRecord(entity) : null;
    }

    async findActiveByUserId(userId: string): Promise<SessionRecord[]> {
        const entities = await this.repo
            .createQueryBuilder('session')
            .where('session.user_id = :userId', { userId })
            .andWhere('session.is_revoked = false')
            .andWhere('session.expires_at > :now', { now: new Date() })
            .orderBy('session.created_at', 'DESC')
            .getMany();

        return entities.map((entity) => this.toRecord(entity));
    }

    async revoke(id: string): Promise<void> {
        await this.repo.update(id, { isRevoked: true });
    }

    private toRecord(entity: UserSessionSchema): SessionRecord {
        return {
            id: entity.id,
            userId: entity.userId,
            refreshTokenHash: entity.refreshTokenHash,
            deviceId: entity.deviceId,
            deviceName: entity.deviceName,
            ipAddress: entity.ipAddress,
            userAgent: entity.userAgent,
            isRevoked: entity.isRevoked,
            expiresAt: entity.expiresAt,
            createdAt: entity.createdAt,
            updatedAt: entity.updatedAt,
        };
    }
}
```

---

## 20. auth.mapper.ts (archivo existente — actualización)

**Ruta:** `src/modules/auth/application/mappers/auth.mapper.ts`

**Antes:**
```typescript
import { User } from '../../domain/entities/user.entity';
import { AuthResponseDto } from '../dtos/auth-response.dto';

export class AuthMapper {
  static toAuthResponse(
    user: User,
    accessToken: string,
    isNewUser = false,
  ): AuthResponseDto {
    return new AuthResponseDto(
      user.id,
      user.email,
      user.username,
      user.role,
      accessToken,
      user.createdAt,
      isNewUser,
    );
  }
}
```

**Después:**
```typescript
import { User } from '../../domain/entities/user.entity';
import { AuthResponseDto } from '../dtos/auth-response.dto';

export class AuthMapper {
  static toAuthResponse(
    user: User,
    accessToken: string,
    refreshToken: string,
    isNewUser = false,
  ): AuthResponseDto {
    return new AuthResponseDto(
      user.id,
      user.email,
      user.username,
      user.role,
      accessToken,
      refreshToken,
      user.createdAt,
      isNewUser,
    );
  }
}
```

---

## 21. session.mapper.ts (archivo nuevo)

**Ruta:** `src/modules/auth/application/mappers/session.mapper.ts`

```typescript
import { SessionRecord } from '../../domain/repositories/session.repository.interface';
import { SessionResponseDto } from '../dtos/session-response.dto';

export class SessionMapper {
    static toSessionResponse(record: SessionRecord): SessionResponseDto {
        return new SessionResponseDto(
            record.id,
            record.deviceName,
            record.ipAddress,
            record.createdAt,
            record.expiresAt,
        );
    }

    static toSessionResponseList(records: SessionRecord[]): SessionResponseDto[] {
        return records.map((record) => this.toSessionResponse(record));
    }
}
```

---

## 22. auth.module.ts (archivo existente — actualización)

**Ruta:** `src/modules/auth/auth.module.ts`

**Antes:**
```typescript
// Infrastructure
import { UserSchema } from '../../infrastructure/database/schemas/user.schema';
import { VerificationSchema } from '../../infrastructure/database/schemas/verification.schema';

import { AuthService } from './application/services/auth.service';
import { GetMeUseCase } from './application/use-cases/get-me.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
// Application
import { RegisterUseCase } from './application/use-cases/register.use-case';
import { ResendVerificationUseCase } from './application/use-cases/resend-verification.use-case';
import { VerifyEmailUseCase } from './application/use-cases/verify-email.use-case';
// Domain
import { USER_REPOSITORY } from './domain/repositories/user.repository.interface';
import { VERIFICATION_REPOSITORY } from './domain/repositories/verification.repository.interface';
import { UserRepository } from './infrastructure/repositories/user.repository';
import { VerificationRepository } from './infrastructure/repositories/verification.repository';
import { BcryptService } from './infrastructure/services/bcrypt.service';
import { EMAIL_NOTIFICATION_SERVICE, EmailNotificationService } from './infrastructure/services/email-notification.service';
import { JwtService } from './infrastructure/services/jwt.service';
import { JwtStrategy } from './infrastructure/strategies/jwt.strategy';
// Presentation
import { AuthController } from './presentation/controllers/auth.controller';
import { JwtAuthGuard } from './presentation/guards/jwt-auth.guard';

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

        // Application
        RegisterUseCase,
        LoginUseCase,
        VerifyEmailUseCase,
        ResendVerificationUseCase,
        GetMeUseCase,
        AuthService,

        // Presentation
        JwtAuthGuard,
    ],
    exports: [JwtAuthGuard, JwtService],
})
export class AuthModule { }
```

**Después:**
```typescript
// Infrastructure
import { UserSchema } from '../../infrastructure/database/schemas/user.schema';
import { UserSessionSchema } from '../../infrastructure/database/schemas/user-session.schema';
import { VerificationSchema } from '../../infrastructure/database/schemas/verification.schema';

import { AuthService } from './application/services/auth.service';
import { GetMeUseCase } from './application/use-cases/get-me.use-case';
import { ListSessionsUseCase } from './application/use-cases/list-sessions.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { RefreshTokenUseCase } from './application/use-cases/refresh-token.use-case';
// Application
import { RegisterUseCase } from './application/use-cases/register.use-case';
import { ResendVerificationUseCase } from './application/use-cases/resend-verification.use-case';
import { RevokeSessionUseCase } from './application/use-cases/revoke-session.use-case';
import { VerifyEmailUseCase } from './application/use-cases/verify-email.use-case';
// Domain
import { SESSION_REPOSITORY } from './domain/repositories/session.repository.interface';
import { USER_REPOSITORY } from './domain/repositories/user.repository.interface';
import { VERIFICATION_REPOSITORY } from './domain/repositories/verification.repository.interface';
import { SessionRepository } from './infrastructure/repositories/session.repository';
import { UserRepository } from './infrastructure/repositories/user.repository';
import { VerificationRepository } from './infrastructure/repositories/verification.repository';
import { BcryptService } from './infrastructure/services/bcrypt.service';
import { EMAIL_NOTIFICATION_SERVICE, EmailNotificationService } from './infrastructure/services/email-notification.service';
import { JwtService } from './infrastructure/services/jwt.service';
import { JwtStrategy } from './infrastructure/strategies/jwt.strategy';
// Presentation
import { AuthController } from './presentation/controllers/auth.controller';
import { JwtAuthGuard } from './presentation/guards/jwt-auth.guard';

@Module({
    imports: [
        ConfigModule,
        PassportModule,
        TypeOrmModule.forFeature([UserSchema, VerificationSchema, UserSessionSchema]),
    ],
    controllers: [AuthController],
    providers: [
        // Infrastructure
        {
            provide: USER_REPOSITORY,
            useClass: UserRepository,
        },
        { provide: VERIFICATION_REPOSITORY, useClass: VerificationRepository },
        { provide: SESSION_REPOSITORY, useClass: SessionRepository },
        { provide: EMAIL_NOTIFICATION_SERVICE, useClass: EmailNotificationService },
        BcryptService,
        JwtService,
        JwtStrategy,

        // Application
        RegisterUseCase,
        LoginUseCase,
        VerifyEmailUseCase,
        ResendVerificationUseCase,
        RefreshTokenUseCase,
        LogoutUseCase,
        ListSessionsUseCase,
        RevokeSessionUseCase,
        GetMeUseCase,
        AuthService,

        // Presentation
        JwtAuthGuard,
    ],
    exports: [JwtAuthGuard, JwtService],
})
export class AuthModule { }
```

---

## Notas

- **Refresh token opaco, no JWT:** se genera con `crypto.randomBytes(32).toString('hex')` (256 bits), igual que los tokens de `verifications`. Se persiste **hasheado con SHA-256** (`refresh_token_hash`), nunca en texto plano — exactamente como documenta el comentario de la migración de Fase 1 (`user_sessions`).
- **Rotación en cada refresh:** cada llamada a `POST /auth/refresh` revoca la sesión usada y crea una nueva. Esto permite detectar reuso de un refresh token robado: si un atacante reutiliza un token ya rotado, `findByRefreshTokenHash` no lo encontrará activo y el intento fallará con `InvalidRefreshTokenException`.
- **Revocación no invalida el JWT de acceso al instante:** esta propuesta gestiona el ciclo de vida del *refresh token* (sesión), no del *access token*. El `accessToken` (JWT) sigue siendo stateless y válido hasta su expiración natural (`JWT_EXPIRES_IN`) aunque su sesión asociada se revoque — esto ya estaba documentado como limitación conocida en `propuestas/12-flujo-completo.md` ("JWT robado después de logout | Pendiente: blacklist de tokens"). Resolverlo requeriría que `JwtAuthGuard`/`JwtStrategy` consulten `user_sessions` en cada request autenticado (tradeoff de performance vs. revocación instantánea) — queda fuera de esta propuesta.
- **Sin mapper para `register`/`login`/`refresh`:** siguen retornando `AuthResponseDto` vía `AuthMapper.toAuthResponse`, sin cambios de patrón — solo se agregó el parámetro `refreshToken`.
- **Con mapper para sesiones:** `ListSessionsUseCase` retorna `SessionRecord[]` (estructura interna, no DTO); `SessionMapper.toSessionResponseList` hace la transformación a `SessionResponseDto[]` en `auth.service.ts`, cumpliendo la regla estricta de capas.
- **`DELETE /auth/sessions/:id` responde 404 genérico** (vía `SessionNotFoundException`) tanto si la sesión no existe como si pertenece a otro usuario, para no confirmar la existencia de sesiones ajenas.
- **Sin `.spec.ts` en esta propuesta:** siguiendo el flujo del proyecto, las pruebas unitarias de los 4 use-cases nuevos, `SessionRepository` y `SessionMapper` se agregan en una aplicación/propuesta separada una vez aplicado este código (ver checklist de pruebas en `AGENTS.md`). Nota: al aplicar esta propuesta, los specs **existentes** `register.use-case.spec.ts` y `login.use-case.spec.ts` quedarán rotos (el mock de `IUserRepository`/`BcryptService` ya no alcanza — ahora también se inyecta `ISessionRepository` y el valor de retorno cambia de `User` a `{ user, refreshToken }`); deben actualizarse en la misma aplicación de esta propuesta, no en una posterior.

## Orden de aplicación

1. Actualizar `register.dto.ts`
2. Actualizar `login.dto.ts`
3. Actualizar `auth-response.dto.ts`
4. Crear `refresh-token.dto.ts`
5. Crear `logout.dto.ts`
6. Crear `session-response.dto.ts`
7. Actualizar `auth.controller.ts`
8. Actualizar `auth.service.ts`
9. Actualizar `register.use-case.ts`
10. Actualizar `login.use-case.ts`
11. Crear `refresh-token.use-case.ts`
12. Crear `logout.use-case.ts`
13. Crear `list-sessions.use-case.ts`
14. Crear `revoke-session.use-case.ts`
15. Crear `session.repository.interface.ts`
16. Crear `invalid-refresh-token.exception.ts`
17. Crear `session-not-found.exception.ts`
18. Crear `user-session.schema.ts`
19. Crear `session.repository.ts`
20. Actualizar `auth.mapper.ts`
21. Crear `session.mapper.ts`
22. Actualizar `auth.module.ts`
23. Actualizar `register.use-case.spec.ts` y `login.use-case.spec.ts` (mock de `ISessionRepository` + nuevo shape de retorno)
