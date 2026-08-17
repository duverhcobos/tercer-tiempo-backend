# Propuesta: Registro de Usuario Completo

**Estado:** ✅ Completado — `RegisterUseCase` y `POST /auth/register` implementados en `src/`.

Adaptar el módulo de auth para que la tabla `users` y el endpoint `POST /auth/register`
sean acordes al esquema SQL del proyecto 3TIEMPO.

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `migrations/...-UpdateUsersTable.ts` | Nueva migración con todos los campos |
| `schemas/user.schema.ts` | Agregar columnas al schema TypeORM |
| `domain/entities/user.entity.ts` | Agregar propiedades a la entidad |
| `application/dtos/register.dto.ts` | Agregar campos con validaciones |
| `application/use-cases/register.use-case.ts` | Pasar nuevos campos al crear usuario |
| `application/services/auth.service.ts` | Pasar nuevos campos desde el DTO |
| `infrastructure/mappers/user.mapper.ts` | Mapear nuevos campos |

---

## 1. Migración

**Ruta:** `src/infrastructure/database/migrations/1747433600000-UpdateUsersColumns.ts`

> Nota: El timestamp `1747433600000` corresponde a la fecha actual. Puedes ajustarlo.
> Esta migración renombra columnas existentes y agrega los campos nuevos.

```typescript
import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class UpdateUsersColumns1747433600000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {

        // 1. Renombrar 'phone' → 'phone_number'
        await queryRunner.renameColumn('users', 'phone', 'phone_number');

        // 2. Renombrar 'password' → 'password_hash'
        await queryRunner.renameColumn('users', 'password', 'password_hash');

        // 3. Agregar sync_id
        await queryRunner.addColumn('users', new TableColumn({
            name: 'sync_id',
            type: 'uuid',
            isNullable: true,
            default: 'uuid_generate_v4()',
            isUnique: true,
        }));

        // 4. Agregar username
        await queryRunner.addColumn('users', new TableColumn({
            name: 'username',
            type: 'varchar',
            length: '50',
            isNullable: false,
            default: "'pending'",
        }));
        // Quitar el default temporal (solo sirve para datos existentes)
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "username" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "UQ_users_username" UNIQUE ("username")`);

        // 5. Agregar first_name_1
        await queryRunner.addColumn('users', new TableColumn({
            name: 'first_name_1',
            type: 'varchar',
            length: '50',
            isNullable: false,
            default: "''",
        }));
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "first_name_1" DROP DEFAULT`);

        // 6. Agregar first_name_2
        await queryRunner.addColumn('users', new TableColumn({
            name: 'first_name_2',
            type: 'varchar',
            length: '50',
            isNullable: true,
        }));

        // 7. Agregar last_name_1
        await queryRunner.addColumn('users', new TableColumn({
            name: 'last_name_1',
            type: 'varchar',
            length: '50',
            isNullable: false,
            default: "''",
        }));
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "last_name_1" DROP DEFAULT`);

        // 8. Agregar last_name_2
        await queryRunner.addColumn('users', new TableColumn({
            name: 'last_name_2',
            type: 'varchar',
            length: '50',
            isNullable: true,
        }));

        // 9. Agregar avatar_url
        await queryRunner.addColumn('users', new TableColumn({
            name: 'avatar_url',
            type: 'text',
            isNullable: true,
        }));

        // 10. Agregar birth_date
        await queryRunner.addColumn('users', new TableColumn({
            name: 'birth_date',
            type: 'date',
            isNullable: false,
            default: "'1900-01-01'",
        }));
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "birth_date" DROP DEFAULT`);

        // 11. Agregar gender
        await queryRunner.addColumn('users', new TableColumn({
            name: 'gender',
            type: 'varchar',
            length: '20',
            isNullable: false,
            default: "''",
        }));
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "gender" DROP DEFAULT`);

        // 12. Agregar country_code
        await queryRunner.addColumn('users', new TableColumn({
            name: 'country_code',
            type: 'varchar',
            length: '2',
            isNullable: true,
        }));

        // 13. Agregar timezone
        await queryRunner.addColumn('users', new TableColumn({
            name: 'timezone',
            type: 'varchar',
            length: '50',
            isNullable: false,
            default: "'UTC'",
        }));

        // 14. Agregar locale
        await queryRunner.addColumn('users', new TableColumn({
            name: 'locale',
            type: 'varchar',
            length: '10',
            isNullable: false,
            default: "'es'",
        }));

        // 15. Agregar status
        await queryRunner.addColumn('users', new TableColumn({
            name: 'status',
            type: 'varchar',
            length: '30',
            isNullable: false,
            default: "'pending_verification'",
        }));

        // 16. Agregar is_two_factor_enabled
        await queryRunner.addColumn('users', new TableColumn({
            name: 'is_two_factor_enabled',
            type: 'boolean',
            isNullable: false,
            default: false,
        }));

        // 17. Agregar two_factor_secret
        await queryRunner.addColumn('users', new TableColumn({
            name: 'two_factor_secret',
            type: 'varchar',
            length: '255',
            isNullable: true,
        }));

        // 18. Agregar last_login_at
        await queryRunner.addColumn('users', new TableColumn({
            name: 'last_login_at',
            type: 'timestamp',
            isNullable: true,
        }));

        // 19. Agregar deleted_at (soft delete)
        await queryRunner.addColumn('users', new TableColumn({
            name: 'deleted_at',
            type: 'timestamp',
            isNullable: true,
        }));

        // 20. Índices
        await queryRunner.query(`CREATE INDEX "idx_users_phone" ON "users" ("phone_number")`);
        await queryRunner.query(`CREATE INDEX "idx_users_status" ON "users" ("status")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_phone"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_status"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "UQ_users_username"`);

        const columns = [
            'deleted_at', 'last_login_at', 'two_factor_secret', 'is_two_factor_enabled',
            'status', 'locale', 'timezone', 'country_code', 'gender', 'birth_date',
            'avatar_url', 'last_name_2', 'last_name_1', 'first_name_2', 'first_name_1',
            'username', 'sync_id',
        ];
        for (const col of columns) {
            await queryRunner.dropColumn('users', col);
        }

        await queryRunner.renameColumn('users', 'password_hash', 'password');
        await queryRunner.renameColumn('users', 'phone_number', 'phone');
    }
}
```

---

## 2. UserSchema (TypeORM)

**Ruta:** `src/infrastructure/database/schemas/user.schema.ts`

```typescript
import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn, DeleteDateColumn, Generated,
} from 'typeorm';

