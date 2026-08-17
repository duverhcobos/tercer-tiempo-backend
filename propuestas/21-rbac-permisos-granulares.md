# Propuesta: RBAC con permisos granulares (`permissions` + `role_permissions`)

**Estado:** ⭕ Pendiente — tablas `permissions`/`role_permissions` sembradas pero sin guard/decorador en `src/` que las consulte.

Habilita el uso real de `permissions` y `role_permissions` (creadas y sembradas desde la migración de Fase 1 — `manage_users`, `create_tournament`, `report_match` — pero sin ningún código que las consulte hoy). El proyecto hoy solo verifica el **rol crudo** del usuario (`user.role`); esta propuesta agrega verificación de **permisos** granulares por rol, vía:

- Un claim `role` en el JWT (hoy el payload solo lleva `sub`/`email`).
- Un decorador `@RequirePermissions(...codes)` y un `PermissionsGuard` global — mismo patrón que `@Public()` + `JwtAuthGuard` — listos para proteger cualquier endpoint administrativo futuro (hoy no existe ninguno en el codebase; se documenta el ejemplo de uso en "Notas").
- Un endpoint `GET /auth/permissions` que devuelve los permisos del usuario autenticado (uso real e inmediato de la nueva pieza de dominio, útil para que el frontend decida qué UI mostrar).

> **Dependencia:** Ninguna. No depende de `19-recuperacion-contrasena.md` ni de `20-gestion-sesiones-multidispositivo.md`; los fragmentos "Antes" de `auth.controller.ts`, `auth.service.ts` y `auth.module.ts` asumen el estado **actual** del código (sin esas dos propuestas aplicadas).

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/modules/auth/presentation/controllers/auth.controller.ts` | Actualizar |
| `src/modules/auth/application/services/auth.service.ts` | Actualizar |
| `src/modules/auth/application/use-cases/get-permissions.use-case.ts` | Crear |
| `src/modules/auth/domain/repositories/permissions.repository.interface.ts` | Crear |
| `src/modules/auth/presentation/decorators/require-permissions.decorator.ts` | Crear |
| `src/modules/auth/presentation/guards/permissions.guard.ts` | Crear |
| `src/modules/auth/infrastructure/strategies/jwt.strategy.ts` | Actualizar |
| `src/modules/auth/infrastructure/services/jwt.service.ts` | Actualizar |
| `src/modules/auth/infrastructure/repositories/permissions.repository.ts` | Crear |
| `src/modules/auth/auth.module.ts` | Actualizar |
| `src/app.module.ts` | Actualizar |

---

## 1. auth.controller.ts (archivo existente — actualización)

**Ruta:** `src/modules/auth/presentation/controllers/auth.controller.ts`

**Antes:**
```typescript
    // Requiere JWT — JwtAuthGuard global activo (no @Public)
    @Get('me')
    @HttpCode(HttpStatus.OK)
    // @ApiGetMe()
    async getMe(@CurrentUser() user: { userId: string }): Promise<MeResponseDto> {
        return this.authService.getMe(user.userId);
    }
```

**Después:**
```typescript
    // Requiere JWT — JwtAuthGuard global activo (no @Public)
    @Get('me')
    @HttpCode(HttpStatus.OK)
    // @ApiGetMe()
    async getMe(@CurrentUser() user: { userId: string }): Promise<MeResponseDto> {
        return this.authService.getMe(user.userId);
    }

    // Requiere JWT — JwtAuthGuard global activo (no @Public).
    // Sin @RequirePermissions(): cualquier usuario autenticado puede consultar SUS PROPIOS permisos.
    @Get('permissions')
    @HttpCode(HttpStatus.OK)
    // @ApiGetPermissions()
    async getPermissions(@CurrentUser() user: { role: string | null }): Promise<{ permissions: string[] }> {
        return this.authService.getPermissions(user.role);
    }
