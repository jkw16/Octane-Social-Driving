// Octane service worker — offline app-shell caching.
//
// Strategy:
//   - Same-origin navigations (the HTML): network-first, fall back to cache
//     so the app still opens offline.
//   - Same-origin static assets (JS/CSS/icons from the same host): cache-first
//     with a network update in the background.
//   - Cross-origin requests (Tailwind CDN, Google Fonts, Leaflet, Gemini API):
//     pass straight through to the network — do not try to cache them. This
//     keeps the cache small and avoids caching opaque CDN responses that can
//     break on version bumps.
//
// This is intentionally simple and correct. It is not a full offline-first
// PWA; the Gemini voice/LLM features still require network. The goal is that
// the app shell opens and renders when the phone is offline.

const CACHE_NAME = 'octane-shell-v10';
const APP_SHELL = [
  './',
  './index.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {
      // If a shell URL isn't reachable during install, don't fail the install.
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET. Let everything else (POST to Gemini API, etc.) pass through.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cross-origin: go to the network, do not cache.
  if (url.origin !== self.location.origin) return;

  // Navigations (HTML documents): network-first, fall back to cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Same-origin static assets: cache-first, background update.
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});