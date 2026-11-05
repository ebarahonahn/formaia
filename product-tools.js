(() => {
  const themeKey = 'formaia-theme';
  const applyTheme = theme => document.documentElement.dataset.theme = theme;
  applyTheme(localStorage.getItem(themeKey) || 'light');

  document.addEventListener('click', event => {
    const toggle = event.target.closest('[data-theme-toggle]');
    if (toggle) {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem(themeKey, next);
      applyTheme(next);
      window.dispatchEvent(new CustomEvent('formaia:theme-changed', { detail: { theme: next } }));
      const toast = document.querySelector('#toast');
      if (toast) { toast.textContent = next === 'dark' ? 'Modo oscuro activado.' : 'Modo claro activado.'; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2200); }
      return;
    }
    if (event.target.closest('[data-export-progress-pdf]')) {
      document.documentElement.classList.add('printing-progress');
      window.print();
      setTimeout(() => document.documentElement.classList.remove('printing-progress'), 500);
    }
  });

  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {}));
})();
