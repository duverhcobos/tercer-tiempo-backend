---
description: "Genera propuestas de código en un archivo markdown en lugar de editar archivos directamente. Úsalo cuando quieras revisar los cambios antes de aplicarlos."
name: "Generar Propuesta de Código"
argument-hint: "Describe la tarea a implementar..."
agent: "agent"
---

Cuando el usuario pida implementar cambios de código, **NO edites los archivos directamente**. En su lugar:

1. Analiza los archivos relevantes del proyecto
2. Planifica los cambios necesarios
3. Crea un archivo markdown en `propuestas/` con el siguiente formato:

## Formato del archivo de propuesta

**Nombre del archivo:** `propuestas/<numero>-<nombre-descriptivo>.md`
> Ejemplo: `propuestas/02-login-refresh-token.md`

**Estructura del markdown:**

```
# Propuesta: <Título descriptivo>

Breve descripción del objetivo y qué problema resuelve.

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `ruta/al/archivo.ts` | Descripción del cambio |

---

## 1. <Nombre del archivo>

**Ruta:** `ruta/completa/desde/src/archivo.ts`

> Nota opcional explicando algo importante de este archivo.

\`\`\`typescript
// Código completo del archivo con todos los cambios aplicados
\`\`\`

---

## 2. <Siguiente archivo>

...

---

## Ejemplo de uso (si aplica)

Request/Response de ejemplo para endpoints.

---

## Orden de aplicación recomendado

1. Paso 1
2. Paso 2
...
```

## Reglas importantes

- Incluye el **código completo** de cada archivo, no solo los fragmentos modificados
- Especifica la **ruta exacta** de cada archivo desde la raíz del proyecto
- Agrega notas explicativas cuando un cambio no sea obvio
- Respeta la arquitectura DDD del proyecto: `domain/`, `application/`, `infrastructure/`, `presentation/`
- Si hay migraciones de base de datos, inclúyelas siempre como el primer paso
- Sigue el orden lógico de dependencias (domain → application → infrastructure → presentation)

## Tarea a ejecutar

$input
