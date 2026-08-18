# Propuesta: Infraestructura base de OAuth social (`user_social_identities`)

**Estado:** ⭕ Pendiente — no aplicada aún.

Reemplaza a `propuestas/05-google-oauth.md` (obsoleta — ver nota abajo) como punto de partida de la Fase 2. Esta propuesta **no agrega ningún endpoint todavía**: deja la persistencia y el dominio listos (tabla genérica `user_social_identities`, `password_hash` opcional, repositorio) para que `30-login-google-mobile.md` (login desde app Android, único flujo del MVP) y `31-oauth-gestion-cuentas-backlog.md` (diferida) se apoyen en esto sin repetir trabajo.

**Nota de alcance (MVP Android):** el flujo web con redirect (Passport + `GoogleStrategy`) quedó descartado del plan actual — el MVP es Android-only y ese flujo no tiene consumidor. Solo existe `30-login-google-mobile.md` como propuesta de login social; si en el futuro se agrega un panel web, se retoma como propuesta nueva reutilizando `GoogleLoginUseCase` tal cual queda definido en la 30.

## Reemplaza a `propuestas/05-google-oauth.md`

`05-google-oauth.md` quedó obsoleta desde etapas muy tempranas del proyecto: usa un constructor de `User` con forma distinta a la actual (`phone`/`googleId` en vez de `username`/`status`/`role`), propone columnas `google_id`/`avatar_url` directas en `users` en vez de una tabla que soporte múltiples proveedores, usa `pnpm`, e incluye documentación de Swagger (que la regla vigente de propuestas excluye). Esta propuesta y las que la siguen (30-33) la reemplazan por completo. Se recomienda marcar `05-google-oauth.md` como superada al aplicar esta.

