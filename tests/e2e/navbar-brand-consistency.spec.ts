import { test, expect } from "playwright/test";
import { gotoOK, waitForInteractivePage } from "./helpers";

test("navbar logo stays identical without web fonts across public routes", async ({ page }) => {
  // Reproduce a cold/slow font request: the logo must not fall back to Arial.
  await page.route(/\.woff2(?:\?.*)?$/, route => route.abort());
  for (const path of ["/", "/registro", "/login", "/proyectos", "/promociones", "/empleos"]) {
    await gotoOK(page, path);
    await waitForInteractivePage(page);
    // Marketplace mobile headers intentionally show only the mark + section
    // title. The full brand lives in their shared navigation drawer.
    const marketplace = (page.viewportSize()?.width ?? 1440) < 1024 && ["/proyectos", "/promociones", "/empleos"].includes(path);
    if (marketplace) await page.getByRole("button", { name: /abrir menú/i }).filter({ visible: true }).click();
    const surface = marketplace ? page.getByRole("dialog").filter({ visible: true }) : page.locator("header");
    const wordmark = surface.locator('img[src="/brand/wordmark-light.svg"]').filter({ visible: true });
    await expect(wordmark).toHaveCount(1);
    await expect.poll(() => wordmark.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    const box = await wordmark.boundingBox();
    expect(box!.width).toBeCloseTo(105, 2);
    expect(box!.height).toBeCloseTo(24, 2);
    // Measure visible ink, including transparent padding inside the mark.
    const measureVisibleGap = () => wordmark.evaluate(async (word: HTMLImageElement) => {
      const mark = word.previousElementSibling as HTMLImageElement;
      await Promise.all([mark.decode(), word.decode()]);
      const ink = (img: HTMLImageElement) => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const context = canvas.getContext("2d")!;
        context.drawImage(img, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let left = canvas.width, right = -1;
        for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
          if (pixels[(y * canvas.width + x) * 4 + 3] > 32) {
            left = Math.min(left, x);
            right = Math.max(right, x);
          }
        }
        const rect = img.getBoundingClientRect();
        return { left: rect.left + left / canvas.width * rect.width, right: rect.left + (right + 1) / canvas.width * rect.width };
      };
      return ink(word).left - ink(mark).right;
    });
    await expect.poll(measureVisibleGap).toBeGreaterThanOrEqual(4);
    await expect.poll(measureVisibleGap).toBeLessThanOrEqual(6);
  }
});

// Section names replace the wordmark, not the geometry of the brand lockup.
test("section headers keep home mark size and title spacing", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoOK(page, "/");
  const home = page.locator('header img[src="/brand/wordmark-light.svg"]').filter({ visible: true }).first();
  await expect(home).toBeVisible();
  const homeGap = await home.evaluate(word => word.getBoundingClientRect().left - word.previousElementSibling!.getBoundingClientRect().right);
  for (const path of ["/proyectos", "/empleos", "/promociones", "/servicios", "/en/proyectos"]) {
    await gotoOK(page, path);
    const brand = page.locator("[data-ccr-section-brand]").filter({ visible: true }).first();
    await expect(brand).toBeVisible();
    const geometry = await brand.evaluate(el => {
      const mark = el.querySelector("img")!, title = el.querySelector("[data-ccr-section-title]")!;
      const m = mark.getBoundingClientRect(), t = title.getBoundingClientRect();
      return { gap: t.left - m.right, width: m.width, height: m.height, font: getComputedStyle(title).fontSize, overflow: el.scrollWidth > el.clientWidth };
    });
    expect(geometry.gap, path).toBeCloseTo(homeGap, 1);
    expect(geometry.width, path).toBe(32);
    expect(geometry.height, path).toBe(32);
    expect(geometry.font, path).toBe("19px");
    expect(geometry.overflow, path).toBe(false);
    await expect(brand.getByRole("link", { name: "ContrataCR", exact: true })).toHaveAttribute("href", /^(?:\/en)?\/?$/);
  }
});

test("mobile search text aligns across both fields and all four search surfaces", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/buscar", "/proyectos", "/empleos", "/promociones", "/en/buscar"]) {
    await gotoOK(page, path);
    const entry = path.includes("buscar") ? page.locator("header").getByRole("button", { name: /What service are you looking for|Qué servicio estás buscando/i }).filter({ visible: true }).first() : page.locator(".ccr-marketplace-sticky input").filter({ visible: true }).first();
    await expect(entry).toBeVisible();
    await entry.click();
    const sheet = page.locator(".ccr-native-search-panel, .ccr-hoja-buscador").filter({ visible: true });
    await expect(sheet).toBeVisible();
    const fields = sheet.locator("input");
    await expect(fields).toHaveCount(2);
    const measure = () => fields.evaluateAll(inputs => inputs.map(input => {
      const css = getComputedStyle(input);
      return { x: input.getBoundingClientRect().left + parseFloat(css.paddingLeft), font: css.fontSize, color: css.color, placeholder: getComputedStyle(input, "::placeholder").color };
    }));
    for (const filled of [false, true]) {
      if (filled) { await fields.nth(0).fill("Fontanería"); await fields.nth(1).fill("San José"); }
      const [primary, location] = await measure();
      expect(primary.x, path).toBeCloseTo(location.x, 1);
      expect(primary.font, path).toBe(location.font);
      expect(primary.color, path).toBe(location.color);
      expect(primary.placeholder, path).toBe(location.placeholder);
    }
    // Clearing does not move either text origin, and Back remains actionable.
    await fields.nth(0).fill(""); await fields.nth(1).fill("");
    const [primary, location] = await measure();
    expect(primary.x, path).toBeCloseTo(location.x, 1);
    await sheet.getByRole("button", { name: /^(Volver|Back)$/i }).click();
    await expect(sheet).toBeHidden();
  }
});

