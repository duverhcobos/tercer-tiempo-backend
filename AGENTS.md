# Instrucciones del Proyecto 3TIEMPO Backend

## Stack

- **Framework**: NestJS 11 con arquitectura DDD
- **Base de datos**: PostgreSQL + TypeORM 0.3.29 (migraciones obligatorias)
- **Package manager**: npm (nunca pnpm ni yarn)
- **Autenticación**: JWT + bcrypt (custom JwtService wrapper sobre jsonwebtoken, NO @nestjs/jwt)
- **OS de desarrollo**: Windows / PowerShell

---

## Arquitectura DDD

Las capas siguen siempre este orden de dependencia:

```
domain/ → application/ → infrastructure/ → presentation/
```

Nunca una capa inferior depende de una superior.

---

## Estructura de módulos existentes

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
    └── users/                            ← Perfiles de usuario (onboarding)
```

---

## Tablas en BD (Fase 1 — migración ya ejecutada)

| Tabla | Propósito |
|-------|-----------|
| `users` | Auth: id(UUID), email, username, password_hash, status, last_login_at |
| `user_profiles` | Perfil: first_name_1, last_name_1, birth_date, gender, country_id |
| `user_sessions` | Refresh tokens (hash SHA-256) |
| `verifications` | Tokens OTP/reset (email_verification, password_reset) |
| `roles` | Catálogo: SUPERADMIN, ORGANIZER, REFEREE, PLAYER, SPECTATOR |
| `user_roles` | Join table users ↔ roles |
| `permissions` | Catálogo de permisos |
| `role_permissions` | Join table roles ↔ permissions |
| `countries` | Catálogo ISO 3166-1 alpha-2 |
| `security_audit_logs` | Eventos de auditoría (inmutable) |

**Nota:** `users.id` es UUID (no BIGSERIAL). Los roles se almacenan en `user_roles`, no como columna en `users`.

---

## Estructura interna de un módulo

Cada módulo bajo `src/modules/<nombre>/` sigue esta estructura completa:

```
<nombre>/
├── domain/
│   ├── entities/
│   │   └── <entidad>.entity.ts            ← Clase TS pura, sin decoradores NestJS/TypeORM
│   ├── enums/
│   │   └── <enum>.enum.ts
│   ├── exceptions/
│   │   └── <excepcion>.exception.ts       ← extends DomainException (ver patrón abajo)
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

---

## Checklist de archivos para un endpoint nuevo

Al agregar un endpoint en un módulo existente o nuevo, estos son los archivos involucrados en orden de creación:

### 1. Dominio (si hay entidad o excepción nueva)
- [ ] `domain/exceptions/<nombre>.exception.ts`
- [ ] `domain/entities/<entidad>.entity.ts` *(si entidad nueva)*
- [ ] `domain/repositories/<entidad>.repository.interface.ts` *(si entidad nueva)*

### 2. Infraestructura compartida (si tabla nueva)
- [ ] `src/infrastructure/database/schemas/<entidad>.schema.ts`
- [ ] `src/infrastructure/database/migrations/<timestamp>-<Descripcion>.ts`

### 3. Aplicación
- [ ] `application/dtos/<accion>.dto.ts`
- [ ] `application/dtos/<respuesta>-response.dto.ts` *(si respuesta nueva)*
- [ ] `application/swagger-schemas/<schema>.schema.ts`
- [ ] `application/use-cases/<accion>.use-case.ts`
- [ ] `application/services/<modulo>.service.ts` *(actualizar)*

### 4. Infraestructura del módulo
- [ ] `infrastructure/repositories/<entidad>.repository.ts` *(actualizar o crear)*
- [ ] `infrastructure/services/<servicio>.service.ts` *(si servicio externo nuevo)*

### 5. Presentación
- [ ] `presentation/swagger/<modulo>-controller.swagger.ts` *(actualizar)*
- [ ] `presentation/controllers/<modulo>.controller.ts` *(actualizar)*

### 6. Módulo
- [ ] `<nombre>.module.ts` *(actualizar providers/imports)*

---

## Checklist de pruebas unitarias para un endpoint nuevo

Cada archivo con lógica propia debe tener su `<archivo>.spec.ts` **al lado** del archivo (mismo folder), usando `@nestjs/testing` (`Test.createTestingModule`) y mocks tipados con `jest.Mocked<T>`. Los tests unitarios prueban la lógica **aislada** (con dependencias mockeadas); el flujo HTTP real (validación de DTOs, guards, status codes) se prueba en `test/*.e2e-spec.ts`, no aquí.

### SIEMPRE requieren `.spec.ts`

