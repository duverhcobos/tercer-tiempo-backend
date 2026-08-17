# Propuesta: Cambiar contraseña autenticado (PATCH /auth/change-password)

**Estado:** ⭕ Pendiente — `PATCH /auth/change-password` no existe en `src/`. Reemplaza a `04-cambiar-contrasena.md` (obsoleta).

Agrega `PATCH /auth/change-password`, protegido por JWT (sin `@Public()`): el usuario ya autenticado envía su contraseña actual + la nueva, y la use-case valida la actual contra el hash guardado antes de reemplazarla. Es el complemento de `19-recuperacion-contrasena.md` (que cubre "olvidé mi contraseña" sin sesión activa); aquí el usuario ya tiene sesión y solo quiere cambiarla voluntariamente.

## Reemplaza a `propuestas/04-cambiar-contrasena.md`

`propuestas/04-cambiar-contrasena.md` quedó obsoleta desde etapas muy tempranas del proyecto: referencia una entidad `User` con forma distinta a la actual (`phone` en vez de `username`/`status`/`role`), un método genérico `userRepository.save()` que `IUserRepository` ya no tiene, la firma vieja de `AuthMapper.toAuthResponse(user, accessToken)` (hoy recibe también `isNewUser`), e incluye documentación de Swagger — que la regla vigente del flujo de propuestas excluye explícitamente. Esta propuesta la reemplaza por completo, reescrita contra el código real del proyecto. Se recomienda eliminar `04-cambiar-contrasena.md` o marcarla como superada al aplicar esta.

> **Dependencia:** Ninguna. Es independiente de `19`, `20`, `21` y `22`. **Solapamiento a tener en cuenta:** esta propuesta agrega `updatePassword` a `IUserRepository`/`UserRepository`, exactamente lo mismo que agrega `19-recuperacion-contrasena.md`. Si ambas se aplican, la que se aplique **segunda** debe omitir ese cambio puntual (ya existirá).

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/modules/auth/application/dtos/change-password.dto.ts` | Crear |
| `src/modules/auth/presentation/controllers/auth.controller.ts` | Actualizar |
| `src/modules/auth/application/services/auth.service.ts` | Actualizar |
| `src/modules/auth/application/use-cases/change-password.use-case.ts` | Crear |
| `src/modules/auth/domain/exceptions/invalid-current-password.exception.ts` | Crear |
| `src/modules/auth/domain/repositories/user.repository.interface.ts` | Actualizar — agregar `updatePassword` *(omitir si ya existe por `19-recuperacion-contrasena.md`)* |
| `src/modules/auth/infrastructure/repositories/user.repository.ts` | Actualizar — implementar `updatePassword` *(omitir si ya existe por `19-recuperacion-contrasena.md`)* |
| `src/modules/auth/auth.module.ts` | Actualizar |

---

## 1. change-password.dto.ts (archivo nuevo)

**Ruta:** `src/modules/auth/application/dtos/change-password.dto.ts`

```typescript
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
    @IsString()
    @IsNotEmpty({ message: 'Current password is required' })
    currentPassword!: string;

    @IsString()
    @MinLength(8, { message: 'Password must be at least 8 characters long' })
    @IsNotEmpty({ message: 'Password is required' })
    newPassword!: string;
}
```

---

## 2. auth.controller.ts (archivo existente — actualización)

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
import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { AuthResponseDto } from '../../application/dtos/auth-response.dto';
import { ChangePasswordDto } from '../../application/dtos/change-password.dto';
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
    // Requiere JWT — JwtAuthGuard global activo (no @Public)
    @Get('me')
    @HttpCode(HttpStatus.OK)
    // @ApiGetMe()
    async getMe(@CurrentUser() user: { userId: string }): Promise<MeResponseDto> {
        return this.authService.getMe(user.userId);
    }

    // Requiere JWT — JwtAuthGuard global activo (no @Public)
    @Patch('change-password')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    // @ApiChangePassword()
    async changePassword(
        @Body() dto: ChangePasswordDto,
        @CurrentUser() user: { userId: string },
    ): Promise<{ message: string }> {
        return this.authService.changePassword(user.userId, dto);
    }
```

---

