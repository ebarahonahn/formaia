/* Mantiene fuera de la app a cuentas inactivas, incluso sin una acción manual. */
(() => {
  const apiUrl = window.FORMAIA_API_URL?.replace(/\/$/, '');
  const tokenKey = 'formaia-api-token';
  if (!apiUrl) return;

  let closingSession = false;
  const showNotice = message => {
    const toast = document.querySelector('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4200);
  };
  const closeInvalidSession = (message = 'Tu cuenta fue inactivada o tu sesión ya no es válida. Inicia sesión para continuar.') => {
    if (closingSession) return;
    closingSession = true;
    sessionStorage.removeItem(tokenKey);
    window.FormaIAClientSession?.clear?.();
    showNotice(message);
    window.setTimeout(() => window.location.reload(), 550);
  };

  window.FormaIAAuth = { endInvalidSession: closeInvalidSession };
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, options = {}) => {
    const response = await nativeFetch(input, options);
    const headers = new Headers(options.headers || (input instanceof Request ? input.headers : undefined));
    if (response.status === 401 && headers.has('Authorization')) closeInvalidSession();
    if (response.status === 403 && headers.has('Authorization')) {
      response.clone().json().then(payload => {
        if (payload?.code === 'MEMBERSHIP_ACCESS_DENIED') closeInvalidSession(payload.error || 'Tu membresía no está activa. Verifica tu pago para continuar.');
      }).catch(() => {});
    }
    return response;
  };
  const checkSession = () => {
    const token = sessionStorage.getItem(tokenKey);
    if (!token || closingSession) return;
    window.fetch(`${apiUrl}/api/auth/session`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  };
  window.addEventListener('focus', checkSession);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkSession(); });
  if (sessionStorage.getItem(tokenKey)) {
    checkSession();
    window.setInterval(checkSession, 10000);
  }
})();
