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
async function tocar(p, loc) { await loc.scrollIntoViewIfNeeded(); await p.waitForTimeout(350); await loc.tap(); }
async function porElMenu(p, grabar, pausar, texto, destino) {
  await p.goto(INICIO + "/", { waitUntil: "load" });
  await p.waitForTimeout(3500);
  grabar();
  await p.waitForTimeout(1400);
  await tocar(p, p.getByRole("button", { name: /menú|menu/i }).first());
  await p.waitForTimeout(1100);
  await tocar(p, p.getByRole("link", { name: texto, exact: true }).first());
  await p.waitForTimeout(250);
  pausar();
  await p.goto(base + destino, { waitUntil: "load" });
  await p.waitForTimeout(3000);
  grabar();
  await p.waitForTimeout(900); await bajar(p, 520, 3400); await p.waitForTimeout(1400);
}
const escenas = {
  // Inicio → pestaña Tecnología → Cámaras de seguridad → el perfil de SG Solutions.
  profesionales: async (p, grabar, pausar) => {
    await p.goto(INICIO + "/", { waitUntil: "load" });
    await p.waitForTimeout(3500);
    grabar();
    await p.waitForTimeout(1200);
    await bajar(p, 330, 2000); await p.waitForTimeout(700);
    await tocar(p, p.getByRole("tab", { name: "Tecnología" }));
    await p.waitForTimeout(900);
    await tocar(p, p.locator("#servicios-de-la-seccion a", { hasText: "Cámaras de seguridad" }).first());
    await p.waitForTimeout(250);
    pausar();
    // Los resultados y el perfil, de producción (en test no está SG Solutions).
    await p.goto(base + "/profesionales?q=" + encodeURIComponent("Cámaras de seguridad"), { waitUntil: "load" });
    await p.waitForTimeout(4500);
    grabar();
    await p.waitForTimeout(900);
    await bajar(p, 260, 1800); await p.waitForTimeout(700);
    await tocar(p, p.getByText("SG Solutions", { exact: true }).first());
    await p.waitForTimeout(2600); await bajar(p, 420, 3000); await p.waitForTimeout(1400);
  },
  proyectos: (p, g, s) => porElMenu(p, g, s, "Proyectos", "/proyectos"),
  promociones: (p, g, s) => porElMenu(p, g, s, "Promociones", "/promociones"),
  empleos: (p, g, s) => porElMenu(p, g, s, "Empleos", "/empleos"),
};

// Se graba con el «screencast» de Chromium: cuadros a resolución real (2x),
// cada uno con su hora, y ffmpeg los arma respetando esos tiempos.
const b = await chromium.launch();
for (const [clave, escena] of Object.entries(escenas)) {
  if (process.argv[4] && process.argv[4] !== clave) continue;
  const ctx = await b.newContext({
    viewport: { width: 402, height: 875 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-CR",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  });
  await ctx.addCookies([base, TEST, INICIO].map((url) => ({ name: "ccr_platform", value: "native", url })));
  await ctx.addInitScript(() => { try { localStorage.setItem("ccr:native-first-run-onboarding:v12", "1"); } catch {} });
  // Los videos enseñan a encontrar, no a contactar: se ocultan WhatsApp, llamar,
  // contactar y postularse (en tarjetas, perfiles y la barra de abajo).
  await ctx.addInitScript(() => {
    const ocultar = () => {
      for (const el of document.querySelectorAll("a, button")) {
        const t = (el.textContent || "").trim();
        if (/^(contactar|whatsapp|llamar|postular|aplicar|enviar mensaje|escribir)/i.test(t)) el.style.visibility = "hidden";
      }
    };
    new MutationObserver(ocultar).observe(document, { childList: true, subtree: true });
  });
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
  let c = 0;
  for (let n = 0; n < total; n++) {
    const tic = t0 + n / FPS + 1e-4;
    while (c + 1 < cuadros.length && cuadros[c + 1].t <= tic) c++;
    fs.writeFileSync(path.join(dir, `${String(n).padStart(5, "0")}.jpg`), Buffer.from(cuadros[c].data, "base64"));
  }
  execFileSync(ffmpeg, ["-y", "-framerate", String(FPS), "-i", path.join(dir, "%05d.jpg"), "-an", "-vf", "scale=588:-2", "-r", String(FPS), "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${salida}${clave}.mp4`], { stdio: "ignore" });
  execFileSync(ffmpeg, ["-y", "-i", `${salida}${clave}.mp4`, "-frames:v", "1", "-q:v", "3", `${salida}${clave}.jpg`], { stdio: "ignore" });
  console.log("listo", clave, cuadros.length, "cuadros", (finDeEscena - cuadros[0].t).toFixed(1) + "s", Math.round(fs.statSync(`${salida}${clave}.mp4`).size / 1024) + " KB");
}
await b.close();