@Entity('users')
export class UserSchema {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'sync_id', type: 'uuid', unique: true, nullable: true })
    @Generated('uuid')
    syncId: string;

    @Column({ unique: true, nullable: true })
    email: string;

    @Column({ name: 'phone_number', length: 20, nullable: true, unique: true })
    phoneNumber: string;

    @Column({ length: 50, unique: true })
    username: string;

    @Column({ name: 'password_hash' })
    passwordHash: string;

    @Column({ name: 'first_name_1', length: 50 })
    firstName1: string;

    @Column({ name: 'first_name_2', length: 50, nullable: true })
    firstName2: string;

    @Column({ name: 'last_name_1', length: 50 })
    lastName1: string;

    @Column({ name: 'last_name_2', length: 50, nullable: true })
    lastName2: string;

    @Column({ name: 'avatar_url', type: 'text', nullable: true })
    avatarUrl: string;

    @Column({ name: 'birth_date', type: 'date' })
    birthDate: Date;

    @Column({ length: 20 })
    gender: string;

    @Column({ name: 'country_code', length: 2, nullable: true })
    countryCode: string;

    @Column({ length: 50, default: 'UTC' })
    timezone: string;

    @Column({ length: 10, default: 'es' })
    locale: string;

    @Column({ length: 30, default: 'pending_verification' })
    status: string;

    @Column({ name: 'is_two_factor_enabled', default: false })
    isTwoFactorEnabled: boolean;

    @Column({ name: 'two_factor_secret', length: 255, nullable: true })
    twoFactorSecret: string;

    @Column({ name: 'last_login_at', type: 'timestamp', nullable: true })
    lastLoginAt: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @DeleteDateColumn({ name: 'deleted_at' })
    deletedAt: Date;
}
```

---

## 3. User Entity (Dominio)

**Ruta:** `src/modules/auth/domain/entities/user.entity.ts`

```typescript
export class User {
    constructor(
        public readonly id: string,
        public readonly email: string,
        public readonly passwordHash: string,
        public readonly username: string,
        public readonly firstName1: string,
        public readonly lastName1: string,
        public readonly birthDate: Date,
        public readonly gender: string,
        public readonly phoneNumber: string | null,
        public readonly firstName2: string | null,
        public readonly lastName2: string | null,
        public readonly avatarUrl: string | null,
        public readonly countryCode: string | null,
        public readonly timezone: string,
        public readonly locale: string,
        public readonly status: string,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
    ) { }

