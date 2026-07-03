# Propuesta: Endpoint cambiar contraseña (protegido con JWT)

Agrega el endpoint `PATCH /auth/change-password` que requiere autenticación JWT. El usuario debe enviar su contraseña actual y la nueva. Sigue la arquitectura DDD existente: nuevo use-case, nuevo DTO, nueva excepción de dominio, extensión del repositorio y del servicio.

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/modules/auth/domain/repositories/user.repository.interface.ts` | Modificar — agregar `findById` |
| `src/modules/auth/domain/exceptions/invalid-current-password.exception.ts` | Crear |
| `src/modules/auth/application/dtos/change-password.dto.ts` | Crear |
| `src/modules/auth/application/swagger-schemas/change-password.schema.ts` | Crear |
| `src/modules/auth/application/use-cases/change-password.use-case.ts` | Crear |
| `src/modules/auth/application/services/auth.service.ts` | Modificar — agregar `changePassword` |
| `src/modules/auth/infrastructure/repositories/user.repository.ts` | Modificar — implementar `findById` |
| `src/modules/auth/presentation/swagger/auth-controller.swagger.ts` | Modificar — agregar `ApiChangePassword` |
| `src/modules/auth/presentation/controllers/auth.controller.ts` | Modificar — agregar endpoint |

---

## 1. user.repository.interface.ts

**Ruta:** `src/modules/auth/domain/repositories/user.repository.interface.ts`

```typescript
import { User } from '../entities/user.entity';

export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<User>;
}

export const USER_REPOSITORY = Symbol('IUserRepository');
```

---

## 2. invalid-current-password.exception.ts

**Ruta:** `src/modules/auth/domain/exceptions/invalid-current-password.exception.ts`

```typescript
import { DomainException } from './domain.exception';
import { HttpStatus } from '@nestjs/common';

export class InvalidCurrentPasswordException extends DomainException {
  constructor() {
    super('Current password is incorrect', HttpStatus.BAD_REQUEST);
  }
}
```

---

## 3. change-password.dto.ts

**Ruta:** `src/modules/auth/application/dtos/change-password.dto.ts`

```typescript
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
```

---

## 4. change-password.schema.ts (Swagger)

**Ruta:** `src/modules/auth/application/swagger-schemas/change-password.schema.ts`

```typescript
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordSchema {
  @ApiProperty({ example: 'OldPass123!' })
  currentPassword!: string;

  @ApiProperty({ example: 'NewPass456!', minLength: 8 })
  newPassword!: string;
}
```

---

## 5. change-password.use-case.ts

**Ruta:** `src/modules/auth/application/use-cases/change-password.use-case.ts`

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import { BcryptService } from '../../infrastructure/services/bcrypt.service';
import { InvalidCurrentPasswordException } from '../../domain/exceptions/invalid-current-password.exception';
import { UserNotFoundException } from '../../domain/exceptions/user-not-found.exception';
import { User } from '../../domain/entities/user.entity';

@Injectable()
export class ChangePasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    private readonly bcryptService: BcryptService,
  ) {}

  async execute(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new UserNotFoundException(userId);
    }

    const isCurrentPasswordValid = await this.bcryptService.compare(
      currentPassword,
      user.password,
    );

    if (!isCurrentPasswordValid) {
      throw new InvalidCurrentPasswordException();
    }

    const newPasswordHash = await this.bcryptService.hash(newPassword);

    const updatedUser = new User(
      user.id,
      user.email,
      newPasswordHash,
      user.phone,
      user.createdAt,
      new Date(),
    );

    await this.userRepository.save(updatedUser);
  }
}
```

---

## 6. auth.service.ts

**Ruta:** `src/modules/auth/application/services/auth.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { RegisterUseCase } from '../use-cases/register.use-case';
import { LoginUseCase } from '../use-cases/login.use-case';
import { ChangePasswordUseCase } from '../use-cases/change-password.use-case';
import { JwtService } from '../../infrastructure/services/jwt.service';
import { AuthResponseDto } from '../dtos/auth-response.dto';
import { RegisterDto } from '../dtos/register.dto';
import { LoginDto } from '../dtos/login.dto';
import { ChangePasswordDto } from '../dtos/change-password.dto';
import { AuthMapper } from '../mappers/auth.mapper';

@Injectable()
export class AuthService {
  constructor(
    private readonly registerUseCase: RegisterUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
    private readonly jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    const user = await this.registerUseCase.execute(
      registerDto.email,
      registerDto.password,
      registerDto.phone,
    );

    const accessToken = this.jwtService.generateToken({
      sub: user.id,
      email: user.email,
    });

    return AuthMapper.toAuthResponse(user, accessToken);
  }

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.loginUseCase.execute(
      loginDto.email,
      loginDto.password,
    );

    const accessToken = this.jwtService.generateToken({
      sub: user.id,
      email: user.email,
    });

    return AuthMapper.toAuthResponse(user, accessToken);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    await this.changePasswordUseCase.execute(
      userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
```

---

## 7. user.repository.ts

