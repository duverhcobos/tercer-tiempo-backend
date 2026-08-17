# Propuesta: Registro con username y rol (Fase 1 limpia)

**Estado:** ✅ Completado — `RegisterUseCase` recibe `username` y `role`, asigna en `user_roles`.

Deshabilita las migraciones de fases futuras para trabajar solo con los campos de la Fase 1. Adapta el endpoint `POST /auth/register` para que reciba `username` y `role`, y asigne el rol en `user_roles`. Elimina de la cadena DDD todos los campos que no existen en la tabla `users` de la Fase 1 (`phone_number`, `google_id`, `avatar_url`).

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/infrastructure/database/migrations/future/` | Crear carpeta — mover las 4 migraciones futuras aquí |
| `src/modules/auth/domain/enums/user-role.enum.ts` | Crear — enum de roles válidos ✓ ya existe |
| `src/modules/auth/domain/exceptions/username-already-exists.exception.ts` | Crear — excepción de dominio ✓ ya existe |
| `src/modules/auth/domain/entities/user.entity.ts` | Modificar — Fase 1 only: quitar `phone`, `googleId`, `avatarUrl` |
| `src/modules/auth/domain/repositories/user.repository.interface.ts` | Modificar — agregar `findByUsername`, `assignRole`; quitar `findByGoogleId` |
| `src/modules/auth/application/dtos/register.dto.ts` | Modificar — agregar `username`, `role`; quitar `phone` |
| `src/modules/auth/application/swagger-schemas/register.schema.ts` | Modificar — documentar `username` y `role` |
| `src/modules/auth/application/use-cases/register.use-case.ts` | Modificar — validar username, asignar rol |
| `src/modules/auth/application/services/auth.service.ts` | Modificar — solo registro y login (Google OAuth es Fase 2) |
| `src/modules/auth/application/dtos/auth-response.dto.ts` | Modificar — incluir `username` y `role` en respuesta |
| `src/modules/auth/application/mappers/auth.mapper.ts` | Modificar — mapear `username` y `role` |
| `src/infrastructure/database/schemas/user.schema.ts` | Modificar — Fase 1 only: quitar `phoneNumber`, `googleId`, `avatarUrl` |
| `src/modules/auth/infrastructure/mappers/user.mapper.ts` | Modificar — Fase 1 only |
| `src/modules/auth/infrastructure/repositories/user.repository.ts` | Modificar — `findByUsername`, `assignRole`; quitar `findByGoogleId` |
| `src/modules/auth/presentation/controllers/auth.controller.ts` | Modificar — quitar rutas Google OAuth (Fase 2) |

---

## 0. Deshabilitar migraciones futuras

Mover las 4 migraciones que no corresponden a la Fase 1 a una subcarpeta `future/`. El glob `src/infrastructure/database/migrations/*.ts` en `typeorm.config.ts` no las detectará.

**Comandos PowerShell:**

```powershell
New-Item -ItemType Directory -Path "src/infrastructure/database/migrations/future"
Move-Item "src/infrastructure/database/migrations/1751000000000-AddGoogleAuthToUsers.ts"  "src/infrastructure/database/migrations/future/"
Move-Item "src/infrastructure/database/migrations/1752000000000-AddPhoneAuth.ts"          "src/infrastructure/database/migrations/future/"
Move-Item "src/infrastructure/database/migrations/1753000000000-AddTwoFactorAuth.ts"      "src/infrastructure/database/migrations/future/"
Move-Item "src/infrastructure/database/migrations/1754000000000-CreatePlayerProfiles.ts"  "src/infrastructure/database/migrations/future/"
```

Con esto, solo se ejecuta `1706140000000-CreateUsersTable.ts` y la tabla `users` queda con los campos exactos de la Fase 1:

| Columna | Tipo |
|---------|------|
| `id` | UUID PK |
| `sync_id` | UUID UNIQUE |
| `email` | VARCHAR(255) |
| `username` | VARCHAR(50) NOT NULL |
| `password_hash` | VARCHAR(255) NOT NULL |
| `status` | user_status DEFAULT 'pending_verification' |
| `last_login_at` | TIMESTAMP |
| `created_at` | TIMESTAMP |
| `updated_at` | TIMESTAMP |
| `deleted_at` | TIMESTAMP |

> **Nota:** `phone_number`, `google_id`, `avatar_url` y campos 2FA no existen en la Fase 1. Cualquier código que los referencie se elimina en los pasos siguientes.

---

## 1. UserRole enum

**Ruta:** `src/modules/auth/domain/enums/user-role.enum.ts`

```typescript
export enum UserRole {
  PLAYER = 'PLAYER',
  ORGANIZER = 'ORGANIZER',
  SPECTATOR = 'SPECTATOR',
}
```

---

## 2. UsernameAlreadyExistsException

**Ruta:** `src/modules/auth/domain/exceptions/username-already-exists.exception.ts`

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class UsernameAlreadyExistsException extends DomainException {
  constructor(username: string) {
    super(`Username "${username}" is already taken`, 409);
    this.name = 'UsernameAlreadyExistsException';
  }
}
```

---

## 3. User entity

**Ruta:** `src/modules/auth/domain/entities/user.entity.ts`

Solo campos de la tabla `users` Fase 1. Se elimina `phone`, `googleId`, `avatarUrl` y `createFromGoogle` (son Fase 2+).

```typescript
import { UserRole } from '../enums/user-role.enum';

export class User {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly username: string,
    public readonly password: string | null,
    public readonly status: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly role: UserRole | null = null,
  ) {}

  static create(
    email: string,
    username: string,
    password: string,
    role: UserRole,
  ): User {
    return new User(
      '',
      email,
      username,
      password,
      'pending_verification',
      new Date(),
      new Date(),
      role,
    );
  }
}
```

---

## 4. IUserRepository

**Ruta:** `src/modules/auth/domain/repositories/user.repository.interface.ts`

Se elimina `findByGoogleId` (Fase 2). Se agregan `findByUsername` y `assignRole`.

```typescript
import { User } from '../entities/user.entity';
import { UserRole } from '../enums/user-role.enum';

export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  save(user: User): Promise<User>;
  assignRole(userId: string, role: UserRole): Promise<void>;
}

export const USER_REPOSITORY = Symbol('IUserRepository');
```

---

## 5. RegisterDto

**Ruta:** `src/modules/auth/application/dtos/register.dto.ts`

Se elimina `phone` — la columna `phone_number` no existe en la Fase 1.

```typescript
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../domain/enums/user-role.enum';

export class RegisterDto {
  @IsEmail({}, { message: 'Invalid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Username is required' })
  @MinLength(3, { message: 'Username must be at least 3 characters' })
  @MaxLength(50, { message: 'Username must be at most 50 characters' })
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'Username can only contain letters, numbers and underscores',
  })
  username!: string;

  @IsString({ message: 'Password must be a string' })
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

---

## 6. RegisterSchema (Swagger)

**Ruta:** `src/modules/auth/application/swagger-schemas/register.schema.ts`

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../domain/enums/user-role.enum';

export class RegisterSchema {
  @ApiProperty({
    description: 'Email único del usuario',
    example: 'jugador@ejemplo.com',
    format: 'email',
  })
  email: string;

  @ApiProperty({
    description: 'Nombre de usuario único (letras, números y guion bajo)',
    example: 'duver_10',
    minLength: 3,
    maxLength: 50,
  })
  username: string;

  @ApiProperty({
    description: 'Contraseña (mínimo 8 caracteres)',
    example: 'Password123',
    minLength: 8,
  })
  password: string;

  @ApiProperty({
    description: 'Rol con el que el usuario se registra',
    enum: UserRole,
    example: UserRole.PLAYER,
  })
  role: UserRole;
}
```

---

## 7. RegisterUseCase

**Ruta:** `src/modules/auth/application/use-cases/register.use-case.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import { User } from '../../domain/entities/user.entity';
import { UserRole } from '../../domain/enums/user-role.enum';
import { Email } from '../../domain/value-objects/email.vo';
import { Password } from '../../domain/value-objects/password.vo';
import { BcryptService } from '../../infrastructure/services/bcrypt.service';
import { UserAlreadyExistsException } from '../../domain/exceptions/user-already-exists.exception';
import { UsernameAlreadyExistsException } from '../../domain/exceptions/username-already-exists.exception';

interface RegisterCommand {
  email: string;
  username: string;
  password: string;
  role: UserRole;
}

@Injectable()
export class RegisterUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    private readonly bcryptService: BcryptService,
  ) {}

  async execute(command: RegisterCommand): Promise<User> {
    const emailVO = new Email(command.email);
    const passwordVO = new Password(command.password);

    const [existingByEmail, existingByUsername] = await Promise.all([
      this.userRepository.findByEmail(emailVO.getValue()),
      this.userRepository.findByUsername(command.username),
    ]);

    if (existingByEmail) {
      throw new UserAlreadyExistsException(emailVO.getValue());
    }
    if (existingByUsername) {
      throw new UsernameAlreadyExistsException(command.username);
    }

    const hashedPassword = await this.bcryptService.hash(passwordVO.getValue());

    const user = User.create(
      emailVO.getValue(),
      command.username,
      hashedPassword,
      command.role,
    );

    const savedUser = await this.userRepository.save(user);
    await this.userRepository.assignRole(savedUser.id, command.role);

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

## 8. AuthService

**Ruta:** `src/modules/auth/application/services/auth.service.ts`

Se elimina `googleLogin` — depende de `google_id` que no existe en Fase 1. Se elimina la importación de `GoogleLoginUseCase`.

```typescript
import { Injectable } from '@nestjs/common';
import { RegisterUseCase } from '../use-cases/register.use-case';
import { LoginUseCase } from '../use-cases/login.use-case';
import { JwtService } from '../../infrastructure/services/jwt.service';
import { AuthResponseDto } from '../dtos/auth-response.dto';
import { RegisterDto } from '../dtos/register.dto';
import { LoginDto } from '../dtos/login.dto';
import { AuthMapper } from '../mappers/auth.mapper';

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

    const accessToken = this.jwtService.generateToken({
      sub: user.id,
      email: user.email,
    });

    return AuthMapper.toAuthResponse(user, accessToken, true);
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
}
```

---

## 9. AuthResponseDto

**Ruta:** `src/modules/auth/application/dtos/auth-response.dto.ts`

```typescript
import { UserRole } from '../../domain/enums/user-role.enum';

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
    isNewUser = false,
  ) {
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

---

## 10. AuthMapper (application)

**Ruta:** `src/modules/auth/application/mappers/auth.mapper.ts`

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

---

## 11. UserSchema

**Ruta:** `src/infrastructure/database/schemas/user.schema.ts`

Solo columnas que existen en la Fase 1. Se eliminan `phoneNumber`, `googleId`, `avatarUrl`.

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class UserSchema {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'sync_id', type: 'uuid', nullable: true, unique: true })
  syncId!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ length: 50, unique: true })
  username!: string;

  @Column({ name: 'password_hash', type: 'varchar' })
  passwordHash!: string;

  @Column({ type: 'varchar', default: 'pending_verification' })
  status!: string;

  @Column({ name: 'last_login_at', type: 'timestamp', nullable: true })
  lastLoginAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
```

---

## 12. UserMapper (infrastructure)

**Ruta:** `src/modules/auth/infrastructure/mappers/user.mapper.ts`

```typescript
import { UserSchema } from '../../../../infrastructure/database/schemas/user.schema';
import { User } from '../../domain/entities/user.entity';

export class UserMapper {
  static toDomain(schema: UserSchema): User {
    return new User(
      schema.id,
      schema.email,
      schema.username,
      schema.passwordHash,
      schema.status,
      schema.createdAt,
      schema.updatedAt,
    );
  }

  static toSchema(user: User): UserSchema {
    const schema = new UserSchema();

    if (user.id) {
      schema.id = user.id;
    }

    schema.email = user.email;
    schema.username = user.username;
    schema.passwordHash = user.password!;

    return schema;
  }

  static toDomainList(schemas: UserSchema[]): User[] {
    return schemas.map((schema) => this.toDomain(schema));
  }
}
```

---

## 13. UserRepository (infrastructure)

**Ruta:** `src/modules/auth/infrastructure/repositories/user.repository.ts`

Se elimina `findByGoogleId`. Se agregan `findByUsername` y `assignRole`.

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UserSchema } from '../../../../infrastructure/database/schemas/user.schema';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';
import { User } from '../../domain/entities/user.entity';
import { UserRole } from '../../domain/enums/user-role.enum';
import { UserMapper } from '../mappers/user.mapper';

@Injectable()
export class UserRepository implements IUserRepository {
  constructor(
    @InjectRepository(UserSchema)
    private readonly userSchemaRepository: Repository<UserSchema>,
    private readonly dataSource: DataSource,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    const userSchema = await this.userSchemaRepository.findOne({
      where: { email },
    });
    return userSchema ? UserMapper.toDomain(userSchema) : null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const userSchema = await this.userSchemaRepository
      .createQueryBuilder('user')
      .where('LOWER(user.username) = LOWER(:username)', { username })
      .getOne();
    return userSchema ? UserMapper.toDomain(userSchema) : null;
  }

  async save(user: User): Promise<User> {
    const userSchema = UserMapper.toSchema(user);
    const savedSchema = await this.userSchemaRepository.save(userSchema);
    return UserMapper.toDomain(savedSchema);
  }

  async assignRole(userId: string, role: UserRole): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO "user_roles" (user_id, role_id)
       SELECT $1, id FROM "roles" WHERE name = $2
       ON CONFLICT DO NOTHING`,
      [userId, role],
    );
  }
}
```

---

## 14. AuthController

**Ruta:** `src/modules/auth/presentation/controllers/auth.controller.ts`

Se eliminan las rutas `GET /auth/google` y `GET /auth/google/callback` — requieren `google_id` (Fase 2). Se eliminan las importaciones de `GoogleAuthGuard` y `Request`/`Response`.

```typescript
import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../../application/services/auth.service';
import { RegisterDto } from '../../application/dtos/register.dto';
import { LoginDto } from '../../application/dtos/login.dto';
import { AuthResponseDto } from '../../application/dtos/auth-response.dto';
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

## Orden de aplicación

1. **Mover migraciones futuras** a `future/` (paso 0 — antes de tocar cualquier código)
2. Borrar la BD manualmente y ejecutar solo `1706140000000-CreateUsersTable.ts`
3. Actualizar `user.entity.ts`
4. Actualizar `user.repository.interface.ts`
5. Actualizar `user.schema.ts`
6. Actualizar `user.mapper.ts` (infrastructure)
7. Actualizar `user.repository.ts`
8. Actualizar `register.dto.ts`
9. Actualizar `register.schema.ts`
10. Actualizar `auth-response.dto.ts`
11. Actualizar `auth.mapper.ts`
12. Actualizar `register.use-case.ts`
13. Actualizar `auth.service.ts`
14. Actualizar `auth.controller.ts`

> Las migraciones movidas a `future/` se recuperarán cuando se implemente cada fase.
> El módulo de Google OAuth (`GoogleLoginUseCase`, `GoogleAuthGuard`, `strategies/google.strategy.ts`) puede eliminarse del `auth.module.ts` para evitar errores de inyección de dependencias al arrancar.

