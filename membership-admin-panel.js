(() => {
  const apiUrl = window.FORMAIA_API_URL?.replace(/\/$/, '') || 'http://localhost:3000';
  const tokenKey = 'formaia-api-token';
  let loading = false;
  let loadingPromise = null;
  let data = { plans: [], memberships: [], payments: [], users: [], branches: [], imports: [] };
  let editor = null;
  let membershipView = false;
  let loaded = false;
  let loadError = null;
  let importResult = null;

  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const dateValue = value => String(value || '').slice(0, 10);
  const date = value => {
    const normalized = dateValue(value);
    if (!normalized) return '—';
    return new Intl.DateTimeFormat('es-HN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${normalized}T12:00:00`));
  };
  const money = value => new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL', maximumFractionDigits: 2 }).format(Number(value || 0));
  const today = () => new Date().toISOString().slice(0, 10);
  const toast = message => {
    const target = document.querySelector('#toast');
    if (!target) return;
    target.textContent = message;
    target.classList.add('show');
    setTimeout(() => target.classList.remove('show'), 2800);
  };
  const api = async (path, options = {}) => {
    const response = await fetch(`${apiUrl}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem(tokenKey)}`, ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(payload.error || 'No fue posible procesar la solicitud.');
    return payload;
  };
  const planName = id => data.plans.find(plan => plan.id === id)?.name || 'Plan eliminado';
  const membershipPrice = id => Number(data.memberships.find(membership => membership.id === id)?.plan_price_hnl || 0);
  const membershipBranchIds = id => data.memberships.find(membership => membership.id === id)?.allowedBranchIds || [];
  const branchNames = ids => (ids || []).map(id => data.branches.find(branch => branch.id === id)?.name).filter(Boolean).join(', ') || '—';
  const state = (label, active = false) => `<span class="admin-state ${active ? 'active' : ''}">${escape(label)}</span>`;
  const activeTab = () => membershipView;
  const parseCsv = source => {
    const delimiter = source.split(/\r?\n/, 1)[0].includes(';') ? ';' : ',';
    const cells = []; let row = []; let value = ''; let quoted = false;
    for (let index = 0; index < source.length; index++) { const character = source[index]; const next = source[index + 1]; if (character === '"' && quoted && next === '"') { value += '"'; index++; } else if (character === '"') quoted = !quoted; else if (character === delimiter && !quoted) { row.push(value.trim()); value = ''; } else if ((character === '\n' || character === '\r') && !quoted) { if (character === '\r' && next === '\n') index++; row.push(value.trim()); if (row.some(item => item)) cells.push(row); row = []; value = ''; } else value += character; }
    row.push(value.trim()); if (row.some(item => item)) cells.push(row);
    if (cells.length < 2) throw Error('El CSV debe incluir una fila de encabezados y al menos un pago.');
    const names = { externalid: 'externalId', idtransaccion: 'externalId', transactionid: 'externalId', monto: 'amountHnl', amounthnl: 'amountHnl', amount: 'amountHnl', codigopago: 'paymentCode', paymentcode: 'paymentCode', membershipid: 'membershipId', email: 'email', correo: 'email', referencia: 'reference', reference: 'reference', recibo: 'receiptNumber', receiptnumber: 'receiptNumber', fecha: 'receivedOn', receivedon: 'receivedOn', notas: 'notes', notes: 'notes' };
    const headers = cells[0].map(header => names[String(header).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f\s_-]/g, '')] || '');
    if (!headers.includes('externalId') || !headers.includes('amountHnl')) throw Error('El CSV requiere las columnas externalId e amountHnl (o sus equivalentes idTransaccion y monto).');
    return cells.slice(1).map(row => Object.fromEntries(headers.map((name, index) => [name, name ? row[index] || '' : undefined]).filter(([name]) => name))).filter(item => Object.values(item).some(Boolean)).slice(0, 500);
  };
  const paymentImportSection = () => {
    const summary = importResult ? `<p class="payment-import-result"><b>${importResult.imported} importados</b> · ${importResult.unmatched} sin coincidencia · ${importResult.duplicate} duplicados · ${importResult.invalid} inválidos.</p>` : '';
    const recent = data.imports?.length ? `<div class="admin-table-wrap"><table><thead><tr><th>Archivo</th><th>Origen</th><th>Resultado</th><th>Fecha</th></tr></thead><tbody>${data.imports.map(item => `<tr><td>${escape(item.filename)}</td><td>${escape(({ bank_transfer: 'Transferencia', bank_deposit: 'Depósito', direct_debit: 'Débito automático' })[item.source_method] || item.source_method)}</td><td>${Number(item.imported_rows)} importados · ${Number(item.unmatched_rows)} sin coincidencia · ${Number(item.duplicate_rows)} duplicados</td><td>${date(item.created_at)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="admin-user-note">Aún no hay lotes importados.</p>';
    return `<section class="membership-admin-block payment-import-block"><div class="membership-admin-head"><div><span class="eyebrow">Conciliación masiva</span><h3>Importar pagos bancarios</h3><p>Sube un CSV de transferencias, depósitos o débitos automáticos. Los pagos coincidentes se verifican y activan membresías pendientes.</p></div></div><form class="payment-import-form" data-payment-import-form><label>Origen<select name="sourceMethod"><option value="bank_transfer">Transferencias</option><option value="bank_deposit">Depósitos bancarios</option><option value="direct_debit">Débito automático</option></select></label><label>Archivo CSV<input type="file" name="file" accept=".csv,text/csv" required><small>Máximo 500 filas por lote.</small></label><button class="btn lime" type="submit">Importar y conciliar</button></form><p class="admin-user-note">Columnas requeridas: <code>externalId</code> e <code>amountHnl</code>. Para identificar la membresía usa <code>paymentCode</code>, <code>membershipId</code> o <code>email</code>. Opcionales: <code>reference</code>, <code>receivedOn</code>, <code>receiptNumber</code>, <code>notes</code>.</p>${summary}${recent}</section>`;
  };

  const injectTab = mount => {
    const tabs = mount.querySelector('.admin-tabs');
    if (!tabs) return;
    const existing = tabs.querySelector('[data-membership-admin-tab]');
    if (existing) { existing.setAttribute('aria-selected', String(membershipView)); return; }
    tabs.insertAdjacentHTML('beforeend', `<button role="tab" data-admin-tab="memberships" data-membership-admin-tab aria-selected="${membershipView}">Membresías<small>${data.memberships.length || '·'}</small></button>`);
  };

  const planEditor = () => {
    const item = data.plans.find(plan => plan.id === editor?.id) || { code: '', name: '', description: '', durationDays: 30, priceHnl: '', branch_access_policy: 'all_branches', branchIds: [], is_active: 1 };
    const selected = value => item.branch_access_policy === value ? 'selected' : '';
    return `<form class="admin-meal-form" data-membership-plan-form>
      <div class="admin-meal-form-head"><div><span class="eyebrow">${editor?.id ? 'Editar plan' : 'Nuevo plan'}</span><h3>${editor?.id ? 'Actualiza las condiciones de venta' : 'Crea una membresía comercial'}</h3></div><button class="admin-form-close" type="button" data-membership-editor-close aria-label="Cerrar">×</button></div>
      <div class="admin-meal-grid">
        <label>Nombre<input name="name" maxlength="120" required value="${escape(item.name)}" placeholder="Ej. Mensual Plus"></label>
        <label>Código<input name="code" maxlength="40" required value="${escape(item.code)}" placeholder="mensual-plus"></label>
        <label>Duración (días)<input name="durationDays" type="number" min="1" max="3650" required value="${Number(item.durationDays ?? item.duration_days)}"></label>
        <label>Precio (HNL)<input name="priceHnl" type="number" min="0" max="1000000" step="0.01" required value="${escape(item.priceHnl ?? item.price_hnl)}"></label>
        <label class="admin-meal-wide">Descripción <small>opcional</small><input name="description" maxlength="500" value="${escape(item.description || '')}" placeholder="Qué incluye el plan"></label>
        <label>Alcance<select name="branchAccessPolicy"><option value="all_branches" ${selected('all_branches')}>Todas las sucursales</option><option value="selected_branches" ${selected('selected_branches')}>Sucursales seleccionadas</option></select></label>
        <fieldset class="membership-branch-picker admin-meal-wide"><legend>Sucursales incluidas <small>requeridas si eliges “seleccionadas”</small></legend>${data.branches.filter(branch => Number(branch.is_active)).map(branch => `<label><input type="checkbox" name="branchIds" value="${escape(branch.id)}" ${(item.branchIds || []).includes(branch.id) ? 'checked' : ''}><span>${escape(branch.name)}</span></label>`).join('') || '<p>No hay sucursales activas.</p>'}</fieldset>
        <label class="admin-meal-toggle"><input name="isActive" type="checkbox" ${Number(item.is_active) ? 'checked' : ''}> Disponible para nuevas membresías</label>
      </div>
      <div class="admin-meal-actions"><button class="btn outline" type="button" data-membership-editor-close>Cancelar</button><button class="btn lime" type="submit">${editor?.id ? 'Guardar plan' : 'Crear plan'}</button></div>
    </form>`;
  };

  const membershipEditor = () => `<form class="admin-meal-form" data-membership-form>
    <div class="admin-meal-form-head"><div><span class="eyebrow">Nueva membresía</span><h3>Asigna una vigencia a un cliente</h3></div><button class="admin-form-close" type="button" data-membership-editor-close aria-label="Cerrar">×</button></div>
    <div class="admin-meal-grid">
      <label class="admin-meal-wide">Cliente<select name="userId" required><option value="">Selecciona una cuenta</option>${data.users.filter(user => user.active).map(user => `<option value="${escape(user.id)}">${escape(user.name)} · ${escape(user.email)}</option>`).join('')}</select></label>
      <label class="admin-meal-wide">Plan<select name="membershipPlanId" required><option value="">Selecciona un plan</option>${data.plans.filter(plan => Number(plan.is_active)).map(plan => `<option value="${escape(plan.id)}">${escape(plan.name)} · ${money(plan.priceHnl ?? plan.price_hnl)} · ${Number(plan.durationDays ?? plan.duration_days)} días</option>`).join('')}</select></label>
      <label>Inicio<input name="startsOn" type="date" required value="${today()}"></label>
      <label>Gracia (días)<input name="graceDays" type="number" min="0" max="31" value="0"></label>
      <label>Estado inicial<select name="status"><option value="pending">Pendiente de pago</option><option value="active">Activa / cortesía</option><option value="paused">Pausada</option></select></label>
    </div>
    <p class="admin-user-note">La fecha de vencimiento se calcula automáticamente según el plan. Un pago verificado activará una membresía pendiente.</p>
    <div class="admin-meal-actions"><button class="btn outline" type="button" data-membership-editor-close>Cancelar</button><button class="btn lime" type="submit">Crear membresía</button></div>
  </form>`;

  const paymentEditor = () => `<form class="admin-meal-form" data-membership-payment-form>
    <div class="admin-meal-form-head"><div><span class="eyebrow">Registrar pago</span><h3>Cobro manual</h3></div><button class="admin-form-close" type="button" data-membership-editor-close aria-label="Cerrar">×</button></div>
    <div class="admin-meal-grid">
      <label class="admin-meal-wide">Membresía<select name="membershipId" required><option value="">Selecciona una membresía</option>${data.memberships.map(membership => `<option value="${escape(membership.id)}">${escape(membership.user_name)} · ${escape(membership.plan_name)} · vence ${date(membership.ends_on)}</option>`).join('')}</select></label>
      <label>Monto (HNL)<input name="amountHnl" type="number" min="0.01" max="1000000" step="0.01" required><small data-membership-payment-price>Selecciona una membresía para usar el precio del plan.</small></label>
      <label>Método<select name="method"><option value="cash">Efectivo</option><option value="bank_transfer">Transferencia</option><option value="pos">POS</option><option value="card">Tarjeta</option><option value="online">Pago en línea</option><option value="adjustment">Ajuste</option></select></label>
      <label>Estado<select name="status"><option value="verified">Verificado</option><option value="pending">Pendiente</option></select></label>
      <label>Sucursal<select name="branchId"><option value="">Sin sucursal</option>${data.branches.filter(branch => Number(branch.is_active)).map(branch => `<option value="${escape(branch.id)}">${escape(branch.name)}</option>`).join('')}</select><small data-membership-payment-branch>Selecciona una membresía para sugerir la sucursal.</small></label>
      <label>Referencia <small>opcional</small><input name="reference" maxlength="120" placeholder="No. de transferencia"></label>
      <label>Número de recibo <small>opcional</small><input name="receiptNumber" maxlength="60" placeholder="Ej. REC-001"></label>
      <label class="admin-meal-wide">Notas <small>opcional</small><textarea name="notes" rows="3" maxlength="500" placeholder="Detalle interno del cobro"></textarea></label>
    </div>
    <p class="admin-user-note">Registrar un pago verificado activa automáticamente una membresía que esté pendiente. Los cobros ya verificados no se pueden editar desde esta pantalla.</p>
    <div class="admin-meal-actions"><button class="btn outline" type="button" data-membership-editor-close>Cancelar</button><button class="btn lime" type="submit">Registrar pago</button></div>
  </form>`;

  const modal = content => `<div class="admin-meal-modal" data-membership-admin-modal role="dialog" aria-modal="true"><button class="admin-meal-modal-backdrop" type="button" data-membership-editor-close aria-label="Cerrar"></button><div class="admin-meal-modal-card">${content}</div></div>`;
  const statusOptions = membership => ['active', 'paused', 'suspended', 'cancelled'].map(value => `<option value="${value}" ${membership.status === value ? 'selected' : ''}>${({ active: 'Activa', paused: 'Pausada', suspended: 'Suspendida', cancelled: 'Cancelada' })[value]}</option>`).join('');
  const paymentActions = payment => payment.status === 'pending' ? `<div class="membership-status-control"><button class="admin-edit" type="button" data-payment-status-save="${escape(payment.id)}" data-payment-status="verified">Verificar</button><button class="admin-edit" type="button" data-payment-status-save="${escape(payment.id)}" data-payment-status="rejected">Rechazar</button></div>` : '—';

  const render = mount => {
    mount.querySelectorAll('[data-membership-admin-modal]').forEach(node => node.remove());
    mount.querySelector('[data-membership-admin-section]')?.remove();
    if (!activeTab(mount)) return;
    const activeMemberships = data.memberships.filter(item => item.status === 'active').length;
    const pendingPayments = data.payments.filter(item => item.status === 'pending').length;
    const section = document.createElement('section');
    section.className = 'admin-catalog membership-admin';
    section.dataset.membershipAdminSection = 'true';
    if (!loaded || loadError) {
      section.innerHTML = `<div><span class="eyebrow">Ingresos y acceso</span><h2>Membresías y pagos</h2></div><div class="membership-admin-feedback">${loadError ? `<b>No fue posible cargar el módulo.</b><p>${escape(loadError)}</p>` : '<span class="plan-loading-orb">◌</span><p>Cargando planes, membresías y pagos…</p>'}</div>`;
      mount.append(section);
      return;
    }
    section.innerHTML = `<div><span class="eyebrow">Ingresos y acceso</span><h2>Membresías y pagos</h2><p>Gestiona planes, vigencias y cobros manuales. La app y las validaciones de sucursal usan estas reglas para autorizar accesos.</p></div>
      <div class="admin-summary membership-summary"><article><b>${data.plans.filter(plan => Number(plan.is_active)).length}</b><span>planes disponibles</span></article><article><b>${activeMemberships}</b><span>membresías activas</span></article><article><b>${pendingPayments}</b><span>pagos pendientes</span></article></div>
      <section class="membership-admin-block"><div class="membership-admin-head"><div><span class="eyebrow">Configuración</span><h3>Planes de membresía</h3></div><button class="btn lime" type="button" data-membership-plan-new>Crear plan</button></div><div class="admin-table-wrap"><table><thead><tr><th>Plan</th><th>Vigencia</th><th>Precio</th><th>Sucursales</th><th>Estado</th><th></th></tr></thead><tbody>${data.plans.length ? data.plans.map(plan => `<tr><td><b>${escape(plan.name)}</b><small>${escape(plan.code)}</small></td><td>${Number(plan.durationDays ?? plan.duration_days)} días</td><td>${money(plan.priceHnl ?? plan.price_hnl)}</td><td>${plan.branch_access_policy === 'all_branches' ? 'Todas' : escape(branchNames(plan.branchIds))}</td><td>${state(Number(plan.is_active) ? 'Activo' : 'Inactivo', Number(plan.is_active))}</td><td><button class="admin-edit" type="button" data-membership-plan-edit="${escape(plan.id)}">Editar</button></td></tr>`).join('') : '<tr><td colspan="6">Aún no hay planes registrados.</td></tr>'}</tbody></table></div></section>
      <section class="membership-admin-block"><div class="membership-admin-head"><div><span class="eyebrow">Clientes</span><h3>Membresías</h3></div><button class="btn lime" type="button" data-membership-new>Nueva membresía</button></div><div class="admin-table-wrap"><table><thead><tr><th>Cliente</th><th>Plan</th><th>Vigencia</th><th>Sucursales</th><th>Estado</th><th>Actualizar</th></tr></thead><tbody>${data.memberships.length ? data.memberships.map(membership => `<tr><td><b>${escape(membership.user_name)}</b><small>${escape(membership.user_email)}</small></td><td>${escape(membership.plan_name)}<small>Ref. de pago: ${escape(membership.payment_reference_code || 'Pendiente')}</small></td><td>${date(membership.starts_on)} — ${date(membership.ends_on)}${membership.grace_ends_on ? `<small>Gracia: ${date(membership.grace_ends_on)}</small>` : ''}</td><td>${membership.branch_access_policy === 'all_branches' ? 'Todas' : escape((membership.allowedBranches || []).join(', ') || 'Sin sede')}</td><td>${state(({ active: 'Activa', pending: 'Pendiente', paused: 'Pausada', suspended: 'Suspendida', cancelled: 'Cancelada', expired: 'Vencida' })[membership.status] || membership.status, membership.status === 'active')}</td><td><div class="membership-status-control"><select data-membership-status-select="${escape(membership.id)}">${statusOptions(membership)}</select><button class="admin-edit" type="button" data-membership-status-save="${escape(membership.id)}">Guardar</button></div></td></tr>`).join('') : '<tr><td colspan="6">Aún no hay membresías registradas.</td></tr>'}</tbody></table></div></section>
      <section class="membership-admin-block"><div class="membership-admin-head"><div><span class="eyebrow">Caja</span><h3>Pagos manuales</h3></div><button class="btn lime" type="button" data-membership-payment-new>Registrar pago</button></div><div class="admin-table-wrap"><table><thead><tr><th>Cliente</th><th>Plan</th><th>Monto</th><th>Método</th><th>Referencia</th><th>Estado</th><th>Fecha</th><th>Acción</th></tr></thead><tbody>${data.payments.length ? data.payments.map(payment => `<tr><td>${escape(payment.user_name)}</td><td>${escape(payment.plan_name || '—')}</td><td>${money(payment.amount_hnl)}</td><td>${escape(({ cash: 'Efectivo', bank_transfer: 'Transferencia', bank_deposit: 'Depósito', direct_debit: 'Débito automático', pos: 'POS', card: 'Tarjeta', online: 'En línea', adjustment: 'Ajuste' })[payment.method] || payment.method)}</td><td>${escape(payment.receipt_number || payment.reference || '—')}</td><td>${state(({ verified: 'Verificado', pending: 'Pendiente', rejected: 'Rechazado', refunded: 'Reembolsado', void: 'Anulado' })[payment.status] || payment.status, payment.status === 'verified')}</td><td>${date(payment.received_at || payment.created_at)}</td><td>${paymentActions(payment)}</td></tr>`).join('') : '<tr><td colspan="8">Aún no hay pagos registrados.</td></tr>'}</tbody></table></div></section>${paymentImportSection()}`;
    mount.append(section);
    if (editor?.type === 'plan') mount.insertAdjacentHTML('beforeend', modal(planEditor()));
    if (editor?.type === 'membership') mount.insertAdjacentHTML('beforeend', modal(membershipEditor()));
    if (editor?.type === 'payment') mount.insertAdjacentHTML('beforeend', modal(paymentEditor()));
  };

  const load = () => {
    if (!sessionStorage.getItem(tokenKey)) return Promise.resolve();
    if (loadingPromise) return loadingPromise;
    loading = true;
    loadError = null;
    loadingPromise = (async () => {
      try {
      const [plans, memberships, payments, users, branches, imports] = await Promise.all([api('/api/admin/membership-plans'), api('/api/admin/memberships'), api('/api/admin/payments'), api('/api/admin/users'), api('/api/admin/branches'), api('/api/admin/payment-imports')]);
      data = { plans: plans.items || [], memberships: memberships.items || [], payments: payments.items || [], users: users.items || [], branches: branches.items || [], imports: imports.items || [] };
      loaded = true; loadError = null;
      document.querySelectorAll('[data-admin-panel]').forEach(mount => { injectTab(mount); render(mount); });
      } catch (error) {
        loadError = error.message;
        document.querySelectorAll('[data-admin-panel]').forEach(mount => render(mount));
      } finally { loading = false; loadingPromise = null; }
    })();
    return loadingPromise;
  };
  const refresh = async message => { paint(); await load(); if (message) toast(message); };
  const paint = () => document.querySelectorAll('[data-admin-panel]').forEach(mount => { injectTab(mount); if (activeTab(mount)) render(mount); });
  const install = () => document.querySelectorAll('[data-admin-panel]').forEach(mount => {
    injectTab(mount);
    if (activeTab(mount) && !mount.querySelector('[data-membership-admin-section]')) { render(mount); load(); }
  });

  document.addEventListener('click', async event => {
    const membershipTab = event.target.closest('[data-membership-admin-tab]');
    const otherAdminTab = event.target.closest('[data-admin-tab]');
    if (membershipTab) { membershipView = true; requestAnimationFrame(() => { install(); load(); }); return; }
    if (otherAdminTab) { membershipView = false; editor = null; setTimeout(install, 0); return; }
    if (event.target.closest('[data-membership-editor-close]')) { editor = null; paint(); return; }
    if (event.target.closest('[data-membership-plan-new]')) { editor = { type: 'plan' }; paint(); return; }
    const planEdit = event.target.closest('[data-membership-plan-edit]');
    if (planEdit) { editor = { type: 'plan', id: planEdit.dataset.membershipPlanEdit }; paint(); return; }
    if (event.target.closest('[data-membership-new]')) { editor = { type: 'membership' }; paint(); return; }
    if (event.target.closest('[data-membership-payment-new]')) { editor = { type: 'payment' }; paint(); return; }
    const statusSave = event.target.closest('[data-membership-status-save]');
    if (statusSave) {
      const membershipId = statusSave.dataset.membershipStatusSave;
      const status = document.querySelector(`[data-membership-status-select="${membershipId}"]`)?.value;
      statusSave.disabled = true;
      try { await api(`/api/admin/memberships/${encodeURIComponent(membershipId)}/status`, { method: 'PUT', body: JSON.stringify({ status }) }); await refresh('Estado de membresía actualizado.'); } catch (error) { statusSave.disabled = false; toast(error.message); }
    }
    const paymentStatusSave = event.target.closest('[data-payment-status-save]');
    if (paymentStatusSave) {
      paymentStatusSave.disabled = true;
      try {
        const result = await api(`/api/admin/payments/${encodeURIComponent(paymentStatusSave.dataset.paymentStatusSave)}/status`, { method: 'PUT', body: JSON.stringify({ status: paymentStatusSave.dataset.paymentStatus }) });
        await refresh(result.membershipActivated ? 'Pago verificado y membresía activada.' : 'Estado del pago actualizado.');
      } catch (error) { paymentStatusSave.disabled = false; toast(error.message); }
    }
  });

  document.addEventListener('change', event => {
    const select = event.target.closest('[data-membership-payment-form] [name="membershipId"]');
    if (!select) return;
    const form = select.closest('[data-membership-payment-form]');
    const input = form?.querySelector('[name="amountHnl"]');
    const hint = form?.querySelector('[data-membership-payment-price]');
    const branchSelect = form?.querySelector('[name="branchId"]');
    const branchHint = form?.querySelector('[data-membership-payment-branch]');
    const price = membershipPrice(select.value);
    if (!input || !hint) return;
    input.value = price > 0 ? price.toFixed(2) : '';
    hint.textContent = price > 0 ? `Precio del plan: ${money(price)}. Puedes modificarlo si aplica.` : 'Esta membresía no tiene un precio de plan para sugerir.';
    if (!branchSelect || !branchHint) return;
    const branchIds = membershipBranchIds(select.value);
    const availableBranchIds = branchIds.filter(id => [...branchSelect.options].some(option => option.value === id));
    branchSelect.value = availableBranchIds[0] || '';
    const branchName = branchSelect.selectedOptions[0]?.textContent?.trim();
    branchHint.textContent = availableBranchIds.length === 1 ? `Sucursal del plan: ${branchName}. Puedes cambiarla si corresponde.` : availableBranchIds.length > 1 ? `El plan incluye ${availableBranchIds.length} sucursales. Se seleccionó ${branchName}; puedes elegir otra incluida.` : 'Este plan permite todas las sucursales o no tiene una sede específica.';
  });

  document.addEventListener('submit', async event => {
    const planForm = event.target.closest('[data-membership-plan-form]');
    if (planForm) {
      event.preventDefault(); const values = new FormData(planForm); const submit = planForm.querySelector('[type="submit"]'); submit.disabled = true;
      const payload = { name: values.get('name'), code: values.get('code'), description: values.get('description'), durationDays: Number(values.get('durationDays')), priceHnl: Number(values.get('priceHnl')), branchAccessPolicy: values.get('branchAccessPolicy'), branchIds: values.getAll('branchIds'), isActive: values.get('isActive') === 'on' };
      try { await api(editor?.id ? `/api/admin/membership-plans/${encodeURIComponent(editor.id)}` : '/api/admin/membership-plans', { method: editor?.id ? 'PUT' : 'POST', body: JSON.stringify(payload) }); editor = null; await refresh('Plan de membresía guardado.'); } catch (error) { submit.disabled = false; toast(error.message); }
      return;
    }
    const membershipForm = event.target.closest('[data-membership-form]');
    if (membershipForm) {
      event.preventDefault(); const values = new FormData(membershipForm); const submit = membershipForm.querySelector('[type="submit"]'); submit.disabled = true;
      const payload = { userId: values.get('userId'), membershipPlanId: values.get('membershipPlanId'), startsOn: values.get('startsOn'), graceDays: Number(values.get('graceDays')), status: values.get('status') };
      try { await api('/api/admin/memberships', { method: 'POST', body: JSON.stringify(payload) }); editor = null; await refresh('Membresía creada.'); } catch (error) { submit.disabled = false; toast(error.message); }
      return;
    }
    const paymentForm = event.target.closest('[data-membership-payment-form]');
    if (paymentForm) {
      event.preventDefault(); const values = new FormData(paymentForm); const submit = paymentForm.querySelector('[type="submit"]'); submit.disabled = true;
      const payload = { membershipId: values.get('membershipId'), amountHnl: Number(values.get('amountHnl')), method: values.get('method'), status: values.get('status'), branchId: values.get('branchId'), reference: values.get('reference'), receiptNumber: values.get('receiptNumber'), notes: values.get('notes') };
      try { await api('/api/admin/payments', { method: 'POST', body: JSON.stringify(payload) }); editor = null; await refresh('Pago registrado.'); } catch (error) { submit.disabled = false; toast(error.message); }
      return;
    }
    const importForm = event.target.closest('[data-payment-import-form]');
    if (importForm) {
      event.preventDefault(); const values = new FormData(importForm); const submit = importForm.querySelector('[type="submit"]'); const file = values.get('file');
      if (!(file instanceof File) || !file.size) { toast('Selecciona un archivo CSV.'); return; }
      if (file.size > 1_500_000) { toast('El archivo CSV debe pesar menos de 1.5 MB.'); return; }
      submit.disabled = true;
      try {
        const rows = parseCsv(await file.text());
        if (!rows.length) throw Error('No encontramos pagos válidos en el CSV.');
        const result = await api('/api/admin/payments/imports', { method: 'POST', body: JSON.stringify({ filename: file.name, sourceMethod: values.get('sourceMethod'), rows }) });
        importResult = result.batch;
        await refresh(`${result.batch.imported} pago(s) importado(s); revisa los no conciliados si existen.`);
      } catch (error) { submit.disabled = false; toast(error.message); }
    }
  });

  new MutationObserver(install).observe(document.querySelector('#app'), { childList: true, subtree: true });
  install();
})();
