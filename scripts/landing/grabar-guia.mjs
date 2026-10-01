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

// Desplaza lo que de verdad se desplaza en esa pantalla (en la app no siempre es la ventana).
async function bajar(p, px, ms) {
  await p.evaluate(async ({ px, ms }) => {
    const candidatos = [document.scrollingElement, ...document.querySelectorAll("main, main *, [class*=scroll]")]
      .filter((el) => el && el.scrollHeight - el.clientHeight > 200 && getComputedStyle(el).overflowY !== "hidden");
    const el = candidatos.sort((a, b) => b.clientHeight - a.clientHeight)[0] || document.scrollingElement;
    const inicio = el.scrollTop, t0 = performance.now();
    await new Promise((fin) => {
      const paso = (t) => {
        const k = Math.min(1, (t - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        el.scrollTop = inicio + px * e;
        k < 1 ? requestAnimationFrame(paso) : fin();
      };
      requestAnimationFrame(paso);
    });
  }, { px, ms });
}

const escenas = {
  // La búsqueda por servicio se graba en TEST (copia los datos públicos de
  // producción) hasta que producción tenga el arreglo del catálogo; se
  // revisa que no salgan las cuentas de prueba.
  profesionales: async (p, grabar) => {
    await p.goto(TEST + "/profesionales/electricidad", { waitUntil: "load" });
    await p.waitForTimeout(4000);
    grabar();
    await p.waitForTimeout(800); await bajar(p, 640, 2600); await p.waitForTimeout(600); await bajar(p, -640, 1300); await p.waitForTimeout(500);
    await p.getByText("Electromec", { exact: true }).first().click();
    await p.waitForTimeout(2600); await bajar(p, 500, 2200); await p.waitForTimeout(800);
  },
  // El único proyecto real de producción: el tablero y su detalle.
  proyectos: async (p, grabar) => {
    await p.goto(base + "/proyectos", { waitUntil: "load" });
    await p.waitForTimeout(3500);
    grabar();
    await p.waitForTimeout(1200);
    await p.getByText("App movil para muestreos").first().click();
    await p.waitForTimeout(2500); await bajar(p, 450, 2200); await p.waitForTimeout(900);
  },
  empleos: async (p, grabar) => {
    await p.goto(base + "/empleos", { waitUntil: "load" });
    await p.waitForTimeout(3500);
    grabar();
    await p.waitForTimeout(900); await bajar(p, 520, 2800); await p.waitForTimeout(700); await bajar(p, -520, 1600); await p.waitForTimeout(700);
  },
  promociones: async (p, grabar) => {
    await p.goto(base + "/promociones", { waitUntil: "load" });
    await p.waitForTimeout(3500);
    grabar();
    await p.waitForTimeout(900); await bajar(p, 560, 2800); await p.waitForTimeout(700); await bajar(p, -560, 1600); await p.waitForTimeout(700);
  },
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
  await ctx.addCookies([base, TEST].map((url) => ({ name: "ccr_platform", value: "native", url })));
  await ctx.addInitScript(() => { try { localStorage.setItem("ccr:native-first-run-onboarding:v12", "1"); } catch {} });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  const cuadros = []; let grabando = false;
  cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    if (grabando) cuadros.push({ t: metadata.timestamp, data });
    await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 804, maxHeight: 1750, everyNthFrame: 1 });
  await escena(p, () => { grabando = true; });
  const finDeEscena = Date.now() / 1000;
  await cdp.send("Page.stopScreencast"); await ctx.close();
  if (!cuadros.length) { console.log("sin cuadros", clave); continue; }
  const dir = fs.mkdtempSync(path.join(tmp, clave)); const lista = [];
  cuadros.forEach((c, n) => {
    const f = path.join(dir, `${String(n).padStart(4, "0")}.jpg`); fs.writeFileSync(f, Buffer.from(c.data, "base64"));
    // El último cuadro dura hasta que termina la escena (si nada se mueve, no llegan cuadros nuevos).
    const d = n + 1 < cuadros.length ? cuadros[n + 1].t - c.t : Math.max(0.05, finDeEscena - c.t);
    lista.push(`file '${f}'`, `duration ${d.toFixed(4)}`);
  });
  lista.push(`file '${path.join(dir, String(cuadros.length - 1).padStart(4, "0") + ".jpg")}'`);
  fs.writeFileSync(path.join(dir, "lista.txt"), lista.join("\n"));
  execFileSync(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", path.join(dir, "lista.txt"), "-an", "-vf", "scale=588:-2,fps=30", "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${salida}${clave}.mp4`], { stdio: "ignore" });
  execFileSync(ffmpeg, ["-y", "-i", `${salida}${clave}.mp4`, "-frames:v", "1", "-q:v", "3", `${salida}${clave}.jpg`], { stdio: "ignore" });
  console.log("listo", clave, cuadros.length, "cuadros", (finDeEscena - cuadros[0].t).toFixed(1) + "s", Math.round(fs.statSync(`${salida}${clave}.mp4`).size / 1024) + " KB");
}
await b.close();