```

---

## 2. auth.service.ts (archivo existente — actualización)

**Ruta:** `src/modules/auth/application/services/auth.service.ts`

**Antes:**
```typescript
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
    async getMe(userId: string): Promise<MeResponseDto> {
        return this.getMeUseCase.execute(userId);
    }
}
```

**Después:**
```typescript
import { GetMeUseCase } from '../use-cases/get-me.use-case';
import { GetPermissionsUseCase } from '../use-cases/get-permissions.use-case';
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
        private readonly getPermissionsUseCase: GetPermissionsUseCase,
        private readonly jwtService: JwtService,
    ) { }

    async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
        const user = await this.registerUseCase.execute({
            email: registerDto.email,
            username: registerDto.username,
            password: registerDto.password,
            role: registerDto.role,
        });
        // El rol viaja en el JWT (denormalizado al momento de emitirlo) para que
        // PermissionsGuard no tenga que resolver user -> rol en cada request.
        const accessToken = this.jwtService.generateToken({
            sub: user.id,
            email: user.email,
            role: user.role,
        });
        return AuthMapper.toAuthResponse(user, accessToken, true);
    }

    async login(loginDto: LoginDto): Promise<AuthResponseDto> {
        const user = await this.loginUseCase.execute({
            email: loginDto.email,
            password: loginDto.password,
        });
        const accessToken = this.jwtService.generateToken({
            sub: user.id,
            email: user.email,
            role: user.role,
        });
        return AuthMapper.toAuthResponse(user, accessToken, false);
    }
```

```typescript
    async getMe(userId: string): Promise<MeResponseDto> {
        return this.getMeUseCase.execute(userId);
    }

    async getPermissions(role: string | null): Promise<{ permissions: string[] }> {
        const permissions = await this.getPermissionsUseCase.execute(role);
        return { permissions };
    }
}
```

---

## 3. get-permissions.use-case.ts (archivo nuevo)

**Ruta:** `src/modules/auth/application/use-cases/get-permissions.use-case.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';

import {
    IPermissionsRepository,
    PERMISSIONS_REPOSITORY,
} from '../../domain/repositories/permissions.repository.interface';

@Injectable()
export class GetPermissionsUseCase {
    constructor(
        @Inject(PERMISSIONS_REPOSITORY)
        private readonly permissionsRepository: IPermissionsRepository,
    ) { }

    async execute(role: string | null): Promise<string[]> {
        // Un usuario sin rol asignado (caso de borde: falló la asignación en registro)
        // simplemente no tiene permisos, no es un error.
        if (!role) return [];

        return this.permissionsRepository.findByRole(role);
    }
}
```

---

## 4. permissions.repository.interface.ts (archivo nuevo)

**Ruta:** `src/modules/auth/domain/repositories/permissions.repository.interface.ts`

```typescript
export interface IPermissionsRepository {
    /** Nombres de los permisos otorgados a un rol (ej. 'manage_users', 'create_tournament'). */
    findByRole(role: string): Promise<string[]>;
}

export const PERMISSIONS_REPOSITORY = Symbol('IPermissionsRepository');
```

---

## 5. require-permissions.decorator.ts (archivo nuevo)

**Ruta:** `src/modules/auth/presentation/decorators/require-permissions.decorator.ts`

```typescript
import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Protege un endpoint exigiendo que el rol del usuario autenticado tenga TODOS
 * los permisos indicados (ver `role_permissions` en BD). Requiere JwtAuthGuard
 * activo (rutas @Public() no aplican, no hay usuario que verificar).
 *
 * Uso: @RequirePermissions('manage_users')
 */
export const RequirePermissions = (...permissions: string[]) =>
    SetMetadata(PERMISSIONS_KEY, permissions);
```

---

## 6. permissions.guard.ts (archivo nuevo)

**Ruta:** `src/modules/auth/presentation/guards/permissions.guard.ts`

```typescript
import { ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
    IPermissionsRepository,
    PERMISSIONS_REPOSITORY,
} from '../../domain/repositories/permissions.repository.interface';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';

@Injectable()
export class PermissionsGuard {
    constructor(
        private readonly reflector: Reflector,
        @Inject(PERMISSIONS_REPOSITORY)
        private readonly permissionsRepository: IPermissionsRepository,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        // Ruta sin @RequirePermissions(): esta verificación no aplica.
        if (!requiredPermissions || requiredPermissions.length === 0) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const user = request.user as { role?: string | null } | undefined;

        if (!user?.role) {
            throw new ForbiddenException('User has no role assigned');
        }

        const grantedPermissions = await this.permissionsRepository.findByRole(user.role);
        const hasAllPermissions = requiredPermissions.every((permission) =>
            grantedPermissions.includes(permission),
        );

        if (!hasAllPermissions) {
            throw new ForbiddenException('Insufficient permissions');
        }

        return true;
    }
}
```

---

## 7. jwt.strategy.ts (archivo existente — actualización)

**Ruta:** `src/modules/auth/infrastructure/strategies/jwt.strategy.ts`

**Antes:**
```typescript
export interface JwtPayload {
    sub: string;
    email: string;
}
```

```typescript
    async validate(payload: JwtPayload) {
        return {
            userId: payload.sub,
            email: payload.email,
        };
    }
