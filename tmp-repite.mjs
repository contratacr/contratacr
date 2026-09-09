import { chromium, devices } from "playwright";
import fs from "node:fs";
const SP = "/private/tmp/claude-501/-Users-contratacr/a4175880-a9ef-4fa9-8f6a-c39dfb1891e4/scratchpad";
const env = Object.fromEntries(fs.readFileSync(".env.test","utf8").split("\n").filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf("=");return [l.slice(0,i), l.slice(i+1).replace(/^"|"$/g,"")];}));
const BASE = process.env.BASE || "https://test.contratacr.com";
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices["iPhone 14"], viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios" }; try { localStorage.setItem("ccr:native-first-run-onboarding:v12","1"); } catch {} });
const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push("PAGEERROR: " + (e.stack || String(e)).slice(0, 1500)));
p.on("console", (m) => { if (m.type() === "error") errores.push("CONSOLE: " + m.text().slice(0, 1200)); });
await p.goto(`${BASE}/es/login`, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(5000);
const entrar = p.getByRole("button", { name: /Inicia sesión/i }).first();
if (await entrar.count()) { await entrar.click(); await p.waitForTimeout(1500); }
await p.locator('input[type="email"]').first().fill("e2e.pro@contratacr.test");
await p.locator('input[type="password"]').first().fill(env.E2E_TEST_PASSWORD || env.REGRESSION_TEST_PASSWORD);
await p.locator('input[type="password"]').first().press("Enter"); await p.waitForTimeout(12000);
let fallos = 0;
for (let i = 1; i <= 6; i++) {
  errores.length = 0;
  const cotizar = p.locator("nav.ccr-native-bottom-nav a[aria-label='Cotizar']");
  const panel = p.locator("nav.ccr-native-bottom-nav a[aria-label='Panel']");
  if (await cotizar.count()) { await cotizar.click(); await p.waitForTimeout(6000); }
  let txt = (await p.locator("body").innerText()).replace(/\s+/g, " ");
  const malo = /Algo salió mal|Something went wrong|No se pudieron cargar tus cotizaciones/.test(txt);
  if (malo) fallos++;
  console.log(`vuelta ${i} → cotizar: ${malo ? "FALLA (" + txt.slice(0, 60) + ")" : "ok"} | errores: ${errores.length}`);
  if (errores.length) fs.appendFileSync(`${SP}/cotizar-errores.txt`, `\n\n=== vuelta ${i} ===\n` + errores.join("\n---\n"));
  if (await panel.count()) { await panel.click(); await p.waitForTimeout(4000); }
  // y recargando en frío, como cuando abre la app
  if (i === 3) { await p.goto(`${BASE}/es/dashboard/profesional?mode=offer&tab=quotes`, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(7000);
    txt = (await p.locator("body").innerText()).replace(/\s+/g, " ");
    console.log("   carga en frío →", /Algo salió mal/.test(txt) ? "FALLA" : "ok", "| errores:", errores.length); }
}
console.log("fallos:", fallos);
await p.screenshot({ path: `${SP}/repite.png` });
await b.close();
