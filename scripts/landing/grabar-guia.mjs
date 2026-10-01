// Videos de la guía de la portada (public/guia/*.mp4 + póster .jpg), grabados
// navegando PRODUCCIÓN como lo ve la app. Solo mira: no publica ni escribe nada.
//   node scripts/landing/grabar-guia.mjs https://contratacr.com <ruta-a-ffmpeg>
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const base = (process.argv[2] || "https://contratacr.com").replace(/\/$/, "");
const TEST = "https://test.contratacr.com";
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
      .filter((el) => el && el.scrollHeight - el.clientHeight > 200 && getComputedStyle(el).overflowY !== "hidden");
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

// Cada video arranca en el INICIO de la app (el de localhost, que ya lleva la
// portada nueva) y muestra cómo se llega. El destino de proyectos, promociones
// y empleos se abre en PRODUCCIÓN (en test salen publicaciones de prueba): la
// grabación se pausa mientras carga, así el corte no se ve.
const INICIO = process.env.INICIO || "http://localhost:3000";
async function sinAvisoDeDesarrollo(p) { await p.addStyleTag({ content: "nextjs-portal,[data-nextjs-toast],[data-next-badge-root]{display:none!important}" }).catch(() => {}); }
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
// Solo se marca el toque: no se abre nada (WhatsApp, Publicar).
async function señalar(p, loc) { await loc.scrollIntoViewIfNeeded(); await p.waitForTimeout(300); await marcarToque(p, loc); await p.waitForTimeout(700); }
async function escribir(p, loc, texto) { await tocar(p, loc); await p.waitForTimeout(250); await p.keyboard.type(texto, { delay: 55 }); }

// Inicio → menú → la sección (producción) → «Publicar…» → el formulario, que se
// llena a medias y NUNCA se envía (con la cuenta profesional de prueba, en local).
async function porElMenu(p, grabar, pausar, texto, destino, boton, formulario, llenar) {
  await p.goto(INICIO + "/", { waitUntil: "load" }); await sinAvisoDeDesarrollo(p);
  await p.waitForTimeout(3500);
  grabar();
  await p.waitForTimeout(700);
  await tocar(p, p.getByRole("button", { name: /menú|menu/i }).first());
  await p.waitForTimeout(900);
  await tocar(p, p.getByRole("link", { name: texto, exact: true }).first());
  await p.waitForTimeout(250);
  pausar();
  await p.goto(base + destino, { waitUntil: "load" });
  await p.waitForTimeout(3000);
  grabar();
  await bajar(p, 300, 2000); await p.waitForTimeout(200);
  const publicar = p.getByRole("link", { name: boton }).or(p.getByRole("button", { name: boton })).filter({ visible: true }).first();
  await publicar.scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
  await marcarToque(p, publicar);
  // Se ve el toque; la grabación se corta antes de que pinte el login de producción.
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  pausar();
  await publicar.tap().catch(() => {});
  await p.goto(INICIO + formulario, { waitUntil: "load" }); await sinAvisoDeDesarrollo(p);
  await p.waitForTimeout(3500);
  grabar();
  await p.waitForTimeout(500);
  await llenar(p);
  await p.waitForTimeout(400);
  await señalar(p, p.getByRole("button", { name: /^Publicar/ }).filter({ visible: true }).last());
}

const escenas = {
  // Inicio → «¿Qué necesitas?» Cámaras → «Ubicación» Alajuela → resultados
  // (producción) → el perfil de SG Solutions. No se toca WhatsApp.
  profesionales: async (p, grabar, pausar) => {
    await p.goto(INICIO + "/", { waitUntil: "load" }); await sinAvisoDeDesarrollo(p);
    await p.waitForTimeout(3500);
    grabar();
    await p.waitForTimeout(700);
    await escribir(p, p.getByPlaceholder(/Qué necesitas/i).filter({ visible: true }).first(), "Cámaras");
    await p.waitForTimeout(700);
    await tocar(p, p.getByRole("option").filter({ hasText: "Cámaras de seguridad" }).first());
    await p.waitForTimeout(500);
    await escribir(p, p.getByPlaceholder(/Ubicación/i).filter({ visible: true }).first(), "Alajuela");
    await p.waitForTimeout(700);
    await tocar(p, p.getByRole("option").filter({ hasText: "Provincia" }).first());
    await p.waitForTimeout(250);
    pausar();
    await p.goto(base + "/profesionales?q=" + encodeURIComponent("Cámaras de seguridad") + "&provincia=al", { waitUntil: "load" });
    await p.waitForTimeout(4500);
    grabar();
    await p.waitForTimeout(500);
    await bajar(p, 200, 1500);
    await tocar(p, p.getByText("SG Solutions", { exact: true }).first());
    await p.waitForTimeout(2400); await bajar(p, 420, 3000); await p.waitForTimeout(300);
    await señalar(p, p.getByRole("link", { name: /^WhatsApp$/ }).or(p.getByRole("button", { name: /^WhatsApp$/ })).filter({ visible: true }).last());
  },
  proyectos: (p, g, s) => porElMenu(p, g, s, "Proyectos", "/proyectos", /Publicar proyecto/i, "/publicar-proyecto", async (p) => {
    // El servicio es un botón que abre su buscador.
    await tocar(p, p.getByRole("button", { name: /plomería, electricista/i }).filter({ visible: true }).first());
    await p.waitForTimeout(600);
    await p.keyboard.type("Plomer", { delay: 55 });
    await p.waitForTimeout(700);
    await tocar(p, p.getByRole("button", { name: "Plomería", exact: true }).filter({ visible: true }).first());
    await p.waitForTimeout(500);
    await escribir(p, p.locator("textarea").first(), "Fuga debajo del lavamanos.");
  }),
  promociones: (p, g, s) => porElMenu(p, g, s, "Promociones", "/promociones", /Publicar promoción/i, "/promociones/publicar", async (p) => {
    await escribir(p, p.getByPlaceholder(/Paquete de fotografía/i).first(), "Limpieza profunda de casa");
    await p.waitForTimeout(400);
    await escribir(p, p.locator("textarea").first(), "Cocina, baños y ventanas.");
  }),
  empleos: (p, g, s) => porElMenu(p, g, s, "Empleos", "/empleos", /Publicar empleo/i, "/empleos/publicar", async (p) => {
    await escribir(p, p.getByPlaceholder(/Asistente contable/i).first(), "Asistente de oficina");
    await p.waitForTimeout(400);
    await escribir(p, p.locator("textarea").first(), "Atención al cliente.");
  }),
};