// Render the actual branded, interior/back and full-screen form headers with
// the real generated stylesheet. No authenticated fixture or backend is needed.
test("all navbar title variants keep the same typography at every breakpoint", async ({ page }) => {
  const { build } = await import("esbuild");
  const { readFileSync } = await import("node:fs");
  const postcss = (await import("postcss")).default;
  const tailwind = (await import("@tailwindcss/postcss")).default;
  const css = await postcss([tailwind()]).process(readFileSync("src/app/globals.css", "utf8"), { from: "src/app/globals.css" });
  const mocks: Record<string, string> = {
    "@/i18n/navigation": "import React from 'react'; export const Link=({children,...props})=>React.createElement('a',props,children);",
    "@/components/layout/navbar": "export const Navbar=()=>null;",
    "@/components/landing/landing-navbar": "export {ContrataCRLogo,ContrataCRMark} from '@/components/brand/brand-logo';",
    "@/hooks/use-native-app": "export const useNativeFullscreenLayer=()=>{};",
  };
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React,{useState} from 'react';import{createRoot}from'react-dom/client';
    import{SectionBrand}from'./src/components/layout/section-brand';
    import{FocusedHeader}from'./src/components/layout/focused-header';
    import{Modal}from'./src/components/ui/modal';
    function App(){const[open,setOpen]=useState(false);const[presentation,setPresentation]=useState("fullscreen");window.openTitleForm=(value)=>{setPresentation(value);setOpen(true)};return <>
      <SectionBrand title="Notificaciones"/>
      <FocusedHeader title="Configuración de la cuenta con un título largo" onBack={()=>window.backClicks=(window.backClicks||0)+1}/>
      <Modal open={open} onClose={()=>setOpen(false)} mobilePresentation={presentation} title="Editar publicación con un título largo" backLabel="Volver al formulario"><p>Formulario</p></Modal>
    </>}createRoot(document.getElementById('root')).render(<App/>);` }, bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", plugins: [{ name: "title-transports", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: "title-transports" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "title-transports" }, args => ({ contents: mocks[args.path], resolveDir: process.cwd() }));
    } }] });
  await page.route("**/navbar-title-harness", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}</style><div id="root"></div>` }));
  await page.goto("/navbar-title-harness");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const typography = () => page.locator("[data-ccr-section-title], header h1, [role=dialog] h2").evaluateAll(elements => elements.map(el => {
      const style = getComputedStyle(el);
      return { size: style.fontSize, weight: style.fontWeight, line: style.lineHeight };
    }));
    await expect.poll(typography).toEqual(Array.from({ length: 2 }, () => ({ size: "19px", weight: "800", line: "24px" })));
    await page.getByRole("button", { name: "Volver", exact: true }).click();
    for (const presentation of ["fullscreen", "sheet", "sheet-compact"]) {
      await page.evaluate(value => (window as unknown as {openTitleForm:(value:string)=>void}).openTitleForm(value), presentation);
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect.poll(typography).toEqual(Array.from({ length: 3 }, () => ({ size: "19px", weight: "800", line: "24px" })));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}/${presentation}`).toBe(true);
      await page.getByRole("button", { name: "Volver al formulario", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeHidden();
    }
  }
  expect(await page.evaluate(() => (window as unknown as {backClicks:number}).backClicks)).toBe(4);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await gotoOK(page, "/buscar");
    await waitForInteractivePage(page);
    await page.getByRole("button", { name: "Precio", exact: true }).filter({ visible: true }).click();
    const filter = page.getByRole("dialog", { name: "Precio", exact: true });
    await expect(filter).toBeVisible();
    expect(await filter.locator("h2").evaluate(el => ({ size: getComputedStyle(el).fontSize, weight: getComputedStyle(el).fontWeight, line: getComputedStyle(el).lineHeight }))).toEqual({ size: "19px", weight: "800", line: "24px" });
    await filter.getByRole("button", { name: "Cerrar", exact: true }).click();
    await expect(filter).toBeHidden();
  }
});
