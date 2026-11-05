# Graph Report - formaia  (2026-10-11)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 248 nodes · 559 edges · 23 communities (9 shown, 14 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 32 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- server.js
- app-v3.js
- app-v2.js
- package.json
- app.js
- catalog-workout-service.js
- weekly-menu-service.js
- plan-adjustment-service.js
- week2.js
- sw.js

## God Nodes (most connected - your core abstractions)
1. `routes()` - 45 edges
2. `current()` - 20 edges
3. `render()` - 18 edges
4. `shell()` - 17 edges
5. `action()` - 16 edges
6. `me()` - 14 edges
7. `render()` - 14 edges
8. `shell()` - 13 edges
9. `dashboard()` - 12 edges
10. `workout()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `routes()` --calls--> `emailEnabled()`  [EXTRACTED]
  backend/src/server.js → backend/src/services/email-service.js
- `routes()` --calls--> `sendPasswordResetEmail()`  [EXTRACTED]
  backend/src/server.js → backend/src/services/email-service.js
- `routes()` --calls--> `sendVerificationEmail()`  [EXTRACTED]
  backend/src/server.js → backend/src/services/email-service.js
- `routes()` --calls--> `basePlanAdjustment()`  [EXTRACTED]
  backend/src/server.js → backend/src/services/plan-adjustment-service.js
- `routes()` --calls--> `deriveWeeklyAdjustment()`  [EXTRACTED]
  backend/src/server.js → backend/src/services/plan-adjustment-service.js

## Import Cycles
- None detected.

## Communities (23 total, 14 thin omitted)

### Community 0 - "server.js"
Cohesion: 0.07
Nodes (56): actionToken(), activePlan(), allowedDietTags, appUrl(), asBoolean(), auth(), base64(), body() (+48 more)

### Community 1 - "app-v3.js"
Cohesion: 0.11
Nodes (54): action(), admin(), auth(), bind(), buildPlan(), compactDate(), completedWeekCard(), completeToday() (+46 more)

### Community 2 - "app-v2.js"
Cohesion: 0.20
Nodes (30): act(), add(), auth(), bind(), dashboard(), day(), first(), fmt (+22 more)

### Community 3 - "package.json"
Cohesion: 0.12
Nodes (20): dependencies, mysql2, nodemailer, undici, name, private, scripts, dev (+12 more)

### Community 4 - "app.js"
Cohesion: 0.22
Nodes (18): action(), app, bind(), dashboard(), dateLabel, first(), landing(), layout() (+10 more)

### Community 5 - "catalog-workout-service.js"
Cohesion: 0.24
Nodes (14): catalogWorkouts(), adjustedPrescription(), buildCatalogWorkouts(), clamp(), exerciseCount(), fitsEquipment(), focusesForSession(), formatRest() (+6 more)

### Community 6 - "weekly-menu-service.js"
Cohesion: 0.27
Nodes (13): catalogWeeklyMeals(), avoidedFoods(), avoidsItem(), buildWeeklyMenu(), DAYS, estimatedCalories(), fitsDiet(), goalScore() (+5 more)

### Community 7 - "plan-adjustment-service.js"
Cohesion: 0.33
Nodes (6): basePlanAdjustment(), cautiousTerms, deriveWeeklyAdjustment(), energyScore, goalCopy, normalize()

### Community 8 - "week2.js"
Cohesion: 0.48
Nodes (5): addDashboardNudge(), addProgressHistory(), addRecipeIndexes(), addWorkoutChecks(), enhance()

## Knowledge Gaps
- **36 isolated node(s):** `allowedDietTags`, `pool`, `required`, `portions`, `LocalData` (+31 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 56 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `mysql2` connect `package.json` to `server.js`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Are the 13 inferred relationships involving `render()` (e.g. with `admin()` and `auth()`) actually correct?**
  _`render()` has 13 INFERRED edges - model-reasoned connections that need verification._
- **What connects `allowedDietTags`, `pool`, `required` to the rest of the system?**
  _36 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `server.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07297726070861978 - nodes in this community are weakly interconnected._
- **Why does `routes()` connect `server.js` to `package.json`, `catalog-workout-service.js`, `weekly-menu-service.js`, `plan-adjustment-service.js`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Should `app-v3.js` be split into smaller, more focused modules?**
  _Cohesion score 0.11447811447811448 - nodes in this community are weakly interconnected._
- **Why does `buildWeeklyMenu()` connect `weekly-menu-service.js` to `server.js`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._