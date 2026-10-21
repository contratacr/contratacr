import { test, expect } from 'playwright/test';
import { androidAppIntent, isInstalledAndroidApp } from '../../src/lib/mobile/android-app-entry';
import { campaignAppPath } from '../../src/lib/mobile/campaign-app-link';
import { APP_STORES } from '../../src/lib/app-stores';

test('Android entry is limited to public screens and fixes the package and fallback', () => {
  const intent = androidAppIntent('/en/profesionales?categoria=soldadura&_rsc=internal#resenas')!;
  expect(intent).toContain('intent://contratacr.com/en/profesionales?categoria=soldadura#resenas#Intent;scheme=https;package=com.contratacr.app;');
  expect(intent).toContain(`S.browser_fallback_url=${encodeURIComponent(APP_STORES.android)};end`);
  expect(intent).not.toContain('_rsc');
  expect(androidAppIntent('/proyectos/example?title=a;b#Intent;component=evil')).not.toContain(';component=evil');
  for (const path of ['/login', '/auth/callback?code=secret', '/admin', '/dashboard', '/empleos/publicar', '/#access_token=secret', '//other.test', '/profesionales?token=secret']) expect(androidAppIntent(path)).toBeNull();
  expect(campaignAppPath('https://www.contratacr.com/profesionales?categoria=soldadura')).toBe('/profesionales?categoria=soldadura');
  expect(campaignAppPath('https://other.contratacr.com/')).toBeNull();
  expect(campaignAppPath('https://www.contratacr.com/login')).toBeNull();
  expect(isInstalledAndroidApp([{ platform: 'play', id: 'com.contratacr.app' }])).toBe(true);
  expect(isInstalledAndroidApp([{ platform: 'webapp', id: 'com.contratacr.app' }, { platform: 'play', id: 'other.app' }])).toBeNull();
});

