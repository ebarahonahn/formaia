/* Flujos de correo y contraseña. Las credenciales SMTP nunca llegan al navegador. */
(() => {
  const apiUrl = window.FORMAIA_API_URL?.replace(/\/$/, '');
  const tokenKey = 'formaia-api-token';
  if (!apiUrl) return;
  const notify = text => { const toast = document.querySelector('#toast'); if (!toast) return; toast.textContent = text; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 4200); };
  const securePassword = () => { const lower = 'abcdefghijkmnopqrstuvwxyz', upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ', numbers = '23456789', symbols = '!@#$%&*?', all = lower + upper + numbers + symbols; const random = source => source[crypto.getRandomValues(new Uint32Array(1))[0] % source.length]; const value = [random(lower), random(upper), random(numbers), random(symbols), ...Array.from({ length: 8 }, () => random(all))]; for (let index = value.length - 1; index > 0; index--) { const swap = crypto.getRandomValues(new Uint32Array(1))[0] % (index + 1); [value[index], value[swap]] = [value[swap], value[index]]; } return value.join(''); };
  const strongPassword = value => String(value || '').length >= 8 && /\d/.test(value) && /[^A-Za-z0-9\s]/.test(value);
  const request = async (path, body = {}, authenticated = false) => {
    const headers = { 'Content-Type': 'application/json' };
    if (authenticated && sessionStorage.getItem(tokenKey)) headers.Authorization = `Bearer ${sessionStorage.getItem(tokenKey)}`;
    const response = await fetch(`${apiUrl}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(payload.error || 'No fue posible procesar la solicitud.');
    return payload;
  };
  const close = () => document.querySelector('.account-security-modal')?.remove();
  const modal = markup => { close(); const node = document.createElement('div'); node.className = 'account-security-modal'; node.innerHTML = `<section class="account-security-dialog" role="dialog" aria-modal="true"><button class="account-security-close" type="button" aria-label="Cerrar">×</button>${markup}</section>`; node.addEventListener('click', event => { if (event.target === node || event.target.closest('.account-security-close')) close(); }); document.body.append(node); return node; };
  const showRequestReset = () => {
    const node = modal(`<span class="eyebrow">Recuperar acceso</span><h2>Restablece tu contraseña.</h2><p>Te enviaremos un enlace seguro a tu correo si la cuenta existe.</p><label>Correo electrónico<input type="email" data-reset-email placeholder="nombre@correo.com" autocomplete="email"></label><button class="btn lime full" data-send-reset>Enviar enlace</button>`);
    node.querySelector('[data-send-reset]').onclick = async () => { try { const email = node.querySelector('[data-reset-email]').value.trim(); if (!/^\S+@\S+\.\S+$/.test(email)) throw Error('Escribe un correo válido.'); await request('/api/auth/password-reset/request', { email }); close(); notify('Si la cuenta existe, recibirás un enlace de recuperación.'); } catch (error) { notify(error.message); } };
  };
  const showConfirmReset = resetToken => {
    const node = modal(`<span class="eyebrow">Nueva contraseña</span><h2>Crea una contraseña nueva.</h2><p>Usa al menos 8 caracteres, un número y un carácter especial.</p><label>Nueva contraseña<input type="password" data-new-password minlength="8" autocomplete="new-password"></label><button class="password-generate" type="button" data-generate-reset-password>Generar clave segura</button><button class="btn lime full" data-confirm-reset>Guardar nueva contraseña</button>`);
    node.querySelector('[data-generate-reset-password]').onclick = () => { const input = node.querySelector('[data-new-password]'); input.value = securePassword(); input.focus(); notify('Generamos una clave segura. Guárdala en un administrador de contraseñas.'); };
    node.querySelector('[data-confirm-reset]').onclick = async () => { try { const password = node.querySelector('[data-new-password]').value; if (!strongPassword(password)) throw Error('La contraseña debe tener al menos 8 caracteres, un número y un carácter especial.'); await request('/api/auth/password-reset/confirm', { token: resetToken, password }); close(); history.replaceState({}, document.title, location.pathname); notify('Contraseña actualizada. Ahora puedes iniciar sesión.'); } catch (error) { notify(error.message); } };
  };
  const injectForgotLink = () => {
    const loginSwitch = document.querySelector('.auth-card .auth-switch');
    if (!loginSwitch || document.querySelector('[data-open-reset]') || document.querySelector('[data-auth="name"]')) return;
    loginSwitch.insertAdjacentHTML('afterend', '<p class="account-security-link"><button type="button" data-open-reset>¿Olvidaste tu contraseña?</button></p>');
    document.querySelector('[data-open-reset]')?.addEventListener('click', showRequestReset);
  };
  const injectResendVerification = () => {
    const menu = document.querySelector('.account-menu');
    if (!menu || menu.querySelector('[data-resend-verification]')) return;
    const user = window.FormaIAClientSession?.user?.(); if (!user || user.emailVerified) return; menu.insertAdjacentHTML('beforeend', '<button data-resend-verification>Reenviar verificación</button>'); menu.querySelector('[data-resend-verification]')?.addEventListener('click', async () => { try { const result = await request('/api/auth/resend-verification', {}, true); notify(result.sent ? 'Te enviamos un nuevo enlace de verificación.' : 'Configura el correo SMTP para enviar la verificación.'); } catch (error) { notify(error.message); } });
  };
  document.addEventListener('click', event => { if (event.target.closest('[data-action="logout"]')) request('/api/auth/logout', {}, true).catch(() => {}); if (event.target.closest('[data-action="auth-login"], [data-action="toggle-auth"]')) setTimeout(injectForgotLink, 0); }, true);
  const params = new URLSearchParams(location.search);
  const verifyToken = params.get('verify');
  const resetToken = params.get('reset');
  if (verifyToken) request('/api/auth/verify-email', { token: verifyToken }).then(() => { history.replaceState({}, document.title, location.pathname); notify('Correo verificado. Ya puedes continuar con FormaIA.'); }).catch(error => notify(error.message));
  if (resetToken) setTimeout(() => showConfirmReset(resetToken), 0);
  const observer = new MutationObserver(() => { injectForgotLink(); injectResendVerification(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  injectForgotLink();
  injectResendVerification();
  const style = document.createElement('style');
  style.textContent = `.account-security-link{text-align:center;margin:12px 0 0}.account-security-link button{border:0;background:transparent;color:#143d34;font-weight:700;text-decoration:underline;cursor:pointer}.account-security-link button:hover,.account-security-link button:focus-visible{color:#f06f5d;outline:2px solid currentColor;outline-offset:3px;border-radius:3px}html[data-theme="dark"] .account-security-link button{color:#d5f8b2}html[data-theme="dark"] .account-security-link button:hover,html[data-theme="dark"] .account-security-link button:focus-visible{color:#ffd0c7}.account-security-modal{position:fixed;z-index:50;inset:0;display:grid;place-items:center;padding:20px;background:rgba(9,42,35,.58)}.account-security-dialog{position:relative;width:min(460px,100%);padding:30px;border-radius:22px;background:#fffdf8;box-shadow:0 26px 70px rgba(0,0,0,.28)}.account-security-dialog h2{margin:9px 0}.account-security-dialog p{color:#66766f;line-height:1.5}.account-security-dialog label{display:grid;gap:8px;margin:20px 0;color:#48615b;font-size:.82rem}.account-security-dialog input{height:47px;border:1px solid #e4ded2;border-radius:10px;padding:0 13px}.account-security-close{position:absolute;top:13px;right:15px;border:0;border-radius:50%;width:32px;height:32px;background:#eff8d8;color:#143d34;font-size:1.4rem;cursor:pointer}`;
  document.head.append(style);
})();
