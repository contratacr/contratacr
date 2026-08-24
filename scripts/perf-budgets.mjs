// Performance budgets, measured on demand against a deployed build.
//
//   node scripts/perf-budgets.mjs                      → https://test.contratacr.com
//   node scripts/perf-budgets.mjs https://contratacr.com
//
// Runs Chromium on a throttled phone profile (390×844, 4× CPU slowdown,
// ~1.6 Mbps / 150 ms RTT), loads each public route cold and reports the
// JavaScript and total bytes transferred plus first contentful paint. Exits 1
// when a budget is exceeded. Deliberately NOT a CI step: it is run by hand
// before a publication or when something feels slow, so it costs no Actions
// minutes (see docs/quality-roadmap.md, Block C).
import { chromium } from "playwright";

const BASE = (process.argv[2] ?? "https://test.contratacr.com").replace(/\/+$/, "");
const BUDGETS = {
  homeJsKb: 450,          // JS transferred on the home page
  routeTotalKb: 800,      // everything transferred on any route
  fcpMs: 1500,            // first contentful paint on the throttled phone
};
const ROUTES = ["/es", "/es/buscar", "/es/categorias", "/es/login", "/es/empleos"];

const browser = await chromium.launch();
const results = [];
try {
  // One warm visit fetches a professional slug for the profile route.
  const scout = await browser.newPage();
  await scout.goto(`${BASE}/es/buscar`, { waitUntil: "domcontentloaded" });
  const slug = await scout.evaluate(() => document.querySelector('a[href*="/profesionales/"]')?.getAttribute("href") ?? null);
  await scout.close();
  if (slug) ROUTES.push(slug.replace(/^https?:\/\/[^/]+/, ""));

  for (const route of ROUTES) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, locale: "es-CR" });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const bytes = { js: 0, total: 0 };
    const types = new Map();
    cdp.on("Network.responseReceived", (e) => types.set(e.requestId, e.type));
    cdp.on("Network.loadingFinished", (e) => {
      bytes.total += e.encodedDataLength;
      if (types.get(e.requestId) === "Script") bytes.js += e.encodedDataLength;
    });
    const started = Date.now();
    await page.goto(`${BASE}${route}`, { waitUntil: "load", timeout: 90_000 });
    await page.waitForTimeout(2500);
    const paint = await page.evaluate(() => {
      const fcp = performance.getEntriesByName("first-contentful-paint")[0];
      return { fcp: fcp ? Math.round(fcp.startTime) : null };
    });
    results.push({ route, jsKb: Math.round(bytes.js / 1024), totalKb: Math.round(bytes.total / 1024), fcpMs: paint.fcp, wallMs: Date.now() - started });
    await context.close();
  }
} finally {
  await browser.close();
}

let failed = false;
const line = (r) => {
  const flags = [];
  if (r.route === "/es" && r.jsKb > BUDGETS.homeJsKb) flags.push(`JS > ${BUDGETS.homeJsKb} KB`);
  if (r.totalKb > BUDGETS.routeTotalKb) flags.push(`total > ${BUDGETS.routeTotalKb} KB`);
  if (r.fcpMs !== null && r.fcpMs > BUDGETS.fcpMs) flags.push(`FCP > ${BUDGETS.fcpMs} ms`);
  if (flags.length) failed = true;
  return `${r.route.padEnd(48)} JS ${String(r.jsKb).padStart(5)} KB · total ${String(r.totalKb).padStart(5)} KB · FCP ${String(r.fcpMs ?? "-").padStart(5)} ms ${flags.length ? "✗ " + flags.join(", ") : "✓"}`;
};
console.log(`Presupuestos en ${BASE} (teléfono 390px, CPU 4× más lenta, ~1.6 Mbps / 150 ms)\n`);
for (const r of results) console.log(line(r));
console.log(`\nLímites: JS del home ≤ ${BUDGETS.homeJsKb} KB · total por ruta ≤ ${BUDGETS.routeTotalKb} KB · FCP ≤ ${BUDGETS.fcpMs} ms`);
process.exit(failed ? 1 : 0);
