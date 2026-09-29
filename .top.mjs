import { chromium } from "playwright";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-CR" });
await ctx.addCookies([{ name: "ccr_platform", value: "native", domain: "contratacr.com", path: "/" }]);
await ctx.addInitScript((k) => { try { localStorage.setItem(k, "1"); } catch {} }, "ccr:native-first-run-onboarding:v12");
const p = await ctx.newPage();
for (const r of ["/promociones", "/proyectos", "/empleos"]) {
  await p.goto("https://contratacr.com" + r, { waitUntil: "domcontentloaded", timeout: 60000 }); await p.waitForTimeout(6000);
  const m = await p.evaluate(() => {
    const path = (el) => { const out = []; let n = el; for (let i = 0; i < 4 && n && n !== document.body; i++) { out.push(n.tagName.toLowerCase() + (n.className ? "." + String(n.className).split(" ").filter(Boolean).slice(0, 3).join(".") : "")); n = n.parentElement; } return out.join(" < "); };
    const arriba = document.elementFromPoint(200, 20);
    const header = [...document.querySelectorAll("header, [class*=native-header], [class*=cabecera]")].find(h => h.getBoundingClientRect().height > 30);
    const bg = arriba ? getComputedStyle(arriba).backgroundColor : null;
    const cs = getComputedStyle(document.documentElement);
    return { arriba: arriba ? path(arriba) : null, fondoArriba: bg, headerTop: header ? Math.round(header.getBoundingClientRect().top) : null, headerClase: header ? String(header.className).slice(0, 80) : null, varHeader: cs.getPropertyValue("--ccr-native-header-height").trim(), bodyPT: getComputedStyle(document.body).paddingTop, mainPT: document.querySelector("main") ? getComputedStyle(document.querySelector("main")).paddingTop : null, htmlClases: document.documentElement.className.replace(/inter\S+/, "").trim() };
  });
  console.log(`\n=== ${r} ===`); console.log(JSON.stringify(m, null, 1));
}
await b.close();
