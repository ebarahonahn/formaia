/* Builds a seven-day meal schedule from the MySQL catalog. No AI is used here. */

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const TYPES = ['Desayuno', 'Almuerzo', 'Merienda', 'Cena'];

const readJson = value => {
  if (Buffer.isBuffer(value)) return JSON.parse(value.toString('utf8'));
  if (typeof value === 'string') return JSON.parse(value);
  return value || [];
};

const normalized = value => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().trim();

const avoidedFoods = value => String(value || '')
  .split(/[,;\n]/).map(normalized).filter(Boolean);

const stableHash = value => {
  let hash = 2166136261;
  for (const character of String(value || '')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

function fitsDiet(item, diet) {
  const tags = readJson(item.diet_tags).map(normalized);
  if (diet === 'Vegetariana') return tags.includes('vegetariana');
  if (diet === 'Mediterránea') return tags.includes('mediterranea') || tags.includes('flexible');
  if (diet === 'Alta en proteína') return tags.includes('alta en proteina') || Number(item.protein_g) >= 18;
  return true;
}

function avoidsItem(item, forbidden) {
  if (!forbidden.length) return false;
  const source = [item.title, item.description, ...readJson(item.avoid_tags), ...readJson(item.ingredients)].map(normalized).join(' ');
  return forbidden.some(food => source.includes(food));
}

function estimatedCalories(profile) {
  // La meta indicada por la persona siempre tiene prioridad. Los datos físicos
  // solo se usan para estimar una meta cuando todavía no se ha elegido una.
  const requestedTarget = Number(profile.target_calories);
  if (Number.isFinite(requestedTarget) && requestedTarget >= 1200 && requestedTarget <= 4000) return Math.round(requestedTarget / 25) * 25;
  const weightKg = Number(profile.weight_lb) * 0.453592;
  const heightCm = Number(profile.height_cm);
  const age = Number(profile.age);
  if (!weightKg || !heightCm || !age) return 2000;
  const sexAdjustment = profile.sex_for_calculation === 'Hombre' ? 5 : profile.sex_for_calculation === 'Mujer' ? -161 : -78;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + sexAdjustment;
  const activity = { Sedentaria: 1.2, Ligera: 1.375, Moderada: 1.55, Alta: 1.725 }[profile.activity_level] || 1.55;
  const goalAdjustment = { 'Ganar músculo': 250, 'Perder grasa': -350, 'Sentirme mejor': 0 }[profile.goal] || 0;
  return Math.round(Math.max(1400, Math.min(3600, bmr * activity + goalAdjustment)) / 25) * 25;
}

function goalScore(item, profile) {
  const calories = Math.max(1, Number(item.calories) || 1);
  const protein = Number(item.protein_g) || 0;
  const proteinDensity = protein / calories;
  if (profile.goal === 'Ganar músculo') return protein * 3 + proteinDensity * 500;
  if (profile.goal === 'Perder grasa') return proteinDensity * 1000 - calories / 100;
  return proteinDensity * 500 - Math.abs(calories - 500) / 100;
}

export function buildWeeklyMenu(catalog, profile, variation = '') {
  const forbidden = avoidedFoods(profile.foods_to_avoid);
  const accepted = catalog.filter(item => fitsDiet(item, profile.diet) && !avoidsItem(item, forbidden));
  const missing = TYPES.filter(type => !accepted.some(item => item.meal_type === type));
  if (missing.length) throw Error(`No hay suficientes opciones de ${missing.join(', ')} para la dieta o alimentos a evitar indicados.`);
  const targetCalories = estimatedCalories(profile);
  const profileSeed = stableHash([
    profile.user_id,
    profile.goal,
    profile.diet,
    profile.foods_to_avoid,
    profile.activity_level,
    variation
  ].join('|'));

  const selections = DAYS.flatMap((day, dayIndex) => TYPES.map((mealType, typeIndex) => {
    const choices = accepted.filter(item => item.meal_type === mealType)
      .sort((a, b) => goalScore(b, profile) - goalScore(a, profile) || String(a.id).localeCompare(String(b.id)));
    const start = (profileSeed + stableHash(mealType) + typeIndex) % choices.length;
    const choice = choices[(start + dayIndex) % choices.length];
    return { day, mealType, choice };
  }));
  const averageBaseCalories = selections.reduce((total, item) => total + Number(item.choice.calories || 0), 0) / DAYS.length;
  const portions = Math.max(0.75, Math.min(2.5, targetCalories / Math.max(1, averageBaseCalories)));

  return selections.map(({ day, mealType, choice }) => {
    const ingredients = readJson(choice.ingredients);
    const steps = readJson(choice.steps);
    return [
      mealType,
      `${day}: ${choice.title}`,
      choice.description,
      Math.round(Number(choice.calories) * portions),
      { day, catalogId: choice.id, servings: Math.round(portions * 2) / 2, proteinG: Math.round(Number(choice.protein_g) * portions), carbsG: Math.round(Number(choice.carbs_g) * portions), fatsG: Math.round(Number(choice.fats_g) * portions), ingredients, steps }
    ];
  });
}

export function nutritionFromMenu(meals, profile) {
  const totals = meals.reduce((result, meal) => {
    const recipe = meal[4] || {};
    result.calories += Number(meal[3]) || 0;
    result.protein += Number(recipe.proteinG) || 0;
    result.carbs += Number(recipe.carbsG) || 0;
    result.fats += Number(recipe.fatsG) || 0;
    return result;
  }, { calories: 0, protein: 0, carbs: 0, fats: 0 });
  const daily = value => Math.round(value / DAYS.length);
  const messages = {
    'Ganar músculo': 'Tu alimentación y tus sesiones trabajan juntas. Sostén el ritmo con constancia.',
    'Perder grasa': 'La constancia y las porciones sostenibles construyen avances reales.',
    'Sentirme mejor': 'Comer suficiente, moverte y descansar también cuentan como progreso.'
  };
  return [daily(totals.calories), daily(totals.protein), daily(totals.carbs), daily(totals.fats), messages[profile.goal] || messages['Sentirme mejor']];
}
