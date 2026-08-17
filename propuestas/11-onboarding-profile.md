# Propuesta: POST /users/profile (Onboarding)

**Estado:** ✅ Completado — superada en el orden de aplicación por `11.2-onboarding-profile.md`/`11.3-onboarding-profile.md` (misma funcionalidad, orden y capas refinados), pero el resultado final ya está en `src/`.

Creación del módulo `users` con el endpoint de onboarding. El usuario autenticado, que ya tiene email verificado, completa su perfil con nombre, apellidos, fecha de nacimiento y género.

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/infrastructure/database/schemas/user-profile.schema.ts` | Crear |
| `src/modules/users/domain/enums/gender-type.enum.ts` | Crear |
| `src/modules/users/domain/entities/user-profile.entity.ts` | Crear |
| `src/modules/users/domain/exceptions/profile-already-exists.exception.ts` | Crear |
| `src/modules/users/domain/repositories/user-profile.repository.interface.ts` | Crear |
| `src/modules/users/application/dtos/create-profile.dto.ts` | Crear |
| `src/modules/users/application/dtos/profile-response.dto.ts` | Crear |
| `src/modules/users/application/use-cases/create-profile.use-case.ts` | Crear |
| `src/modules/users/application/services/users.service.ts` | Crear |
| `src/modules/users/infrastructure/mappers/user-profile.mapper.ts` | Crear |
| `src/modules/users/infrastructure/repositories/user-profile.repository.ts` | Crear |
| `src/modules/users/presentation/swagger/users-controller.swagger.ts` | Crear |
| `src/modules/users/presentation/controllers/users.controller.ts` | Crear |
| `src/modules/users/users.module.ts` | Crear |
| `src/app.module.ts` | Actualizar |

> **Dependencia:** Requiere propuestas 07–10 aplicadas.  
> La tabla `user_profiles` ya existe en la migración de Fase 1.

---

## 1. user-profile.schema.ts

**Ruta:** `src/infrastructure/database/schemas/user-profile.schema.ts`

```typescript
import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryColumn,
    UpdateDateColumn,
} from 'typeorm';

@Entity('user_profiles')
export class UserProfileSchema {
    @PrimaryColumn({ type: 'uuid', name: 'user_id' })
    userId!: string;

    @Column({ name: 'first_name_1', length: 50 })
    firstName1!: string;

    @Column({ name: 'first_name_2', length: 50, nullable: true })
    firstName2!: string | null;

    @Column({ name: 'last_name_1', length: 50 })
    lastName1!: string;

    @Column({ name: 'last_name_2', length: 50, nullable: true })
    lastName2!: string | null;

    @Column({ name: 'avatar_file_id', length: 255, nullable: true })
    avatarFileId!: string | null;

    @Column({ name: 'birth_date', type: 'date' })
    birthDate!: string; // TypeORM retorna DATE como string en PostgreSQL

    @Column({ type: 'varchar', length: 10 })
    gender!: string;

    @Column({ name: 'country_id', length: 2, nullable: true })
    countryId!: string | null;

    @Column({ length: 50, default: 'UTC' })
    timezone!: string;

    @Column({ length: 10, default: 'es' })
    locale!: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
    deletedAt!: Date | null;
}
```

---

## 2. gender-type.enum.ts

**Ruta:** `src/modules/users/domain/enums/gender-type.enum.ts`

```typescript
export enum GenderType {
    M     = 'M',
    F     = 'F',
    OTHER = 'other',
}
```

---

## 3. user-profile.entity.ts

**Ruta:** `src/modules/users/domain/entities/user-profile.entity.ts`

```typescript
import { GenderType } from '../enums/gender-type.enum';

export class UserProfile {
    constructor(
        public readonly userId: string,
        public readonly firstName1: string,
        public readonly firstName2: string | null,
        public readonly lastName1: string,
        public readonly lastName2: string | null,
        public readonly birthDate: string,
        public readonly gender: GenderType,
        public readonly countryId: string | null,
        public readonly timezone: string,
        public readonly locale: string,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
    ) {}
}
```

---

## 4. profile-already-exists.exception.ts

**Ruta:** `src/modules/users/domain/exceptions/profile-already-exists.exception.ts`

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class ProfileAlreadyExistsException extends DomainException {
    constructor() {
        super('User profile already exists', 409, 'PROFILE_ALREADY_EXISTS');
    }
}
```

---

## 5. user-profile.repository.interface.ts

**Ruta:** `src/modules/users/domain/repositories/user-profile.repository.interface.ts`

