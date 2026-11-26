import { test, expect, type Page } from "playwright/test";
import { build } from "esbuild";
import { readFileSync } from "node:fs";

// «ATIENDO EN MI LOCAL»: LA DIRECCIÓN Y EL MAPA SALEN SOLOS.
// El local ES su punto en el mapa (sin coordenadas no es un lugar que alguien
// pueda visitar), pero la pantalla decía «Marcar en el mapa (opcional)» detrás
// de un enlace: quien elegía provincia y cantón, tocaba «Guardar lugar» y recibía
// «marque el lugar», o tocaba «Continuar» sin haber guardado y recibía «elija
// una provincia y un cantón» con ambos ya elegidos. Ahora: buscador + mapa
// abiertos desde el principio, la dirección llena provincia y cantón, «Guardar
// lugar» es el botón principal y «Continuar» dice qué falta si el lugar no se
// guardó. Se prueba el componente real, con Google Maps simulado (sin red).
const ES = JSON.parse(readFileSync("messages/es.json", "utf8"));
const EN = JSON.parse(readFileSync("messages/en.json", "utf8"));

let script: string;
test.beforeAll(async () => {
  const mocks: Record<string, string> = {
    "@/lib/maps/loader": `export const loadGoogleMaps=async()=>{};export const createGoogleMarker=()=>({map:null});export const withConfiguredMapId=o=>o;`,
  };
  const result = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: "tsx",
      contents: `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{NextIntlClientProvider}from'next-intl';
import{AttentionModalities}from'./src/components/dashboard/pro/attention-modalities';import{hasBaseCanton}from'./src/lib/location';
import es from './messages/es.json';import en from './messages/en.json';
function App(){const english=document.documentElement.lang==='en';const[w,setW]=useState([]);const[pending,setPending]=useState(false);const[msg,setMsg]=useState('');
return <NextIntlClientProvider locale={english?'en':'es'} messages={english ? en : es}><main className="mx-auto max-w-xl p-4"><AttentionModalities value={w} onChange={n=>{setW(n);setMsg('');}} english={english} canVideo={false} video={false} onVideoChange={()=>{}} onLocalDraftPendingChange={setPending}/>
<button type="button" className="min-h-11" onClick={()=>setMsg(hasBaseCanton(w)?'CONTINUA':pending?'FALTA_GUARDAR':'FALTA_LUGAR')}>Continuar</button><output data-result>{msg}</output><output hidden data-saved>{JSON.stringify(w)}</output></main></NextIntlClientProvider>;}
createRoot(document.getElementById('root')).render(<App/>);`,
    },
    bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"', "process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY": '"clave-de-prueba"', "process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID": '""' },
    loader: { ".json": "json" },
    plugins: [{ name: "mocks", setup(b) {
      b.onResolve({ filter: /.*/ }, a => a.path in mocks ? { path: a.path, namespace: "mock" } : undefined);
      b.onLoad({ filter: /.*/, namespace: "mock" }, a => ({ contents: mocks[a.path], loader: "js", resolveDir: process.cwd() }));
    } }],
  });
  script = result.outputFiles[0].text;
});

type Parte = { types: string[]; longText: string; long_name: string };
const parte = (types: string[], nombre: string): Parte => ({ types, longText: nombre, long_name: nombre });
const SAN_RAMON = [parte(["administrative_area_level_1"], "Alajuela Province"), parte(["administrative_area_level_2"], "San Ramón")];

