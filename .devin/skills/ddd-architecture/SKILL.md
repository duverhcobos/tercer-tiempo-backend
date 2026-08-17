---
name: ddd-architecture
description: Orden de dependencia entre capas DDD del proyecto (domain/application/infrastructure/presentation)
allowed-tools:
  - read
  - grep
  - glob
triggers:
  - user
  - model
---

Regla de arquitectura DDD del proyecto **3TIEMPO Backend**.

Las capas siguen siempre este orden de dependencia:

```
domain/ → application/ → infrastructure/ → presentation/
```

**Nunca una capa inferior depende de una superior.** Concretamente:

- `domain/` no importa nada de `application/`, `infrastructure/` ni `presentation/`. Solo contiene TypeScript puro (entidades, value objects, interfaces de repositorio, excepciones de dominio) sin decoradores de NestJS ni de TypeORM.
- `application/` puede depender de `domain/`, pero no de `infrastructure/` ni `presentation/` directamente (usa las interfaces de `domain/repositories/`, no las implementaciones).
- `infrastructure/` implementa las interfaces definidas en `domain/` y puede depender de `domain/` y de librerías externas (TypeORM, bcrypt, servicios de email, etc.).
- `presentation/` es la capa más externa: controllers, guards, decoradores HTTP. Depende de `application/` (services, DTOs) pero nunca al revés.

Al revisar o proponer código nuevo, verificar que ningún import viole este orden (por ejemplo, un archivo en `domain/` importando algo de `infrastructure/` es siempre un error de diseño, no una excepción válida "por simplicidad").

Ver también el skill `strict-layering-rule` para las reglas específicas sobre mappers y DTOs que refuerzan esta separación.
