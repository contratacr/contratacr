// Videos de la guía de la portada (public/guia/*.mp4 + póster .jpg).
// Producción solo lectura; los formularios de ofertas usan el test aislado.
//   node scripts/landing/grabar-guia.mjs https://contratacr.com <ruta-a-ffmpeg>
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const base = (process.argv[2] || "https://contratacr.com").replace(/\/$/, "");

const ffmpeg = process.argv[3] || "ffmpeg";
const salida = new URL("../../public/guia/", import.meta.url).pathname;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "guia-"));
fs.mkdirSync(salida, { recursive: true });

// Desplaza lo que de verdad se desplaza en esa pantalla. CUADRO POR CUADRO:
// se mueve un paso exacto, se espera a que pinte y se toma la foto, 30 por
// segundo de video. En tiempo real la grabación perdía cuadros y se veía a saltos.
const FPS = 30;
let cuadroAMano = null; // lo pone la grabación: (jpg) => void
async function bajar(p, px, msPedido) {
  const ms = Math.max(msPedido, Math.abs(px) * 6);
  const pasos = Math.round((ms / 1000) * FPS);
  await p.evaluate(() => {
    const candidatos = [document.scrollingElement, ...document.querySelectorAll("main, main *, [class*=scroll]")]
      .filter((el) => el && el.scrollHeight - el.clientHeight > 1 && (el === document.scrollingElement || ["auto", "scroll"].includes(getComputedStyle(el).overflowY)));
    window.__rollo = candidatos.sort((a, b) => b.clientHeight - a.clientHeight)[0] || document.scrollingElement;
    window.__inicio = window.__rollo.scrollTop;
    window.__rollo.style.scrollBehavior = "auto";
  });
  for (let n = 1; n <= pasos; n++) {
    const k = n / pasos, e = (1 - Math.cos(Math.PI * k)) / 2;
    await p.evaluate(async (y) => {
      window.__rollo.scrollTop = window.__inicio + y;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, px * e);
    if (cuadroAMano) cuadroAMano(await p.screenshot({ type: "jpeg", quality: 92 }));
  }
  globalThis.__terminarMano?.();
}

// Public walkthroughs and the anonymous project form use production read-only;
// blank offer forms use isolated test.
const LOCAL = process.env.GUIDE_FORM_BASE || "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(LOCAL).hostname)) throw new Error("Guide forms require an isolated loopback test server.");
const INICIO = base;
let testCookies = [];
let productionReadOnly = null;
const PROJECT_PATH = process.env.GUIDE_PROJECT_PATH || "/proyectos/estoy-buscando-una-persona-responsable-y-de-confianza-a1ae651d";
if (!/^\/proyectos\/[a-z0-9-]+$/.test(PROJECT_PATH)) throw new Error("Invalid public guide project path");

// Verify the real handoff, but keep WhatsApp/chats out of the public video.
async function contactar(p) {
  const wa = p.locator("a, button").filter({ hasText: /^\s*WhatsApp\s*$/ }).filter({ visible: true }).last();
  await wa.waitFor();
  // In the anonymous project walkthrough, point out the contact action.
  // Do not invoke it: the sign-in prompt is outside this short demonstration.
  if (new URL(p.url()).pathname.startsWith("/proyectos/")) {
    await wa.scrollIntoViewIfNeeded();
    await marcarToque(p, wa);
    await p.waitForTimeout(750);
    return;
  }
  await p.evaluate(() => {
    window.__guideContact = null;
    window.open = (url) => { window.__guideContact = String(url); return null; };
  });
  const href = await wa.getAttribute("href");
  if (href) {
    if (!/^https:\/\/(wa\.me|api\.whatsapp\.com)\//.test(href)) throw new Error("Unexpected WhatsApp destination");
    await wa.evaluate(el => el.addEventListener("click", e => { e.preventDefault(); window.__guideContact = el.href; }, { once: true }));
  }
  await tocar(p, wa);
  await p.waitForFunction(() => /^https:\/\/(wa\.me|api\.whatsapp\.com)\//.test(window.__guideContact || ""), null, { timeout: 15000 });
  console.log("WhatsApp destination verified (no message sent)");
  await p.waitForTimeout(1100);
}

// Capture only the app content, without a simulated OS status-bar reserve.
async function sinAvisoDeDesarrollo(p) { await p.addStyleTag({ content: "nextjs-portal,[data-nextjs-toast],[data-next-badge-root]{display:none!important}" }).catch(() => {}); }
// La grabación solo se reanuda con la página QUIETA: fuentes cargadas, todas
// las imágenes visibles pintadas, sin esqueletos y la cabecera con su logo.
// Los primeros cuadros tras un goto mostraban la página a medio cargar.
async function asentada(p) {
  await p.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await p.waitForFunction(() => {
    if (document.fonts.status !== "loaded") return false;
    const enVista = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
    if ([...document.images].some((i) => enVista(i) && !(i.complete && i.naturalWidth > 0))) return false;
    if ([...document.querySelectorAll("[class*=animate-pulse],[class*=skeleton]")].some((el) => enVista(el) && getComputedStyle(el).animationName !== "none")) return false;
    return true;
  }, null, { timeout: 15000, polling: 100 }).catch(() => console.log("asentada: se agotó la espera en", p.url()));
  await p.evaluate(() => Promise.all([...document.fonts].map(font => font.load())).then(() => document.fonts.ready).then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
  await p.waitForTimeout(400);
}
// Cada toque se VE: un círculo gris que aparece donde cae el dedo, como en las
// grabaciones de pantalla del iPhone con «mostrar toques».
async function marcarToque(p, loc) {
  const caja = await loc.boundingBox();
  if (!caja) return;
  await p.evaluate(({ x, y }) => {
    const d = document.createElement("div");
    d.style.cssText = `position:fixed;left:${x - 22}px;top:${y - 22}px;width:44px;height:44px;border-radius:50%;background:rgba(40,48,60,.32);border:2px solid rgba(255,255,255,.85);box-shadow:0 2px 10px rgba(0,0,0,.25);z-index:2147483647;pointer-events:none;transform:scale(.6);opacity:0;transition:transform .18s ease-out,opacity .18s ease-out`;
    document.documentElement.appendChild(d);
    requestAnimationFrame(() => { d.style.transform = "scale(1)"; d.style.opacity = "1"; });
    setTimeout(() => { d.style.transform = "scale(1.25)"; d.style.opacity = "0"; }, 520);
    setTimeout(() => d.remove(), 800);
  }, { x: caja.x + caja.width / 2, y: caja.y + caja.height / 2 });
  await p.waitForTimeout(330);
}
async function tocar(p, loc) { await loc.scrollIntoViewIfNeeded(); await p.waitForTimeout(300); await marcarToque(p, loc); await loc.tap(); }
// Text entry uses the same visible tap marker as the navigation.
async function escribir(p, loc, texto) { await tocar(p, loc); await p.waitForTimeout(250); await p.keyboard.type(texto, { delay: 55 }); }

// Each segment begins at the top, including nested native-app scrollers.
async function arriba(p) {
  await p.evaluate(async () => {
    for (const el of [document.scrollingElement, ...document.querySelectorAll("main, main *, [class*=scroll]")]) {
      if (el) { el.scrollTop = 0; }
    }
    window.scrollTo(0, 0);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await p.waitForTimeout(300);
}
async function mostrarDetalleCompleto(p) {
  const remaining = await p.evaluate(() => {
    const candidates = [document.scrollingElement, ...document.querySelectorAll("main, main *, [class*=scroll]")]
      .filter(el => el && el.scrollHeight - el.clientHeight > 1 && (el === document.scrollingElement || ["auto", "scroll"].includes(getComputedStyle(el).overflowY)));
    const scroller = candidates.sort((a,b) => b.clientHeight - a.clientHeight)[0] || document.scrollingElement;
    return Math.max(0, scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop);
  });
  if (remaining > 1) await bajar(p, remaining, 1800);
  await p.waitForTimeout(1400);
}
async function evidencia(p, name) {
  if (!process.env.GUIDE_EVIDENCE_DIR) return;
  fs.mkdirSync(process.env.GUIDE_EVIDENCE_DIR, { recursive: true });
  await p.screenshot({ path: path.join(process.env.GUIDE_EVIDENCE_DIR, name + ".png") });
}

// Home → board → publication/detail/contact → board → blank publishing form.
async function porElMenu(p, grabar, pausar, texto, destino, boton, formulario) {
  const origin = INICIO;
  const scene = destino.slice(1);
  await p.goto(origin + "/", { waitUntil: "load" });
  await sinAvisoDeDesarrollo(p); await asentada(p); await arriba(p);
  grabar(); await p.waitForTimeout(700);
  await tocar(p, p.getByRole("button", { name: "Abrir menú", exact: true }).first());
  await p.waitForTimeout(900);
  if (await p.getByText("Ir a mi panel", { exact: true }).filter({ visible: true }).count()) throw new Error("Public guide must browse without a session");
  await evidencia(p, `${scene}-menu-sin-sesion`);
  await tocar(p, p.locator(".ccr-menu-abierto").getByRole("link", { name: texto, exact: true }));
  pausar(); await p.waitForURL(new RegExp(`${destino}$`)); await asentada(p); await arriba(p);
  await evidencia(p, `${scene}-tablero-inicio`);
  grabar(); await p.waitForTimeout(700);
  const items = p.locator(`h2 a[href^="${destino}/"]`);
  const item = (destino === "/proyectos" ? items.and(p.locator(`a[href="${PROJECT_PATH}"]`)) : items).first();
  await tocar(p, item);
  pausar(); await p.waitForURL(new RegExp(`${destino}/.+`)); await asentada(p); await arriba(p);
  await evidencia(p, `${scene}-detalle-inicio`);
  console.log(scene, "detail first, at top");
  grabar(); await p.waitForTimeout(1600); await mostrarDetalleCompleto(p);
  await evidencia(p, `${scene}-detalle-final`);
  await contactar(p);
  pausar();
  // Return using the real in-app arrow, preserving the board's navigation
  // shell. A hard reload here briefly reserved a second navbar above it.
  await tocar(p, p.locator(`a[href="${destino}"]`).filter({ visible: true }).first());
  await p.waitForURL(new RegExp(`${destino}$`)); await asentada(p); await arriba(p);
  await evidencia(p, `${scene}-tablero-regreso`);
  grabar(); await p.waitForTimeout(700);
  const publicar = p.getByRole("link", { name: boton }).or(p.getByRole("button", { name: boton })).filter({ visible: true }).first();
  await publicar.scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
  await marcarToque(p, publicar); await p.waitForTimeout(250); pausar();
  // The project form is public. Offer forms use only the synthetic test actor.
  if (destino !== "/proyectos") await p.context().addCookies(testCookies);
  await p.goto((destino === "/proyectos" ? INICIO : LOCAL) + formulario, { waitUntil: "load" }); await sinAvisoDeDesarrollo(p); await asentada(p); await arriba(p);
  if (/\/login/.test(p.url())) throw new Error(`Test form requires authentication: ${formulario}`);
  await p.locator("main h1, main h2, .app-fullscreen-modal h1, .app-fullscreen-modal h2").filter({ visible: true }).first().waitFor();
  await evidencia(p, `${scene}-formulario-inicio`);
  console.log(scene, "form follows detail, at top");
  grabar(); await p.waitForTimeout(1400); await bajar(p, 260, 2000); await p.waitForTimeout(1200);
}

const escenas = {
  profesionales: async (p, grabar, pausar) => {
    await p.goto(INICIO + "/", { waitUntil: "load" }); await asentada(p);
    grabar(); await p.waitForTimeout(700);
    await tocar(p, p.getByLabel(/Qué necesitas/i).filter({ visible: true }).first());
    const panel = p.locator(".ccr-native-search-panel");
    await panel.getByLabel("Servicio", { exact: true }).waitFor();
    const top = await panel.getByLabel("Servicio", { exact: true }).evaluate(el => el.getBoundingClientRect().top);
    if (top > 32) throw new Error(`Search capture has an extra status-bar reserve: ${top}px`);
    await evidencia(p, "profesionales-buscador-inicio");
    await escribir(p, panel.getByLabel("Servicio", { exact: true }), "Cámaras");
    await p.waitForTimeout(700);
    await tocar(p, panel.getByRole("option").filter({ hasText: "Cámaras de seguridad" }).first());
    await p.waitForTimeout(500);
    await escribir(p, panel.getByLabel("Ubicación", { exact: true }), "Alajuela");
    await p.waitForTimeout(700);
    await tocar(p, panel.getByRole("option").filter({ hasText: "Alajuela" }).first());
    pausar(); await p.waitForURL(/\/profesionales|\/buscar/); await asentada(p);
    grabar(); await p.waitForTimeout(500); await bajar(p, 200, 1500);
    await tocar(p, p.getByText("SG Solutions", { exact: true }).filter({ visible: true }).first());
    pausar(); await p.getByTestId("professional-profile-name").waitFor(); await asentada(p);
    grabar(); await p.waitForTimeout(900); await bajar(p, 300, 2200); await p.waitForTimeout(300);
    for (const seccion of ["Reseñas", "Casos de éxito", "Formación"]) {
      const tab = p.getByRole("tab", { name: seccion, exact: true });
      await tab.waitFor(); await tocar(p, tab); await p.waitForTimeout(1300);
      await bajar(p, 180, 1400); await p.waitForTimeout(500);
    }
    await contactar(p);
  },
  proyectos: (p, g, s) => porElMenu(p, g, s, "Proyectos", "/proyectos", /Publicar (?:un )?proyecto/i, "/publicar-proyecto"),
  promociones: (p, g, s) => porElMenu(p, g, s, "Promociones", "/promociones", /Publicar promoción/i, "/promociones/publicar"),
  empleos: (p, g, s) => porElMenu(p, g, s, "Empleos", "/empleos", /Publicar empleo/i, "/empleos/publicar"),
};

// Se graba con fotos seguidas a resolución real (2x), cada una con su hora,
// y ffmpeg las arma respetando esos tiempos.
function readEnv(file) {
  return Object.fromEntries(fs.readFileSync(file, "utf8").split(/\r?\n/).flatMap(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    return match ? [[match[1].trim(), match[2].trim().replace(/^["']|["']$/g, "")]] : [];
  }));
}
if (process.argv[4] !== "proyectos") {
  const prodEnv = readEnv(process.env.GUIDE_PRODUCTION_READ_ENV || new URL("../../.env.local", import.meta.url));
  if (!prodEnv.NEXT_PUBLIC_SUPABASE_URL?.includes("kskueodxaksxvjrysouw.supabase.co")) throw new Error("Unexpected production read project");
  productionReadOnly = createClient(prodEnv.NEXT_PUBLIC_SUPABASE_URL, prodEnv.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}
const b = await chromium.launch();
try {
// Offers and jobs need the synthetic test actor for their blank forms.
// The project form is public and can be recorded anonymously.
if (process.argv[4] !== "profesionales" && process.argv[4] !== "proyectos") {
  const env = readEnv(process.env.GUIDE_TEST_ENV_FILE || new URL("../../.env.test", import.meta.url));
  if (!env.NEXT_PUBLIC_SUPABASE_URL?.includes("oqheayqqprpciqdvdaqo.supabase.co")) throw new Error("Guide authentication requires the current isolated test project.");
  const authContext = await b.newContext();
  await authContext.addCookies([{ name: "ccr_sin_analitica", value: "1", url: LOCAL }]);
  const authPage = await authContext.newPage();
  await authPage.goto(LOCAL + "/login");
  const cover = authPage.locator(".ccr-login-portada");
  if (await cover.isVisible()) await cover.getByRole("button", { name: /Inicia sesión/i }).click();
  await authPage.locator('main input[type="email"]').fill("e2e.pro@contratacr.test");
  await authPage.locator('main input[type="password"]').fill(env.E2E_TEST_PASSWORD || env.REGRESSION_TEST_PASSWORD);
  await authPage.locator("main").getByRole("button", { name: /Ingresar/i }).click();
  await authPage.waitForURL(/\/dashboard\/profesional/, { timeout: 30000 });
  testCookies = (await authContext.cookies()).filter(cookie => cookie.name !== "ccr_platform"); await authContext.close();
}
for (const [clave, escena] of Object.entries(escenas)) {
  if (process.argv[4] && process.argv[4] !== clave) continue;
  const ctx = await b.newContext({
    viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-CR",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  });
  await ctx.addCookies([base, LOCAL].flatMap(url => [{ name: "ccr_platform", value: "native", url }, { name: "ccr_sin_analitica", value: "1", url }]));
  // The app uses font-display:optional. Cold recording pages could therefore
  // retain a system fallback even after fonts.ready. Load the actual app fonts
  // before shooting; do not substitute a different font or draw a fake logo.
  await ctx.route("**/*.css*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace(/font-display:\s*optional/g, "font-display:block") });
  });
  await ctx.route("**/*", async route => {
    const request = route.request();
    if (new URL(request.url()).origin !== new URL(LOCAL).origin && !["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      // Read-only production demonstration: the real contact API also writes
      // review follow-ups. Validate the destination against the actual public
      // professional's stored phone without creating any production contacts.
      if (new URL(request.url()).origin === base && new URL(request.url()).pathname === "/api/contact/whatsapp-link" && productionReadOnly) {
        const body = request.postDataJSON();
        const { data, error } = await productionReadOnly.from("professionals").select("whatsapp,business_name,is_banned").eq("id", body.professionalId).single();
        if (error || !data?.whatsapp || data.is_banned) throw new Error("No valid professional contact for the demonstration");
        const digits = data.whatsapp.replace(/\D/g, "");
        const phone = digits.length === 8 ? `506${digits}` : digits;
        const text = body.initialMessage || `Hola ${data.business_name || body.professionalName}, vi tu servicio en ContrataCR y me gustaría coordinar. ¿Me puedes dar más información?`;
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ href: `https://wa.me/${phone}?text=${encodeURIComponent(text)}` }) });
      }
      return route.abort();
    }
    await route.fallback();
  });
  await ctx.addInitScript(() => { try { localStorage.setItem("ccr:native-first-run-onboarding:v12", "1"); } catch {} });
  // Sin el aviso de desarrollo de Next en las grabaciones.
  await ctx.addInitScript(() => {
    const st = document.createElement("style");
    st.textContent = "nextjs-portal{display:none!important}";
    document.documentElement.appendChild(st);
  });
  // WhatsApp is tapped, its destination asserted, and its external handoff intercepted. No messages are sent.
  const p = await ctx.newPage();

  const cdp = await ctx.newCDPSession(p);
  // The video omits the OS status bar. Reserve only the bottom home indicator;
  // 62px at the top created a false blank band above search and inconsistent
  // headers. No CSS offset is applied to the real app fields or navbar.
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, bottom: 34, left: 0, right: 0 } });
  const cuadros = []; const cortes = []; let grabando = false; let corrimiento = 0; let tramo = 0;
  // Fotos seguidas a resolución real (2x). El «screencast» de Chromium sin
  // ventana entrega cuadros a 1x (402 px): mezclados con las fotos 2x del
  // desplazamiento, el texto y el logo se veían nítidos y borrosos a saltos.
  let capturando = true;
  const bucle = (async () => {
    while (capturando) {
      if (!grabando || enMano) { await new Promise((r) => setTimeout(r, 15)); continue; }
      const t = Date.now() / 1000 + corrimiento, deTramo = tramo;
      try {
        const jpg = await p.screenshot({ type: "jpeg", quality: 92, caret: "initial", timeout: 5000 });
        if (grabando && !enMano && deTramo === tramo) cuadros.push({ t, data: jpg.toString("base64") });
      } catch { await new Promise((r) => setTimeout(r, 30)); }
    }
  })();
  let enMano = false;
  // Mientras se desplaza cuadro por cuadro, la línea de tiempo la ponen esos cuadros.
  cuadroAMano = (jpg) => {
    if (!grabando) return;
    if (!enMano) {
      enMano = true; manoInicio = Date.now() / 1000;
      const t0 = cuadros[0]?.t ?? manoInicio + corrimiento, ult = cuadros.at(-1)?.t ?? t0;
      manoT = t0 + Math.ceil((ult - t0) * FPS + 0.5) / FPS;
      manoT -= 1 / FPS;
    }
    manoT += 1 / FPS;
    cuadros.push({ t: manoT, data: jpg.toString("base64") });
  };
  let manoInicio = 0, manoT = 0;
  const terminarMano = () => { if (enMano) { enMano = false; corrimiento = manoT - Date.now() / 1000; } };
  const pa = new Proxy(p, { get: (o, k) => (typeof o[k] === "function" ? o[k].bind(o) : o[k]) });
  globalThis.__terminarMano = terminarMano;
  try {
  await escena(pa, () => { grabando = true; }, () => { grabando = false; tramo++; cortes.push(cuadros.length); });
  } catch (e) { capturando = false; await bucle; if (process.env.CAPTURA) await p.screenshot({ path: process.env.CAPTURA }).catch(() => {}); await ctx.close(); throw e; }
  terminarMano();
  const finDeEscena = Date.now() / 1000 + corrimiento;
  capturando = false; await bucle; await ctx.close();
  if (!cuadros.length) { console.log("sin cuadros", clave); continue; }
  // Línea de tiempo FIJA a 30 por segundo: en cada tic va el último cuadro que
  // ya existía. Los cuadros a mano caen justo en los tics, uno por tic.
  const dir = fs.mkdtempSync(path.join(tmp, clave));
  const t0 = cuadros[0].t, total = Math.round((finDeEscena - t0) * FPS);
  // Lo quieto se recorta: ningún tramo sin cambios dura más de MAX_QUIETO
  // cuadros (las esperas de carga hacían que el video pareciera pausado).
  const MAX_QUIETO = Math.round(FPS * 0.45);
  let c = 0, previo = -1, quietos = 0, salida_n = 0;
  // Dónde empieza cada tramo nuevo (en cuadros de salida), para el fundido.
  const pendientes = [...cortes].filter((k) => k > 0 && k < cuadros.length); const fundidos = [];
  for (let n = 0; n < total; n++) {
    const tic = t0 + n / FPS + 1e-4;
    while (c + 1 < cuadros.length && cuadros[c + 1].t <= tic) c++;
    quietos = c === previo ? quietos + 1 : 0;
    previo = c;
    if (quietos > MAX_QUIETO) continue;
    while (pendientes.length && c >= pendientes[0]) { pendientes.shift(); if (salida_n > 0) fundidos.push(salida_n); }
    fs.writeFileSync(path.join(dir, `${String(salida_n++).padStart(5, "0")}.jpg`), Buffer.from(cuadros[c].data, "base64"));
  }
  // En cada corte, fundido de ~250 ms: el último cuadro del tramo anterior
  // se funde con los primeros del nuevo (antes era un salto seco).
  const FUNDIDO = Math.round(FPS * 0.25);
  const nombre = (n) => path.join(dir, `${String(n).padStart(5, "0")}.jpg`);
  for (const k of fundidos) {
    const antes = path.join(dir, `antes-${k}.jpg`); fs.copyFileSync(nombre(k - 1), antes);
    for (let i = 0; i < FUNDIDO && k + i < salida_n; i++) {
      const a = ((i + 1) / (FUNDIDO + 1)).toFixed(3), tmpj = nombre(k + i) + ".f.jpg";
      execFileSync(ffmpeg, ["-y", "-i", antes, "-i", nombre(k + i), "-filter_complex", `[0][1]blend=all_expr=A*(1-${a})+B*${a}`, "-q:v", "2", tmpj], { stdio: "ignore" });
      fs.renameSync(tmpj, nombre(k + i));
    }
  }
  console.log("cortes con fundido", clave, fundidos.map((k) => (k / FPS).toFixed(2) + "s").join(" "));
  execFileSync(ffmpeg, ["-y", "-framerate", String(FPS), "-i", path.join(dir, "%05d.jpg"), "-an", "-vf", "scale=588:-2,setsar=1", "-r", String(FPS), "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${salida}${clave}.mp4`], { stdio: "ignore" });
  execFileSync(ffmpeg, ["-y", "-i", `${salida}${clave}.mp4`, "-frames:v", "1", "-q:v", "3", `${salida}${clave}.jpg`], { stdio: "ignore" });
  console.log("listo", clave, cuadros.length, "cuadros", (finDeEscena - cuadros[0].t).toFixed(1) + "s", Math.round(fs.statSync(`${salida}${clave}.mp4`).size / 1024) + " KB");
}
} finally {
  await b.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
