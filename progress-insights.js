(() => {
  const apiUrl = window.FORMAIA_API_URL?.replace(/\/$/, '') || 'http://localhost:3000';
  const tokenKey = 'formaia-api-token';
  let reminderSettings = null;
  const deliveredReminders = new Set();
  let loading = false;

  const api = async (path, options = {}) => {
    const response = await fetch(`${apiUrl}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem(tokenKey)}`, ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(payload.error || 'No fue posible procesar la solicitud.');
    return payload;
  };
  const toast = message => {
    const node = document.querySelector('#toast');
    if (!node) return;
    node.textContent = message;
    node.classList.add('show');
    setTimeout(() => node.classList.remove('show'), 3000);
  };
  const number = value => Number(value || 0);
  const dateLabel = value => new Intl.DateTimeFormat('es-HN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
  const shortMonth = value => new Intl.DateTimeFormat('es-HN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}-01T12:00:00Z`));

  const lineChart = (entries, key, suffix = '') => {
    const values = entries.map(item => ({ date: item.date, value: Number(item[key]) })).filter(item => Number.isFinite(item.value) && item.value > 0);
    if (!values.length) return '<div class="insight-empty">Registra datos para empezar a ver tu tendencia.</div>';
    const min = Math.min(...values.map(item => item.value)), max = Math.max(...values.map(item => item.value));
    const points = values.map((item, index) => {
      const x = values.length === 1 ? 50 : 4 + index / (values.length - 1) * 92;
      const y = max === min ? 50 : 88 - (item.value - min) / (max - min) * 72;
      return `${x},${y}`;
    }).join(' ');
    const first = values[0], last = values.at(-1);
    return `<div class="insight-line-values"><b>${last.value.toLocaleString('es-HN')}${suffix}</b><span>${first.value === last.value ? 'sin cambio registrado' : `${first.value > last.value ? '↓' : '↑'} ${Math.abs(last.value - first.value).toFixed(1)}${suffix} desde ${dateLabel(first.date)}`}</span></div><svg class="insight-line" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Tendencia"><path d="M4 88H96" class="insight-gridline"></path><polyline points="${points}" class="insight-path"></polyline>${values.map((item, index) => { const [x, y] = points.split(' ')[index].split(','); return `<circle cx="${x}" cy="${y}" r="2.6"><title>${dateLabel(item.date)}: ${item.value}${suffix}</title></circle>`; }).join('')}</svg>`;
  };
  const bars = (entries, label, key = 'sessions', suffix = '') => {
    if (!entries.length) return '<div class="insight-empty">Aún no hay suficientes registros.</div>';
    const maximum = Math.max(...entries.map(item => number(item[key])), 1);
    return `<div class="insight-bars">${entries.slice(-8).map(item => `<div><i style="--height:${Math.max(8, Math.round(number(item[key]) / maximum * 100))}%"><span>${number(item[key]).toLocaleString('es-HN')}${suffix}</span></i><small>${label(item)}</small></div>`).join('')}</div>`;
  };
  const measurements = entries => {
    const keys = [['waist', 'Cintura'], ['hip', 'Cadera'], ['chest', 'Pecho']];
    const cards = keys.map(([key, label]) => {
      const series = entries.map(item => ({ date: item.date, value: Number(item.measurements?.[key]) })).filter(item => Number.isFinite(item.value) && item.value > 0);
      if (!series.length) return `<div class="measurement-insight"><b>${label}</b><span>Aún sin registros</span></div>`;
      const first = series[0].value, last = series.at(-1).value;
      return `<div class="measurement-insight"><b>${label}</b><strong>${last}″</strong><span>${first === last ? 'Sin cambio aún' : `${last < first ? '↓' : '↑'} ${Math.abs(last - first).toFixed(1)}″`}</span></div>`;
    }).join('');
    return `<div class="measurement-insights">${cards}</div>`;
  };
  const progressBar = (value, target) => `<div class="mini-progress"><i style="width:${Math.min(100, Math.round(number(value) / Math.max(1, number(target)) * 100))}%"></i></div>`;
  const render = data => {
    const nutrition = Object.entries(data.weekly.nutrition || {}).map(([key, value]) => `${key}: ${value}`).join(' · ') || 'Sin registro';
    const unlocked = data.achievements.filter(item => item.unlocked).length;
    const month = shortMonth(data.monthly.month);
    return `<section class="progress-insights" data-progress-insights><header><div><span class="eyebrow">Progreso a largo plazo</span><h2>Datos que cuentan tu historia.</h2><p>La tendencia es más útil que un solo día. Tus datos se guardan en tu cuenta FormaIA.</p></div></header><div class="progress-insight-grid"><article class="card insight-card"><span class="card-label">Peso · últimos 90 días</span><h3>Tu tendencia</h3>${lineChart(data.weights, 'weightLb', ' lb')}</article><article class="card insight-card"><span class="card-label">Medidas registradas</span><h3>Centímetros que cambian</h3>${measurements(data.weights)}</article><article class="card insight-card"><span class="card-label">Volumen levantado</span><h3>Trabajo acumulado</h3>${bars(data.volume, item => dateLabel(item.date), 'volumeLb', ' lb')}</article><article class="card insight-card"><span class="card-label">Constancia · 12 semanas</span><h3>Sesiones por semana</h3>${bars(data.consistency, item => dateLabel(item.weekStart), 'sessions')}</article></div><section class="weekly-summary"><div><span class="eyebrow">Resumen de los últimos 7 días</span><h2>Tu semana, en una mirada.</h2><p>${data.weekly.recommendation}</p></div><div class="weekly-summary-stats"><span><b>${data.weekly.sessions}</b> sesiones</span><span><b>${data.weekly.durationMinutes}</b> min entrenando</span><span><b>${data.weekly.energy}</b> energía</span><span><b>${nutrition}</b> adherencia</span></div></section><div class="progress-insight-grid bottom"><article class="card monthly-goals"><span class="card-label">Meta de ${month}</span><h3>Pequeños hitos mensuales</h3><div class="goal-row"><span>Sesiones <b>${data.monthly.sessions}/${data.monthly.goal.sessionsTarget}</b></span>${progressBar(data.monthly.sessions, data.monthly.goal.sessionsTarget)}</div><div class="goal-row"><span>Avances <b>${data.monthly.progressEntries}/${data.monthly.goal.progressTarget}</b></span>${progressBar(data.monthly.progressEntries, data.monthly.goal.progressTarget)}</div><div class="goal-editor"><label>Sesiones<input data-monthly-sessions type="number" min="1" max="31" value="${data.monthly.goal.sessionsTarget}"></label><label>Registros<input data-monthly-progress type="number" min="1" max="31" value="${data.monthly.goal.progressTarget}"></label><label>Peso meta (lb)<input data-monthly-weight type="number" min="70" max="500" step="0.1" value="${data.monthly.goal.weightTargetLb ?? ''}" placeholder="Opcional"></label><button class="btn outline" data-save-monthly-goals>Guardar metas</button></div></article><article class="card achievements-card"><span class="card-label">Logros personales</span><h3>${unlocked} de ${data.achievements.length} desbloqueados</h3><div class="achievement-list">${data.achievements.map(item => `<div class="${item.unlocked ? 'unlocked' : ''}"><i>${item.unlocked ? '✓' : '○'}</i><span><b>${item.title}</b><small>${item.detail}</small></span></div>`).join('')}</div></article></div><article class="card reminder-card"><div><span class="card-label">Recordatorios</span><h3>Haz que el plan te acompañe.</h3><p>Los avisos del navegador funcionan mientras FormaIA esté abierta. Puedes desactivarlos cuando quieras.</p></div><div class="reminder-controls"><label><input data-reminder-workout type="checkbox" ${data.reminders.workoutEnabled ? 'checked' : ''}> Rutina <input data-reminder-workout-time type="time" value="${data.reminders.workoutTime}"></label><label><input data-reminder-meal type="checkbox" ${data.reminders.mealEnabled ? 'checked' : ''}> Comida <input data-reminder-meal-time type="time" value="${data.reminders.mealTime}"></label><label><input data-reminder-weighin type="checkbox" ${data.reminders.weighinEnabled ? 'checked' : ''}> Peso <select data-reminder-weighin-day>${['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'].map((day, index) => `<option value="${index}" ${index === data.reminders.weighinWeekday ? 'selected' : ''}>${day}</option>`).join('')}</select><input data-reminder-weighin-time type="time" value="${data.reminders.weighinTime}"></label><div class="reminder-actions"><button class="btn outline" data-enable-browser-reminders>Permitir avisos</button><button class="btn lime" data-save-reminders>Guardar recordatorios</button></div></div></article></section>`;
  };
  const load = async () => {
    const anchor = document.querySelector('.goal-summary');
    if (!anchor || anchor.dataset.insightsMounted || loading || !sessionStorage.getItem(tokenKey)) return;
    loading = true; anchor.dataset.insightsMounted = 'loading';
    try {
      const data = await api('/api/progress/insights');
      if (!anchor.isConnected) return;
      reminderSettings = data.reminders;
      anchor.insertAdjacentHTML('afterend', render(data));
      anchor.dataset.insightsMounted = 'true';
    } catch (error) {
      delete anchor.dataset.insightsMounted;
    } finally { loading = false; }
  };
  const readReminders = () => ({ workoutEnabled: document.querySelector('[data-reminder-workout]')?.checked, workoutTime: document.querySelector('[data-reminder-workout-time]')?.value, mealEnabled: document.querySelector('[data-reminder-meal]')?.checked, mealTime: document.querySelector('[data-reminder-meal-time]')?.value, weighinEnabled: document.querySelector('[data-reminder-weighin]')?.checked, weighinWeekday: Number(document.querySelector('[data-reminder-weighin-day]')?.value), weighinTime: document.querySelector('[data-reminder-weighin-time]')?.value, browserEnabled: window.Notification?.permission === 'granted' });
  document.addEventListener('click', async event => {
    const goals = event.target.closest('[data-save-monthly-goals]');
    if (goals) { try { await api('/api/progress/goals', { method: 'PUT', body: JSON.stringify({ sessionsTarget: Number(document.querySelector('[data-monthly-sessions]')?.value), progressTarget: Number(document.querySelector('[data-monthly-progress]')?.value), weightTargetLb: document.querySelector('[data-monthly-weight]')?.value || null }) }); toast('Metas mensuales guardadas.'); } catch (error) { toast(error.message); } return; }
    const permission = event.target.closest('[data-enable-browser-reminders]');
    if (permission) { if (!('Notification' in window)) return toast('Este navegador no admite avisos.'); const result = await Notification.requestPermission(); toast(result === 'granted' ? 'Avisos del navegador activados.' : 'No se concedió permiso para avisos.'); return; }
    const reminders = event.target.closest('[data-save-reminders]');
    if (reminders) { try { reminderSettings = await api('/api/progress/reminders', { method: 'PUT', body: JSON.stringify(readReminders()) }).then(result => result.settings); toast('Recordatorios guardados.'); } catch (error) { toast(error.message); } }
  });
  const checkReminders = () => {
    if (!reminderSettings || !reminderSettings.browserEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
    const now = new Date(), time = now.toTimeString().slice(0, 5), date = now.toISOString().slice(0, 10);
    const notify = (type, scheduledTime, title, body) => { const key = `formaia-reminder-${date}-${type}`; if (deliveredReminders.has(key) || time !== scheduledTime) return; deliveredReminders.add(key); new Notification(title, { body }); };
    if (reminderSettings.workoutEnabled) notify('workout', reminderSettings.workoutTime, 'FormaIA · Rutina', 'Es un buen momento para tu rutina de hoy.');
    if (reminderSettings.mealEnabled) notify('meal', reminderSettings.mealTime, 'FormaIA · Alimentación', 'Revisa la próxima comida de tu plan.');
    if (reminderSettings.weighinEnabled && now.getDay() === Number(reminderSettings.weighinWeekday)) notify('weighin', reminderSettings.weighinTime, 'FormaIA · Registro', 'Registra tu peso o energía para seguir tu avance.');
  };
  new MutationObserver(load).observe(document.querySelector('#app'), { childList: true, subtree: true });
  setInterval(checkReminders, 30000);
  load();
})();