```typescript
import { UserProfile } from '../entities/user-profile.entity';

export interface IUserProfileRepository {
    findByUserId(userId: string): Promise<UserProfile | null>;
    create(profile: UserProfile): Promise<UserProfile>;
}

export const USER_PROFILE_REPOSITORY = Symbol('IUserProfileRepository');
```

---

## 6. create-profile.dto.ts

**Ruta:** `src/modules/users/application/dtos/create-profile.dto.ts`

```typescript
import { Transform } from 'class-transformer';
import {
    IsDateString,
    IsEnum,
    IsIn,
    IsISO31661Alpha2,
    IsNotEmpty,
    IsOptional,
    IsString,
    Length,
    Matches,
} from 'class-validator';

import { GenderType } from '../../domain/enums/gender-type.enum';

export class CreateProfileDto {
    @IsString()
    @IsNotEmpty()
    @Length(1, 50)
    @Transform(({ value }: { value: string }) => value?.trim())
    firstName1!: string;

    @IsOptional()
    @IsString()
    @Length(1, 50)
    @Transform(({ value }: { value: string }) => value?.trim())
    firstName2?: string;

    @IsString()
    @IsNotEmpty()
    @Length(1, 50)
    @Transform(({ value }: { value: string }) => value?.trim())
    lastName1!: string;

    @IsOptional()
    @IsString()
    @Length(1, 50)
    @Transform(({ value }: { value: string }) => value?.trim())
    lastName2?: string;

    @IsDateString({}, { message: 'birthDate must be a valid date (YYYY-MM-DD)' })
    birthDate!: string;

    @IsEnum(GenderType, { message: 'gender must be M, F or other' })
    gender!: GenderType;

    @IsOptional()
    @IsISO31661Alpha2({ message: 'countryId must be a valid ISO 3166-1 alpha-2 code' })
    countryId?: string;

    @IsOptional()
    @IsString()
    @Matches(/^(UTC|GMT|[A-Za-z]+\/[A-Za-z0-9_+\-]+)$/, {
        message: 'timezone must be a valid IANA timezone',
    })
    timezone?: string;

    @IsOptional()
    @IsString()
    @IsIn(['es', 'en', 'pt', 'fr', 'de'], { message: 'locale must be es, en, pt, fr or de' })
    locale?: string;
}
```

---

## 7. profile-response.dto.ts

**Ruta:** `src/modules/users/application/dtos/profile-response.dto.ts`

```typescript
import { GenderType } from '../../domain/enums/gender-type.enum';

export class ProfileResponseDto {
    userId!: string;
    firstName1!: string;
    firstName2!: string | null;
    lastName1!: string;
    lastName2!: string | null;
    birthDate!: string;
    gender!: GenderType;
    countryId!: string | null;
    timezone!: string;
    locale!: string;
    createdAt!: Date;

    constructor(params: {
        userId: string;
        firstName1: string;
        firstName2: string | null;
        lastName1: string;
        lastName2: string | null;
        birthDate: string;
        gender: GenderType;
        countryId: string | null;
        timezone: string;
        locale: string;
        createdAt: Date;
    }) {
        Object.assign(this, params);
    }
}
```

---

## 8. create-profile.use-case.ts

**Ruta:** `src/modules/users/application/use-cases/create-profile.use-case.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';

import { UserProfile } from '../../domain/entities/user-profile.entity';
import { GenderType } from '../../domain/enums/gender-type.enum';
import {
    IUserProfileRepository,
    USER_PROFILE_REPOSITORY,
} from '../../domain/repositories/user-profile.repository.interface';
import { ProfileAlreadyExistsException } from '../../domain/exceptions/profile-already-exists.exception';
import { CreateProfileDto } from '../dtos/create-profile.dto';
import { ProfileResponseDto } from '../dtos/profile-response.dto';

@Injectable()
export class CreateProfileUseCase {
    constructor(
        @Inject(USER_PROFILE_REPOSITORY)
        private readonly profileRepository: IUserProfileRepository,
    ) {}

    async execute(userId: string, dto: CreateProfileDto): Promise<ProfileResponseDto> {
        const existing = await this.profileRepository.findByUserId(userId);
        if (existing) throw new ProfileAlreadyExistsException();

        const profile = new UserProfile(
            userId,
            dto.firstName1,
            dto.firstName2 ?? null,
            dto.lastName1,
            dto.lastName2 ?? null,
            dto.birthDate,
            dto.gender,
            dto.countryId ?? null,
            dto.timezone ?? 'UTC',
            dto.locale ?? 'es',
            new Date(),
            new Date(),
        );

        const saved = await this.profileRepository.create(profile);

        return new ProfileResponseDto({
            userId: saved.userId,
            firstName1: saved.firstName1,
            firstName2: saved.firstName2,
            lastName1: saved.lastName1,
            lastName2: saved.lastName2,
            birthDate: saved.birthDate,
            gender: saved.gender,
            countryId: saved.countryId,
            timezone: saved.timezone,
            locale: saved.locale,
            createdAt: saved.createdAt,
        });
    }
}
```