| Capa | Archivo | Qué mockear | Qué probar |
|------|---------|--------------|------------|
| `application/use-cases/` | `<accion>.use-case.ts` | El/los repositorio(s) (`USER_REPOSITORY`, etc.) y servicios inyectados (`BcryptService`, `IEmailNotificationService`) | Happy path, cada excepción de dominio que puede lanzar, y que no se llamen efectos secundarios (ej. `updateLastLoginAt`) cuando el flujo falla antes de tiempo |
| `infrastructure/repositories/` | `<entidad>.repository.ts` | `Repository<T>` de TypeORM vía `getRepositoryToken(Schema)`, y `DataSource` si usa `query()`/`createQueryRunner()` | Cada método público, incluyendo casos `null`/vacío, y transacciones (`commitTransaction` en éxito, `rollbackTransaction` + re-throw en error) |
| `infrastructure/mappers/` y `application/mappers/` | `<entidad>.mapper.ts` | Nada (son funciones puras) | `toDomain`/`toSchema`/`toAuthResponse`, casos límite (id vacío, listas vacías, campos nulos) |
| `infrastructure/services/` | `<servicio>.service.ts` *(solo si tiene lógica propia: hashing, firmas, tokens)* | `ConfigService` si aplica | Casos de éxito, configuración faltante, y errores de la librería subyacente (token expirado, firma inválida, etc.) |

### Solo si tienen lógica condicional relevante

- `presentation/guards/<guard>.guard.ts` y `infrastructure/strategies/<estrategia>.strategy.ts` — si el guard/strategy tiene ramas propias más allá de delegar a Passport (ej. `@Public()` bypass), mockear el `Reflector`/request y probar cada rama.
- `application/services/<modulo>.service.ts` — normalmente es solo orquestación (`return this.xUseCase.execute(...)`); si es pass-through puro, **no** amerita unit test (ya se cubre indirectamente por el test del use-case + el e2e del controller). Si empieza a tener lógica propia (combinar resultados, side effects), sí testear.

### NO requieren `.spec.ts`

- `domain/exceptions/<nombre>.exception.ts` — constructores triviales (mensaje + status). Ya se verifican indirectamente en los tests del use-case que las lanza.
- `application/dtos/*.dto.ts` y `application/swagger-schemas/*.schema.ts` — solo decoradores, sin lógica. Su validación se prueba en el `*.e2e-spec.ts` del endpoint.
- `presentation/controllers/<modulo>.controller.ts` — son *thin controllers* que delegan al service; se cubren con el `*.e2e-spec.ts` correspondiente (ver `test/login.e2e-spec.ts`, `test/verify-email.e2e-spec.ts` como referencia).
- `*.module.ts`, `main.ts`, `infrastructure/database/schemas/*.schema.ts`, `infrastructure/database/migrations/*.ts` — wiring/bootstrap sin lógica de negocio. Estos archivos ya están excluidos de `collectCoverageFrom` en `package.json` para que el % de coverage sea representativo.

### Al agregar un archivo nuevo a `collectCoverageFrom`

Si el archivo nuevo cae en alguna de las categorías "NO requieren", agrégalo al patrón de exclusión en `package.json > jest.collectCoverageFrom` para no distorsionar la métrica de `npm run test:cov`.

---

## Patrones clave del proyecto

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

### UserSchema (tabla users)
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

---

## Estado actual de endpoints (Fase 1)

| Método | Ruta | Estado | Propuesta |
|--------|------|--------|-----------|
| POST | `/auth/register` | ✅ Implementado | — |
| POST | `/auth/login` | 📋 Propuesto | 07-login.md |
| POST | `/auth/verify-email` | 📋 Propuesto | 08-verify-email.md |
| POST | `/auth/resend-verification` | 📋 Propuesto | 09-resend-verification.md |
| GET | `/auth/me` | 📋 Propuesto | 10-get-me.md |
| POST | `/users/profile` | 📋 Propuesto | 11-onboarding-profile.md |

Las propuestas 07–12 están en `propuestas/` listas para aplicar en orden.

---

## Flujo de trabajo: propuestas de código

Cuando se pida implementar una funcionalidad, agregar un módulo, modificar lógica de negocio o cualquier cambio que afecte archivos del proyecto:

1. **No edites los archivos fuente directamente**
2. Crea un archivo markdown en `propuestas/` con el nombre `<numero>-<descripcion>.md`
3. Incluye el **código completo** de cada archivo afectado (no solo fragmentos)
4. Especifica la **ruta exacta** de cada archivo desde la raíz del proyecto
5. Si hay migración de base de datos, inclúyela como **primer paso**
6. Termina con el orden de aplicación recomendado

Excepción: correcciones triviales de un solo archivo (typos, un import faltante) se pueden aplicar directamente.

## Formato de propuesta

```markdown
# Propuesta: <Título>

Descripción breve.

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `ruta/archivo.ts` | descripción |

---

## 1. <Nombre archivo>

**Ruta:** `ruta/completa/archivo.ts`

\`\`\`typescript
// código completo
\`\`\`
```

## Convenciones de código

- `!` non-null assertion para valores garantizados por ConfigService
- Manejo de excepciones via Strategy pattern (ver `src/common/filters/`)
- DTOs con class-validator, separar siempre swagger-schemas de los DTOs
- Rate limiting por ruta usando `@Throttle()` decorator
- Los use-cases reciben un `command` object o parámetros primitivos, nunca el DTO directamente
- `auth.service.ts` y `auth.controller.ts` se muestran en estado **acumulativo** en cada propuesta
