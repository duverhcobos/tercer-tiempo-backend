# Casos de Postman — `POST /users/profile` (seguridad / ataques)

Réplica manual de `test/create-profile.e2e-spec.ts` para ejecutar en Postman.
Todas las peticiones van a `{{baseUrl}}/users/profile` salvo donde se indique lo contrario.

**Progresión:** sección 0 = caso de éxito (happy path) → secciones 1-5 = intentos de explotación de vulnerabilidades, en orden creciente de sofisticación (auth → IDOR → duplicación → inyección → abuso de validación).

## Setup previo

1. **Registrar usuario base** — `POST {{baseUrl}}/auth/register`
   ```json
   {
     "email": "profile.attack@ejemplo.com",
     "username": "profile_attack",
     "password": "Password123!",
     "role": "PLAYER"
   }
   ```
   Guardar `accessToken` y `id` de la respuesta en variables de entorno (`{{accessToken}}`, `{{userId}}`).

2. **Obtener un `countryId` válido** — `SELECT code FROM countries LIMIT 1` (o usar `"CO"`).

**Payload base válido** (`{{validPayload}}`):
```json
{
  "firstName1": "Duver",
  "lastName1": "Cobos",
  "birthDate": "2000-01-01",
  "gender": "M",
  "countryId": "CO"
}
```

---

## 0. Happy path — caso de éxito

### 0.1 — Registrar usuario y crear perfil correctamente
**Request 1 — registro:**
```http
POST {{baseUrl}}/auth/register
Content-Type: application/json

{
  "email": "profile.attack@ejemplo.com",
  "username": "profile_attack",
  "password": "Password123!",
  "role": "PLAYER"
}
```
**Respuesta esperada:** `201 Created`
```json
{ "id": "<uuid>", "email": "profile.attack@ejemplo.com", "username": "profile_attack", "accessToken": "<jwt>", "...": "..." }
```
Guardar `id` → `{{userId}}` y `accessToken` → `{{accessToken}}`.

**Request 2 — creación de perfil:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "firstName1": "Duver",
  "lastName1": "Cobos",
  "birthDate": "2000-01-01",
  "gender": "M",
  "countryId": "CO"
}
```
**Respuesta esperada:** `201 Created`
```json
{
  "userId": "{{userId}}",
  "firstName1": "Duver",
  "firstName2": null,
  "lastName1": "Cobos",
  "lastName2": null,
  "birthDate": "2000-01-01",
  "gender": "M",
  "countryId": "CO",
  "timezone": "UTC",
  "locale": "es",
  "createdAt": "<ISO timestamp>"
}
```
Confirma que el flujo completo funciona antes de pasar a los casos de ataque. **A partir de aquí, cada caso de la sección 2 en adelante asume un usuario nuevo sin perfil creado** (o repetir el registro con un email/username distinto), salvo la sección 3 (duplicación), que reutiliza intencionalmente este mismo perfil ya creado.

### 0.2 — Campos opcionales completos (variante de éxito)
**Setup:** registrar un segundo usuario (email/username distintos al de 0.1) y guardar su `accessToken` como `{{accessToken2}}`.

**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken2}}
Content-Type: application/json

{
  "firstName1": "Duver",
  "firstName2": "Alejandro",
  "lastName1": "Cobos",
  "lastName2": "Pérez",
  "birthDate": "2000-01-01",
  "gender": "M",
  "countryId": "CO",
  "timezone": "America/Bogota",
  "locale": "es"
}
```
**Respuesta esperada:** `201 Created`, con todos los campos opcionales reflejados en la respuesta (`firstName2`, `lastName2`, `timezone`, `locale`).

---

## 1. Autenticación requerida

### 1.1 — Sin header Authorization
**Request:**
```http
POST {{baseUrl}}/users/profile
Content-Type: application/json

{
  "firstName1": "Duver",
  "lastName1": "Cobos",
  "birthDate": "2000-01-01",
  "gender": "M",
  "countryId": "CO"
}
```
**Respuesta esperada:** `401 Unauthorized`
```json
{ "statusCode": 401, "message": "Invalid or missing token", "timestamp": "..." }
```

