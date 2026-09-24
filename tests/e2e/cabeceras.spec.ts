import { test, expect } from "playwright/test";
import { gotoOK, isMobileProject, loginAs } from "./helpers";
import { E2E_USERS } from "./seed";

// La barra de arriba es UNA sola, repetida en todo el app: la portada, los tres
// tableros, las fichas, los formularios de publicar y el panel. Había seis
// versiones —56 px de alto en unos sitios y 64 en otros, el botón de 40 o de 44,
// su dibujo de 20, 24 o 28, el título a 17, 18 o 21 y el logotipo en tres
// tamaños—, así que pasar de Empleos al panel movía la marca 12 px y le cambiaba
// el cuerpo a la letra, en la misma esquina de la misma pantalla.
//
// La regla, toda junta: fila de 64; primer control de 40×40 a 16 px del borde;
// la marca, cuando está, a 64; el título a 17.
const REGLA = { fila: 64, control: { x: 16, tamano: 40 }, marca: { x: 64, tamano: 32 }, titulo: "17px" };

type Cabecera = { mismaFila: boolean | null; fila: number; control: { x: number; w: number; h: number } | null; marca: { x: number; w: number; h: number } | null; titulo: string | null };

async function medirCabecera(page: import("playwright/test").Page): Promise<Cabecera> {
  await page.waitForTimeout(800);
  return page.evaluate(() => {
    const visible = (n: Element | null) => !!n && n.getBoundingClientRect().height > 0;
    const arriba = (n: Element) => n.getBoundingClientRect().y < 72;
    const marca = Array.from(document.querySelectorAll<HTMLImageElement>('img[alt="ContrataCR"]'))
      .find((n) => visible(n) && !n.closest(".ccr-app-footer") && arriba(n)) ?? null;
    const control = Array.from(document.querySelectorAll<HTMLElement>("header button, header a, .ccr-marketplace-sticky button, .ccr-marketplace-sticky a, div[class*='sticky'] button"))
      .find((n) => visible(n) && arriba(n) && n.getBoundingClientRect().x < 120) ?? null;
    const titulo = Array.from(document.querySelectorAll<HTMLElement>("header h1, header h2, header p[data-ccr-section-title], .ccr-marketplace-sticky h1, div[class*='sticky'] h2"))
      .find((n) => visible(n) && arriba(n)) ?? null;
    const ancla = marca ? (marca.closest("a")?.parentElement as HTMLElement | null) : (control?.parentElement as HTMLElement | null);
    const caja = (n: HTMLElement | null) => (n ? { x: Math.round(n.getBoundingClientRect().x), w: Math.round(n.getBoundingClientRect().width), h: Math.round(n.getBoundingClientRect().height) } : null);
    const centroY = (n: HTMLElement) => { const b = n.getBoundingClientRect(); return b.y + b.height / 2; };
    return {
      mismaFila: control && titulo ? Math.abs(centroY(control) - centroY(titulo)) <= 3 : null,
      fila: ancla ? Math.round(ancla.getBoundingClientRect().height) : 0,
      control: caja(control),
      marca: caja(marca),
      titulo: titulo ? getComputedStyle(titulo).fontSize : null,
    };
  });
}

function revisar(nombre: string, c: Cabecera) {
  expect(c.fila, `«${nombre}» dibuja la barra con otro alto`).toBe(REGLA.fila);
  expect(c.control, `«${nombre}» no tiene control a la izquierda`).not.toBeNull();
  expect({ x: c.control!.x, w: c.control!.w, h: c.control!.h }, `«${nombre}» pone el primer control en otro sitio o con otro tamaño`)
    .toEqual({ x: REGLA.control.x, w: REGLA.control.tamano, h: REGLA.control.tamano });
  if (c.marca) {
    expect({ x: c.marca.x, w: c.marca.w, h: c.marca.h }, `«${nombre}» dibuja la marca en otro sitio o con otro tamaño`)
      .toEqual({ x: REGLA.marca.x, w: REGLA.marca.tamano, h: REGLA.marca.tamano });
  }
  if (c.titulo) expect(c.titulo, `«${nombre}» escribe el título con otro cuerpo`).toBe(REGLA.titulo);
  // La flecha y el título van en la MISMA fila. Así se vio «Ofrecer mis
  // servicios»: la rejilla sin columnas apilaba la flecha arriba y el título
  // abajo, y nada de lo anterior lo detectaba —todo medía «bien» por separado—.
  if (c.mismaFila !== null) expect(c.mismaFila, `«${nombre}» apila la flecha y el título en renglones distintos`).toBe(true);
}

