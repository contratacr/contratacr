import { expect, test } from "playwright/test";

// LA REGLA, AL REVÉS DE COMO ESTABA: ni el navbar ni las cabeceras pegadas ni
// las franjas de abajo llevan sombra NUNCA, tampoco al desplazar. Se separan
// con su línea fina y con nada más. Estuvieron encendiéndola «cuando había algo
// pasando por debajo» y el resultado era una mancha gris sobre el contenido:
// donde ya había línea, eran dos separaciones sobre la misma junta.
//
// Esta prueba existía para exigir lo contrario. Se conserva —con el sentido
// invertido— porque el mecanismo que encendía esas sombras era global y fácil
// de revivir sin querer.
const PANTALLAS = ["/es/servicios", "/es/empleos", "/es/ofertas", "/es/buscar"];

const BORDES = ".ccr-cabecera-pegada, .ccr-barra-fija, .ccr-pie-pegado, .ccr-pie-ventana, .ccr-pie-formulario";

test("@seeded ni la cabecera pegada ni las franjas de abajo levantan sombra, tampoco al desplazar", async ({ page }) => {
  for (const ruta of PANTALLAS) {
    await page.goto(ruta);
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(page.locator(".ccr-cabecera-pegada").first(), `${ruta} debe tener una cabecera pegada`).toBeAttached();

    // Desplazar lo que de verdad se desplaza en esta pantalla: hay pantallas
    // —/buscar— donde el contenido se mueve dentro de un contenedor.
    await page.evaluate(() => {
      const doc = document.scrollingElement!;
      if (doc.scrollHeight > doc.clientHeight + 100) { window.scrollTo(0, 400); return; }
      const dentro = ([...document.querySelectorAll("*")] as HTMLElement[])
        .find((e) => e.clientHeight > 300 && e.scrollHeight > e.clientHeight + 100 && /auto|scroll/.test(getComputedStyle(e).overflowY));
      dentro?.scrollTo({ top: 400 });
    });
    await page.waitForTimeout(400);

    // Ya desplazada: ninguno de esos bordes puede tener sombra.
    const conSombra = await page.evaluate((sel) => ([...document.querySelectorAll(sel)] as HTMLElement[])
      .filter((e) => e.getBoundingClientRect().height > 0 && getComputedStyle(e).boxShadow !== "none")
      .map((e) => `${[...e.classList].slice(0, 3).join(".")} -> ${getComputedStyle(e).boxShadow}`), BORDES);
    expect(conSombra, `${ruta}: estos bordes levantaron sombra al desplazar`).toEqual([]);

    // La marca global sigue viva (otras cosas la usan); lo que no vuelve es la sombra.
    expect(await page.evaluate(() => document.body.hasAttribute("data-ccr-desplazado")), `${ruta}`).toBe(true);
  }
});
