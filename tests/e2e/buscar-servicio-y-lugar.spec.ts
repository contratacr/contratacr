import { test, expect, type Page } from "playwright/test";
import { gotoOK, isMobileProject } from "./helpers";
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";



// PONER UN CAMPO NO PUEDE BORRAR EL OTRO.
// La ubicación elegida se MUESTRA con la provincia detrás («Atenas, Alajuela»)
// y se guarda con su rótulo corto («Atenas»): comparados a secas no coincidían,
// así que al elegir el servicio la ubicación se daba por perdida y la búsqueda
// salía a todo el país. Y el servicio recién elegido no se veía todavía desde
// la función que arma la dirección, que entonces salía a ADIVINARLO del texto
// escrito —y podía adivinar otro—.
async function elegirServicio(page: Page, texto: string) {
  // Hay que ESPERAR a que el botón del buscador pinte. Con `isVisible()` a secas
  // se consultaba en el instante de la carga: si todavía no estaba, el ayudante
  // se saltaba el clic y después esperaba un campo que nadie había abierto —por
  // eso fallaba solo con `?provincia=sj` y no con la búsqueda que ya traía cantón.
  const abrir = page.getByRole("button", { name: /Qué servicio|What service|Atenas|Profesionales/i }).filter({ visible: true }).first();
  await expect(abrir).toBeVisible();
  const campo = page.getByRole("combobox", { name: /^Servicio$|^Service$/i }).filter({ visible: true }).first();
  // El botón se pinta desde el servidor y durante unos milisegundos todavía no
  // tiene quién le escuche el toque: ese primer clic se pierde. Se reintenta
  // hasta que el buscador abra de verdad.
  await expect(async () => {
    await abrir.click();
    await expect(campo).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15000 });
  await campo.fill(texto);
  const opcion = page.getByRole("option").filter({ visible: true }).first();
  await expect(opcion).toBeVisible();
  // The location is already filled: the service selection submits directly.
  await opcion.click();
}

test("elegir el servicio conserva la ubicación que ya estaba", async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), "El buscador en panel es el del teléfono.");
  await gotoOK(page, "/profesionales?provincia=al&canton=al-at");
  await elegirServicio(page, "Fletes y carga");
  // El servicio y el lugar van en la ruta: /profesionales/fletes/alajuela/atenas.
  await expect(page).toHaveURL(/\/profesionales\/fletes\/alajuela\/atenas(?:\?|$)/);
});

test("con el servicio escrito a medias se elige el de la lista, no otro", async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), "El buscador en panel es el del teléfono.");
  await gotoOK(page, "/profesionales?provincia=sj");
  await elegirServicio(page, "Fletes");
  await expect(page).toHaveURL(/\/profesionales\/fletes\/san-jose(?:\?|$)/);
});

