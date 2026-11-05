const clean = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Amounts describe one planned serving. The final value converts to the retail
// presentation used by the price catalog (cooked cups to dry pounds, for example).
const portions = [
  ['tortilla', 'tortilla', 'Tortillas de maíz', 2, 'unidades', 'Granos y básicos', 1], ['arroz', 'arroz', 'Arroz', .75, 'tazas cocidas', 'Granos y básicos', 1 / 2.5], ['frijol', 'frijoles', 'Frijoles rojos', .5, 'tazas cocidas', 'Granos y básicos', 1 / 2.25],
  ['platano', 'platano', 'Plátano maduro', 1, 'unidad', 'Frutas y vegetales', 1], ['banano', 'banano', 'Banano', 1, 'unidad', 'Frutas y vegetales', 1], ['pollo', 'pollo', 'Pollo', 150, 'g', 'Proteínas', 1 / 453.592], ['huevo', 'huevos', 'Huevos', 2, 'unidades', 'Proteínas', 1],
  ['avena', 'avena', 'Avena', .5, 'tazas', 'Granos y básicos', 1 / 4.5], ['queso', 'queso', 'Queso fresco', 45, 'g', 'Lácteos', 1 / 453.592], ['yogur', 'yogur', 'Yogur natural', 1, 'taza', 'Lácteos', .237], ['papaya', 'papaya', 'Papaya', 1, 'taza', 'Frutas y vegetales', .35],
  ['aguacate', 'aguacate', 'Aguacate', .5, 'unidad', 'Frutas y vegetales', 1], ['camote', 'camote', 'Camote', 1, 'unidad', 'Frutas y vegetales', 1], ['yuca', 'yuca', 'Yuca', 1, 'taza', 'Frutas y vegetales', .4], ['tilapia', 'tilapia', 'Tilapia', 150, 'g', 'Proteínas', 1 / 453.592], ['atun', 'atun', 'Atún en agua', 1, 'lata', 'Proteínas', 1]
];

export const localEquivalences = [
  ['2 tortillas de maíz', '≈ ¾ taza de arroz cocido'], ['½ taza de frijoles', '≈ 1 porción de proteína vegetal'], ['1 banano mediano', '≈ 1 taza de fruta'], ['150 g de pollo', '≈ una palma de proteína'], ['2 huevos', '≈ una porción práctica de proteína'], ['½ taza de avena seca', '≈ 1 taza cocida']
].map(([from, to]) => ({ from, to }));

const roundUp = (value, step = 1) => Math.ceil((value - 1e-9) / step) * step;

export function shoppingList(meals, priceRows = []) {
  const priceByKey = new Map(priceRows.map(row => [row.ingredient_key, row])); const grouped = new Map();
  for (const meal of meals) {
    const recipe = meal.recipe || {}; const servings = Math.max(.5, Number(recipe.servings || 1));
    for (const ingredient of recipe.ingredients || []) {
      const found = portions.find(([term]) => clean(String(ingredient)).includes(term)); if (!found) continue;
      const [, key, label, amount, unit, category, conversion] = found; const current = grouped.get(key) || { key, ingredient: label, quantity: 0, unit, purchaseNeeded: 0, category };
      current.quantity += amount * servings; current.purchaseNeeded += amount * servings * conversion; grouped.set(key, current);
    }
  }
  return [...grouped.values()].map(item => {
    const price = priceByKey.get(item.key); if (!price) return { ...item, quantity: Math.round(item.quantity * 10) / 10, estimatedHnl: 0, unavailablePrice: true };
    const packages = roundUp(item.purchaseNeeded / Number(price.quantity_per_purchase), Number(price.purchase_step || 1));
    return { ...item, quantity: Math.round(item.quantity * 10) / 10, purchaseQuantity: Math.round(packages * 100) / 100, purchaseUnit: price.purchase_unit, pricePerPurchaseHnl: Number(price.price_hnl), estimatedHnl: Math.round(packages * Number(price.price_hnl)), marketScope: price.market_scope, sourceName: price.source_name, sourceUrl: price.source_url, checkedOn: price.checked_on };
  }).sort((a, b) => a.category.localeCompare(b.category, 'es') || a.ingredient.localeCompare(b.ingredient, 'es'));
}

export function recipeSubstitutions(recipe) {
  const text = (recipe.ingredients || []).join(' ').toLowerCase(); const options = [];
  if (/tortilla|arroz/.test(text)) options.push('2 tortillas de maíz ↔ ¾ taza de arroz cocido'); if (/frijol/.test(text)) options.push('½ taza de frijoles ↔ 1 huevo + una tortilla, según disponibilidad'); if (/pollo|tilapia|atun/.test(text)) options.push('150 g de pollo, tilapia o atún en agua ↔ una palma de proteína'); if (/banano|papaya|platano/.test(text)) options.push('1 taza de fruta de temporada ↔ 1 banano mediano'); if (/avena/.test(text)) options.push('½ taza de avena seca ↔ 2 tortillas de maíz para una opción salada');
  return options;
}
