import { test, expect } from 'playwright/test';
import { createDisposableAccount, cleanupDisposableAccount } from './disposable-account';
import { regressionAdminClient } from './seed';
import { loginAs, gotoOK, waitForInteractivePage } from './helpers';
import { NATIVE_ONBOARDING_COMPLETED_KEY } from '@/lib/mobile-onboarding';

for (const locale of ['es', 'en']) test(`notification cards have full titles and meaningful actions at narrow mobile widths (${locale})`, async ({ page, baseURL }, testInfo) => {
  test.setTimeout(150_000);
  const account = await createDisposableAccount({ prefix: 'notification-layout' });
  const db = regressionAdminClient();
  const en = locale === 'en';
  try {
    const { error } = await db.from('notifications').insert([
      { user_id: account.id, type: 'counterparty_account_deleted', title: 'Legacy long title', message: 'Persona de prueba eliminó su cuenta de ContrataCR. Tenían una conversación abierta; ya no aparece en tu panel y no hace falta que hagas nada. Si necesitas ayuda, escríbenos a soporte.', read: true, data: { push_suppressed: true, link: '/dashboard/profesional?tab=soporte' } },
      { user_id: account.id, type: 'verification_pending', title: 'Legacy title', message: '', read: true, data: { push_suppressed: true, link: '/dashboard/profesional?tab=verification' } },
    ]);
    if (error) throw error;
    await page.context().addCookies([{ name: 'ccr_platform', value: 'native', url: baseURL! }]);
    await page.addInitScript(key => localStorage.setItem(key, '1'), NATIVE_ONBOARDING_COMPLETED_KEY);
    await loginAs(page, account.email, account.password);
    await gotoOK(page, `${en ? '/en' : ''}/notificaciones`);
    await waitForInteractivePage(page);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      for (const item of [
        { text: /Persona de prueba/, title: en ? 'Account deleted' : 'Cuenta eliminada', action: en ? 'Contact support' : 'Contactar soporte' },
        { text: en ? /could not automatically confirm/ : /No pudimos confirmar automáticamente/, title: en ? 'Your verification is under review' : 'Tu verificación está en revisión', action: en ? 'Review verification' : 'Revisar verificación' },
      ]) {
        await page.getByRole('button').filter({ hasText: item.text }).first().click();
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByRole('heading', { name: item.title, exact: true })).toBeVisible();
        await expect(dialog.getByRole('button', { name: item.action, exact: true })).toBeVisible();
        const heading = dialog.getByRole('heading');
        expect(await heading.evaluate(el => ({ clipped: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1, ellipsis: getComputedStyle(el).textOverflow === 'ellipsis' }))).toEqual({ clipped: false, ellipsis: false });
        const box = await dialog.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
        await page.screenshot({ path: testInfo.outputPath(`notice-${locale}-${width}-${item.title.startsWith('Cuenta') || item.title.startsWith('Account') ? 'deleted' : 'verification'}.png`) });
        await dialog.getByRole('button', { name: en ? 'Got it' : 'Entendido', exact: true }).click();
        await expect(dialog).toHaveCount(0);
      }
    }
  } finally { await cleanupDisposableAccount(account); }
});
