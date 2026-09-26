# How to get Octane onto your iPhone

This is written for someone who is **not** a developer. Follow it in order.

You have a **web app** — a React + TypeScript site. iPhones do not run web
apps directly from a file; you have to package it. There are two realistic
ways to do that, and this guide walks you through both.

| | Path B — PWA (start here) | Path A — real iOS app (.ipa) |
|---|---|---|
| Needs a Mac? | **No** | Yes |
| Needs Xcode? | No | Yes |
| How it gets on the phone | Safari → "Add to Home Screen" | Xcode + USB cable |
| Camera / mic / GPS | Yes (Safari asks permission) | Yes (native prompts) |
| App Store / review needed? | No | No (sideload only) |
| Expiration | None | Free Apple ID = 7 days; paid = 1 year |
| Offline | Mostly (app shell caches) | Mostly (web view caches) |

**Start with Path B.** It takes 10 minutes, needs no Mac, and gives you a
real icon on the home screen that opens full-screen like an app. Path A is
only worth it if you specifically want a signed `.ipa` or the 7-day
expiration of the free sideload is bothering you.

---

## Before either path — one-time setup (on your Windows PC)

You need Node.js installed. If you don't have it, get the LTS installer from
https://nodejs.org (the "LTS" button). Then open **PowerShell** in this
project folder and run:

```sh
npm install
```

That downloads the project's dependencies into a `node_modules/` folder.
This can take a couple of minutes the first time. You only do it once (and
again whenever the dependencies in `package.json` change).

### Set your Gemini API key

The app's AI features (cruise assistant, track coach, meetups generator,
live voice) call Google Gemini, which needs a key.

1. Go to https://aistudio.google.com/apikey and create a key (free).
2. In the project folder, copy `.env.example` to `.env.local`:

   ```sh
   copy .env.example .env.local
   ```

3. Open `.env.local` in Notepad and paste your key after the `=`:

   ```
   GEMINI_API_KEY=AIzaSy...your real key...
   ```

   Save and close. `.env.local` is in `.gitignore` so it won't be committed.

> **Security caveat (read this):** the Gemini key is baked into the built app
> at build time. Anyone who opens the built JavaScript (on the web host, or
> by unzipping the app file) can extract it. For a personal sideload this is
> fine. If you ever share the app widely, move the Gemini calls behind a
> small server that holds the key, so the client never sees it. That is a
> later project — not something this guide sets up.

---

## Path B — PWA (no Mac needed)

A **PWA** (Progressive Web App) is just a website with a manifest and a
service worker, which lets Safari put a real icon on your home screen and
open the app full-screen. This is the fastest path.

### B.1 Build the app

In PowerShell, in the project folder:

```sh
npm run build
```

This creates a `dist/` folder containing the finished static site
(`index.html`, bundled JS/CSS, the manifest, the service worker, icons).

### B.2 Put `dist/` on a host with HTTPS

The app uses geolocation, microphone, and a service worker. **All three
require HTTPS** (or `http://localhost`). Safari will not give microphone or
location access to a plain `http://` page, and service workers only register
on HTTPS. So you must host `dist/` somewhere with HTTPS. Free options:

- **GitHub Pages** — push the `dist/` folder to a repo's `gh-pages` branch
  or use the repo Settings > Pages > deploy from a `/docs` folder. You get
  `https://<your-username>.github.io/<repo>/`. Free, HTTPS, permanent.
- **Netlify** — drag the `dist/` folder onto https://app.netlify.com/drop .
  You get a random HTTPS URL instantly. Free.
- **Cloudflare Pages** — connect the repo, set build command `npm run build`
  and output directory `dist`. Free, HTTPS, custom domain optional.

**Do not** use a raw `file://` URL or plain `http://` over LAN — the
permissions and service worker will silently not work.

### B.3 Add it to your iPhone home screen

1. Make sure your iPhone is on a network that can reach the host (and that
   your PC/host is online, if you self-host).
