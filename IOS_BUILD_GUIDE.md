# Octane — iOS build guide (Mac required)

This guide assumes you have already done the one-time setup described in
`SIDEGUIDE.md` and that the files in this repo (`capacitor.config.ts`, the
updated `package.json` / `vite.config.ts`) are in place. Do this on a Mac.

You **cannot** build an `.ipa` on Windows. Capacitor's iOS platform and Xcode
only run on macOS. Everything below happens on the Mac.

## ⚡ Fast path — run the setup script

Steps 1–3 below are automated by `setup-ios.sh`. On the Mac, in Terminal, from
the project folder:

```sh
bash setup-ios.sh
```

It runs `npm install`, scaffolds the iOS project (`npx cap add ios`), injects all
four Info.plist permission strings, builds the web assets, and syncs them in.
Then you only do the Xcode part (step 4) and the on-phone trust (step 4 cont.).
Re-run `bash setup-ios.sh` any time after changing code; it's idempotent.

The rest of this document is the same flow explained manually.

## 0. What you need on the Mac

- macOS 13+ (Ventura or newer is safest)
- **Xcode 15+** from the Mac App Store (free, but it is a large download)
- Node.js 20+ and npm (or `brew install node`)
- An **Apple ID**. A free Apple ID works for sideload but the app expires
  after 7 days and you have to re-deploy. A paid Apple Developer account
  ($99/year) gives a 1-year signing cert and is needed for TestFlight.
- The iPhone connected by USB cable, unlocked, with Settings > Privacy &
  Security > Developer Mode ON (iOS 16+ prompts for this the first time).

## 1. One-time: install deps and scaffold the iOS project

In Terminal, `cd` into the project folder (copy it from the Windows machine
first, or pull from git):

```sh
npm install
cp .env.example .env.local      # then edit .env.local and paste your Gemini key
npx cap add ios                 # scaffolds the ios/ Xcode project — first time only
```

`npx cap add ios` reads `capacitor.config.ts` and creates `ios/App/...`.

## 2. Add the required iOS permission strings to Info.plist

Open `ios/App/App/Info.plist` in a text editor (or in Xcode) and make sure
these keys exist. Xcode shows them as human-readable names; in the raw plist
they look like:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Octane uses your location for cruise and track modes.</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Octane uses your location for cruise and track modes.</string>
<key>NSMicrophoneUsageDescription</key>
<string>Octane uses the microphone for live crew voice chat.</string>
<key>NSCameraUsageDescription</key>
<string>Octane can use the camera for your profile photo.</string>
```

Without these, iOS will crash the app the moment it asks for location or mic.
There is no Capacitor plugin to install for the microphone — the WebView's
standard `getUserMedia` works, but iOS still requires the usage description.

## 3. Build the web assets and sync them into the iOS project

Every time you change app code:

```sh
npm run build          # builds dist/ with relative asset paths
npx cap sync ios       # copies dist/ into ios/App/App/public/ and updates native deps
npx cap open ios       # opens the project in Xcode
```

(The `npm run cap:build:ios` script does all three in one shot.)

## 4. Sign and run on your iPhone (Xcode)

1. In Xcode, click the project name **Octane** in the left sidebar.
2. Under **Signing & Capabilities**, pick your Team (your Apple ID — add it
   via Xcode > Settings > Accounts if it is not listed). Let Xcode create a
   "personal team" provisioning profile.
3. Change the **Bundle Identifier** if you get a name-collision error from the
   free signing flow — e.g. `com.octane.socialdriving` is fine if it is free,
   but if it is taken, use something unique like `com.yourname.octane`.
4. At the top of Xcode, set the active scheme to **Octane** and the target
   device dropdown to your iPhone (connected by USB). Not the simulator —
   the simulator has no microphone/camera/GPS that the app can use.
5. Press **Cmd+R** (or the Play button). Xcode builds, signs, installs, and
   launches the app on the phone.

If iOS complains "Untrusted Developer", on the phone go to
**Settings > General > VPN & Device Management** and tap your Apple ID,
then **Trust**. This is normal for sideloaded apps.

## 5. The 7-day / 1-year expiration

- **Free Apple ID**: the signing cert expires in 7 days. After that the app
  won't open until you plug the phone back into the Mac and run
  `npm run cap:build:ios` + Cmd+R again. No data is lost.
- **Paid Apple Developer ($99/yr)**: the cert lasts ~1 year, and you can use
  **TestFlight** to push updates over the air without a cable.

## 6. Adding real icons

Capacitor uses the iOS asset catalog for the app icon, not the PWA PNGs.
Generate an iOS icon set (a 1024×1024 master is enough) and drop it into
`ios/App/App/Assets.xcassets/AppIcon.appiconset/` via Xcode's asset catalog
editor (it sizes the variants for you). You can use
https://realfavicongenerator.net or a free "app icon generator" site.

## Troubleshooting

- **White screen on launch**: run `npx cap sync ios` again and rebuild — the
  `dist/` folder was probably stale or missing.
- **Mic/location crash**: you skipped step 2 (Info.plist usage strings).
- **"no such module @capacitor/core"**: run `npm install` in the project
  root before `npx cap sync`.
- **CodeSign fails with "resource fork, Finder information, or similar
  detritus"**: this happens when the project folder lives under an
  iCloud-synced location (e.g. `~/Desktop` or `~/Documents` with iCloud
  Desktop & Documents enabled). iCloud stamps `com.apple.FinderInfo` /
  `com.apple.fileprovider` extended attributes onto the built framework
  dirs, and the macOS code-signer refuses to sign "dirty" files.
  `xattr -cr ios` clears them but iCloud re-stamps on the next sync, so it
  is unreliable. The robust fix is to send Xcode's build output *off* the
  synced volume with `-derivedDataPath`:

  ```sh
  xattr -cr ios   # clear xattrs once, just in case
  DD="$HOME/Library/Developer/Xcode/DerivedData/Octane"
  xcodebuild -workspace ios/App/App.xcworkspace -scheme App \
    -sdk iphonesimulator -configuration Debug \
    -destination 'id=<SIMULATOR-UDID>' \
    -derivedDataPath "$DD" build
  ```

  The built `App.app` then lands in
  `$DD/Build/Products/Debug-iphonesimulator/App.app`. In Xcode you can
  also set this once under File > Project Settings > Advanced > "Custom"
  > the same off-Desktop path. Moving the whole project out of `~/Desktop`
  (e.g. into `~/Developer`) avoids the issue entirely.
- **Tailwind not loading inside the WebView**: Tailwind is built locally
  (`tailwind.config.js` + `postcss.config.js` + `index.css`, imported from
  `index.tsx`), so styles are baked into the bundle and work offline. If
  styling is missing, run `npm install` (to pick up the `tailwindcss` /
  `postcss` / `autoprefixer` devDeps) and rebuild — `npm run build` emits
  the compiled CSS into `dist/assets/`. The old `cdn.tailwindcss.com`
  Play CDN `<script>` has been removed.