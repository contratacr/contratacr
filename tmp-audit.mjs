import { chromium, devices } from "playwright";
import fs from "node:fs";
const SP = "/private/tmp/claude-501/-Users-contratacr/a4175880-a9ef-4fa9-8f6a-c39dfb1891e4/scratchpad";
const env = Object.fromEntries(fs.readFileSync(".env.test","utf8").split("\n").filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf("=");return [l.slice(0,i), l.slice(i+1).replace(/^"|"$/g,"")];}));
const pass = env.E2E_TEST_PASSWORD || env.REGRESSION_TEST_PASSWORD;
const BASE = "http://127.0.0.1:3000";

const RUTAS = [
  ["home", "/es"],
  ["buscar", "/es/buscar"],
  ["ofertas", "/es/ofertas"],
  ["empleos", "/es/empleos"],
  ["perfil-pro", "/es/profesionales/luis-angel-sanchez-sibaja"],
  ["panel-citas", "/es/dashboard/profesional?mode=offer&tab=bookings"],
  ["panel-proyectos", "/es/dashboard/profesional?mode=offer&tab=proposals"],
  ["panel-cotizaciones", "/es/dashboard/profesional?mode=offer&tab=quotes"],
  ["panel-servicios", "/es/dashboard/profesional?mode=offer&tab=services"],
  ["panel-perfil", "/es/dashboard/profesional?mode=offer&tab=profile"],
  ["panel-favoritos", "/es/dashboard/profesional?mode=offer&tab=saved"],
  ["panel-cliente-citas", "/es/dashboard/profesional?mode=use&tab=sent_bookings"],
  ["notificaciones", "/es/notificaciones"],
];

const MODOS = [
  { id: "app", nativo: true, ancho: 390, alto: 844 },
  { id: "web-movil", nativo: false, ancho: 390, alto: 844 },
  { id: "web-pc", nativo: false, ancho: 1366, alto: 900 },
];

const b = await chromium.launch();
const informe = {};

for (const modo of MODOS) {
  const ctx = await b.newContext(modo.ancho === 390
    ? { ...devices["iPhone 14"], viewport: { width: modo.ancho, height: modo.alto } }
    : { viewport: { width: modo.ancho, height: modo.alto } });
  if (modo.nativo) await ctx.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios" }; try { localStorage.setItem("ccr:native-first-run-onboarding:v12","1"); } catch {} });
  const p = await ctx.newPage();
  // sesión
  await p.goto(`${BASE}/es/empleos/publicar`, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(2500);
  const e = p.getByRole("link", { name: /Inicia sesi/i }).or(p.getByRole("button", { name: /Inicia sesi/i })).first();
  if (await e.isVisible().catch(() => false)) { await e.click(); await p.waitForTimeout(1500); }
  await p.locator('input[type="email"]').first().fill("e2e.pro@contratacr.test");
  await p.locator('input[type="password"]').first().fill(pass);
  await p.locator('input[type="password"]').first().press("Enter"); await p.waitForTimeout(8000);

  for (const [nombre, ruta] of RUTAS) {
    await p.goto(`${BASE}${ruta}`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await p.waitForTimeout(4500);
    const datos = await p.evaluate(() => {
      const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 4 && r.height > 4 && s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0"; };
      const texto = (el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40);
      // Fuera el menú lateral del panel y la cabecera: solo el contenido.
      const enMenu = (el) => !!el.closest("[data-testid^=panel-tab-]") || !!el.closest("aside") || !!el.closest("header") || !!el.closest("nav");
      const botones = [...document.querySelectorAll("main button, main a[role=button], main a.inline-flex")]
        .filter((el) => visible(el) && !enMenu(el)).map(texto).filter((t) => t && t.length > 1);
      const encabezados = [...document.querySelectorAll("main h1, main h2, main h3")].filter((el) => visible(el) && !el.closest("aside") && !el.closest("header")).map(texto);
      const tarjetas = [...document.querySelectorAll("main .rounded-2xl, main .rounded-3xl, main .rounded-xl")].filter(visible).slice(0, 12)
        .map((el) => { const s = getComputedStyle(el); return `${s.borderTopWidth !== "0px" ? "borde" : "sin-borde"}|${s.boxShadow === "none" ? "sin-sombra" : "sombra"}|${s.backgroundColor}`; });
      return {
        barraAbajo: !!document.querySelector("nav.ccr-native-bottom-nav"),
        buscadorNavbar: !!document.querySelector("header [data-testid=search-context-summary], header input[placeholder]"),
        titulo: (document.querySelector("main h1, main h2")?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40),
        primariosTurquesa: [...document.querySelectorAll("main button, main a")].filter((el) => visible(el) && !el.closest("aside") && !el.closest("header") && /rgb\(0, 159, 217\)|rgb\(8, 167, 223\)/.test(getComputedStyle(el).backgroundColor)).map((el) => (el.innerText||"").replace(/\s+/g," ").trim().slice(0,28)).filter(Boolean).slice(0,6),
        encabezados: [...new Set(encabezados)].slice(0, 8),
        botones: [...new Set(botones)].slice(0, 14),
        tarjetas: [...new Set(tarjetas)].slice(0, 6),
        alto: document.documentElement.scrollHeight,
      };
    }).catch(() => null);
    informe[nombre] = informe[nombre] || {};
    informe[nombre][modo.id] = datos;
  }
  await ctx.close();
}
fs.writeFileSync(`${SP}/auditoria.json`, JSON.stringify(informe, null, 1));
console.log("listo");
await b.close();
