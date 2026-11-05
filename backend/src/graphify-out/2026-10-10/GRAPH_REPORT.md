# Graph Report - src  (2026-10-10)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 41 nodes · 77 edges · 7 communities (6 shown, 1 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- server.js
- weekly-menu-service.js
- routes
- sign
- catalog-workout-service.js
- passwordHash
- storePlan

## God Nodes (most connected - your core abstractions)
1. `routes()` - 15 edges
2. `buildWeeklyMenu()` - 7 edges
3. `avoidsItem()` - 4 edges
4. `fitsDiet()` - 4 edges
5. `normalized()` - 4 edges
6. `readJson()` - 4 edges
7. `sign()` - 4 edges
8. `buildCatalogWorkouts()` - 4 edges
9. `weeklyContext()` - 3 edges
10. `avoidedFoods()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `catalogWeeklyMeals()` --calls--> `buildWeeklyMenu()`  [EXTRACTED]
  server.js → services/weekly-menu-service.js
- `routes()` --calls--> `nutritionFromMenu()`  [EXTRACTED]
  server.js → services/weekly-menu-service.js
- `catalogWorkouts()` --calls--> `buildCatalogWorkouts()`  [EXTRACTED]
  server.js → services/catalog-workout-service.js

## Import Cycles
- None detected.

## Communities (7 total, 1 thin omitted)

### Community 0 - "server.js"
Cohesion: 0.22
Nodes (4): dateOnly(), pool, required, weeklyContext()

### Community 1 - "weekly-menu-service.js"
Cohesion: 0.47
Nodes (8): avoidedFoods(), avoidsItem(), buildWeeklyMenu(), DAYS, fitsDiet(), normalized(), readJson(), TYPES

### Community 2 - "routes"
Cohesion: 0.29
Nodes (7): activePlan(), body(), catalogWeeklyMeals(), publicUser(), routes(), send(), nutritionFromMenu()

### Community 3 - "sign"
Cohesion: 0.40
Nodes (5): auth(), base64(), env(), sign(), verify()

### Community 4 - "catalog-workout-service.js"
Cohesion: 0.50
Nodes (4): catalogWorkouts(), buildCatalogWorkouts(), readJson(), SPLITS

### Community 5 - "passwordHash"
Cohesion: 0.67
Nodes (3): passwordHash(), passwordValid(), scrypt

## Knowledge Gaps
- **5 isolated node(s):** `pool`, `required`, `DAYS`, `TYPES`, `SPLITS`
  These have ≤1 connection - possible missing edges. (Counts symbols only; 10 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `buildWeeklyMenu()` connect `weekly-menu-service.js` to `server.js`, `routes`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `normalized()` (e.g. with `avoidedFoods()` and `avoidsItem()`) actually correct?**
  _`normalized()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `pool`, `required`, `DAYS` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Why does `routes()` connect `routes` to `server.js`, `sign`, `catalog-workout-service.js`, `passwordHash`, `storePlan`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `buildCatalogWorkouts()` connect `catalog-workout-service.js` to `server.js`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._