### 1.2 — Authorization sin prefijo "Bearer "
**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: {{accessToken}}
Content-Type: application/json

{{validPayload}}
```
**Respuesta esperada:** `401 Unauthorized`

### 1.3 — Token con formato inválido (no es un JWT)
**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer esto-no-es-un-jwt
Content-Type: application/json

{{validPayload}}
```
**Respuesta esperada:** `401 Unauthorized`

### 1.4 — Token vacío
**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer
Content-Type: application/json

{{validPayload}}
```
**Respuesta esperada:** `401 Unauthorized`

### 1.5 — Token firmado con un secreto distinto
**Request:** generar un JWT con `{ sub: "{{userId}}", email: "profile.attack@ejemplo.com" }` firmado con un secreto que NO sea el de `JWT_SECRET` (ej. usando jwt.io con secreto `"otro-secreto"`).
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer <token-firmado-con-otro-secreto>
Content-Type: application/json

{{validPayload}}
```
**Respuesta esperada:** `401 Unauthorized`

### 1.6 — Token expirado
**Request:** generar un JWT válido con `exp` en el pasado (`iat`/`exp` ya vencidos), firmado con el `JWT_SECRET` real.
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer <token-expirado>
Content-Type: application/json

{{validPayload}}
```
**Respuesta esperada:** `401 Unauthorized`

### 1.7 — Token con "sub" de un usuario inexistente
**Request:** generar un JWT válido (firmado con `JWT_SECRET` real, no expirado) con `sub: "00000000-0000-0000-0000-000000000000"`.
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer <token-sub-inexistente>
Content-Type: application/json

{{validPayload}}
```
**Respuesta esperada:** `401 Unauthorized`
```json
{ "statusCode": 401, "message": "User no longer exists", "timestamp": "..." }
```

### 1.8 — Token con algoritmo "none"
**Request:** construir manualmente `header.payload.` (sin firma) con `header = {"alg":"none","typ":"JWT"}` en base64url.
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer <header_b64>.<payload_b64>.
Content-Type: application/json

{{validPayload}}
```
**Respuesta esperada:** `401 Unauthorized`

---

## 2. IDOR y mass assignment

### 2.1 — Campo no declarado en el DTO (`isAdmin`)
**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "firstName1": "Duver",
  "lastName1": "Cobos",
  "birthDate": "2000-01-01",
  "gender": "M",
  "countryId": "CO",
  "isAdmin": true
}
```
**Respuesta esperada:** `400 Bad Request`
```json
{ "statusCode": 400, "message": ["property isAdmin should not exist"], "timestamp": "..." }
```

### 2.2 — `userId` de otro usuario en el body (IDOR)
**Setup:** registrar un segundo usuario B (`POST /auth/register`), guardar su `id` como `{{userBId}}`. Usar el `accessToken` del usuario A.
**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessTokenA}}
Content-Type: application/json

{
  "firstName1": "Duver",
  "lastName1": "Cobos",
  "birthDate": "2000-01-01",
  "gender": "M",
  "countryId": "CO",
  "userId": "{{userBId}}"
}
```
**Respuesta esperada:** `400 Bad Request` (rechazado por whitelist, nunca se usa para suplantar al usuario B)
```json
{ "statusCode": 400, "message": ["property userId should not exist"], "timestamp": "..." }
```

### 2.3 — El perfil creado pertenece al dueño real del token
**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{{validPayload}}
```
**Respuesta esperada:** `201 Created`
```json
{ "userId": "{{userId}}", "firstName1": "Duver", "lastName1": "Cobos", "...": "..." }
```
Verificar que `body.userId === {{userId}}` (el del token, no cualquier otro).

