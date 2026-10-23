import { build } from "esbuild";
import { test, expect } from "playwright/test";
import es from "../../messages/es.json";
import en from "../../messages/en.json";

for (const locale of ["es", "en"] as const) {
  test(`${locale}: hero keeps its first service and rotates without repeating it`, async ({ page }) => {
    const copy = (locale === "es" ? es : en).landing.hero;
    const bundle = await build({
      stdin: {
        contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {RodilloDeEjemplos} from './src/components/landing/rodillo-de-ejemplos';createRoot(document.getElementById('root')).render(<RodilloDeEjemplos/>);`,
        resolveDir: process.cwd(), loader: "tsx",
      },
      bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
      plugins: [{ name: "hero-translations", setup(b) {
        b.onResolve({ filter: /^next-intl$/ }, () => ({ path: "next-intl", namespace: "hero-translations" }));
        b.onLoad({ filter: /.*/, namespace: "hero-translations" }, () => ({ contents: `const copy=${JSON.stringify(copy)};export const useLocale=()=>${JSON.stringify(locale)};const t=key=>copy[key];t.raw=key=>copy[key];export const useTranslations=()=>t;` }));
      } }],
    });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.clock.install();
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const word = page.locator('#root > span > span:last-child > span > span:last-child');
    await expect(word).toHaveText(copy.ejemplosBusqueda[0]);
    let previous = await word.innerText();
    for (let i = 0; i < 10; i++) {
      await page.clock.runFor(3000);
      await expect(word).not.toHaveText(previous);
      previous = await word.innerText();
      expect(previous).not.toMatch(/un electricista|an electrician/);
    }
  });
}
