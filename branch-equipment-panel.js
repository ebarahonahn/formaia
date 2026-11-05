(() => {
  const apiUrl = window.FORMAIA_API_URL?.replace(/\/$/, '') || 'http://localhost:3000';
  const tokenKey = 'formaia-api-token';
  let branchId = null, branchName = '', catalog = [], items = [], editor = null;

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
    if (!table || table.dataset.equipmentEnhanced) return;
    table.dataset.equipmentEnhanced = 'true';
    table.querySelector('thead tr')?.insertAdjacentHTML('beforeend', '<th>Equipo</th>');
    [...table.querySelectorAll('tbody tr')].forEach(row => {
      const branchEdit = row.querySelector('[data-admin-branch-edit]');
      if (!branchEdit) return;
      const name = row.cells[0]?.textContent?.trim() || 'Sucursal';
      row.insertAdjacentHTML('beforeend', `<td><button class="admin-edit" type="button" data-branch-equipment="${escape(branchEdit.dataset.adminBranchEdit)}" data-branch-name="${escape(name)}">Equipo</button></td>`);
    });
  };

  const statusLabel = value => ({ available: 'Disponible', maintenance: 'Mantenimiento', unavailable: 'Fuera de servicio' }[value] || value);
  const selected = (current, value) => current === value ? ' selected' : '';
  const editorForm = () => {
    const item = items.find(value => value.id === editor?.id) || { equipment_id: catalog[0]?.id || '', quantity: 1, operational_status: 'available', zone: '' };
    return `<form class="admin-meal-form" data-branch-equipment-form>
      <div class="admin-meal-form-head"><div><span class="eyebrow">${editor?.id ? 'Editar equipo' : 'Registrar equipo'}</span><h3>${editor?.id ? 'Actualiza el inventario de esta sede' : 'Añade una máquina o implemento'}</h3></div><button class="admin-form-close" type="button" data-equipment-cancel aria-label="Cerrar formulario">×</button></div>
      <div class="admin-meal-grid">
        <label class="admin-meal-wide">Equipo<select name="equipmentId" required>${catalog.map(entry => `<option value="${escape(entry.id)}"${selected(item.equipment_id, entry.id)}>${escape(entry.name)}</option>`).join('')}</select></label>
        <label>Cantidad<input name="quantity" type="number" min="1" max="1000" required value="${Number(item.quantity || 1)}"></label>
        <label>Estado<select name="operationalStatus"><option value="available"${selected(item.operational_status, 'available')}>Disponible</option><option value="maintenance"${selected(item.operational_status, 'maintenance')}>Mantenimiento</option><option value="unavailable"${selected(item.operational_status, 'unavailable')}>Fuera de servicio</option></select></label>
        <label class="admin-meal-wide">Zona <small>opcional</small><input name="zone" maxlength="100" value="${escape(item.zone || '')}" placeholder="Ej. Área de fuerza"></label>
      </div>
      <div class="admin-meal-actions"><button class="btn outline" type="button" data-equipment-cancel>Cancelar</button><button class="btn lime" type="submit">${editor?.id ? 'Guardar cambios' : 'Registrar equipo'}</button></div>
    </form>`;
  };
  const render = () => {
    const existing = document.querySelector('.branch-equipment-modal');
    if (!branchId) { existing?.remove(); return; }
    const content = editor ? editorForm() : `<div class="admin-meal-form">
      <div class="admin-meal-form-head"><div><span class="eyebrow">Sucursal</span><h3>Equipo · ${escape(branchName)}</h3><p>Solo el equipo disponible podrá habilitar ejercicios que lo requieran.</p></div><button class="admin-form-close" type="button" data-equipment-close aria-label="Cerrar">×</button></div>
      <div class="admin-meal-actions"><span></span><button class="btn lime" type="button" data-equipment-new>Registrar equipo</button></div>
      <div class="admin-table-wrap"><table><thead><tr><th>Equipo</th><th>Cantidad</th><th>Zona</th><th>Estado</th><th>Editar</th></tr></thead><tbody>${items.length ? items.map(item => `<tr><td>${escape(item.name)}</td><td>${item.quantity}</td><td>${escape(item.zone || '—')}</td><td><span class="admin-state ${item.operational_status === 'available' ? 'active' : ''}">${escape(statusLabel(item.operational_status))}</span></td><td><button class="admin-edit" type="button" data-equipment-edit="${escape(item.id)}">Editar</button></td></tr>`).join('') : '<tr><td colspan="5">Aún no se ha registrado equipo para esta sucursal.</td></tr>'}</tbody></table></div>
    </div>`;
    const modal = document.createElement('div');
    modal.className = 'admin-meal-modal branch-equipment-modal';
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', `Equipo de ${branchName}`);
    modal.innerHTML = `<button class="admin-meal-modal-backdrop" type="button" data-equipment-close aria-label="Cerrar"></button><div class="admin-meal-modal-card">${content}</div>`;
    existing?.replaceWith(modal) || document.body.append(modal);
  };
  const refresh = async () => { const result = await api(`/api/admin/branches/${encodeURIComponent(branchId)}/equipment`); items = result.items || []; render(); };
  const open = async (id, name) => {
    branchId = id; branchName = name; editor = null;
    try {
      const [equipment, inventory] = await Promise.all([api('/api/admin/equipment'), api(`/api/admin/branches/${encodeURIComponent(id)}/equipment`)]);
      catalog = equipment.items || []; items = inventory.items || []; render();
    } catch (error) { branchId = null; toast(error.message); }
  };
  const close = () => { branchId = null; branchName = ''; editor = null; document.querySelector('.branch-equipment-modal')?.remove(); };

  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-branch-equipment]');
    if (button) { event.preventDefault(); await open(button.dataset.branchEquipment, button.dataset.branchName || 'Sucursal'); return; }
    if (event.target.closest('[data-equipment-close]')) { close(); return; }
    if (event.target.closest('[data-equipment-cancel]')) { editor = null; render(); return; }
    if (event.target.closest('[data-equipment-new]')) { editor = {}; render(); return; }
    const edit = event.target.closest('[data-equipment-edit]');
    if (edit) { editor = { id: edit.dataset.equipmentEdit }; render(); }
  });
  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-branch-equipment-form]');
    if (!form) return;
    event.preventDefault();
    const values = new FormData(form);
    const payload = { equipmentId: values.get('equipmentId'), quantity: Number(values.get('quantity')), operationalStatus: values.get('operationalStatus'), zone: values.get('zone') };
    const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
    try {
      const isEdit = Boolean(editor?.id);
      await api(isEdit ? `/api/admin/branches/${encodeURIComponent(branchId)}/equipment/${encodeURIComponent(editor.id)}` : `/api/admin/branches/${encodeURIComponent(branchId)}/equipment`, { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      editor = null; await refresh(); toast(isEdit ? 'Equipo actualizado.' : 'Equipo registrado.');
    } catch (error) { submit.disabled = false; toast(error.message); }
  });
  new MutationObserver(decorateBranchTable).observe(document.body, { childList: true, subtree: true });
  decorateBranchTable();
})();
