---
name: unit-test-checklist
description: Checklist de qué archivos requieren .spec.ts al agregar un endpoint nuevo al backend 3TIEMPO y qué mockear/probar
allowed-tools:
  - read
  - grep
  - glob
triggers:
  - user
  - model
---

Checklist de pruebas unitarias para un **endpoint nuevo** en el backend 3TIEMPO.

Cada archivo con lógica propia debe tener su `<archivo>.spec.ts` **al lado** del archivo (mismo folder), usando `@nestjs/testing` (`Test.createTestingModule`) y mocks tipados con `jest.Mocked<T>`. Los tests unitarios prueban la lógica **aislada** (con dependencias mockeadas); el flujo HTTP real (validación de DTOs, guards, status codes) se prueba en `test/*.e2e-spec.ts`, no acá.

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

Si el archivo nuevo cae en alguna de las categorías "NO requieren", agregarlo al patrón de exclusión en `package.json > jest.collectCoverageFrom` para no distorsionar la métrica de `npm run test:cov`.
