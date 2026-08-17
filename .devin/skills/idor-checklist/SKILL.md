---
name: idor-checklist
description: Checklist de seguridad IDOR (Insecure Direct Object Reference) a aplicar en endpoints que reciben un identificador de recurso
allowed-tools:
  - read
  - grep
  - glob
triggers:
  - user
  - model
---

Checklist de seguridad **IDOR (Insecure Direct Object Reference)** del backend 3TIEMPO.

Al diseñar o revisar **cualquier propuesta** (ver skill `propuesta-workflow`) de un endpoint nuevo (o que modifique uno existente) que reciba un identificador de recurso — en la URL (`:id`), en query params, o en el body — evaluar explícitamente el riesgo de IDOR:

- **¿El identificador viene del token (JWT) o del request del cliente?** Si el recurso pertenece al usuario autenticado, el `userId`/`ownerId` debe extraerse siempre de `@CurrentUser()`, nunca de `:id`, query o body. Si el body incluye un campo así, debe quedar rechazado por el DTO (`whitelist` + `forbidNonWhitelisted`), nunca simplemente ignorado en silencio.
- **¿El endpoint referencia un recurso de OTRO usuario/entidad?** (ej. `GET /orders/:id`, `PATCH /teams/:id`). El use-case debe verificar que el recurso encontrado pertenezca al usuario autenticado (o que su rol lo autorice) antes de devolver/modificar datos — no basta con `findById`, hace falta `findById` + validación de ownership, y lanzar una excepción de dominio (403/404) si no coincide.
- **Documentar en la propuesta** qué capa hace esa verificación (normalmente el use-case, ver patrón de `GetMeUseCase`/`CreateProfileUseCase` validando existencia y pertenencia antes de actuar).
- **Agregar el caso de ataque al `.e2e-spec.ts` correspondiente**: un usuario A intentando leer/modificar/crear un recurso usando el `id` de un usuario B, autenticado con el token de A.
