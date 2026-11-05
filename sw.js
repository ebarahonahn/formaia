const CACHE = 'formaia-shell-v28';
const ASSETS = ['./','./index.html','./styles.css','./dark-theme-fixes.css','./mvp.css','./design-system.css','./week2.css','./week4.css','./data-model.js','./app-v3.js','./week2.js','./backend-client-config.js','./session-guard.js','./backend-client.js','./week4.js','./progress-media.js','./account-security.js','./nutrition-tools.js','./training-tools.js','./progress-insights.js','./admin-confirm-dialog-style.js','./product-tools.js','./manifest.webmanifest','./formaia-icon.svg'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then(cached => cached || (event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