## 3. auth.service.ts (archivo existente — actualización)

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
```

```typescript
    async getMe(userId: string): Promise<MeResponseDto> {
        return this.getMeUseCase.execute(userId);
    }
}
```

**Después:**
```typescript
import { JwtService } from '../../infrastructure/services/jwt.service';
import { AuthResponseDto } from '../dtos/auth-response.dto';
import { ChangePasswordDto } from '../dtos/change-password.dto';
import { LoginDto } from '../dtos/login.dto';
import { MeResponseDto } from '../dtos/me-response.dto';
import { RegisterDto } from '../dtos/register.dto';
import { ResendVerificationDto } from '../dtos/resend-verification.dto';
import { VerifyEmailDto } from '../dtos/verify-email.dto';
import { AuthMapper } from '../mappers/auth.mapper';
import { ChangePasswordUseCase } from '../use-cases/change-password.use-case';
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
        private readonly changePasswordUseCase: ChangePasswordUseCase,
        private readonly jwtService: JwtService,
    ) { }
```

```typescript
    async getMe(userId: string): Promise<MeResponseDto> {
        return this.getMeUseCase.execute(userId);
    }

    async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ message: string }> {
        await this.changePasswordUseCase.execute(userId, dto.currentPassword, dto.newPassword);
        return { message: 'Password changed successfully' };
    }
}
```

---

## 4. change-password.use-case.ts (archivo nuevo)

**Ruta:** `src/modules/auth/application/use-cases/change-password.use-case.ts`

```typescript
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';

import { InvalidCurrentPasswordException } from '../../domain/exceptions/invalid-current-password.exception';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import { Password } from '../../domain/value-objects/password.vo';
import { BcryptService } from '../../infrastructure/services/bcrypt.service';

@Injectable()
export class ChangePasswordUseCase {
    constructor(
        @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
        private readonly bcryptService: BcryptService,
    ) { }

    async execute(userId: string, currentPassword: string, newPassword: string): Promise<void> {
        const user = await this.userRepository.findById(userId);

        if (!user) {
            // El JWT era válido pero el usuario fue eliminado después de emitirlo
            // (mismo caso de borde que maneja GetMeUseCase).
            throw new UnauthorizedException('User no longer exists');
        }

        const isCurrentPasswordValid = await this.bcryptService.compare(currentPassword, user.password);
        if (!isCurrentPasswordValid) {
            throw new InvalidCurrentPasswordException();
        }

        const newPasswordVO = new Password(newPassword);
        const newPasswordHash = await this.bcryptService.hash(newPasswordVO.getValue());

        await this.userRepository.updatePassword(user.id, newPasswordHash);
    }
}
```

---

## 5. invalid-current-password.exception.ts (archivo nuevo)

**Ruta:** `src/modules/auth/domain/exceptions/invalid-current-password.exception.ts`

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class InvalidCurrentPasswordException extends DomainException {
    constructor() {
        super('Current password is incorrect', 400, 'INVALID_CURRENT_PASSWORD');
    }
}
```

---

## 6. user.repository.interface.ts (archivo existente — actualización)

**Ruta:** `src/modules/auth/domain/repositories/user.repository.interface.ts`

> Omitir este paso si ya se aplicó `19-recuperacion-contrasena.md` (agrega exactamente el mismo método).

**Antes:**
```typescript
export interface IUserRepository {
    findByEmail(email: string): Promise<User | null>;
    findByUsername(username: string): Promise<User | null>;
    findById(id: string): Promise<User | null>;
    findByEmailWithRole(email: string): Promise<User | null>;
    registerWithRole(user: User, role: UserRole): Promise<User>;
    updateLastLoginAt(userId: string): Promise<void>;
    updateStatus(userId: string, status: string): Promise<void>;
    hasProfile(userId: string): Promise<boolean>;
}
```

**Después:**
```typescript
export interface IUserRepository {
    findByEmail(email: string): Promise<User | null>;
    findByUsername(username: string): Promise<User | null>;
    findById(id: string): Promise<User | null>;
    findByEmailWithRole(email: string): Promise<User | null>;
    registerWithRole(user: User, role: UserRole): Promise<User>;
    updateLastLoginAt(userId: string): Promise<void>;
    updateStatus(userId: string, status: string): Promise<void>;
    updatePassword(userId: string, passwordHash: string): Promise<void>;
    hasProfile(userId: string): Promise<boolean>;
}
```

---

## 7. user.repository.ts (archivo existente — actualización)

