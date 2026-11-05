# FormaIA — Diseño y base técnica

## Principios de interfaz

- **Claro y sereno:** crema como superficie principal, verde oscuro para foco y contraste, lima para progreso/acción, coral para energía y avisos.
- **Mobile-first:** navegación inferior persistente, controles de al menos 44 px y una columna por defecto en pantallas pequeñas.
- **Progreso visible:** cada vista principal termina en una acción concreta: entrenar, revisar comidas o registrar avances.
- **Sin dependencias de UI:** HTML, CSS y JavaScript nativos; las capas de datos e IA se pueden reemplazar sin reescribir las vistas.

## Mapa de pantallas

| Pantalla | Propósito | Componentes principales |
| --- | --- | --- |
| Landing | Explicar el valor y captar una sesión | `Header`, hero, CTA, prueba social de producto |
| Autenticación | Crear o recuperar una sesión | `AuthForm`, validación, aviso de demo local |
| Onboarding | Crear el perfil que alimenta el plan | `Stepper`, selector de objetivo, campos de disponibilidad/dieta |
| Dashboard | Punto de retorno diario | `WorkoutCard`, `NutritionCard`, `ProgressCard`, mensaje IA |
| Rutina | Ejecutar y confirmar una sesión | `ExerciseList`, CTA de inicio/finalización |
| Alimentación | Mostrar comidas y metas del día | `MacroSummary`, `MealCard`, aviso de restricciones |
| Progreso | Mostrar adherencia y capturar avances | `StreakCard`, gráfico semanal, formulario de avance |
| Perfil | Gestionar el punto de partida | resumen del perfil y reevaluación |

## Navegación

```text
Landing → Autenticación → Onboarding → Dashboard
                                      ├─ Rutina → completar → Dashboard/Progreso
                                      ├─ Alimentación
                                      ├─ Progreso → registrar avance → Progreso
                                      └─ Perfil → reevaluar → Onboarding
```

## Modelo de datos

`data-model.js` define constructores de datos para las siguientes entidades:

```text
Database
├─ schemaVersion
├─ organizations → branches
├─ equipmentCatalog → branchEquipment
├─ exerciseCatalog → branchExerciseAvailability
├─ users { [userId]: User }
└─ session: userId | null

User
├─ id, name, email, createdAt
├─ profile: Profile
├─ plan: Plan
├─ workouts: WorkoutLog[]
└─ progress: ProgressLog[]

Profile: goal, level, days, time, diet, avoid, homeBranchId, updatedAt
Plan: branchId, calories, protein, carbs, fats, message, workouts[], meals[], target
WorkoutLog: id, workoutId, date, completedAt
ProgressLog: id, date, weight, energy, note
```

El catálogo de ejercicios es canónico. La sucursal aporta el inventario de equipo y puede habilitar, deshabilitar o ajustar un ejercicio sin duplicar su técnica, medios ni historial. Cada plan conserva la sucursal con la que fue generado.

## Próximo límite técnico

Actualmente `localStorage` es el adaptador local. La migración a producción consiste en implementar repositorios con la misma responsabilidad:

1. Autenticación segura en servidor y tokens de sesión.
2. Base de datos para `User`, `Profile`, `Plan`, `WorkoutLog` y `ProgressLog`.
3. Endpoint de generación de planes con IA que reciba un perfil validado.
4. Reglas de salud y revisión profesional para recomendaciones nutricionales.
