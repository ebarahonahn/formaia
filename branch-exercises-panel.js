(() => {
  const apiUrl = window.FORMAIA_API_URL?.replace(/\/$/, '') || 'http://localhost:3000';
  const tokenKey = 'formaia-api-token';
  let branchId = null, branchName = '', exercises = [];

  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const api = async (path, options = {}) => {
    const response = await fetch(`${apiUrl}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem(tokenKey)}`, ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(payload.error || 'No fue posible procesar la solicitud.');
    return payload;
  };
  const toast = message => { const target = document.querySelector('#toast'); if (!target) return; target.textContent = message; target.classList.add('show'); setTimeout(() => target.classList.remove('show'), 2800); };

  const decorateBranchTable = () => {
    const section = document.querySelector('[data-admin-section="branches"]');
    const table = section?.querySelector('table');
    if (!table || table.dataset.exercisesEnhanced) return;
    table.dataset.exercisesEnhanced = 'true';
    table.querySelector('thead tr')?.insertAdjacentHTML('beforeend', '<th>Ejercicios</th>');
    [...table.querySelectorAll('tbody tr')].forEach(row => {
      const branchEdit = row.querySelector('[data-admin-branch-edit]');
      if (!branchEdit) return;
      const name = row.cells[0]?.textContent?.trim() || 'Sucursal';
      row.insertAdjacentHTML('beforeend', `<td><button class="admin-edit" type="button" data-branch-exercises="${escape(branchEdit.dataset.adminBranchEdit)}" data-branch-name="${escape(name)}">Ejercicios</button></td>`);
    });
  };

  const render = () => {
    const existing = document.querySelector('.branch-exercises-modal');
    if (!branchId) { existing?.remove(); return; }
    const rows = exercises.map(item => {
      const globallyActive = Number(item.is_active) !== 0;
      return `<tr data-branch-exercise-row>
        <td data-label="Ejercicio"><b>${escape(item.name)}</b>${globallyActive ? '' : '<small class="admin-tag-empty">Inactivo en catálogo maestro</small>'}</td>
        <td data-label="Nivel">${escape(item.level)}</td>
        <td data-label="Equipo">${escape(item.equipment)}</td>
        <td data-label="Disponible"><label class="admin-meal-toggle"><input type="checkbox" name="isEnabled" ${Number(item.is_enabled) ? 'checked' : ''} ${globallyActive ? '' : 'disabled'}> ${Number(item.is_enabled) ? 'Habilitado' : 'Deshabilitado'}</label></td>
        <td data-label="Prescripción local"><input name="localPrescription" maxlength="90" value="${escape(item.local_prescription || '')}" placeholder="Usar prescripción del catálogo" ${globallyActive ? '' : 'disabled'}></td>
        <td data-label="Acción"><button class="admin-edit" type="button" data-save-branch-exercise="${escape(item.id)}" ${globallyActive ? '' : 'disabled'}>Guardar</button></td>
      </tr>`;
    }).join('');
    const modal = document.createElement('div');
    modal.className = 'admin-meal-modal branch-exercises-modal';
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', `Ejercicios disponibles en ${branchName}`);
    modal.innerHTML = `<button class="admin-meal-modal-backdrop" type="button" data-branch-exercises-close aria-label="Cerrar"></button><div class="admin-meal-modal-card">
      <section class="admin-meal-form">
        <div class="admin-meal-form-head"><div><span class="eyebrow">Sucursal</span><h3>Ejercicios disponibles · ${escape(branchName)}</h3><p>Deshabilita ejercicios que no se puedan realizar en esta sede. Una prescripción local reemplaza la del catálogo solo para planes nuevos de esta sucursal.</p></div><button class="admin-form-close" type="button" data-branch-exercises-close aria-label="Cerrar">×</button></div>
        <div class="admin-table-controls"><input type="search" data-branch-exercise-search placeholder="Buscar ejercicio o equipo" aria-label="Buscar ejercicio o equipo"><span data-branch-exercise-count></span></div>
        <div class="admin-table-wrap"><table><thead><tr><th>Ejercicio</th><th>Nivel</th><th>Equipo</th><th>Disponible</th><th>Prescripción local</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="6">No hay ejercicios en el catálogo.</td></tr>'}</tbody></table></div>
      </section>
    </div>`;
    existing?.replaceWith(modal) || document.body.append(modal);
    const search = modal.querySelector('[data-branch-exercise-search]');
    const count = modal.querySelector('[data-branch-exercise-count]');
    const applySearch = () => {
      const term = search.value.trim().toLocaleLowerCase('es');
      const rows = [...modal.querySelectorAll('[data-branch-exercise-row]')];
      const matches = rows.filter(row => !term || row.textContent.toLocaleLowerCase('es').includes(term));
      rows.forEach(row => { row.hidden = !matches.includes(row); });
      count.textContent = `${matches.length} de ${rows.length}`;
    };
    search.addEventListener('input', applySearch); applySearch();
  };
  const refresh = async () => { const result = await api(`/api/admin/branches/${encodeURIComponent(branchId)}/exercises`); exercises = result.items || []; render(); };
  const open = async (id, name) => { branchId = id; branchName = name; try { await refresh(); } catch (error) { branchId = null; toast(error.message); } };
  const close = () => { branchId = null; branchName = ''; exercises = []; document.querySelector('.branch-exercises-modal')?.remove(); };

  document.addEventListener('click', async event => {
    const openButton = event.target.closest('[data-branch-exercises]');
    if (openButton) { event.preventDefault(); await open(openButton.dataset.branchExercises, openButton.dataset.branchName || 'Sucursal'); return; }
    if (event.target.closest('[data-branch-exercises-close]')) { close(); return; }
    const saveButton = event.target.closest('[data-save-branch-exercise]');
    if (!saveButton) return;
    const row = saveButton.closest('[data-branch-exercise-row]');
    const exerciseId = saveButton.dataset.saveBranchExercise;
    const payload = { isEnabled: Boolean(row.querySelector('[name="isEnabled"]')?.checked), localPrescription: row.querySelector('[name="localPrescription"]')?.value || '' };
    saveButton.disabled = true;
    try {
      await api(`/api/admin/branches/${encodeURIComponent(branchId)}/exercises/${encodeURIComponent(exerciseId)}`, { method: 'PUT', body: JSON.stringify(payload) });
      await refresh(); toast('Disponibilidad del ejercicio actualizada.');
    } catch (error) { saveButton.disabled = false; toast(error.message); }
  });
  new MutationObserver(decorateBranchTable).observe(document.body, { childList: true, subtree: true });
  decorateBranchTable();
})();
