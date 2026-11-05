# Graph Report - src  (2026-10-10)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 56 nodes · 106 edges · 7 communities
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- catalog-workout-service.js
- server.js
- routes
- weekly-menu-service.js
- plan-adjustment-service.js
- sign
- passwordHash

## God Nodes (most connected - your core abstractions)
1. `routes()` - 17 edges
2. `buildCatalogWorkouts()` - 7 edges
3. `buildWeeklyMenu()` - 7 edges
4. `adjustedPrescription()` - 6 edges
5. `avoidsItem()` - 4 edges
6. `fitsDiet()` - 4 edges
7. `normalized()` - 4 edges
8. `readJson()` - 4 edges
9. `deriveWeeklyAdjustment()` - 4 edges
10. `normalize()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `catalogWeeklyMeals()` --calls--> `buildWeeklyMenu()`  [EXTRACTED]
  server.js → services/weekly-menu-service.js
- `routes()` --calls--> `basePlanAdjustment()`  [EXTRACTED]
  server.js → services/plan-adjustment-service.js
- `routes()` --calls--> `deriveWeeklyAdjustment()`  [EXTRACTED]
  server.js → services/plan-adjustment-service.js
- `catalogWorkouts()` --calls--> `buildCatalogWorkouts()`  [EXTRACTED]
  server.js → services/catalog-workout-service.js
- `routes()` --calls--> `nutritionFromMenu()`  [EXTRACTED]
  server.js → services/weekly-menu-service.js

## Import Cycles
- None detected.

## Communities (7 total, 0 thin omitted)

### Community 0 - "catalog-workout-service.js"
Cohesion: 0.27
Nodes (12): catalogWorkouts(), adjustedPrescription(), buildCatalogWorkouts(), clamp(), exerciseCount(), focusesForSession(), formatRest(), goalLabel() (+4 more)

### Community 1 - "server.js"
Cohesion: 0.22
Nodes (4): dateOnly(), pool, required, weeklyContext()

### Community 2 - "routes"
Cohesion: 0.25
Nodes (9): activePlan(), body(), catalogWeeklyMeals(), publicUser(), routes(), send(), storePlan(), uid() (+1 more)

### Community 3 - "weekly-menu-service.js"
Cohesion: 0.47
Nodes (8): avoidedFoods(), avoidsItem(), buildWeeklyMenu(), DAYS, fitsDiet(), normalized(), readJson(), TYPES

### Community 4 - "plan-adjustment-service.js"
Cohesion: 0.33
Nodes (6): basePlanAdjustment(), cautiousTerms, deriveWeeklyAdjustment(), energyScore, goalCopy, normalize()

### Community 5 - "sign"
Cohesion: 0.40
Nodes (5): auth(), base64(), env(), sign(), verify()

### Community 6 - "passwordHash"
Cohesion: 0.67
Nodes (3): passwordHash(), passwordValid(), scrypt

## Knowledge Gaps
- **8 isolated node(s):** `SPLITS`, `pool`, `required`, `DAYS`, `TYPES` (+3 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 13 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `buildCatalogWorkouts()` connect `catalog-workout-service.js` to `server.js`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **What connects `SPLITS`, `pool`, `required` to the rest of the system?**
  _8 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Why does `buildWeeklyMenu()` connect `weekly-menu-service.js` to `server.js`, `routes`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Why does `routes()` connect `routes` to `catalog-workout-service.js`, `server.js`, `plan-adjustment-service.js`, `sign`, `passwordHash`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._