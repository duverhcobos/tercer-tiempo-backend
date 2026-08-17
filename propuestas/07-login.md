# Propuesta: POST /auth/login

**Estado:** ✅ Completado — `LoginUseCase` y endpoint implementados en `src/`.

Implementación del endpoint de inicio de sesión con validación de credenciales, verificación de estado de cuenta y generación de JWT.

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/modules/auth/domain/exceptions/email-not-verified.exception.ts` | Crear |
| `src/modules/auth/domain/exceptions/account-suspended.exception.ts` | Crear |
| `src/modules/auth/domain/repositories/user.repository.interface.ts` | Actualizar |
| `src/modules/auth/application/dtos/login.dto.ts` | Reemplazar (estaba comentado) |
| `src/modules/auth/application/swagger-schemas/login.schema.ts` | Reemplazar (estaba comentado) |
| `src/modules/auth/application/swagger-schemas/auth-response.schema.ts` | Reemplazar (estaba comentado) |
| `src/modules/auth/application/use-cases/login.use-case.ts` | Reemplazar (estaba comentado) |
| `src/modules/auth/application/services/auth.service.ts` | Actualizar |
| `src/modules/auth/infrastructure/repositories/user.repository.ts` | Actualizar |
| `src/modules/auth/presentation/controllers/auth.controller.ts` | Actualizar |
| `src/modules/auth/presentation/swagger/auth-controller.swagger.ts` | Reemplazar (estaba comentado) |
| `src/modules/auth/auth.module.ts` | Actualizar |

---

## 1. email-not-verified.exception.ts

**Ruta:** `src/modules/auth/domain/exceptions/email-not-verified.exception.ts`

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class EmailNotVerifiedException extends DomainException {
    constructor() {
        super('Email address has not been verified', 403);
    }
}
```

---

## 2. account-suspended.exception.ts

**Ruta:** `src/modules/auth/domain/exceptions/account-suspended.exception.ts`

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class AccountSuspendedException extends DomainException {
    constructor() {
        super('Account has been suspended', 403);
    }
}
```

---

## 3. user.repository.interface.ts

**Ruta:** `src/modules/auth/domain/repositories/user.repository.interface.ts`

```typescript
import { User } from '../entities/user.entity';
import { UserRole } from '../enums/user-role.enum';

export interface IUserRepository {
    findByEmail(email: string): Promise<User | null>;
    findByUsername(username: string): Promise<User | null>;
    findByEmailWithRole(email: string): Promise<User | null>;
    findById(id: string): Promise<User | null>;
    registerWithRole(user: User, role: UserRole): Promise<User>;
    updateLastLoginAt(userId: string): Promise<void>;
    updateStatus(userId: string, status: string): Promise<void>;
    hasProfile(userId: string): Promise<boolean>;
}

export const USER_REPOSITORY = Symbol('IUserRepository');
```

---

## 4. login.dto.ts

**Ruta:** `src/modules/auth/application/dtos/login.dto.ts`

```typescript
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
    @IsEmail({}, { message: 'email must be an email' })
    @IsNotEmpty({ message: 'email should not be empty' })
    email!: string;

    @IsString({ message: 'password must be a string' })
    @IsNotEmpty({ message: 'Password is required' })
    password!: string;
}
```

---

## 5. login.schema.ts

**Ruta:** `src/modules/auth/application/swagger-schemas/login.schema.ts`

```typescript
import { ApiProperty } from '@nestjs/swagger';

export class LoginSchema {
    @ApiProperty({ example: 'jugador@ejemplo.com', description: 'Correo electrónico registrado' })
    email!: string;

    @ApiProperty({ example: 'Password123', description: 'Contraseña del usuario' })
    password!: string;
}
```

---

## 6. auth-response.schema.ts

**Ruta:** `src/modules/auth/application/swagger-schemas/auth-response.schema.ts`

```typescript
import { ApiProperty } from '@nestjs/swagger';

export class AuthResponseSchema {
    @ApiProperty({ example: 'uuid-v4' })
    id!: string;

    @ApiProperty({ example: 'jugador@ejemplo.com' })
    email!: string;

    @ApiProperty({ example: 'duver_10' })
    username!: string;

    @ApiProperty({ example: 'PLAYER', enum: ['PLAYER', 'ORGANIZER', 'SPECTATOR'] })
    role!: string;

    @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
    accessToken!: string;

    @ApiProperty({ example: '2026-08-01T00:00:00.000Z' })
    createdAt!: Date;

