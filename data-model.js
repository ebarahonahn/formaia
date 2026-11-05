/*
 * Contratos de dominio para FormaIA.
 * En una futura API, estas estructuras se convierten directamente en DTOs o tablas.
 */
window.FormaIAData = (() => {
  const schemaVersion = 1;

  /** @typedef {'Ganar músculo'|'Perder grasa'|'Sentirme mejor'} Goal */
  /** @typedef {'Principiante'|'Intermedio'|'Avanzado'} FitnessLevel */

  const createDatabase = () => ({
    schemaVersion,
    users: {},
    session: null
  });

  const createUser = ({ id, name, email, password }) => ({
    id,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    // Solo demo local. La contraseña nunca debe persistirse en el cliente en producción.
    password,
    createdAt: new Date().toISOString(),
    profile: null,
    plan: null,
    workouts: [],
    progress: []
  });

  const createProfile = ({ goal, level, days, time, diet, avoid }) => ({
    goal,
    level,
    days,
    time,
    diet,
    avoid: avoid?.trim() || '',
    updatedAt: new Date().toISOString()
  });

  const createWorkoutLog = ({ workoutId, date = new Date() }) => ({
    id: `workout_${Date.now()}`,
    workoutId,
    date: new Date(date).toISOString().slice(0, 10),
    completedAt: new Date().toISOString()
  });

  const createProgressLog = ({ weight, energy, note }) => ({
    id: `progress_${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    weight: weight ? Number(weight) : null,
    energy,
    note: note?.trim() || ''
  });

  /* Future persistence boundaries:
     UserRepository: getCurrent(), signIn(), signOut(), updateProfile()
     PlanRepository: generate(profile), getActive(), update()
     ProgressRepository: createWorkoutLog(), createProgressLog(), listByWeek() */
  return { schemaVersion, createDatabase, createUser, createProfile, createWorkoutLog, createProgressLog };
})();
