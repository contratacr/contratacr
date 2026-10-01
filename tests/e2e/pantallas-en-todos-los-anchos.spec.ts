import { expect, test } from "playwright/test";
import { expectHealthyPage, gotoOK, isMobileProject, loginAs, waitForInteractivePage } from "./helpers";
import { canRunSeededRegression, E2E_USERS } from "./seed";

/**
 * TODAS LAS PANTALLAS PRINCIPALES, EN TODOS LOS ANCHOS.
 *
 * La regresión repetía la suite en dos anchos (1366 y 390). Entre medio hay
 * tablets, laptops chicas y teléfonos angostos donde lo que se rompe es lo
 * visual: una fila que se sale del borde, una llave de traducción cruda, un
 * error en la consola que nadie ve. Aquí cada pantalla se visita a 320, 390,
 * 768, 1024, 1366 y 1440 y se comprueba lo que un ojo humano revisaría:
 *
 *  · nada se desborda a lo ancho (sin scroll horizontal),
 *  · no hay llaves de traducción sin traducir,
 *  · no hay errores de consola, peticiones fallidas ni 5xx,
 *  · la página carga dentro del presupuesto (contra un servidor de producción).
 *
 * El inglés se revisa en los dos anchos más usados; el panel, con la cuenta
 * profesional de regresión, cuando hay datos sembrados.
 */

const ANCHOS = [320, 390, 768, 1024, 1366, 1440] as const;
const ANCHOS_EN_INGLES = new Set([390, 1366]);
const ANCHOS_DEL_PANEL = new Set([320, 390, 1024, 1366]);

// Contra `next dev` el tiempo de carga no dice nada (compila al vuelo); solo
// se mide con `next start` (PLAYWRIGHT_LOCAL_PRODUCTION) o contra un dominio.
const MEDIR_TIEMPOS = process.env.PLAYWRIGHT_LOCAL_PRODUCTION === "1" || !!process.env.PLAYWRIGHT_BASE_URL;
const PRESUPUESTO_MS = Number(process.env.PRESUPUESTO_CARGA_MS || 6000);

const PUBLICAS = [
  "/",
  "/profesionales/todos",
  "/servicios",
  "/empleos",
  "/promociones",
  "/proyectos",
  "/ayuda",
  "/como-funciona",
  "/soporte",
  "/terminos",
  "/privacidad",
  "/login",
  "/registro/profesional",
];

const PANEL = [
  "/dashboard/profesional",
  "/dashboard/profesional?tab=sent_projects",
  "/dashboard/profesional?tab=quotes",
  "/dashboard/profesional?tab=photos",
  "/dashboard/profesional?tab=services",
  "/dashboard/profesional?tab=profile",
  "/dashboard/profesional?tab=saved",
  "/dashboard/profesional?tab=soporte",
  "/notificaciones",
  "/mensajes",
];

const conIdioma = (ruta: string, locale: "es" | "en") => (locale === "en" ? `/en${ruta === "/" ? "" : ruta}` || "/en" : ruta);

async function revisar(page: import("playwright/test").Page, ruta: string, ancho: number) {
  const arranque = Date.now();
  await gotoOK(page, ruta);
  await waitForInteractivePage(page);
  await expectHealthyPage(page);
  if (MEDIR_TIEMPOS) {
    const cargada = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      return nav ? Math.round(nav.domContentLoadedEventEnd) : null;
    });
    const medida = cargada ?? Date.now() - arranque;
    expect(medida, `${ruta} a ${ancho}px tardó ${medida} ms en cargar (presupuesto ${PRESUPUESTO_MS} ms)`).toBeLessThanOrEqual(PRESUPUESTO_MS);
  }
}

for (const ancho of ANCHOS) {
  test(`@smoke @anchos cada pantalla se ve bien y carga a ${ancho}px`, async ({ page }, testInfo) => {
    test.skip(isMobileProject(testInfo), "Este caso fija su propio ancho; con el proyecto móvil se repetiría.");
    test.setTimeout(300_000);
    await page.setViewportSize({ width: ancho, height: ancho < 768 ? 844 : 900 });

    for (const ruta of PUBLICAS) await revisar(page, ruta, ancho);
    if (ANCHOS_EN_INGLES.has(ancho)) {
      for (const ruta of PUBLICAS) await revisar(page, conIdioma(ruta, "en"), ancho);
    }

    if (ANCHOS_DEL_PANEL.has(ancho) && canRunSeededRegression()) {
      await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
      await page.setViewportSize({ width: ancho, height: ancho < 768 ? 844 : 900 });
      for (const ruta of PANEL) await revisar(page, ruta, ancho);
    }
  });
}
