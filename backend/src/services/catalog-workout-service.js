/* Deterministic routines selected from MySQL. This service never calls an AI API. */
const readJson = value => Buffer.isBuffer(value) ? JSON.parse(value.toString('utf8')) : typeof value === 'string' ? JSON.parse(value) : (value || []);

const SPLITS = {
  3: [['Cuerpo completo A', 'Piernas, empuje y tirón', ['squat', 'push', 'pull', 'core']], ['Torso', 'Empuje, tirón y estabilidad', ['push', 'pull', 'push', 'core']], ['Piernas y core', 'Fuerza de tren inferior', ['hinge', 'squat', 'legs', 'core']]],
  4: [['Torso · Empuje', 'Pecho, hombros y tríceps', ['push', 'push', 'pull', 'core']], ['Piernas · Sentadilla', 'Cuádriceps y estabilidad', ['squat', 'legs', 'hinge', 'core']], ['Torso · Tirón', 'Espalda y brazos', ['pull', 'pull', 'push', 'core']], ['Piernas · Cadena posterior', 'Glúteos e isquiotibiales', ['hinge', 'legs', 'squat', 'core']]],
  5: [['Torso · Empuje', 'Pecho, hombros y tríceps', ['push', 'push', 'pull', 'core']], ['Piernas · Sentadilla', 'Cuádriceps y estabilidad', ['squat', 'legs', 'hinge', 'core']], ['Torso · Tirón', 'Espalda y brazos', ['pull', 'pull', 'push', 'core']], ['Piernas · Cadena posterior', 'Glúteos e isquiotibiales', ['hinge', 'legs', 'squat', 'core']], ['Cuerpo completo', 'Movimiento y acondicionamiento', ['squat', 'push', 'pull', 'core']]],
  6: [['Empuje A', 'Pecho, hombros y tríceps', ['push', 'push', 'pull', 'core']], ['Tirón A', 'Espalda y bíceps', ['pull', 'pull', 'push', 'core']], ['Piernas A', 'Cuádriceps y estabilidad', ['squat', 'legs', 'hinge', 'core']], ['Empuje B', 'Hombros, pecho y tríceps', ['push', 'push', 'pull', 'core']], ['Tirón B', 'Espalda, brazos y postura', ['pull', 'pull', 'hinge', 'core']], ['Piernas B', 'Glúteos y cadena posterior', ['hinge', 'legs', 'squat', 'core']]],
  7: [['Empuje A', 'Pecho, hombros y tríceps', ['push', 'push', 'pull', 'core']], ['Tirón A', 'Espalda y bíceps', ['pull', 'pull', 'push', 'core']], ['Piernas A', 'Cuádriceps y estabilidad', ['squat', 'legs', 'hinge', 'core']], ['Empuje B', 'Hombros, pecho y tríceps', ['push', 'push', 'pull', 'core']], ['Tirón B', 'Espalda, brazos y postura', ['pull', 'pull', 'hinge', 'core']], ['Piernas B', 'Glúteos y cadena posterior', ['hinge', 'legs', 'squat', 'core']], ['Movilidad y core', 'Recuperación activa y estabilidad', ['core', 'legs', 'push', 'pull']]]
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const formatRest = seconds => seconds >= 60 ? `${Math.round(seconds / 60)} min` : `${seconds} s`;
const exerciseCount = minutes => Number(minutes) <= 30 ? 3 : Number(minutes) >= 60 ? 5 : 4;
const goalRestDelta = goal => ({ 'Ganar músculo': 15, 'Perder grasa': -15, 'Sentirme mejor': 0 }[goal] || 0);
const goalSetDelta = (goal, minutes) => goal === 'Ganar músculo' && Number(minutes) >= 45 ? 1 : 0;
const goalLabel = goal => ({ 'Ganar músculo': 'Hipertrofia progresiva', 'Perder grasa': 'Fuerza y acondicionamiento', 'Sentirme mejor': 'Fuerza y bienestar' }[goal] || 'Entrenamiento personalizado');
const normalized = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const fitsEquipment = (item, access) => {
  if (access === 'Gimnasio completo') return true;
  const equipment = normalized(item.equipment);
  if (access === 'Sin equipo') return /sin equipo|silla|pared|colchoneta/.test(equipment);
  return !/maquina|barra olimpica|rack|polea/.test(equipment);
};

function focusesForSession(focuses, minutes) {
  const target = exerciseCount(minutes);
  if (target <= focuses.length) return focuses.slice(0, target);
  return [...focuses, focuses.includes('core') ? 'legs' : 'core'];
}

function adjustedPrescription(prescription, profile, adjustment) {
  const match = String(prescription).match(/^(\d+)\s*×\s*(.+?)\s*·\s*descanso\s*(\d+)\s*(min|s)$/i);
  if (!match) return prescription;
  const [, rawSets, repetitions, rawRest, unit] = match;
  const baseRest = unit.toLowerCase() === 'min' ? Number(rawRest) * 60 : Number(rawRest);
  const timeDelta = Number(profile.minutes_per_session) <= 30 ? -1 : Number(profile.minutes_per_session) >= 60 ? 1 : 0;
  const weeklyDelta = Number(adjustment?.setDelta) || 0;
  const sets = clamp(Number(rawSets) + timeDelta + goalSetDelta(profile.goal, profile.minutes_per_session) + weeklyDelta, 2, 5);
  const rest = clamp(baseRest + goalRestDelta(profile.goal) + (Number(adjustment?.restDeltaSeconds) || 0), 45, 180);
  return `${sets} × ${repetitions} · descanso ${formatRest(rest)}`;
}

export function buildCatalogWorkouts(rows, profile, variation = 0, adjustment = null) {
  const levelRows = rows.filter(item => item.level === profile.level && Number(item.is_active));
  if (!levelRows.length) throw Error(`No hay ejercicios activos para el nivel ${profile.level}. Ejecuta la migración 005_exercise_catalog.sql.`);
  const availableRows = levelRows.filter(item => fitsEquipment(item, profile.equipment_access));
  const sourceRows = availableRows.length >= 4 ? availableRows : levelRows;
  const split = SPLITS[Number(profile.days_per_week)] || SPLITS[3];
  return split.map(([title, subtitle, focuses], dayIndex) => {
    const used = new Set();
    const sessionFocuses = focusesForSession(focuses, profile.minutes_per_session);
    const perExerciseMinutes = Math.max(4, Math.round(Number(profile.minutes_per_session) / sessionFocuses.length));
    const exercises = sessionFocuses.map((focus, index) => {
      const choices = sourceRows.filter(item => readJson(item.focus_tags).includes(focus) && !used.has(item.id));
      const pool = choices.length ? choices : sourceRows.filter(item => !used.has(item.id));
      const item = pool[(dayIndex + index + variation) % pool.length];
      used.add(item.id);
      return [item.name, adjustedPrescription(item.prescription, profile, adjustment), `${perExerciseMinutes} min`, {
        exerciseId: item.id,
        cues: readJson(item.cues),
        imageUrl: item.image_url,
        videoUrl: item.video_url,
        progression: adjustment?.label || 'Plan inicial'
      }];
    });
    return [title, `${subtitle} · ${goalLabel(profile.goal)} · ${adjustment?.label || 'Plan inicial'}`, exercises];
  });
}
