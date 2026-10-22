import { defineConfig, devices } from "playwright/test";
import baseConfig from "./playwright.config";

const baseUse = typeof baseConfig.use === "object" ? baseConfig.use : {};

// Direct chat is a native-mobile capability. Keep it in this explicit config so
// the canonical web regression continues to ignore direct-chat.spec.ts.
export default defineConfig({
  ...baseConfig,
  testIgnore: ["**/.tmp-*.spec.ts"],
  testMatch: [
    "**/direct-chat.spec.ts",
    "**/recuperacion-al-desbloquear.spec.ts",
    "**/reanudar-la-app.spec.ts",
    "**/mensajes-sin-parpadeo.spec.ts",
    "**/mobile-native-shell.spec.ts",
    "**/admin-bottom-nav.spec.ts",
    "**/native-social-access.spec.ts",
    "**/apple-existing-account.spec.ts",
    "**/native-edge-back.spec.ts",
    "**/native-home-paint.spec.ts",
    "**/app-download.spec.ts",
    "**/marketplace-editors.spec.ts",
  ],
  fullyParallel: false,
  workers: 1,
  projects: [
    ...(process.env.PLAYWRIGHT_WEBKIT === "1" ? [{
      name: "mobile-native-webkit",
      use: { ...baseUse, ...devices["iPhone 14"], viewport: { width: 390, height: 844 } },
    }] : []),
    {
      name: "mobile-native",
      use: {
        ...baseUse,
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