    static create(params: {
        email: string;
        passwordHash: string;
        username: string;
        firstName1: string;
        lastName1: string;
        birthDate: Date;
        gender: string;
        phoneNumber?: string;
        firstName2?: string;
        lastName2?: string;
        countryCode?: string;
        timezone?: string;
        locale?: string;
    }): User {
        return new User(
            '',
            params.email,
            params.passwordHash,
            params.username,
            params.firstName1,
            params.lastName1,
            params.birthDate,
            params.gender,
            params.phoneNumber || null,
            params.firstName2 || null,
            params.lastName2 || null,
            null,           // avatarUrl — se sube después
            params.countryCode || null,
            params.timezone || 'UTC',
            params.locale || 'es',
            'pending_verification',
            new Date(),
            new Date(),
        );
    }
}
```

---

## 4. RegisterDto

**Ruta:** `src/modules/auth/application/dtos/register.dto.ts`

```typescript
import {
    IsEmail, IsNotEmpty, IsString, MinLength,
    IsOptional, Matches, IsDateString, IsIn, Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
    // ── Credenciales ──────────────────────────────────────────

    @ApiProperty({ example: 'user@example.com' })
    @IsEmail({}, { message: 'Invalid email address' })
    @IsNotEmpty({ message: 'Email is required' })
    email!: string;

    @ApiProperty({ example: 'Password123', minLength: 8 })
    @IsString()
    @MinLength(8, { message: 'Password must be at least 8 characters long' })
    @IsNotEmpty({ message: 'Password is required' })
    password!: string;

    @ApiProperty({ example: 'john_doe_99' })
    @IsString()
    @Length(3, 50, { message: 'Username must be between 3 and 50 characters' })
    @Matches(/^[a-zA-Z0-9_]+$/, { message: 'Username can only contain letters, numbers and underscores' })
    @IsNotEmpty({ message: 'Username is required' })
    username!: string;

    // ── Nombres ───────────────────────────────────────────────

    @ApiProperty({ example: 'Juan' })
    @IsString()
    @Length(1, 50)
    @IsNotEmpty({ message: 'First name is required' })
    firstName1!: string;

    @ApiPropertyOptional({ example: 'Carlos' })
    @IsOptional()
    @IsString()
    @Length(1, 50)
    firstName2?: string;

    @ApiProperty({ example: 'Pérez' })
    @IsString()
    @Length(1, 50)
    @IsNotEmpty({ message: 'Last name is required' })
    lastName1!: string;

    @ApiPropertyOptional({ example: 'García' })
    @IsOptional()
    @IsString()
    @Length(1, 50)
    lastName2?: string;

    // ── Perfil ────────────────────────────────────────────────

    @ApiProperty({ example: '1995-08-20', description: 'Date of birth (YYYY-MM-DD)' })
    @IsDateString({}, { message: 'Birth date must be a valid date (YYYY-MM-DD)' })
    @IsNotEmpty({ message: 'Birth date is required' })
    birthDate!: string;

    @ApiProperty({ example: 'male', enum: ['male', 'female', 'other', 'prefer_not_to_say'] })
    @IsIn(['male', 'female', 'other', 'prefer_not_to_say'], { message: 'Invalid gender value' })
    @IsNotEmpty({ message: 'Gender is required' })
    gender!: string;

    // ── Opcionales ────────────────────────────────────────────

    @ApiPropertyOptional({ example: '+573001234567' })
    @IsOptional()
    @IsString()
    @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Invalid phone number format' })
    phoneNumber?: string;

    @ApiPropertyOptional({ example: 'CO', description: 'ISO 3166-1 alpha-2 country code' })
    @IsOptional()
    @IsString()
    @Length(2, 2, { message: 'Country code must be exactly 2 characters' })
    countryCode?: string;

    @ApiPropertyOptional({ example: 'America/Bogota' })
    @IsOptional()
    @IsString()
    timezone?: string;

    @ApiPropertyOptional({ example: 'es', description: 'Locale code (e.g. es, en)' })
    @IsOptional()
    @IsString()
    @Length(2, 10)
    locale?: string;
}
```

---

## 5. RegisterUseCase

**Ruta:** `src/modules/auth/application/use-cases/register.use-case.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import { User } from '../../domain/entities/user.entity';
import { Email } from '../../domain/value-objects/email.vo';
import { Password } from '../../domain/value-objects/password.vo';
import { BcryptService } from '../../infrastructure/services/bcrypt.service';
import { UserAlreadyExistsException } from '../../domain/exceptions/user-already-exists.exception';

export interface RegisterParams {
    email: string;
    password: string;
    username: string;
    firstName1: string;
    lastName1: string;
    birthDate: string;
    gender: string;
    phoneNumber?: string;
    firstName2?: string;
    lastName2?: string;
    countryCode?: string;
    timezone?: string;
    locale?: string;
}

@Injectable()
export class RegisterUseCase {
    constructor(
        @Inject(USER_REPOSITORY)
        private readonly userRepository: IUserRepository,
        private readonly bcryptService: BcryptService,
    ) { }

