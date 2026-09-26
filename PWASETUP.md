# Octane PWA iPhone setup — verified step-by-step

This is the **verified** path to get Octane onto your iPhone as a home-screen
app, with no Mac required. Everything in the "Done already" section was
actually executed and confirmed working on this PC. The "You still need to
do" section is the few manual steps only you can do (paste your API key, drag
a folder to a website, tap Add to Home Screen).

Read this top to bottom. It is short.

---

## What was done already (verified working)

These steps were run and confirmed on your Windows 11 PC. You do NOT need to
redo them unless you change the code or your API key.

1. **Node.js detected** — Node v22.23.2 and npm 12.0.2 are installed. Good.
2. **Dependencies installed** — `npm install` ran successfully (205 packages).
3. **`.env.local` created** — copied from `.env.example`. It currently has an
   empty `GEMINI_API_KEY=`. See step 1 below to fill it in.
4. **Two build bugs found and fixed** (these were broken; the prior setup
   left the build producing an empty page):
   - `index.html` was missing the `<script type="module" src="./index.tsx">`
     entry point, so Vite built nothing but the HTML shell. Fixed.
   - `index.tsx` imported `./sw-register` but the file lives at
     `src/sw-register.ts`. Import path corrected to `./src/sw-register`.
5. **Build succeeded** — `npm run build` produces a complete `dist/` folder:
   - `dist/index.html` (2.97 kB)
   - `dist/assets/index-*.js` (471 kB, 139 kB gzipped) — the full React app
   - `dist/manifest.webmanifest` — PWA manifest
   - `dist/sw.js` — service worker (offline app-shell caching)
   - `dist/icons/icon-192.png`, `icon-512.png`, `icon-512-maskable.png` —
     solid-color placeholder icons (#0f172a, the app's dark background)
6. **Preview verified** — `vite preview` served every route (/, /sw.js,
   /manifest.webmanifest, /icons/icon-192.png, the JS bundle) with HTTP 200.
7. **Icons generated** — three valid PNG placeholders created in
   `public/icons/` using PowerShell System.Drawing (no network, no
   dependencies). A reusable script is saved at
   `public/icons/generate-icons.ps1`.
8. **`netlify.toml` added** — configured so dragging `dist/` into Netlify
   Drop "just works": `publish = "dist"` and a SPA redirect
   `/* -> /index.html` (status 200) so no path ever 404s.

---

## What you still need to do

### Step 1 — Paste your Gemini API key (needed for AI features)

The build itself works fine without a key (verified — the build above ran
with an empty key). But the app's AI features (cruise assistant, track coach,
meetups generator, live voice) silently do nothing without a real key.

1. Go to https://aistudio.google.com/apikey and create a key (free, takes
   30 seconds).
2. Open this file in Notepad:
   `C:\Users\jkwit\OneDrive\Desktop\Octane-Social-Driving-main\.env.local`
3. Replace the empty value so the line reads:
   ```
   GEMINI_API_KEY=AIzaSy...your real key here...
   ```
4. Save and close.
5. Re-run the build so the key is baked into the bundle:
   - Open **PowerShell** in the project folder
   - Run: `npm run build`

> **Security note:** the key is inlined into the built JavaScript by Vite.
> Anyone who opens the deployed site's DevTools can read it. This is fine for
> a personal sideload. If you ever share the URL publicly, move the Gemini
> calls behind a small server that holds the key. That is a separate project.

### Step 2 — Drag `dist/` to Netlify Drop (gets you an HTTPS URL)

Safari only installs PWAs and grants mic/GPS/service-worker from an
**HTTPS** origin (or `http://localhost`). Netlify Drop gives you a free
HTTPS URL in seconds, no account needed for a one-off.

1. Open https://app.netlify.com/drop in your browser.
2. Drag the **entire `dist` folder** (not its contents — the folder itself)
   from this path onto the page:
   `C:\Users\jkwit\OneDrive\Desktop\Octane-Social-Driving-main\dist`
3. Netlify uploads it and gives you a random HTTPS URL like
   `https://octane-xyz-123.netlify.app`. Copy it.
4. (Optional) Click "Claim site" / create a free account if you want to keep
   the URL permanent and redeploy updates later. Not required for a test.

> The `netlify.toml` at the project root is already configured for this:
> `publish = "dist"` and `/* -> /index.html` (200). You do not need to change
> anything — just drag the folder.

### Step 3 — Add to Home Screen on your iPhone

1. Open **Safari** on your iPhone (must be Safari — Chrome on iOS cannot
   install PWAs).
2. Paste the Netlify HTTPS URL from step 2 into the address bar and go.
3. Wait for the app to load (first load needs network — it fetches Tailwind
   and fonts from a CDN, then the service worker caches the app shell).
4. Tap the **Share** button (square with the up-arrow, in the bottom or top
   toolbar depending on iOS version).
5. Tap **Add to Home Screen**.
6. Name it "Octane" (or accept the default) and tap **Add**.

