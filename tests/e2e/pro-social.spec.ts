import { test, expect } from 'playwright/test';
import { build } from 'esbuild';
import { promotionInput } from '../../src/lib/pro/promotion-records';
import { crTodayISO } from '../../src/lib/time-cr';
test('recorded diffusion distinguishes paid promotion and validates actual channel and date', () => {
    const row = { requestId: crypto.randomUUID(), userId: crypto.randomUUID(), contentType: 'offer', contentId: crypto.randomUUID(), channel: 'instagram', occurredOn: crTodayISO(), paid: false, publishedUrl: 'https://www.instagram.com/p/demo/' };
    expect(promotionInput.parse(row).paid).toBe(false);
    expect(promotionInput.parse({ ...row, paid: true }).paid).toBe(true);
    for (const publishedUrl of ['javascript:alert(1)', 'https://instagram.com.evil.example/p/test', 'https://user:secret@instagram.com/p/test', 'https://facebook.com/post'])
        expect(promotionInput.safeParse({ ...row, publishedUrl }).success).toBe(false);
    expect(promotionInput.safeParse({ ...row, occurredOn: '2099-01-01' }).success).toBe(false);
    expect(promotionInput.safeParse({ ...row, occurredOn: '2026-02-31' }).success).toBe(false);
});
test('retired social preview has no monthly quota or request form', async ({ page }) => {
    const bundle = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{SocialPanel}from'./src/components/pro/social-panel';createRoot(document.getElementById('root')).render(<SocialPanel/>);`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'iife', define: { 'process.env': JSON.stringify({ NODE_ENV: 'test' }) }, platform: 'browser', jsx: 'automatic' });
    await page.route('**/social-harness', r => r.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
    await page.goto('/social-harness');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await expect(page.getByText(/La difusión la gestiona ContrataCR/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Solicitar/ })).toHaveCount(0);
    await expect(page.locator('form')).toHaveCount(0);
    await expect(page.getByText(/cupo|mensual/i)).toHaveCount(0);
});