async function montar(page: Page, locale: "es" | "en", componentes: Parte[]) {
  await page.addInitScript((comps) => {
    // Google Maps simulado: un mapa que guarda su oyente de clics, un buscador
    // de direcciones con una sola sugerencia y un geocodificador inverso.
    const w = window as unknown as Record<string, unknown>;
    w.__componentes = comps;
    w.google = { maps: {
      Map: class { l: Record<string, (e: unknown) => void> = {}; constructor(el: HTMLElement) { el.setAttribute("data-mapa-listo", "1"); w.__mapa = this; } addListener(n: string, f: (e: unknown) => void) { this.l[n] = f; } setCenter() {} setZoom() {} fitBounds() {} },
      Geocoder: class { geocode(_: unknown, cb: (r: unknown, s: string) => void) { cb([{ formatted_address: "Calle de ejemplo, San Ramón, Alajuela", address_components: (w.__componentes as Parte[]).map(c => ({ types: c.types, long_name: c.long_name })) }], "OK"); } },
      LatLngBounds: class { extend() {} },
      places: {
        AutocompleteSessionToken: class {},
        AutocompleteSuggestion: { fetchAutocompleteSuggestions: async () => ({ suggestions: [{ placePrediction: { placeId: "p1", text: { text: "Calle de ejemplo, San Ramón, Alajuela, Costa Rica" } } }] }) },
        Place: class { location: unknown; formattedAddress = ""; addressComponents: unknown; async fetchFields() { this.location = { lat: () => 10.087, lng: () => -84.47 }; this.formattedAddress = "Calle de ejemplo, San Ramón, Alajuela"; this.addressComponents = w.__componentes; } },
      },
    } };
  }, componentes);
  await page.route("**/*", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="${locale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>` }));
  await page.goto("/local-harness");
  await page.addScriptTag({ content: script });
}

const campoDireccion = (page: Page, locale: "es" | "en") => page.getByPlaceholder(((locale === "es" ? ES : EN).workplacesPicker.searchPlaceholder as string));

for (const locale of ["es", "en"] as const) {
  test(`@contract local: la dirección y el mapa están abiertos desde el principio, sin enlace opcional (${locale})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const M = (locale === "es" ? ES : EN).workplacesPicker;
    await montar(page, locale, SAN_RAMON);
    await page.getByRole("switch", { name: locale === "es" ? "Atiendo en mi local" : "I work at my place" }).click();

    await expect(campoDireccion(page, locale)).toBeVisible();
    await expect(page.locator("[data-mapa-listo]")).toHaveCount(1);
    await expect(page.getByText(M.mapPointTitle as string)).toHaveCount(0);
    await expect(page.getByText(/opcional|optional/i)).toHaveCount(0);
    // Todavía sin punto: no hay botón de guardar que tocar.
    await expect(page.getByRole("button", { name: M.addThisPlace as string })).toHaveCount(0);

    // La dirección llena provincia y cantón.
    await campoDireccion(page, locale).fill("San Ramón");
    await page.getByRole("button", { name: /Calle de ejemplo, San Ramón/ }).click();
    await expect(page.getByRole("button", { name: /Alajuela/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "San Ramón", exact: true })).toBeVisible();

    // «Continuar» sin guardar dice QUÉ falta (no «elija provincia y cantón»).
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await expect(page.locator("[data-result]")).toHaveText("FALTA_GUARDAR");

    await page.getByRole("button", { name: M.addThisPlace as string }).click();
    await expect(page.getByText("San Ramón, Alajuela", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await expect(page.locator("[data-result]")).toHaveText("CONTINUA");
    const guardado = JSON.parse((await page.locator("[data-saved]").textContent()) ?? "[]");
    expect(guardado).toHaveLength(1);
    expect(guardado[0]).toMatchObject({ provinciaId: "al", cantonId: "al-sa", lat: 10.087, lng: -84.47, receivesClients: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

    // Un segundo local: el formulario vuelve con su mapa nuevo ya abierto.
    await page.getByRole("button", { name: M.addAnotherPlace as string }).click();
    await expect(page.locator("[data-mapa-listo]")).toHaveCount(1);
    await expect(campoDireccion(page, locale)).toBeVisible();
  });
}

test("@contract local: tocar el mapa también llena provincia y cantón", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await montar(page, "es", SAN_RAMON);
  await page.getByRole("switch", { name: "Atiendo en mi local" }).click();
  await expect(page.locator("[data-mapa-listo]")).toHaveCount(1);
  await page.evaluate(() => (window as unknown as { __mapa: { l: Record<string, (e: unknown) => void> } }).__mapa.l.click({ latLng: { lat: () => 10.09, lng: () => -84.46 } }));
  await expect(page.getByRole("button", { name: "San Ramón", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: ES.workplacesPicker.addThisPlace })).toBeVisible();
});

test("@contract local: si la dirección no se reconoce, avisa y pide elegir a mano antes de guardar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await montar(page, "es", []);
  await page.getByRole("switch", { name: "Atiendo en mi local" }).click();
  await campoDireccion(page, "es").fill("Calle");
  await page.getByRole("button", { name: /Calle de ejemplo/ }).click();
  await expect(page.getByText(ES.workplacesPicker.areaNotDetected)).toBeVisible();
  await expect(page.getByRole("button", { name: ES.workplacesPicker.addThisPlace })).toHaveCount(0);
  await page.getByRole("button", { name: "Provincia", exact: false }).first().click();
  await page.getByRole("option", { name: "Alajuela", exact: true }).click();
  await page.getByRole("button", { name: /Cantón/ }).first().click();
  await page.getByRole("option", { name: "San Ramón", exact: true }).click();
  await expect(page.getByRole("button", { name: ES.workplacesPicker.addThisPlace })).toBeVisible();
});

test("@contract los textos nuevos existen en español e inglés y el error de «Continuar» nombra el botón", () => {
  for (const [M, R] of [[ES, "Guardar lugar"], [EN, "Save location"]] as const) {
    for (const clave of ["localMapLead", "localSaveHint", "areaNotDetected", "cantonNotDetected", "mapFailed", "retryMap", "mapUnavailableLocal"]) {
      expect(typeof M.workplacesPicker[clave], clave).toBe("string");
    }
    expect(M.workplacesPicker.addThisPlace).toBe(R);
    const buscar = (nodo: unknown): string | undefined => {
      if (!nodo || typeof nodo !== "object") return undefined;
      for (const [k, v] of Object.entries(nodo)) {
        if (k === "errWorkplaceGuardar") return String(v);
        const hallado = buscar(v);
        if (hallado) return hallado;
      }
      return undefined;
    };
    expect(buscar(M) ?? "").toContain(R);
  }
  expect(JSON.stringify(ES.workplacesPicker)).not.toMatch(/Marcá|recibís/);
});
