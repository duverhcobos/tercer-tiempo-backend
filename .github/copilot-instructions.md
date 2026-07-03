# Instrucciones del Proyecto 3TIEMPO Backend

## Stack

- **Framework**: NestJS 11 con arquitectura DDD
- **Base de datos**: PostgreSQL + TypeORM 0.3.29 (migraciones obligatorias)
- **Package manager**: pnpm (nunca npm ni yarn)
- **Autenticación**: JWT + bcrypt
- **OS de desarrollo**: Windows / PowerShell

## Arquitectura DDD

Las capas siguen siempre este orden de dependencia:

```
domain/ → application/ → infrastructure/ → presentation/
```

Nunca una capa inferior depende de una superior.

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
