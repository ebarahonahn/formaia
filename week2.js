/* Week 2 UX layer: interaction safeguards and richer detail views without dependencies. */
(() => {
  const app = document.querySelector('#app');
  const toast = message => {
    const node = document.querySelector('#toast');
    node.textContent = message;
    node.classList.add('show');
    setTimeout(() => node.classList.remove('show'), 3000);
  };
  const activeUser = () => window.FormaIAClientSession?.user?.() || null;
  const confirmedSets = new Set();
  const setKey = (exerciseIndex, setNumber) => `${Number(exerciseIndex)}:${Number(setNumber)}`;

  const recipes = {
    'Avena, banano y huevo': { ingredients: ['½ taza de avena', '1 banano', '2 huevos', '1 taza de leche o agua', 'Canela al gusto'], steps: ['Cocina la avena con la leche o agua y canela.', 'Sirve con el banano en rodajas.', 'Acompaña con los huevos revueltos.'] },
    'Pollo, arroz y frijoles': { ingredients: ['120 g de pollo', '¾ taza de arroz cocido', '½ taza de frijoles', 'Ensalada de repollo y tomate', 'Limón y especias'], steps: ['Sazona y cocina el pollo a la plancha.', 'Calienta arroz y frijoles.', 'Sirve con ensalada fresca y limón.'] },
    'Yogur natural con papaya': { ingredients: ['1 yogur natural', '1 taza de papaya', '2 cucharadas de avena'], steps: ['Corta la papaya.', 'Mezcla con el yogur.', 'Termina con avena tostada.'] },
    'Tortillas con huevo y queso': { ingredients: ['2 tortillas de maíz', '2 huevos', '¼ taza de frijoles', '30 g de queso fresco', '¼ de aguacate'], steps: ['Calienta las tortillas y los frijoles.', 'Prepara los huevos al gusto.', 'Arma el plato con queso y aguacate.'] },
    'Avena, banano y maní': { ingredients: ['½ taza de avena', '1 banano', '1 cucharada de maní', '1 taza de leche'], steps: ['Cocina la avena con leche.', 'Añade banano en rodajas.', 'Termina con maní troceado.'] },
    'Arroz, frijoles y queso fresco': { ingredients: ['¾ taza de arroz', '½ taza de frijoles', '40 g de queso fresco', 'Ensalada local'], steps: ['Calienta el arroz y los frijoles.', 'Añade queso fresco.', 'Sirve con ensalada de temporada.'] },
    'Tortillas con huevo y aguacate': { ingredients: ['2 tortillas de maíz', '2 huevos', '¼ taza de frijoles', '¼ de aguacate'], steps: ['Calienta las tortillas.', 'Cocina los huevos.', 'Sirve con frijoles y aguacate.'] }
  };

  function showRecipe(title, catalogRecipe) {
    const recipe = catalogRecipe?.ingredients?.length && catalogRecipe?.steps?.length ? catalogRecipe : recipes[title];
    if (!recipe) return toast('La receta estará disponible pronto.');
    document.querySelector('.recipe-modal')?.remove();
    const modal = document.createElement('section');
    modal.className = 'recipe-modal';
    modal.innerHTML = `<div class="recipe-sheet" role="dialog" aria-modal="true" aria-labelledby="recipe-title"><button class="modal-close" aria-label="Cerrar receta">×</button><span class="eyebrow">Receta local</span><h2 id="recipe-title">${title}</h2><h3>Ingredientes</h3><ul>${recipe.ingredients.map(item => `<li>${item}</li>`).join('')}</ul><h3>Preparación</h3><ol>${recipe.steps.map(item => `<li>${item}</li>`).join('')}</ol><button class="btn lime full recipe-done">Listo, la preparo</button></div>`;
    document.body.append(modal);
    modal.querySelectorAll('.modal-close, .recipe-done').forEach(button => button.onclick = () => modal.remove());
  }

  function addDashboardNudge() {
    const grid = document.querySelector('.dashboard-grid');
    if (!grid || document.querySelector('.daily-nudge')) return;
    const user = activeUser();
    const done = user?.workouts?.some(item => item.date === new Date().toISOString().slice(0, 10));
    const nudge = document.createElement('div');
    nudge.className = 'daily-nudge';
    nudge.innerHTML = done ? '<span>✓</span><p><b>Entrenamiento registrado.</b> Date unos minutos para hidratarte y recuperarte.</p>' : '<span>◷</span><p><b>Tu siguiente paso:</b> reserva un espacio de tu día para completar la rutina.</p>';
    grid.after(nudge);
  }

  function addRecipeIndexes() {
    const user = activeUser();
    if (!user?.plan?.meals) return;
    document.querySelectorAll('.meal').forEach((meal, index) => {
      const button = meal.querySelector('[data-action="recipe"]');
      if (button) { button.dataset.recipeTitle = user.plan.meals[index]?.[2] || ''; button.dataset.recipeIndex = String(index); }
    });
  }

  function addWorkoutChecks() {
    const exercises = [...document.querySelectorAll('.exercise')];
    if (!exercises.length) return;
    const completed = Boolean(document.querySelector('.completion-note'));
    exercises.forEach((exercise, index) => {
      const exerciseIndex = Number(exercise.dataset.exerciseIndex ?? index);
      const rows = [...exercise.querySelectorAll('[data-set-row]')];
      const totalSets = rows.length;
      const savedSets = rows.filter(row => {
        const button = row.querySelector('[data-set-number]');
        return button && (row.classList.contains('is-saved') || row.dataset.setConfirmed === 'true' || confirmedSets.has(setKey(exerciseIndex, button.dataset.setNumber)));
      }).length;
      const exerciseComplete = completed || (totalSets > 0 && savedSets === totalSets);
      const button = exercise.querySelector('.exercise-check') || document.createElement('button');
      button.className = `exercise-check ${exerciseComplete ? 'checked' : ''}`;
      button.dataset.exerciseIndex = exerciseIndex;
      button.type = 'button';
      button.disabled = true;
      button.setAttribute('aria-label', exerciseComplete ? `Ejercicio ${index + 1} completado` : `Ejercicio ${index + 1}: ${savedSets} de ${totalSets} series guardadas`);
      button.title = exerciseComplete ? 'Ejercicio completado' : `${savedSets} de ${totalSets} series guardadas`;
      button.textContent = exerciseComplete ? '✓' : '';
      if (!button.isConnected) exercise.append(button);
    });
  }

  function addProgressHistory() {
    const summary = document.querySelector('.goal-summary');
    const user = activeUser();
    if (!summary || !user?.progress?.length || document.querySelector('.progress-history')) return;
    const history = document.createElement('section');
    history.className = 'progress-history';
    history.innerHTML = `<span class="card-label">Registros recientes</span>${user.progress.slice(-3).reverse().map(item => `<article><b>${item.date}</b><span>${item.weight ? `${item.weight} lb · ` : ''}${item.energy || 'Energía sin registrar'}</span><p>${item.note || 'Sin nota adicional.'}</p></article>`).join('')}`;
    summary.after(history);
  }

  function enhance() {
    addDashboardNudge();
    addRecipeIndexes();
    addWorkoutChecks();
    addProgressHistory();
  }

  window.addEventListener('formaia:workout-sets-synced', event => {
    const detail = event.detail || {};
    if (detail.reset) confirmedSets.clear();
    for (const item of detail.sets || []) {
      const exerciseIndex = item.exerciseIndex ?? item.exercise_index;
      const setNumber = item.setNumber ?? item.set_number;
      if (Number.isInteger(Number(exerciseIndex)) && Number.isInteger(Number(setNumber))) confirmedSets.add(setKey(exerciseIndex, setNumber));
    }
    addWorkoutChecks();
    window.setTimeout(addWorkoutChecks, 0);
  });

  document.addEventListener('click', event => {
    const saveSet = event.target.closest('[data-action="save-set"]');
    if (saveSet) window.setTimeout(addWorkoutChecks, 0);

    const recipe = event.target.closest('[data-action="recipe"]');
    if (recipe) { event.preventDefault(); event.stopImmediatePropagation(); const meal = activeUser()?.plan?.meals?.[Number(recipe.dataset.recipeIndex)]; showRecipe(recipe.dataset.recipeTitle, meal?.[5]); return; }

    const complete = event.target.closest('[data-action="complete"]');
    if (complete) {
      const incomplete = [...document.querySelectorAll('.exercise-check')].filter(button => !button.classList.contains('checked'));
      if (incomplete.length) {
        event.preventDefault(); event.stopImmediatePropagation();
        toast(`Guarda todas las series antes de finalizar. Faltan ${incomplete.length} ejercicio${incomplete.length === 1 ? '' : 's'}.`);
      }
      return;
    }

    const auth = event.target.closest('[data-action="submit-auth"]');
    if (auth) {
      const email = document.querySelector('[data-auth="email"]')?.value.trim() || '';
      if (!/^\S+@\S+\.\S+$/.test(email)) { event.preventDefault(); event.stopImmediatePropagation(); toast('Escribe un correo electrónico válido.'); }
      return;
    }

    const saveProgress = event.target.closest('[data-action="save-progress"]');
    if (saveProgress) {
      const weight = document.querySelector('[data-progress="weight"]')?.value;
      const note = document.querySelector('[data-progress="note"]')?.value.trim();
      if ((!weight && !note) || (weight && (Number(weight) < 70 || Number(weight) > 500))) {
        event.preventDefault(); event.stopImmediatePropagation();
        toast(!weight && !note ? 'Agrega una medida o una nota para guardar tu avance.' : 'Ingresa un peso válido entre 70 y 500 lb.');
      }
    }
  }, true);

  // Run enhancements after UI actions instead of observing every DOM mutation.
  // This prevents redraw cycles in browsers with responsive-device emulation enabled.
  document.addEventListener('click', () => setTimeout(enhance, 0));
  enhance();
})();
