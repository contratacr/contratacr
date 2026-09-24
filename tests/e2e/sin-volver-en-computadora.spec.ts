import { expect, test } from "playwright/test";
import { isMobileProject, loginAs } from "./helpers";

// EN COMPUTADORA NO HAY FLECHA DE VOLVER, NUNCA.
// La del navegador ya está a la izquierda de la dirección y hace exactamente
// eso; una segunda dentro de la página duplica el camino y obliga a adivinar si
// hacen lo mismo. En el teléfono sí, que ahí no hay otra.
//
// Un «atrás» de PASO —dentro de un formulario por pasos o de una ventana— no
// entra aquí: ahí la flecha del navegador se saldría del trámite entero.
const VOLVER = /^(←\s*)?(Volver|Ver todos los|Ver todas las|Back to|See all)\b/i;

const PANTALLAS: Array<{ ruta: string; como?: "pro" | "cliente" }> = [
  { ruta: "/es/buscar" },
  { ruta: "/es/servicios" },
  { ruta: "/es/empleos" },
  { ruta: "/es/promociones" },
  { ruta: "/es/proyectos" },
  { ruta: "/es/soporte" },
  { ruta: "/es/como-funciona" },
  { ruta: "/es/ayuda" },
  { ruta: "/es/dashboard/profesional", como: "pro" },
  // La ficha de un profesional llegando del panel y llegando de resultados: es
  // donde salía «Volver a mi panel» y «Volver a resultados».
  { ruta: "/es/profesionales/redes-bahia-pruebas?from=panel", como: "pro" },
  { ruta: "/es/profesionales/redes-bahia-pruebas?from=%2Fbuscar" },
];

async function volveresVisibles(page: import("playwright/test").Page) {
  return page.evaluate((patron) => {
    const re = new RegExp(patron, "i");
    const salida: string[] = [];
    for (const nodo of [...document.querySelectorAll("a, button")] as HTMLElement[]) {
      if (nodo.offsetWidth === 0 && nodo.offsetHeight === 0) continue;
      if (nodo.closest('[role="dialog"]')) continue; // una ventana sí puede volver un paso
      // Lo que delata un «volver» es la FLECHA A LA IZQUIERDA, no el texto:
      // «Ver todos los servicios en el perfil» lleva chevron a la derecha y es
      // un enlace hacia adelante, no una vuelta.
      const flechaIzquierda = [...nodo.querySelectorAll("svg path")]
        .some((d) => /m12 19-7-7 7-7|M19 12H5/i.test(d.getAttribute("d") ?? ""));
      if (!flechaIzquierda) continue;
      const texto = (nodo.innerText || nodo.getAttribute("aria-label") || "").trim();
      if (re.test(texto)) salida.push(`${texto.slice(0, 40)} @ ${nodo.tagName}`);
    }
    return salida;
  }, VOLVER.source);
}

test("@seeded ninguna pantalla de computadora ofrece «volver»", async ({ page }) => {
  test.skip(isMobileProject(test.info()), "La regla es de computadora.");
  await page.setViewportSize({ width: 1440, height: 900 });
  const fallos: string[] = [];
  for (const { ruta, como } of PANTALLAS) {
    if (como === "pro") await loginAs(page, "e2e.pro@contratacr.test", process.env.E2E_TEST_PASSWORD!);
    await page.goto(ruta);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(600);
    const encontrados = await volveresVisibles(page);
    if (encontrados.length) fallos.push(`${ruta} → ${encontrados.join(" | ")}`);

    // Y también la ficha que se abre desde esa pantalla, que es donde más salían.
    const base = ruta.replace("/es", "");
    const enlaces = await page.locator(`a[href*="${base}/"]`).evaluateAll((ns) => ns.map((n) => (n as HTMLAnchorElement).getAttribute("href")));
    const ficha = enlaces.find((h) => h && /[0-9a-f-]{20,}/.test(h) && !/editar|publicar|mis-/.test(h));
    if (ficha) {
      await page.goto(ficha);
      await page.waitForTimeout(900);
      const enFicha = await volveresVisibles(page);
      if (enFicha.length) fallos.push(`${ficha} → ${enFicha.join(" | ")}`);
    }
  }
  expect(fallos, `«Volver» visible en computadora:\n${fallos.join("\n")}`).toEqual([]);
});