**Ruta:** `src/modules/auth/infrastructure/repositories/user.repository.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSchema } from '../../../../infrastructure/database/schemas/user.schema';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';
import { User } from '../../domain/entities/user.entity';
import { UserMapper } from '../mappers/user.mapper';

@Injectable()
export class UserRepository implements IUserRepository {
  constructor(
    @InjectRepository(UserSchema)
    private readonly userSchemaRepository: Repository<UserSchema>,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    const userSchema = await this.userSchemaRepository.findOne({
      where: { email },
    });

    if (!userSchema) return null;

    return UserMapper.toDomain(userSchema);
  }

  async findById(id: string): Promise<User | null> {
    const userSchema = await this.userSchemaRepository.findOne({
      where: { id },
    });

    if (!userSchema) return null;

    return UserMapper.toDomain(userSchema);
  }

  async save(user: User): Promise<User> {
    const userSchema = UserMapper.toSchema(user);
    const savedSchema = await this.userSchemaRepository.save(userSchema);
    return UserMapper.toDomain(savedSchema);
  }
}
```

---

## 8. auth-controller.swagger.ts

**Ruta:** `src/modules/auth/presentation/swagger/auth-controller.swagger.ts`

> Agrega el decorador `ApiChangePassword` al final del archivo existente, manteniendo `ApiRegister` y `ApiLogin` intactos.

```typescript
import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthResponseSchema } from '../../application/swagger-schemas/auth-response.schema';

export const ApiRegister = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Register a new user',
      description:
        'Creates a new user account. The email must be unique.\n\n' +
        'The password must be at least 8 characters long and will be hashed with bcrypt before being stored.',
    }),
    ApiResponse({
      status: 201,
      description: 'User registered successfully',
      type: AuthResponseSchema,
    }),
    ApiResponse({
      status: 409,
      description: 'Email is already registered',
      schema: {
        example: {
          statusCode: 409,
          message: 'User with email user@example.com already exists',
          timestamp: '2026-01-24T20:50:00.000Z',
        },
      },
    }),
    ApiResponse({
      status: 400,
      description: 'Invalid input data',
      schema: {
        example: {
          statusCode: 400,
          message: ['Invalid email address', 'Password must be at least 8 characters long'],
          timestamp: '2026-01-24T20:50:00.000Z',
        },
      },
    }),
  );

export const ApiLogin = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Sign in',
      description:
        'Authenticates an existing user with email and password.\n\n' +
        'Returns a JWT token that must be included in the Authorization header as a Bearer token.',
    }),
    ApiResponse({
      status: 200,
      description: 'Login successful',
      type: AuthResponseSchema,
    }),
    ApiResponse({
      status: 401,
      description: 'Invalid credentials',
      schema: {
        example: {
          statusCode: 401,
          message: 'Invalid credentials',
          timestamp: '2026-01-24T20:50:00.000Z',
        },
      },
    }),
  );

export const ApiChangePassword = () =>
  applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Change password',
      description: 'Changes the authenticated user\'s password. Requires a valid JWT token.',
    }),
    ApiResponse({
      status: 204,
      description: 'Password changed successfully',
    }),
    ApiResponse({
      status: 400,
      description: 'Current password is incorrect',
      schema: {
        example: {
          statusCode: 400,
          message: 'Current password is incorrect',
          timestamp: '2026-06-24T10:00:00.000Z',
        },
      },
    }),
    ApiResponse({
      status: 401,
      description: 'Missing or invalid JWT token',
    }),
  );
```

---

## 9. auth.controller.ts

**Ruta:** `src/modules/auth/presentation/controllers/auth.controller.ts`

> Sin `@Public()` — el guard JWT se aplica automáticamente. El usuario autenticado se obtiene con `@CurrentUser()`.

```typescript
import { Controller, Post, Patch, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../../application/services/auth.service';
import { RegisterDto } from '../../application/dtos/register.dto';
import { LoginDto } from '../../application/dtos/login.dto';
import { ChangePasswordDto } from '../../application/dtos/change-password.dto';
import { AuthResponseDto } from '../../application/dtos/auth-response.dto';
import { Public } from '../decorators/public.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { ApiRegister, ApiLogin, ApiChangePassword } from '../swagger/auth-controller.swagger';

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

  @Patch('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiChangePassword()
  async changePassword(
    @CurrentUser() user: { sub: string },
    @Body() changePasswordDto: ChangePasswordDto,
  ): Promise<void> {
    return this.authService.changePassword(user.sub, changePasswordDto);
  }
}
```

---

## 10. auth.module.ts — agregar ChangePasswordUseCase

**Ruta:** `src/modules/auth/auth.module.ts`

> Solo se muestra la sección `providers` con el nuevo use-case añadido. El resto del módulo permanece igual.

```typescript
providers: [
  // Infrastructure
  {
    provide: USER_REPOSITORY,
    useClass: UserRepository,
  },
  BcryptService,
  JwtService,
  JwtStrategy,

  // Application
  RegisterUseCase,
  LoginUseCase,
  ChangePasswordUseCase,   // <-- nuevo
  AuthService,

  // Presentation
  JwtAuthGuard,
],
```

---

## Orden de aplicación

1. `user.repository.interface.ts` — agregar `findById`
2. `invalid-current-password.exception.ts` — crear
3. `change-password.dto.ts` — crear
4. `change-password.schema.ts` — crear
5. `change-password.use-case.ts` — crear
6. `user.repository.ts` — implementar `findById`
7. `auth.service.ts` — agregar `changePassword`
8. `auth-controller.swagger.ts` — agregar `ApiChangePassword`
9. `auth.controller.ts` — agregar endpoint
10. `auth.module.ts` — registrar `ChangePasswordUseCase` en providers