    async execute(params: RegisterParams): Promise<User> {
        const emailVO = new Email(params.email);
        new Password(params.password); // Valida las reglas de dominio

        const existingUser = await this.userRepository.findByEmail(emailVO.getValue());
        if (existingUser) {
            throw new UserAlreadyExistsException(emailVO.getValue());
        }

        const hashedPassword = await this.bcryptService.hash(params.password);

        const user = User.create({
            email: emailVO.getValue(),
            passwordHash: hashedPassword,
            username: params.username,
            firstName1: params.firstName1,
            lastName1: params.lastName1,
            birthDate: new Date(params.birthDate),
            gender: params.gender,
            phoneNumber: params.phoneNumber,
            firstName2: params.firstName2,
            lastName2: params.lastName2,
            countryCode: params.countryCode,
            timezone: params.timezone,
            locale: params.locale,
        });

        return await this.userRepository.save(user);
    }
}
```

---

## 6. AuthService

**Ruta:** `src/modules/auth/application/services/auth.service.ts`

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
    ) { }

    async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
        const user = await this.registerUseCase.execute({
            email: registerDto.email,
            password: registerDto.password,
            username: registerDto.username,
            firstName1: registerDto.firstName1,
            lastName1: registerDto.lastName1,
            birthDate: registerDto.birthDate,
            gender: registerDto.gender,
            phoneNumber: registerDto.phoneNumber,
            firstName2: registerDto.firstName2,
            lastName2: registerDto.lastName2,
            countryCode: registerDto.countryCode,
            timezone: registerDto.timezone,
            locale: registerDto.locale,
        });

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
}
```

---

## 7. UserMapper

**Ruta:** `src/modules/auth/infrastructure/mappers/user.mapper.ts`

```typescript
import { UserSchema } from '../../../../infrastructure/database/schemas/user.schema';
import { User } from '../../domain/entities/user.entity';

export class UserMapper {
    static toDomain(schema: UserSchema): User {
        return new User(
            schema.id,
            schema.email,
            schema.passwordHash,
            schema.username,
            schema.firstName1,
            schema.lastName1,
            schema.birthDate,
            schema.gender,
            schema.phoneNumber || null,
            schema.firstName2 || null,
            schema.lastName2 || null,
            schema.avatarUrl || null,
            schema.countryCode || null,
            schema.timezone,
            schema.locale,
            schema.status,
            schema.createdAt,
            schema.updatedAt,
        );
    }

    static toSchema(user: User): UserSchema {
        const schema = new UserSchema();

        if (user.id) schema.id = user.id;

        schema.email        = user.email;
        schema.passwordHash = user.passwordHash;
        schema.username     = user.username;
        schema.firstName1   = user.firstName1;
        schema.lastName1    = user.lastName1;
        schema.birthDate    = user.birthDate;
        schema.gender       = user.gender;

        if (user.phoneNumber) schema.phoneNumber = user.phoneNumber;
        if (user.firstName2)  schema.firstName2  = user.firstName2;
        if (user.lastName2)   schema.lastName2   = user.lastName2;
        if (user.avatarUrl)   schema.avatarUrl   = user.avatarUrl;
        if (user.countryCode) schema.countryCode = user.countryCode;

        schema.timezone = user.timezone;
        schema.locale   = user.locale;
        schema.status   = user.status;

        return schema;
    }

    static toDomainList(schemas: UserSchema[]): User[] {
        return schemas.map(schema => this.toDomain(schema));
    }
}
```

---

## Ejemplo de request al endpoint

**POST** `http://localhost:3000/auth/register`

```json
{
  "email": "juan@example.com",
  "password": "Password123",
  "username": "juan_perez_95",
  "firstName1": "Juan",
  "firstName2": "Carlos",
  "lastName1": "Pérez",
  "lastName2": "García",
  "birthDate": "1995-08-20",
  "gender": "male",
  "phoneNumber": "+573001234567",
  "countryCode": "CO",
  "timezone": "America/Bogota",
  "locale": "es"
}
```

**Respuesta exitosa (201):**
```json
{
  "id": "uuid",
  "email": "juan@example.com",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "createdAt": "2026-05-16T12:00:00.000Z"
}
```

---

## Orden de aplicación recomendado

1. Crear el archivo de migración
2. Ejecutar `pnpm run migration:run`
3. Actualizar `user.schema.ts`
4. Actualizar `user.entity.ts`
5. Actualizar `register.dto.ts`
6. Actualizar `register.use-case.ts`
7. Actualizar `auth.service.ts`
8. Actualizar `user.mapper.ts`
9. Reiniciar servidor y probar en Postman