---

## 9. users.service.ts

**Ruta:** `src/modules/users/application/services/users.service.ts`

```typescript
import { Injectable } from '@nestjs/common';

import { CreateProfileDto } from '../dtos/create-profile.dto';
import { ProfileResponseDto } from '../dtos/profile-response.dto';
import { CreateProfileUseCase } from '../use-cases/create-profile.use-case';

@Injectable()
export class UsersService {
    constructor(private readonly createProfileUseCase: CreateProfileUseCase) {}

    async createProfile(userId: string, dto: CreateProfileDto): Promise<ProfileResponseDto> {
        return this.createProfileUseCase.execute(userId, dto);
    }
}
```

---

## 10. user-profile.mapper.ts

**Ruta:** `src/modules/users/infrastructure/mappers/user-profile.mapper.ts`

```typescript
import { UserProfile } from '../../domain/entities/user-profile.entity';
import { GenderType } from '../../domain/enums/gender-type.enum';
import { UserProfileSchema } from '../../../../infrastructure/database/schemas/user-profile.schema';

export class UserProfileMapper {
    static toDomain(schema: UserProfileSchema): UserProfile {
        return new UserProfile(
            schema.userId,
            schema.firstName1,
            schema.firstName2,
            schema.lastName1,
            schema.lastName2,
            schema.birthDate,
            schema.gender as GenderType,
            schema.countryId,
            schema.timezone,
            schema.locale,
            schema.createdAt,
            schema.updatedAt,
        );
    }

    static toSchema(profile: UserProfile): UserProfileSchema {
        const schema = new UserProfileSchema();
        schema.userId     = profile.userId;
        schema.firstName1 = profile.firstName1;
        schema.firstName2 = profile.firstName2;
        schema.lastName1  = profile.lastName1;
        schema.lastName2  = profile.lastName2;
        schema.birthDate  = profile.birthDate;
        schema.gender     = profile.gender;
        schema.countryId  = profile.countryId;
        schema.timezone   = profile.timezone;
        schema.locale     = profile.locale;
        return schema;
    }
}
```

---

## 11. user-profile.repository.ts

**Ruta:** `src/modules/users/infrastructure/repositories/user-profile.repository.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserProfile } from '../../domain/entities/user-profile.entity';
import { IUserProfileRepository } from '../../domain/repositories/user-profile.repository.interface';
import { UserProfileSchema } from '../../../../infrastructure/database/schemas/user-profile.schema';
import { UserProfileMapper } from '../mappers/user-profile.mapper';

@Injectable()
export class UserProfileRepository implements IUserProfileRepository {
    constructor(
        @InjectRepository(UserProfileSchema)
        private readonly repo: Repository<UserProfileSchema>,
    ) {}

    async findByUserId(userId: string): Promise<UserProfile | null> {
        const schema = await this.repo.findOne({
            where: { userId, deletedAt: undefined },
        });
        return schema ? UserProfileMapper.toDomain(schema) : null;
    }

    async create(profile: UserProfile): Promise<UserProfile> {
        const schema = UserProfileMapper.toSchema(profile);
        const saved = await this.repo.save(schema);
        return UserProfileMapper.toDomain(saved);
    }
}
```

---

## 12. users-controller.swagger.ts

**Ruta:** `src/modules/users/presentation/swagger/users-controller.swagger.ts`

```typescript
import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';

export function ApiCreateProfile() {
    return applyDecorators(
        ApiBearerAuth(),
        ApiOperation({ summary: 'Completar perfil de usuario (onboarding)' }),
        ApiBody({
            schema: {
                type: 'object',
                required: ['firstName1', 'lastName1', 'birthDate', 'gender'],
                properties: {
                    firstName1: { type: 'string', example: 'Juan' },
                    firstName2: { type: 'string', example: 'Carlos', nullable: true },
                    lastName1:  { type: 'string', example: 'García' },
                    lastName2:  { type: 'string', example: 'López', nullable: true },
                    birthDate:  { type: 'string', example: '1995-06-15', description: 'YYYY-MM-DD' },
                    gender:     { type: 'string', enum: ['M', 'F', 'other'] },
                    countryId:  { type: 'string', example: 'CO', description: 'ISO 3166-1 alpha-2', nullable: true },
                    timezone:   { type: 'string', example: 'America/Bogota', nullable: true },
                    locale:     { type: 'string', example: 'es', enum: ['es', 'en', 'pt', 'fr', 'de'], nullable: true },
                },
            },
        }),
        ApiResponse({ status: HttpStatus.CREATED, description: 'Perfil creado correctamente' }),
        ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Datos inválidos' }),
        ApiResponse({ status: HttpStatus.CONFLICT, description: 'El perfil ya existe' }),
        ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token inválido' }),
    );
}
```

