# Propuesta: Documentar por qué `attempts`/`maxAttempts` existen pero no se usan en la verificación por token

**Estado:** ⭕ Pendiente — no aplicada aún.

Documenta (sin agregar lógica nueva) por qué las columnas `attempts`/`max_attempts` de la tabla `verifications` — ya mapeadas en `VerificationRecord` — no se usan hoy como límite de intentos en `VerifyEmailUseCase`, para que no se lea como un descuido al auditar el código.

---

## Problema

`verifications.attempts`/`verifications.max_attempts` (con `CHECK (attempts <= max_attempts)`) están diseñadas para limitar cuántas veces se puede intentar adivinar un código — un mecanismo que tiene sentido para un **OTP corto** (ej. `483920`, 6 dígitos), donde el flujo típico es: buscar el registro activo por `(userId, type)`, comparar el código recibido contra el guardado, y sumar un intento fallido en cada comparación que no coincide.

El proyecto, sin embargo, genera el token así (`RegisterUseCase`, y también en `propuestas/19-recuperacion-contrasena.md`):

```typescript
const token = crypto.randomBytes(32).toString('hex'); // 256 bits de entropía
```

Y lo busca por **coincidencia exacta** (`findByToken(token, type)`). Con 2^256 combinaciones posibles, no existe un "casi le achunto" — o el string completo coincide, o no coincide nada. Contar intentos fallidos sobre un lookup de coincidencia exacta no reduce ningún riesgo real de fuerza bruta en este esquema: el espacio de búsqueda ya lo hace inviable por sí solo, con o sin límite de intentos.

Sin este contexto documentado, alguien auditando el código (o una propuesta futura) puede asumir que es un hueco de seguridad sin cerrar, cuando en realidad es un campo del schema pensado para un mecanismo distinto (OTP corto) que el proyecto no usa en su implementación actual de verificación por link.

## Solución

Agregar comentarios explicando el porqué en los tres lugares donde esto puede generar confusión, sin cambiar ningún comportamiento:

1. La interfaz `VerificationRecord`, donde viven los campos.
2. `VerifyEmailUseCase`, que es el único lugar hoy que consume un `VerificationRecord` y no valida `attempts`.
3. `propuestas/19-recuperacion-contrasena.md`, que reutiliza el mismo esquema de token largo y tendría la misma pregunta al revisarla.

Si en el futuro se agrega un flujo de verificación con código corto (ej. SMS en una fase de 2FA), ahí sí se debe implementar el conteo real de intentos, con el patrón correcto: buscar por `(userId, type)`, no por token exacto — este documento deja esa nota para cuando corresponda.

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `src/modules/auth/domain/repositories/verification.repository.interface.ts` | Actualizar — comentario sobre `attempts`/`maxAttempts` |
| `src/modules/auth/application/use-cases/verify-email.use-case.ts` | Actualizar — comentario sobre por qué no se valida `attempts` |
| `propuestas/19-recuperacion-contrasena.md` | Actualizar — nota en la sección de Notas |

---

## 1. `verification.repository.interface.ts` (archivo existente — actualización)

**Ruta:** `src/modules/auth/domain/repositories/verification.repository.interface.ts`

**Antes:**
```typescript
export interface VerificationRecord {
    id: string;
    userId: string;
    type: string;
    token: string;
    expiresAt: Date;
    usedAt: Date | null;
    attempts: number;
    maxAttempts: number;
    createdAt: Date;
}
```

**Después:**
```typescript
export interface VerificationRecord {
    id: string;
    userId: string;
    type: string;
    token: string;
    expiresAt: Date;
    usedAt: Date | null;
    // attempts/maxAttempts: reservados para un futuro flujo de código corto
    // (ej. OTP por SMS). El token actual es un string de 256 bits generado
    // con crypto.randomBytes(32) y se busca por coincidencia exacta —
    // adivinarlo no es viable con ninguna cantidad de intentos, así que
    // ningún use-case valida estos campos hoy. No es un hueco pendiente:
    // ver propuestas/28-documentar-attempts-verifications-sin-uso.md.
    attempts: number;
    maxAttempts: number;
    createdAt: Date;
}
```

## 2. `verify-email.use-case.ts` (archivo existente — actualización)

**Ruta:** `src/modules/auth/application/use-cases/verify-email.use-case.ts`

**Antes:**
```typescript
    async execute(token: string): Promise<void> {
        const record = await this.verificationRepository.findByToken(token, 'email_verification');

        if (record?.usedAt !== null) {
            throw new VerificationTokenInvalidException();
        }
```

**Después:**
```typescript
    async execute(token: string): Promise<void> {
        const record = await this.verificationRepository.findByToken(token, 'email_verification');

        // No se valida record.attempts/maxAttempts a propósito: el token es
        // un string de 256 bits buscado por coincidencia exacta, no un
        // código corto adivinable. Ver comentario en VerificationRecord.
        if (record?.usedAt !== null) {
            throw new VerificationTokenInvalidException();
        }
```

## 3. `propuestas/19-recuperacion-contrasena.md` (propuesta existente — actualización)

**Ruta:** `propuestas/19-recuperacion-contrasena.md`

Agregar en la sección de **Notas** (al final del documento):

```markdown
- `attempts`/`maxAttempts` de `VerificationRecord` no se validan en `ForgotPasswordUseCase`/`ResetPasswordUseCase` por la misma razón que en `VerifyEmailUseCase`: el token es un string de 256 bits (`crypto.randomBytes(32)`) buscado por coincidencia exacta, no un código corto adivinable — ver `propuestas/28-documentar-attempts-verifications-sin-uso.md`.
```

---

## Notas

- No se agrega ninguna migración, ni se cambia ningún comportamiento de runtime — es documentación en código (comentarios) y en una propuesta existente.
- No requiere tests nuevos (no hay lógica nueva que probar).

## Orden de aplicación

1. Actualizar `verification.repository.interface.ts`.
2. Actualizar `verify-email.use-case.ts`.
3. Actualizar `propuestas/19-recuperacion-contrasena.md`.
