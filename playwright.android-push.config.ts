import { defineConfig } from 'playwright/test';

// Explicit native-device regression, separate from browser-only CI. See
// docs/push-delivery-audit-2026-10-23.md for emulator/CDP and credential setup.
export default defineConfig({
  testDir: './tests/native',
  testMatch: ['android-push-delivery.spec.ts'],
  outputDir: 'test-results/android-push',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  workers: 1,
  retries: 0,
  reporter: 'line',
});
