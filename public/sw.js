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

const CACHE_NAME = 'octane-shell-v11';
// Map tiles get their own cache: a drive can pull hundreds of vector tiles
// (~20-50 KB each) plus the style JSON, glyphs and sprites. Capping entries
// keeps the warm cache around the plan's ~100 MB budget (LRU trim on insert).
const MAP_CACHE_NAME = 'octane-map-tiles-v1';
const MAP_MAX_ENTRIES = 2000;
const MAP_TILE_HOSTS = new Set([
  'tiles.openfreemap.org',     // vector tiles + style JSON + fonts + sprites
  'server.arcgisonline.com',  // Esri dark raster fallback canvas
  'basemaps.cartocdn.com',    // legacy CARTO basemap (pre-Esri builds)
]);
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

  // Cross-origin map tile hosts: cached in their own LRU cache so areas
  // visited once still render when a drive goes offline (vector tiles make
  // this practical — one .pbf covers a full zoom cell).
  if (MAP_TILE_HOSTS.has(url.hostname)) {
    const isStyle = url.hostname === 'tiles.openfreemap.org' &&
      url.pathname.startsWith('/styles/');

    // Basemap style JSON: stale-while-revalidate (tiny, and a broken style
    // fetch should never block the map from opening at all).
    if (isStyle) {
      event.respondWith(
        caches.open(MAP_CACHE_NAME).then(async (cache) => {
          const cached = await cache.match(request);
          const network = fetch(request)
            .then((response) => {
              if (response && response.status === 200) {
                cache.put(request, response.clone()).then(() => trimCache(MAP_CACHE_NAME, MAP_MAX_ENTRIES));
              }
              return response;
            })
            .catch(() => cached);
          return cached || network;
        })
      );
      return;
    }

    // Vector/raster tiles + glyphs + sprites: cache-first. Tiles never change
    // for a given z/x/y, so cache-first is both correct and offline-friendly.
    event.respondWith(
      caches.open(MAP_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response && (response.status === 200 || response.type === 'opaque')) {
            // clone() throws on opaque responses; a failed put just means the
            // tile is served from the network this session and cached next time.
            try { await cache.put(request, response.clone()); } catch (e) { /* ignore */ }
            trimCache(MAP_CACHE_NAME, MAP_MAX_ENTRIES);
            return response;
          }
          return response;
        } catch (e) {
          return new Response('', { status: 504, statusText: 'Tile fetch failed (offline)' });
        }
      })
    );
    return;
  }

  // Cross-origin (anything else): go to the network, do not cache.
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

// --- Map tile cache utilities ---------------------------------------------

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  for (const key of keys.slice(0, keys.length - maxEntries)) {
    await cache.delete(key);
  }
}

// Warm-up API: the app computes the tile URL list for a map area (bbox x
// zooms, expanded from the live basemap style) and posts it here; the SW
// fetches + caches each, reporting back over a MessageChannel.
self.addEventListener('message', (event) => {
  const id = event.data && event.data.id;
  if (id && event.ports[0]) event.ports[0].postMessage({ type: event.data.type, id, ok: true });
  if (!event.data || event.data.type !== 'OCTANE_MAP_CACHE_TILE_URLS') return;
  const urls = Array.isArray(event.data.urls) ? event.data.urls : [];
  event.waitUntil((async () => {
    const cache = await caches.open(MAP_CACHE_NAME);
    let ok = 0, failed = 0;
    for (const u of urls) {
      const req = new Request(u);
      if (await cache.match(req)) { ok += 1; continue; }
      try {
        const res = await fetch(req);
        if (res && (res.status === 200 || res.type === 'opaque')) { await cache.put(req, res); ok += 1; }
        else { failed += 1; }
      } catch (e) {
        failed += 1;
      }
    }
    await trimCache(MAP_CACHE_NAME, MAP_MAX_ENTRIES);
    if (event.ports[0]) {
      event.ports[0].postMessage({ type: 'OCTANE_MAP_CACHE_RESULT', ok, failed });
    }
  })());
});
