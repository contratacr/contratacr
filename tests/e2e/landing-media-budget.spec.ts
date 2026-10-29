import { build } from "esbuild";
import { test, expect } from "playwright/test";
import { blockThirdParty, gotoOK, loginAs, waitForInteractivePage } from "./helpers";
import { canRunSeededRegression, E2E_USERS } from "./seed";

test("service tabs request their four photos before scrolling and retain visited groups", async ({ page }) => {
  await blockThirdParty(page);
  const requestedPhotos = new Set<string>();
  await page.route('https://images.unsplash.com/**', route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("w") !== "24") requestedPhotos.add(url.pathname);
    return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="navy"/></svg>' });
  });
  // Exercise two real groups regardless of the professional supply in the
  // isolated database. No production/test accounts need to be changed.
  const bundled = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {ServiciosPorSeccion} from './src/components/landing/servicios-por-seccion';
      const groups=[['hogar',['electricidad','plomeria','pintura','reparacion_electrodomesticos']],['tecnologia',['desarrollo_web','soporte_tecnico','redes_internet','reparacion_computadoras']]].map(([id,ids])=>({id,label:id,servicios:ids.map(id=>({id,label:id,href:'/profesionales/'+id}))}));
      createRoot(document.getElementById('root')).render(<div className="ccr-home-services-section"><ServiciosPorSeccion secciones={groups}/></div>);`, resolveDir: process.cwd(), loader: "tsx" },
    jsx: "automatic", bundle: true, write: false, platform: "browser", format: "iife", tsconfig: "tsconfig.json",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "navigation-boundary", setup(builder) {
      builder.onResolve({ filter: /^@\/i18n\/navigation$/ }, () => ({ path: "navigation", namespace: "test-navigation" }));
      builder.onLoad({ filter: /.*/, namespace: "test-navigation" }, () => ({ contents: `import React from 'react'; export const Link=({href,children,...props})=>React.createElement('a',{...props,href},children);`, resolveDir: process.cwd() }));
    } }],
  });
  // Far outside every engine's lazy-loading threshold: the four requests must
  // start together before the visitor scrolls, without requesting other groups.
  await page.route('**/landing-tabs-harness', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="root" style="margin-top:20000px"></div>' }));
  await page.goto('/landing-tabs-harness');
  await page.addScriptTag({ content: bundled.outputFiles[0].text });
  const section = page.locator(".ccr-home-services-section");
  const tabs = section.getByRole("tab");
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await expect(section.locator('[aria-hidden="true"] img')).toHaveCount(0);
  await expect(section.locator("img")).toHaveCount(4);
  await expect.poll(() => requestedPhotos.size).toBe(4);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  for (const photo of await section.locator("img").all()) {
    await expect(photo).toHaveAttribute("loading", "eager");
    await expect(photo).toHaveAttribute("src", /w=1100&auto=format&fit=crop&q=70/);
    await expect(photo).toHaveAttribute("srcset", /1100w/);
  }
  // Keyboard anticipation loads only the intended group, not every hidden tab.
  await tabs.nth(1).focus();
  await expect(section.locator("img")).toHaveCount(8);
  await expect.poll(() => requestedPhotos.size).toBe(8);
  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(section.getByRole("tabpanel").locator("img")).toHaveCount(4);
  const sources = await section.getByRole("tabpanel").locator("img").evaluateAll(imgs => imgs.map(img => (img as HTMLImageElement).src));
  await tabs.first().click();
  await tabs.nth(1).click();
  expect(await section.getByRole("tabpanel").locator("img").evaluateAll(imgs => imgs.map(img => (img as HTMLImageElement).src))).toEqual(sources);
  await expect(section.locator("img")).toHaveCount(8);
});

test("download artwork waits near the viewport without changing reserved height", async ({ page }) => {
  await gotoOK(page, "/");
  await waitForInteractivePage(page);
  const section = page.getByTestId("app-download-section");
  const artwork = page.getByTestId("app-download-artwork");
  // The section is well below the initial viewport on all three profiles.
  await expect(artwork).toHaveCount(0);
  const height = await section.evaluate(el => el.getBoundingClientRect().height);
  await section.scrollIntoViewIfNeeded();
  await expect(artwork).toBeVisible();
  await expect.poll(() => artwork.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(await section.evaluate(el => el.getBoundingClientRect().height)).toBeCloseTo(height, 0);
});

test("hero keeps its current photo while the next slide is downloading", async ({ page }) => {
  await page.clock.install();
  await blockThirdParty(page);
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  page.on("close", release);
  await page.route('https://images.unsplash.com/photo-1749532125405-70950966b0e5*', async route => {
    await gate;
    await route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="navy"/></svg>' });
  });
  await gotoOK(page, "/");
  await waitForInteractivePage(page);
  const first = page.locator('.ccr-hero-foto-capa').first();
  await expect.poll(() => first.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.clock.fastForward(7000);
  await expect(first).toHaveCSS('opacity', '1');
  const next = page.locator('.ccr-hero-foto-capa').nth(1);
  await expect(next).toHaveCount(1);
  await expect(next).toHaveCSS('opacity', '0');
  release();
  await expect.poll(() => next.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.clock.fastForward(7000);
  await expect(next).toHaveCSS('opacity', '1');
});


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


test.describe("home brand motion across sessions", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  async function comprobarAvanceContinuo(page: import("playwright/test").Page, sesion: string) {
    await gotoOK(page, "/");
    await waitForInteractivePage(page);
    const cinta = page.locator(".featured-brands-ribbon");
    await cinta.scrollIntoViewIfNeeded();
    const juegos = page.locator(".featured-brands-set");
    await expect(juegos).toHaveCount(4);
    await expect.poll(() => juegos.evaluateAll((items) => items.map((item) => item.getAnimations()[0]?.playState ?? "missing")), { timeout: 10_000 })
      .toEqual(["running", "running", "running", "running"]);
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const before = await juegos.evaluateAll((items) => items.map((item) => Number(item.getAnimations()[0]?.currentTime ?? -1)));
      await page.waitForTimeout(300);
      const after = await juegos.evaluateAll((items) => items.map((item) => Number(item.getAnimations()[0]?.currentTime ?? -1)));
      expect(after.every((time, index) => time > before[index]), `${sesion}: cada juego avanza en el ciclo ${cycle + 1}`).toBe(true);
      await expect.poll(() => juegos.evaluateAll((items) => items.map((item) => item.getAnimations()[0]?.playState ?? "missing")))
        .toEqual(["running", "running", "running", "running"]);
    }
  }

  test("la cinta de marcas sigue avanzando con una sesión anónima", async ({ page }) => {
    await comprobarAvanceContinuo(page, "sin sesión");
  });

  test("la cinta de marcas sigue avanzando con una sesión iniciada", async ({ page }) => {
    test.skip(!canRunSeededRegression(), "Requires the isolated regression account.");
    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    await comprobarAvanceContinuo(page, "sesión iniciada");
  });
});
