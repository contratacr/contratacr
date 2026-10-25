import { waitForInteractivePage } from './helpers';
import { test, expect } from 'playwright/test';
import { appBannerPresentation } from '../../src/lib/mobile/smart-app-banner';

const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const android = 'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36';
const iosBrowsers = [
  ['Safari', iphone],
  ['Chrome', iphone + ' CriOS/142.0'],
  ['Firefox', iphone + ' FxiOS/144.0'],
  ['Edge', iphone + ' EdgiOS/142.0'],
  ['DuckDuckGo', iphone + ' DuckDuckGo/7'],
  ['Instagram', iphone + ' Instagram 400'],
  ['Facebook', iphone + ' [FBAN/FBIOS]'],
  ['Google', iphone + ' GSA/300.0'],
] as const;
const androidBrowsers = [
  ['Chrome', android],
  ['Samsung Internet', android + ' SamsungBrowser/28.0'],
  ['Firefox', 'Mozilla/5.0 (Android 15; Mobile; rv:158.0) Gecko/158.0 Firefox/158.0'],
  ['Edge', android + ' EdgA/142.0'],
  ['Instagram', android + ' Instagram 400'],
  ['Facebook', android + ' [FBAN/FB4A]'],
] as const;

test('banner ownership is exclusive for browser, home-screen web app and native app', () => {
  for (const [name, ua] of iosBrowsers) {
    expect(appBannerPresentation(ua, 5)).toBe(name === 'Safari' ? 'apple' : 'web');
    expect(appBannerPresentation(ua, 5, true)).toBe('web');
    expect(appBannerPresentation(ua, 5, false, true)).toBe('none');
  }
  for (const [, ua] of androidBrowsers) {
    expect(appBannerPresentation(ua, 5)).toBe('web');
    expect(appBannerPresentation(ua, 5, true)).toBe('web');
    expect(appBannerPresentation(ua, 5, false, true)).toBe('none');
  }
  expect(appBannerPresentation('Mozilla/5.0 (Windows NT 10.0) Chrome/142.0')).toBe('none');
});

// UA + lookup fixtures test web presentation and link construction only.
// They do not certify another mobile browser's actual external-app handoff.
for (const [name, ua] of [...iosBrowsers, ...androidBrowsers]) {
 const ios = ua.includes('iPhone');
 test(`single notice and localized destination: ${ios ? 'iOS' : 'Android'} ${name} (presentation fixture)`, async ({ browser, baseURL }) => {
  test.skip(test.info().project.name !== (ios ? 'webkit-mobile' : 'chromium-mobile'), 'One matching rendering engine per platform');
  for (const detected of [false, true]) {
   const context = await browser.newContext({userAgent: ua, viewport: {width: 390, height: 844}});
   try {
    await context.addInitScript(detected => Object.defineProperty(navigator, 'getInstalledRelatedApps', {configurable: true, value: async () => detected ? [{platform: 'play', id: 'com.contratacr.app'}] : []}), detected);
    const page = await context.newPage();
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    for (const locale of ['es', 'en']) {
     await page.goto(`${baseURL}${locale === 'en' ? '/en/proyectos' : '/proyectos'}`);
     await waitForInteractivePage(page);
     const apple = page.locator('meta[name="apple-itunes-app"]');
     const own = page.getByTestId('mobile-app-download');
     if (ios && name === 'Safari') {
      await expect(apple).toHaveCount(1);
      await expect(own).toHaveCount(0);
     } else {
      await expect(apple).toHaveCount(0);
      await expect(own).toHaveCount(1);
      const action = own.getByRole('link');
      await expect(action).toHaveText(ios || detected ? (locale === 'en' ? 'Open app' : 'Abrir app') : (locale === 'en' ? 'Use app' : 'Usar app'));
      await expect(own.getByTestId('app-platform-label')).toHaveText(`${locale === 'en' ? 'for' : 'para'} ${ios ? 'iOS' : 'Android'}`);
      await expect(action).toHaveAttribute('href', ios ? /^https:\/\/(?:www\.)?contratacr\.com\/(?:en\/)?proyectos\?_ccr_open=ios$/ : /^intent:\/\/contratacr.com\/(?:en\/)?proyectos#Intent;/);
     }
    }
    expect(errors).toEqual([]);
   } finally {await context.close();}
  }
 });
}

// A real CI failure crossed a minute boundary (SSR 12 min, hydration 13 min).
// A skewed device clock makes that race deterministic without suppressing errors.
test('project dates hydrate without errors when the device clock differs', async ({page}) => {
 const errors: string[] = [];
 page.on('pageerror', error => errors.push(error.message));
 await page.addInitScript(() => {
  const now = Date.now.bind(Date);
  Date.now = () => now() + 120_000;
 });
 await page.goto('/proyectos');
 await waitForInteractivePage(page);
 await expect(page.locator('[data-marketplace-row="proyectos"]').first()).toBeVisible();
 expect(errors).toEqual([]);
});
