import { chromium } from "playwright";
const BASE = "https://contratacr.com";
const nav = await chromium.launch();
for (const [nombre, ruta] of [["Ficha", "/es/profesionales/luis-angel-sanchez-sibaja-977u5iku"], ["Inicio", "/es"]]) {
  for (const intento of [1, 2]) {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 70, downloadThroughput: 1048576, uploadThroughput: 262144 });
    const recursos = [];
    page.on("response", (r) => recursos.push({ url: r.url().replace(BASE, "").slice(0, 78), tipo: r.request().resourceType(), estado: r.status(), cache: r.headers()["cf-cache-status"] ?? r.headers()["x-vercel-cache"] ?? "" }));
    await page.addInitScript(() => { window.__lcp = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = Math.round(e.startTime); }).observe({ type: "largest-contentful-paint", buffered: true }); });
    await page.goto(BASE + ruta, { waitUntil: "load", timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const m = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const fcp = performance.getEntriesByName("first-contentful-paint")[0];
      const antesDelPintado = performance.getEntriesByType("resource")
        .filter((r) => r.responseEnd <= (fcp?.startTime ?? 0))
        .sort((a, b) => b.duration - a.duration).slice(0, 6)
        .map((r) => `${r.name.split("/").pop()?.slice(0, 34)} ${Math.round(r.startTime)}→${Math.round(r.responseEnd)} (${Math.round((r.transferSize || 0) / 1024)}KB)`);
      return { ttfb: nav ? Math.round(nav.responseStart) : null, fcp: fcp ? Math.round(fcp.startTime) : null, lcp: window.__lcp, antesDelPintado };
    }).catch(() => null);
    console.log(`${nombre} intento ${intento}: TTFB ${m?.ttfb} FCP ${m?.fcp} LCP ${m?.lcp}`);
    if (intento === 1) { console.log("  recursos antes del primer pintado:"); (m?.antesDelPintado ?? []).forEach((r) => console.log("   ", r)); const html = recursos.find((r) => r.tipo === "document"); console.log("   documento:", html?.estado, "caché:", html?.cache || "(sin cabecera)"); }
    await ctx.close();
  }
}
await nav.close();
