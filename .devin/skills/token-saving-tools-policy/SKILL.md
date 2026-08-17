---
name: token-saving-tools-policy
description: Política de uso de herramientas de exploración para ahorrar tokens (cuándo leer directo vs. usar el grafo codebase-memory)
allowed-tools:
  - read
  - grep
  - glob
triggers:
  - user
  - model
---

Política de uso de herramientas de exploración del backend 3TIEMPO, para minimizar el consumo de tokens por sesión.

1. **Ruta conocida o patrón puntual → leer directo.** Si ya se sabe qué archivo hay que abrir (porque el usuario lo mencionó, aparece en el skill `module-structure`, o ya se leyó antes en la misma sesión), usar `read`/`grep` directamente. No pasar por el grafo (codebase-memory) para esto — es más caro y no aporta nada que no dé una lectura directa.
2. **Ubicación desconocida o relación entre módulos → ahí sí, grafo.** Reservar `search_graph`, `trace_path`, `query_graph` para cuando de verdad no se sabe dónde vive algo, o se necesita trazar quién llama a qué a través de varios archivos/capas. `get_architecture` solo para un panorama general nuevo, no repetirlo si ya se pidió en la sesión.
3. **No re-indexar sin necesidad.** `index_repository` se corre una vez por sesión (o cuando el usuario pide explícitamente refrescar el índice tras cambios grandes), no antes de cada pregunta.
4. **Archivos grandes → `offset`/`limit`.** Si se sabe qué sección interesa (ej. una función específica), pedir solo ese rango de líneas en vez del archivo completo.
5. **Batch de lecturas independientes.** Cuando se necesitan varios archivos sin dependencia entre sí, pedirlos en paralelo en una sola tanda, no uno por uno.
6. **No repetir contenido ya mostrado.** En las respuestas, no volver a pegar el contenido completo de un archivo/propuesta ya mostrado antes en la conversación salvo que haya cambiado o el usuario lo pida explícitamente — referenciarlo por nombre/ruta alcanza.
