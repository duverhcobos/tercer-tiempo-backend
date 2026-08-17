---
name: module-structure
description: Estructura de carpetas de un módulo del proyecto y del árbol src/ existente (dónde va cada archivo)
allowed-tools:
  - read
  - grep
  - glob
triggers:
  - user
  - model
---

Referencia de estructura de carpetas del backend **3TIEMPO**. Usar esto para decidir en qué ruta exacta crear cada archivo nuevo.

## Árbol de `src/` (infraestructura compartida)

```
src/
├── app.module.ts                          ← Importa todos los módulos
├── main.ts
├── common/
│   ├── decorators/
│   │   └── skip-throttle.decorator.ts
│   ├── exceptions/
│   │   └── domain.exception.ts            ← Clase base abstracta DomainException(message, httpStatus?)
│   ├── filters/
│   │   ├── domain-exception.filter.ts     ← APP_FILTER global, Strategy pattern
│   │   └── handlers/
│   │       ├── exception-handler.interface.ts
│   │       ├── domain-exception.handler.ts
│   │       ├── http-exception.handler.ts
│   │       ├── throttler-exception.handler.ts
│   │       └── unknown-error.handler.ts
│   └── logger/
│       ├── logger.module.ts
│       └── logger.service.ts
├── config/
│   ├── app.config.ts
│   ├── database.config.ts
│   ├── env.validation.ts
│   ├── jwt.config.ts
│   ├── logger.config.ts
│   └── throttle.config.ts
├── infrastructure/
│   ├── database/
│   │   ├── database.module.ts
│   │   ├── migrations/
│   │   │   └── 1706140000000-CreateUsersTable.ts   ← Fase 1 (todas las tablas base)
│   │   └── schemas/
│   │       ├── user.schema.ts             ← TypeORM entity para tabla "users"
│   │       └── verification.schema.ts     ← TypeORM entity para tabla "verifications"
│   └── health/
│       ├── health.controller.ts
│       └── health.module.ts
└── modules/
    ├── auth/                              ← Autenticación
    └── users/                             ← Perfiles de usuario (onboarding)
```

## Estructura interna de un módulo de negocio

Cada módulo bajo `src/modules/<nombre>/` sigue esta estructura completa:

```
<nombre>/
├── domain/
│   ├── entities/
│   │   └── <entidad>.entity.ts            ← Clase TS pura, sin decoradores NestJS/TypeORM
│   ├── enums/
│   │   └── <enum>.enum.ts
│   ├── exceptions/
│   │   └── <excepcion>.exception.ts       ← extends DomainException (ver skill code-patterns)
│   ├── repositories/
│   │   └── <entidad>.repository.interface.ts  ← Interface + Symbol TOKEN
│   └── value-objects/
│       └── <vo>.vo.ts
│
├── application/
│   ├── dtos/
│   │   ├── <accion>.dto.ts                ← class-validator decorators
│   │   └── <respuesta>-response.dto.ts    ← DTO de salida (clase plana)
│   ├── mappers/
│   │   └── <entidad>.mapper.ts            ← domain entity ↔ response DTO
│   ├── services/
│   │   └── <modulo>.service.ts            ← Orquesta use-cases, inyectado en controller
│   ├── swagger-schemas/
│   │   └── <schema>.schema.ts             ← Solo @ApiProperty, sin class-validator
│   └── use-cases/
│       └── <accion>.use-case.ts           ← Un use-case por acción, @Injectable
│
├── infrastructure/
│   ├── mappers/
│   │   └── <entidad>.mapper.ts            ← domain entity ↔ TypeORM schema
│   ├── repositories/
│   │   └── <entidad>.repository.ts        ← Implements IXxxRepository
│   ├── services/
│   │   └── <servicio>.service.ts          ← Servicios externos (bcrypt, email, etc.)
│   └── strategies/
│       └── <estrategia>.strategy.ts       ← Passport strategies
│
├── presentation/
│   ├── controllers/
│   │   └── <modulo>.controller.ts
│   ├── decorators/
│   │   └── <decorador>.decorator.ts
│   ├── guards/
│   │   └── <guard>.guard.ts
│   └── swagger/
│       └── <modulo>-controller.swagger.ts ← Factories: ApiXxx() con applyDecorators()
│
└── <nombre>.module.ts
```

Para el orden en el que estos archivos se crean/completan al implementar un endpoint nuevo, usar el skill `new-endpoint-checklist`.
