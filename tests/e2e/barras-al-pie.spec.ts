import { test, expect } from "playwright/test";
import { gotoOK, isMobileProject, loginAs } from "./helpers";
import { E2E_USERS } from "./seed";

// La franja de acciones pegada al fondo es UNA sola pantalla repetida: soporte,
// publicar empleo, publicar promoción, la ficha de un empleo, de un proyecto,
// de una promoción y la del profesional. La referencia es «Cuéntanos qué
// necesitas» (crear proyecto), que es la que se ve bien. Estaba escrita a mano
// en cada sección con rellenos distintos: se veían parecidas y no eran iguales,
// y en el iPhone la diferencia se nota —Safari tiñe su barra con el borde de
// abajo de la página—. Esta prueba sostiene que siguen siendo la misma.
const CAJA_ESPERADA = {
  padding: "16px 20px 28px 20px",
  borde: "1px rgb(229, 231, 235)",
  fondo: "rgb(255, 255, 255)",
};

type Franja = {
  caja: { padding: string; borde: string; fondo: string } | null;
  alto: number;
  alFondo: boolean;
  fija: boolean;
  pieVisible: boolean;
  /** Aire entre el borde de la PANTALLA y el botón más pegado a cada lado. */
  aire: { izq: number; der: number } | null;
  /** Cada botón de la franja: alto, ancho y cuerpo de letra. */
  botones: { alto: number; ancho: number; letra: string; peso: string }[];
};

async function medirFranja(page: import("playwright/test").Page): Promise<Franja> {
  await page.waitForTimeout(600);
  return page.evaluate(() => {
    const barra = Array.from(document.querySelectorAll<HTMLElement>(".ccr-barra-accion"))
      .find((n) => n.getBoundingClientRect().height > 0) ?? null;
    const pie = document.querySelector<HTMLElement>(".ccr-app-footer");
    if (!barra) return { caja: null, alto: 0, alFondo: false, fija: false, aire: null, botones: [], pieVisible: !!pie && getComputedStyle(pie).display !== "none" };
    const cs = getComputedStyle(barra);
    const r = barra.getBoundingClientRect();
    const botones = Array.from(barra.querySelectorAll<HTMLElement>("button, a")).filter((n) => n.getBoundingClientRect().height > 0);
    return {
      botones: botones.map((n) => {
        const rb = n.getBoundingClientRect();
        const cb = getComputedStyle(n);
        return { alto: Math.round(rb.height), ancho: Math.round(rb.width), letra: cb.fontSize, peso: cb.fontWeight };
      }),
      aire: botones.length
        ? {
            izq: Math.round(Math.min(...botones.map((n) => n.getBoundingClientRect().x))),
            der: Math.round(window.innerWidth - Math.max(...botones.map((n) => n.getBoundingClientRect().right))),
          }
        : null,
      caja: {
        padding: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
        borde: `${cs.borderTopWidth} ${cs.borderTopColor}`,
        fondo: cs.backgroundColor,
      },
      alto: Math.round(r.height),
      alFondo: Math.abs(r.bottom - window.innerHeight) <= 1,
      fija: cs.position === "fixed",
      pieVisible: !!pie && getComputedStyle(pie).display !== "none",
    };
  });
}

