---
name: strict-layering-rule
description: Regla estricta de capas DDD sin atajos — use-cases nunca construyen DTOs, mapper de aplicación obligatorio
allowed-tools:
  - read
  - grep
  - glob
triggers:
  - user
  - model
---

Regla estricta de capas del backend **3TIEMPO** — se sigue **siempre**, sin excepciones "por simplicidad" ni porque el archivo vaya a quedar casi vacío.

La arquitectura DDD (`domain/ → application/ → infrastructure/ → presentation/`, ver skill `ddd-architecture`) se refuerza con estas reglas concretas:

- **Los use-cases devuelven entidades de dominio** (o primitivos/estructuras internas), **nunca construyen el DTO de respuesta directamente**. Aunque el use-case sea simple y el mapeo trivial, esa transformación no le corresponde al use-case.
- **La transformación domain entity → response DTO siempre pasa por un mapper de aplicación** (`application/mappers/<entidad>.mapper.ts`), invocado desde el `service` — mismo patrón que `AuthMapper.toAuthResponse` en `auth.service.ts`. Este mapper **no es opcional** cuando el use-case retorna una entidad de dominio y el endpoint responde con un DTO — es obligatorio, no "solo si el service lo necesita".
- El `service` es quien orquesta: llama al use-case (obtiene la entidad) y al mapper (obtiene el DTO); **nunca** hace lógica de negocio ni accede a repositorios directamente.
- No se salta una capa "porque total el archivo iba a quedar casi vacío" (ej. un mapper con un solo método `toResponseDto`). Si la capa existe en la estructura del módulo (ver skill `module-structure`), el archivo se crea igual.
- Si una propuesta anterior no siguió esta regla (ej. un use-case que arma el DTO él mismo), al tocar ese código en una propuesta nueva se corrige para introducir el mapper de aplicación faltante — no se replica el atajo.

Al revisar el checklist de archivos de un endpoint nuevo (skill `new-endpoint-checklist`), el paso del "mapper de aplicación" es obligatorio bajo esta regla cuando aplica, no un paso condicional a discreción.
