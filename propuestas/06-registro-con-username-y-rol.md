# Propuesta: Registro con username y rol (Opción A)

Adapta el endpoint `POST /auth/register` para que reciba `username` y `role` desde el frontend, corrija el campo `username` faltante en la BD, y asigne el rol al usuario en la tabla `user_roles` durante el registro.

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/modules/auth/domain/enums/user-role.enum.ts` | Crear — enum de roles válidos |
| `src/modules/auth/domain/exceptions/username-already-exists.exception.ts` | Crear — excepción de dominio |
| `src/modules/auth/domain/entities/user.entity.ts` | Modificar — agregar `username`, `status`, `role` |
| `src/modules/auth/domain/repositories/user.repository.interface.ts` | Modificar — agregar `findByUsername` y `assignRole` |
| `src/modules/auth/application/dtos/register.dto.ts` | Modificar — agregar `username` y `role` |
| `src/modules/auth/application/swagger-schemas/register.schema.ts` | Modificar — documentar `username` y `role` |
| `src/modules/auth/application/use-cases/register.use-case.ts` | Modificar — validar username, asignar rol |
| `src/modules/auth/application/services/auth.service.ts` | Modificar — pasar DTO completo al use case |
| `src/modules/auth/application/dtos/auth-response.dto.ts` | Modificar — incluir `username` y `role` en respuesta |
| `src/modules/auth/application/mappers/auth.mapper.ts` | Modificar — mapear `username` y `role` |
| `src/infrastructure/database/schemas/user.schema.ts` | Modificar — agregar columnas `username` y `status` |
| `src/modules/auth/infrastructure/mappers/user.mapper.ts` | Modificar — mapear `username` y `status` |
| `src/modules/auth/infrastructure/repositories/user.repository.ts` | Modificar — implementar `findByUsername` y `assignRole` |

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

Agrega `username`, `status` y `role` (opcional, se puebla en registro/consultas que incluyan roles).

```typescript
import { UserRole } from '../enums/user-role.enum';

export class User {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly username: string,
    public readonly password: string | null,
    public readonly phone: string | null,
    public readonly status: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly role: UserRole | null = null,
    public readonly googleId: string | null = null,
    public readonly avatarUrl: string | null = null,
  ) {}

  static create(
    email: string,
    username: string,
    password: string,
    role: UserRole,
    phone?: string,
  ): User {
    return new User(
      '',
      email,
      username,
      password,
      phone ?? null,
      'pending_verification',
      new Date(),
      new Date(),
      role,
    );
  }

  static createFromGoogle(
    email: string,
    googleId: string,
    avatarUrl?: string,
  ): User {
    return new User(
      '',
      email,
      '',        // username vacío; se completa en onboarding
      null,
      null,
      'pending_verification',
      new Date(),
      new Date(),
      null,
      googleId,
      avatarUrl ?? null,
    );
  }
}
```

---

## 4. IUserRepository

**Ruta:** `src/modules/auth/domain/repositories/user.repository.interface.ts`

```typescript
import { User } from '../entities/user.entity';
import { UserRole } from '../enums/user-role.enum';

export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  findByGoogleId(googleId: string): Promise<User | null>;
  save(user: User): Promise<User>;
  assignRole(userId: string, role: UserRole): Promise<void>;
}

export const USER_REPOSITORY = Symbol('IUserRepository');
```

---

## 5. RegisterDto

**Ruta:** `src/modules/auth/application/dtos/register.dto.ts`

```typescript
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
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

  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Invalid phone number' })
  phone?: string;
}
```

---

## 6. RegisterSchema (Swagger)

**Ruta:** `src/modules/auth/application/swagger-schemas/register.schema.ts`

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

  @ApiPropertyOptional({
    description: 'Número de teléfono en formato E.164',
    example: '+573001234567',
  })
  phone?: string;
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
  phone?: string;
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
      command.phone,
    );

    const savedUser = await this.userRepository.save(user);
    await this.userRepository.assignRole(savedUser.id, command.role);

    // Retornar usuario con rol para que la capa de aplicación lo incluya en la respuesta
    return new User(
      savedUser.id,
      savedUser.email,
      savedUser.username,
      savedUser.password,
      savedUser.phone,
      savedUser.status,
      savedUser.createdAt,
      savedUser.updatedAt,
      command.role,
      savedUser.googleId,
      savedUser.avatarUrl,
    );
  }
}
```

---

## 8. AuthService

**Ruta:** `src/modules/auth/application/services/auth.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { RegisterUseCase } from '../use-cases/register.use-case';
import { LoginUseCase } from '../use-cases/login.use-case';
import { GoogleLoginUseCase, GoogleProfile } from '../use-cases/google-login.use-case';
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
    private readonly googleLoginUseCase: GoogleLoginUseCase,
    private readonly jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    const user = await this.registerUseCase.execute({
      email: registerDto.email,
      username: registerDto.username,
      password: registerDto.password,
      role: registerDto.role,
      phone: registerDto.phone,
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

  async googleLogin(profile: GoogleProfile): Promise<AuthResponseDto> {
    const { user, isNewUser } = await this.googleLoginUseCase.execute(profile);

    const accessToken = this.jwtService.generateToken({
      sub: user.id,
      email: user.email,
    });

    return AuthMapper.toAuthResponse(user, accessToken, isNewUser);
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

Agrega `username` y `status`. El `status` se almacena como varchar porque TypeORM con enums PostgreSQL personalizados requiere configuración adicional; el tipo real en BD es `user_status`.

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

  @Column({ unique: true })
  email!: string;

  @Column({ length: 50, unique: true })
  username!: string;

  @Column({ name: 'password_hash', nullable: true, type: 'varchar' })
  passwordHash!: string | null;

  @Column({ name: 'phone_number', nullable: true, length: 20 })
  phoneNumber!: string;

  @Column({ name: 'sync_id', type: 'uuid', nullable: true, unique: true })
  syncId!: string;

  @Column({
    type: 'varchar',
    default: 'pending_verification',
  })
  status!: string;

  @Column({ name: 'google_id', nullable: true, unique: true, type: 'varchar' })
  googleId!: string | null;

  @Column({ name: 'avatar_url', nullable: true, type: 'text' })
  avatarUrl!: string | null;

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
      schema.phoneNumber ?? null,
      schema.status,
      schema.createdAt,
      schema.updatedAt,
      null,             // role: no se carga desde esta tabla
      schema.googleId ?? null,
      schema.avatarUrl ?? null,
    );
  }

  static toSchema(user: User): UserSchema {
    const schema = new UserSchema();

    if (user.id) {
      schema.id = user.id;
    }

    schema.email = user.email;
    schema.username = user.username;
    schema.passwordHash = user.password;

    if (user.phone) {
      schema.phoneNumber = user.phone;
    }

    if (user.googleId) {
      schema.googleId = user.googleId;
    }

    if (user.avatarUrl) {
      schema.avatarUrl = user.avatarUrl;
    }

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

Se inyecta `DataSource` para manejar la asignación de roles con una query raw hacia `user_roles`.

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

  async findByGoogleId(googleId: string): Promise<User | null> {
    const userSchema = await this.userSchemaRepository.findOne({
      where: { googleId },
    });
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

## Orden de aplicación

1. Copiar el enum `user-role.enum.ts` (dominio, no tiene dependencias)
2. Copiar la excepción `username-already-exists.exception.ts`
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

> No se requiere migración: las columnas `username` y `status` ya existen en la BD (migración `1706140000000-CreateUsersTable.ts`). Solo se estaban mapeando incorrectamente en el código.
