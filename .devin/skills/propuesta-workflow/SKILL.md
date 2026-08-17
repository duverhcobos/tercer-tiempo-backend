---
name: propuesta-workflow
description: Flujo obligatorio para proponer cambios de código en el backend 3TIEMPO — nunca editar archivos fuente directamente, crear un markdown en propuestas/
argument-hint: "<descripción del cambio a proponer>"
allowed-tools:
  - read
  - edit
  - grep
  - glob
triggers:
  - user
  - model
---

Flujo de trabajo **obligatorio** para cualquier cambio de código en el backend 3TIEMPO. Invocar este skill siempre que se pida implementar una funcionalidad, agregar un módulo, modificar lógica de negocio, o cualquier cambio que afecte archivos del proyecto.

## Regla central

1. **No editar los archivos fuente directamente.**
2. Crear un archivo markdown en `propuestas/` con el nombre `<numero>-<descripcion>.md` (numeración secuencial siguiente a la última propuesta existente en el directorio).
3. **Ordenar los archivos como los escribiría un desarrollador, no por capa DDD**: empezar por el controlador (clase + constructor) y crear/actualizar cada archivo justo en el momento en que el código que se está escribiendo lo referencia — incluyendo volver a un archivo ya creado para completarlo cuando antes solo hacía falta su tipo. Ver el skill `new-endpoint-checklist` para el orden completo y el ejemplo de stub → completar cuando se trate de un endpoint nuevo.
4. Código a incluir por archivo, según su estado en **ese paso**:
   - **Se crea por primera vez (stub)**: incluir solo lo que existe en ese momento (ej. la clase con el constructor, sin el método todavía). No inventar código que el desarrollador no habría escrito aún.
   - **Se completa un archivo creado como stub en un paso anterior**: tratarlo igual que una actualización — mostrar solo el fragmento que se agrega (Antes/Después), no el archivo completo otra vez.
   - **Archivo nuevo que se escribe completo de una sola vez** (no necesita un paso de stub previo): incluir el **código completo**.
   - **Archivo existente del proyecto que se actualiza**: incluir **solo el fragmento que cambia** (el bloque de código a modificar), nunca el archivo completo. Dar suficiente contexto alrededor (unas pocas líneas antes/después o el nombre del método/bloque) para ubicar dónde aplicar el cambio, usando formato "Antes / Después" o un diff.
5. Especificar la **ruta exacta** de cada archivo desde la raíz del proyecto.
6. Si hay migración de base de datos, incluirla en el paso de persistencia del orden del checklist (junto al schema), no como primer paso del documento.
7. **No incluir documentación de Swagger** en la propuesta: omitir `application/swagger-schemas/<schema>.schema.ts` y `presentation/swagger/<modulo>-controller.swagger.ts` (crearlos/actualizarlos, y los decoradores `@ApiXxx()` en el controller, quedan fuera del alcance de la propuesta; se agregan en un paso aparte si se pide explícitamente).
8. Terminar con el **orden de aplicación recomendado** (debe coincidir con el orden en que se presentaron los archivos, incluyendo los pasos de "completar" un stub).

**Excepción:** correcciones triviales de un solo archivo (typos, un import faltante) se pueden aplicar directamente, sin pasar por `propuestas/`.

## Formato de la propuesta

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

## Antes de cerrar la propuesta, verificar

- Checklist de archivos correcto y en orden (skill `new-endpoint-checklist`, si aplica a un endpoint nuevo).
- Checklist de tests unitarios cubierto (skill `unit-test-checklist`).
- Riesgo de IDOR evaluado si el endpoint recibe un identificador de recurso (skill `idor-checklist`).
- Convenciones de código respetadas (skill `code-conventions`) y regla estricta de capas sin atajos (skill `strict-layering-rule`).
- Rutas de archivo consistentes con la estructura del módulo (skill `module-structure`).
