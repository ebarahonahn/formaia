---
type: "query"
date: "2026-11-05T10:51:05.808861+00:00"
question: "Error SQL al importar pagos"
contributor: "graphify"
outcome: "useful"
source_nodes: ["server.js"]
---

# Q: Error SQL al importar pagos

## Answer

Expanded from graph vocabulary: [server]. El flujo de importación se implementa en backend/src/server.js; la corrección escapó el identificador reservado row_number en el INSERT de filas de importación.

## Outcome

- Signal: useful

## Source Nodes

- server.js