test.describe("@seeded franjas de acciones al pie", () => {
  test("toda sección con franja al pie usa la misma que crear proyecto", async ({ page }, testInfo) => {
    test.slow();
    if (!isMobileProject(testInfo)) test.skip(true, "La franja fija es del teléfono: en computadora la acción vive dentro de la tarjeta.");

    const pantallas: { nombre: string; abrir: () => Promise<void> }[] = [];

    // Direcciones reales de las fichas: se toman de los tableros, que es de
    // donde entra la gente.
    const primerEnlace = async (lista: string, patron: string) => {
      await gotoOK(page, lista);
      await page.waitForTimeout(1500);
      return page.evaluate((p) => {
        const re = new RegExp(p);
        return Array.from(document.querySelectorAll("main a")).map((a) => a.getAttribute("href") ?? "").find((h) => re.test(h)) ?? null;
      }, patron);
    };
    const empleo = await primerEnlace("/es/empleos", "/empleos/[0-9a-f-]{8,}");
    const proyecto = await primerEnlace("/es/proyectos", "/proyectos/[0-9a-f-]{8,}");

    pantallas.push({ nombre: "soporte", abrir: async () => { await gotoOK(page, "/es/soporte"); } });
    if (empleo) pantallas.push({ nombre: "ficha de empleo", abrir: async () => { await gotoOK(page, empleo); } });
    if (proyecto) pantallas.push({ nombre: "ficha de proyecto", abrir: async () => { await gotoOK(page, proyecto); } });
    pantallas.push({ nombre: "ficha profesional", abrir: async () => { await gotoOK(page, "/es/profesionales/redes-bahia-pruebas"); await page.waitForTimeout(1200); } });

    const medidas: { nombre: string; franja: Franja }[] = [];
    for (const pantalla of pantallas) {
      await pantalla.abrir();
      medidas.push({ nombre: pantalla.nombre, franja: await medirFranja(page) });
    }

    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    for (const [nombre, ruta] of [["publicar empleo", "/es/empleos/publicar"], ["publicar promoción", "/es/ofertas/publicar"]] as const) {
      await gotoOK(page, ruta);
      medidas.push({ nombre, franja: await medirFranja(page) });
    }

    // La referencia, medida en el mismo viaje.
    await gotoOK(page, "/es/dashboard/profesional?tab=sent_projects");
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: /Publicar proyecto|Post a project/i }).filter({ visible: true }).first().click();
    const referencia = await medirFranja(page);
    expect(referencia.caja, "Crear proyecto es la referencia: tiene que tener franja").not.toBeNull();
    expect(referencia.caja).toEqual(CAJA_ESPERADA);
    expect(referencia.botones.length, "Crear proyecto tiene que traer su botón").toBeGreaterThan(0);

    for (const { nombre, franja } of medidas) {
      expect(franja.caja, `«${nombre}» perdió su franja de acciones`).not.toBeNull();
      expect(franja.caja, `«${nombre}» dibuja la franja con otra medida`).toEqual(CAJA_ESPERADA);
      // El alto de la franja depende de CUÁNTAS acciones tenga (la ficha del
    // profesional lleva dos), así que lo que tiene que ser igual es el BOTÓN:
    // 48 px de alto, a todo el ancho y con el rótulo a 16 px, como «Publicar».
    const botonRef = referencia.botones[0];
    for (const b of franja.botones) {
      expect({ alto: b.alto, letra: b.letra, peso: b.peso }, `«${nombre}» dibuja un botón distinto al de Crear proyecto`)
        .toEqual({ alto: botonRef.alto, letra: botonRef.letra, peso: botonRef.peso });
      // Una franja con DOS acciones las pone lado a lado, así que cada botón se
      // lleva media franja: lo que tiene que ser igual es el botón —alto y
      // letra—, no el ancho.
      // 12 px entre botones: la separación única de la app (data-ccr-separacion).
      const anchoEsperado = franja.botones.length > 1 ? (botonRef.ancho - 12) / 2 : botonRef.ancho;
      expect(Math.abs(b.ancho - anchoEsperado), `«${nombre}» no reparte el ancho de la franja entre sus botones`).toBeLessThanOrEqual(1);
    }
      expect(franja.fija, `«${nombre}» no deja la franja pegada al fondo`).toBe(true);
      expect(franja.alFondo, `«${nombre}» deja la franja despegada del borde`).toBe(true);
      // El pie del sitio es una lista de salidas: detrás del único botón que la
      // pantalla pide tocar, sobra.
      expect(franja.pieVisible, `«${nombre}» deja el pie del sitio detrás de la franja`).toBe(false);
      // Y lo que de verdad se ve: los BOTONES no tocan el filo de la pantalla.
      // El relleno de la franja puede estar bien y aun así una pantalla estirar
      // sus botones por encima de él —así se rompió tres veces—.
      expect(franja.aire, `«${nombre}» dejó la franja sin botones`).not.toBeNull();
      expect(franja.aire!.izq, `«${nombre}» pega el botón al filo izquierdo`).toBeGreaterThanOrEqual(16);
      expect(franja.aire!.der, `«${nombre}» pega el botón al filo derecho`).toBeGreaterThanOrEqual(16);
    }
  });

  test("en la pantalla más angosta los botones tampoco tocan el filo", async ({ page }, testInfo) => {
    if (!isMobileProject(testInfo)) test.skip(true, "La franja fija es del teléfono.");
    // 320 px es el teléfono más angosto que soportamos: si algo va a desbordar,
    // desborda aquí primero.
    await page.setViewportSize({ width: 320, height: 720 });
    for (const ruta of ["/es/soporte", "/es/profesionales/redes-bahia-pruebas"]) {
      await gotoOK(page, ruta);
      const franja = await medirFranja(page);
      expect(franja.caja, `«${ruta}» perdió su franja a 320 px`).not.toBeNull();
      expect(franja.aire, `«${ruta}» dejó la franja sin botones a 320 px`).not.toBeNull();
      expect(franja.aire!.izq, `«${ruta}» pega el botón al filo izquierdo a 320 px`).toBeGreaterThanOrEqual(16);
      expect(franja.aire!.der, `«${ruta}» pega el botón al filo derecho a 320 px`).toBeGreaterThanOrEqual(16);
    }
  });

  test("la franja no depende de la hoja de estilos: sobrevive sin ninguna clase de Tailwind", async ({ page }, testInfo) => {
    if (!isMobileProject(testInfo)) test.skip(true, "La franja fija es del teléfono.");
    // Así se rompió una y otra vez: el componente llegaba a la pantalla con
    // clases de Tailwind cuyo CSS todavía no existía en la hoja servida (en
    // desarrollo las clases nuevas no llegan hasta reiniciar el servidor), y la
    // franja salía sin relleno, sin línea y con los botones contra el filo. La
    // regla vive ahora DENTRO del documento (layout.tsx). Esta prueba le quita
    // a la franja todas sus utilidades y exige que siga midiendo lo mismo.
    for (const ruta of ["/es/soporte", "/es/profesionales/redes-bahia-pruebas"]) {
      await gotoOK(page, ruta);
      await page.waitForTimeout(1200);
      await expect(page.locator("style[data-ccr-franja]"), "La regla de la franja tiene que viajar dentro del documento").toHaveCount(1);
      const caja = await page.evaluate(() => {
        const barra = Array.from(document.querySelectorAll<HTMLElement>(".ccr-barra-accion")).find((n) => n.getBoundingClientRect().height > 0);
        if (!barra) return null;
        barra.className = barra.className.split(/\s+/).filter((c) => c.startsWith("ccr-") || ["flex", "flex-col", "gap-2", "grid"].includes(c)).join(" ");
        const cs = getComputedStyle(barra);
        const r = barra.getBoundingClientRect();
        const botones = Array.from(barra.querySelectorAll<HTMLElement>("button, a")).filter((n) => n.getBoundingClientRect().height > 0);
        return {
          posicion: cs.position,
          padding: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
          borde: `${cs.borderTopWidth} ${cs.borderTopColor}`,
          fondo: cs.backgroundColor,
          aireArriba: Math.round(Math.min(...botones.map((n) => n.getBoundingClientRect().y)) - r.y),
          aireIzq: Math.round(Math.min(...botones.map((n) => n.getBoundingClientRect().x))),
        };
      });
      expect(caja, `«${ruta}» perdió su franja`).not.toBeNull();
      expect(caja!.posicion, `«${ruta}»: sin Tailwind la franja deja de estar fija`).toBe("fixed");
      expect({ padding: caja!.padding, borde: caja!.borde, fondo: caja!.fondo }, `«${ruta}»: sin Tailwind la franja pierde su caja`).toEqual(CAJA_ESPERADA);
      expect(caja!.aireArriba, `«${ruta}»: el botón toca el borde de arriba de la franja`).toBeGreaterThanOrEqual(16);
      expect(caja!.aireIzq, `«${ruta}»: el botón toca el filo de la pantalla`).toBeGreaterThanOrEqual(16);
    }
  });

  test("una ficha sin forma de contactar no dibuja la franja vacía", async ({ page }, testInfo) => {
    if (!isMobileProject(testInfo)) test.skip(true, "La franja fija es del teléfono.");
    // Quién contacta depende de los datos del profesional: sin WhatsApp y sin
    // llamadas no hay botón, y la franja pintaba igual —una tira blanca pegada
    // al fondo con su línea arriba, prometiendo una acción que no existe—.
    await gotoOK(page, "/es/ofertas");
    await page.waitForTimeout(1500);
    const fichas = await page.evaluate(() =>
      Array.from(new Set(Array.from(document.querySelectorAll("main a"))
        .map((a) => a.getAttribute("href") ?? "")
        .filter((h) => /\/ofertas\/[0-9a-f-]{8,}/.test(h)))).slice(0, 6));
    expect(fichas.length, "El tablero de promociones vino vacío").toBeGreaterThan(0);

    for (const ficha of fichas) {
      await gotoOK(page, ficha);
      // La franja se esconde cuando ya se sabe que no hay a quién escribir: el
      // dato de contacto llega con la ficha, no con el HTML.
      await page.waitForTimeout(900);
      const { conFranja, conAccion } = await page.evaluate(() => {
        const barra = Array.from(document.querySelectorAll<HTMLElement>(".ccr-barra-accion"))
          .find((n) => n.getBoundingClientRect().height > 0) ?? null;
        const contactos = Array.from(document.querySelectorAll<HTMLElement>(".ccr-barra-accion button, .ccr-barra-accion a"));
        return { conFranja: !!barra, conAccion: contactos.length > 0 };
      });
      expect(conFranja, `La promoción ${ficha} dibuja una franja sin ninguna acción adentro`).toBe(conAccion);
    }
  });
});

