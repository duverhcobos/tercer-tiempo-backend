---
name: code-conventions
description: Convenciones de código puntuales del backend 3TIEMPO (non-null assertion, DTOs, throttling, command objects)
allowed-tools:
  - read
  - grep
  - glob
triggers:
  - user
  - model
---

Convenciones de código a seguir al escribir o revisar código en el backend **3TIEMPO**:

- `!` (non-null assertion) se usa para valores garantizados por `ConfigService` (ej. `config.get<number>('throttle.ttl')!`), no como atajo general para evitar chequeos de null.
- Manejo de excepciones vía **Strategy pattern** — ver `src/common/filters/` (`DomainExceptionFilter` + `handlers/`). No agregar `try/catch` ad-hoc en controllers para mapear errores a HTTP; eso ya lo resuelve el filtro global.
- DTOs con `class-validator`; **siempre separar** `application/dtos/*.dto.ts` (validación) de `application/swagger-schemas/*.schema.ts` (solo `@ApiProperty`, sin `class-validator`). Nunca mezclar ambos en un mismo archivo.
- Rate limiting por ruta usando el decorador `@Throttle()` (ver skill `code-patterns` para el ejemplo exacto).
- Los use-cases reciben un **`command` object** o parámetros primitivos — **nunca** el DTO directamente. El mapeo DTO → command lo hace el controller o el service, no el use-case.
- `auth.service.ts` y `auth.controller.ts` son archivos **existentes**: al modificarlos en una propuesta, mostrar solo el fragmento (método/import) que cambia, nunca el archivo completo (ver skill `propuesta-workflow`).
