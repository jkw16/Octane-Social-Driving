# Map System Overhaul — Implementation Plan

Owner doc for the map-system rebuild. Feed this to the Antigravity agent as
context, then work through phases in order. Each phase is independently
shippable — PR-sized chunks. Do NOT move to the next phase until the previous
one builds and runs.

## Current state (as of 2026-09-28)

- **Engine**: `maplibre-gl` ^6.6.0 (already installed). PWA (Vite + React +
  Tailwind) with Capacitor iOS wrapper.
- **Basemap**: `services/mapStyle.ts` — two stacked **raster** layers of Esri
  World Dark Gray Canvas (`World_Dark_Gray_Base` + `_Reference`), 256px tiles,
  maxzoom 16. Works only because Esri is free / no key / no watermark.
- **Map usage is duplicated**: `components/CruiseMode.tsx:106` creates its own
  `maplibregl.Map`; `components/TrackMode.tsx:185` creates another (creator
  preview). Each manages its own markers/sources with no shared code.
- **Geocoding**: Google MapsPlaces lookup in `components/TrackMode.tsx`
  ("Nearest Track") — one-off HTTP call, no key management layer.
- **Hard constraint**: the app must work with **no map API key**, the same way
  it does today. Do not introduce anything that requires a paid account.
- App targets: dark UI, car-community (cruises, tracks, meetups, groups).

## Phase 1 — Shared MapCanvas component (refactor first, behavior identical)

1. Create `components/map/MapCanvas.tsx`: a single react wrapper owning
   `maplibregl.Map` lifecycle (init from a style prop, resize handling,
   cleanup on unmount).
2. Create `components/map/useMapSources.ts` (or plain helpers) for the common
   add-source/add-layer/manage-GEOJSON-source patterns used by both screens.
3. Port `CruiseMode` and `TrackMode` onto `MapCanvas`. Pixel output must look
   the same as today (Esri raster style) — this phase is behavior-preserving.
4. Acceptance: cruise + track flows work identically; no duplicated `new
   maplibregl.Map` calls in feature components (grep must come up empty).

## Phase 2 — Vector basemap upgrade

1. Switch basemap to **OpenFreeMap** vector tiles (free, no key, no
   registration, CORS-open): default style
   `https://tiles.openfreemap.org/styles/dark` as the base, fetched at
   runtime — do not vendor the whole style file.
2. Keep `services/mapStyle.ts` as the theme module: re-export a
   `buildOctaneStyle()` that takes the OpenFreeMap style JSON and applies
   Octane overrides (see Phase 3). Fall back to the current Esri raster style
   if the vector style fails to load (offline resilience / blocked network).
3. Verify raster→vector parity: zoom behavior, label rendering, performance on
   mid-range mobile (vector tiles are GPU-heavier than raster PNGs — test in
   the Capacitor webview, not just desktop Chrome).
4. Acceptance: no tile-provider watermark, no API key, both screens render the
   vector basemap with same interaction behavior.

## Phase 3 — Custom Octane map theme + markers

1. In `services/mapStyle.ts`, define Octane brand tokens (accent color(s) from
   the app's Tailwind theme) and restyle at minimum:
   - road classes (motorway/trunk highlighted in brand accent, others dimmed)
   - water / land / green areas palette
   - label typography (font-family matching app's mono/display fonts)
2. Custom markers: `components/map/markers/` — branded marker components for
   meetup points, track start/finish, group icons, live car pucks (arrow
   rotated to heading). Current `TrackMode.tsx` builds ad-hoc DOM markers —
   centralize them.
3. Fuel/POI layer (optional stretch): OpenFreeMap style already carries POI
   data — enable fuel-station icons selectively so route/track planning reads
   like a driving app.

## Phase 4 — Live UX: smooth, clustered, offline

1. **Smooth movement**: interpolate live group positions between websocket
   updates (requestAnimationFrame / CSS transform on marker element) instead
   of positional snapping.
2. **Clustering**: GeoJSON source with `cluster: true` for meetups / many-car
   groups; custom styled cluster bubbles matching the theme.
3. **Offline tile caching**: cache vector tiles (pbf) + style JSON through the
   existing service worker (`src/sw-register.ts`) with a per-saved-route
   warm-up ("download this map area") — scoped to a generous but bounded
   (e.g. ~100 MB) cache, evictable. Vector tiles make this feasible where the
   old raster PNG approach was not.
4. **Places/track search**: keep the Google Maps lookup, but route it through
   one `services/geocoding.ts` module so the provider is swappable.

## Out of scope (do not do in this project)

- Native map SDKs (Apple Maps/Google Maps native) — the PWA webview setup
  stays.
- Any provider requiring an API key (Mapbox, MapTiler key tiers, HERE, …).
- Routing/turn-by-turn navigation — separate future project.