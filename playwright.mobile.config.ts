import { defineConfig, devices } from "playwright/test";
import baseConfig from "./playwright.config";

const baseUse = typeof baseConfig.use === "object" ? baseConfig.use : {};

// Direct chat is a native-mobile capability. Keep it in this explicit config so
// the canonical web regression continues to ignore direct-chat.spec.ts.
export default defineConfig({
  ...baseConfig,
  testIgnore: [],
  testMatch: [
    "**/direct-chat.spec.ts",
    "**/mobile-native-shell.spec.ts",
  ],
  fullyParallel: false,
  workers: 1,
  projects: [
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
