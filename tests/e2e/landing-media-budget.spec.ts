import { build } from "esbuild";
import { test, expect } from "playwright/test";
import { blockThirdParty, gotoOK, waitForInteractivePage } from "./helpers";

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
