import { chromium, devices } from "playwright";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.test","utf8").split("\n").filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf("=");return [l.slice(0,i), l.slice(i+1).replace(/^"|"$/g,"")];}));
const base = process.env.BASE || "https://test.contratacr.com";
const usuario = process.env.USUARIO || "e2e.client@contratacr.test";
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices["iPhone 14"], viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios" }; try { localStorage.setItem("ccr:native-first-run-onboarding:v12","1"); } catch {} });
const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push("pageerror: " + String(e).slice(0, 400)));
p.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text().slice(0, 400)); });
p.on("response", async (r) => { if (r.url().includes("/api/quotes")) errores.push(`API ${r.status()} :: ${(await r.text().catch(()=>"")).slice(0,200)}`); });
await p.goto(`${base}/es/empleos/publicar`, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(3500);
const entrar = p.getByRole("link", { name: /Inicia sesi/i }).or(p.getByRole("button", { name: /Inicia sesi/i })).first();
if (await entrar.isVisible().catch(() => false)) { await entrar.click(); await p.waitForTimeout(2000); }
await p.locator('input[type="email"]').first().fill(usuario);
await p.locator('input[type="password"]').first().fill(env.E2E_TEST_PASSWORD || env.REGRESSION_TEST_PASSWORD);
await p.locator('input[type="password"]').first().press("Enter"); await p.waitForTimeout(8000);
for (const url of [`${base}/es/dashboard/profesional?mode=use&tab=quotes`, `${base}/es/dashboard/profesional?tab=quotes`]) {
  await p.goto(url, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(6000);
  const txt = (await p.locator("body").innerText()).replace(/\s+/g, " ");
  console.log(url.split("?")[1], "→", txt.slice(0, 140));
}
console.log("ERRORES:", errores.slice(0, 5).join("\n---\n") || "ninguno");
await b.close();
