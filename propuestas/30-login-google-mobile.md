# Propuesta: Login con Google desde app móvil (`POST /auth/google/mobile`)

**Estado:** ⭕ Pendiente — no aplicada aún.

Único endpoint de login social necesario para el MVP (Android). El SDK nativo de Google Sign-In hace el login **en el dispositivo** y le entrega a la app un `idToken` (JWT firmado por Google); el backend solo tiene que **verificarlo** contra las llaves públicas de Google y hacer *find-or-create* del usuario usando la tabla genérica `user_social_identities` de `29-oauth-social-infraestructura-base.md`.

> **Dependencia:** Requiere `29-oauth-social-infraestructura-base.md` ya aplicada (`IUserSocialIdentityRepository`, `OAuthProvider`, `User.password` nullable).

**Nota sobre el alcance:** el flujo web con redirect (`GET /auth/google` + `/auth/google/callback` vía Passport) queda **fuera de esta propuesta a propósito** — el MVP es Android-only y ese flujo no tiene ningún consumidor todavía. Si en el futuro se agrega un panel web, se retoma como una propuesta nueva que reutilice `GoogleLoginUseCase` tal cual queda acá (mismo patrón: solo cambia cómo se obtiene el perfil de Google).

---

## Decisiones de diseño

- **Vinculación automática por email solo si Google confirma que está verificado** (`email_verified` del payload del `idToken`). Si no está verificado, se rechaza — vincular automáticamente una cuenta existente por un email no confirmado abriría una vía de account takeover.
- **Username autogenerado** para cuentas nuevas: se deriva del local-part del email (`nombre@gmail.com` → `nombre`), saneado a `[a-z0-9_]`, con sufijo aleatorio si ya existe.
- **Rol por defecto: `SPECTATOR`.** El flujo de Google no pregunta rol (a diferencia de `POST /auth/register`). Es una decisión de producto provisional.
- **Cuentas de Google quedan `active` de inmediato** (no `pending_verification`): Google ya verificó el email.
- **Verificación del `idToken` con `google-auth-library`, no con Passport.** `passport-google-oauth20` (instalado desde antes, ver Notas) implementa el flujo *authorization code* (redirect), no sirve para validar un `idToken` ya emitido por el SDK nativo — para eso se usa la librería oficial de Google (`OAuth2Client.verifyIdToken`).
- **El `audience` esperado es el Client ID de la app Android**, no un Client ID "de backend" — el `idToken` que genera el SDK móvil tiene como `aud` el Client ID de la app (tipo "Android" en Google Cloud Console), configurado vía `GOOGLE_MOBILE_CLIENT_IDS`.

### Dependencia nueva

| Paquete | Versión | Motivo |
|---------|---------|--------|
| `google-auth-library` | `^11.0.2` | Librería oficial de Google para verificar `idToken` (`OAuth2Client.verifyIdToken`) |

