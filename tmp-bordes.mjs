import { chromium } from "playwright";
import fs from "node:fs";
const SP = "/private/tmp/claude-501/-Users-contratacr/a4175880-a9ef-4fa9-8f6a-c39dfb1891e4/scratchpad";
const env = Object.fromEntries(fs.readFileSync(".env.test","utf8").split("\n").filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf("=");return [l.slice(0,i), l.slice(i+1).replace(/^"|"$/g,"")];}));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1366, height: 900 } });
await p.goto("http://127.0.0.1:3000/es/empleos/publicar", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(2500);
const e = p.getByRole("link", { name: /Inicia sesi/i }).or(p.getByRole("button", { name: /Inicia sesi/i })).first();
if (await e.isVisible().catch(() => false)) { await e.click(); await p.waitForTimeout(1500); }
await p.locator('input[type="email"]').first().fill("e2e.pro@contratacr.test");
await p.locator('input[type="password"]').first().fill(env.E2E_TEST_PASSWORD || env.REGRESSION_TEST_PASSWORD);
await p.locator('input[type="password"]').first().press("Enter"); await p.waitForTimeout(8000);
const secciones = ["bookings","proposals","quotes","offers","jobs","photos","availability","services","saved","profile","soporte","guides","connections","sent_bookings","sent_projects"];
for (const tab of secciones) {
  const modo = ["sent_bookings","sent_projects","connections"].includes(tab) ? "use" : "offer";
  await p.goto(`http://127.0.0.1:3000/es/dashboard/profesional?mode=${modo}&tab=${tab}`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(3500);
  const info = await p.evaluate(() => {
    // La tarjeta blanca de la sección: la que envuelve el contenido a la derecha del menú
    const cont = document.querySelector("main [class*='dashboard-section-card'], main .rounded-\\[22px\\], main [class*='rounded-[22px]']")
      || [...document.querySelectorAll("main div")].find((d) => /rounded-\[22px\]|dashboard-section-card/.test(d.className));
    if (!cont) return null;
    const s = getComputedStyle(cont);
    return { borde: s.borderTopWidth, color: s.borderTopColor, radio: s.borderTopLeftRadius, sombra: s.boxShadow === "none" ? "no" : "sí", fondo: s.backgroundColor, clases: String(cont.className).slice(0, 120) };
  });
  console.log(tab.padEnd(16), info ? `borde:${info.borde} ${info.color} | radio:${info.radio} | sombra:${info.sombra} | fondo:${info.fondo}` : "NO ENCONTRÉ LA TARJETA");
}
await b.close();
