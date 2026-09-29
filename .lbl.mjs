import { chromium } from "playwright";
const host = process.argv[2];
const b = await chromium.launch();
for (const w of [360, 390, 430]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-CR" });
  await ctx.addCookies([{ name: "ccr_platform", value: "native", domain: host, path: "/" }]);
  await ctx.addInitScript((k) => { try { localStorage.setItem(k, "1"); } catch {} }, "ccr:native-first-run-onboarding:v12");
  const p = await ctx.newPage();
  await p.goto(`https://${host}/promociones`, { waitUntil: "domcontentloaded", timeout: 60000 }); await p.waitForTimeout(6000);
  console.log(`${w}px:`, JSON.stringify(await p.evaluate(() => { const n = document.querySelector(".ccr-native-bottom-nav"); const r = n.getBoundingClientRect(); const items = [...n.querySelectorAll("a")]; return { barra: { izq: Math.round(r.left), abajo: Math.round(innerHeight - r.bottom) }, celdas: items.map(a => +a.getBoundingClientRect().width.toFixed(1)), cortados: items.map(a => { const l = a.querySelector("span:last-child"); return l && l.scrollWidth > l.clientWidth + 0.5 ? `${l.textContent.trim()} (${Math.round(l.scrollWidth)}>${Math.round(l.clientWidth)})` : null; }).filter(Boolean) }; })));
  await ctx.close();
}
await b.close();
