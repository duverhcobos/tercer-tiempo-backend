---
name: stack-info
description: Stack tecnológico del backend 3TIEMPO (framework, DB, package manager, auth, OS)
allowed-tools:
  - read
  - grep
  - glob
triggers:
  - user
  - model
---

Referencia del stack tecnológico del proyecto **3TIEMPO Backend**. Usar esta información como base antes de sugerir librerías, comandos o patrones — nunca asumir un stack distinto al descrito acá.

- **Framework**: NestJS 11 con arquitectura DDD
- **Base de datos**: PostgreSQL + TypeORM 0.3.29 (migraciones obligatorias, `synchronize: false`)
- **Package manager**: npm — **nunca** pnpm ni yarn. Todo comando de instalación/scripts debe usar `npm`.
- **Autenticación**: JWT + bcrypt, con un `JwtService` propio que envuelve `jsonwebtoken` directamente — **NO** usar `@nestjs/jwt`.
- **OS de desarrollo**: Windows / PowerShell — los comandos de ejemplo y scripts deben ser compatibles con PowerShell, no asumir sintaxis de bash.