test.describe("location catalogue", () => {
test("@contract location catalogue preserves every target and distinct scope", () => {
  expect(execFileSync(process.execPath, ["scripts/verify-location-search.mjs"], { encoding: "utf8", timeout: 25000 })).toContain("fail 0");
});

let script: string, css: string;
test.beforeAll(async () => {
  const messages = Object.fromEntries(["es", "en"].map(locale => [locale, JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")).landing.hero]));
  const mocks: Record<string, string> = {
    "next-intl": `const messages=${JSON.stringify(messages)};export const useLocale=()=>document.documentElement.lang;export const useTranslations=()=>{const t=key=>messages[document.documentElement.lang][key]??key;t.raw=key=>messages[document.documentElement.lang][key];return t;};`,
    "@/i18n/navigation": `import React from 'react';const router={prefetch:()=>{},push:href=>{document.getElementById('destination').textContent=href}};export const useRouter=()=>router;export const Link=({prefetch,locale,...props})=><a {...props}/>;`,
    "@/lib/maps/loader": `export const loadGoogleMaps=async()=>{};`,
    "@/lib/analytics/meta-pixel": `export const trackMetaEvent=()=>{};`,
  };
  const result = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{LandingHero}from'./src/components/landing/landing-hero';import{MarketplaceSearch}from'./src/components/marketplace/marketplace-controls';function Board(){const[q,setQ]=useState(''),[place,setPlace]=useState('');return <MarketplaceSearch value={q} onChange={setQ} placeholder="Service" secondary={{value:place,onChange:value=>{setPlace(value);document.getElementById('destination').textContent=value},placeholder:'Location',ariaLabel:'Location',icon:'location'}}/>;}createRoot(document.getElementById('root')).render(new URLSearchParams(location.search).has('board')?<Board/>:<LandingHero/>);` }, bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"', "process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY": '""' }, plugins: [{ name: "boundaries", setup(b) {
    b.onResolve({ filter: /.*/ }, a => a.path in mocks ? { path: a.path, namespace: "mock" } : undefined);
    b.onLoad({ filter: /.*/, namespace: "mock" }, a => ({ contents: mocks[a.path], loader: "jsx", resolveDir: process.cwd() }));
  } }] });
  script = result.outputFiles[0].text;
  css = (await postcss([tailwind()]).process(readFileSync("src/app/globals.css", "utf8"), { from: "src/app/globals.css" })).css;
});
async function mount(page: Page, locale: string, board = false) {
  // Real components and catalogue, isolated navigation/backend; no external requests.
  await page.route("**/*", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="${locale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><output id="destination"></output></body></html>` }));
  await page.goto(`/location-harness${board ? "?board=1" : ""}`);
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
}
for (const locale of ["es", "en"]) {
  test(`hero distinguishes province and canton and preserves route in ${locale}`, async ({ page }) => {
    // Hero has desktop fields; mobile entry is the navbar sheet.
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors: string[] = [];
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await mount(page, locale);
    await page.getByRole("combobox").nth(1).fill("Punt");
    const options = page.getByRole("option").filter({ hasText: /^Puntarenas/ });
    await expect(options).toHaveCount(2);
    await expect(options.nth(0)).toContainText(locale === "es" ? "Provincia" : "Province");
    await expect(options.nth(1)).toContainText(locale === "es" ? "Cantón · Puntarenas" : "Canton · Puntarenas");
    await options.nth(1).click();
    await page.locator('button[type="submit"]').click();
    await expect(page.locator("#destination")).toHaveText("/profesionales/todos/puntarenas/puntarenas");
    expect(errors.filter(e => /same key|unique.*key/i.test(e))).toEqual([]);
  });
  test(`marketplace retains homonyms and shows each scope in ${locale}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await mount(page, locale, true);
    const mobile = (page.viewportSize()?.width ?? 1280) < 1024;
    if (mobile) await page.getByPlaceholder("Service").first().click();
    const input = page.getByPlaceholder("Location").filter({ visible: true }).last();
    await input.fill("Punt");
    const choices = page.getByRole("button").filter({ hasText: /^Puntarenas/ }).filter({ visible: true });
    await expect(choices).toHaveCount(2);
    await expect(choices.nth(0)).toContainText(locale === "es" ? "Provincia" : "Province");
    await expect(choices.nth(1)).toContainText(locale === "es" ? "Cantón · Puntarenas" : "Canton · Puntarenas");
    await input.fill("San Rafael");
    const homonyms = page.getByRole("button").filter({ hasText: /^San Rafael/ }).filter({ visible: true });
    expect(await homonyms.count()).toBeGreaterThan(1);
    await input.fill("Cahuita");
    const cahuita = page.getByRole("button").filter({ hasText: /^Cahuita/ }).filter({ visible: true });
    await expect(cahuita).toHaveCount(1);
    await expect(cahuita).toContainText(locale === "es" ? "Distrito · Talamanca, Limón" : "District · Talamanca, Limón");
    await cahuita.click();
    await expect(page.locator("#destination")).toHaveText("Talamanca");
    expect(errors.filter(e => /same key|unique.*key/i.test(e))).toEqual([]);
  });
}

});
