import { chromium, devices } from "playwright";
import fs from "node:fs";
const SP = "/private/tmp/claude-501/-Users-contratacr/a4175880-a9ef-4fa9-8f6a-c39dfb1891e4/scratchpad";
const env = Object.fromEntries(fs.readFileSync(".env.test","utf8").split("\n").filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf("=");return [l.slice(0,i), l.slice(i+1).replace(/^"|"$/g,"")];}));
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
const p = await ctx.newPage();
await p.goto("http://127.0.0.1:3000/es/login", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(3000);
await p.locator('input[type="email"]').first().fill("e2e.client@contratacr.test");
await p.locator('input[type="password"]').first().fill(env.E2E_TEST_PASSWORD || env.REGRESSION_TEST_PASSWORD);
await p.locator('input[type="password"]').first().press("Enter");
await p.waitForTimeout(7000);
await p.goto("http://127.0.0.1:3000/es/profesionales/luis-angel-sanchez-sibaja", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(4500);
await p.getByRole("button", { name: /Ver disponibilidad/i }).first().click();
await p.waitForTimeout(4000);
await p.screenshot({ path: `${SP}/reserva-1.png` });
// paso 2: elegir servicio
const svc = p.getByRole("button", { name: /Soporte técnico/i }).first();
if (await svc.count()) { await svc.click(); await p.waitForTimeout(2500); await p.screenshot({ path: `${SP}/reserva-2.png` }); }
// teléfono
const tel = await (await b.newContext({ ...devices["iPhone 14"], viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() })).newPage();
await tel.goto(p.url(), { waitUntil: "domcontentloaded" });
await tel.waitForTimeout(4000);
await tel.screenshot({ path: `${SP}/reserva-tel.png` });
console.log("listo");
await b.close();