2. Open **Safari** (must be Safari — Chrome on iOS can't install PWAs) and
   go to the HTTPS URL from step B.2.
3. Tap the **Share** button (square with the up-arrow) in the toolbar.
4. Tap **Add to Home Screen**.
5. Name it "Octane" (or leave the default) and tap **Add**.

You now have an Octane icon on your home screen. Tap it and the app opens
full-screen, no Safari chrome. The first time it asks, allow location and
microphone.

### B.4 (Optional) Add real icons

The home-screen icon currently uses the placeholder PNGs in
`public/icons/`. If those aren't there, the icon will be blank. Drop real
`icon-192.png` and `icon-512.png` into `public/icons/` and rebuild
(`npm run build`) and redeploy. See `public/icons/README.md`.

### B.5 Updating the app later

Change code → `npm run build` → redeploy `dist/` to the same host URL.
The service worker will pick up the new version on next launch (after one
cached load). No need to re-add to home screen — the icon stays.

---

## Path A — real native iOS app (.ipa)

This gives you a signed app bundle and the "proper" native feel, but
**requires a Mac** with Xcode. There is no way around this on Windows —
Apple's toolchain only runs on macOS. Options if you don't own a Mac:
borrow one, use a cloud Mac service (MacStadium, MacinCloud — paid), or
rent one by the hour. You only need it for the build step.

The full step-by-step is in **`IOS_BUILD_GUIDE.md`**. The short version:

1. Copy this project folder to the Mac (USB, AirDrop, git, whatever).
2. On the Mac, in Terminal, inside the project folder:
   ```sh
   npm install
   copy .env.example .env.local      # then edit and paste your Gemini key
   npx cap add ios                   # first time only — scaffolds Xcode project
   ```
3. Open `ios/App/App/Info.plist` and add the four iOS permission strings
   (location, microphone, camera). `IOS_BUILD_GUIDE.md` has the exact XML.
   Without these the app crashes when it asks for mic/GPS.
4. Each time you change code:
   ```sh
   npm run cap:build:ios     # = build + cap sync ios + open Xcode
   ```
5. In Xcode: set your Apple ID team, select your iPhone (USB), press Cmd+R.
   The app installs and launches. First time, trust the developer on the
   phone under Settings > General > VPN & Device Management.

**Free Apple ID** sideloads expire after **7 days** — re-run step 4+5 weekly.
**Paid Apple Developer ($99/yr)** lasts ~1 year and enables TestFlight
over-the-air updates.

---

## The Gemini API key, again, for both paths

- **Path B (PWA):** the key is in the built JS bundle on your host. Anyone
  who opens browser DevTools on your site can read it. Fine for personal use;
  not fine for anything public-facing.
- **Path A (.ipa):** same — the key is inside the app bundle. Anyone who
  gets the `.ipa` can unzip it and read it.
- **Either way:** if you are worried, the fix is a small backend (e.g. a
  Cloudflare Worker or a tiny Node server) that holds `GEMINI_API_KEY` and
  forwards Gemini requests. The app then calls your backend instead of
  Gemini directly. That is a separate project — not set up here.

---

## Tailwind note

The app loads Tailwind CSS from a CDN (`cdn.tailwindcss.com`) via a
`<script>` tag in `index.html`. This works fine in Safari (PWA) and in the
Capacitor WebView (Path A, as long as there is network on first launch).

It is **not** ideal for two reasons: (1) it needs network the first time,
and (2) the CDN script is large and meant for prototyping. A future
hardening step is to install Tailwind as a build-time PostCSS plugin so the
CSS is bundled into `dist/`. That is not done here because it would change
how the app's styling is authored; the owner asked to keep Tailwind via CDN
for now. Just be aware the app's look depends on a network fetch of the
Tailwind script the first time it opens.

---

## Files created or modified in this project

Modified:
- `package.json` — added Capacitor deps + scripts, fixed the package name
- `vite.config.ts` — set `base: './'` (required for Capacitor local origin),
  kept the Gemini `define` block and React plugin
- `index.html` — added manifest link, theme-color, apple-touch-icon, and
  the four `apple-mobile-web-app-*` meta tags; widened viewport for notch
- `index.tsx` — imports `./sw-register` so the service worker is registered

Created (Path A — Capacitor):
- `capacitor.config.ts` — appId, appName, webDir, https scheme, sideload notes
- `IOS_BUILD_GUIDE.md` — the Mac-side step-by-step

Created (Path B — PWA):
- `public/manifest.webmanifest` — name, colors, standalone display, icons
- `public/sw.js` — offline app-shell service worker
- `src/sw-register.ts` — registers the SW in secure contexts only
- `public/icons/README.md` — tells you where to drop real PNG icons
- `.env.example` — placeholder for the Gemini key (copy to `.env.local`)

Created (this guide):
- `SIDEGUIDE.md` — the file you are reading

---

## Quick decision

- **"I just want it on my phone today."** → Path B. Build, host on Netlify
  Drop, Add to Home Screen in Safari. Done in 10 minutes.
- **"I want a real signed app and I have a Mac."** → Path A. Follow
  `IOS_BUILD_GUIDE.md`.
- **"I want it to work fully offline."** → Neither path is fully offline
  today because Tailwind and Gemini need network. Path B caches the app
  shell so it opens offline, but AI features still need network. Fixing
  that is a follow-up (bundle Tailwind locally + cache Gemini responses).