```

**Después:**
```typescript
export interface JwtPayload {
    sub: string;
    email: string;
    role?: string | null;
}
```

```typescript
    async validate(payload: JwtPayload) {
        return {
            userId: payload.sub,
            email: payload.email,
            role: payload.role ?? null,
        };
    }
```

---

## 8. jwt.service.ts (archivo existente — actualización)

**Ruta:** `src/modules/auth/infrastructure/services/jwt.service.ts`

**Antes:**
```typescript
    generateToken(payload: { sub: string; email: string }): string {
```

**Después:**
```typescript
    generateToken(payload: { sub: string; email: string; role?: string | null }): string {
```

---

## 9. permissions.repository.ts (archivo nuevo)

**Ruta:** `src/modules/auth/infrastructure/repositories/permissions.repository.ts`

> Sin schema TypeORM nuevo: igual que `UserRepository.findByEmailWithRole`, se usa `DataSource.query` con SQL crudo para el join `roles` → `role_permissions` → `permissions`, en vez de crear 3 entities nuevas solo para una consulta de lectura.

```typescript
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { IPermissionsRepository } from '../../domain/repositories/permissions.repository.interface';

@Injectable()
export class PermissionsRepository implements IPermissionsRepository {
    constructor(private readonly dataSource: DataSource) { }

    async findByRole(role: string): Promise<string[]> {
        const rows = await this.dataSource.query(
            `SELECT p.name
             FROM "roles" r
             JOIN "role_permissions" rp ON rp.role_id = r.id
             JOIN "permissions" p       ON p.id = rp.permission_id
             WHERE r.name = $1`,
            [role],
        );

        return rows.map((row: { name: string }) => row.name);
    }
}
```

---

## 10. auth.module.ts (archivo existente — actualización)

**Ruta:** `src/modules/auth/auth.module.ts`

**Antes:**
```typescript
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
import { AuthService } from './application/services/auth.service';
import { GetMeUseCase } from './application/use-cases/get-me.use-case';
import { GetPermissionsUseCase } from './application/use-cases/get-permissions.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
// Application
import { RegisterUseCase } from './application/use-cases/register.use-case';
import { ResendVerificationUseCase } from './application/use-cases/resend-verification.use-case';
import { VerifyEmailUseCase } from './application/use-cases/verify-email.use-case';
// Domain
import { PERMISSIONS_REPOSITORY } from './domain/repositories/permissions.repository.interface';
import { USER_REPOSITORY } from './domain/repositories/user.repository.interface';
import { VERIFICATION_REPOSITORY } from './domain/repositories/verification.repository.interface';
import { PermissionsRepository } from './infrastructure/repositories/permissions.repository';
import { UserRepository } from './infrastructure/repositories/user.repository';
import { VerificationRepository } from './infrastructure/repositories/verification.repository';
import { BcryptService } from './infrastructure/services/bcrypt.service';
import { EMAIL_NOTIFICATION_SERVICE, EmailNotificationService } from './infrastructure/services/email-notification.service';
import { JwtService } from './infrastructure/services/jwt.service';
import { JwtStrategy } from './infrastructure/strategies/jwt.strategy';
// Presentation
import { AuthController } from './presentation/controllers/auth.controller';
import { JwtAuthGuard } from './presentation/guards/jwt-auth.guard';
import { PermissionsGuard } from './presentation/guards/permissions.guard';

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
        { provide: PERMISSIONS_REPOSITORY, useClass: PermissionsRepository },
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
        GetPermissionsUseCase,
        AuthService,

        // Presentation
        JwtAuthGuard,
        PermissionsGuard,
    ],
    exports: [JwtAuthGuard, JwtService, PermissionsGuard],
})
export class AuthModule { }
```

---

## 11. app.module.ts (archivo existente — actualización)

**Ruta:** `src/app.module.ts`

**Antes:**
```typescript
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/presentation/guards/jwt-auth.guard';
import { AppController } from './app.controller';
```

```typescript
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard, // protege todas las rutas; usa @Public() para excluir
    },
  ],
})
export class AppModule { }
```

**Después:**
```typescript
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/presentation/guards/jwt-auth.guard';
import { PermissionsGuard } from './modules/auth/presentation/guards/permissions.guard';
import { AppController } from './app.controller';
```

```typescript
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard, // protege todas las rutas; usa @Public() para excluir
    },
    {
      // Se ejecuta DESPUÉS de JwtAuthGuard (el orden del array importa): ya existe
      // request.user con el rol cuando este guard corre. No-op en rutas sin
      // @RequirePermissions().
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule { }
```

---

## Notas

- **`role` en el JWT:** se denormaliza al emitir el token (en `register`/`login`) para que `PermissionsGuard` no tenga que resolver `user → rol` en cada request. Efecto secundario esperado: si a un usuario le cambian el rol, el cambio no se refleja hasta que vuelva a autenticarse (mismo tradeoff ya aceptado por el proyecto para el propio `status`/claims del JWT — ver limitación de revocación documentada en `propuestas/12-flujo-completo.md`).
- **Sin endpoint administrativo protegido todavía:** el codebase no tiene hoy ningún endpoint de gestión (banear usuario, crear torneo, etc.) al que aplicarle `@RequirePermissions()`. Se entrega el decorador + guard como infraestructura de autorización lista para usarse, siguiendo el mismo patrón que el proyecto ya usa con `permissions`/`role_permissions`: la migración de Fase 1 sembró estos catálogos **antes** de que existiera código que los consumiera (igual que pasó con `user_sessions` hasta `20-gestion-sesiones-multidispositivo.md`). Ejemplo de uso futuro:
  ```typescript
  @RequirePermissions('manage_users')
  @Patch('users/:id/ban')
  async banUser(@Param('id') id: string): Promise<...> { ... }
  ```
- **`GET /auth/permissions` no usa `@RequirePermissions()`:** es autoservicio — cualquier usuario autenticado puede ver sus propios permisos (útil para que el frontend decida qué mostrar). El `PermissionsGuard` no interviene en absoluto en esta ruta porque no tiene metadata de permisos requeridos.
- **Guard vs. excepción de dominio:** `PermissionsGuard` lanza `ForbiddenException` (excepción HTTP nativa de Nest), no una `DomainException` — mismo patrón que `JwtAuthGuard.handleRequest` ya usa `UnauthorizedException` nativa. Los guards son una preocupación de la capa de presentación/infraestructura transversal, no lógica de negocio de un use-case.
- **Sin mapper:** `GetPermissionsUseCase` retorna `string[]` (primitivo), no una entidad de dominio; `auth.service.ts` envuelve el resultado en `{ permissions }` directamente, mismo patrón que `verifyEmail`/`resendVerification`.
- **Sin migración ni schema TypeORM nuevo:** `roles`, `permissions`, `role_permissions` y sus seeds ya existen desde `1706140000000-CreateUsersTable.ts`. `PermissionsRepository` usa `DataSource.query` crudo, igual que `UserRepository.findByEmailWithRole`/`findById`, evitando crear 3 entities nuevas solo para un JOIN de lectura.
- **Orden de los `APP_GUARD` en `app.module.ts` es crítico:** `PermissionsGuard` debe ir **después** de `JwtAuthGuard` en el array `providers`, porque depende de que `request.user` (con `role`) ya haya sido poblado por la estrategia JWT. Las rutas `@Public()` nunca llegan a necesitar `@RequirePermissions()`, así que no hay conflicto de orden ahí.
- **Sin `.spec.ts` en esta propuesta:** siguiendo el flujo del proyecto, las pruebas unitarias de `GetPermissionsUseCase`, `PermissionsRepository` y `PermissionsGuard` (mockeando `Reflector` + request, ver checklist de `AGENTS.md` para guards con ramas propias) se agregan en una aplicación/propuesta separada.

## Orden de aplicación

1. Actualizar `auth.controller.ts`
2. Actualizar `auth.service.ts`
3. Crear `get-permissions.use-case.ts`
4. Crear `permissions.repository.interface.ts`
5. Crear `require-permissions.decorator.ts`
6. Crear `permissions.guard.ts`
7. Actualizar `jwt.strategy.ts`
8. Actualizar `jwt.service.ts`
9. Crear `permissions.repository.ts`
10. Actualizar `auth.module.ts`
11. Actualizar `app.module.ts`