### 2.4 — Inyección de `createdAt`/`updatedAt` vía body
**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "firstName1": "Duver",
  "lastName1": "Cobos",
  "birthDate": "2000-01-01",
  "gender": "M",
  "countryId": "CO",
  "createdAt": "1970-01-01T00:00:00.000Z"
}
```
**Respuesta esperada:** `400 Bad Request`
```json
{ "statusCode": 400, "message": ["property createdAt should not exist"], "timestamp": "..." }
```

---

## 3. Duplicación de perfil

### 3.1 — Segundo intento de creación para el mismo usuario
**Request 1:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{{validPayload}}
```
**Respuesta esperada:** `201 Created`

**Request 2 (mismo token, inmediatamente después):**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "firstName1": "Otro",
  "lastName1": "Cobos",
  "birthDate": "2000-01-01",
  "gender": "M",
  "countryId": "CO"
}
```
**Respuesta esperada:** `409 Conflict`
```json
{ "statusCode": 409, "errorCode": "PROFILE_ALREADY_EXISTS", "message": "User profile already exists", "timestamp": "..." }
```

### 3.2 — Creaciones concurrentes del mismo usuario
**Setup:** en Postman Runner (o Newman), configurar 5 iteraciones de la misma request, sin delay entre ellas (`--delay-request 0`), usando el mismo `{{accessToken}}` en todas.
**Request (x5 en paralelo):**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{{validPayload}}
```
**Respuesta esperada:** exactamente **1** de las 5 responde `201 Created`; las otras 4 responden `409 Conflict` (o error de FK/PK si hay condición de carrera, nunca más de un `201`).

---

## 4. Payloads de inyección

### 4.1 — SQLi en `firstName1`
**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "firstName1": "Robert'); DROP TABLE users;--",
  "lastName1": "Cobos",
  "birthDate": "2000-01-01",
  "gender": "M",
  "countryId": "CO"
}
```
**Respuesta esperada:** `201 Created`
```json
{ "firstName1": "Robert'); DROP TABLE users;--", "...": "..." }
```
Verificar manualmente que la tabla `users` sigue existiendo (`SELECT COUNT(*) FROM users` > 0).

### 4.2 — XSS en `lastName1`
**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "firstName1": "Duver",
  "lastName1": "<script>alert(1)</script>",
  "birthDate": "2000-01-01",
  "gender": "M",
  "countryId": "CO"
}
```
**Respuesta esperada:** `201 Created`
```json
{ "lastName1": "<script>alert(1)</script>", "...": "..." }
```
Se almacena literal, sin sanitizar en backend (la responsabilidad de escapar es del frontend al renderizar).

### 4.3 — Clave `__proto__` en el JSON (prototype pollution)
**Request:** enviar como **raw JSON** (no dejar que Postman lo reconstruya desde un objeto):
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{"firstName1":"Duver","lastName1":"Cobos","birthDate":"2000-01-01","gender":"M","countryId":"CO","__proto__":{"polluted":true}}
```
**Respuesta esperada:** `201 Created` (la clave `__proto__` no crea una propiedad propia enumerable al copiarse al DTO — ver nota en `create-profile.e2e-spec.ts`). Verificar manualmente que una petición **posterior e independiente** (ej. `GET /health`) no está afectada por contaminación global de `Object.prototype`.

### 4.4 — SQLi en `countryId`
**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "firstName1": "Duver",
  "lastName1": "Cobos",
  "birthDate": "2000-01-01",
  "gender": "M",
  "countryId": "CO'; DROP TABLE countries;--"
}
```
**Respuesta esperada:** `400 Bad Request`
```json
{ "statusCode": 400, "message": ["countryId must be a valid ISO 3166-1 alpha-2 code"], "timestamp": "..." }
```

---

## 5. Abuso de validación

### 5.1 — `firstName1` excede la longitud máxima (5000 caracteres)
**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "firstName1": "AAAA... (5000 caracteres 'A')",
  "lastName1": "Cobos",
  "birthDate": "2000-01-01",
  "gender": "M",
  "countryId": "CO"
}
```
**Respuesta esperada:** `400 Bad Request`
```json
{ "statusCode": 400, "message": ["firstName1 must be shorter than or equal to 50 characters"], "timestamp": "..." }
```

### 5.2 — `gender` con valor fuera del enum
**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "firstName1": "Duver",
  "lastName1": "Cobos",
  "birthDate": "2000-01-01",
  "gender": "admin",
  "countryId": "CO"
}
```
**Respuesta esperada:** `400 Bad Request`
```json
{ "statusCode": 400, "message": ["gender must be M, F or other"], "timestamp": "..." }
```

