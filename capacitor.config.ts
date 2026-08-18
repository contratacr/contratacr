import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.contratacr.app",
  appName: "ContrataCR",
  webDir: "mobile-web",
  server: {
    url: "https://test.contratacr.com/es",
    allowNavigation: [
      "contratacr.com",
      "*.contratacr.com",
      "*.supabase.co",
      "res.cloudinary.com",
      "www.google.com",
      "maps.googleapis.com",
    ],
  },
  android: {
    backgroundColor: "#F4F7FA",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: "never",
  },
  plugins: {
    PushNotifications: {
      // Show incoming pushes while the app is open. `banner` and `list`
      // replace the deprecated iOS `alert` option and map to alert behavior
      // on Android.
      presentationOptions: ["badge", "sound", "banner", "list"],
    },
    SplashScreen: {
      // Android and iOS already provide the native launch splash. Let
      // Capacitor dismiss that same surface automatically instead of holding
      // a second, smaller splash while React hydrates.
      launchAutoHide: true,
      launchShowDuration: 300,
      launchFadeOutDuration: 120,
      backgroundColor: "#F4F7FA",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      overlaysWebView: false,
      backgroundColor: "#FFFFFF",
      style: "LIGHT",
    },
  },
};

export default config;
