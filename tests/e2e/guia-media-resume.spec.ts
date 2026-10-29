import { build } from 'esbuild';
import { expect, test } from 'playwright/test';

// Real guide component; media transport is stubbed so lifecycle assertions do
// not depend on codecs. Physical iOS validates the native decoder separately.
for (const reduced of [false, true]) {
test(`guide media preserves step across app switches (reduced motion: ${reduced})`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const result = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import {GuiaDeLaApp} from './src/components/landing/guia-de-la-app';
      const pasos=['profesionales','proyectos','empleos','promociones'].map(clave=>({clave,titulo:clave,pestana:clave,texto:clave,cta:'Abrir',href:'/buscar',video:'/test-'+clave+'.mp4',poster:'/test-poster.png',alt:clave}));
      createRoot(document.getElementById('root')).render(<GuiaDeLaApp pasos={pasos}/>);` },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'navigation-boundary', setup(b) {
      b.onResolve({ filter: /^@\/i18n\/navigation$/ }, a => ({ path: a.path, namespace: 'navigation-stub' }));
      b.onLoad({ filter: /.*/, namespace: 'navigation-stub' }, () => ({ contents: 'import React from "react"; export const Link=({children,...props})=>React.createElement("a",props,children);', resolveDir: process.cwd() }));
    } }],
  });
  await page.route('**/guide-resume-harness', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="root"></div>' }));
  await page.route('**/test-*.mp4', r => r.fulfill({ status: 204 }));
  await page.goto('/guide-resume-harness');
  await page.evaluate(() => {
    // Exercise the old Safari-only branch on every configured engine.
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (iPhone) Version/26.0 Mobile Safari/605.1' });
    const playing = new WeakSet<HTMLMediaElement>();
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', { configurable: true, get() { return !playing.has(this); } });
    HTMLMediaElement.prototype.play = function () { playing.add(this); return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () { playing.delete(this); };
    window.IntersectionObserver = class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(target: Element) { this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
      disconnect() {} unobserve() {} takeRecords() { return []; }
    } as unknown as typeof IntersectionObserver;
  });
  await page.addScriptTag({ content: result.outputFiles[0].text });
  await expect(page.locator('video')).toHaveCount(4);
  await expect(page.locator('img[src^="blob:"], img[src*=".mp4"]')).toHaveCount(0);
  await page.getByRole('tab', { name: 'proyectos', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'proyectos', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.locator('video').nth(1).scrollIntoViewIfNeeded();
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pagehide'));
    });
    await expect.poll(() => page.locator('video').evaluateAll(v => v.every(e => (e as HTMLVideoElement).paused))).toBe(true);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pageshow'));
    });
    await expect(page.getByRole('tab', { name: 'proyectos', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => page.locator('video').nth(1).evaluate(v => (v as HTMLVideoElement).paused)).toBe(reduced);
  }
  await expect(page.locator('img[src^="blob:"], img[src*=".mp4"]')).toHaveCount(0);
});

}
