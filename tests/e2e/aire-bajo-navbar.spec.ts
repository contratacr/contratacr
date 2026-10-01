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

// `conIconos` (teléfono): un rótulo corto («AYER») o un control de solo icono
// (el «···» de los avisos) es lo primero que se ve y cuenta; en computadora
// el título manda y lo angosto no se mira.
const medir = (page: import("playwright/test").Page, conIconos = false) => page.evaluate((conIconos) => {
  const header = [...document.querySelectorAll("header")].find((h) => { const r = h.getBoundingClientRect(); return r.top <= 1 && r.height > 30 && r.width > 300; });
  const bajo = header ? header.getBoundingClientRect().bottom : 0;
  const main = document.querySelector("main") ?? document.body;
  let arriba = Infinity;
  for (const e of main.querySelectorAll("h1,h2,a,button,section,article,div,p,span,input")) {
    const el = e as HTMLElement; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    // Un rótulo corto («AYER», «HOY») también abre el contenido: no se exige ancho a los textos.
    // Un control con solo icono (aria-label) también cuenta: es lo primero que se ve.
    const esTexto = /^(H1|H2|H3|A|BUTTON|P|SPAN|INPUT)$/.test(el.tagName)
      && ((el.textContent || "").trim().length > 0 || (conIconos && /^(A|BUTTON)$/.test(el.tagName) && el.hasAttribute("aria-label")));
    if (r.height < 8 || (r.width < 40 && !(esTexto && conIconos)) || cs.visibility === "hidden" || r.top < bajo - 1) continue;
    const seVe = parseFloat(cs.borderTopWidth) > 0
      || (cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== getComputedStyle(document.body).backgroundColor)
      || esTexto;
    if (seVe) arriba = Math.min(arriba, r.top);
  }
  return Math.round(arriba - bajo);
}, conIconos);

test("el contenido arranca a la misma distancia del navbar", async ({ page }, testInfo) => {
  test.setTimeout(420_000);
  const telefono = testInfo.project.name.includes("mobile");
  const seed = await ensureRegressionSeed();
  await loginAs(page, "e2e.pro@contratacr.test", process.env.E2E_TEST_PASSWORD ?? "");
  const esperado = telefono ? 16 : 32;
  const rutas = telefono
    ? ["/notificaciones", "/soporte", "/ayuda", "/como-funciona", "/terminos", "/privacidad", "/mejorar-mi-perfil", `/profesionales/${seed.professionalSlug}`]
    : ["/notificaciones", "/dashboard/profesional", "/mensajes", "/soporte", "/ayuda", "/como-funciona", "/terminos", "/privacidad", "/mejorar-mi-perfil", "/empleos/publicar", "/promociones/publicar", "/servicios", `/profesionales/${seed.professionalSlug}`];
  const medidas: Record<string, number> = {};
  for (const ruta of rutas) {
    // «load» y no «networkidle»: Notificaciones consulta en segundo plano y en
    // el CI la red nunca llegaba a quedarse quieta (30 s y fuera).
    await page.goto(ruta, { waitUntil: "load" });
    await page.waitForTimeout(1200);
    medidas[ruta] = await medir(page, telefono);
  }
  const fuera = Object.entries(medidas).filter(([, aire]) => Math.abs(aire - esperado) > 2);
  expect(fuera, `Deberían estar a ${esperado} px del navbar: ${JSON.stringify(medidas)}`).toEqual([]);
});
