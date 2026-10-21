import { test, expect } from 'playwright/test';
import { iosAppEntry, iosAppStoreFallback } from '../../src/lib/mobile/ios-app-entry';
import { APP_STORES } from '../../src/lib/app-stores';
import { campaignAppPath } from '../../src/lib/mobile/campaign-app-link';

const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';

test('iOS entry switches associated hosts and preserves only a public app destination', () => {
  for (const host of ['contratacr.com', 'www.contratacr.com']) {
    const entry = new URL(iosAppEntry('/en/proyectos?categoria=limpieza&_rsc=internal#detalle', host)!);
    expect(entry.hostname).toBe(host === 'contratacr.com' ? 'www.contratacr.com' : 'contratacr.com');
    expect(entry.pathname).toBe('/en/proyectos');
    expect(entry.searchParams.get('_ccr_open')).toBe('ios');
    expect(entry.searchParams.get('categoria')).toBe('limpieza');
    expect(entry.searchParams.has('_rsc')).toBe(false);
    expect(entry.hash).toBe('#detalle');
    expect(campaignAppPath(entry.href)).toBe('/en/proyectos?categoria=limpieza#detalle');
    expect(iosAppStoreFallback(entry, iphone)).toBe(APP_STORES.ios);
  }
  for (const path of ['//evil.example/', '/login', '/admin', '/dashboard', '/proyectos/publicar', '/profesionales?code=secret', '/profesionales#access_token=secret']) {
    expect(iosAppEntry(path, 'contratacr.com')).toBeNull();
  }
});

test('iOS fallback requires the explicit marker and never redirects normal, auth or Android traffic', () => {
  for (const path of ['/proyectos', '/proyectos?_ccr_open=no', '/login?_ccr_open=ios', '/proyectos?_ccr_open=ios&access_token=secret']) {
    expect(iosAppStoreFallback(new URL(path, 'https://www.contratacr.com'), iphone)).toBeNull();
  }
  expect(iosAppStoreFallback(new URL('https://www.contratacr.com/proyectos?_ccr_open=ios'), 'Android Chrome')).toBeNull();
  const desktopModeIpad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';
  expect(iosAppStoreFallback(new URL('https://www.contratacr.com/proyectos?_ccr_open=ios'), desktopModeIpad)).toBe(APP_STORES.ios);
  expect(iosAppStoreFallback(new URL('https://www.contratacr.com/proyectos'), desktopModeIpad)).toBeNull();
});

test('unclaimed iPhone links reach the store before rendering, without caching or redirect loops', async ({ request }) => {
  for (const route of ['/profesionales/soldadura?categoria=soldadura&_ccr_open=ios', '/en/proyectos?_ccr_open=ios']) {
    const response = await request.get(route, { maxRedirects: 0, headers: { 'User-Agent': iphone } });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toBe(APP_STORES.ios);
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(response.headers().vary).toContain('User-Agent');
    expect(response.headers()['x-robots-tag']).toBe('noindex');
  }
});

for (const locale of ['es', 'en']) test(`iPhone has one localized action with a cross-host link at 320px (${locale})`, async ({ page }) => {
  test.skip(test.info().project.name !== 'webkit-mobile', 'iPhone presentation');
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(locale === 'en' ? '/en/proyectos?categoria=limpieza#detalle' : '/proyectos?categoria=limpieza#detalle');
  const notice = page.getByTestId('mobile-app-download');
  const action = notice.getByRole('link');
  await expect(action).toHaveText(locale === 'en' ? 'Open app' : 'Abrir app');
  await expect(notice.getByTestId('app-platform-label')).toHaveText(locale === 'en' ? 'for iOS' : 'para iOS');
  await expect(action).toHaveAttribute('href', /https:\/\/www\.contratacr\.com\/.*_ccr_open=ios/);
  await expect(notice.getByRole('link')).toHaveCount(1);
  await expect(page.locator('meta[name="apple-itunes-app"]')).toHaveCount(0);
  const geometry = await notice.locator('aside').evaluate(el => {
    const action = el.querySelector('a')!.getBoundingClientRect();
    const logo = el.querySelector('img')!.getBoundingClientRect();
    return { overflow: el.scrollWidth > el.clientWidth, sameRow: Math.abs(action.y + action.height / 2 - logo.y - logo.height / 2) < 3 };
  });
  expect(geometry).toEqual({ overflow: false, sameRow: true });
  // Exercise the real tap without invoking the OS or an actual store install.
  await action.evaluate(el => el.addEventListener('click', event => {
    if (event.defaultPrevented) throw Error('App entry tap was cancelled');
    sessionStorage.setItem('qa:ios-tap', (el as HTMLAnchorElement).href);
    event.preventDefault();
  }));
  await action.click();
  const target = new URL(await page.evaluate(() => sessionStorage.getItem('qa:ios-tap')) as string);
  expect(target.hostname).toBe('www.contratacr.com');
  expect(target.searchParams.get('categoria')).toBe('limpieza');
  expect(target.hash).toBe('#detalle');
});

 test('native WebView does not bounce a marked link back to the App Store', async ({ request }) => {
  const response = await request.get('/en/proyectos?_ccr_open=ios', { maxRedirects: 0, headers: { 'User-Agent': iphone, Cookie: 'ccr_platform=native' } });
  expect(response.headers().location).not.toBe(APP_STORES.ios);
  expect(response.status()).toBe(200);
 });

test('SSR ignores forged source-host headers and already exposes the localized app action', async ({ request, baseURL }) => {
  const response = await request.get('/en/proyectos', { headers: { 'User-Agent': iphone, 'x-ccr-app-host': 'www.contratacr.com' } });
  const html = await response.text();
  expect(response.status()).toBe(200);
  const otherHost = new URL(baseURL!).hostname === "www.contratacr.com" ? "contratacr.com" : "www.contratacr.com";
  expect(html).toContain(`href="https://${otherHost}/en/proyectos?_ccr_open=ios"`);
  expect(html).toContain('Open app');
  expect(html).not.toContain('name="apple-itunes-app"');
});
