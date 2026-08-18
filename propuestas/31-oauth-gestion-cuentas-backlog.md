# Backlog: Gestión de cuentas OAuth (vincular / desvincular / listar proveedores)

**Estado:** 🕒 Diferido — diseño de alto nivel documentado, sin especificación técnica completa. No es una propuesta lista para aplicar; ver "Por qué está en pausa" antes de desarrollarla en detalle.

Agrupa 3 ideas de endpoints que surgieron al planear la Fase 2 (OAuth social), evaluadas y puestas en pausa a propósito — se documentan acá para no perder el análisis, no para implementarlas ahora.

---

## Las 3 ideas

| Endpoint | Auth | Qué haría |
|----------|------|-----------|
| `POST /auth/oauth/:provider/link` | JWT | Vincula un proveedor adicional (ej. Google) a una cuenta ya autenticada, cuando el email del proveedor **no coincide** con el de la cuenta (si coincide y está verificado, `30-login-google-mobile.md` ya lo vincula automáticamente) |
| `DELETE /auth/oauth/:provider` | JWT | Desvincula un proveedor ya conectado — bloqueado si el usuario se quedaría sin ningún método de login (ni password local ni otro proveedor) |
| `GET /auth/oauth/providers` | JWT | Lista los proveedores vinculados a la cuenta del usuario actual |

## Por qué está en pausa

1. **El caso principal de "vincular" ya está resuelto.** `GoogleLoginUseCase` (de `30-login-google-mobile.md`) vincula automáticamente cuando el email del proveedor coincide con una cuenta existente y Google lo confirma verificado. `POST /auth/oauth/:provider/link` solo aportaría valor en el caso más angosto de emails que no coinciden — de nicho, no bloqueante para el MVP.
2. **`GET /auth/oauth/providers` no tiene consumidor sin un frontend de "cuentas conectadas".** Construirlo ahora sería repetir el mismo patrón que ya vimos con `permissions`/`security_audit_logs`: una pieza de dominio sin ningún caso de uso real que la ejercite todavía.
3. **`DELETE /auth/oauth/:provider` tiene un argumento de seguridad legítimo** (revocar un proveedor comprometido), pero sin la 32 (vincular manualmente) todavía no hay mucho que desvincular en la práctica — la única vía de vinculación hoy es automática por email verificado.

## Qué la saca de este estado de "diferido"

Cualquiera de estas señales amerita retomarla y escribir la propuesta completa (con el mismo nivel de detalle que 29/30/31):

- Se agrega un frontend con una pantalla de configuración de cuenta / "cuentas conectadas".
- Se implementa un segundo proveedor (Apple, Facebook, etc.) y empieza a pasar de verdad el caso de "el email del proveedor no coincide con mi cuenta".
- Un usuario pide explícitamente poder desconectar un proveedor (ej. tras comprometerse su cuenta de Google).

## Notas de diseño a tener en cuenta cuando se retome

- `DELETE /auth/oauth/:provider` necesita validar, antes de desvincular: `user.password !== null` (tiene login local) **OR** `socialIdentityRepository.findByUserId(userId).length > 1` (tiene otro proveedor vinculado) — si ninguna de las dos se cumple, rechazar con una excepción de dominio nueva (ej. `LastLoginMethodException`, 409).
- El identificador `:provider` en la URL de `DELETE` no es un IDOR en el sentido clásico (no es el id de *otro* usuario), pero igual el use-case debe operar siempre sobre `userId` del `@CurrentUser()`, nunca aceptar un `userId` del cliente — ver skill `idor-checklist` al escribir la propuesta real.
- Reutilizar `IUserSocialIdentityRepository.findByUserId`/`softDelete`, ya creados en `29-oauth-social-infraestructura-base.md` — no debería hacer falta tocar el repositorio.
