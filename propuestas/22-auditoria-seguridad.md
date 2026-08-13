# Propuesta: Auditoría de seguridad básica (`security_audit_logs`)

Habilita el uso real de `security_audit_logs` (creada e indexada desde la migración de Fase 1 — incluye el índice GIN sobre `metadata` — pero sin ningún código que escriba en ella). Se agrega un `IAuditLogRepository` que `LoginUseCase` invoca para registrar `login_success`/`login_failed` en cada intento de inicio de sesión, distinguiendo el motivo del fallo en `metadata` (JSONB).

> **Dependencia:** Ninguna. Es independiente de `19-recuperacion-contrasena.md`, `20-gestion-sesiones-multidispositivo.md` y `21-rbac-permisos-granulares.md`.

## Por qué solo `login_success`/`login_failed` en esta propuesta

El enum `audit_event_type` (ya creado en la migración de Fase 1) tiene 7 valores: `login_success`, `login_failed`, `password_changed`, `password_reset_requested`, `account_locked`, `account_suspended`, `token_revoked`. De estos, **solo `login_success`/`login_failed` tienen un flujo de código real hoy** (`LoginUseCase`, ya implementado). Los otros 5 dependen de funcionalidad que aún no está aplicada al código:

| Evento | Requiere |
|--------|----------|
| `password_changed` | `propuestas/04-cambiar-contrasena.md` (no aplicada) |
| `password_reset_requested` | `propuestas/19-recuperacion-contrasena.md` (no aplicada) |
| `token_revoked` | `propuestas/20-gestion-sesiones-multidispositivo.md` (no aplicada) |
| `account_locked` | No existe ningún mecanismo de bloqueo por intentos fallidos en el código hoy (solo `@Throttle` por IP a nivel de ruta, que no es lo mismo que bloquear una cuenta) |
| `account_suspended` | No existe ningún endpoint administrativo que suspenda cuentas (ver `21-rbac-permisos-granulares.md`, que tampoco lo agrega) |

Esta propuesta entrega el repositorio de auditoría como pieza reutilizable (mismo patrón que `IVerificationRepository`/`ISessionRepository`) y lo conecta al único flujo que existe hoy. Cuando se apliquen las propuestas 04/19/20, o se implemente un mecanismo de bloqueo/suspensión, cada una debe agregar su propia llamada a `auditLogRepository.create(...)` — se documenta el patrón exacto en "Notas".

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/modules/auth/application/use-cases/login.use-case.ts` | Actualizar |
| `src/modules/auth/domain/repositories/audit-log.repository.interface.ts` | Crear |
| `src/infrastructure/database/schemas/security-audit-log.schema.ts` | Crear *(sin migración: la tabla ya existe desde Fase 1)* |
| `src/modules/auth/infrastructure/repositories/audit-log.repository.ts` | Crear |
| `src/modules/auth/auth.module.ts` | Actualizar |

---

## 1. login.use-case.ts (archivo existente — actualización)

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
import { Inject, Injectable } from "@nestjs/common";
import { IUserRepository, USER_REPOSITORY } from "../../domain/repositories/user.repository.interface";
import {
    AUDIT_LOG_REPOSITORY,
    IAuditLogRepository,
} from "../../domain/repositories/audit-log.repository.interface";
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
        @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLogRepository: IAuditLogRepository,
        private readonly bcryptService: BcryptService
    ) { }

    // Nota: el flujo se reescribe de `a || (() => {throw...})()` a `if` porque
    // ahora cada rama necesita `await` para registrar el intento antes de lanzar
    // la excepción — un IIFE síncrono no puede esperar una promesa.
    async execute(command: { email: string, password: string }): Promise<User> {
        const user = await this.userRepository.findByEmailWithRole(command.email);

        if (!user) {
            await this.auditLogRepository.create({
                userId: null,
                eventType: 'login_failed',
                metadata: { reason: 'user_not_found', email: command.email },
            });
            throw new InvalidCredentialsException();
        }

        const isPasswordValid = await this.bcryptService.compare(command.password, user.password);
        if (!isPasswordValid) {
            await this.auditLogRepository.create({
                userId: user.id,
                eventType: 'login_failed',
                metadata: { reason: 'invalid_password' },
            });
            throw new InvalidCredentialsException();
        }

        if (user.status === 'pending_verification') {
            await this.auditLogRepository.create({
                userId: user.id,
                eventType: 'login_failed',
                metadata: { reason: 'email_not_verified' },
            });
            throw new EmailNotVerifiedException();
        }

        if (user.status === 'suspended') {
            await this.auditLogRepository.create({
                userId: user.id,
                eventType: 'login_failed',
                metadata: { reason: 'account_suspended' },
            });
            throw new AccountSuspendedException();
        }

        if (user.status === 'banned') {
            await this.auditLogRepository.create({
                userId: user.id,
                eventType: 'login_failed',
                metadata: { reason: 'account_banned' },
            });
            throw new AccountBannedException();
        }

        await this.userRepository.updateLastLoginAt(user.id);

        await this.auditLogRepository.create({
            userId: user.id,
            eventType: 'login_success',
        });

        return user;
    }

}
```

