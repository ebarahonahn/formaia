/* Bridges the UI to the Node/MySQL backend. Profile, plan and progress data stay only in memory. */
(() => {
  const apiUrl = window.FORMAIA_API_URL?.replace(/\/$/, '');
  const cacheKey = 'formaia-mvp-v3';
  const tokenKey = 'formaia-api-token';
  let memoryCache = { users: {}, session: null };
  let onboardingMemory = null;
  if (!apiUrl) return;
  sessionStorage.removeItem(cacheKey);
  sessionStorage.removeItem('formaia-api-onboarding');

  const notify = text => { const toast = document.querySelector('#toast'); toast.textContent = text; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3200); };
  const getCache = () => memoryCache;
  const saveCache = data => { memoryCache = data; const user = data.users?.[data.session]; if (user) window.FormaIAClientSession?.setUser(user); };
  const me = () => { const data = getCache(); return data.users[data.session] || null; };
  const onboardingDraft = () => onboardingMemory || { goal: 'Ganar músculo', age: '', heightCm: '', weightLb: '', sexForCalculation: 'Prefiero no decir', activityLevel: 'Moderada', level: 'Principiante', days: '3 días', time: '45 minutos', equipmentAccess: 'Gimnasio completo', limitations: '', diet: 'Flexible', avoid: '', targetCalories: '1800' };
  const saveDraft = patch => { onboardingMemory = { ...onboardingDraft(), ...patch }; };
  const planRequestTimeoutMs = 30000;
  const showPlanLoading = () => {
    document.querySelector('.plan-loading')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'plan-loading';
    overlay.innerHTML = '<div class="plan-loading-card" role="status" aria-live="polite"><span class="plan-loading-orb">✦</span><h2>FormaIA está creando tu plan.</h2><p>Estamos ajustando tus macros y rutinas. El menú semanal se selecciona desde nuestro catálogo hondureño.</p><div class="plan-loading-bar"><i></i></div><small>Esto normalmente toma solo unos segundos.</small></div>';
    document.body.append(overlay);
  };
  const hidePlanLoading = () => document.querySelector('.plan-loading')?.remove();
  const confirmWeeklyReview = () => new Promise(resolve => {
    document.querySelector('.plan-review-confirmation')?.remove();
    const dialog = document.createElement('div');
    dialog.className = 'plan-review-confirmation';
    dialog.innerHTML = `<section class="plan-review-dialog" role="dialog" aria-modal="true" aria-labelledby="plan-review-title" aria-describedby="plan-review-copy"><button class="plan-review-close" type="button" data-confirm-choice="cancel" aria-label="Cerrar aviso">×</button><span class="plan-review-icon" aria-hidden="true">!</span><span class="eyebrow">Antes de continuar</span><h2 id="plan-review-title">¿Qué deseas revisar?</h2><p id="plan-review-copy">Elige la parte del plan que quieres actualizar. La otra se conservará tal como está.</p><label class="plan-review-scope">Parte a revisar<select data-review-scope><option value="workouts">Solo entrenamiento</option><option value="nutrition">Solo alimentación</option><option value="all">Entrenamiento y alimentación</option></select></label><p class="plan-review-note">Tu historial de entrenamientos y avances ya guardados se conserva.</p><div class="plan-review-actions"><button class="btn outline" type="button" data-confirm-choice="cancel">Conservar mi plan</button><button class="btn lime" type="button" data-confirm-choice="confirm">Revisar selección</button></div></section>`;
    const close = choice => { document.removeEventListener('keydown', onKeyDown); dialog.remove(); resolve(choice); };
    const onKeyDown = event => { if (event.key === 'Escape') close(false); };
    dialog.addEventListener('click', event => {
      if (event.target === dialog) return close(false);
      const choice = event.target.closest('[data-confirm-choice]')?.dataset.confirmChoice;
      if (choice) close(choice === 'confirm' ? dialog.querySelector('[data-review-scope]')?.value || 'all' : null);
    });
    document.addEventListener('keydown', onKeyDown);
    document.body.append(dialog);
    requestAnimationFrame(() => dialog.querySelector('[data-confirm-choice="confirm"]')?.focus());
  });
  const confirmPlanReplacement = () => new Promise(resolve => {
    document.querySelector('.plan-review-confirmation')?.remove();
    const dialog = document.createElement('div');
    dialog.className = 'plan-review-confirmation';
    dialog.innerHTML = `<section class="plan-review-dialog" role="dialog" aria-modal="true" aria-labelledby="plan-replacement-title"><button class="plan-review-close" type="button" data-replacement-choice="cancel" aria-label="Cerrar aviso">×</button><span class="plan-review-icon" aria-hidden="true">!</span><span class="eyebrow">Antes de crear</span><h2 id="plan-replacement-title">¿Reemplazar tu plan actual?</h2><p>Se archivará el plan actual y el nuevo ciclo comenzará desde cero. Tus entrenamientos ya guardados se conservarán en el historial.</p><p class="plan-review-note">Para cambiar solo la alimentación sin reiniciar tus sesiones, usa “Revisar mi plan semanal” y elige “Solo alimentación”.</p><div class="plan-review-actions"><button class="btn outline" type="button" data-replacement-choice="cancel">Conservar mi plan</button><button class="btn lime" type="button" data-replacement-choice="confirm">Crear plan nuevo</button></div></section>`;
    const close = choice => { document.removeEventListener('keydown', onKeyDown); dialog.remove(); resolve(choice); };
    const onKeyDown = event => { if (event.key === 'Escape') close(false); };
    dialog.addEventListener('click', event => {
      if (event.target === dialog) return close(false);
      const choice = event.target.closest('[data-replacement-choice]')?.dataset.replacementChoice;
      if (choice) close(choice === 'confirm');
    });
    document.addEventListener('keydown', onKeyDown);
    document.body.append(dialog);
    requestAnimationFrame(() => dialog.querySelector('[data-replacement-choice="confirm"]')?.focus());
  });
  const api = async (path, options = {}) => {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    const token = sessionStorage.getItem(tokenKey);
    if (token) headers.Authorization = `Bearer ${token}`;
    const controller = options.signal ? null : new AbortController();
    const timeout = controller ? window.setTimeout(() => controller.abort(), planRequestTimeoutMs) : null;
    try {
      const response = await fetch(`${apiUrl}${path}`, { ...options, headers, signal: options.signal || controller?.signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(payload.error || 'No se pudo comunicar con el servidor.');
      return payload;
    } catch (error) {
      if (error?.name === 'AbortError') throw Error('El servidor tardó más de 30 segundos. Verifica tu panel antes de intentarlo nuevamente, porque el servidor podría haber terminado el cambio.');
      throw error;
    } finally { if (timeout) window.clearTimeout(timeout); }
  };
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const detailList = value => (Array.isArray(value) ? value : []).filter(Boolean).map(item => `<li>${escapeHtml(typeof item === 'string' ? item : item.name || item.title || item.ingredient || '')}</li>`).join('');
  const showPlanDetail = (plan, requestedDate = '') => {
    document.querySelector('.plan-detail-overlay')?.remove();
    const planDate = new Intl.DateTimeFormat('es-HN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(plan.createdAt));
    const executionDate = value => new Intl.DateTimeFormat('es-HN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
    const executionTime = seconds => `${Math.floor(Number(seconds || 0) / 60)} min ${Number(seconds || 0) % 60}s`;
    const isoDate = value => {
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
      const date = new Date(value);
      return Number.isNaN(date.valueOf()) ? '' : date.toISOString().slice(0, 10);
    };
    const activityDates = [...new Set([
      ...(plan.workouts || []).flatMap(workout => (workout.sessions || []).map(session => isoDate(session.completedOn))),
      ...(plan.meals || []).flatMap(meal => (meal.completions || []).map(completion => isoDate(completion.completedOn)))
    ].filter(Boolean))].sort().reverse();
    const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : activityDates[0] || isoDate(plan.createdAt) || new Date().toISOString().slice(0, 10);
    const workouts = (plan.workouts || []).map(workout => {
      const exerciseRows = Array.isArray(workout.exercises) ? workout.exercises : [];
      const exercises = exerciseRows.map((exercise, index) => {
        const value = Array.isArray(exercise) ? exercise : [exercise?.name || exercise?.title, exercise?.prescription || exercise?.sets, exercise?.duration];
        return `<li><b>${index + 1}. ${escapeHtml(value[0] || 'Ejercicio')}</b><span>${escapeHtml(value[1] || 'Series por definir')}${value[2] ? ` · ${escapeHtml(value[2])}` : ''}</span></li>`;
      }).join('') || '<li>Sin ejercicios registrados.</li>';
      const sessionsForDay = (workout.sessions || []).filter(session => isoDate(session.completedOn) === selectedDate);
      const completedSessions = sessionsForDay.filter(session => session.completedAt);
      const pendingSession = sessionsForDay.find(session => !session.completedAt);
      const execution = completedSessions.length ? `<details class="plan-detail-execution"><summary>✓ Realizada ${completedSessions.length === 1 ? '' : `${completedSessions.length} veces`}</summary>${completedSessions.map(session => { const sets = (session.sets || []).map(set => { const exercise = exerciseRows[set.exerciseIndex]; const title = Array.isArray(exercise) ? exercise[0] : exercise?.name || exercise?.title || `Ejercicio ${set.exerciseIndex + 1}`; const result = set.durationSeconds ? `${set.durationSeconds} s` : `${set.weightLb ?? '—'} lb × ${set.repetitions ?? '—'} reps`; return `<li><b>${escapeHtml(title)}</b> · serie ${set.setNumber}: ${escapeHtml(result)}</li>`; }).join('') || '<li>Sin series guardadas.</li>'; return `<div class="plan-detail-session"><b>${escapeHtml(executionDate(session.completedOn))}</b><span>${executionTime(session.durationSeconds)}</span><ul>${sets}</ul></div>`; }).join('')}</details>` : pendingSession ? '<p class="plan-detail-pending">◷ Rutina iniciada, aún no finalizada.</p>' : '<p class="plan-detail-pending">○ Aún no realizada.</p>';
      return `<article class="plan-detail-workout"><span>Rutina ${workout.sequenceNo}</span><h4>${escapeHtml(workout.title)}</h4><p>${escapeHtml(workout.subtitle || '')} · ${Number(workout.durationMinutes || 0)} min</p><ol>${exercises}</ol>${execution}</article>`;
    }).join('') || '<p class="plan-detail-empty">No hay rutinas registradas.</p>';
    const meals = (plan.meals || []).map(meal => {
      const recipe = meal.recipe || {};
      const ingredients = detailList(recipe.ingredients);
      const steps = detailList(recipe.steps);
      const completions = (meal.completions || []).filter(completion => isoDate(completion.completedOn) === selectedDate);
      const completion = completions.length ? `<details class="plan-detail-execution"><summary>✓ Completada ${completions.length === 1 ? '' : `${completions.length} veces`}</summary><ul>${completions.map(entry => `<li>${escapeHtml(executionDate(entry.completedOn))}</li>`).join('')}</ul></details>` : '<p class="plan-detail-pending">○ No marcada como completada.</p>';
      return `<article class="plan-detail-meal"><span>${escapeHtml(meal.mealType)} · ${Number(meal.calories || 0)} kcal${recipe.servings ? ` · ${escapeHtml(recipe.servings)} porción${Number(recipe.servings) === 1 ? '' : 'es'}` : ''}</span><h4>${escapeHtml(String(meal.title || '').replace(/^(Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo):\s*/, ''))}</h4>${meal.description ? `<p>${escapeHtml(meal.description)}</p>` : ''}${ingredients ? `<details><summary>Ingredientes</summary><ul>${ingredients}</ul></details>` : ''}${steps ? `<details><summary>Preparación</summary><ol>${steps}</ol></details>` : ''}${completion}</article>`;
    }).join('') || '<p class="plan-detail-empty">No hay comidas registradas.</p>';
    const dialog = document.createElement('div');
    dialog.className = 'plan-detail-overlay';
    dialog.innerHTML = `<section class="plan-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="plan-detail-title"><button class="plan-detail-close" type="button" aria-label="Cerrar detalle">×</button><span class="eyebrow">${plan.status === 'active' ? 'Plan actual' : 'Plan archivado'}</span><h2 id="plan-detail-title">Detalle del plan</h2><p class="plan-detail-date">${escapeHtml(planDate)} · ${Number(plan.calories || 0).toLocaleString('es-HN')} kcal diarias</p><div class="plan-detail-macros"><span><b>${Number(plan.protein || 0)}g</b> proteína</span><span><b>${Number(plan.carbs || 0)}g</b> carbos</span><span><b>${Number(plan.fats || 0)}g</b> grasas</span></div><label class="plan-detail-filter">Ver actividad del día<input type="date" value="${selectedDate}" data-plan-detail-date aria-label="Seleccionar fecha de actividad" /></label><p class="plan-detail-selected-date">Estados y registros del ${escapeHtml(executionDate(selectedDate))}</p><section class="plan-detail-section"><h3>Entrenamiento</h3><div class="plan-detail-workouts">${workouts}</div></section><section class="plan-detail-section"><h3>Alimentación</h3><div class="plan-detail-meals">${meals}</div></section></section>`;
    const close = () => { document.removeEventListener('keydown', onKeyDown); dialog.remove(); };
    const onKeyDown = event => { if (event.key === 'Escape') close(); };
    dialog.addEventListener('click', event => { if (event.target === dialog || event.target.closest('.plan-detail-close')) close(); });
    dialog.querySelector('[data-plan-detail-date]')?.addEventListener('change', event => showPlanDetail(plan, event.target.value));
    document.addEventListener('keydown', onKeyDown);
    document.body.append(dialog);
    requestAnimationFrame(() => dialog.querySelector('.plan-detail-close')?.focus());
  };
  const mealEmoji = type => ({ Desayuno: '🥣', Almuerzo: '🍗', Merienda: '🍍', Cena: '🫓' }[type] || '🍽️');
  const mediaUrl = value => {
    const url = String(value || '').trim();
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    return url.startsWith('/uploads/') ? `${apiUrl}${url}` : url;
  };
  const normalizeExerciseMedia = value => {
    if (!value || typeof value !== 'object') return null;
    return {
      ...value,
      cues: Array.isArray(value.cues) ? value.cues.filter(Boolean) : [],
      imageUrl: mediaUrl(value.imageUrl || value.image_url),
      videoUrl: mediaUrl(value.videoUrl || value.video_url)
    };
  };
  const normalizeExercises = raw => {
    let values = raw;
    if (typeof values === 'string') { try { values = JSON.parse(values); } catch { values = []; } }
    if (values && typeof values === 'object' && !Array.isArray(values)) values = Object.values(values);
    if (!Array.isArray(values)) return [];
    return values.map(value => {
      if (Array.isArray(value)) return [value[0] || 'Ejercicio', value[1] || 'Series por definir', value[2] || '—', normalizeExerciseMedia(value[3])];
      if (value && typeof value === 'object') return [value.name || value.title || 'Ejercicio', value.sets || value.detail || 'Series por definir', normalizeExerciseMedia(value.media || value)];
      return [String(value || 'Ejercicio'), 'Series por definir', '—', null];
    });
  };
  const mapPlan = server => !server ? null : ({ id: server.id, calories: server.calories, protein: server.protein, carbs: server.carbs, fats: server.fats, message: server.message, adjustment: server.adjustment || null, cycle: server.cycle || null, target: server.workouts.length, workouts: server.workouts.map(item => ({ id: item.id, title: item.title, subtitle: item.subtitle, minutes: `${item.duration_minutes} minutos`, scheduledOn: item.scheduledOn || item.scheduled_on || null, exercises: normalizeExercises(item.exercises) })), meals: server.meals.map(item => [mealEmoji(item.meal_type), item.meal_type, item.title, item.description, item.calories, item.recipe || null, { id: item.id, completedAt: item.completed_at || null, completedOn: item.completed_on || null, scheduledOn: item.scheduled_on || null, isToday: Boolean(item.is_today) }]) });
  const hydrate = async () => {
    const info = await api('/api/me');
    const [history, catalog, planHistory, branches, membershipAccess] = await Promise.all([api('/api/progress'), api('/api/meals/catalog'), api('/api/plans/history'), api('/api/branches'), api('/api/me/access')]);
    const data = getCache();
    const old = data.users[info.user.id] || {};
    const remoteProfile = info.profile ? { goal: info.profile.goal, level: info.profile.level, days: `${info.profile.days_per_week} días`, time: `${info.profile.minutes_per_session} minutos`, diet: info.profile.diet, avoid: info.profile.foods_to_avoid || '', targetCalories: info.profile.target_calories ?? '1800', age: info.profile.age ?? '', heightCm: info.profile.height_cm ?? '', weightLb: info.profile.weight_lb ?? '', sexForCalculation: info.profile.sex_for_calculation || 'Prefiero no decir', activityLevel: info.profile.activity_level || 'Moderada', equipmentAccess: info.profile.equipment_access || 'Gimnasio completo', homeBranchId: info.profile.home_branch_id || '', limitations: info.profile.limitations || '' } : null;
    data.users[info.user.id] = { ...old, ...info.user, password: '', cacheVersion: 14, membershipAccess, branches: branches.items || [], mealCatalog: catalog.items || [], equivalences: catalog.equivalences || [], planHistory: planHistory.items || [], profile: remoteProfile || old.profile || { goal: 'Sentirme mejor', level: 'Principiante', days: `${info.plan?.workouts.length || 3} días`, time: '45 minutos', diet: 'Flexible', avoid: '' }, plan: mapPlan(info.plan), workouts: history.workouts.map(item => ({ id: item.workout_id || item.completed_on, date: String(item.completed_on).slice(0, 10), workoutId: item.workout_id || '', startedAt: item.started_at || null, completedAt: item.completed_at || null, durationSeconds: item.duration_seconds || null })), workoutStats: Array.isArray(history.exerciseHistory) ? history.exerciseHistory : [], personalRecords: Array.isArray(history.personalRecords) ? history.personalRecords : [], progress: history.progress.map(item => ({ id: item.id, date: String(item.logged_on).slice(0, 10), weight: item.weight_lb, energy: item.energy, note: item.note, measurements: item.measurements || {}, photos: (item.photos || []).map(photo => ({ ...photo, url: String(photo.file_url || '').startsWith('http') ? photo.file_url : `${apiUrl}${photo.file_url || ''}` })) })) };
    data.session = info.user.id; saveCache(data); return data.users[info.user.id];
  };
  const todayRemoteWorkout = () => { const user = me(); const currentPlan = user?.plan; const list = currentPlan?.workouts || []; const date = new Date().toISOString().slice(0, 10); let override = null; try { override = JSON.parse(sessionStorage.getItem('formaia-today-workout-override') || 'null'); } catch {} if (override?.date === date) { const selected = list.find(item => item.id === override.workoutId); if (selected) return selected; } const scheduled = list.find(item => item.scheduledOn === date); if (scheduled) return scheduled; const trainingDays = { 3: [1, 3, 5], 4: [1, 2, 4, 6], 5: [1, 2, 3, 5, 6], 6: [1, 2, 3, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6] }; const workoutIndex = (trainingDays[list.length] || [1, 3, 5]).indexOf(new Date().getDay()); const defaultWorkout = workoutIndex < 0 ? null : list[workoutIndex] || null; return defaultWorkout?.scheduledOn ? null : defaultWorkout; };
  const completeRemoteWorkout = async () => { const workout = todayRemoteWorkout(); if (!workout?.id) throw Error('No encontramos la rutina de hoy para guardarla. Vuelve a abrir la rutina e inténtalo de nuevo.'); await api(`/api/workouts/${workout.id}/complete`, { method: 'POST', body: JSON.stringify(window.FormaIAWorkout?.snapshot?.() || {}) }); };
  const restoreActiveWorkout = async () => { if (!window.FormaIAWorkout?.restore) return; const active = await api('/api/workouts/active-session'); if (active.session && active.workoutId) { sessionStorage.setItem('formaia-today-workout-override', JSON.stringify({ date: new Date().toISOString().slice(0, 10), workoutId: active.workoutId })); window.FormaIAWorkout.selectWorkout?.(active.workoutId); window.FormaIAWorkout.restore(active.session); return; } const workout = todayRemoteWorkout(); if (!workout?.id) return; const result = await api(`/api/workouts/${workout.id}/session`); if (result.session) window.FormaIAWorkout.restore(result.session); };
  window.addEventListener('formaia:timer', event => { const workout = todayRemoteWorkout(); if (!workout?.id) return; api(`/api/workouts/${workout.id}/timer`, { method: 'POST', body: JSON.stringify(event.detail) }).catch(error => notify(error.message)); });

  document.addEventListener('click', async event => {
    const start = event.target.closest('[data-action="start"]');
      if (start && sessionStorage.getItem(tokenKey)) saveDraft({ goal: 'Ganar músculo', age: '', heightCm: '', weightLb: '', sexForCalculation: 'Prefiero no decir', activityLevel: 'Moderada', level: 'Principiante', days: '3 días', time: '45 minutos', equipmentAccess: 'Gimnasio completo', limitations: '', diet: 'Flexible', avoid: '', targetCalories: '1800' });
    const restart = event.target.closest('[data-action="restart"]');
    if (restart && sessionStorage.getItem(tokenKey)) {
      // La UI restaura estos datos en state.draft. El cliente del servidor usa
      // onboardingMemory al enviar el paso 4, así que ambos deben iniciar iguales.
      const profile = me()?.profile;
      if (profile) onboardingMemory = { ...onboardingDraft(), ...profile };
    }
    const planDetail = event.target.closest('[data-action="view-plan-detail"]');
    if (planDetail && sessionStorage.getItem(tokenKey)) {
      event.preventDefault(); event.stopImmediatePropagation();
      try { const result = await api(`/api/plans/${encodeURIComponent(planDetail.dataset.planId || '')}/detail`); showPlanDetail(result.plan); } catch (error) { notify(error.message); }
      return;
    }
    const choice = event.target.closest('[data-choice]');
    if (choice) saveDraft({ goal: choice.dataset.choice });
    const auth = event.target.closest('[data-action="submit-auth"]');
    if (auth) {
      event.preventDefault(); event.stopImmediatePropagation();
      const login = document.querySelector('[data-auth="name"]') === null;
      const email = document.querySelector('[data-auth="email"]')?.value || '';
      const password = document.querySelector('[data-auth="password"]')?.value || '';
      const name = document.querySelector('[data-auth="name"]')?.value || '';
      if (!/^\S+@\S+\.\S+$/.test(email) || (!login && (!name.trim() || password.length < 8 || !/\d/.test(password) || !/[^A-Za-z0-9\s]/.test(password)))) return notify('Completa tus datos. La contraseña debe tener al menos 8 caracteres, un número y un carácter especial.');
      try {
        const result = await api(login ? '/api/auth/login' : '/api/auth/register', { method: 'POST', body: JSON.stringify(login ? { email, password } : { name, email, password }) });
        sessionStorage.setItem(tokenKey, result.token); await hydrate();
      } catch (error) { notify(error.message); }
      return;
    }

    const saveProfile = event.target.closest('[data-action="save-profile"]');
    if (saveProfile) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (!sessionStorage.getItem(tokenKey)) { notify('Tu sesión con el servidor expiró. Pulsa Salir e inicia sesión nuevamente.'); return; }
      const existing = me()?.profile || {};
      const read = key => document.querySelector(`[data-profile-field="${key}"]`)?.value ?? '';
      const profile = { goal: existing.goal, level: existing.level, daysPerWeek: Number.parseInt(existing.days, 10), minutesPerSession: Number.parseInt(existing.time, 10), diet: existing.diet, foodsToAvoid: existing.avoid || '', targetCalories: Number(read('targetCalories')), age: Number(read('age')), heightCm: Number(read('heightCm')), weightLb: Number(read('weightLb')), sexForCalculation: read('sexForCalculation'), activityLevel: read('activityLevel'), equipmentAccess: read('equipmentAccess'), homeBranchId: read('homeBranchId') || existing.homeBranchId, limitations: read('limitations') };
      if (!profile.goal || !profile.level || !profile.daysPerWeek || !profile.minutesPerSession) { notify('Completa primero la evaluación para poder guardar estos datos.'); return; }
      try {
        await api('/api/me/profile', { method: 'PUT', body: JSON.stringify(profile) });
        const data = getCache(); const user = data.users[data.session];
        user.profile = { ...existing, targetCalories: profile.targetCalories, age: profile.age, heightCm: profile.heightCm, weightLb: profile.weightLb, sexForCalculation: profile.sexForCalculation, activityLevel: profile.activityLevel, equipmentAccess: profile.equipmentAccess, homeBranchId: profile.homeBranchId, limitations: profile.limitations };
        data.users[user.id] = user; saveCache(data); window.FormaIAClientSession?.navigate('profile');
      } catch (error) { notify(error.message); }
      return;
    }

    const saveHomeBranch = event.target.closest('[data-action="save-home-branch"]');
    if (saveHomeBranch) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (!sessionStorage.getItem(tokenKey)) { notify('Tu sesión con el servidor expiró. Pulsa Salir e inicia sesión nuevamente.'); return; }
      const homeBranchId = document.querySelector('[data-profile-home-branch]')?.value || '';
      if (!homeBranchId) { notify('Selecciona una sucursal principal.'); return; }
      saveHomeBranch.disabled = true;
      try {
        const result = await api('/api/me/home-branch', { method: 'PUT', body: JSON.stringify({ homeBranchId }) });
        const data = getCache(); const user = data.users[data.session];
        user.profile = { ...(user.profile || {}), homeBranchId: result.homeBranchId };
        data.users[user.id] = user; saveCache(data);
        notify('Sucursal principal actualizada. Tu plan actual se conserva.');
      } catch (error) { saveHomeBranch.disabled = false; notify(error.message); }
      return;
    }

    const generate = event.target.closest('[data-action="next"]');
    if (generate && generate.textContent.includes('Crear mi plan')) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (!sessionStorage.getItem(tokenKey)) { notify('Tu sesión con el servidor expiró. Pulsa Salir e inicia sesión nuevamente.'); return; }
      if (me()?.plan && !await confirmPlanReplacement()) return;
      try {
        const activeSession = await api('/api/workouts/active-session');
        if (activeSession.session) { notify('Tienes una rutina en curso. Termínala antes de crear otro plan para conservar tus series y tiempo.'); return; }
      } catch (error) { notify(error.message); return; }
      showPlanLoading();
      const draft = onboardingDraft();
      const read = key => document.querySelector(`[data-input="${key}"]`)?.value ?? draft[key] ?? '';
      const profile = { goal: draft.goal, level: read('level'), daysPerWeek: Number.parseInt(read('days'), 10), minutesPerSession: Number.parseInt(read('time'), 10), diet: read('diet'), foodsToAvoid: read('avoid'), targetCalories: Number(read('targetCalories')), age: Number(read('age')), heightCm: Number(read('heightCm')), weightLb: Number(read('weightLb')), sexForCalculation: read('sexForCalculation'), activityLevel: read('activityLevel'), equipmentAccess: read('equipmentAccess'), homeBranchId: read('homeBranchId') || draft.homeBranchId, limitations: read('limitations') };
      try {
        await api('/api/me/profile', { method: 'PUT', body: JSON.stringify(profile) });
        const result = await api('/api/plans/generate', { method: 'POST', body: '{}' });
        const data = getCache(); const user = data.users[data.session];
        user.profile = { goal: profile.goal, level: profile.level, days: `${profile.daysPerWeek} días`, time: `${profile.minutesPerSession} minutos`, diet: profile.diet, avoid: profile.foodsToAvoid, targetCalories: profile.targetCalories, age: profile.age, heightCm: profile.heightCm, weightLb: profile.weightLb, sexForCalculation: profile.sexForCalculation, activityLevel: profile.activityLevel, equipmentAccess: profile.equipmentAccess, homeBranchId: profile.homeBranchId, limitations: profile.limitations };
        user.plan = mapPlan(result.plan); data.users[user.id] = user; hidePlanLoading(); saveCache(data);
      } catch (error) { hidePlanLoading(); notify(error.message); }
      return;
    }

    const weeklyReview = event.target.closest('[data-action="weekly-review"]');
    if (weeklyReview) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (!sessionStorage.getItem(tokenKey)) { notify('Tu sesión con el servidor expiró. Pulsa Salir e inicia sesión nuevamente.'); return; }
      const reviewScope = await confirmWeeklyReview();
      if (!reviewScope) return;
      showPlanLoading();
      try {
        const result = await api('/api/plans/weekly-review', { method: 'POST', body: JSON.stringify({ scope: reviewScope }) });
        const data = getCache(); const user = data.users[data.session];
        user.plan = mapPlan(result.plan); data.users[user.id] = user; hidePlanLoading(); saveCache(data);
      } catch (error) { hidePlanLoading(); notify(error.message); }
      return;
    }
    const continuePlan = event.target.closest('[data-action="continue-plan"]');
    if (continuePlan) {
      event.preventDefault(); event.stopImmediatePropagation();
      showPlanLoading();
      try {
        const result = await api('/api/plans/active/continue', { method: 'POST', body: '{}' });
        const data = getCache(); const user = data.users[data.session];
        user.plan = mapPlan(result.plan); data.users[user.id] = user; hidePlanLoading(); saveCache(data);
      } catch (error) { hidePlanLoading(); notify(error.message); }
      return;
    }

    const shopping = event.target.closest('[data-action="shopping-list"]');
    if (shopping && sessionStorage.getItem(tokenKey)) { event.preventDefault(); api('/api/plans/active/shopping-list').then(result => window.dispatchEvent(new CustomEvent('formaia:shopping-list', { detail: result }))).catch(error => notify(error.message)); return; }
    const updateMeal = event.target.closest('[data-action="update-meal"]');
    if (updateMeal && sessionStorage.getItem(tokenKey)) { event.preventDefault(); event.stopImmediatePropagation(); const mealId = updateMeal.dataset.mealId; const catalogId = document.querySelector(`[data-meal-choice="${mealId}"]`)?.value || ''; const servings = Number(document.querySelector(`[data-meal-serving="${mealId}"]`)?.value || 1); api(`/api/plans/active/meals/${mealId}`, { method: 'PUT', body: JSON.stringify({ catalogId: catalogId || undefined, servings }) }).then(async result => { const data = getCache(); const user = data.users[data.session]; user.plan = mapPlan(result.plan); data.users[user.id] = user; saveCache(data); window.FormaIAClientSession?.navigate('nutrition'); }).catch(error => notify(error.message)); return; }
    const completeMeal = event.target.closest('[data-action="complete-meal"]');
    if (completeMeal && sessionStorage.getItem(tokenKey)) { event.preventDefault(); event.stopImmediatePropagation(); api(`/api/plans/active/meals/${completeMeal.dataset.mealId}/complete`, { method: 'POST', body: '{}' }).then(() => hydrate()).then(() => window.FormaIAClientSession?.navigate('nutrition')).catch(error => notify(error.message)); return; }
    const startWorkout = event.target.closest('[data-action="start-workout"]');
    if (startWorkout && sessionStorage.getItem(tokenKey)) { const workout = todayRemoteWorkout(); if (workout?.id) api(`/api/workouts/${workout.id}/start`, { method: 'POST', body: '{}' }).then(() => api(`/api/workouts/${workout.id}/session`)).then(session => { if (session.session) window.FormaIAWorkout?.restore?.(session.session); }).catch(error => notify(error.message)); }
    const saveSet = event.target.closest('[data-action="save-set"]');
    if (saveSet && sessionStorage.getItem(tokenKey)) {
      const exerciseIndex = Number(saveSet.dataset.exerciseIndex);
      const setNumber = Number(saveSet.dataset.setNumber);
      const root = saveSet.closest('[data-set-row]');
      const weightLb = root?.querySelector('[data-set-weight]')?.value || '';
      const repetitions = root?.querySelector('[data-set-repetitions]')?.value || '';
      const durationSeconds = root?.querySelector('[data-set-duration]')?.value || '';
      if (weightLb || repetitions || durationSeconds) setTimeout(async () => { try { const workout = todayRemoteWorkout(); if (workout?.id) { await api(`/api/workouts/${workout.id}/sets`, { method: 'POST', body: JSON.stringify({ exerciseIndex, setNumber, weightLb, repetitions, durationSeconds }) }); if (root) root.dataset.setConfirmed = 'true'; window.dispatchEvent(new CustomEvent('formaia:workout-sets-synced', { detail: { sets: [{ exerciseIndex, setNumber }] } })); } } catch (error) { notify(error.message); } }, 0);
    }
    const complete = event.target.closest('[data-action="complete"]');
    if (complete && sessionStorage.getItem(tokenKey)) {
      event.preventDefault(); event.stopImmediatePropagation(); complete.disabled = true;
      try {
        await completeRemoteWorkout();
        await hydrate();
        window.FormaIAClientSession?.navigate('workout');
        notify('Entrenamiento guardado en el servidor.');
      } catch (error) {
        complete.disabled = false;
        notify(error.message);
      }
      return;
    }
    const progress = event.target.closest('[data-action="save-progress"]');
    if (progress && sessionStorage.getItem(tokenKey)) setTimeout(async () => {
      const user = me(); const latest = user?.progress?.at(-1);
      const media = window.FormaIAProgressMedia?.consume?.() || { file: null, measurements: {} };
      if (!latest) return;
      try {
        const saved = await api('/api/progress', { method: 'POST', body: JSON.stringify({ weightLb: latest.weight, energy: latest.energy, note: latest.note, measurements: media.measurements || {} }) });
        if (media.file) {
          const dataUrl = await window.FormaIAProgressMedia.fileAsDataUrl(media.file);
          const photo = await api('/api/progress/photos', { method: 'POST', body: JSON.stringify({ progressId: saved.progressId, dataUrl }) });
          if (!photo.verified) throw Error('No fue posible verificar la foto en el servidor local.');
        }
        await hydrate();
        window.FormaIAClientSession?.navigate('progress-history');
        notify(media.file ? 'Avance y foto guardados en backend/uploads.' : 'Avance guardado.');
      } catch (error) { notify(error.message); }
    }, 0);
    const logout = event.target.closest('[data-action="logout"]');
    if (logout) { sessionStorage.removeItem(tokenKey); sessionStorage.removeItem('formaia-today-workout-override'); }
  }, true);

  document.addEventListener('change', event => {
    const field = event.target.closest('[data-input]');
    if (field) saveDraft({ [field.dataset.input]: field.value });
  }, true);

  const updateAuthNotice = () => {
    const notice = document.querySelector('.auth-card .notice');
    if (notice) notice.textContent = 'Tu cuenta, planes y avances se guardan en el servidor FormaIA.';
  };
  document.addEventListener('click', () => setTimeout(updateAuthNotice, 0));
  updateAuthNotice();
  api('/api/organization').then(result => {
    if (result.organization?.name) window.dispatchEvent(new CustomEvent('formaia:organization-branding', { detail: result.organization }));
  }).catch(() => {});
  // Siempre recupera una sesión sin finalizar: permite continuar tras recargar la página.
  if (sessionStorage.getItem(tokenKey)) {
    hydrate().then(restoreActiveWorkout).catch(() => {});
  }
})();