> **Ya existe una migración borrador mejor alineada** en `src/infrastructure/database/migrations/future/1751000000000-AddGoogleAuthToUsers.ts` — usa la tabla genérica `user_social_identities` con `user_id UUID` (coincide con el schema real) y el enum `oauth_provider`. Esta propuesta la traslada a la carpeta activa de migraciones (`database.module.ts` solo escanea `migrations/*.js`, no `migrations/future/*.js`) con cambios mínimos.

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/infrastructure/database/migrations/future/1751000000000-AddGoogleAuthToUsers.ts` | Eliminar (se traslada) |
| `src/infrastructure/database/migrations/1751000000000-AddGoogleAuthToUsers.ts` | Crear — misma migración, en la carpeta activa |
| `src/infrastructure/database/schemas/user-social-identity.schema.ts` | Crear |
| `src/infrastructure/database/schemas/user.schema.ts` | Actualizar — `passwordHash` nullable |
| `src/modules/auth/domain/entities/user.entity.ts` | Actualizar — `password: string \| null` |
| `src/modules/auth/infrastructure/mappers/user.mapper.ts` | Actualizar — manejar `passwordHash` nulo |
| `src/modules/auth/application/use-cases/login.use-case.ts` | Actualizar — rechazar login local si la cuenta no tiene password (solo OAuth) |
| `src/modules/auth/domain/enums/oauth-provider.enum.ts` | Crear |
| `src/modules/auth/domain/repositories/user-social-identity.repository.interface.ts` | Crear |
| `src/modules/auth/infrastructure/repositories/user-social-identity.repository.ts` | Crear |
| `src/modules/auth/auth.module.ts` | Actualizar — registrar schema y repositorio nuevos |

---

## 1. Migración (trasladar de `future/` a la carpeta activa)

```powershell
git mv src/infrastructure/database/migrations/future/1751000000000-AddGoogleAuthToUsers.ts src/infrastructure/database/migrations/1751000000000-AddGoogleAuthToUsers.ts
```

El contenido de la migración no cambia (ya usa `user_id UUID`, el enum `oauth_provider`, y dropea el `NOT NULL` de `password_hash`) — ver el archivo actual en `migrations/future/` para el contenido completo. Solo cambia su ubicación, para que `DatabaseModule` (que escanea `migrations/*.js`, no subcarpetas) la ejecute.

## 2. `user-social-identity.schema.ts` (archivo nuevo)

**Ruta:** `src/infrastructure/database/schemas/user-social-identity.schema.ts`

```typescript
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('user_social_identities')
export class UserSocialIdentitySchema {
    @PrimaryGeneratedColumn({ type: 'bigint' })
    id!: string;

    @Column({ name: 'user_id', type: 'uuid' })
    userId!: string;

    @Column({ type: 'varchar' })
    provider!: string;

    @Column({ name: 'provider_id', type: 'varchar', length: 255 })
    providerId!: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
    deletedAt!: Date | null;
}
```

## 3. `user.schema.ts` (archivo existente — actualización)

**Ruta:** `src/infrastructure/database/schemas/user.schema.ts`

**Antes:**
```typescript
  @Column({ name: 'password_hash', type: 'varchar' })
  passwordHash!: string;
```

**Después:**
```typescript
  // Nullable desde la Fase 2: cuentas creadas solo por OAuth no tienen
  // contraseña local (ver migración 1751000000000-AddGoogleAuthToUsers).
  @Column({ name: 'password_hash', type: 'varchar', nullable: true })
  passwordHash!: string | null;
```

## 4. `user.entity.ts` (archivo existente — actualización)

**Ruta:** `src/modules/auth/domain/entities/user.entity.ts`

**Antes:**
```typescript
interface CreateUserParams {
  email: string;
  username: string;
  password: string;
  status: string;
  role: UserRole;
}

export class User {

    constructor(
        public readonly id: string,
        public readonly email: string,
        public readonly username: string,
        public readonly password: string,        
        public readonly status: string,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly role: UserRole | null = null,
    ){}
```

**Después:**
```typescript
interface CreateUserParams {
  email: string;
  username: string;
  password: string;
  status: string;
  role: UserRole;
}

export class User {

    constructor(
        public readonly id: string,
        public readonly email: string,
        public readonly username: string,
        // null para cuentas creadas solo por OAuth (sin contraseña local).
        public readonly password: string | null,
        public readonly status: string,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
        public readonly role: UserRole | null = null,
    ){}
```

(`User.create()` no cambia: el registro por email/password sigue exigiendo `password` como `string` vía `CreateUserParams`/`Password` VO; el `password: null` solo ocurre en cuentas creadas por el flujo OAuth, que `30-login-google-mobile.md` construye vía `User.createOAuthUser(...)`, no con `User.create()`)

## 5. `user.mapper.ts` (archivo existente — actualización)

**Ruta:** `src/modules/auth/infrastructure/mappers/user.mapper.ts`

**Antes:**
```typescript
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
```

**Después:**
```typescript
  static toSchema(user: User): UserSchema {
    const schema = new UserSchema();

    if (user.id) {
      schema.id = user.id;
    }

    schema.email = user.email;
    schema.username = user.username;
    schema.passwordHash = user.password;

    return schema;
  }
```

(`toDomain` ya pasa `schema.passwordHash` tal cual al constructor de `User` — con el tipo del constructor actualizado a `string | null` no requiere cambios adicionales)

## 6. `login.use-case.ts` (archivo existente — actualización)

**Ruta:** `src/modules/auth/application/use-cases/login.use-case.ts`

**Antes:**
```typescript
        const user = await this.userRepository.findByEmailWithRole(command.email);
        user || (() => { throw new InvalidCredentialsException() })();

        const isPasswordValid = await this.bcryptService.compare(command.password, user.password);
        isPasswordValid || (() => { throw new InvalidCredentialsException() })();
```

**Después:**
```typescript
        const user = await this.userRepository.findByEmailWithRole(command.email);
        user || (() => { throw new InvalidCredentialsException() })();

        // Cuentas creadas solo por OAuth (Fase 2) no tienen password local:
        // no hay nada contra qué comparar, así que el login con contraseña
        // debe rechazarse igual que credenciales inválidas (sin filtrar que
        // el email existe pero es una cuenta OAuth-only).
        if (!user.password) {
            throw new InvalidCredentialsException();
        }

        const isPasswordValid = await this.bcryptService.compare(command.password, user.password);
        isPasswordValid || (() => { throw new InvalidCredentialsException() })();
```

## 7. `oauth-provider.enum.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/domain/enums/oauth-provider.enum.ts`

```typescript
export enum OAuthProvider {
  GOOGLE = 'google',
  APPLE = 'apple',
  FACEBOOK = 'facebook',
  GITHUB = 'github',
  MICROSOFT = 'microsoft',
}
```

## 8. `user-social-identity.repository.interface.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/domain/repositories/user-social-identity.repository.interface.ts`

```typescript
import { OAuthProvider } from '../enums/oauth-provider.enum';

export interface CreateSocialIdentityParams {
    userId: string;
    provider: OAuthProvider;
    providerId: string;
}

export interface SocialIdentityRecord {
    id: string;
    userId: string;
    provider: OAuthProvider;
    providerId: string;
    createdAt: Date;
}

export interface IUserSocialIdentityRepository {
    create(params: CreateSocialIdentityParams): Promise<void>;
    findByProvider(provider: OAuthProvider, providerId: string): Promise<SocialIdentityRecord | null>;
    findByUserId(userId: string): Promise<SocialIdentityRecord[]>;
    softDelete(userId: string, provider: OAuthProvider): Promise<void>;
}

export const USER_SOCIAL_IDENTITY_REPOSITORY = Symbol('IUserSocialIdentityRepository');
```

## 9. `user-social-identity.repository.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/infrastructure/repositories/user-social-identity.repository.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { UserSocialIdentitySchema } from '../../../../infrastructure/database/schemas/user-social-identity.schema';
import { OAuthProvider } from '../../domain/enums/oauth-provider.enum';
import {
    CreateSocialIdentityParams,
    IUserSocialIdentityRepository,
    SocialIdentityRecord,
} from '../../domain/repositories/user-social-identity.repository.interface';

@Injectable()
export class UserSocialIdentityRepository implements IUserSocialIdentityRepository {
    constructor(
        @InjectRepository(UserSocialIdentitySchema)
        private readonly repo: Repository<UserSocialIdentitySchema>,
    ) { }

    async create(params: CreateSocialIdentityParams): Promise<void> {
        const entity = this.repo.create({
            userId: params.userId,
            provider: params.provider,
            providerId: params.providerId,
        });
        await this.repo.save(entity);
    }

    async findByProvider(provider: OAuthProvider, providerId: string): Promise<SocialIdentityRecord | null> {
        const entity = await this.repo.findOne({
            where: { provider, providerId, deletedAt: IsNull() },
        });
        return entity ? this.toRecord(entity) : null;
    }

    async findByUserId(userId: string): Promise<SocialIdentityRecord[]> {
        const entities = await this.repo.find({
            where: { userId, deletedAt: IsNull() },
        });
        return entities.map((entity) => this.toRecord(entity));
    }

    async softDelete(userId: string, provider: OAuthProvider): Promise<void> {
        await this.repo
            .createQueryBuilder()
            .update(UserSocialIdentitySchema)
            .set({ deletedAt: new Date() })
            .where('user_id = :userId AND provider = :provider AND deleted_at IS NULL', { userId, provider })
            .execute();
    }

    private toRecord(entity: UserSocialIdentitySchema): SocialIdentityRecord {
        return {
            id: entity.id,
            userId: entity.userId,
            provider: entity.provider as OAuthProvider,
            providerId: entity.providerId,
            createdAt: entity.createdAt,
        };
    }
}
```

## 10. `auth.module.ts` (archivo existente — actualización)

**Ruta:** `src/modules/auth/auth.module.ts`

**Antes:**
```typescript
// Infrastructure
import { UserSchema } from '../../infrastructure/database/schemas/user.schema';
import { VerificationSchema } from '../../infrastructure/database/schemas/verification.schema';
```

**Después:**
```typescript
// Infrastructure
import { UserSchema } from '../../infrastructure/database/schemas/user.schema';
import { UserSocialIdentitySchema } from '../../infrastructure/database/schemas/user-social-identity.schema';
import { VerificationSchema } from '../../infrastructure/database/schemas/verification.schema';
```

**Antes:**
```typescript
import { USER_REPOSITORY } from './domain/repositories/user.repository.interface';
import { VERIFICATION_REPOSITORY } from './domain/repositories/verification.repository.interface';
import { UserRepository } from './infrastructure/repositories/user.repository';
import { VerificationRepository } from './infrastructure/repositories/verification.repository';
```

**Después:**
```typescript
import { USER_REPOSITORY } from './domain/repositories/user.repository.interface';
import { USER_SOCIAL_IDENTITY_REPOSITORY } from './domain/repositories/user-social-identity.repository.interface';
import { VERIFICATION_REPOSITORY } from './domain/repositories/verification.repository.interface';
import { UserRepository } from './infrastructure/repositories/user.repository';
import { UserSocialIdentityRepository } from './infrastructure/repositories/user-social-identity.repository';
import { VerificationRepository } from './infrastructure/repositories/verification.repository';
```

**Antes:**
```typescript
        TypeOrmModule.forFeature([UserSchema, VerificationSchema]),
```

**Después:**
```typescript
        TypeOrmModule.forFeature([UserSchema, VerificationSchema, UserSocialIdentitySchema]),
```

**Antes:**
```typescript
        { provide: VERIFICATION_REPOSITORY, useClass: VerificationRepository },
```

**Después:**
```typescript
        { provide: VERIFICATION_REPOSITORY, useClass: VerificationRepository },
        { provide: USER_SOCIAL_IDENTITY_REPOSITORY, useClass: UserSocialIdentityRepository },
```

---

## Notas

- Esta propuesta no agrega ninguna ruta HTTP ni caso de uso todavía — es la base de persistencia/dominio que `30-login-google-mobile.md` va a consumir.
- El `findByProvider`/`findByUserId` filtran `deletedAt IS NULL` porque "desvincular" (`31-oauth-gestion-cuentas-backlog.md`, diferida) haría soft-delete, no borrar la fila — así se preserva el historial de qué proveedores tuvo vinculados una cuenta si esa propuesta se retoma más adelante.
- `password: string | null` en `User` es un cambio de tipo que **rompe en compilación** cualquier código que asuma `password` siempre `string` sin chequeo previo — se revisó `login.use-case.ts` (el único punto que lo consume directamente) y se corrigió en el punto 6. Si al aplicar esta propuesta el compilador señala otro punto de uso no contemplado acá, agregar el mismo chequeo de null antes de usarlo.
- No se agrega ninguna dependencia nueva en esta propuesta (`google-auth-library` la agrega `30-login-google-mobile.md`). `passport-google-oauth20`/`@types/passport-google-oauth20` siguen instalados desde antes (`17-remover-codigo-muerto-google-oauth.md` los conservó) pero quedan sin usar con el MVP Android — no se retiran acá, es una limpieza aparte si se descarta el flujo web definitivamente.

## Orden de aplicación

1. Trasladar la migración de `future/` a la carpeta activa (`git mv`).
2. Crear `user-social-identity.schema.ts`.
3. Actualizar `user.schema.ts`.
4. Actualizar `user.entity.ts`.
5. Actualizar `user.mapper.ts`.
6. Actualizar `login.use-case.ts`.
7. Crear `oauth-provider.enum.ts`.
8. Crear `user-social-identity.repository.interface.ts`.
9. Crear `user-social-identity.repository.ts`.
10. Actualizar `auth.module.ts`.
11. Ejecutar `npm run build` (confirma que no queda ningún uso roto de `User.password` como `string` no-nullable) y `npm run migration:run`.
12. Ejecutar `npm run test` — actualizar `login.use-case.spec.ts` con el caso nuevo: "lanza `InvalidCredentialsException` si el usuario no tiene password (cuenta OAuth-only)".
