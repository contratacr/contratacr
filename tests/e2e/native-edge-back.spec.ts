import { test, expect, type Page } from 'playwright/test';
import { createDisposableAccount, cleanupDisposableAccount, type DisposableAccount } from './disposable-account';
import { loginAs } from './helpers';
import { canRunSeededRegression } from './seed';

async function swipe(page: Page, x = 8, y = 250, endX = 180, endY = 255, selector = 'main', cancel = false) {
  await page.locator(selector).first().evaluate((target, args) => {
    const touch = (x: number, y: number) => ({ identifier: 1, target, clientX: x, clientY: y });
    const emit = (name: string, touches: unknown[], changedTouches: unknown[] = []) => {
      const event = new Event(name, { bubbles: true });
      Object.defineProperties(event, { touches: { value: touches }, changedTouches: { value: changedTouches } });
      target.dispatchEvent(event);
    };
    emit('touchstart', [touch(args.x, args.y)]);
    emit('touchmove', [touch(args.endX, args.endY)]);
    emit(args.cancel ? 'touchcancel' : 'touchend', [], [touch(args.endX, args.endY)]);
  }, { x, y, endX, endY, cancel });
}

async function native(page: Page, baseURL: string) {
  await page.context().addCookies([{ name: 'ccr_platform', value: 'native', url: baseURL }]);
  await page.addInitScript(() => {
    localStorage.setItem('ccr:native-first-run-onboarding:v12', '1');
    const bridge = { isNativePlatform: () => true };
    Object.defineProperty(window, 'Capacitor', { configurable: true, get: () => bridge, set: value => { Object.assign(bridge, value); bridge.isNativePlatform = () => true; } });
  });
}

test('native edge back respects direction, scrolling, controls, overlays and root screens', async ({ page, baseURL }) => {
  await native(page, baseURL!);
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/ccr-native-app/);
  // Instrument a visible section control without replacing the real bridge.
  await page.evaluate(() => {
    const button = document.createElement('button');
    button.dataset.nativeBack = 'qa';
    button.style.cssText = 'position:fixed;top:150px;left:100px;width:44px;height:44px;z-index:99999';
    button.onclick = () => { button.dataset.calls = String(Number(button.dataset.calls ?? 0) + 1); };
    document.body.append(button);
  });
  const button = page.locator('[data-native-back="qa"]');
  await swipe(page, 120); // not an edge gesture
  await swipe(page, 8, 250, 20, 450); // vertical scroll
  await swipe(page, 8, 250, 40, 251); // incomplete
  await swipe(page, 8, 250, 180, 255, 'main', true); // system cancellation
  await swipe(page, 8, 250, 180, 255, '[data-native-back="qa"]'); // interactive element
  await expect(button).not.toHaveAttribute('data-calls');
  await swipe(page);
  await expect(button).toHaveAttribute('data-calls', '1');
  await page.evaluate(() => {
    const cover = document.createElement('div'); cover.id = 'qa-cover';
    cover.style.cssText = 'position:fixed;inset:0;z-index:100000;background:white'; document.body.append(cover);
  });
  await swipe(page, 8, 250, 180, 255, '#qa-cover');
  await expect(button).toHaveAttribute('data-calls', '1');
  await page.locator('#qa-cover').evaluate(el => el.remove());
  await button.evaluate(el => el.remove());
  await swipe(page);
  await expect(page).toHaveURL(/\/$/); // root never leaves the app
});

test('native account and privacy swipe returns to Mi perfil without skipping the panel', async ({ page, baseURL }) => {
  test.skip(!canRunSeededRegression(), 'Requires an isolated regression database.');
  test.setTimeout(120_000);
  let account: DisposableAccount | undefined;
  try {
    await native(page, baseURL!);
    account = await createDisposableAccount({ prefix: 'edge-back' });
    await loginAs(page, account.email, account.password);
    await page.goto('/dashboard/profesional?tab=profile');
    for (const [id, content] of [['sec-cuenta', '[data-account-security]'], ['sec-privacidad', '[data-account-privacy]']]) {
      await page.locator(`#${id} > button`).click();
      await expect(page.locator(content)).toBeVisible();
      await expect(page.locator('[data-ccr-section-back]').filter({visible:true})).toBeVisible();
      await swipe(page);
      await expect(page.locator(content)).toBeHidden();
      await expect(page.locator(`#${id} > button`)).toBeVisible();
      await expect(page).toHaveURL(/tab=profile/);
    }
    await page.locator('#sec-basic > button').click();
    const name = page.locator('#sec-basic input[type="text"]').first();
    await name.fill('Cambios sin guardar QA');
    await swipe(page);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(name).toBeVisible();
    await expect(name).toHaveValue('Cambios sin guardar QA');
  } finally { if (account) await cleanupDisposableAccount(account); }
});
