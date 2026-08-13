# Propuesta: Remover placeholders de Google OAuth comentados (código muerto)

## Problema

El análisis estructural del código (grafo de dependencias) detectó dos archivos cuyo contenido está **100% comentado**, sin ninguna línea de código real:

- `src/modules/auth/application/use-cases/google-login.use-case.ts`
- `src/modules/auth/infrastructure/strategies/google.strategy.ts`

Ambos son referenciados únicamente por imports también comentados en `src/modules/auth/auth.module.ts`:

```typescript
// import { GoogleStrategy } from './infrastructure/strategies/google.strategy';
// import { GoogleLoginUseCase } from './application/use-cases/google-login.use-case';
...
// GoogleStrategy,
...
// GoogleLoginUseCase,
```

Esto es código muerto en el sentido estricto: no compila, no se ejecuta, no aparece en ningún test, y no está enlazado a ningún provider activo del módulo. El plan completo de la funcionalidad ya está documentado en `propuestas/05-google-oauth.md`, que sirve como referencia completa para implementarla cuando se priorice — dejar los archivos fuente comentados no aporta nada que `05-google-oauth.md` no tenga ya, y sí genera ruido:

- Aparecen en búsquedas de código (`grep`, IDE) como si fueran funcionalidad real.
- Un desarrollador nuevo puede perder tiempo entendiendo por qué existen archivos vacíos de lógica.
- El `auth.module.ts` tiene 4 líneas comentadas dispersas entre imports y providers, dificultando la lectura del módulo real.

## Solución

Eliminar los dos archivos y las referencias comentadas en `auth.module.ts`, dejando `propuestas/05-google-oauth.md` como la única fuente de verdad para implementar esta funcionalidad en el futuro (ya contiene el diseño completo: migración, estrategia, use-case, DTOs, etc.).

No se elimina la dependencia `passport-google-oauth20` de `package.json` en esta propuesta — sigue instalada porque `propuestas/05-google-oauth.md` la seguirá necesitando cuando se implemente esa fase; solo se limpia el código fuente placeholder.

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/modules/auth/application/use-cases/google-login.use-case.ts` | Eliminar |
| `src/modules/auth/infrastructure/strategies/google.strategy.ts` | Eliminar |
| `src/modules/auth/auth.module.ts` | Actualizar — quitar los 4 comentarios de import/provider |

---

## 1. Eliminar los archivos placeholder

```powershell
git rm src/modules/auth/application/use-cases/google-login.use-case.ts
git rm src/modules/auth/infrastructure/strategies/google.strategy.ts
```

## 2. `auth.module.ts` — limpio de referencias comentadas

**Ruta:** `src/modules/auth/auth.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

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

---

## Notas

- `propuestas/05-google-oauth.md` no se modifica: sigue siendo el plan completo a aplicar cuando se priorice Google OAuth. Al implementarlo, se recrean estos archivos con el checklist "controlador → stub → completar" habitual, no se "descomentan" los eliminados.
- `AuthService.googleLogin` (referenciado dentro del `google.strategy.ts` eliminado) — verificar en `src/modules/auth/application/services/auth.service.ts` que no quede un método `googleLogin` sin uso; si existe y también está comentado o sin providers que lo invoquen, debe eliminarse en la misma tanda por consistencia.
- La dependencia `passport-google-oauth20` (y su `@types/passport-google-oauth20`) permanece en `package.json` — no se retira en esta propuesta.

## Orden de aplicación

1. Revisar `src/modules/auth/application/services/auth.service.ts` y confirmar si `googleLogin` existe comentado/sin uso; documentarlo si aparece.
2. `git rm` de los dos archivos placeholder.
3. Actualizar `auth.module.ts` quitando las 4 líneas comentadas.
4. Ejecutar `npm run build` y `npm run test` para confirmar que no queda ninguna referencia rota.
