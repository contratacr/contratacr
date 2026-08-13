import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.contratacr.app",
  appName: "ContrataCR",
  webDir: "mobile-web",
  server: {
    url: "https://contratacr-mobile-test.vercel.app/es",
    allowNavigation: [
      "contratacr.com",
      "*.contratacr.com",
      "contratacr-mobile-test.vercel.app",
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
    SplashScreen: {
      launchAutoHide: false,
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