```powershell
npm install google-auth-library@^11.0.2
```

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/modules/auth/presentation/guards/google-auth.guard.ts` | Eliminar (dead file, ver Notas) |
| `src/modules/auth/domain/entities/user.entity.ts` | Actualizar — agregar `createOAuthUser` |
| `src/modules/auth/domain/exceptions/oauth-email-not-verified.exception.ts` | Crear |
| `src/modules/auth/domain/exceptions/invalid-google-token.exception.ts` | Crear |
| `src/modules/auth/application/use-cases/google-login.use-case.ts` | Crear |
| `src/modules/auth/application/dtos/google-mobile-login.dto.ts` | Crear |
| `src/modules/auth/infrastructure/services/google-token-verifier.service.ts` | Crear |
| `src/modules/auth/application/services/auth.service.ts` | Actualizar — agregar `googleMobileLogin` |
| `src/modules/auth/presentation/controllers/auth.controller.ts` | Actualizar — agregar `POST /auth/google/mobile` |
| `src/config/env.validation.ts` | Actualizar — `GOOGLE_MOBILE_CLIENT_IDS`, resto de variables de Google pasan a opcionales |
| `src/modules/auth/auth.module.ts` | Actualizar — registrar `GoogleLoginUseCase`, `GoogleTokenVerifierService` |
| `.env.example` | Actualizar — documentar `GOOGLE_MOBILE_CLIENT_IDS` |

---

## 1. Eliminar el guard muerto del flujo web

```powershell
git rm src/modules/auth/presentation/guards/google-auth.guard.ts
```

`google-auth.guard.ts` está 100% comentado desde antes de esta propuesta (rastro del flujo web que `17-remover-codigo-muerto-google-oauth.md` no terminó de limpiar). Como el MVP es Android-only y el flujo web queda fuera de alcance, se elimina en vez de dejarlo muerto indefinidamente — si el flujo web se retoma en el futuro, se recrea con el checklist normal, no se "descomenta".

## 2. `user.entity.ts` (archivo existente — actualización)

**Ruta:** `src/modules/auth/domain/entities/user.entity.ts`

**Antes:**
```typescript
    static create({
        email,
        username,
        password,
        status,
        role
    }: CreateUserParams): User{
        return new User(
            '',
            email,
            username,
            password,
            status,
            new Date(),
            new Date(),
            role
        );
    }
}
```

**Después:**
```typescript
    static create({
        email,
        username,
        password,
        status,
        role
    }: CreateUserParams): User{
        return new User(
            '',
            email,
            username,
            password,
            status,
            new Date(),
            new Date(),
            role
        );
    }

    // Cuentas creadas por un proveedor OAuth (Google, etc.): sin password
    // local, activas de inmediato (el proveedor ya verificó el email).
    static createOAuthUser({
        email,
        username,
        role,
    }: {
        email: string;
        username: string;
        role: UserRole;
    }): User {
        return new User(
            '',
            email,
            username,
            null,
            'active',
            new Date(),
            new Date(),
            role,
        );
    }
}
```

## 3. `oauth-email-not-verified.exception.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/domain/exceptions/oauth-email-not-verified.exception.ts`

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class OAuthEmailNotVerifiedException extends DomainException {
    constructor() {
        super('Google did not confirm this email as verified', 403, 'OAUTH_EMAIL_NOT_VERIFIED');
    }
}
```

## 4. `invalid-google-token.exception.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/domain/exceptions/invalid-google-token.exception.ts`

```typescript
import { DomainException } from '../../../../common/exceptions/domain.exception';

export class InvalidGoogleTokenException extends DomainException {
    constructor() {
        super('The provided Google idToken is invalid or expired', 401, 'INVALID_GOOGLE_TOKEN');
    }
}
```

## 5. `google-login.use-case.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/application/use-cases/google-login.use-case.ts`

```typescript
import * as crypto from 'node:crypto';

import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';

import { User } from '../../domain/entities/user.entity';
import { OAuthProvider } from '../../domain/enums/oauth-provider.enum';
import { UserRole } from '../../domain/enums/user-role.enum';
import { OAuthEmailNotVerifiedException } from '../../domain/exceptions/oauth-email-not-verified.exception';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/user.repository.interface';
import {
    IUserSocialIdentityRepository,
    USER_SOCIAL_IDENTITY_REPOSITORY,
} from '../../domain/repositories/user-social-identity.repository.interface';

export interface GoogleProfileInput {
    providerId: string;
    email: string;
    emailVerified: boolean;
}

export interface GoogleLoginResult {
    user: User;
    isNewUser: boolean;
}

@Injectable()
export class GoogleLoginUseCase {
    constructor(
        @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
        @Inject(USER_SOCIAL_IDENTITY_REPOSITORY)
        private readonly socialIdentityRepository: IUserSocialIdentityRepository,
    ) { }

    async execute(profile: GoogleProfileInput): Promise<GoogleLoginResult> {
        const existingIdentity = await this.socialIdentityRepository.findByProvider(
            OAuthProvider.GOOGLE,
            profile.providerId,
        );

        if (existingIdentity) {
            const user = await this.userRepository.findById(existingIdentity.userId);
            if (!user) {
                // Identidad social sin usuario asociado: inconsistencia de datos,
                // no un caso de negocio esperado.
                throw new InternalServerErrorException('Social identity references a missing user');
            }
            return { user, isNewUser: false };
        }

        if (!profile.emailVerified) {
            throw new OAuthEmailNotVerifiedException();
        }

        const existingUserByEmail = await this.userRepository.findByEmailWithRole(profile.email);
        if (existingUserByEmail) {
            await this.socialIdentityRepository.create({
                userId: existingUserByEmail.id,
                provider: OAuthProvider.GOOGLE,
                providerId: profile.providerId,
            });
            return { user: existingUserByEmail, isNewUser: false };
        }

        const username = await this.generateUniqueUsername(profile.email);
        const newUser = User.createOAuthUser({
            email: profile.email,
            username,
            role: UserRole.SPECTATOR,
        });
        const savedUser = await this.userRepository.registerWithRole(newUser, UserRole.SPECTATOR);

        await this.socialIdentityRepository.create({
            userId: savedUser.id,
            provider: OAuthProvider.GOOGLE,
            providerId: profile.providerId,
        });

        return { user: savedUser, isNewUser: true };
    }

    private async generateUniqueUsername(email: string): Promise<string> {
        const base = (email.split('@')[0] || 'user')
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '_')
            .slice(0, 45) || 'user';

        let candidate = base;
        let attempts = 0;

        while (await this.userRepository.findByUsername(candidate)) {
            attempts++;
            if (attempts > 5) {
                throw new InternalServerErrorException('Could not generate a unique username');
            }
            candidate = `${base}_${crypto.randomBytes(2).toString('hex')}`;
        }

        return candidate;
    }
}
```

