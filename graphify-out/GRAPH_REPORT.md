# Graph Report - formaia  (2026-10-11)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 247 nodes · 558 edges · 29 communities (15 shown, 14 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 32 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- app-v3.js
- app-v2.js
- package.json
- app.js
- routes
- server.js
- catalog-workout-service.js
- weekly-menu-service.js
- uid
- catalogMeal
- week2.js
- progressInsights
- meal-planner-service.js
- plan-adjustment-service.js
- jsonValue
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
- `routes()` --calls--> `shoppingList()`  [EXTRACTED]
  backend/src/server.js → backend/src/services/meal-planner-service.js
- `routes()` --calls--> `deriveWeeklyAdjustment()`  [EXTRACTED]
  backend/src/server.js → backend/src/services/plan-adjustment-service.js
- `routes()` --calls--> `emailEnabled()`  [EXTRACTED]
  backend/src/server.js → backend/src/services/email-service.js
- `routes()` --calls--> `sendPasswordResetEmail()`  [EXTRACTED]
  backend/src/server.js → backend/src/services/email-service.js
- `routes()` --calls--> `sendVerificationEmail()`  [EXTRACTED]
  backend/src/server.js → backend/src/services/email-service.js

## Import Cycles
- None detected.

## Communities (29 total, 14 thin omitted)

### Community 0 - "app-v3.js"
Cohesion: 0.12
Nodes (53): action(), admin(), auth(), bind(), buildPlan(), compactDate(), completedWeekCard(), completeToday() (+45 more)

### Community 1 - "app-v2.js"
Cohesion: 0.20
Nodes (30): act(), add(), auth(), bind(), dashboard(), day(), first(), fmt (+22 more)

### Community 2 - "package.json"
Cohesion: 0.12
Nodes (20): dependencies, mysql2, nodemailer, undici, name, private, scripts, dev (+12 more)

### Community 3 - "app.js"
Cohesion: 0.22
Nodes (18): action(), app, bind(), dashboard(), dateLabel, first(), landing(), layout() (+10 more)

### Community 4 - "routes"
Cohesion: 0.13
Nodes (17): appUrl(), asBoolean(), body(), catalogWeeklyMeals(), catalogWorkouts(), compatibleEquipment(), elapsedInLog(), injuryUnsafe() (+9 more)

### Community 5 - "server.js"
Cohesion: 0.17
Nodes (11): allowedDietTags, auth(), base64(), env(), passwordHash(), passwordValid(), pool, required (+3 more)

### Community 6 - "catalog-workout-service.js"
Cohesion: 0.26
Nodes (13): adjustedPrescription(), buildCatalogWorkouts(), clamp(), exerciseCount(), fitsEquipment(), focusesForSession(), formatRest(), goalLabel() (+5 more)

### Community 7 - "weekly-menu-service.js"
Cohesion: 0.35
Nodes (11): avoidedFoods(), avoidsItem(), buildWeeklyMenu(), DAYS, estimatedCalories(), fitsDiet(), goalScore(), normalized() (+3 more)

### Community 8 - "uid"
Cohesion: 0.29
Nodes (8): actionToken(), createSession(), issueActionToken(), saveExerciseMedia(), savePhoto(), storePlan(), tokenHash(), uid()

### Community 9 - "catalogMeal"
Cohesion: 0.25
Nodes (8): catalogExercise(), catalogFood(), catalogMeal(), safeDecimal(), safeInteger(), saveSetLog(), setPayload(), textList()

### Community 10 - "week2.js"
Cohesion: 0.48
Nodes (5): addDashboardNudge(), addProgressHistory(), addRecipeIndexes(), addWorkoutChecks(), enhance()

### Community 11 - "progressInsights"
Cohesion: 0.33
Nodes (6): activePlan(), currentMonthKey(), dateOnly(), progressInsights(), weeklyContext(), recipeSubstitutions()

### Community 12 - "meal-planner-service.js"
Cohesion: 0.47
Nodes (5): clean(), localEquivalences, portions, roundUp(), shoppingList()

### Community 13 - "plan-adjustment-service.js"
Cohesion: 0.40
Nodes (5): cautiousTerms, deriveWeeklyAdjustment(), energyScore, goalCopy, normalize()

### Community 14 - "jsonValue"
Cohesion: 0.40
Nodes (5): catalogExerciseTuple(), exerciseHistory(), exerciseLabel(), jsonValue(), personalRecords()

## Knowledge Gaps
- **35 isolated node(s):** `LocalData`, `root`, `state`, `trainingDays`, `fmt` (+30 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 55 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `mysql2` connect `package.json` to `server.js`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Are the 13 inferred relationships involving `render()` (e.g. with `admin()` and `auth()`) actually correct?**
  _`render()` has 13 INFERRED edges - model-reasoned connections that need verification._
- **What connects `LocalData`, `root`, `state` to the rest of the system?**
  _35 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `app-v3.js` be split into smaller, more focused modules?**
  _Cohesion score 0.11809923130677848 - nodes in this community are weakly interconnected._
- **Why does `routes()` connect `routes` to `package.json`, `server.js`, `uid`, `catalogMeal`, `progressInsights`, `meal-planner-service.js`, `plan-adjustment-service.js`, `jsonValue`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.11688311688311688 - nodes in this community are weakly interconnected._
- **Why does `buildWeeklyMenu()` connect `weekly-menu-service.js` to `routes`, `server.js`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._