// Entre botones vecinos hay SIEMPRE 12 px. En «Publicar empleo» abierto como
// ventana, Cancelar y Publicar se tocaban: esa franja no ponía separación y
// cada franja la decidía por su cuenta. La regla vive en `layout.tsx`
// (data-ccr-separacion); aquí se le quitan las clases de Tailwind a la franja
// para asegurar que no depende de ellas.
test.describe("@seeded separación entre botones", () => {
  test("Cancelar y Publicar empleo quedan a 12 px, sin clases de Tailwind", async ({ page }, testInfo) => {
    test.skip(isMobileProject(testInfo), "En el teléfono la ventana solo lleva el botón de publicar.");
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    await gotoOK(page, "/es/empleos");
    await page.getByRole("button", { name: /Publicar empleo/i }).filter({ visible: true }).first().click();
    const franja = page.locator("[role='dialog'] .ccr-barra-accion").filter({ visible: true }).first();
    await expect(franja).toBeVisible();
    const hueco = await franja.evaluate((f: HTMLElement) => {
      f.className = "ccr-pie-formulario ccr-barra-accion";
      f.style.display = "flex";
      const botones = ([...f.querySelectorAll("button")] as HTMLElement[]).filter((b) => b.getBoundingClientRect().width > 0);
      const [a, b] = botones.map((x) => x.getBoundingClientRect()).sort((x, y) => x.left - y.left);
      return Math.round(b.left - a.right);
    });
    expect(hueco).toBe(12);
  });
});
