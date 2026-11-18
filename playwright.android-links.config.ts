import { defineConfig } from 'playwright/test';
export default defineConfig({ testDir: './tests/native', testMatch: ['android-links-notices.spec.ts'], outputDir: 'test-results/android-links', timeout: 180_000, expect: { timeout: 30_000 }, workers: 1, retries: 0, reporter: 'line' });
