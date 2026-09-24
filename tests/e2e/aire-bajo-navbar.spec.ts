import { expect, test } from "playwright/test";
import { loginAs } from "./helpers";
import { ensureRegressionSeed } from "./seed";

// El primer bloque de cada pantalla empieza a la MISMA distancia del navbar:
// 32 px en computadora —lo que mide el panel— y 16 px en el teléfono. Iba de
// 23 a 83 px según la plantilla de cada página (pt-12 debajo del espaciador del
// navbar, pt-28 en los textos legales, pt-24 + p-6 en Notificaciones…).
//
// Empleos, Proyectos y /buscar quedan fuera a propósito: llevan su barra de
// filtros pegada al navbar.

const medir = (page: import("playwright/test").Page) => page.evaluate(() => {
  const header = [...document.querySelectorAll("header")].find((h) => { const r = h.getBoundingClientRect(); return r.top <= 1 && r.height > 30 && r.width > 300; });
  const bajo = header ? header.getBoundingClientRect().bottom : 0;
  const main = document.querySelector("main") ?? document.body;
  let arriba = Infinity;
  for (const e of main.querySelectorAll("h1,h2,a,button,section,article,div,p,span,input")) {
    const el = e as HTMLElement; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (r.height < 8 || r.width < 40 || cs.visibility === "hidden" || r.top < bajo - 1) continue;
    const seVe = parseFloat(cs.borderTopWidth) > 0
      || (cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== getComputedStyle(document.body).backgroundColor)
      || (/^(H1|H2|A|BUTTON|P|SPAN|INPUT)$/.test(el.tagName) && (el.textContent || "").trim().length > 0);
    if (seVe) arriba = Math.min(arriba, r.top);
  }
  return Math.round(arriba - bajo);
});

test("el contenido arranca a la misma distancia del navbar", async ({ page }, testInfo) => {
  test.setTimeout(420_000);
  const telefono = testInfo.project.name.includes("mobile");
  const seed = await ensureRegressionSeed();
  await loginAs(page, "e2e.pro@contratacr.test", process.env.E2E_TEST_PASSWORD ?? "");
  const esperado = telefono ? 16 : 32;
  const rutas = telefono
    ? ["/es/notificaciones", "/es/soporte", "/es/ayuda", "/es/como-funciona", "/es/terminos", "/es/privacidad", "/es/mejorar-mi-perfil", `/es/profesionales/${seed.professionalSlug}`]
    : ["/es/notificaciones", "/es/dashboard/profesional", "/es/mensajes", "/es/soporte", "/es/ayuda", "/es/como-funciona", "/es/terminos", "/es/privacidad", "/es/mejorar-mi-perfil", "/es/empleos/publicar", "/es/promociones/publicar", "/es/servicios", `/es/profesionales/${seed.professionalSlug}`];
  const medidas: Record<string, number> = {};
  for (const ruta of rutas) {
    await page.goto(ruta, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    medidas[ruta] = await medir(page);
  }
  const fuera = Object.entries(medidas).filter(([, aire]) => Math.abs(aire - esperado) > 2);
  expect(fuera, `Deberían estar a ${esperado} px del navbar: ${JSON.stringify(medidas)}`).toEqual([]);
});
