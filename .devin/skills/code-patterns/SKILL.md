---
name: code-patterns
description: Patrones de código recurrentes del backend 3TIEMPO — excepciones de dominio, repositorio interface+token, JWT payload, guard público, UserSchema, throttling
allowed-tools:
  - read
  - grep
  - glob
triggers:
  - user
  - model
---

Patrones de código clave del backend **3TIEMPO**. Usar estos ejemplos como referencia exacta al escribir código nuevo — no inventar variantes propias.

### Excepciones de dominio

```typescript
// Todas las excepciones heredan de DomainException en src/common/exceptions/
export class XxxException extends DomainException {
    constructor() { super('mensaje', 409); }
}
// El DomainExceptionFilter global las captura y responde { statusCode, message, timestamp }
```

### Repositorio: interface + token

```typescript
// En domain/repositories/
export interface IXxxRepository { ... }
export const XXX_REPOSITORY = Symbol('IXxxRepository');

// En módulo:
{ provide: XXX_REPOSITORY, useClass: XxxRepository }

// En use-case:
constructor(@Inject(XXX_REPOSITORY) private readonly repo: IXxxRepository) {}
```

### JwtStrategy payload

```typescript
// jwt.strategy.ts devuelve: { userId: string, email: string }
// CurrentUser decorator extrae este objeto del request
// Uso en controller: @CurrentUser() user: { userId: string }
```

### Guard global + rutas públicas

```typescript
// JwtAuthGuard es APP_GUARD global en app.module.ts
// Para rutas sin auth: @Public() (SetMetadata IS_PUBLIC_KEY)
// Rutas protegidas: no necesitan decorador adicional
```

### UserSchema (tabla `users`)

```typescript
// Sin columna role — los roles están en user_roles JOIN roles
// Para obtener rol: query raw con JOIN (ver findByEmailWithRole en user.repository.ts)
// updateStatus(userId, status): usa userSchemaRepository.update()
// hasProfile(userId): query raw a user_profiles
```

### Throttling por ruta

```typescript
@Throttle({ default: { limit: 5, ttl: 60000 } })  // 5 req / 60s
```
