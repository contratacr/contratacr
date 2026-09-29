import { chromium } from "playwright";
const b = await chromium.launch();
for (const w of [360, 390, 430]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-CR" });
  await ctx.addCookies([{ name: "ccr_platform", value: "native", domain: "test.contratacr.com", path: "/" }]);
  await ctx.addInitScript((k) => { try { localStorage.setItem(k, "1"); } catch {} }, "ccr:native-first-run-onboarding:v12");
  const p = await ctx.newPage();
  await p.goto("https://test.contratacr.com/promociones", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(()=>{});
  await p.waitForTimeout(7000);
  const m = await p.evaluate(() => {
    const bar = document.querySelector(".ccr-native-bottom-nav"); if (!bar) return "sin barra";
    const items = [...bar.querySelectorAll("a")];
    const centros = items.map(a => { const s = a.querySelector("svg"); const r = (s || a).getBoundingClientRect(); return Math.round(r.x + r.width / 2); });
    return { etiquetas: items.map(a => a.innerText.trim()), anchos: items.map(a => Math.round(a.getBoundingClientRect().width)), pasos: centros.slice(1).map((c, i) => c - centros[i]) };
  });
  console.log(`ancho ${w}:`, JSON.stringify(m));
  if (w === 390 && m !== "sin barra") await p.screenshot({ path: "/private/tmp/claude-501/-Users-contratacr/0bfaadd7-1b55-428e-9f7e-b0a684b65e2a/scratchpad/nav.png", clip: { x: 0, y: 800 - 90, width: 390, height: 90 } });
  await ctx.close();
}
await b.close();
