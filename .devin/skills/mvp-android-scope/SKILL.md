---
name: mvp-android-scope
description: Alcance de producto del backend 3TIEMPO — el consumidor es una app Android nativa; toda sugerencia, propuesta o construcción debe evaluarse contra qué necesita el MVP, no contra la cobertura ideal/completa del schema
triggers:
  - user
  - model
---

Alcance de producto vigente del backend **3TIEMPO**: el desarrollo está enfocado en construir el **producto MVP**, y su único consumidor por ahora es una **app móvil nativa Android**. No hay frontend web planeado. Esto no es un detalle menor — cambia qué se construye y en qué orden, y debe aplicarse **siempre** que se sugiera, diseñe o implemente algo, no solo cuando se pregunte explícitamente por prioridades.

## Regla central

Antes de proponer, escribir o completar cualquier propuesta en `propuestas/`, clasificar lo que se está por construir en una de estas tres categorías:

1. **Bloqueante para el MVP** — sin esto, la app Android no puede funcionar como producto usable hoy (ej. login, verificación de email, recuperación de contraseña, que la base de datos no se caiga con el primer pico de tráfico).
2. **Importante, pero no bloqueante** — mejora el producto o la seguridad, pero la app funciona sin esto en el día 1 (ej. sesiones multi-dispositivo con refresh tokens, cambiar contraseña estando autenticado).
3. **Diferir sin culpa** — no tiene consumidor real todavía porque depende de algo que no existe en el plan actual (ej. un panel web, un endpoint admin, un segundo proveedor OAuth). No se construye "porque el schema lo contempla" — se documenta como backlog (ver patrón de `propuestas/31-oauth-gestion-cuentas-backlog.md`) y se retoma cuando aparezca la señal real de necesidad.

## Consecuencias concretas ya aplicadas en el proyecto (para dar contexto de continuidad)

- El login social con Google se implementa **solo** para el flujo móvil (`idToken` verificado con `google-auth-library`) — el flujo web con redirect (Passport + `GoogleStrategy`) se descartó del plan porque no hay navegador/SPA que lo consuma.
- RBAC con permisos granulares (`21-rbac-permisos-granulares.md`) queda diferido: hoy no existe ni un solo endpoint que necesite verificar un permiso (no hay módulo de torneos ni rutas admin todavía).
- Escalado horizontal, Redis distribuido y métricas (`24`-`26`) quedan documentados y listos, pero no son parte del camino crítico al MVP — importan cuando haya tráfico real, no antes.
- "Sign in with Apple" no se construye mientras la app sea Android-only, aunque la infraestructura (`OAuthProvider` enum) ya lo soporte — se retoma si algún día se planea iOS.

## Cómo aplicar esto al sugerir algo nuevo

Antes de escribir una propuesta nueva o de auditar un hueco encontrado en el código, preguntarse explícitamente: **¿esto lo necesita la app Android para funcionar como producto hoy, o es una mejora / feature de configuración / escala futura?**

- Si la respuesta no es obviamente "sí, lo necesita ya", no asumir que "más completo es mejor" ni escribir la propuesta completa de una — primero plantear la clasificación (bloqueante / importante / diferir) y **preguntarle al usuario** cuál prefiere, tal como se hizo con `29`-`31` (Fase 2 OAuth) y con la gestión de cuentas (`31-oauth-gestion-cuentas-backlog.md`).
- Cuando algo se difiere, documentarlo igual (breve, sin especificación técnica completa) en vez de simplemente omitirlo — así no se pierde el análisis y queda claro qué señal debe aparecer para retomarlo.
- Ninguna propuesta debe incluir trabajo para un flujo web, un cliente de escritorio, u otra plataforma móvil (iOS) salvo que el usuario indique explícitamente que eso entró al alcance del producto.