// Se graba con el «screencast» de Chromium: cuadros a resolución real (2x),
// cada uno con su hora, y ffmpeg los arma respetando esos tiempos.
const b = await chromium.launch();
for (const [clave, escena] of Object.entries(escenas)) {
  if (process.argv[4] && process.argv[4] !== clave) continue;
  const ctx = await b.newContext({
    ...(process.env.SESION ? { storageState: process.env.SESION } : {}),
    viewport: { width: 402, height: 875 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-CR",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  });
  await ctx.addCookies([base, TEST, INICIO].map((url) => ({ name: "ccr_platform", value: "native", url })));
  await ctx.addInitScript(() => { try { localStorage.setItem("ccr:native-first-run-onboarding:v12", "1"); } catch {} });
  await ctx.addInitScript(() => { const st = document.createElement("style"); st.textContent = "nextjs-portal{display:none!important}"; document.documentElement.appendChild(st); });
  // Los botones de contacto se VEN (la pantalla queda como es), pero el video nunca los toca.
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  const cuadros = []; const cortes = []; let grabando = false; let corrimiento = 0;
  cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    if (grabando && !enMano) cuadros.push({ t: metadata.timestamp + corrimiento, data });
    await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 804, maxHeight: 1750, everyNthFrame: 1 });
  let enMano = false;
  // Mientras se desplaza cuadro por cuadro, la línea de tiempo la ponen esos cuadros.
  const bajarOriginal = bajar;
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
  await escena(pa, () => { grabando = true; }, () => { grabando = false; cortes.push(cuadros.length); });
  terminarMano();
  const finDeEscena = Date.now() / 1000 + corrimiento;
  await cdp.send("Page.stopScreencast"); await ctx.close();
  if (!cuadros.length) { console.log("sin cuadros", clave); continue; }
  // Línea de tiempo FIJA a 30 por segundo: en cada tic va el último cuadro que
  // ya existía. Los cuadros a mano caen justo en los tics, uno por tic.
  const dir = fs.mkdtempSync(path.join(tmp, clave));
  const t0 = cuadros[0].t, total = Math.round((finDeEscena - t0) * FPS);
  // Lo quieto se recorta: ningún tramo sin cambios dura más de MAX_QUIETO
  // cuadros (las esperas de carga hacían que el video pareciera pausado).
  const MAX_QUIETO = Math.round(FPS * 0.45);
  let c = 0, previo = -1, quietos = 0, salida_n = 0;
  for (let n = 0; n < total; n++) {
    const tic = t0 + n / FPS + 1e-4;
    while (c + 1 < cuadros.length && cuadros[c + 1].t <= tic) c++;
    quietos = c === previo ? quietos + 1 : 0;
    previo = c;
    if (quietos > MAX_QUIETO) continue;
    fs.writeFileSync(path.join(dir, `${String(salida_n++).padStart(5, "0")}.jpg`), Buffer.from(cuadros[c].data, "base64"));
  }
  execFileSync(ffmpeg, ["-y", "-framerate", String(FPS), "-i", path.join(dir, "%05d.jpg"), "-an", "-vf", "scale=588:-2", "-r", String(FPS), "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${salida}${clave}.mp4`], { stdio: "ignore" });
  execFileSync(ffmpeg, ["-y", "-i", `${salida}${clave}.mp4`, "-frames:v", "1", "-q:v", "3", `${salida}${clave}.jpg`], { stdio: "ignore" });
  console.log("listo", clave, cuadros.length, "cuadros", (finDeEscena - cuadros[0].t).toFixed(1) + "s", Math.round(fs.statSync(`${salida}${clave}.mp4`).size / 1024) + " KB");
}
await b.close();
