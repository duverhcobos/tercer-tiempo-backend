---
name: db-schema-fase1
description: Tablas de base de datos ya existentes (Fase 1) del backend 3TIEMPO y sus propósitos
allowed-tools:
  - read
  - grep
  - glob
triggers:
  - user
  - model
---

Referencia de las tablas de base de datos **ya existentes** en el proyecto 3TIEMPO Backend (Fase 1 — migración ya ejecutada, ver `src/infrastructure/database/migrations/1706140000000-CreateUsersTable.ts`).

| Tabla | Propósito |
|-------|-----------|
| `users` | Auth: id (UUID), email, username, password_hash, status, last_login_at |
| `user_profiles` | Perfil: first_name_1, last_name_1, birth_date, gender, country_id |
| `user_sessions` | Refresh tokens (hash SHA-256) |
| `verifications` | Tokens OTP/reset (email_verification, password_reset) |
| `roles` | Catálogo: SUPERADMIN, ORGANIZER, REFEREE, PLAYER, SPECTATOR |
| `user_roles` | Join table users ↔ roles |
| `permissions` | Catálogo de permisos |
| `role_permissions` | Join table roles ↔ permissions |
| `countries` | Catálogo ISO 3166-1 alpha-2 |
| `security_audit_logs` | Eventos de auditoría (inmutable) |

**Notas importantes:**

- `users.id` es **UUID**, no BIGSERIAL. Cualquier FK nueva hacia `users` debe ser de tipo UUID, coherente con esto.
- Los roles se almacenan en `user_roles` (join table), **no** como columna directa en `users`. Para obtener el rol de un usuario hace falta un JOIN, no una simple columna.
- Si en algún momento se trae al proyecto un schema SQL externo (por ejemplo, uno diseñado para un monolito más amplio) que use `users.id BIGSERIAL`, hay que reconciliar esa diferencia antes de aplicarlo — no asumir que son compatibles.
