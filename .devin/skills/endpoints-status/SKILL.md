---
name: endpoints-status
description: Estado actual de los endpoints del backend 3TIEMPO (implementado vs. propuesto) y su propuesta asociada
allowed-tools:
  - read
  - grep
  - glob
triggers:
  - user
  - model
---

Estado actual de los endpoints del backend **3TIEMPO** (Fase 1). Consultar esto antes de asumir si un endpoint ya existe o solo está propuesto.

| Método | Ruta | Estado | Propuesta |
|--------|------|--------|-----------|
| POST | `/auth/register` | ✅ Implementado | — |
| POST | `/auth/login` | 📋 Propuesto | `propuestas/07-login.md` |
| POST | `/auth/verify-email` | 📋 Propuesto | `propuestas/08-verify-email.md` |
| POST | `/auth/resend-verification` | 📋 Propuesto | `propuestas/09-resend-verification.md` |
| GET | `/auth/me` | 📋 Propuesto | `propuestas/10-get-me.md` |
| POST | `/users/profile` | 📋 Propuesto | `propuestas/11-onboarding-profile.md` |

Además de estos, revisar el directorio `propuestas/` del repo para ver todas las propuestas existentes (numeradas secuencialmente) — esta tabla cubre solo el set inicial de Fase 1; propuestas posteriores (cambio de contraseña, recuperación de contraseña, sesiones multi-dispositivo, RBAC, auditoría, performance/escalado, etc.) están numeradas después y no se listan acá para no duplicar mantenimiento. Ante la duda de si algo ya está implementado, verificar directamente en `src/modules/` en vez de confiar solo en esta tabla si ha pasado tiempo desde la última actualización.
