import { test, expect } from 'playwright/test';
import { createDisposableAccount, cleanupDisposableAccount } from './disposable-account';
import { gotoOK, loginAs } from './helpers';
import { NATIVE_ONBOARDING_COMPLETED_KEY } from '@/lib/mobile-onboarding';
import { localizedNotificationCopy } from '@/lib/localized-notification';
import es from '../../messages/es.json';
import en from '../../messages/en.json';

for (const locale of ['es', 'en'] as const) {
  test(`completion titles wrap and the price step opens at the price field (${locale})`, async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    const account = await createDisposableAccount({ prefix: 'completion-price', professional: true });
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.context().addCookies([{ name: 'ccr_platform', value: 'native', url: baseURL! }]);
      await page.addInitScript(key => localStorage.setItem(key, '1'), NATIVE_ONBOARDING_COMPLETED_KEY);
      await loginAs(page, account.email, account.password);
      await gotoOK(page, `/${locale}/dashboard/profesional?mode=offer&tab=completion`);
      const location = page.locator('[data-completion-step="location"]');
      await expect(location).toBeVisible();
      const title = location.locator('span.font-extrabold');
      await expect(title).toHaveText((locale === 'es' ? es : en).proPanel.completion.location);
      expect(await title.evaluate(node => {
        const style = getComputedStyle(node);
        return style.whiteSpace !== 'nowrap' && node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= node.clientHeight + 1;
      })).toBe(true);
      await location.click();
      await expect(page.locator('[data-dashboard-current="profile"]')).toBeVisible();
      await expect(page.locator('[data-native-back="dashboard-section"]')).toBeVisible();
      // Capture every committed panel state, including commits between frames.
      await page.evaluate(() => {
        const samples: string[] = [];
        const observer = new MutationObserver(() => {
          samples.push(document.querySelector('[data-dashboard-current]')?.getAttribute('data-dashboard-current') ?? 'none');
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true });
        Object.assign(window, { completionBackSamples: samples, completionBackObserver: observer });
      });
      await page.locator('[data-native-back="dashboard-section"]').click();
      await expect(location).toBeVisible();
      const panels = await page.evaluate(() => {
        const state = window as unknown as { completionBackSamples: string[]; completionBackObserver: MutationObserver };
        state.completionBackObserver.disconnect();
        return state.completionBackSamples;
      });
      expect(panels.length).toBeGreaterThan(0);
      expect(panels.every(panel => panel === 'completion')).toBe(true);
      const step = page.locator('[data-completion-step="servicePrice"]');
      await expect(step).toContainText((locale === 'es' ? es : en).proPanel.completion.servicePriceBenefit);
      await step.click();
      const field = page.locator('[data-service-price-field]');
      await expect(field).toBeVisible();
      await expect.poll(async () => field.evaluate(node => {
        const body = node.closest('.overflow-y-auto')!;
        const bounds = body.getBoundingClientRect();
        const rect = node.getBoundingClientRect();
        return Math.abs((rect.top + rect.bottom) / 2 - (bounds.top + bounds.bottom) / 2);
      })).toBeLessThan(100);
    } finally { await cleanupDisposableAccount(account); }
  });
}

test('price notifications explain the benefit consistently in both languages', () => {
  for (const locale of ['es', 'en'] as const) {
    const copy = localizedNotificationCopy({ type: 'agrega_precio', title: '', message: '', data: {} }, locale);
    expect(copy.title).toBe((locale === 'es' ? es : en).proPanel.completion.servicePrice);
    expect(copy.message).toBe((locale === 'es' ? es : en).proPanel.completion.servicePriceBenefit);
  }
});