### 5.3 — `birthDate` con formato no fecha
**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "firstName1": "Duver",
  "lastName1": "Cobos",
  "birthDate": "no-es-una-fecha",
  "gender": "M",
  "countryId": "CO"
}
```
**Respuesta esperada:** `400 Bad Request`
```json
{ "statusCode": 400, "message": ["birthDate must be a valid date (YYYY-MM-DD)"], "timestamp": "..." }
```

### 5.4 — `firstName1` enviado como objeto (type confusion)
**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "firstName1": { "toString": "x" },
  "lastName1": "Cobos",
  "birthDate": "2000-01-01",
  "gender": "M",
  "countryId": "CO"
}
```
**Respuesta esperada:** `400 Bad Request`
```json
{ "statusCode": 400, "message": ["firstName1 must be longer than or equal to 1 and shorter than or equal to 50 characters", "firstName1 must be a string"], "timestamp": "..." }
```

### 5.5 — `firstName1` enviado como array (type confusion)
**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{
  "firstName1": ["a", "b"],
  "lastName1": "Cobos",
  "birthDate": "2000-01-01",
  "gender": "M",
  "countryId": "CO"
}
```
**Respuesta esperada:** `400 Bad Request` (mismo mensaje que 5.4)

### 5.6 — Body vacío
**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{}
```
**Respuesta esperada:** `400 Bad Request`
```json
{
  "statusCode": 400,
  "message": [
    "firstName1 must be longer than or equal to 1 characters",
    "firstName1 should not be empty",
    "firstName1 must be a string",
    "lastName1 must be longer than or equal to 1 characters",
    "lastName1 should not be empty",
    "lastName1 must be a string",
    "birthDate must be a valid date (YYYY-MM-DD)",
    "gender must be M, F or other"
  ],
  "timestamp": "..."
}
```

---

## 6. Validaciones de campos individuales

### 6.1 — Falta solo `firstName1`
**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{ "lastName1": "Cobos", "birthDate": "2000-01-01", "gender": "M", "countryId": "CO" }
```
**Respuesta esperada:** `400 Bad Request` — mensaje menciona solo `firstName1`.

### 6.2 — Falta solo `lastName1`
**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{ "firstName1": "Duver", "birthDate": "2000-01-01", "gender": "M", "countryId": "CO" }
```
**Respuesta esperada:** `400 Bad Request` — mensaje menciona solo `lastName1`.

### 6.3 — Falta solo `birthDate`
**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{ "firstName1": "Duver", "lastName1": "Cobos", "gender": "M", "countryId": "CO" }
```
**Respuesta esperada:** `400 Bad Request` — mensaje menciona `birthDate`.

### 6.4 — Falta solo `gender`
**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{ "firstName1": "Duver", "lastName1": "Cobos", "birthDate": "2000-01-01", "countryId": "CO" }
```
**Respuesta esperada:** `400 Bad Request` — mensaje menciona `gender`.

### 6.5 — `firstName1` string vacío (distinto de ausente)
**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{ "firstName1": "", "lastName1": "Cobos", "birthDate": "2000-01-01", "gender": "M", "countryId": "CO" }
```
**Respuesta esperada:** `400 Bad Request` (`@IsNotEmpty`)

### 6.6 — `firstName1` solo espacios en blanco
**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{ "firstName1": "   ", "lastName1": "Cobos", "birthDate": "2000-01-01", "gender": "M", "countryId": "CO" }
```
**Respuesta esperada:** `400 Bad Request` — el `@Transform` hace `trim()` antes de validar, por lo que `"   "` se convierte en `""` y falla `@IsNotEmpty`.

