const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const goalCopy = {
  'Ganar músculo': 'Volumen orientado a ganar fuerza y músculo.',
  'Perder grasa': 'Volumen sostenible con descansos moderados.',
  'Sentirme mejor': 'Volumen moderado para construir constancia.'
};

const cautiousTerms = ['dolor', 'lesion', 'mareo', 'fiebre', 'enfermo', 'enfermedad'];
const energyScore = { Baja: 1, Media: 2, Alta: 3 };

export function basePlanAdjustment(profile) {
  return {
    mode: 'base',
    label: 'Plan inicial',
    summary: `${goalCopy[profile.goal] || goalCopy['Sentirme mejor']} Duración configurada: ${profile.minutes_per_session} min.`,
    setDelta: 0,
    restDeltaSeconds: 0,
    adherence: null,
    averageEnergy: null,
    weightChangeLb: null,
    safetyNote: false
  };
}

export function deriveWeeklyAdjustment(profile, context) {
  const target = Math.max(1, Number(context.target_sessions) || 1);
  const adherence = Math.min(1, (Number(context.completed_sessions_last_7_days) || 0) / target);
  const currentStreakDays = Math.max(0, Number(context.current_streak_days) || 0);
  const progress = Array.isArray(context.recent_progress) ? context.recent_progress : [];
  const energyValues = progress.map(item => energyScore[item.energy]).filter(Boolean);
  const averageEnergy = energyValues.length ? energyValues.reduce((sum, value) => sum + value, 0) / energyValues.length : 2;
  const notes = progress.map(item => normalize(item.note)).filter(Boolean);
  const safetyNote = notes.some(note => cautiousTerms.some(term => note.includes(term)));
  const weights = progress.map(item => Number(item.weight_lb)).filter(Number.isFinite);
  const weightChangeLb = weights.length >= 2 ? Number((weights[0] - weights[weights.length - 1]).toFixed(1)) : null;
  const shared = { adherence: Number(adherence.toFixed(2)), averageEnergy: Number(averageEnergy.toFixed(1)), currentStreakDays, weightChangeLb, safetyNote };

  if (safetyNote) return {
    ...shared,
    mode: 'recovery',
    label: 'Semana de recuperación',
    summary: 'Tu nota menciona malestar. Reducimos una serie y aumentamos el descanso. Detén el ejercicio si hay dolor o mareo y consulta a un profesional de salud.',
    setDelta: -1,
    restDeltaSeconds: 15
  };

  if (adherence < 0.6 || averageEnergy < 1.6 || (adherence < 0.8 && currentStreakDays === 0)) return {
    ...shared,
    mode: 'recovery',
    label: 'Ajuste de recuperación',
    summary: `La constancia, la energía o la racha de ${currentStreakDays} día(s) fue baja. El próximo ciclo reduce una serie por ejercicio y añade más descanso para recuperar el ritmo.`,
    setDelta: -1,
    restDeltaSeconds: 15
  };

  const unexpectedWeightTrend = (profile.goal === 'Perder grasa' && weightChangeLb !== null && weightChangeLb > 2)
    || (profile.goal === 'Ganar músculo' && weightChangeLb !== null && weightChangeLb < -2);
  if (unexpectedWeightTrend) return {
    ...shared,
    mode: 'maintain',
    label: 'Volumen mantenido',
    summary: `La medida cambió ${weightChangeLb > 0 ? '+' : ''}${weightChangeLb} lb. Mantenemos el volumen esta semana para observar la tendencia con más registros, sin hacer cambios automáticos de carga.`,
    setDelta: 0,
    restDeltaSeconds: 0
  };

  if (adherence >= 0.8 && averageEnergy >= 2.2 && (currentStreakDays >= 2 || adherence === 1)) return {
    ...shared,
    mode: 'progress',
    label: 'Progresión gradual',
    summary: `Completaste ${Math.round(adherence * 100)}% de tus sesiones y llevas una racha de ${currentStreakDays} día(s). Añadimos una serie donde sea apropiado; conserva una técnica cómoda y no aumentes carga si compromete la forma.`,
    setDelta: 1,
    restDeltaSeconds: 0
  };

  return {
    ...shared,
    mode: 'maintain',
    label: 'Volumen mantenido',
    summary: 'Mantendremos el volumen para consolidar técnica y constancia antes de progresar.',
    setDelta: 0,
    restDeltaSeconds: 0
  };
}
