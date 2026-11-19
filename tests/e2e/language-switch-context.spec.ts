import { test, expect } from 'playwright/test';
import { gotoOK, expectNoRawI18nKeys, waitForInteractivePage } from './helpers';

for (const pathname of ['/servicios', '/empleos', '/promociones']) {
  test(`ES/EN switch preserves route, query and anchor on ${pathname}`, async ({ page, context }) => {
    await gotoOK(page, `${pathname}?regression_context=keep#contenido`);
    // The switcher (and the mobile menu) are server-rendered buttons: a press
    // before hydration does nothing. Wait for the navbar to hydrate, as a person
    // would see it respond, before pressing it.
    await waitForInteractivePage(page);
    for (const locale of ['en', 'es'] as const) {
      const mobile = (page.viewportSize()?.width ?? 1366) < 1024;
      if (mobile) {
        await page.getByRole('button', { name: /Abrir men|Open menu/ }).first().click();
        await page.getByRole('dialog').getByRole('button', { name: locale === 'en' ? 'English' : 'Español', exact: true }).click();
      } else {
        await page.getByRole('button', { name: locale === 'en' ? 'Switch to English' : 'Cambiar a español', exact: true }).click();
      }
      await expect(page).toHaveURL(new RegExp(`${locale === 'en' ? '/en' : ''}${pathname}\\?regression_context=keep#contenido$`));
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('html')).not.toHaveAttribute('data-locale-switch', '1');
      await expectNoRawI18nKeys(page);
      const cookie = (await context.cookies()).find(c => c.name === 'NEXT_LOCALE');
      expect(cookie?.value).toBe(locale);
      expect(cookie?.expires).toBeGreaterThan(Date.now() / 1000 + 86400);
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await waitForInteractivePage(page);
    }
  });
}