### 6.7 — Campo opcional `firstName2` enviado como string vacío
**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{ "firstName1": "Duver", "firstName2": "", "lastName1": "Cobos", "birthDate": "2000-01-01", "gender": "M", "countryId": "CO" }
```
**Respuesta esperada:** `400 Bad Request` — aunque es opcional, si se envía debe cumplir `@Length(1,50)`.

### 6.8 — `countryId` en minúsculas
**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{ "firstName1": "Duver", "lastName1": "Cobos", "birthDate": "2000-01-01", "gender": "M", "countryId": "co" }
```
**Respuesta esperada:** verificar si `@IsISO31661Alpha2` es case-sensitive (puede dar `400` o `201` dependiendo de la librería).

### 6.9 — `countryId` formato alpha-3 en vez de alpha-2
**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{ "firstName1": "Duver", "lastName1": "Cobos", "birthDate": "2000-01-01", "gender": "M", "countryId": "COL" }
```
**Respuesta esperada:** `400 Bad Request`

### 6.10 — `timezone` sin formato `Región/Ciudad`
**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{ "firstName1": "Duver", "lastName1": "Cobos", "birthDate": "2000-01-01", "gender": "M", "countryId": "CO", "timezone": "Bogota" }
```
**Respuesta esperada:** `400 Bad Request`

### 6.11 — `locale` fuera de la whitelist permitida
**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{ "firstName1": "Duver", "lastName1": "Cobos", "birthDate": "2000-01-01", "gender": "M", "countryId": "CO", "locale": "it" }
```
**Respuesta esperada:** `400 Bad Request`

### 6.12 — `gender` con case distinto (minúscula)
**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{ "firstName1": "Duver", "lastName1": "Cobos", "birthDate": "2000-01-01", "gender": "m", "countryId": "CO" }
```
**Respuesta esperada:** `400 Bad Request` (`@IsEnum` es case-sensitive)

### 6.13 — Campo opcional en `null` explícito
**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{ "firstName1": "Duver", "lastName1": "Cobos", "birthDate": "2000-01-01", "gender": "M", "countryId": "CO", "timezone": null }
```
**Respuesta esperada:** `201 Created` — `@IsOptional()` acepta `null` igual que `undefined`, se aplica el default (`timezone: "UTC"`).

### 6.14 — Espacios al inicio/fin que sí deben limpiarse
**Request:**
```http
POST {{baseUrl}}/users/profile
Authorization: Bearer {{accessToken}}
Content-Type: application/json

{ "firstName1": "  Duver  ", "lastName1": "Cobos", "birthDate": "2000-01-01", "gender": "M", "countryId": "CO" }
```
**Respuesta esperada:** `201 Created`, con `firstName1: "Duver"` (sin espacios) en la respuesta.

---

## Gaps de validación conocidos (no cubiertos por el DTO actual)

Estos casos **no están cubiertos** por `CreateProfileDto` y probablemente respondan `201` cuando lo esperable sería `400`. No forman parte de la suite automatizada — documentados aquí como hallazgo, pendientes de decisión de negocio:

- **`birthDate` sin límite de rango**: `birthDate: "2099-01-01"` (fecha futura) o `"1800-01-01"` (edad implausible) pasan la validación porque `@IsDateString()` solo valida el formato, no un rango razonable.
- **`firstName1`/`lastName1` sin restricción de caracteres**: valores como `"12345"` o `"@@@@@"` son aceptados como nombre válido (cualquier string de 1-50 caracteres).

## Notas

- Antes de cada request de la categoría 2–6, usar un usuario **sin perfil creado aún** (o limpiar `user_profiles` en BD), salvo en la categoría 3 (duplicación), donde el segundo request depende de que el primero haya tenido éxito.
- Los mensajes exactos de `message` pueden variar levemente entre versiones de `class-validator`; lo relevante es el `statusCode` y que el campo mencionado en el mensaje corresponda al campo bajo prueba.
- Fuente de referencia: `test/create-profile.e2e-spec.ts` (suite automatizada equivalente).
