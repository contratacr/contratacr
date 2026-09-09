import { chromium, devices } from "playwright";
import fs from "node:fs";
const SP = "/private/tmp/claude-501/-Users-contratacr/a4175880-a9ef-4fa9-8f6a-c39dfb1891e4/scratchpad";
const env = Object.fromEntries(fs.readFileSync(".env.test","utf8").split("\n").filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf("=");return [l.slice(0,i), l.slice(i+1).replace(/^"|"$/g,"")];}));
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices["iPhone 14"], viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios" }; try { localStorage.setItem("ccr:native-first-run-onboarding:v12","1"); } catch {} });
const p = await ctx.newPage();
await p.goto("http://127.0.0.1:3000/es/empleos/publicar", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(2500);
const e = p.getByRole("link", { name: /Inicia sesi/i }).or(p.getByRole("button", { name: /Inicia sesi/i })).first();
if (await e.isVisible().catch(() => false)) { await e.click(); await p.waitForTimeout(1500); }
await p.locator('input[type="email"]').first().fill("e2e.pro@contratacr.test");
await p.locator('input[type="password"]').first().fill(env.E2E_TEST_PASSWORD || env.REGRESSION_TEST_PASSWORD);
await p.locator('input[type="password"]').first().press("Enter"); await p.waitForTimeout(8000);
await p.goto("http://127.0.0.1:3000/es/dashboard/profesional?mode=offer&tab=quotes", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(6000);
// buscar la que está pegada a una cita ("Esperando respuesta")
const pegada = p.locator('button:has-text("Esperando respuesta")').first();
console.log("cotización pegada encontrada:", await pegada.count());
if (await pegada.count()) {
  await pegada.click(); await p.waitForTimeout(4000);
  const t1 = (await p.locator("body").innerText()).replace(/\s+/g, " ");
  console.log("detalle dice 'Enviada a la cita':", /Enviada a la (cita|proyecto)|Enviada al proyecto/.test(t1));
  await p.screenshot({ path: `${SP}/m1-pegada.png` });
  const quitar = p.locator('button[aria-label="Quitar de aquí"]');
  console.log("botón quitar visible:", await quitar.count());
  if (await quitar.count()) {
    await quitar.first().click(); await p.waitForTimeout(4000);
    const t2 = (await p.locator("body").innerText()).replace(/\s+/g, " ");
    console.log("tras quitar → vuelve 'Enviar a una cita o proyecto':", /Enviar a una cita o proyecto/.test(t2));
    await p.screenshot({ path: `${SP}/m2-quitada.png` });
  }
}
await b.close();
