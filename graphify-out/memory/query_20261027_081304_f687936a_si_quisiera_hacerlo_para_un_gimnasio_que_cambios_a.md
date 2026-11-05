---
type: "query"
date: "2026-10-27T08:13:04.754317+00:00"
question: "si quisiera hacerlo para un gimnasio que cambios a nivel de datos sugieres, el catalogo de rutinas debería de asociarse a una sucursal ya que en cada sucursal puede haber maquinas de ejercicios diferentes"
contributor: "graphify"
outcome: "useful"
source_nodes: ["catalog-workout-service.js", "fitsEquipment", "buildCatalogWorkouts", "exercise_catalog", "plan_workouts"]
---

# Q: si quisiera hacerlo para un gimnasio que cambios a nivel de datos sugieres, el catalogo de rutinas debería de asociarse a una sucursal ya que en cada sucursal puede haber maquinas de ejercicios diferentes

## Answer

Expanded from graph vocab: [catalog, exercise, equipment, plan, profile, workout, admin]. Recommended model: retain a canonical exercise catalog; model organization, branches, equipment types, branch equipment, exercise equipment requirements, and branch exercise overrides. Generated plans should carry a branch snapshot, and plan workout exercises must retain exercise IDs and alternatives. Do not duplicate the master catalog per branch; resolve availability from branch inventory plus explicit overrides. The current service loads the global active exercise catalog and filters only three broad equipment-access values.

## Outcome

- Signal: useful

## Source Nodes

- catalog-workout-service.js
- fitsEquipment
- buildCatalogWorkouts
- exercise_catalog
- plan_workouts