---

## 13. users.controller.ts

**Ruta:** `src/modules/users/presentation/controllers/users.controller.ts`

```typescript
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CreateProfileDto } from '../../application/dtos/create-profile.dto';
import { ProfileResponseDto } from '../../application/dtos/profile-response.dto';
import { UsersService } from '../../application/services/users.service';
import { CurrentUser } from '../../../auth/presentation/decorators/current-user.decorator';
import { ApiCreateProfile } from '../swagger/users-controller.swagger';

@ApiTags('users')
@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    // Requiere JWT activo — JwtAuthGuard global (no @Public)
    @Post('profile')
    @HttpCode(HttpStatus.CREATED)
    @ApiCreateProfile()
    async createProfile(
        @CurrentUser() user: { userId: string },
        @Body() dto: CreateProfileDto,
    ): Promise<ProfileResponseDto> {
        return this.usersService.createProfile(user.userId, dto);
    }
}
```

---

## 14. users.module.ts

**Ruta:** `src/modules/users/users.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserProfileSchema } from '../../infrastructure/database/schemas/user-profile.schema';
import { UserProfileRepository } from './infrastructure/repositories/user-profile.repository';
import { CreateProfileUseCase } from './application/use-cases/create-profile.use-case';
import { UsersService } from './application/services/users.service';
import { UsersController } from './presentation/controllers/users.controller';
import { USER_PROFILE_REPOSITORY } from './domain/repositories/user-profile.repository.interface';

@Module({
    imports: [TypeOrmModule.forFeature([UserProfileSchema])],
    controllers: [UsersController],
    providers: [
        { provide: USER_PROFILE_REPOSITORY, useClass: UserProfileRepository },
        CreateProfileUseCase,
        UsersService,
    ],
})
export class UsersModule {}
```

---

## 15. app.module.ts (actualizado)

**Ruta:** `src/app.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';

import { DatabaseModule } from './infrastructure/database/database.module';
import { HealthModule } from './infrastructure/health/health.module';
import { LoggerModule } from './common/logger/logger.module';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';

import { DomainExceptionFilter } from './common/filters/domain-exception.filter';
import { JwtAuthGuard } from './modules/auth/presentation/guards/jwt-auth.guard';

import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import loggerConfig from './config/logger.config';
import throttleConfig from './config/throttle.config';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            load: [appConfig, databaseConfig, jwtConfig, loggerConfig, throttleConfig],
        }),
        ThrottlerModule.forRootAsync({
            useFactory: () => [{ ttl: 60000, limit: 20 }],
        }),
        LoggerModule,
        DatabaseModule,
        HealthModule,
        AuthModule,
        UsersModule,
    ],
    providers: [
        { provide: APP_FILTER, useClass: DomainExceptionFilter },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
    ],
})
export class AppModule {}
```

---

## Orden de aplicación

1. Crear `src/infrastructure/database/schemas/user-profile.schema.ts`
2. Crear `src/modules/users/domain/enums/gender-type.enum.ts`
3. Crear `src/modules/users/domain/entities/user-profile.entity.ts`
4. Crear `src/modules/users/domain/exceptions/profile-already-exists.exception.ts`
5. Crear `src/modules/users/domain/repositories/user-profile.repository.interface.ts`
6. Crear `src/modules/users/application/dtos/create-profile.dto.ts`
7. Crear `src/modules/users/application/dtos/profile-response.dto.ts`
8. Crear `src/modules/users/application/use-cases/create-profile.use-case.ts`
9. Crear `src/modules/users/application/services/users.service.ts`
10. Crear `src/modules/users/infrastructure/mappers/user-profile.mapper.ts`
11. Crear `src/modules/users/infrastructure/repositories/user-profile.repository.ts`
12. Crear `src/modules/users/presentation/swagger/users-controller.swagger.ts`
13. Crear `src/modules/users/presentation/controllers/users.controller.ts`
14. Crear `src/modules/users/users.module.ts`
15. Actualizar `src/app.module.ts`