---

## 2. audit-log.repository.interface.ts (archivo nuevo)

**Ruta:** `src/modules/auth/domain/repositories/audit-log.repository.interface.ts`

```typescript
export interface CreateAuditLogParams {
    userId: string | null;
    eventType: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
}

export interface IAuditLogRepository {
    create(params: CreateAuditLogParams): Promise<void>;
}

export const AUDIT_LOG_REPOSITORY = Symbol('IAuditLogRepository');
```

---

## 3. security-audit-log.schema.ts (archivo nuevo)

**Ruta:** `src/infrastructure/database/schemas/security-audit-log.schema.ts`

> Sin migración nueva: la tabla `security_audit_logs` ya fue creada por `1706140000000-CreateUsersTable.ts` (Fase 1), incluido el índice GIN sobre `metadata`. `event_type` es un enum de Postgres (`audit_event_type`); se mapea como `varchar` en TypeORM, igual que `VerificationSchema.type` mapea el enum `verification_type` — la validación del valor la hace la base de datos, no el ORM.

```typescript
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('security_audit_logs')
export class SecurityAuditLogSchema {
    @PrimaryGeneratedColumn({ type: 'bigint' })
    id!: string;

    @Column({ name: 'user_id', type: 'uuid', nullable: true })
    userId!: string | null;

    @Column({ name: 'event_type', type: 'varchar', length: 50 })
    eventType!: string;

    @Column({ name: 'ip_address', type: 'inet', nullable: true })
    ipAddress!: string | null;

    @Column({ name: 'user_agent', type: 'text', nullable: true })
    userAgent!: string | null;

    @Column({ type: 'jsonb', nullable: true })
    metadata!: Record<string, unknown> | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;
}
```

---

## 4. audit-log.repository.ts (archivo nuevo)