test.describe("@seeded cabeceras", () => {
  test("toda pantalla dibuja la misma barra de arriba", async ({ page }, testInfo) => {
    test.slow();
    if (!isMobileProject(testInfo)) test.skip(true, "La barra con marca + título es la del teléfono; en computadora el navbar es uno solo.");

    for (const ruta of ["/es/empleos", "/es/promociones", "/es/proyectos", "/es/servicios", "/es/login", "/es/registro/profesional"]) {
      await gotoOK(page, ruta);
      revisar(ruta, await medirCabecera(page));
    }

    // Fichas: la barra pasa a ser «flecha + título», y tiene que medir igual.
    for (const [lista, patron] of [["/es/empleos", "/empleos/[0-9a-f-]{8,}"], ["/es/proyectos", "/proyectos/[0-9a-f-]{8,}"], ["/es/promociones", "/promociones/[0-9a-f-]{8,}"]] as const) {
      await gotoOK(page, lista);
      await page.waitForTimeout(1500);
      const href = await page.evaluate((p) => {
        const re = new RegExp(p);
        return Array.from(document.querySelectorAll("main a")).map((a) => a.getAttribute("href") ?? "").find((h) => re.test(h)) ?? null;
      }, patron);
      if (!href) continue;
      await gotoOK(page, href);
      revisar(`ficha ${href}`, await medirCabecera(page));
    }

    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    for (const ruta of ["/es/empleos/publicar", "/es/promociones/publicar", "/es/dashboard/profesional?tab=profile", "/es/dashboard/profesional?tab=saved", "/es/dashboard/profesional?tab=soporte", "/es/dashboard/profesional?tab=services", "/es/notificaciones"]) {
      await gotoOK(page, ruta);
      revisar(ruta, await medirCabecera(page));
    }
  });

  test("el navbar de computadora no se desordena al angostar la ventana", async ({ page }, testInfo) => {
    test.slow();
    if (isMobileProject(testInfo)) test.skip(true, "Es la barra de computadora.");
    // Sin sesión es el caso apretado: lleva Ingresar y «Ofrecer mis servicios».
    // Entre 1024 y 1300 px fallaba de dos formas según la pantalla: en los
    // tableros el buscador era rígido y empujaba el botón y el idioma FUERA de
    // la ventana; en /buscar era el buscador el que lo cedía todo y quedaba en
    // dos íconos dentro de una cajita. La regla: nada sale de la pantalla y el
    // buscador nunca baja de 260 px; lo primero que cede es «Sobre ContrataCR».
    for (const ruta of ["/es/empleos", "/es/buscar?q=desarrollo", "/es/promociones"]) {
      for (const ancho of [1024, 1100, 1180, 1280, 1366]) {
        await page.setViewportSize({ width: ancho, height: 800 });
        await gotoOK(page, ruta);
        await page.waitForTimeout(900);
        const m = await page.evaluate(() => {
          const W = window.innerWidth;
          const nav = document.querySelector("header")!;
          const items = Array.from(nav.querySelectorAll<HTMLElement>("a, button")).filter((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.y < 70; });
          const fuera = items.filter((n) => n.getBoundingClientRect().right > W + 1).map((n) => (n.getAttribute("aria-label") || n.textContent || "").trim().slice(0, 24));
          const campo = Array.from(nav.querySelectorAll<HTMLElement>("input")).find((n) => n.getBoundingClientRect().width > 0);
          const caja = campo?.closest("form, [id='ccr-marketplace-navbar-slot']") as HTMLElement | null;
          return { fuera, buscador: caja ? Math.round(caja.getBoundingClientRect().width) : 0, desborda: document.documentElement.scrollWidth > W + 1 };
        });
        expect(m.fuera, `${ruta} a ${ancho}px: hay controles fuera de la ventana`).toEqual([]);
        expect(m.desborda, `${ruta} a ${ancho}px: la página desborda a lo ancho`).toBe(false);
        expect(m.buscador, `${ruta} a ${ancho}px: el buscador quedó inservible`).toBeGreaterThanOrEqual(250);
      }
    }
  });

  test("los tableros de computadora tienen un solo borde gris en cada unión, aun sin las clases de Tailwind", async ({ page }, testInfo) => {
    if (isMobileProject(testInfo)) test.skip(true, "Es el armado de computadora.");
    // Dos veces se vio el borde del centro en azul marino y una línea doble
    // arriba: la clase del color o la de «sin borde arriba» aún no estaba en la
    // hoja servida. Las uniones viven ahora en el documento; aquí se les quitan
    // todas las utilidades de borde y tienen que seguir iguales.
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const ruta of ["/es/empleos", "/es/promociones", "/es/proyectos"]) {
      await gotoOK(page, ruta);
      await page.waitForTimeout(900);
      const m = await page.evaluate(() => {
        const tarjeta = document.querySelector<HTMLElement>(".ccr-panel-tablero");
        const lista = document.querySelector<HTMLElement>(".ccr-lista-tablero");
        if (!tarjeta || !lista) return null;
        for (const n of [tarjeta, lista]) n.className = n.className.split(/\s+/).filter((c) => !/border|rounded|shadow/.test(c)).join(" ");
        const ct = getComputedStyle(tarjeta), cl = getComputedStyle(lista);
        return { centro: `${cl.borderRightWidth} ${cl.borderRightColor}`, lados: `${ct.borderLeftWidth} ${ct.borderLeftColor}`, arriba: ct.borderTopWidth };
      });
      expect(m, `${ruta}: no se encontró el tablero`).not.toBeNull();
      expect(m!.centro, `${ruta}: el borde del centro no es el gris de las uniones`).toBe("1px rgb(227, 235, 242)");
      expect(m!.lados, `${ruta}: los lados no llevan el gris de las uniones`).toBe("1px rgb(227, 235, 242)");
      expect(m!.arriba, `${ruta}: el tablero suma su propia línea a la de la barra de filtros`).toBe("0px");
    }
  });
});