    @ApiProperty({ example: true, description: 'true en registro, false en login' })
    isNewUser!: boolean;
}
```

---

## 7. login.use-case.ts

**Ruta:** `src/modules/auth/application/use-cases/login.use-case.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';

import { User } from '../../domain/entities/user.entity';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import { InvalidCredentialsException } from '../../domain/exceptions/invalid-credentials.exception';
import { EmailNotVerifiedException } from '../../domain/exceptions/email-not-verified.exception';
import { AccountSuspendedException } from '../../domain/exceptions/account-suspended.exception';
import { BcryptService } from '../../infrastructure/services/bcrypt.service';

@Injectable()
export class LoginUseCase {
    constructor(
        @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
        private readonly bcryptService: BcryptService,
    ) {}

    async execute(command: { email: string; password: string }): Promise<User> {
        const user = await this.userRepository.findByEmailWithRole(command.email);

        // Credenciales inválidas: mismo mensaje para email no encontrado y password incorrecto
        // (evita enumerar usuarios registrados)
        if (!user) throw new InvalidCredentialsException();

        const isPasswordValid = await this.bcryptService.compare(command.password, user.password);
        if (!isPasswordValid) throw new InvalidCredentialsException();

        if (user.status === 'pending_verification') throw new EmailNotVerifiedException();
        if (user.status === 'suspended') throw new AccountSuspendedException();
        if (user.status === 'banned') throw new InvalidCredentialsException();

        await this.userRepository.updateLastLoginAt(user.id);

        return user;
    }
}
```

---

## 8. auth.service.ts

**Ruta:** `src/modules/auth/application/services/auth.service.ts`

```typescript
import { Injectable } from '@nestjs/common';

import { RegisterDto } from '../dtos/register.dto';
import { LoginDto } from '../dtos/login.dto';
import { AuthResponseDto } from '../dtos/auth-response.dto';
import { AuthMapper } from '../mappers/auth.mapper';
import { RegisterUseCase } from '../use-cases/register.use-case';
import { LoginUseCase } from '../use-cases/login.use-case';
import { JwtService } from '../../infrastructure/services/jwt.service';

@Injectable()
export class AuthService {
    constructor(
        private readonly registerUseCase: RegisterUseCase,
        private readonly loginUseCase: LoginUseCase,
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
}
```

---

## 9. user.repository.ts

**Ruta:** `src/modules/auth/infrastructure/repositories/user.repository.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { User } from '../../domain/entities/user.entity';
import { UserRole } from '../../domain/enums/user-role.enum';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';
import { UserSchema } from '../../../../infrastructure/database/schemas/user.schema';
import { UserMapper } from '../mappers/user.mapper';

@Injectable()
export class UserRepository implements IUserRepository {
    constructor(
        @InjectRepository(UserSchema)
        private readonly userSchemaRepository: Repository<UserSchema>,
        private readonly dataSource: DataSource,
    ) {}

    async findByEmail(email: string): Promise<User | null> {
        const schema = await this.userSchemaRepository
            .createQueryBuilder('user')
            .where('LOWER(user.email) = LOWER(:email)', { email })
            .getOne();
        return schema ? UserMapper.toDomain(schema) : null;
    }

    async findByUsername(username: string): Promise<User | null> {
        const schema = await this.userSchemaRepository
            .createQueryBuilder('user')
            .where('LOWER(user.username) = LOWER(:username)', { username })
            .getOne();
        return schema ? UserMapper.toDomain(schema) : null;
    }

    async findByEmailWithRole(email: string): Promise<User | null> {
        const rows = await this.dataSource.query(
            `SELECT u.id, u.email, u.username, u.password_hash, u.status,
                    u.created_at, u.updated_at, r.name AS role
             FROM "users" u
             LEFT JOIN "user_roles" ur ON ur.user_id = u.id
             LEFT JOIN "roles" r       ON r.id = ur.role_id
             WHERE LOWER(u.email) = LOWER($1)
               AND u.deleted_at IS NULL`,
            [email],
        );
        if (!rows.length) return null;
        const row = rows[0];
        return new User(
            row.id,
            row.email,
            row.username,
            row.password_hash,
            row.status,
            row.created_at,
            row.updated_at,
            (row.role as UserRole) ?? null,
        );
    }

