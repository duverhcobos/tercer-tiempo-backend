# Instrucciones del Proyecto 3TIEMPO Backend

El detalle de convenciones, arquitectura y workflows de este proyecto vive en skills bajo `.devin/skills/`, no en este archivo — cada skill cubre una sola responsabilidad y se invoca solo cuando es relevante, para no cargar contexto innecesario en cada sesión.

## Reglas mínimas siempre vigentes

- **Package manager: npm** — nunca pnpm ni yarn.
- **Nunca editar archivos fuente directamente** para implementar funcionalidad o lógica de negocio: ver skill `propuesta-workflow` antes de escribir/modificar código (excepción: correcciones triviales de un solo archivo).
- **OS de desarrollo**: Windows / PowerShell.
- **Producto: MVP para app móvil Android.** Sin frontend web planeado. Toda sugerencia, propuesta o construcción se evalúa contra qué necesita el MVP — ver skill `mvp-android-scope` **siempre**, no solo cuando se pregunte explícitamente por prioridades.

## Índice de skills

| Skill | Cuándo usarla |
|-------|---------------|
| `stack-info` | Antes de sugerir librerías, comandos o patrones — confirmar el stack real del proyecto |
| `ddd-architecture` | Al decidir en qué capa va algo, o al revisar si un import viola el orden de dependencias |
| `module-structure` | Al crear un archivo nuevo — para saber la ruta exacta dentro de `src/` o de un módulo |
| `db-schema-fase1` | Al referenciar o extender tablas ya existentes en la base de datos |
| `endpoints-status` | Para saber si un endpoint ya está implementado o solo propuesto |
| `code-conventions` | Al escribir código — non-null assertion, DTOs vs swagger-schemas, command objects, etc. |
| `strict-layering-rule` | Al revisar que un use-case no construya DTOs directamente y que exista el mapper de aplicación |
| `code-patterns` | Al escribir excepciones de dominio, repositorios, JWT, guards, o throttling — ejemplos exactos a replicar |
| `new-endpoint-checklist` | Al implementar un endpoint nuevo — orden exacto de archivos a crear/completar |
| `unit-test-checklist` | Al definir qué `.spec.ts` hacen falta para un endpoint nuevo y qué mockear/probar |
| `propuesta-workflow` | **Siempre** que se vaya a proponer un cambio de código — formato y reglas del archivo en `propuestas/` |
| `idor-checklist` | Al diseñar/revisar un endpoint que recibe un identificador de recurso |
| `token-saving-tools-policy` | Al explorar el código — cuándo leer directo vs. usar el grafo codebase-memory |
| `mvp-android-scope` | **Siempre** — el producto es Android-only y todo se evalúa contra el MVP, no contra la cobertura ideal del schema |

Si una instrucción parece faltar acá, buscarla primero en `.devin/skills/` antes de asumir que no existe.
