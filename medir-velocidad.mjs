import { chromium } from "playwright";

const RUTAS = [
  ["Inicio", "/es"],
  ["Buscar con resultados", "/es/buscar?provincia=al&canton=al-at"],
  ["Ficha de profesional", "/es/profesionales/luis-angel-sanchez-sibaja-977u5iku"],
  ["Empleos", "/es/empleos"],
  ["Servicios", "/es/servicios"],
];
const BASE = process.argv[2] ?? "https://contratacr.com";

const navegador = await chromium.launch();
const filas = [];
for (const [nombre, ruta] of RUTAS) {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
  const page = await ctx.newPage();
  // Red de teléfono en Costa Rica: 4G decente con latencia real.
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 70, downloadThroughput: (8 * 1024 * 1024) / 8, uploadThroughput: (2 * 1024 * 1024) / 8 });
  let bytes = 0, peticiones = 0;
  page.on("response", async (r) => {
    peticiones += 1;
    const len = Number(r.headers()["content-length"] ?? 0);
    if (Number.isFinite(len)) bytes += len;
  });
  await page.addInitScript(() => {
    window.__lcp = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = Math.round(e.startTime); }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  const t0 = Date.now();
  await page.goto(BASE + ruta, { waitUntil: "load", timeout: 90000 }).catch(() => {});
  const cargado = Date.now() - t0;
  await page.waitForTimeout(2500);
  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    return {
      ttfb: nav ? Math.round(nav.responseStart) : null,
      fcp: fcp ? Math.round(fcp.startTime) : null,
      lcp: window.__lcp || null,
      dom: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      transferido: performance.getEntriesByType("resource").reduce((s, r) => s + (r.transferSize || 0), 0),
      recursos: performance.getEntriesByType("resource").length,
      tareasLargas: performance.getEntriesByType("longtask")?.length ?? 0,
    };
  }).catch(() => null);
  filas.push({ nombre, ...m, cargado, peticiones });
  await ctx.close();
}
await navegador.close();
console.log(BASE);
console.log("pantalla".padEnd(24), "TTFB".padStart(7), "FCP".padStart(7), "LCP".padStart(7), "carga".padStart(8), "KB".padStart(8), "peticiones".padStart(11));
for (const f of filas) {
  console.log(String(f.nombre).padEnd(24), String(f.ttfb ?? "-").padStart(7), String(f.fcp ?? "-").padStart(7), String(f.lcp ?? "-").padStart(7), String(f.cargado).padStart(8), String(Math.round((f.transferido ?? 0) / 1024)).padStart(8), String(f.peticiones).padStart(11));
}
