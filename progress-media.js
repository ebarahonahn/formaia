/* Datos opcionales del registro de avance. La carga efectiva se coordina
 * con backend-client.js para confirmar que MySQL y backend/uploads respondan. */
(() => {
  let pending = null;

  const setStatus = (message, error = false) => {
    const element = document.querySelector('[data-progress-upload-status]');
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('is-error', error);
  };

  const installFields = () => {
    const weight = document.querySelector('[data-progress="weight"]');
    if (!weight || document.querySelector('[data-progress-media]')) return;
    const field = weight.closest('.field, label') || weight.parentElement;
    const anchor = field?.parentElement || weight.parentElement;
    if (!anchor) return;
    anchor.insertAdjacentHTML('beforeend', `
      <section class="progress-media" data-progress-media aria-label="Medidas y foto de avance">
        <p class="progress-media__title">Medidas opcionales (pulgadas)</p>
        <div class="progress-media__measurements">
          <label>Cintura<input type="number" min="0" step="0.1" inputmode="decimal" data-local-measurement="waist" placeholder="Ej. 32"></label>
          <label>Cadera<input type="number" min="0" step="0.1" inputmode="decimal" data-local-measurement="hip" placeholder="Ej. 40"></label>
          <label>Pecho<input type="number" min="0" step="0.1" inputmode="decimal" data-local-measurement="chest" placeholder="Ej. 38"></label>
        </div>
        <label class="progress-media__photo">Foto de avance (opcional, JPG, PNG o WEBP; máximo 4 MB)
          <input type="file" accept="image/jpeg,image/png,image/webp" data-progress-photo>
        </label>
        <aside class="progress-media__tips" aria-label="Recomendaciones para tu foto de avance">
          <b>Para comparar tu avance con mayor claridad</b>
          <ul>
            <li>Usa la misma postura y un ángulo parecido.</li>
            <li>Procura usar una luz y distancia similares.</li>
            <li>Usa ropa parecida en cada registro.</li>
          </ul>
        </aside>
        <p class="progress-media__status" data-progress-upload-status aria-live="polite"></p>
      </section>`);
  };

  const prepare = () => {
    const file = document.querySelector('[data-progress-photo]')?.files?.[0] || null;
    if (file && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Selecciona una imagen JPG, PNG o WEBP.');
    if (file && file.size > 4_000_000) throw new Error('La foto debe pesar menos de 4 MB.');
    pending = {
      file,
      measurements: Object.fromEntries([...document.querySelectorAll('[data-local-measurement]')].map(input => [input.dataset.localMeasurement, input.value.trim()]).filter(([, value]) => value))
    };
    return pending;
  };

  window.FormaIAProgressMedia = {
    consume: () => { const value = pending; pending = null; return value; },
    fileAsDataUrl: file => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('No fue posible leer la foto seleccionada.'));
      reader.readAsDataURL(file);
    })
  };

  window.addEventListener('click', event => {
    if (!event.target.closest('[data-action="save-progress"]')) return;
    try { prepare(); } catch (error) { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); setStatus(error.message, true); }
  }, true);

  document.addEventListener('change', event => {
    const file = event.target.closest('[data-progress-photo]')?.files?.[0];
    if (file) setStatus(`Foto seleccionada: ${file.name}. Se guardará junto con tu avance.`);
  });

  const observer = new MutationObserver(installFields);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  installFields();

  const style = document.createElement('style');
  style.textContent = `.progress-media{grid-column:1 / -1;margin-top:8px;padding:16px;border:1px solid #e6ded0;border-radius:16px;background:#fffdf8}.progress-media__title{margin:0 0 12px;font-weight:700;color:#073c35}.progress-media__measurements{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.progress-media label{display:grid;gap:7px;color:#48615b;font-size:.88rem}.progress-media input{box-sizing:border-box;width:100%;min-height:44px;padding:10px 12px;border:1px solid #ddd4c7;border-radius:10px;background:#fff;color:#073c35;font:inherit}.progress-media__photo{margin-top:14px}.progress-media__tips{margin-top:12px;padding:12px 13px;border-radius:12px;background:#eff8d8;color:#24493e;font-size:.78rem;line-height:1.45}.progress-media__tips b{color:#073c35}.progress-media__tips ul{display:grid;gap:3px;margin:7px 0 0;padding-left:18px}.progress-media__status{min-height:1.2em;margin:10px 0 0;color:#497e1b;font-size:.88rem}.progress-media__status.is-error{color:#bd4d3a}@media(max-width:600px){.progress-media__measurements{grid-template-columns:1fr}}html[data-theme="dark"] .progress-media{border-color:#557b51;background:#263f36;color:#e8f5ee}html[data-theme="dark"] .progress-media__title,html[data-theme="dark"] .progress-media__tips b{color:#f4fff8}html[data-theme="dark"] .progress-media label{color:#c3d8cf}html[data-theme="dark"] .progress-media input{border-color:#557b51;background:#203831;color:#f4fff8}html[data-theme="dark"] .progress-media input::placeholder{color:#9db8ac}html[data-theme="dark"] .progress-media input[type="file"]{color:#dceee5}html[data-theme="dark"] .progress-media input[type="file"]::file-selector-button{margin-right:10px;padding:7px 10px;border:0;border-radius:7px;background:#315246;color:#f4fff8;font:inherit}html[data-theme="dark"] .progress-media__tips{background:#345544;color:#e3f1eb}html[data-theme="dark"] .progress-media__status{color:#c2ef57}`;
  document.head.appendChild(style);
})();