You now have an Octane icon on your home screen. Tap it — it opens
full-screen with no Safari chrome. The first time it asks, allow **Location**
and **Microphone**.

---

## Updating the app later

1. Change code on your PC.
2. If you changed the Gemini key or any code: `npm run build` in PowerShell.
3. If you claimed the Netlify site: drag the new `dist/` folder onto the same
   site in Netlify, or use `netlify deploy --prod --dir=dist`. The URL stays
   the same.
4. The service worker picks up the new version on the next launch (after one
   cached load). No need to re-add to home screen — the icon stays.

---

## Replacing the placeholder icons

The icons currently are solid dark squares (#0f172a) — they look like a blank
dark tile on the home screen. To put a real icon on:

1. Create or obtain a square PNG. A 512x512 master is enough; you can derive
   192 and 512 from it.
2. Save these three files in
   `C:\Users\jkwit\OneDrive\Desktop\Octane-Social-Driving-main\public\icons\`
   (overwrite the placeholders):
   - `icon-192.png` (192x192)
   - `icon-512.png` (512x512)
   - `icon-512-maskable.png` (512x512 — keep your art in the center ~80% so
     iOS/Android mask shapes don't crop it)
3. Re-run `npm run build` and redeploy `dist/`.

If you ever delete the icons and need the placeholders back, regenerate them
with no network and no tools:
```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\jkwit\OneDrive\Desktop\Octane-Social-Driving-main\public\icons\generate-icons.ps1"
```

---

## Troubleshooting

**"The app opens but it's just a dark screen."**
First load needs network to fetch Tailwind (`cdn.tailwindcss.com`) and Google
Fonts. If your phone is offline on first launch, it won't render the styled
app. Connect to the internet, reload, then it caches for next time. If it is
online and still blank, check you opened the **Netlify HTTPS URL** (not a
`file://` path) and that `dist/assets/index-*.js` exists in the deployed
folder.

**"Safari doesn't show 'Add to Home Screen'."**
You are probably in Chrome or an in-app browser. Use **Safari**. Also make
sure the URL is `https://` — Safari hides the install option on plain
`http://` (except localhost).

**"The mic / GPS / voice doesn't work."**
Three requirements: (1) the page must be served over HTTPS — Netlify gives
you this automatically. (2) You must allow the permission prompt the first
time. (3) iOS requires the site to be added to home screen (a "standalone"
PWA) before it grants microphone access in some iOS versions. If you
allowed it and it still fails, open Safari on the same URL (not the
home-screen app), tap the "aA" / settings, and check Site Permissions.

**"The AI features (cruise/track/meetups/voice) do nothing."**
Your `GEMINI_API_KEY` in `.env.local` is empty or wrong. The build does not
fail on a bad key — the features silently no-op. Fix the key (step 1 above),
rebuild, redeploy. A valid key starts with `AIza`.

**"The home-screen icon is a blank dark square."**
You are seeing the placeholder icons. Replace them with a real PNG per the
"Replacing the placeholder icons" section above, then rebuild and redeploy.

**"Netlify Drop says my folder has no index.html."**
You dragged the wrong folder. Drag the `dist` folder itself (the one
containing `index.html`, `assets/`, `sw.js`, `manifest.webmanifest`,
`icons/`). Its full path is:
`C:\Users\jkwit\OneDrive\Desktop\Octane-Social-Driving-main\dist`

**"I changed code but the phone still shows the old version."**
The service worker caches the app shell. Force-refresh: open the home-screen
app, and if it still shows the old version, open Safari on the same URL,
pull to refresh, then re-open the home-screen icon. Or clear Safari website
data: Settings > Safari > Advanced > Website Data > remove the Netlify site.

**"npm run build fails with 'Could not resolve ./sw-register'."**
That was a bug that has already been fixed in this project. If it reappears,
check `index.tsx` — the import must read `import './src/sw-register';`
(not `./sw-register`).

---

## File reference

Files created or modified in this PWA setup pass:

Modified:
- `index.html` — added `<script type="module" src="./index.tsx">` (Vite
  entry point; without this Vite produced an empty build)
- `index.tsx` — fixed import `./sw-register` → `./src/sw-register`

Created:
- `netlify.toml` — SPA redirect + publish=dist for Netlify Drop
- `public/icons/generate-icons.ps1` — dependency-free placeholder icon
  generator (PowerShell System.Drawing)
- `public/icons/icon-192.png`, `icon-512.png`, `icon-512-maskable.png` —
  solid-color placeholder PNGs
- `.env.local` — copied from `.env.example` (empty key — you fill it in)
- `PWASETUP.md` — this file

Pre-existing (from prior setup pass, still present and correct):
- `vite.config.ts` — `base: './'` and Gemini `define` block
- `public/manifest.webmanifest` — PWA manifest with icons, standalone display
- `public/sw.js` — offline app-shell service worker
- `src/sw-register.ts` — registers the SW in secure contexts
- `public/icons/README.md` — notes on real icons
- `.env.example` — Gemini key template
- `SIDEGUIDE.md` — the longer background guide (both PWA and iOS paths)