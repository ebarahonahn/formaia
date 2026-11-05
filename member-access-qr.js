(() => {
  const apiUrl = window.FORMAIA_API_URL?.replace(/\/$/, '') || 'http://localhost:3000';
  const tokenKey = 'formaia-api-token';
  let refreshTimer = null;
  const toast = message => { const target = document.querySelector('#toast'); if (!target) return; target.textContent = message; target.classList.add('show'); setTimeout(() => target.classList.remove('show'), 2800); };
  const api = async () => { const response = await fetch(`${apiUrl}/api/me/access/qr`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem(tokenKey)}` }, body: '{}' }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw Error(payload.error || 'No fue posible generar tu código QR.'); return payload; };
  const close = () => { clearTimeout(refreshTimer); refreshTimer = null; document.querySelector('[data-member-qr-modal]')?.remove(); };
  const refresh = async () => {
    const modal = document.querySelector('[data-member-qr-modal]');
    if (!modal) return;
    try {
      const qr = await api();
      const image = modal.querySelector('[data-member-qr-image]');
      const expiry = modal.querySelector('[data-member-qr-expiry]');
      if (!image || !expiry) return;
      image.src = qr.imageDataUrl;
      expiry.textContent = 'Se actualiza automáticamente por seguridad.';
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refresh, Number(qr.refreshAfterSeconds || 45) * 1000);
    } catch (error) { close(); toast(error.message); }
  };
  const open = () => {
    close();
    document.body.insertAdjacentHTML('beforeend', '<div class="member-qr-modal" data-member-qr-modal role="dialog" aria-modal="true" aria-label="Código QR de acceso"><button class="member-qr-backdrop" type="button" data-member-qr-close aria-label="Cerrar"></button><section class="member-qr-card"><button class="member-qr-close" type="button" data-member-qr-close aria-label="Cerrar">×</button><span class="eyebrow">Acceso a sucursal</span><h2>Tu código QR</h2><p>Muéstralo en recepción. Es personal, de un solo uso y se actualiza por seguridad.</p><img data-member-qr-image alt="Código QR personal de acceso"/><small data-member-qr-expiry>Generando código seguro…</small></section></div>');
    refresh();
  };
  const install = () => {
    if (!sessionStorage.getItem(tokenKey)) return;
    const profile = document.querySelector('.profile-page .form-card');
    if (!profile || profile.querySelector('[data-member-qr-open]')) return;
    profile.insertAdjacentHTML('beforeend', '<section class="member-qr-preview"><div><span class="eyebrow">Acceso a sucursal</span><h3>Mi código QR</h3><p>Genera un código temporal para ingresar sin búsquedas manuales.</p></div><button class="btn lime" type="button" data-member-qr-open>Mostrar mi QR</button></section>');
  };
  document.addEventListener('click', event => { if (event.target.closest('[data-member-qr-open]')) open(); if (event.target.closest('[data-member-qr-close]')) close(); });
  new MutationObserver(install).observe(document.querySelector('#app'), { childList: true, subtree: true });
  install();
})();
