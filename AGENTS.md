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

El orden de creación **no sigue las capas de DDD** (domain → application → infrastructure → presentation); sigue el orden en el que un desarrollador escribiría el código: empieza por el controlador y va creando cada dependencia en el momento exacto en que el código la referencia — no cuando "le toca por capa". Swagger queda excluido (ver regla en "Flujo de trabajo: propuestas de código").

**Un archivo no se escribe completo la primera vez que se crea.** Se crea vacío o con solo la firma en el momento en que otro archivo lo necesita para compilar (ej. un tipo en el constructor), y se completa después, cuando el desarrollador vuelve a él porque ya tiene lo que le faltaba (ej. el DTO que le pasa a su método). Por eso el mismo archivo puede aparecer dos veces en el checklist: una vez al crearse (stub) y otra al completarse.

Ejemplo de orden real para un controller con `constructor(private readonly xService: XService) {}` seguido de un método:

### 1. Controlador — clase + constructor
- [ ] `presentation/controllers/<modulo>.controller.ts` *(crear)* — `@Controller()`, constructor con el service inyectado. El método del endpoint puede quedar sin escribir todavía.

### 2. Service — stub, porque el constructor del controller ya lo necesita
- [ ] `application/services/<modulo>.service.ts` *(crear, vacío o sin el método nuevo todavía)* — se crea aquí, **antes que los DTOs**, porque el constructor referencia el tipo `XService` antes de que el método del controller referencie ningún DTO

### 3. DTOs que el método del controller necesita para tipar `@Body()`/`@Query()`/el retorno
- [ ] `application/dtos/<accion>.dto.ts`
- [ ] `application/dtos/<respuesta>-response.dto.ts` *(si la respuesta es nueva)*

### 4. Controlador — se completa el método del endpoint
- [ ] `presentation/controllers/<modulo>.controller.ts` *(actualizar)* — ahora que existen los DTOs, se escribe la firma completa del método y su cuerpo, que llama a un método del service que aún no existe

### 5. Service — se completa con el método que el controller ya invoca
- [ ] `application/services/<modulo>.service.ts` *(actualizar)* — agrega el método, delega a un use-case que aún no existe

### 6. Use-case — la lógica de negocio del endpoint
- [ ] `application/use-cases/<accion>.use-case.ts`

### 7. Dominio — lo que el use-case necesita para expresar sus reglas
- [ ] `domain/exceptions/<nombre>.exception.ts` *(una por cada excepción que el use-case lanza)*
- [ ] `domain/entities/<entidad>.entity.ts` *(si el use-case opera sobre una entidad nueva)*
- [ ] `domain/value-objects/<vo>.vo.ts` *(si aplica)*
- [ ] `domain/repositories/<entidad>.repository.interface.ts` *(si el use-case necesita persistencia nueva: define la interfaz + token; la implementación viene después)*

### 8. Persistencia — solo si el repositorio requiere tabla/columna nueva
- [ ] `src/infrastructure/database/migrations/<timestamp>-<Descripcion>.ts`
- [ ] `src/infrastructure/database/schemas/<entidad>.schema.ts`

### 9. Infraestructura — implementa lo que el dominio dejó como interfaz
- [ ] `infrastructure/repositories/<entidad>.repository.ts` *(implements IXxxRepository)*
- [ ] `infrastructure/mappers/<entidad>.mapper.ts` *(domain ↔ schema, si el repositorio lo necesita)*
- [ ] `infrastructure/services/<servicio>.service.ts` *(si el use-case depende de un servicio externo nuevo: bcrypt, email, etc.)*

### 10. Mapper de aplicación — obligatorio si el use-case retorna una entidad de dominio y la respuesta es un DTO
- [ ] `application/mappers/<entidad>.mapper.ts` *(domain entity → response DTO; ver "Regla estricta de capas": el use-case nunca construye el DTO directamente)*

### 11. Módulo — conecta todas las piezas (siempre el último paso)
- [ ] `<nombre>.module.ts` *(actualizar providers/imports: token del repositorio, use-case, servicios)*