## 6. `google-mobile-login.dto.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/application/dtos/google-mobile-login.dto.ts`

```typescript
import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleMobileLoginDto {
    @IsString()
    @IsNotEmpty({ message: 'idToken is required' })
    idToken!: string;
}
```

## 7. `google-token-verifier.service.ts` (archivo nuevo)

**Ruta:** `src/modules/auth/infrastructure/services/google-token-verifier.service.ts`

```typescript
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

import { InvalidGoogleTokenException } from '../../domain/exceptions/invalid-google-token.exception';

export interface VerifiedGoogleToken {
    providerId: string;
    email: string;
    emailVerified: boolean;
}

@Injectable()
export class GoogleTokenVerifierService {
    private readonly client: OAuth2Client;
    private readonly audiences: string[];

    constructor(private readonly configService: ConfigService) {
        this.client = new OAuth2Client();

        // El idToken de la app Android tiene como audience el Client ID de la
        // app (tipo "Android" en Google Cloud Console) — no un Client ID de
        // backend/web, que este MVP ni siquiera configura.
        const mobileClientIds = (this.configService.get<string>('GOOGLE_MOBILE_CLIENT_IDS') || '')
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean);

        // GOOGLE_CLIENT_ID (web) es opcional y solo se suma si algún día existe
        // ese flujo — hoy el MVP no lo requiere.
        const webClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');

        this.audiences = [webClientId, ...mobileClientIds].filter((id): id is string => Boolean(id));

        if (this.audiences.length === 0) {
            throw new InternalServerErrorException(
                'No Google OAuth audience configured — set GOOGLE_MOBILE_CLIENT_IDS',
            );
        }
    }

    async verify(idToken: string): Promise<VerifiedGoogleToken> {
        try {
            const ticket = await this.client.verifyIdToken({
                idToken,
                audience: this.audiences,
            });

            const payload = ticket.getPayload();
            if (!payload?.sub || !payload.email) {
                throw new InvalidGoogleTokenException();
            }

            return {
                providerId: payload.sub,
                email: payload.email,
                emailVerified: Boolean(payload.email_verified),
            };
        } catch (error) {
            if (error instanceof InvalidGoogleTokenException) throw error;
            // Cualquier error de verificación de la librería (firma inválida,
            // token expirado, audience no coincide, etc.) se normaliza a la
            // misma excepción de dominio — el detalle exacto queda en el log.
            throw new InvalidGoogleTokenException();
        }
    }
}
```

## 8. `auth.service.ts` (archivo existente — actualización)

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

**Después:**
```typescript
import { GoogleTokenVerifierService } from '../../infrastructure/services/google-token-verifier.service';
import { JwtService } from '../../infrastructure/services/jwt.service';
import { AuthResponseDto } from '../dtos/auth-response.dto';
import { LoginDto } from '../dtos/login.dto';
import { MeResponseDto } from '../dtos/me-response.dto';
import { RegisterDto } from '../dtos/register.dto';
import { ResendVerificationDto } from '../dtos/resend-verification.dto';
import { VerifyEmailDto } from '../dtos/verify-email.dto';
import { AuthMapper } from '../mappers/auth.mapper';
import { GetMeUseCase } from '../use-cases/get-me.use-case';
import { GoogleLoginUseCase } from '../use-cases/google-login.use-case';
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
        private readonly googleLoginUseCase: GoogleLoginUseCase,
        private readonly googleTokenVerifier: GoogleTokenVerifierService,
        private readonly jwtService: JwtService,
    ) { }
```

**Antes:**
```typescript
    async getMe(userId: string): Promise<MeResponseDto> {
        return this.getMeUseCase.execute(userId);
    }
}
```

