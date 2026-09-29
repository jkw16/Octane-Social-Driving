// MapLibre GL JS's tile pipeline runs in a Web Worker the library loads from a
// URL derived from the *importing module's own URL*:
//   `new URL('./maplibre-gl-worker.mjs', import.meta.url)`
// Under Vite's production bundling that resolves to `/assets/maplibre-gl-worker.mjs`
// — a path the bundler never emits, because sibling-asset detection via
// `new URL(..., import.meta.url)` runs on project files only, not on
// node_modules dependencies. The worker request 404s, MapLibre terminates the
// actor pool, no tile request is ever issued, and the basemap stays blank
// underneath whatever the main thread managed to build (style, sprites,
// markers).
//
// Fix: serve the worker (+ its only import, maplibre-gl-shared.mjs) from our
// own origin as static files. They live in `public/lib/maplibre-gl-<version>/`
// so Vite copies them verbatim into `dist/`, and after `npx cap sync ios` into
// the iOS app bundle root. Resolve against `document.baseURI` so the URL is
// correct in dev (`/`), in the built web app (`/`), and inside the Capacitor
// WebView (`https://localhost/`).
//
// The version MUST be pinned to the installed `maplibre-gl` package (see
// package.json) so the worker/shared chunk ABI matches the main module. If you
// upgrade maplibre-gl, re-copy the four .mjs files from
// `node_modules/maplibre-gl/dist/` into `public/lib/maplibre-gl-<newver>/` and
// bump MAPLIBRE_GL_VERSION here.
import { setWorkerUrl } from 'maplibre-gl';

const MAPLIBRE_GL_VERSION = '6.6.0'; // keep in sync with package.json "maplibre-gl"

const workerUrl = new URL(
  `/lib/maplibre-gl-${MAPLIBRE_GL_VERSION}/maplibre-gl-worker.mjs`,
  typeof document !== 'undefined' ? document.baseURI : 'https://localhost/'
).href;

setWorkerUrl(workerUrl);