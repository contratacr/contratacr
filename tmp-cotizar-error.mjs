import { chromium, devices } from "playwright";
import fs from "node:fs";
const SP = "/private/tmp/claude-501/-Users-contratacr/a4175880-a9ef-4fa9-8f6a-c39dfb1891e4/scratchpad";
const env = Object.fromEntries(fs.readFileSync(".env.test","utf8").split("\n").filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf("=");return [l.slice(0,i), l.slice(i+1).replace(/^"|"$/g,"")];}));
const BASE = process.env.BASE || "http://127.0.0.1:3001";
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices["iPhone 14"], viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios" }; try { localStorage.setItem("ccr:native-first-run-onboarding:v12","1"); } catch {} });
const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push("PAGEERROR: " + (e.stack || String(e)).slice(0, 2500)));
p.on("console", (m) => { if (m.type() === "error") errores.push("CONSOLE: " + m.text().slice(0, 2000)); });
// login
await p.goto(`${BASE}/es/login`, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(5000);
const entrar = p.getByRole("button", { name: /Inicia sesión/i }).first();
if (await entrar.count()) { await entrar.click(); await p.waitForTimeout(1500); }
await p.locator('input[type="email"]').first().fill("e2e.pro@contratacr.test");
await p.locator('input[type="password"]').first().fill(env.E2E_TEST_PASSWORD || env.REGRESSION_TEST_PASSWORD);
await p.locator('input[type="password"]').first().press("Enter"); await p.waitForTimeout(12000);
console.log("tras login:", p.url());
errores.length = 0;
// TAL CUAL LO HACE ÉL: tocar "Cotizar" en la barra de abajo
const tab = p.locator("nav.ccr-native-bottom-nav a[aria-label='Cotizar']");
console.log("pestaña Cotizar visible:", await tab.count());
if (await tab.count()) { await tab.click(); await p.waitForTimeout(9000); }
const txt = (await p.locator("body").innerText()).replace(/\s+/g, " ");
console.log("URL:", p.url());
console.log("¿Algo salió mal?:", /Algo salió mal|Something went wrong/.test(txt));
console.log("PANTALLA:", txt.slice(0, 160));
fs.writeFileSync(`${SP}/cotizar-errores.txt`, errores.join("\n\n====\n\n"));
console.log("errores capturados:", errores.length);
console.log(errores.slice(0, 2).map(e => e.slice(0, 900)).join("\n----\n"));
await p.screenshot({ path: `${SP}/cotizar-error.png` });
await b.close();