**Después:**
```typescript
    async getMe(userId: string): Promise<MeResponseDto> {
        return this.getMeUseCase.execute(userId);
    }

    async googleMobileLogin(idToken: string): Promise<AuthResponseDto> {
        const verified = await this.googleTokenVerifier.verify(idToken);
        const { user, isNewUser } = await this.googleLoginUseCase.execute(verified);
        const accessToken = this.jwtService.generateToken({ sub: user.id, email: user.email });
        return AuthMapper.toAuthResponse(user, accessToken, isNewUser);
    }
}
```

## 9. `auth.controller.ts` (archivo existente — actualización)

**Ruta:** `src/modules/auth/presentation/controllers/auth.controller.ts`

**Antes:**
```typescript
import { AuthResponseDto } from '../../application/dtos/auth-response.dto';
import { LoginDto } from '../../application/dtos/login.dto';
import { MeResponseDto } from '../../application/dtos/me-response.dto';
import { RegisterDto } from '../../application/dtos/register.dto';
import { ResendVerificationDto } from '../../application/dtos/resend-verification.dto';
import { VerifyEmailDto } from '../../application/dtos/verify-email.dto';
```

**Después:**
```typescript
import { AuthResponseDto } from '../../application/dtos/auth-response.dto';
import { GoogleMobileLoginDto } from '../../application/dtos/google-mobile-login.dto';
import { LoginDto } from '../../application/dtos/login.dto';
import { MeResponseDto } from '../../application/dtos/me-response.dto';
import { RegisterDto } from '../../application/dtos/register.dto';
import { ResendVerificationDto } from '../../application/dtos/resend-verification.dto';
import { VerifyEmailDto } from '../../application/dtos/verify-email.dto';
```

**Antes:**
```typescript
    // Requiere JWT — JwtAuthGuard global activo (no @Public)
    @Get('me')
    @HttpCode(HttpStatus.OK)
    // @ApiGetMe()
    async getMe(@CurrentUser() user: { userId: string }): Promise<MeResponseDto> {
        return this.authService.getMe(user.userId);
    }
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

    @Public()
    @Post('google/mobile')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 10, ttl: 60000 } })
    async googleMobileLogin(@Body() dto: GoogleMobileLoginDto): Promise<AuthResponseDto> {
        return this.authService.googleMobileLogin(dto.idToken);
    }
}
```

## 10. `env.validation.ts` (archivo existente — actualización)

**Ruta:** `src/config/env.validation.ts`

**Antes:**
```typescript
import { IsString, IsInt, Min, Max, IsNotEmpty } from 'class-validator';

export class EnvironmentVariables {
```

**Después:**
```typescript
import { IsString, IsInt, Min, Max, IsNotEmpty, IsOptional } from 'class-validator';

export class EnvironmentVariables {
```

(omitir el cambio de import si ya lo agregó `24-pool-conexiones-db.md`)

**Antes:**
```typescript
    @IsString()
    @IsNotEmpty()
    GOOGLE_CLIENT_ID!: string;

    @IsString()
    @IsNotEmpty()
    GOOGLE_CLIENT_SECRET!: string;

    @IsString()
    @IsNotEmpty()
    GOOGLE_CALLBACK_URL!: string;
}
```

**Después:**
```typescript
    // Reservadas para un futuro flujo web con redirect (no forma parte del
    // MVP Android) — opcionales para no forzar a cada desarrollador a crear
    // credenciales de un flujo que todavía no existe.
    @IsOptional()
    @IsString()
    GOOGLE_CLIENT_ID?: string;

    @IsOptional()
    @IsString()
    GOOGLE_CLIENT_SECRET?: string;

    @IsOptional()
    @IsString()
    GOOGLE_CALLBACK_URL?: string;

    // Client IDs de la app Android (y, a futuro, iOS), separados por coma.
    // Es lo único que realmente necesita el MVP para verificar idTokens.
    @IsOptional()
    @IsString()
    GOOGLE_MOBILE_CLIENT_IDS?: string;
}
```

## 11. `auth.module.ts` (archivo existente — actualización)

**Ruta:** `src/modules/auth/auth.module.ts`

**Antes:**
```typescript
import { GetMeUseCase } from './application/use-cases/get-me.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
// Application
import { RegisterUseCase } from './application/use-cases/register.use-case';
import { ResendVerificationUseCase } from './application/use-cases/resend-verification.use-case';
import { VerifyEmailUseCase } from './application/use-cases/verify-email.use-case';
```