for (const state of ['installed', 'missing', 'unsupported', 'error', 'pending'] as const) {
  test(`Android banner has one dismissible action when ${state}`, async ({ page }) => {
    test.skip(!/Android/.test(await page.evaluate(() => navigator.userAgent)), 'Android web banner only');
    await page.addInitScript((state) => {
      Object.defineProperty(navigator, 'getInstalledRelatedApps', { configurable: true, value: state === 'unsupported' ? undefined : async () => {
        if (state === 'pending') return new Promise(() => {});
        if (state === 'error') throw new Error('Not available');
        return state === 'installed' ? [{ platform: 'play', id: 'com.contratacr.app' }] : [];
      } });
    }, state);
    await page.setViewportSize({ width: 320, height: 780 });
    await page.goto('/profesionales?categoria=soldadura#resenas');
    const banner = page.getByTestId('mobile-app-download');
    await expect(banner).toBeVisible();
    const action = banner.getByRole('link');
    const label = state === 'installed' ? 'Abrir app' : 'Usar app';
    await expect(action).toHaveText(label);
    await expect(banner.getByTestId('app-platform-label')).toHaveText('para Android');
    expect((await banner.getByTestId('app-platform-label').boundingBox())!.x + (await banner.getByTestId('app-platform-label').boundingBox())!.width).toBeLessThanOrEqual((await action.boundingBox())!.x);
    await expect(banner.getByRole('link')).toHaveCount(1);
    await expect(action).toHaveAttribute('href', /intent:\/\/contratacr.com\/profesionales\/soldadura#resenas#Intent/);
    await expect(page).toHaveURL(/\/profesionales\/soldadura#resenas$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await banner.getByRole('button').click();
    await expect(banner).toHaveCount(0);
    await page.reload();
    await expect(banner).toHaveCount(0);
  });
}

test('Android action refreshes on return from the store without exposing unrelated apps', async ({ page }) => {
  test.skip(!/Android/.test(await page.evaluate(() => navigator.userAgent)), 'Android web banner only');
  await page.addInitScript(() => {
    const state = window as unknown as { qaInstalled: boolean };
    state.qaInstalled = false;
    Object.defineProperty(navigator, 'getInstalledRelatedApps', { configurable: true, value: async () => state.qaInstalled ? [{ platform: 'play', id: 'com.contratacr.app' }] : [{ platform: 'play', id: 'unrelated.app' }] });
  });
  await page.goto('/proyectos');
  const action = page.getByTestId('mobile-app-download').getByRole('link');
  await expect(action).toHaveText('Usar app');
  await expect(action).toHaveAttribute('href', /^intent:/);
  await page.evaluate(() => { (window as unknown as { qaInstalled: boolean }).qaInstalled = true; window.dispatchEvent(new Event('pageshow')); });
  await expect(action).toHaveText('Abrir app');
  await expect(action).toHaveAttribute('href', /^intent:/);
  await page.evaluate(() => { (window as unknown as { qaInstalled: boolean }).qaInstalled = false; window.dispatchEvent(new Event('pageshow')); });
  await expect(action).toHaveText('Usar app');
  await expect(action).toHaveAttribute('href', /^intent:/);
});

test('installed Android action translates and updates when changing language',async({page})=>{
 test.skip(!/Android/.test(await page.evaluate(()=>navigator.userAgent)),'Android only');
 await page.addInitScript(()=>Object.defineProperty(navigator,'getInstalledRelatedApps',{configurable:true,value:async()=>[{platform:'play',id:'com.contratacr.app'}]}));
 await page.goto('/proyectos');
 const action=page.getByTestId('mobile-app-download').getByRole('link');
 await expect(action).toHaveText('Abrir app');
 await page.goto('/en/proyectos');
 await expect(action).toHaveText('Open app');
 await expect(action).toHaveAttribute('aria-label','Open app ContrataCR');
 await page.getByRole('button',{name:/Open menu|Abrir menú/}).filter({visible:true}).first().click();
 await page.getByRole('button',{name:'Español',exact:true}).filter({visible:true}).click();
 await expect(action).toHaveText('Abrir app');
});


test('published Android app can resolve home through its supported professional route', () => {
  for (const home of ['/', '/es', '/es/', '/en', '/en/']) {
    const intent = androidAppIntent(`${home}?utm_source=meta#servicios`)!;
    const entryUrl = intent.split('#Intent;')[0].replace('intent:', 'https:');
    const entry = new URL(entryUrl);
    expect(entry.hostname).toBe('contratacr.com');
    expect(entry.pathname).toBe(`${home.startsWith('/en') ? '/en' : home.startsWith('/es') ? '/es' : ''}/profesionales`);
    expect(entry.searchParams.get('_ccr_home')).toBe('1');
    const restored = campaignAppPath(entryUrl)!;
    expect(restored).toBe(`${home.startsWith('/en') ? '/en' : home.startsWith('/es') ? '/es' : '/'}?utm_source=meta#servicios`);
  }
  expect(campaignAppPath('https://contratacr.com/proyectos?_ccr_home=1')).toBe('/proyectos');
  expect(campaignAppPath('https://contratacr.com/profesionales?_ccr_home=https://evil.test')).toBe('/profesionales');
  expect(campaignAppPath('https://contratacr.com/profesionales?_ccr_home=1&access_token=secret')).toBeNull();
  expect(isInstalledAndroidApp([])).toBeNull();
});

test('undetected Android installation keeps a usable translated action and a compatible home intent', async ({ page }) => {
  test.skip(!/Android/.test(await page.evaluate(() => navigator.userAgent)), 'Android only');
  await page.addInitScript(() => Object.defineProperty(navigator, 'getInstalledRelatedApps', { configurable: true, value: async () => [] }));
  await page.goto('/');
  const action = page.getByTestId('mobile-app-download').getByRole('link');
  await expect(action).toHaveText('Usar app');
  await expect(action).toHaveAttribute('href', /intent:\/\/contratacr.com\/profesionales\?_ccr_home=1#Intent/);
  await page.goto('/en');
  await expect(action).toHaveText('Use app');
  await expect(action).toHaveAttribute('href', /intent:\/\/contratacr.com\/en\/profesionales\?_ccr_home=1#Intent/);
});