    async findById(id: string): Promise<User | null> {
        const rows = await this.dataSource.query(
            `SELECT u.id, u.email, u.username, u.password_hash, u.status,
                    u.created_at, u.updated_at, r.name AS role
             FROM "users" u
             LEFT JOIN "user_roles" ur ON ur.user_id = u.id
             LEFT JOIN "roles" r       ON r.id = ur.role_id
             WHERE u.id = $1
               AND u.deleted_at IS NULL`,
            [id],
        );
        if (!rows.length) return null;
        const row = rows[0];
        return new User(
            row.id,
            row.email,
            row.username,
            row.password_hash,
            row.status,
            row.created_at,
            row.updated_at,
            (row.role as UserRole) ?? null,
        );
    }

    async registerWithRole(user: User, role: UserRole): Promise<User> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const schema = UserMapper.toSchema(user);
            const saved = await queryRunner.manager.save(UserSchema, schema);

            await queryRunner.query(
                `INSERT INTO "user_roles" (user_id, role_id)
                 SELECT $1, id FROM "roles" WHERE name = $2
                 ON CONFLICT DO NOTHING`,
                [saved.id, role],
            );

            await queryRunner.commitTransaction();
            return UserMapper.toDomain(saved);
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    }

    async updateLastLoginAt(userId: string): Promise<void> {
        await this.userSchemaRepository.update(userId, { lastLoginAt: new Date() });
    }

    async updateStatus(userId: string, status: string): Promise<void> {
        await this.userSchemaRepository.update(userId, { status });
    }

    async hasProfile(userId: string): Promise<boolean> {
        const rows = await this.dataSource.query(
            `SELECT EXISTS(
               SELECT 1 FROM "user_profiles"
               WHERE user_id = $1 AND deleted_at IS NULL
             ) AS "exists"`,
            [userId],
        );
        return rows[0].exists === true || rows[0].exists === 't';
    }
}
```

---

## 10. auth-controller.swagger.ts

**Ruta:** `src/modules/auth/presentation/swagger/auth-controller.swagger.ts`

```typescript
import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';

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
        ApiResponse({
            status: HttpStatus.FORBIDDEN,
            description: 'Email no verificado o cuenta suspendida',
        }),
        ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Demasiados intentos' }),
    );
}
```

---

## 11. auth.controller.ts

**Ruta:** `src/modules/auth/presentation/controllers/auth.controller.ts`

```typescript
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { RegisterDto } from '../../application/dtos/register.dto';
import { LoginDto } from '../../application/dtos/login.dto';
import { AuthResponseDto } from '../../application/dtos/auth-response.dto';
import { AuthService } from '../../application/services/auth.service';
import { Public } from '../decorators/public.decorator';
import { ApiRegister, ApiLogin } from '../swagger/auth-controller.swagger';

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
}
```

---

## 12. auth.module.ts

**Ruta:** `src/modules/auth/auth.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';

import { UserSchema } from '../../infrastructure/database/schemas/user.schema';
import { UserRepository } from './infrastructure/repositories/user.repository';
import { BcryptService } from './infrastructure/services/bcrypt.service';
import { JwtService } from './infrastructure/services/jwt.service';
import { JwtStrategy } from './infrastructure/strategies/jwt.strategy';

import { RegisterUseCase } from './application/use-cases/register.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { AuthService } from './application/services/auth.service';

import { AuthController } from './presentation/controllers/auth.controller';
import { JwtAuthGuard } from './presentation/guards/jwt-auth.guard';

import { USER_REPOSITORY } from './domain/repositories/user.repository.interface';

@Module({
    imports: [ConfigModule, PassportModule, TypeOrmModule.forFeature([UserSchema])],
    controllers: [AuthController],
    providers: [
        { provide: USER_REPOSITORY, useClass: UserRepository },
        BcryptService,
        JwtService,
        JwtStrategy,
        RegisterUseCase,
        LoginUseCase,
        AuthService,
        JwtAuthGuard,
    ],
    exports: [JwtAuthGuard, JwtService],
})
export class AuthModule {}
```

---

## Orden de aplicación

1. Crear los dos archivos de excepciones nuevos (`email-not-verified`, `account-suspended`)
2. Actualizar `user.repository.interface.ts`
3. Reemplazar `login.dto.ts`, `login.schema.ts`, `auth-response.schema.ts`
4. Reemplazar `login.use-case.ts`
5. Actualizar `auth.service.ts`
6. Actualizar `user.repository.ts`
7. Reemplazar `auth-controller.swagger.ts`
8. Actualizar `auth.controller.ts`
9. Actualizar `auth.module.ts`
