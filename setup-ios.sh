#!/usr/bin/env bash
# Octane: Social Driving — one-time iOS setup (RUN ON A MAC)
#
# This script automates the boring/error-prone parts of the Capacitor iOS build:
#   - npm install
#   - scaffolds the Xcode project (npx cap add ios) — idempotent
#   - injects the four required Info.plist permission strings (location/mic/camera)
#   - builds the web assets and syncs them into the iOS project
#   - opens Xcode ready for you to sign + run
#
# After it finishes, follow the "IN XCODE" steps it prints at the end.
#
# Do NOT run this on Windows — it only works on macOS with Xcode installed.
# See IOS_BUILD_GUIDE.md for the full walkthrough.

set -euo pipefail

# --- guard: macOS only ---
if [[ "$(uname)" != "Darwin" ]]; then
  echo "❌ This script must run on a Mac (macOS). You are on: $(uname)"
  echo "   Copy the project folder to a Mac and run it there."
  exit 1
fi

cd "$(dirname "$0")"

echo "==> Checking prerequisites..."
command -v node >/dev/null 2>&1 || { echo "❌ Node.js not found. Install it: brew install node"; exit 1; }
command -v npx  >/dev/null 2>&1 || { echo "❌ npx not found (needs Node)."; exit 1; }
if ! xcode-select -p >/dev/null 2>&1; then
  echo "❌ Xcode command-line tools not found. Install Xcode from the Mac App Store, then run: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
  exit 1
fi
echo "    Node $(node -v)  |  OK"

echo ""
echo "==> npm install..."
npm install

echo ""
echo "==> Verifying Gemini key is present in .env.local..."
if ! grep -q "^GEMINI_API_KEY=." .env.local 2>/dev/null; then
  echo "⚠️  .env.local has no GEMINI_API_KEY. The app will build but the AI features"
  echo "   (track finder, smart search, event scout, voice) will silently no-op."
  echo "   Paste your key from https://aistudio.google.com/apikey into .env.local"
  echo "   and re-run: npm run build && npx cap sync ios"
else
  echo "    Key found. AI features will be baked into the bundle."
fi

echo ""
echo "==> Scaffolding the iOS Xcode project (first time only)..."
if [ -d "ios/App" ]; then
  echo "    ios/App already exists — skipping 'npx cap add ios'."
else
  npx cap add ios
fi

PLIST="ios/App/App/Info.plist"
if [ ! -f "$PLIST" ]; then
  echo "❌ Expected Info.plist at $PLIST not found. 'npx cap add ios' may have failed."
  exit 1
fi

echo ""
echo "==> Injecting required iOS permission strings into Info.plist..."
# Idempotent: set if the key exists, add if it doesn't.
set_plist () {
  local key="$1" val="$2"
  if /usr/libexec/PlistBuddy -c "Print :$key" "$PLIST" >/dev/null 2>&1; then
    /usr/libexec/PlistBuddy -c "Set :$key $val" "$PLIST"
  else
    /usr/libexec/PlistBuddy -c "Add :$key string $val" "$PLIST"
  fi
  echo "    ✓ $key"
}
set_plist NSLocationWhenInUseUsageDescription          "Octane uses your location for cruise and track modes."
set_plist NSLocationAlwaysAndWhenInUseUsageDescription "Octane uses your location for cruise and track modes."
set_plist NSMicrophoneUsageDescription                 "Octane uses the microphone for live crew voice chat."
set_plist NSCameraUsageDescription                    "Octane can use the camera for your profile photo."

echo ""
echo "==> Building web assets and syncing into the iOS project..."
npm run build
npx cap sync ios

echo ""
echo "=================================================================="
echo "✅ Setup complete. Now finish in Xcode:"
echo "=================================================================="
echo "1. Open the project in Xcode:"
echo "      npx cap open ios"
echo ""
echo "2. In Xcode's left sidebar, click the project name \"Octane\"."
echo "3. Under Signing & Capabilities, pick your Team (your Apple ID)."
echo "   - Add it via Xcode > Settings > Accounts if not listed."
echo "   - If the Bundle Identifier collides, change it to e.g. com.<yourname>.octane."
echo "4. At the top, set the scheme to \"Octane\" and the device dropdown to your"
echo "   iPhone (connected by USB, unlocked, Developer Mode ON)."
echo "5. Press Cmd+R (or the Play button). Xcode builds, signs, installs, launches."
echo "6. On the phone, if it says \"Untrusted Developer\":"
echo "      Settings > General > VPN & Device Management > tap your Apple ID > Trust"
echo ""
echo "Expiration:"
echo "   - Free Apple ID: app expires in 7 days. Re-run this script + Cmd+R weekly."
echo "   - Paid Apple Developer (\$99/yr): ~1 year, plus TestFlight OTA updates."
echo ""
echo "CodeSign 'detritus' error (resource fork / Finder information):"
echo "   This happens if the project lives under an iCloud-synced folder"
echo "   (~/Desktop, ~/Documents with iCloud Desktop & Documents ON). iCloud"
echo "   stamps xattrs on built framework dirs and code-signing refuses them."
echo "   Fix: build off the synced volume, e.g. from a shell instead of Xcode:"
echo "     DD=\"\$HOME/Library/Developer/Xcode/DerivedData/Octane\""
echo "     xattr -cr ios"
echo "     xcodebuild -workspace ios/App/App.xcworkspace -scheme App \\"
echo "       -sdk iphonesimulator -configuration Debug \\"
echo "       -destination 'id=<SIMULATOR-UDID>' -derivedDataPath \"\$DD\" build"
echo "   Or in Xcode: File > Project Settings > Advanced > Custom > that path."
echo "   Moving the project out of ~/Desktop (e.g. ~/Developer) avoids it."
echo ""
echo "To rebuild after code changes later, just re-run: ./setup-ios.sh"
echo "=================================================================="