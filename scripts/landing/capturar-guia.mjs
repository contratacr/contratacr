// Pantallas de la guía de la portada (public/guia/*.jpg), tal como se ven en
// la app. Se toman de PRODUCCIÓN: `node scripts/landing/capturar-guia.mjs https://contratacr.com`.
// (Contra test salen cuentas y publicaciones de prueba.)
import { webkit } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
const base = (process.argv[2] || "https://contratacr.com").replace(/\/$/, "");
const salida = new URL("../../public/guia/", import.meta.url).pathname;
fs.mkdirSync(salida, { recursive: true });
const pantallas = {
  profesionales: "/profesionales/redes-internet",
  proyectos: "/proyectos",
  empleos: "/empleos",
  promociones: "/promociones",
};
const b = await webkit.launch();
const ctx = await b.newContext({
  viewport: { width: 402, height: 875 }, deviceScaleFactor: 1.4627, isMobile: true, hasTouch: true, locale: "es-CR",
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
});
await ctx.addCookies([{ name: "ccr_platform", value: "native", url: base }]);
await ctx.addInitScript(() => { try { localStorage.setItem("ccr:native-first-run-onboarding:v12", "1"); } catch {} });
const p = await ctx.newPage();
for (const [clave, ruta] of Object.entries(pantallas)) {
  await p.goto(base + ruta, { waitUntil: "load" });
  await p.waitForTimeout(4500);
  const png = `${salida}${clave}.png`;
  await p.screenshot({ path: png });
  execFileSync("sips", ["-s", "format", "png", "-z", "1280", "588", png, "--out", png], { stdio: "ignore" });
  // JPG del tamaño exacto que se muestra (en Cloudflare /_next/image no optimiza).
  execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "82", png, "--out", `${salida}${clave}.jpg`], { stdio: "ignore" });
  fs.unlinkSync(png);
  console.log("listo", clave);
}
await b.close();