**Después:**
```typescript
import { GetMeUseCase } from './application/use-cases/get-me.use-case';
import { GoogleLoginUseCase } from './application/use-cases/google-login.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
// Application
import { RegisterUseCase } from './application/use-cases/register.use-case';
import { ResendVerificationUseCase } from './application/use-cases/resend-verification.use-case';
import { VerifyEmailUseCase } from './application/use-cases/verify-email.use-case';
```

**Antes:**
```typescript
import { EMAIL_NOTIFICATION_SERVICE, EmailNotificationService } from './infrastructure/services/email-notification.service';
import { JwtService } from './infrastructure/services/jwt.service';
import { JwtStrategy } from './infrastructure/strategies/jwt.strategy';
// Presentation
import { AuthController } from './presentation/controllers/auth.controller';
import { JwtAuthGuard } from './presentation/guards/jwt-auth.guard';
```

**Después:**
```typescript
import { EMAIL_NOTIFICATION_SERVICE, EmailNotificationService } from './infrastructure/services/email-notification.service';
import { GoogleTokenVerifierService } from './infrastructure/services/google-token-verifier.service';
import { JwtService } from './infrastructure/services/jwt.service';
import { JwtStrategy } from './infrastructure/strategies/jwt.strategy';
// Presentation
import { AuthController } from './presentation/controllers/auth.controller';
import { JwtAuthGuard } from './presentation/guards/jwt-auth.guard';
```

**Antes:**
```typescript
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
```

**Después:**
```typescript
        BcryptService,
        JwtService,
        JwtStrategy,
        GoogleTokenVerifierService,

        // Application
        RegisterUseCase,
        LoginUseCase,
        VerifyEmailUseCase,
        ResendVerificationUseCase,
        GetMeUseCase,
        GoogleLoginUseCase,
        AuthService,

        // Presentation
        JwtAuthGuard,
    ],
```

## 12. `.env.example` (archivo existente — actualización)

**Ruta:** `.env.example`

Agregar al final del archivo:

```
# ==============================================
# Google OAuth 2.0 (login móvil — Android)
# ==============================================
# Client ID de tipo "Android" creado en Google Cloud Console.
# Separar por coma si se agregan más (ej. cuando exista build de iOS).
GOOGLE_MOBILE_CLIENT_IDS=
```

---

## Notas

- `passport-google-oauth20`/`@types/passport-google-oauth20` siguen instalados en `package.json` (se conservaron en `17-remover-codigo-muerto-google-oauth.md`) pero **quedan sin usar** con este MVP — esta propuesta no los toca ni los retira. Si el flujo web se descarta definitivamente en algún momento, es una limpieza aparte; si se retoma, ya están instalados.
- `GoogleTokenVerifierService` normaliza **cualquier** error de verificación a `InvalidGoogleTokenException` (401) — no distingue "expirado" de "firma inválida" de "audience no coincide" en la respuesta al cliente, para no dar pistas útiles a un atacante. El detalle real queda en las excepciones internas de `google-auth-library`.
- El chequeo de IDOR no aplica directamente acá: no hay `:id` ni identificador de otro usuario en el request — el `providerId` viene del `idToken` verificado, no lo envía el cliente como dato suelto.
- No se agrega rate limiting agresivo (`10/60s`) porque cada intento ya implica una verificación criptográfica contra Google (costosa en sí misma).

## Orden de aplicación

1. `npm install google-auth-library@^11.0.2`.
2. `git rm src/modules/auth/presentation/guards/google-auth.guard.ts`.
3. Actualizar `user.entity.ts` (agregar `createOAuthUser`).
4. Crear `oauth-email-not-verified.exception.ts`.
5. Crear `invalid-google-token.exception.ts`.
6. Crear `google-login.use-case.ts`.
7. Crear `google-mobile-login.dto.ts`.
8. Crear `google-token-verifier.service.ts`.
9. Actualizar `auth.service.ts`.
10. Actualizar `auth.controller.ts`.
11. Actualizar `env.validation.ts`.
12. Actualizar `auth.module.ts`.
13. Actualizar `.env.example`.
14. Ejecutar `npm run test`. Agregar `google-login.use-case.spec.ts` y `google-token-verifier.service.spec.ts` según el checklist de tests unitarios (mockear `IUserRepository`/`IUserSocialIdentityRepository`/`OAuth2Client.verifyIdToken`).
15. Probar manualmente con un `idToken` real generado por el SDK de Google Sign-In en un dispositivo/emulador Android antes de dar por cerrada la propuesta.