**Nota:** si el `service`, `use-case`, etc. ya existen (endpoint agregado a un módulo existente), no hay stub que crear — se salta directo al paso de "actualizar". Los pasos de stub (2) y completar (4, 5) solo aplican cuando el archivo es nuevo.

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
3. **Ordena los archivos como los escribiría un desarrollador, no por capa DDD**: empieza por el controlador (clase + constructor) y ve creando/actualizando cada archivo justo en el momento en que el código que se está escribiendo lo referencia — incluyendo volver a un archivo ya creado para completarlo cuando antes solo hacía falta su tipo (ver "Checklist de archivos para un endpoint nuevo" para el orden completo y el ejemplo de stub → completar).
4. Código a incluir por archivo, según su estado en **ese paso**:
   - **Se crea por primera vez (stub)**: incluye solo lo que existe en ese momento (ej. la clase con el constructor, sin el método todavía). No inventes código que el desarrollador no habría escrito aún.
   - **Se completa un archivo creado como stub en un paso anterior**: trátalo igual que una actualización — muestra solo el fragmento que se agrega (Antes/Después), no el archivo completo otra vez.
   - **Archivo nuevo que se escribe completo de una sola vez** (no necesita un paso de stub previo): incluye el **código completo**.
   - **Archivo existente del proyecto que se actualiza**: incluye **solo el fragmento que cambia** (el bloque de código a modificar), nunca el archivo completo. Da suficiente contexto alrededor (unas pocas líneas antes/después o el nombre del método/bloque) para ubicar dónde aplicar el cambio, usando un formato "Antes / Después" o un diff.
5. Especifica la **ruta exacta** de cada archivo desde la raíz del proyecto
6. Si hay migración de base de datos, inclúyela en el paso de persistencia del orden anterior (junto al schema), no como primer paso del documento
7. **No incluyas documentación de Swagger** en la propuesta: omite `application/swagger-schemas/<schema>.schema.ts` y `presentation/swagger/<modulo>-controller.swagger.ts` (crearlos/actualizarlos, y los decoradores `@ApiXxx()` en el controller, quedan fuera del alcance de la propuesta; se agregan en un paso aparte si se pide explícitamente)
8. Termina con el orden de aplicación recomendado (debe coincidir con el orden en que se presentaron los archivos, incluyendo los pasos de "completar" un stub)

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

## 1. <Nombre archivo> (archivo nuevo)

**Ruta:** `ruta/completa/archivo.ts`

\`\`\`typescript
// código completo
\`\`\`

## 2. <Nombre archivo> (archivo existente — actualización)

**Ruta:** `ruta/completa/archivo.ts`

**Antes:**
\`\`\`typescript
// solo el fragmento/método que cambia
\`\`\`

**Después:**
\`\`\`typescript
// el fragmento ya modificado
\`\`\`
```

## Convenciones de código

- `!` non-null assertion para valores garantizados por ConfigService
- Manejo de excepciones via Strategy pattern (ver `src/common/filters/`)
- DTOs con class-validator, separar siempre swagger-schemas de los DTOs
- Rate limiting por ruta usando `@Throttle()` decorator
- Los use-cases reciben un `command` object o parámetros primitivos, nunca el DTO directamente
- `auth.service.ts` y `auth.controller.ts` son archivos existentes: al modificarlos, muestra solo el fragmento (método/import) que cambia en cada propuesta, no el archivo completo

---

## Regla estricta de capas (sin atajos)

La arquitectura DDD (`domain/ → application/ → infrastructure/ → presentation/`) se sigue **siempre**, sin excepciones por simplicidad. En particular:

- **Los use-cases devuelven entidades de dominio** (o primitivos/estructuras internas), **nunca construyen el DTO de respuesta directamente**. Aunque el use-case sea simple y "total" el mapeo sea trivial, la transformación no le corresponde a él.
- **La transformación domain entity → response DTO siempre pasa por un mapper de aplicación** (`application/mappers/<entidad>.mapper.ts`), invocado desde el `service` — igual patrón que `AuthMapper.toAuthResponse` en `auth.service.ts`. El paso 10 del checklist ("Mapper de aplicación") **no es opcional** cuando el use-case retorna una entidad de dominio y el endpoint responde con un DTO: es obligatorio, no "solo si el service lo necesita".
- El `service` es quien orquesta: llama al use-case (obtiene la entidad) y al mapper (obtiene el DTO); nunca hace lógica de negocio ni accede a repositorios directamente.
- No se salta una capa "porque total el archivo iba a quedar casi vacío" (ej. un mapper con un solo método `toResponseDto`). Si la capa existe en la estructura del módulo, el archivo se crea.
- Si una propuesta anterior no siguió esta regla (ej. un use-case que arma el DTO él mismo), al tocar ese código en una propuesta nueva se corrige para introducir el mapper de aplicación faltante.
