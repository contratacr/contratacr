import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, devices } from "playwright/test";

function loadLocalEnvFile(fileName: string) {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) return false;

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const key = match[1];
    let value = match[2] ?? "";
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
  return true;
}

function currentEnvWith(overrides: Record<string, string>) {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") env[key] = value;
  }
  return { ...env, ...overrides };
}

const loadedTestEnv = !process.env.CI && loadLocalEnvFile(".env.test");
if (loadedTestEnv && !process.env.E2E_FIXTURES_READY) process.env.E2E_FIXTURES_READY = "1";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const localBaseURL = `http://localhost:${port}`;
const baseURL = process.env.PLAYWRIGHT_BASE_URL || localBaseURL;
const useLocalServer = !process.env.PLAYWRIGHT_BASE_URL;
const webServerEnv = loadedTestEnv ? currentEnvWith({ NODE_ENV: "test" }) : undefined;
const vercelBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const vercelBypassHeaders = vercelBypassSecret
  ? {
      "x-vercel-protection-bypass": vercelBypassSecret,
      "x-vercel-set-bypass-cookie": "true",
    }
  : undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  // Direct messages remain parked while WhatsApp is the production contact flow.
  testIgnore: ["**/direct-chat.spec.ts"],
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 12_000 },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["github"], ["list"], ["json", { outputFile: process.env.PLAYWRIGHT_JSON_REPORT ?? "test-results/results.json" }], ["html", { open: "never" }]]
    : "list",
  use: {
    baseURL,
    // All date buckets in ContrataCR are defined in Costa Rica local time.
    // Pin the browser clock so CI (UTC) and local runs agree at day boundaries.
    timezoneId: "America/Costa_Rica",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
    extraHTTPHeaders: vercelBypassHeaders,
  },
  webServer: useLocalServer
    ? {
        command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
        url: localBaseURL,
        env: webServerEnv,
        reuseExistingServer: true,
        timeout: 120_000,
      }
    : undefined,
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } },
    },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
  ],
});