**Ruta:** `src/modules/auth/infrastructure/repositories/user.repository.ts`

> Omitir este paso si ya se aplicó `19-recuperacion-contrasena.md` (implementa exactamente el mismo método).

**Antes:**
```typescript
    async updateStatus(userId: string, status: string): Promise<void> {
        await this.userSchemaRepository.update(userId, { status });
    }

    async hasProfile(userId: string): Promise<boolean> {
```

**Después:**
```typescript
    async updateStatus(userId: string, status: string): Promise<void> {
        await this.userSchemaRepository.update(userId, { status });
    }

    async updatePassword(userId: string, passwordHash: string): Promise<void> {
        await this.userSchemaRepository.update(userId, { passwordHash });
    }

    async hasProfile(userId: string): Promise<boolean> {
```

---

## 8. auth.module.ts (archivo existente — actualización)

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
```

```typescript
        // Application
        RegisterUseCase,
        LoginUseCase,
        VerifyEmailUseCase,
        ResendVerificationUseCase,
        GetMeUseCase,
        AuthService,
```

**Después:**
```typescript
import { AuthService } from './application/services/auth.service';
import { ChangePasswordUseCase } from './application/use-cases/change-password.use-case';
import { GetMeUseCase } from './application/use-cases/get-me.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
// Application
import { RegisterUseCase } from './application/use-cases/register.use-case';
import { ResendVerificationUseCase } from './application/use-cases/resend-verification.use-case';
import { VerifyEmailUseCase } from './application/use-cases/verify-email.use-case';
```

```typescript
        // Application
        RegisterUseCase,
        LoginUseCase,
        VerifyEmailUseCase,
        ResendVerificationUseCase,
        GetMeUseCase,
        ChangePasswordUseCase,
        AuthService,
```

---

## Notas

- **No es lo mismo que `19-recuperacion-contrasena.md`:** esa propuesta cubre "olvidé mi contraseña" (sin sesión, vía token de un solo uso por email); esta cubre "quiero cambiar mi contraseña" (con sesión activa, verificando la contraseña actual). Ambas terminan escribiendo en la misma columna `users.password_hash` mediante el mismo método nuevo `updatePassword` — de ahí el solapamiento señalado arriba.
- **`UnauthorizedException` nativa, no `DomainException`:** para el caso borde "el JWT es válido pero el usuario ya no existe" se reutiliza exactamente el mismo patrón que `GetMeUseCase` ya usa (`UnauthorizedException('User no longer exists')`), en vez de introducir una excepción de dominio nueva para un caso que el proyecto ya resuelve así en otro use-case.
- **Sin verificación de "la nueva contraseña debe ser distinta a la actual":** se mantiene el alcance mínimo pedido (cambiar contraseña validando la actual); agregar esa regla de negocio adicional no fue solicitado y se deja fuera para no inflar el alcance.
- **Throttle:** `5 intentos / 60s`, igual que `POST /auth/login` — mismo tipo de riesgo (permite probar contraseñas repetidamente), aunque aquí ya se requiere un JWT válido, lo que reduce la superficie de ataque a alguien que ya robó una sesión.
- **Reemplaza a `propuestas/04-cambiar-contrasena.md`:** ver sección al inicio del documento. Se recomienda borrar `04-cambiar-contrasena.md` del directorio `propuestas/` (o renombrarla a `.md.superseded`) al aplicar esta, para no dejar dos propuestas contradictorias para el mismo endpoint.
- **Sin `.spec.ts` en esta propuesta:** siguiendo el flujo del proyecto, el test unitario de `change-password.use-case.ts` (happy path, `InvalidCurrentPasswordException`, `UnauthorizedException` cuando el usuario no existe) se agrega en una aplicación/propuesta separada.

## Orden de aplicación

1. Crear `change-password.dto.ts`
2. Actualizar `auth.controller.ts`
3. Actualizar `auth.service.ts`
4. Crear `change-password.use-case.ts`
5. Crear `invalid-current-password.exception.ts`
6. Actualizar `user.repository.interface.ts` (omitir si ya existe `updatePassword`)
7. Actualizar `user.repository.ts` (omitir si ya existe `updatePassword`)
8. Actualizar `auth.module.ts`
9. Eliminar o marcar como superada `propuestas/04-cambiar-contrasena.md`
