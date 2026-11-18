import { test, expect, chromium } from 'playwright/test';
import { execFileSync } from 'node:child_process';
import { createDisposableAccount, cleanupDisposableAccount } from '../e2e/disposable-account';
import { regressionAdminClient } from '../e2e/seed';
import { NATIVE_ONBOARDING_COMPLETED_KEY } from '@/lib/mobile-onboarding';
const adb = process.env.E2E_ADB_PATH ?? `${process.env.ANDROID_HOME}/platform-tools/adb`;
test('Android WebView opens shared profiles and displays complete localized notices without push delivery', async () => {
  test.setTimeout(180_000);
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
  // Only the disposable emulator is eligible for a fresh-install state reset.
  expect(execFileSync(adb, ['shell', 'getprop', 'ro.kernel.qemu'], { encoding: 'utf8' }).trim()).toBe('1');
  execFileSync(adb, ['shell', 'pm', 'clear', 'com.contratacr.app']);
  execFileSync(adb, ['shell', 'am', 'force-stop', 'com.contratacr.app']);
  execFileSync(adb, ['shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'https://contratacr.com/perfil-prueba-inexistente', 'com.contratacr.app']);
  let socket = '';
  await expect.poll(() => {
    socket = execFileSync(adb, ['shell', 'cat', '/proc/net/unix'], { encoding: 'utf8' }).match(/@(webview_devtools_remote_\d+)/)?.[1] ?? '';
    return Boolean(socket);
  }).toBe(true);
  execFileSync(adb, ['forward', 'tcp:9224', `localabstract:${socket}`]);
  const account = await createDisposableAccount({ prefix: 'android-links-notices' });
  const db = regressionAdminClient();
  const browser = await chromium.connectOverCDP(process.env.E2E_ANDROID_CDP_URL ?? 'http://127.0.0.1:9224');
  const page = browser.contexts()[0].pages()[0];
  const base = process.env.E2E_ANDROID_APP_URL ?? 'http://localhost:3000';
  try {
    await expect(page).toHaveURL(/\/profesionales\/perfil-prueba-inexistente$/);
    await expect(page.getByTestId('native-first-run-onboarding')).toBeHidden();
    expect(await page.evaluate(key => localStorage.getItem(key), NATIVE_ONBOARDING_COMPLETED_KEY)).not.toBe('1');
    await page.addInitScript(key => localStorage.setItem(key, '1'), NATIVE_ONBOARDING_COMPLETED_KEY);
    await page.context().clearCookies();
    await page.goto(`${base}/login`);
    const portada = page.locator('.ccr-login-portada');
    if (await portada.isVisible()) await portada.getByRole('button', { name: /Inicia sesión|Log in/i }).first().click();
    await page.locator('main input[type=email]').fill(account.email);
    await page.locator('main input[type=password]').fill(account.password);
    await page.locator('main').getByRole('button', { name: /Ingresar|Sign in/i }).first().click();
    await page.waitForURL(/dashboard\/profesional/);
    const { error } = await db.from('notifications').insert({ user_id: account.id, type: 'counterparty_account_deleted', title: 'Legacy title', message: 'Persona de prueba eliminó su cuenta de ContrataCR.', read: true, data: { push_suppressed: true, link: '/dashboard/profesional?tab=soporte' } });
    if (error) throw error;
    for (const locale of ['', '/en']) {
      await page.goto(`${base}${locale}/notificaciones`);
      await page.getByRole('button').filter({ hasText: 'Persona de prueba' }).first().click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('heading')).toHaveText(locale ? 'Account deleted' : 'Cuenta eliminada');
      await expect(dialog.getByRole('button', { name: locale ? 'Contact support' : 'Contactar soporte', exact: true })).toBeVisible();
      expect(await dialog.getByRole('heading').evaluate(el => el.scrollWidth <= el.clientWidth && getComputedStyle(el).textOverflow !== 'ellipsis')).toBe(true);
      await page.screenshot({ path: `/tmp/contratacr-native-notice-${locale ? 'en' : 'es'}.png` });
      await dialog.getByRole('button', { name: locale ? 'Got it' : 'Entendido', exact: true }).click();
    }
    execFileSync(adb, ['shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'https://contratacr.com/perfil-prueba-inexistente', 'com.contratacr.app']);
    await expect(page).toHaveURL(/\/profesionales\/perfil-prueba-inexistente$/);
    execFileSync(adb, ['shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'https://www.contratacr.com/en/notificaciones', 'com.contratacr.app']);
    await expect(page).toHaveURL(/\/en\/notificaciones$/);
    await expect(page.getByText('Persona de prueba', { exact: false }).first()).toBeVisible();
  } finally { await cleanupDisposableAccount(account); await browser.close(); }
});
