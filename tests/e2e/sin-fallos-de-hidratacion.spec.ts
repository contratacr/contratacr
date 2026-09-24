import { expect, test, type ConsoleMessage, type Page } from "playwright/test";
import { firstProfessionalHref, loginAs } from "./helpers";

/**
 * NINGUNA PANTALLA FALLA AL HIDRATAR.
 *
 * Cuando el primer render del navegador no produce EXACTAMENTE lo que pintó el
 * servidor, React lo dice («Hydration failed…») y hace lo único que puede:
 * tirar toda la pantalla del servidor y repintarla. Eso es un parpadeo de
 * pantalla completa, y no deja rastro en ninguna otra prueba porque la pantalla
 * termina bien.
 *
 * El 20-sep-2026 fallaban así la portada y /buscar —las dos pantallas más
 * visitadas— en cada carga, con sesión y sin ella: el servidor pintaba con el
 * catálogo de servicios de la base («Nutrición», «Radios de comunicación») y
 * el navegador hidrataba sin él («Nutrición y dietética», «Radios de
 * comunicacion»). Isaac lo veía como «parpadea en todas las secciones».
 *
 * La causa de fondo es siempre la misma familia: algo que el servidor sabe y
 * el navegador todavía no al hidratar (o al revés). Esta prueba no adivina
 * cuál: recorre el app y exige cero errores de hidratación.
 */
const PUBLICAS = [
  "/es", "/en", "/es/buscar", "/es/buscar?provincia=sj", "/es/buscar?categoria=plomeria",
  "/es/servicios", "/es/empleos", "/es/promociones", "/es/proyectos", "/es/ayuda", "/es/como-funciona", "/es/login",
];
const CON_SESION = [
  "/es", "/es/buscar?provincia=sj", "/es/empleos", "/es/promociones",
  "/es/dashboard/profesional", "/es/dashboard/profesional?tab=profile", "/es/dashboard/profesional?tab=services",
  "/es/dashboard/profesional?tab=offers", "/es/notificaciones",
];

async function fallosDeHidratacion(page: Page, rutas: string[]) {
  const rotas: string[] = [];
  for (const ruta of rutas) {
    const errores: string[] = [];
    const alError = (e: Error) => { if (/hydrat|didn't match/i.test(e.message)) errores.push(e.message); };
    const alLog = (m: ConsoleMessage) => { if (m.type() === "error" && /hydrat|didn't match/i.test(m.text())) errores.push(m.text()); };
    page.on("pageerror", alError);
    page.on("console", alLog);
    await page.goto(ruta);
    await page.waitForTimeout(2500);
    page.off("pageerror", alError);
    page.off("console", alLog);
    if (!errores.length) continue;
    const diferencia = errores.join("\n").split("\n").filter((l) => /^\s*[+-]\s{2,}\S/.test(l)).slice(0, 2).map((l) => l.trim()).join("  /  ");
    rotas.push(`${ruta} → ${diferencia || errores[0].slice(0, 140)}`);
  }
  return rotas;
}

test("sin sesión, ninguna pantalla falla al hidratar", async ({ page }) => {
  test.setTimeout(300_000);
  const perfil = await firstProfessionalHref(page);
  const rotas = await fallosDeHidratacion(page, [...PUBLICAS, ...(perfil ? [perfil] : [])]);
  expect(rotas, `pantallas que React tuvo que repintar enteras:\n${rotas.join("\n")}`).toEqual([]);
});

test("con sesión, ninguna pantalla falla al hidratar", async ({ page }) => {
  test.setTimeout(300_000);
  await loginAs(page, "e2e.pro@contratacr.test", process.env.E2E_TEST_PASSWORD || "");
  const rotas = await fallosDeHidratacion(page, CON_SESION);
  expect(rotas, `pantallas que React tuvo que repintar enteras:\n${rotas.join("\n")}`).toEqual([]);
});
