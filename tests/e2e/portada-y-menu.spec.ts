import { expect, test, type Page } from "playwright/test";
import { gotoOK, isMobileProject, loginAs, waitForInteractivePage } from "./helpers";

// LO NUEVO DEL 1-OCT-2026: cabecera sin íconos sin sesión, menú a pantalla
// completa, marcas que abren su perfil, Mensajes en la barra de abajo de la app
// y la flecha del perfil que no existe. Todo sin sesión y sin crear datos.

function comoApp(page: Page) {
  return page.addInitScript(() => {
    window.localStorage.setItem("ccr:native-first-run-onboarding:v12", "1");
    const rt: Record<string, unknown> = { isNativePlatform: () => true };
    Object.defineProperty(window, "Capacitor", { configurable: true, get: () => rt, set: (v) => { if (v && typeof v === "object") Object.assign(rt, v); rt.isNativePlatform = () => true; } });
  });
}

test.describe("portada y menú (1-oct-2026) @smoke", () => {
  test("sin sesión, la cabecera del teléfono solo lleva el logo y el menú", async ({ page }) => {
    test.skip(!isMobileProject(test.info()), "Cabecera del teléfono.");
    await gotoOK(page, "/");
    await expect(page.locator("header a[aria-label='Mensajes']:visible")).toHaveCount(0);
    await expect(page.locator("header a[aria-label='Ingresar']:visible")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Abrir men[uú]/i }).filter({ visible: true }).first()).toBeVisible();
  });

  test("el menú se abre a pantalla completa y se cierra con la X", async ({ page }) => {
    test.skip(!isMobileProject(test.info()), "Menú del teléfono.");
    await gotoOK(page, "/");
    await waitForInteractivePage(page);
    const menu = page.locator(".ccr-menu-completo.ccr-menu-abierto");
    // Un toque antes de hidratar se pierde: se reintenta hasta que abra.
    await expect(async () => {
      await page.getByRole("button", { name: /Abrir men[uú]/i }).filter({ visible: true }).first().click();
      await expect(menu).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    await expect.poll(() => menu.evaluate((e) => Math.round(e.getBoundingClientRect().x))).toBe(0);
    await expect(menu.getByRole("link", { name: /^Ingresar$/ })).toBeVisible();
    await expect(menu.getByRole("link", { name: /^Registrarme$/ })).toHaveAttribute("href", /\/registro/);
    // Lo legal vive dentro de «Ayuda y soporte», no suelto al pie del cajón.
    await expect(menu.getByRole("link", { name: /^Términos de uso$/ })).toHaveCount(0);
    await menu.getByRole("button", { name: /Ayuda y soporte/ }).click();
    await expect(menu.getByRole("link", { name: /Preguntas frecuentes/ })).toBeVisible();
    await expect(menu.getByRole("link", { name: /^Términos de uso$/ })).toHaveAttribute("href", /\/terminos$/);
    await expect(menu.getByRole("link", { name: /^Política de privacidad$/ })).toHaveAttribute("href", /\/privacidad$/);
    await menu.getByRole("button", { name: /Cerrar men[uú]/ }).click();
    await expect(page.locator(".ccr-menu-completo.ccr-menu-abierto")).toHaveCount(0);
  });

  test("cada marca de la cinta enlaza al perfil de su negocio", async ({ page }) => {
    await gotoOK(page, "/");
    const enlaces = await page.locator(".featured-brands-ribbon a[data-brand-slug]").evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")))]);
    expect(enlaces.length).toBeGreaterThanOrEqual(9);
    for (const href of enlaces) expect(href).toMatch(/^\/(en\/)?profesionales\/[a-z0-9-]+\?from=%2F$/);
  });

  test("perfil que no existe: la flecha vuelve y no hay «···»", async ({ page }) => {
    test.skip(!isMobileProject(test.info()), "Cabecera del teléfono.");
    await comoApp(page);
    await gotoOK(page, "/");
    await page.goto("/profesionales/no-existe-e2e-zz");
    await expect(page.getByRole("heading", { name: /Perfil no encontrado/ })).toBeVisible();
    await expect(page.locator("[data-ccr-section-menu]")).toHaveCount(0);
    await page.locator("[data-ccr-section-back]").click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("en la app, volver con la flecha no parpadea (cabecera, carga y barra de abajo)", async ({ page }) => {
    test.skip(!isMobileProject(test.info()), "Cabecera de la app.");
    await comoApp(page);
    await gotoOK(page, "/ayuda");
    await waitForInteractivePage(page);
    await page.locator("main a[href$='/soporte']").first().click();
    await expect(page).toHaveURL(/\/soporte$/);
    await expect(page.locator("[data-ccr-section-back]")).toBeVisible();
    // Un registro por cuadro: título de la barra, lienzo de carga y si la clase
    // de la barra de abajo coincide con la barra que de verdad está.
    await page.evaluate(() => {
      const w = window as unknown as { __cuadros: string[] };
      w.__cuadros = [];
      const tomar = () => {
        const titulo = document.querySelector("[data-ccr-section-title]")?.textContent ?? "(logo)";
        const carga = [...document.querySelectorAll<HTMLElement>(".ccr-page-route-loading")].some((e) => e.offsetParent !== null || getComputedStyle(e).position === "fixed");
        const barra = !!document.querySelector("nav.ccr-native-bottom-nav");
        const clase = document.body.classList.contains("ccr-native-bottom-nav-visible");
        const fila = `${location.pathname}|${titulo}|carga=${carga}|barra=${barra === clase}`;
        if (w.__cuadros.at(-1) !== fila) w.__cuadros.push(fila);
        requestAnimationFrame(tomar);
      };
      requestAnimationFrame(tomar);
    });
    await page.locator("[data-ccr-section-back]").click();
    await expect(page).toHaveURL(/\/ayuda$/);
    await page.waitForTimeout(800);
    const cuadros = await page.evaluate(() => (window as unknown as { __cuadros: string[] }).__cuadros);
    const titulos = cuadros.map((c) => c.split("|")[1]).filter((t, i, a) => i === 0 || a[i - 1] !== t);
    expect(titulos.length, cuadros.join("\n")).toBeLessThanOrEqual(2);
    expect(cuadros.filter((c) => c.includes("carga=true")), cuadros.join("\n")).toEqual([]);
    expect(cuadros.filter((c) => c.includes("barra=false")), cuadros.join("\n")).toEqual([]);
  });

  test("en la app, Mensajes está en la barra de abajo y sin sesión pide entrar", async ({ page }) => {
    test.skip(!isMobileProject(test.info()), "Barra de la app.");
    await comoApp(page);
    await gotoOK(page, "/");
    const nav = page.locator("nav.ccr-native-bottom-nav");
    await expect(nav).toBeVisible();
    const mensajes = nav.getByRole("link", { name: "Mensajes" });
    await expect(mensajes).toHaveAttribute("href", /\/login\?redirect=%2Fmensajes/);
    await expect(nav.getByRole("button", { name: "Asistente" })).toHaveCount(0);
  });

  test("los videos de la guía están silenciados y corren solos", async ({ page }) => {
    await gotoOK(page, "/");
    // Los videos se piden al acercarse a la guía (7-oct-2026): se baja hasta el
    // teléfono, y se repite si la página creció por arriba mientras cargaba.
    const activo = page.locator("video.ccr-guia-video.opacity-100").first();
    await expect(async () => {
      await page.locator("img[data-guia-poster]").first().scrollIntoViewIfNeeded();
      await expect(activo).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    // Lo que Safari exige para reproducir solo: silenciado y en línea. (El Chromium
    // de Playwright no trae el códec H.264, así que no se mide la reproducción.)
    expect(await activo.evaluate((v: HTMLVideoElement) => v.muted && v.hasAttribute("muted") && v.hasAttribute("playsinline"))).toBe(true);
  });

  test("el video activo de la guía nunca queda invisible y la imagen fija va encima", async ({ page }) => {
    // WebKit suspende el autoplay de un video que no «se ve»: con opacidad 0
    // hasta que corría, el video no arrancaba hasta centrar el teléfono.
    await gotoOK(page, "/");
    // Los videos se piden al acercarse a la guía (7-oct-2026): se baja hasta el
    // teléfono, y se repite si la página creció por arriba mientras cargaba.
    const activo = page.locator("video.ccr-guia-video.opacity-100").first();
    await expect(async () => {
      await page.locator("img[data-guia-poster]").first().scrollIntoViewIfNeeded();
      await expect(activo).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    expect(await activo.evaluate((v) => Number(getComputedStyle(v).opacity))).toBe(1);
    // Una imagen fija por paso (precargadas); se mira la del paso activo.
    const poster = page.locator("img[data-guia-poster]").first();
    const orden = await poster.evaluate((img) => {
      const v = img.parentElement!.querySelector("video.ccr-guia-video.opacity-100")!;
      return {
        despues: Boolean(v.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_FOLLOWING),
        zImg: Number(getComputedStyle(img).zIndex) || 0,
        zVideo: Number(getComputedStyle(v).zIndex) || 0,
      };
    });
    expect(orden.despues && orden.zImg >= orden.zVideo).toBe(true);
  });

  test("las secciones de abajo de la portada se ven al bajar", async ({ page }) => {
    await gotoOK(page, "/");
    const zona = page.locator("h2", { hasText: /Encuentra profesionales cerca de ti|Find professionals near you/ });
    await zona.scrollIntoViewIfNeeded();
    await expect.poll(() => zona.evaluate((e) => Number(getComputedStyle(e.closest("section") ?? e).opacity))).toBe(1);
  });

  test("la foto del inicio empieza bajo la cabecera y no cambia de tamaño al abrir", async ({ page }) => {
    test.skip(!isMobileProject(test.info()), "Inicio del teléfono.");
    await comoApp(page);
    await page.addInitScript(() => {
      (window as unknown as { __alto: number[] }).__alto = [];
      const t0 = performance.now();
      const f = () => {
        const s = document.querySelector(".ccr-hero-foto");
        if (s) (window as unknown as { __alto: number[] }).__alto.push(Math.round(s.getBoundingClientRect().height));
        if (performance.now() - t0 < 3000) requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
    await gotoOK(page, "/");
    await page.waitForTimeout(3200);
    const altos = await page.evaluate(() => [...new Set((window as unknown as { __alto: number[] }).__alto)]);
    expect(altos, "el alto de la foto cambió al abrir").toHaveLength(1);
    const corte = await page.evaluate(() => {
      const foto = document.querySelector(".ccr-hero-foto")!.getBoundingClientRect().top;
      return [...document.querySelectorAll(".ccr-hero-foto-capa")].map((i) => Math.round(i.getBoundingClientRect().top - foto));
    });
    for (const c of corte) expect(c, "una foto empieza por encima de su franja (queda bajo la cabecera)").toBeGreaterThanOrEqual(0);
  });

  test("el menú se abre y se cierra deslizando, siempre opaco", async ({ page }) => {
    test.skip(!isMobileProject(test.info()), "Menú del teléfono.");
    await gotoOK(page, "/");
    await waitForInteractivePage(page);
    // Desliza el CUERPO del menú; la fila del logo y la X queda quieta sobre la cabecera.
    const menu = page.locator(".ccr-menu-completo .ccr-menu-cuerpo");
    await page.getByRole("button", { name: /Abrir men[uú]/i }).filter({ visible: true }).first().click();
    await page.waitForTimeout(40);
    const enCamino = await menu.evaluate((e) => ({ x: e.getBoundingClientRect().x, o: getComputedStyle(e).opacity }));
    expect(enCamino.x, "el menú debe entrar deslizando, no aparecer de golpe").toBeGreaterThan(20);
    expect(enCamino.o, "el menú no se funde").toBe("1");
    await expect(page.locator(".ccr-menu-completo")).toHaveClass(/ccr-menu-abierto/);
    await expect.poll(() => menu.evaluate((e) => Math.round(e.getBoundingClientRect().x))).toBe(0);
    await page.getByRole("button", { name: /Cerrar men[uú]/ }).click();
    await page.waitForTimeout(120);
    const saliendo = await menu.evaluate((e) => ({ x: e.getBoundingClientRect().x, o: getComputedStyle(e).opacity }));
    expect(saliendo.o, "al cerrar no debe volverse transparente").toBe("1");
    expect(saliendo.x, "al cerrar debe deslizar hacia la derecha").toBeGreaterThan(5);
  });


  test("con el teclado abierto, la hoja de búsqueda llega justo hasta el teclado", async ({ page }) => {
    test.skip(!isMobileProject(test.info()), "Hoja de búsqueda de la app.");
    await comoApp(page);
    await gotoOK(page, "/");
    await waitForInteractivePage(page);
    await page.getByRole("button", { name: /Abrir men[uú]/i }).filter({ visible: true }).first().click();
    await page.getByRole("button", { name: /^Buscar profesionales$/ }).click();
    const panel = page.locator(".ccr-native-search-panel");
    await expect(panel).toBeVisible();
    const medida = await page.evaluate(() => {
      const r = document.documentElement;
      r.style.setProperty("--app-visual-viewport-height", "476px");
      r.style.setProperty("--app-visual-viewport-top", "0px");
      r.setAttribute("data-keyboard-open", "");
      const pan = document.querySelector(".ccr-native-search-panel")!;
      const lista = pan.querySelector<HTMLElement>(".overflow-y-auto")!;
      lista.scrollTop = 99999;
      const ultima = [...lista.querySelectorAll("button")].filter((e) => e.offsetParent).at(-1)!.getBoundingClientRect();
      return { alto: Math.round(pan.getBoundingClientRect().height), ultima: Math.round(ultima.bottom) };
    });
    expect(medida.alto, "la hoja debe medir lo visible sobre el teclado").toBe(476);
    expect(medida.ultima, "la última opción queda tapada por el teclado").toBeLessThanOrEqual(476);
  });

  test("los logos de la cinta están cargados desde el principio (ninguno en blanco)", async ({ page }) => {
    await gotoOK(page, "/");
    await page.waitForLoadState("load");
    const sinCargar = await page.locator(".featured-brands-ribbon img").evaluateAll((imgs) =>
      (imgs as HTMLImageElement[]).filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute("src")));
    expect(sinCargar, "logos sin cargar al terminar la página").toEqual([]);
  });

  test("al tocar un enlace del menú no se ve el inicio entre medio: el menú se queda hasta que llega la sección", async ({ page }) => {
    test.skip(!isMobileProject(test.info()), "Menú del teléfono.");
    await gotoOK(page, "/");
    await waitForInteractivePage(page);
    await page.getByRole("button", { name: /Abrir men[uú]/i }).filter({ visible: true }).first().click();
    const menu = page.locator(".ccr-menu-completo");
    await expect.poll(() => menu.evaluate((e) => Math.round(e.getBoundingClientRect().x))).toBe(0);
    await page.evaluate(() => {
      const w = window as unknown as { __vioInicio: boolean };
      w.__vioInicio = false;
      const f = () => {
        const m = document.querySelector(".ccr-menu-completo");
        const tapa = m && getComputedStyle(m).visibility !== "hidden" && Math.round(m.getBoundingClientRect().x) === 0;
        if (location.pathname === "/" && !tapa) w.__vioInicio = true;
        if (location.pathname === "/") requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
    await menu.getByRole("link", { name: /^Servicios$/ }).click();
    await expect(page).toHaveURL(/\/servicios/);
    expect(await page.evaluate(() => (window as unknown as { __vioInicio: boolean }).__vioInicio), "se vio el inicio antes de la sección").toBe(false);
    await expect.poll(() => menu.evaluateAll((es) => es.every((e) => getComputedStyle(e).visibility === "hidden"))).toBe(true);
  });


  test("en la app, tocar Notificaciones nada más llegar a Proyectos la abre (2-oct-2026)", async ({ page }) => {
    // El tablero reescribía la dirección al montarse (replaceState 300 ms después)
    // y Next cancelaba con eso la navegación que acababa de pedir la campana:
    // el toque «no hacía nada». Ahora solo reescribe si la dirección cambia.
    test.skip(!isMobileProject(test.info()), "Barra de la app.");
    test.skip(!process.env.E2E_TEST_PASSWORD, "Necesita la cuenta e2e.");
    await comoApp(page);
    await loginAs(page, "e2e.pro@contratacr.test", process.env.E2E_TEST_PASSWORD ?? "");
    // Como al abrir la app en Proyectos (iOS recarga la pantalla al volver del
    // fondo): se toca la campana en cuanto existe, en el acto.
    await page.goto("/proyectos", { waitUntil: "commit" });
    const campana = page.locator("nav.ccr-native-bottom-nav").getByRole("link", { name: "Notificaciones" });
    await campana.waitFor({ state: "attached" });
    await campana.tap({ force: true });
    await expect(page).toHaveURL(/\/notificaciones/, { timeout: 5_000 });
  });

});
