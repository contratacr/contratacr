import { test, expect, type Page } from 'playwright/test';
import { createDisposableAccount, cleanupDisposableAccount, type DisposableAccount } from './disposable-account';
import { gotoOK, loginAs, waitForInteractivePage } from './helpers';
import { canRunSeededRegression, ensureRegressionSeed } from './seed';

async function swipe(page: Page, x = 8, y = 250, endX = 180, endY = 255, selector = 'main', cancel = false, compatibilityClick = false) {
  await page.locator(selector).first().evaluate((target, args) => {
    const touch = (x: number, y: number) => ({ identifier: 1, target, clientX: x, clientY: y });
    const emit = (name: string, touches: unknown[], changedTouches: unknown[] = []) => {
      const event = new Event(name, { bubbles: true, cancelable: true });
      Object.defineProperties(event, { touches: { value: touches }, changedTouches: { value: changedTouches } });
      target.dispatchEvent(event);
    };
    emit('touchstart', [touch(args.x, args.y)]);
    emit('touchmove', [touch(args.endX, args.endY)]);
    emit(args.cancel ? 'touchcancel' : 'touchend', [], [touch(args.endX, args.endY)]);
    // A compatibility click belongs to the same browser gesture, not a later
    // Playwright round trip that may outlast the app's suppression interval.
    if (args.compatibilityClick) target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: args.endX, clientY: args.endY }));
  }, { x, y, endX, endY, cancel, compatibilityClick });
}

for (const environment of ['responsive web', 'native app'] as const) {
  test(`${environment}: edge swipe walks back through the service picker without selecting a service`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    if (environment === 'native app') await native(page, baseURL!);
    await gotoOK(page, '/publicar-proyecto?returnTo=%2Fproyectos');
    await page.getByRole('button', { name: /Ej\.: plomería, electricista, pintura/ }).first().click();
    const sheet = page.getByTestId('category-picker-sheet');
    await expect(sheet.getByText('Elige el servicio')).toBeVisible();
    await expect(sheet.locator('[data-native-back="category-picker"]')).toBeVisible();

    // Rows are buttons: a horizontal swipe must go back, not choose Agro.
    await swipe(page, 8, 360, 180, 365, '[data-testid="category-picker-options"] button');
    await expect(sheet).toHaveCount(0);
    await expect(page).toHaveURL(/\/publicar-proyecto/);

    await page.getByRole('button', { name: /Ej\.: plomería, electricista, pintura/ }).first().click();
    const category = sheet.getByTestId('category-picker-options').getByRole('button').first();
    const categoryLabel = (await category.innerText()).replace(/\s+/g, ' ').trim();
    await category.click();
    await expect(sheet.getByTestId('category-picker-options').getByRole('button', { name: 'Volver a servicios' })).toBeVisible();
    await swipe(page, 8, 360, 180, 365, '[data-testid="category-picker-options"]');
    await expect(sheet.getByRole('button', { name: categoryLabel, exact: true })).toBeVisible();
    await swipe(page, 8, 360, 180, 365, '[data-testid="category-picker-options"] button');
    await expect(sheet).toHaveCount(0);
  });

  test(`${environment}: service categories return to the index by swipe`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    if (environment === 'native app') await native(page, baseURL!);
    await gotoOK(page, '/servicios');
    await waitForInteractivePage(page);
    await page.locator('[data-services-mobile] button').filter({ hasText: 'Hogar' }).first().click();
    await expect(page.locator('[data-native-back="service-group"]')).toBeVisible();
    await swipe(page, 8, 350, 180, 355, '[data-services-mobile] main, [data-services-mobile]');
    await expect(page.locator('[data-native-back="service-group"]')).toHaveCount(0);
    await expect(page).toHaveURL(/\/servicios$/);
  });

  test(`${environment}: job and promotion details return to their boards by swipe`, async ({ page, baseURL }) => {
    test.skip(!canRunSeededRegression(), 'Requires isolated regression publications.');
    await page.setViewportSize({ width: 390, height: 844 });
    if (environment === 'native app') await native(page, baseURL!);
    const seed = await ensureRegressionSeed();
    for (const [path, backControl, destination] of [
      [`/empleos/${seed.publishedJobId}`, 'job-detail', /\/empleos$/],
      [`/promociones/${seed.publishedOfferId}`, 'offer-detail', /\/promociones$/],
    ] as const) {
      await gotoOK(page, path);
      await waitForInteractivePage(page);
      await expect(page.locator(`[data-native-back="${backControl}"]`)).toBeVisible();
      await swipe(page, 8, 350, 180, 355, 'main');
      await expect(page).toHaveURL(destination);
    }
  });
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
    const row = document.createElement('button');
    row.id = 'qa-row';
    row.style.cssText = 'position:fixed;top:230px;left:0;width:80px;height:50px;z-index:99999';
    row.onclick = () => { row.dataset.calls = String(Number(row.dataset.calls ?? 0) + 1); };
    document.body.append(row);
    const input = document.createElement('input');
    input.id = 'qa-input';
    input.style.cssText = 'position:fixed;top:300px;left:0;width:80px;height:40px;z-index:99999';
    document.body.append(input);
    const rail = document.createElement('div');
    rail.id = 'qa-rail';
    rail.style.cssText = 'position:fixed;top:360px;left:0;width:80px;height:45px;overflow-x:auto;z-index:99999';
    const railContent = document.createElement('div');
    railContent.style.width = '300px';
    railContent.style.height = '45px';
    rail.append(railContent);
    document.body.append(rail);
  });
  const button = page.locator('[data-native-back="qa"]');
  await swipe(page, 120); // not an edge gesture
  await swipe(page, 8, 250, 20, 450); // vertical scroll
  await swipe(page, 8, 250, 40, 251); // incomplete
  await swipe(page, 8, 250, 180, 255, 'main', true); // system cancellation
  await swipe(page, 8, 320, 180, 325, '#qa-input'); // editable fields keep their own gesture
  await swipe(page, 8, 380, 180, 385, '#qa-rail > div'); // horizontal rails keep their scroll
  await expect(button).not.toHaveAttribute('data-calls');
  await swipe(page, 8, 250, 180, 255, '#qa-row', false, true);
  await expect(button).toHaveAttribute('data-calls', '1');
  await expect(page.locator('#qa-row')).not.toHaveAttribute('data-calls');
  await page.evaluate(() => {
    const cover = document.createElement('div'); cover.id = 'qa-cover';
    cover.style.cssText = 'position:fixed;inset:0;z-index:100000;background:white'; document.body.append(cover);
  });
  await swipe(page, 8, 250, 180, 255, '#qa-cover');
  await expect(button).toHaveAttribute('data-calls', '1');
  await page.locator('#qa-cover').evaluate(el => el.remove());
  await button.evaluate(el => el.remove());
  await page.locator('#qa-row').evaluate(el => el.remove());
  await page.locator('#qa-input').evaluate(el => el.remove());
  await page.locator('#qa-rail').evaluate(el => el.remove());
  await swipe(page);
  await expect(page).toHaveURL(/\/$/); // root never leaves the app
});

test('native account and privacy swipe returns to Mi perfil without skipping the panel', async ({ page, baseURL }) => {
  test.skip(!canRunSeededRegression(), 'Requires an isolated regression database.');
  test.setTimeout(120_000);
  let account: DisposableAccount | undefined;
  try {
    await page.setViewportSize({ width: 390, height: 844 });
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
