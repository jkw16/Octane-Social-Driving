# App icons

Drop your real PNG app icons in this folder. The PWA manifest and the
`apple-touch-icon` link in `index.html` reference these files:

- `icon-192.png` — 192×192 px, used for the home-screen icon and Apple touch icon
- `icon-512.png` — 512×512 px, used for the manifest and splash
- `icon-512-maskable.png` — 512×512 px, a maskable icon with safe-zone padding

Until you add real PNGs here, the home-screen icon will be blank/missing on
both the PWA and the Capacitor build. Any square PNG of the right size works;
you can generate them from a 1024×1024 master with a tool like
https://realfavicongenerator.net or `npx @pwa-converter/pwa-converter`.

Do NOT commit large binary PNGs you don't have the rights to.