**Ruta:** `src/modules/auth/infrastructure/repositories/audit-log.repository.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SecurityAuditLogSchema } from '../../../../infrastructure/database/schemas/security-audit-log.schema';
import {
    CreateAuditLogParams,
    IAuditLogRepository,
} from '../../domain/repositories/audit-log.repository.interface';

@Injectable()
export class AuditLogRepository implements IAuditLogRepository {
    private readonly logger = new Logger(AuditLogRepository.name);

    constructor(
        @InjectRepository(SecurityAuditLogSchema)
        private readonly repo: Repository<SecurityAuditLogSchema>,
    ) { }

    async create(params: CreateAuditLogParams): Promise<void> {
        try {
            const entity = this.repo.create({
                userId: params.userId,
                eventType: params.eventType,
                ipAddress: params.ipAddress ?? null,
                userAgent: params.userAgent ?? null,
                metadata: params.metadata ?? null,
            });
            await this.repo.save(entity);
        } catch (error) {
            // La auditoría nunca debe romper el flujo que la originó (ej. un login
            // exitoso no debe fallar porque no se pudo escribir el log). Se registra
            // el error localmente y se continúa.
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to write audit log (event: ${params.eventType}): ${message}`);
        }
    }
}
```

---

## 5. auth.module.ts (archivo existente — actualización)

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
import { SecurityAuditLogSchema } from '../../infrastructure/database/schemas/security-audit-log.schema';
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
import { AUDIT_LOG_REPOSITORY } from './domain/repositories/audit-log.repository.interface';
import { USER_REPOSITORY } from './domain/repositories/user.repository.interface';
import { VERIFICATION_REPOSITORY } from './domain/repositories/verification.repository.interface';
import { AuditLogRepository } from './infrastructure/repositories/audit-log.repository';
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
        TypeOrmModule.forFeature([UserSchema, VerificationSchema, SecurityAuditLogSchema]),
    ],
    controllers: [AuthController],
    providers: [
        // Infrastructure
        {
            provide: USER_REPOSITORY,
            useClass: UserRepository,
        },
        { provide: VERIFICATION_REPOSITORY, useClass: VerificationRepository },
        { provide: AUDIT_LOG_REPOSITORY, useClass: AuditLogRepository },
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

---

## Notas

- **Nunca bloquea el flujo de negocio:** `AuditLogRepository.create()` atrapa cualquier error internamente (mismo patrón que `EmailNotificationService.sendVerificationEmail`) — un fallo al escribir el log de auditoría no debe impedir un login exitoso ni ocultar el motivo real de un login fallido.
- **`login_failed` con motivo en `metadata`:** en vez de forzar cada causa de fallo a un valor distinto del enum (que no los tiene: `audit_event_type` no distingue "credenciales inválidas" de "cuenta suspendida"), se usa un único evento `login_failed` + `metadata.reason` (`user_not_found`, `invalid_password`, `email_not_verified`, `account_suspended`, `account_banned`). Esto es intencional y aprovecha el índice GIN ya creado sobre `metadata` para poder filtrar por motivo en consultas futuras (`WHERE metadata->>'reason' = 'account_suspended'`).
- **Se registra el email en intentos con usuario inexistente:** `metadata.email` en el caso `user_not_found` es intencional y no es un problema de enumeración — este log es interno (tabla de auditoría, sin endpoint que la expone), a diferencia de las respuestas HTTP del propio login, que siguen sin distinguir "usuario no existe" de "password incorrecta".
- **Reescritura del control de flujo de `LoginUseCase`:** el patrón previo (`user || (() => { throw ... })()`) no permite `await` antes de lanzar la excepción; se normalizó a `if` estándar. El comportamiento observable no cambia (mismas excepciones, mismo orden de validación), solo se vuelve posible registrar el intento antes de cada `throw`.
- **Patrón a seguir cuando se apliquen las propuestas dependientes:**
  - Al aplicar `04-cambiar-contrasena.md`: agregar `await this.auditLogRepository.create({ userId, eventType: 'password_changed' })` al final del use-case, antes de retornar.
  - Al aplicar `19-recuperacion-contrasena.md`: agregar `eventType: 'password_reset_requested'` en `ForgotPasswordUseCase` (justo después de crear el token, con `userId: user.id`).
  - Al aplicar `20-gestion-sesiones-multidispositivo.md`: agregar `eventType: 'token_revoked'` en `LogoutUseCase`/`RevokeSessionUseCase` al revocar la sesión.
- **Sin `ipAddress`/`userAgent` en esta propuesta:** `LoginUseCase.execute` hoy solo recibe `{ email, password }` (no hay metadata de request disponible en esta capa). Los campos `ip_address`/`user_agent` de `CreateAuditLogParams` quedan definidos y nullable para cuando se aplique `20-gestion-sesiones-multidispositivo.md` (que ya extiende el `command` de `LoginUseCase` con `ipAddress`/`userAgent` para las sesiones) — en ese momento, pasar los mismos valores también al audit log es un cambio de una línea por llamada.
- **Por qué repositorio y no un interceptor:** un interceptor a nivel de controlador no tiene visibilidad de la excepción de dominio específica (`InvalidCredentialsException` vs. `AccountSuspendedException`) sin volver a inspeccionar tipos en una capa que no debería conocerlos, y no puede diferenciar "usuario no encontrado" de "password incorrecta" (ambas son la misma `InvalidCredentialsException` por diseño, para no dar pistas al atacante) sin que el use-case le pase esa información de todos modos. Registrar la auditoría directamente en `LoginUseCase` — igual patrón que `sessionRepository.create()` en otras propuestas — es más preciso y más simple de testear.
- **Sin `.spec.ts` en esta propuesta:** los tests existentes de `login.use-case.spec.ts` deben actualizarse en la misma aplicación (mock de `IAuditLogRepository`), y agregar casos para verificar que cada rama de fallo escribe el evento correcto — ver checklist de `AGENTS.md`.

## Orden de aplicación

1. Crear `audit-log.repository.interface.ts`
2. Crear `security-audit-log.schema.ts`
3. Crear `audit-log.repository.ts`
4. Actualizar `login.use-case.ts`
5. Actualizar `auth.module.ts`
6. Actualizar `login.use-case.spec.ts` (mock de `IAuditLogRepository` + casos por cada motivo de `login_failed`)
