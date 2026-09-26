import type { CapacitorConfig } from '@capacitor/cli';

// Capacitor configuration for the Octane: Social Driving iOS app.
//
// This file is read by `npx cap sync` / `npx cap add ios` on a Mac. On Windows
// you cannot build the .ipa, but having this file ready means that once you
// sit down at a Mac the flow is just:
//
//   npm install
//   npm run build
//   npx cap add ios      (first time only — scaffolds the Xcode project)
//   npx cap sync ios
//   npx cap open ios     (opens Xcode)
//
// See IOS_BUILD_GUIDE.md for the full Mac-side walkthrough.

const config: CapacitorConfig = {
  appId: 'com.octane.socialdriving',
  appName: 'Octane',
  webDir: 'dist',

  // Use an https origin inside the WebView. This is friendlier to the
  // browser permission APIs the app relies on (geolocation, microphone) and
  // avoids mixed-content warnings when loading Tailwind/fonts/Leaflet from
  // https CDNs. On iOS this makes the origin https://localhost.
  server: {
    iosScheme: 'https',
    androidScheme: 'https',
  },

  ios: {
    // Allow inline JS/CSS and the remote CDN scripts (Tailwind, Google Fonts,
    // Leaflet). Capacitor's WebView is local-only by default; contentAllowList
    // is not needed for <script src> tags, but we keep scheme as https so the
    // CDN resources are same-scheme.
    contentScheme: 'https',
    // Required for sideloaded builds that have not been signed with a
    // production entitlement — does not affect App Store builds.
    limitsNavigationsToAppBoundDomains: false,
  },

  plugins: {
    Geolocation: {
      // iOS usage descriptions are set in ios/App/App/Info.plist by
      // `npx cap add ios`. See IOS_BUILD_GUIDE.md — you must add:
      //   NSLocationWhenInUseUsageDescription
      //   NSLocationAlwaysAndWhenInUseUsageDescription
      //   NSMicrophoneUsageDescription
      //   NSCameraUsageDescription
    },
    Camera: {
      // No special config needed; permissions are declared in Info.plist.
    },
  },
};

export default config;