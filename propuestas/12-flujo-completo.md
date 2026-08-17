# Propuesta: Flujo completo de registro — Fase 1

**Estado:** ✅ Completado — documento de referencia; todos los endpoints que describe (07-11) ya están implementados en `src/`.

Descripción del flujo de navegación completo desde el frontend, incluyendo todos los endpoints, transiciones de estado y casos de reanudación cuando el usuario abandona el proceso a medias.

---

## Endpoints implementados en Fase 1

| Método | Ruta | Auth | Propuesta |
|--------|------|------|-----------|
| `POST` | `/auth/register` | Público | ✅ Existente |
| `POST` | `/auth/login` | Público | 07 |
| `POST` | `/auth/verify-email?token=` | Público | 08 |
| `POST` | `/auth/resend-verification` | Público | 09 |
| `GET` | `/auth/me` | JWT | 10 |
| `POST` | `/users/profile` | JWT | 11 |

---

## Estados posibles de un usuario

```
users.status = 'pending_verification'   →  Registrado, email no verificado
users.status = 'active' + sin perfil    →  Email verificado, onboarding pendiente
users.status = 'active' + con perfil    →  Flujo completo
```

---

## Flujo 1 — Registro nuevo (camino feliz)

```
FRONTEND                          BACKEND                          BD
────────────────────────────────────────────────────────────────────────────
 Pantalla de registro
   ↓
 POST /auth/register              RegisterUseCase                 INSERT users
 { email, username, password,       crea usuario                  INSERT user_roles
   role }                           crea token verificación       INSERT verifications
                                  ← 201 { accessToken, ... }
   ↓
 Guardar JWT en storage
   ↓
 Pantalla "Verifica tu email"
 (isNewUser = true en respuesta)
   ↓
 Usuario abre link/copia token
   ↓
 POST /auth/verify-email          VerifyEmailUseCase              UPDATE verifications.used_at
 ?token=<hex64>                     valida token                  UPDATE users.status = 'active'
                                  ← 200 { message: "...verified" }
   ↓
 Pantalla de onboarding
   ↓
 POST /users/profile              CreateProfileUseCase            INSERT user_profiles
 Authorization: Bearer <jwt>      { firstName1, lastName1,
 { firstName1, lastName1,           birthDate, gender }
   birthDate, gender, ... }
                                  ← 201 { userId, firstName1, ... }
   ↓
 Pantalla principal (home)
```

---

## Flujo 2 — Usuario vuelve con app abierta (JWT en storage)

```
FRONTEND                          BACKEND
────────────────────────────────────────────────────────────────────────────
 App abre
   ↓
 ¿Hay JWT en storage?
   │
   NO ──────────────────────────→  Pantalla login/registro
   │
   SÍ
   ↓
 GET /auth/me                     GetMeUseCase
 Authorization: Bearer <jwt>        busca usuario + profileComplete
   ↓
 ¿Respuesta?
   │
   ├── 401 Unauthorized ─────────→  Borrar JWT, pantalla login
   │
   └── 200 OK
         ├── status = 'pending_verification'
         │       profileComplete = false
         │       ──────────────────────────→  Pantalla "Verifica tu email"
         │
         ├── status = 'active'
         │   profileComplete = false
         │       ──────────────────────────→  Pantalla onboarding
         │
         └── status = 'active'
             profileComplete = true
                     ──────────────────────→  Pantalla principal (home)
```

---

## Flujo 3 — Usuario intenta registrarse con email ya existente

```
FRONTEND                          BACKEND
────────────────────────────────────────────────────────────────────────────
 POST /auth/register
 { email: "ya@existe.com", ... }
   ↓
                                  ¿El email existe en users?
                                     ├── status = 'pending_verification'
                                     │   ← 409 { message: "User with email ... already exists" }
                                     │   Frontend: "Ya tienes cuenta pendiente.
                                     │             ¿Reenviar código?"
                                     │
                                     └── status = 'active'
                                         ← 409 { message: "User with email ... already exists" }
                                         Frontend: "Ya tienes cuenta.
                                                   ¿Iniciar sesión?"
```

---

## Flujo 4 — Usuario intenta login con email no verificado

```
FRONTEND                          BACKEND
────────────────────────────────────────────────────────────────────────────
 POST /auth/login
 { email, password }
   ↓
                                  Credenciales OK
                                  users.status = 'pending_verification'
                                  ← 403 { message: "Email address has not been verified" }
   ↓
 Frontend muestra:
 "Verifica tu email primero"
 [Botón: Reenviar código]
   ↓
 POST /auth/resend-verification
 { email }
                                  Invalida tokens anteriores
                                  Crea nuevo token
                                  [LOG STUB] token para email
                                  ← 200 { message: "If the email exists..." }
```

---

## Flujo 5 — Token de verificación expirado

```
FRONTEND                          BACKEND
────────────────────────────────────────────────────────────────────────────
 POST /auth/verify-email
 ?token=<token-expirado>
   ↓
                                  VerifyEmailUseCase
                                  token.expiresAt < NOW
                                  ← 400 { message: "Verification token has expired" }
   ↓
 Frontend muestra:
 "El código expiró"
 [Botón: Solicitar nuevo código]
   ↓
 POST /auth/resend-verification
 { email }
                                  ← 200 { message: "If the email exists..." }
```

---

## Transiciones de estado en BD

```
                   POST /auth/register
                          ↓
               users.status = 'pending_verification'
                          │
                          │  POST /auth/verify-email
                          ↓
                users.status = 'active'
                + user_profiles inexistente
                          │
                          │  POST /users/profile
                          ↓
                users.status = 'active'
                + user_profiles existente
                  (profileComplete = true)
```

---

## Seguridad aplicada en este flujo

| Riesgo | Mitigación |
|--------|-----------|
| Enumeración de emails en registro | 409 genérico sin distinguir motivo en login |
| Enumeración de emails en resend | Respuesta siempre `200` aunque email no exista |
| Fuerza bruta en login | `@Throttle` 5 intentos / 60s por IP |
| Fuerza bruta en registro | `@Throttle` 3 intentos / 60s |
| Fuerza bruta en reenvío | `@Throttle` 3 intentos / 300s |
| Token de verificación predecible | `crypto.randomBytes(32)` = 256 bits de entropía |
| Token en texto plano comprometido | Caduca en 24h; se invalida al verificar |
| JWT robado después de logout | Pendiente: blacklist de tokens (Fase 2) |

---

## Orden de aplicación de propuestas

```
07-login.md                  →  Habilita POST /auth/login
08-verify-email.md           →  Habilita POST /auth/verify-email
                                Actualiza RegisterUseCase para generar token
09-resend-verification.md    →  Habilita POST /auth/resend-verification
10-get-me.md                 →  Habilita GET /auth/me
11-onboarding-profile.md     →  Habilita POST /users/profile (nuevo módulo users)
```

> Cada propuesta incluye el estado acumulativo de `auth.service.ts`, `auth.controller.ts` y `auth.module.ts`.  
> Aplicar en el orden indicado para evitar referencias a clases aún no creadas.
