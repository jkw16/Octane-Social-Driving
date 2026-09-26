// Register the service worker for offline app-shell caching.
//
// Only registered in a secure context (https or localhost) where the browser
// allows service workers. This keeps local `npm run dev` (http://localhost)
// working and is production-safe on any https host. On the Capacitor iOS path
// the SW is simply ignored — the WebView origin supports it but it is
// unnecessary there, and this guard skips it silently if unavailable.

if ('serviceWorker' in navigator) {
  // Compute the SW URL relative to the document so it works both from a
  // static host (/sw.js) and from a sub-path deploy (./sw.js).
  const swUrl = new URL('./sw.js', document.baseURI).href;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(swUrl)
      .then((reg) => {
        // eslint-disable-next-line no-console
        console.log('[Octane] service worker registered', reg.scope);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[Octane] service worker registration failed', err);
      });
  });
}