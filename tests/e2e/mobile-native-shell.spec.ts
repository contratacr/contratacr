import { expect, test, type Page } from "playwright/test";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { gotoOK, loginAs, resetAuth } from "./helpers";
import { canRunSeededRegression, E2E_USERS, ensureRegressionSeed, type RegressionSeedState } from "./seed";

type LocaleContract = {
  locale: "es" | "en";
  navLabel: string;
  navItems: string[];
  messages: string;
  assistant: string;
  assistantDialog: RegExp;
  assistantInput: RegExp;
  assistantSend: RegExp;
  assistantAnswer: string;
  messageAction: string;
};

const LOCALES: LocaleContract[] = [
  {
    locale: "es",
    navLabel: "Navegación de la app",
    // Barra flotante de solo íconos, la MISMA para toda cuenta: se reconoce
    // por el nombre accesible de cada botón. Promociones, Proyectos, Empleos y
    // Cotizaciones y el Asistente viven en el menú; Mensajes, en la barra.
    navItems: ["Buscar profesionales", "Mensajes", "Crear", "Notificaciones", "Mi panel"],
    messages: "Mensajes",
    assistant: "Asistente",
    assistantDialog: /Asistente ContrataCR/i,
    assistantInput: /Escribe una pregunta/i,
    assistantSend: /^Enviar mensaje$/i,
    assistantAnswer: "Encontré una opción para su solicitud.",
    messageAction: "Mensaje",
  },
  {
    locale: "en",
    navLabel: "App navigation",
    navItems: ["Search professionals", "Messages", "Create", "Notifications", "My dashboard"],
    messages: "Messages",
    assistant: "Assistant",
    assistantDialog: /ContrataCR Assistant/i,
    assistantInput: /Ask anything/i,
    assistantSend: /^Send message$/i,
    assistantAnswer: "I found an option for your request.",
    messageAction: "Message",
  },
];

function enableNativeRuntime(page: Page) {
  return page.addInitScript(() => {
    if (window.sessionStorage.getItem("ccr:e2e-show-first-run-onboarding") !== "1") {
      window.localStorage.setItem("ccr:native-first-run-onboarding:v12", "1");
    }
    const nativeRuntime: Record<string, unknown> = {
      isNativePlatform: () => true,
    };
    Object.defineProperty(window, "Capacitor", {
      configurable: true,
      get: () => nativeRuntime,
      set: (value) => {
        if (value && typeof value === "object") Object.assign(nativeRuntime, value);
        nativeRuntime.isNativePlatform = () => true;
      },
    });
  });
}

async function assertNativeChrome(page: Page, contract: LocaleContract) {
  const nav = page.locator("nav.ccr-native-bottom-nav");
  await expect(nav).toBeVisible();
  await expect(nav).toHaveAttribute("aria-label", contract.navLabel);
  await expect.poll(() => nav.locator(".ccr-barra-flotante-pastilla > a, .ccr-barra-flotante-pastilla > button")
    .evaluateAll((items) => items.map((item) => item.getAttribute("aria-label")))).toEqual(contract.navItems);

  // Mensajes y su contador viven en el menú de abajo desde el 1-oct-2026; la
  // cabecera ya no lo repite.
  await expect(page.locator(`header a[href$="/mensajes"]`).filter({ visible: true })).toHaveCount(0);
  const messagesLink = nav.locator(`a[href$="/mensajes"][aria-label="${contract.messages}"]`);
  await expect(messagesLink).toHaveCount(1);
  await expect(messagesLink.getByText("3", { exact: true })).toBeVisible();

  await expect(page.locator("footer.ccr-app-footer")).toBeHidden();
  await expect(page.locator("body")).toHaveClass(/ccr-native-bottom-nav-visible/);

  const geometry = await page.evaluate(() => {
    const navElement = document.querySelector<HTMLElement>("nav.ccr-native-bottom-nav");
    const mainElement = document.querySelector<HTMLElement>("main");
    if (!navElement || !mainElement) return null;
    const navRect = navElement.getBoundingClientRect();
    const mainRect = mainElement.getBoundingClientRect();
    return {
      mainBottom: mainRect.bottom,
      navTop: navRect.top,
      navBottom: navRect.bottom,
      viewportHeight: window.innerHeight,
    };
  });
  expect(geometry).not.toBeNull();
  // La barra flota: el contenido pasa por detrás de ella hasta el borde.
  expect(geometry!.mainBottom).toBeLessThanOrEqual(geometry!.viewportHeight + 1);
  expect(geometry!.navBottom).toBeLessThanOrEqual(geometry!.viewportHeight + 1);
}

async function assertKeyboardSafeComposer(page: Page, composerSelector: string, inputSelector: string) {
  const input = page.locator(inputSelector);
  await input.focus();
  const geometry = await page.evaluate(({ composerSelector, inputSelector }) => {
    const root = document.documentElement;
    root.style.setProperty("--app-visual-viewport-height", "500px");
    root.style.setProperty("--app-visual-viewport-width", "390px");
    root.style.setProperty("--app-visual-viewport-top", "0px");
    root.style.setProperty("--app-visual-viewport-left", "0px");
    root.style.setProperty("--app-keyboard-inset-bottom", "344px");
    root.setAttribute("data-keyboard-open", "");
    const composer = document.querySelector<HTMLElement>(composerSelector);
    const field = document.querySelector<HTMLElement>(inputSelector);
    if (!composer || !field) return null;
    const shell = composer.closest<HTMLElement>(".direct-chat-shell--thread, [data-ai-concierge-dialog]");
    const composerRect = composer.getBoundingClientRect();
    const fieldRect = field.getBoundingClientRect();
    const shellRect = shell?.getBoundingClientRect();
    return {
      composerHeight: composerRect.height,
      composerBottom: composerRect.bottom,
      fieldBottom: fieldRect.bottom,
      fieldHeight: fieldRect.height,
      shellBottom: shellRect?.bottom ?? null,
      shellHeight: shellRect?.height ?? null,
      shellPosition: shell ? getComputedStyle(shell).position : null,
      visualHeight: getComputedStyle(root).getPropertyValue("--app-visual-viewport-height").trim(),
      composerPaddingBottom: getComputedStyle(composer).paddingBottom,
      keyboardAttr: root.hasAttribute("data-keyboard-open"),
      rootFontSize: getComputedStyle(root).fontSize,
      rootClasses: root.className,
      bodyClasses: document.body.className,
      mobileMedia: matchMedia("(max-width: 1023px)").matches,

    };
  }, { composerSelector, inputSelector });

  expect(geometry).not.toBeNull();
  if (composerSelector === ".ccr-direct-chat-composer") {
    // The textarea grows with the draft (up to 144 px). Check the space
    // outside the field, so a valid multiline draft is not mistaken for
    // the old bug that added the full keyboard inset to the composer.
    expect(geometry!.fieldHeight, JSON.stringify(geometry)).toBeLessThanOrEqual(144);
    expect(geometry!.composerHeight - geometry!.fieldHeight, JSON.stringify(geometry)).toBeLessThan(64);
    expect(geometry!.composerHeight).toBeLessThan(208);
  } else {
    expect(geometry!.composerHeight).toBeLessThan(120);
  }
  expect(geometry!.composerBottom, JSON.stringify(geometry)).toBeLessThanOrEqual(501);
  expect(geometry!.fieldBottom).toBeLessThanOrEqual(501);
  if (composerSelector === ".ccr-direct-chat-composer") {
    expect(geometry!.composerBottom - geometry!.fieldBottom, JSON.stringify(geometry)).toBeGreaterThanOrEqual(16);
    expect(geometry!.composerBottom - geometry!.fieldBottom).toBeLessThan(40);
  }

  await page.evaluate(() => {
    const root = document.documentElement;
    root.style.removeProperty("--app-visual-viewport-height");
    root.style.removeProperty("--app-visual-viewport-width");
    root.style.removeProperty("--app-visual-viewport-top");
    root.style.removeProperty("--app-visual-viewport-left");
    root.style.removeProperty("--app-keyboard-inset-bottom");
    root.removeAttribute("data-keyboard-open");
  });
}

test.describe.configure({ mode: "serial" });
test.describe("@mobile native shell contracts", () => {
  test.skip(!canRunSeededRegression(), "Requires the isolated test Supabase fixtures in the mobile workflow.");
  let seed: RegressionSeedState;

  test.beforeAll(async () => {
    seed = await ensureRegressionSeed();
  });

  test.beforeEach(async ({ page }) => {
    await enableNativeRuntime(page);
    await resetAuth(page);
    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
  });

  test("signed-out public pages keep the marketplace header pinned at the top and a single way in", async ({ page }) => {
    await resetAuth(page);
    await gotoOK(page, "/promociones");

    // En teléfono y en la app, ofertas/empleos NO llevan el navbar de la web
    // (el marco lo pinta solo para el cajón y el escritorio, 39bc6c44): la
    // cabecera es la propia del tablero, pegada arriba, y el contenido empieza
    // en el borde superior sin reservar un encabezado aparte.
    const header = page.locator("section.ccr-marketplace-sticky").first();
    const main = page.locator("main");
    await expect(header).toBeVisible();
    await expect(main).toBeVisible();
    await expect(page.locator("header.ccr-app-header:visible")).toHaveCount(0);

    // La franja reservada la quita el armazón nativo DESPUÉS de hidratar, así
    // que esta medición hay que sondearla: leerla de una agarraba la cabecera
    // 64 px más abajo —el alto de la reserva— y la prueba alternaba verde y
    // rojo entre corridas sin que nadie tocara nada. La otra prueba de este
    // mismo archivo ya sondeaba por esa razón; a esta le faltaba.
    const leerGeometria = () => page.evaluate(() => {
      const headerElement = document.querySelector<HTMLElement>("section.ccr-marketplace-sticky");
      const mainElement = document.querySelector<HTMLElement>("main");
      if (!headerElement || !mainElement) return null;
      const headerRect = headerElement.getBoundingClientRect();
      const mainRect = mainElement.getBoundingClientRect();
      return { headerTop: headerRect.top, headerHeight: headerRect.height, mainTop: mainRect.top };
    });
    await expect.poll(async () => (await leerGeometria())?.headerTop ?? -1, { timeout: 8_000 }).toBeLessThanOrEqual(1);
    const geometry = await leerGeometria();
    expect(geometry).not.toBeNull();
    expect(geometry!.headerTop).toBeLessThanOrEqual(1);
    expect(geometry!.headerHeight).toBeGreaterThan(40);
    expect(geometry!.mainTop).toBeLessThanOrEqual(geometry!.headerTop + 1);

    await expect(page.getByRole("checkbox")).toHaveCount(0);

    // Sin sesión, entrar vive en el cajón (el tablero no pinta botones de
    // sesión ni los accesos con Apple/Google: esos están en /login).
    await page.getByRole("button", { name: /abrir men[uú]/i }).click();
    // Hay dos enlaces «Ingresar» en el DOM (navbar de escritorio oculto + cajón).
    await expect(page.getByRole("link", { name: /^ingresar$/i }).locator("visible=true").first()).toBeVisible();
    // Y UNA sola puerta, no dos. «Registrarse» se quitó del cajón a propósito:
    // como un renglón más junto a «Ingresar» el menú se leía el doble de largo,
    // y la pantalla de ingreso ya ofrece crear cuenta ahí mismo. Que no vuelva
    // es parte del contrato. (La prueba pedía ese enlace y llevaba fallando
    // desde que se retiró.)
    await expect(page.getByRole("link", { name: /^registrarse$|^crear cuenta$/i }).locator("visible=true")).toHaveCount(0);
  });

  test("first installation keeps incomplete login and registration journeys retryable", async ({ page }) => {
    await resetAuth(page);
    await page.evaluate(() => {
      window.sessionStorage.setItem("ccr:e2e-show-first-run-onboarding", "1");
      window.localStorage.removeItem("ccr:native-first-run-onboarding:v12");
      window.localStorage.removeItem("ccr:native-first-run-pending-path:v1");
    });
    await gotoOK(page, "/");

    const onboarding = page.getByTestId("native-first-run-onboarding");
    await expect(onboarding).toBeVisible();
    await expect(onboarding.getByRole("heading", { name: "¿Cómo quieres empezar?" })).toBeVisible();
    await expect(onboarding.locator('img[src="/logo-mark-transparent.png"]').filter({ visible: true })).toBeVisible();
    await onboarding.getByRole("button", { name: /Busco servicios/i }).click();
    await expect(onboarding).toBeHidden();
    await expect(page).toHaveURL(/\/registro\/cliente/);
    await expect(page.getByRole("heading", { name: "Crear cuenta de cliente", exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem("ccr:native-first-run-onboarding:v12"))).toBeNull();
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem("ccr:native-first-run-pending-path:v1"))).toBeNull();
    await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem("ccr:native-first-run-auth-session:v1"))).toBe("1");

    await page.goBack({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/?$/);
    await expect(onboarding).toBeVisible();
    await expect(onboarding.getByRole("heading", { name: "¿Cómo quieres empezar?" })).toBeVisible();

    await onboarding.getByRole("button", { name: /Ofrezco servicios/i }).click();
    await expect(page).toHaveURL(/\/registro\/profesional/);
    await expect(page.getByRole("heading", { name: "Crea tu cuenta profesional", exact: true })).toBeVisible();
    await page.goBack({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/?$/);
    await expect(onboarding).toBeVisible();

    await onboarding.getByRole("button", { name: /Inicia sesión/i }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Ingresa a tu cuenta", exact: true })).toBeVisible();
    await page.goBack({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/?$/);
    await expect(onboarding).toBeVisible();

    await onboarding.getByRole("button", { name: /Inicia sesión/i }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Ingresa a tu cuenta", exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem("ccr:native-first-run-onboarding:v12"))).toBeNull();

    // Términos y Privacidad desde el registro (6-oct-2026): abrían la
    // bienvenida otra vez en vez de la página, porque no eran rutas «del
    // camino». Solo el inicio la vuelve a levantar.
    await page.getByRole("link", { name: /Regístrate/i }).click();
    await page.getByRole("link", { name: /Busco servicios/i }).click();
    await expect(page).toHaveURL(/\/registro\/cliente/);
    await page.getByRole("link", { name: "Términos de uso" }).click();
    await expect(page).toHaveURL(/\/terminos/);
    await expect(page.getByRole("heading", { name: /Términos y Condiciones/i })).toBeVisible();
    await expect(onboarding).toBeHidden();
  });

  test("welcome menu allows guest exploration and stays dismissed after reload", async ({ page }) => {
    await resetAuth(page);
    await page.evaluate(() => {
      sessionStorage.setItem("ccr:e2e-show-first-run-onboarding", "1");
      localStorage.removeItem("ccr:native-first-run-onboarding:v12");
    });
    await gotoOK(page, "/");
    const welcome = page.getByTestId("native-first-run-onboarding");
    await expect(welcome).toBeVisible();
    await welcome.getByRole("button", { name: /abrir men[uú]|open menu/i }).click();
    await welcome.getByRole("button", { name: /cerrar men[uú]|close menu/i }).click();
    await expect(welcome).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("ccr:native-first-run-onboarding:v12"))).toBeNull();
    await welcome.getByRole("button", { name: /abrir men[uú]|open menu/i }).click();
    await welcome.getByRole("link", { name: "Promociones", exact: true }).click();
    await expect(page).toHaveURL(/\/promociones/);
    await expect(welcome).toBeHidden();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("ccr:native-first-run-onboarding:v12"))).toBe("1");
    await page.reload();
    await expect(welcome).toBeHidden();
    await gotoOK(page, "/");
    await expect(welcome).toBeHidden();
  });

  test("native marketplace tabs survive localized document navigations", async ({ page }) => {
    // Con el mensaje pelado, un error de hidratación en producción sale
    // minificado («Minified React error #418») y no dice ni en qué pantalla
    // pasó: imposible de perseguir desde el registro de CI. Se anota la
    // dirección y el momento junto al error.
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => {
      pageErrors.push(`[${page.url()}] ${error.message}`);
    });


    await gotoOK(page, "/");
    // Esta prueba es sobre las PESTAÑAS: que navegar entre tableros dentro de
    // la app no rompa nada. La portada trae un aviso de hidratación propio,
    // anterior a todo esto y que no se ve en pantalla; está anotado abajo como
    // pendiente con su propia prueba. Mezclarlo aquí dejaba en rojo el contrato
    // de las pestañas por algo que no tiene que ver con ellas.
    //
    // Se espera a que la portada TERMINE de hidratar antes de limpiar: `gotoOK`
    // vuelve con el documento cargado, no hidratado, así que limpiar de una
    // dejaba entrar igual los errores de la portada —llegaban un instante
    // después— y el contrato seguía en rojo por lo mismo.
    await expect(page.locator("nav.ccr-native-bottom-nav").filter({ visible: true })).toBeVisible();
    await page.waitForTimeout(2_000);
    pageErrors.length = 0;

    for (const destination of [
      // La sección se llama «Promociones» en todo el app; la RUTA sigue siendo
      // /promociones porque hay enlaces publicados con ella. La prueba usaba el
      // nombre viejo para las dos cosas.
      { label: "Promociones", path: "/promociones", heading: "Promociones" },
      { label: "Empleos", path: "/empleos", heading: "Empleos" },
    ]) {
      const nativeNav = page.locator("nav.ccr-native-bottom-nav").filter({ visible: true });
      await expect(nativeNav).toBeVisible();
      // Las secciones se abren desde el menú lateral; la barra solo se queda.
      await page.getByRole("button", { name: /abrir men[uú]|open menu/i }).click();
      await Promise.all([
        page.waitForURL(new RegExp(`${destination.path.replaceAll("/", "\\/")}(?:[?#].*)?$`), { waitUntil: "domcontentloaded" }),
        page.getByRole("link", { name: destination.label, exact: true }).locator("visible=true").first().click(),
      ]);
      await expect(page.getByRole("heading", { name: destination.heading, exact: true })).toBeVisible();
      // Same as the web: the board owns its title row and no app header is
      // mounted, so the native shell must not reserve a blank band above it.
      await expect(page.locator("header.ccr-app-header").filter({ visible: true })).toHaveCount(0);
      // The reserve is dropped by the native bridge after hydration, so poll.
      await expect.poll(() => page.getByRole("heading", { name: destination.heading, exact: true })
        .evaluate((node) => node.closest("section")?.getBoundingClientRect().top ?? -1), { timeout: 8_000 })
        .toBeLessThanOrEqual(1);
      await page.waitForTimeout(1_000);
      await expect(page.getByRole("heading", { name: "Algo salió mal", exact: true })).toHaveCount(0);
    }

    expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  });

  // La portada tiraba un error #418 de hidratación SOLO en producción. Causa:
  // el carrusel de servicios es un componente de cliente, y un componente de
  // cliente se pre-renderiza en OTRA capa de módulos, donde el registro de
  // servicios va vacío —el cargador del servidor solo llena el suyo—. El
  // servidor pintaba el nombre fijo del código («Nutrición y dietética») y el
  // navegador, que sí lee el catálogo del documento antes de hidratar, el de la
  // base («Nutrición»). Por eso no se reproducía en local: sin base a mano el
  // catálogo sale vacío y los dos lados coinciden por casualidad. Lo instala
  // ahora `components/util/catalogo-del-servidor.tsx` en las dos capas.
  test("la portada no debe romper la hidratación", async ({ page }) => {
    const errores: string[] = [];
    page.on("pageerror", (error) => errores.push(error.message));
    await gotoOK(page, "/");
    await page.waitForTimeout(3_000);
    expect(errores.filter((e) => /#418|#423|#425|hydrat/i.test(e)), errores.join("\n")).toEqual([]);
  });

  test("native search owns the full viewport without a hidden footer reserve", async ({ page }) => {
    await gotoOK(page, "/profesionales?regression=1");

    // «Buscar» es una pestaña de la barra de abajo (b8f95d62): la barra vive
    // también en los resultados y se retira al desplazar; lo que no puede
    // haber es un pie de web reservando espacio bajo el mapa.
    await expect(page.locator("nav.ccr-native-bottom-nav")).toHaveCount(1);
    await expect(page.locator("body")).toHaveClass(/ccr-native-bottom-nav-visible/);
    await expect(page.locator("footer").filter({ visible: true })).toHaveCount(0);

    const sheet = page.locator(".ccr-search-bottom-sheet");
    const handle = sheet.getByRole("button", { name: "Cambiar tamaño del panel de resultados" });
    await expect(sheet).toBeVisible();
    // El asa recorre las alturas de una en una (recogido → medio → alto):
    // se avanza hasta la alta.
    for (let intento = 0; intento < 3 && ((await sheet.boundingBox())?.y ?? 999) > 183; intento += 1) {
      await handle.press("Enter");
      await page.waitForTimeout(400);
    }
    await expect.poll(async () => {
      const box = await sheet.boundingBox();
      return box?.y ?? 999;
    }).toBeLessThanOrEqual(183);

    const sheetGeometry = await sheet.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const headerHeight = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--ccr-native-header-height"),
      );
      return { top: rect.top, bottom: rect.bottom, headerHeight, viewportHeight: window.innerHeight };
    });
    expect(sheetGeometry.top).toBeGreaterThanOrEqual(sheetGeometry.headerHeight + 57);
    expect(sheetGeometry.bottom).toBeLessThanOrEqual(sheetGeometry.viewportHeight + 1);

    await page.getByRole("button", { name: "¿Qué servicio estás buscando?" }).click();
    const serviceInput = page.getByRole("combobox", { name: "Servicio" });
    await expect(serviceInput).toBeVisible();
    const overlayGeometry = await serviceInput.evaluate((element) => {
      const overlay = element.closest<HTMLElement>(".fixed.z-\\[220\\]");
      if (!overlay) return null;
      const rect = overlay.getBoundingClientRect();
      // La barra flota encima de la hoja de servicios: la hoja llega hasta el
      // fondo y le deja su alto por dentro.
      const nav = document.querySelector<HTMLElement>("nav.ccr-native-bottom-nav");
      const navTop = nav ? nav.getBoundingClientRect().top : window.innerHeight;
      return { top: rect.top, bottom: rect.bottom, viewportHeight: window.innerHeight, navTop };
    });
    expect(overlayGeometry).not.toBeNull();
    expect(overlayGeometry!.top).toBe(0);
    expect(overlayGeometry!.bottom).toBeLessThanOrEqual(overlayGeometry!.viewportHeight + 1);
    expect(overlayGeometry!.bottom).toBeGreaterThanOrEqual(overlayGeometry!.viewportHeight - 1);
  });

  test("notification rows in the app delete by swipe instead of an item menu", async ({ page, browserName }) => {
    await gotoOK(page, "/notificaciones");
    await expect(page.getByRole("heading", { name: "Notificaciones", exact: true })).toBeVisible();

    // En la app la fila no lleva el menú «Opciones» de la web (a8c05f7a): se
    // desliza y aparece el botón rojo de borrar pegado al borde derecho de la
    // propia fila. En reposo el botón no existe (3db6c74e): montado, sus
    // bordes asomaban como líneas finas a la derecha de cada fila.
    await expect(page.getByRole("button", { name: "Opciones", exact: true })).toHaveCount(0);
    const deleteButtons = page.getByRole("button", { name: /^(Eliminar|Borrar|Delete)$/i });
    const fila = page.locator("main li [role=button]").first();
    await expect(fila).toBeVisible();
    await expect(deleteButtons).toHaveCount(0);

    // Deslizar con el dedo (el gesto ignora el mouse) menos de la mitad del
    // ancho de la fila: se queda abierta mostrando el botón.
    const caja = (await fila.boundingBox())!;
    const y = caja.y + caja.height / 2;
    if (browserName === "chromium") {
      const cdp = await page.context().newCDPSession(page);
      const toque = (type: "touchStart" | "touchMove" | "touchEnd", x: number) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
      await toque("touchStart", caja.x + caja.width - 30);
      for (let paso = 1; paso <= 8; paso += 1) await toque("touchMove", caja.x + caja.width - 30 - paso * 10);
      await toque("touchEnd", 0);
      await cdp.detach();
    } else {
      // WebKit has no CDP touch injector. Exercise the same pointer handlers;
      // physical iOS gesture delivery remains a device-level manual check.
      const point = { pointerId: 1, pointerType: "touch", isPrimary: true, clientY: y, bubbles: true };
      const x = caja.x + caja.width - 30;
      await fila.dispatchEvent("pointerdown", { ...point, clientX: x, buttons: 1 });
      for (let paso = 1; paso <= 8; paso += 1) await fila.dispatchEvent("pointermove", { ...point, clientX: x - paso * 10, buttons: 1 });
      await fila.dispatchEvent("pointerup", { ...point, clientX: x - 80, buttons: 0 });
    }
    await expect(deleteButtons.first()).toBeVisible();
    const geometry = await deleteButtons.first().evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const row = element.closest("li")!.getBoundingClientRect();
      return { width: rect.width, right: rect.right, rowRight: row.right, viewportWidth: window.innerWidth };
    });
    expect(geometry.width).toBe(88);
    expect(geometry.right).toBeLessThanOrEqual(geometry.rowRight + 1);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
  });

  for (const contract of LOCALES) {
    test(`${contract.locale.toUpperCase()} keeps native navigation, messages and assistant chat isolated from web`, async ({ page }) => {
      const conversationId = "00000000-0000-4000-8000-00000000cafe";
      let directChatRequests = 0;
      let sentPayload: Record<string, unknown> | null = null;
      await page.route("**/api/direct-chat", async (route) => {
        if (route.request().method() === "GET") {
          const requestUrl = new URL(route.request().url());
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(requestUrl.searchParams.has("id")
              ? { messages: [] }
              : {
                  conversations: [{
                    id: conversationId,
                    client_id: seed.clientId,
                    professional_profile_id: seed.professionalId,
                    client_unread_count: 3,
                    professional_unread_count: 0,
                  }],
                }),
          });
          return;
        }
        if (route.request().method() !== "POST") return route.continue();
        directChatRequests += 1;
        sentPayload = route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ conversationId }),
        });
      });

      await gotoOK(page, `/${contract.locale}/dashboard/profesional`);
      await assertNativeChrome(page, contract);

      await page.route("**/api/ai-assistant", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            answer: contract.assistantAnswer,
            aiProvider: "local",
            professionals: [
              {
                id: seed.professionalId,
                name: E2E_USERS.professional.fullName,
                avatarUrl: null,
                service: contract.locale === "en" ? "Web development" : "Desarrollo web",
                location: "Costa Rica",
                verified: true,
                rating: 5,
                reviewCount: 1,
                price: null,
                profileHref: `/${contract.locale}/profesionales/${seed.professionalSlug}`,
                requestHref: `/${contract.locale}/profesionales/${seed.professionalSlug}`,
                actionHref: `/${contract.locale}/profesionales/${seed.professionalSlug}`,
                actionLabel: "WhatsApp",
                actionKind: "message",
              },
            ],
          }),
        });
      });

      // El Asistente vive en el menú (1-oct-2026): se abre desde ahí y el menú se cierra.
      await page.getByRole("button", { name: /Abrir men[uú]|Open menu/i }).filter({ visible: true }).first().click();
      await page.getByRole("dialog", { name: /Men[uú]|Menu/i }).getByRole("button", { name: contract.assistant, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: contract.assistantDialog });
      await expect(dialog).toBeVisible();
      // La barra de abajo se queda bajo el asistente: tocar una pestaña lo
      // aparta primero (native-bottom-nav), no desaparece.
      await expect(page.locator("nav.ccr-native-bottom-nav")).toBeVisible();
      await dialog.getByRole("textbox", { name: contract.assistantInput }).fill("E2E native assistant contact");
      await assertKeyboardSafeComposer(
        page,
        "[data-ai-concierge-panel] .ccr-ai-composer",
        "[data-ai-concierge-panel] .ccr-ai-composer input",
      );
      await dialog.getByRole("button", { name: contract.assistantSend }).click();

      const messageButton = dialog.getByRole("button", { name: contract.messageAction, exact: true });
      await expect(messageButton).toBeVisible();
      await expect(dialog.getByText(/WhatsApp/i)).toHaveCount(0);
      await messageButton.click();

      // Opening a contact prepares a draft; only Send creates the conversation.
      await expect(page).toHaveURL(new RegExp(`${contract.locale === "es" ? "" : "/en"}/mensajes\\?draftChat=1(?:&.*)?$`));
      const entry = new URL(page.url());
      expect(entry.searchParams.get("professionalId")).toBe(seed.professionalId);
      expect(entry.searchParams.get("back")).toBe("/dashboard/profesional");
      expect(directChatRequests).toBe(0);
      await expect(page.locator("html")).toHaveClass(/contratacr-chat-thread-open/);
      // Dentro de un chat no hay barra de abajo, como en WhatsApp.
      await expect(page.locator("nav.ccr-native-bottom-nav")).toBeHidden();
      await expect(page.locator(".ccr-direct-chat-composer")).toBeVisible();
      const draft = page.locator(".ccr-direct-chat-composer textarea");
      const prefilled = await draft.inputValue();
      expect(prefilled.trim()).not.toBe("");
      // Exercise a growing multiline draft, not only an empty single-line box.
      await draft.fill(`${prefilled}\n${Array(6).fill("E2E multiline message").join("\n")}`);
      await assertKeyboardSafeComposer(
        page,
        ".ccr-direct-chat-composer",
        ".ccr-direct-chat-composer textarea",
      );
      const message = await draft.inputValue();
      expect(message).toContain(prefilled);
      await page.locator(".ccr-direct-chat-composer").getByRole("button", { name: /^(Enviar|Send)$/ }).click();
      await expect.poll(() => directChatRequests).toBe(1);
      expect(sentPayload).toMatchObject({ professionalId: seed.professionalId, message });
      await expect.poll(() => new URL(page.url()).searchParams.get("conversation")).toBe(conversationId);
      await expect(page).toHaveURL(new RegExp(`${contract.locale === "es" ? "" : "/en"}/mensajes\\?conversation=${conversationId}(?:&.*)?$`));
      // Keep the native check after draft-to-conversation transition as well.
      await assertKeyboardSafeComposer(page, ".ccr-direct-chat-composer", ".ccr-direct-chat-composer textarea");

    });
  }
});

// These navigation contracts start after an explicit AI permission; the
// default-denied and first-use flows are covered in legal-privacy.spec.ts.
test.beforeEach(async ({page}) => {
  await page.addInitScript(() => localStorage.setItem("contratacr:consent:ai:v1", JSON.stringify({version:"2026-10-19",choice:"accepted",at:new Date().toISOString()})));
});

// Real navigation component, isolated from authentication, network and fixtures.
// The three scroll containers match the actual home, marketplace and search shells.
let scrollNavigationCSS: Promise<string> | undefined;
async function mountScrollNavigation(page: Page) {
  scrollNavigationCSS ??= (async () => {
    const postcss = (await import("postcss")).default;
    const tailwind = (await import("@tailwindcss/postcss")).default;
    return (await postcss([tailwind()]).process(readFileSync("src/app/globals.css", "utf8"), { from: "src/app/globals.css" })).css;
  })();
  const mocks: Record<string, string> = {
    "next-intl": `export const useLocale=()=>"es";export const useTranslations=()=>key=>key;`,
    "next/navigation": `const params=new URLSearchParams();export const useSearchParams=()=>params;`,
    "@/i18n/navigation": `import React from 'react';const router={prefetch(){},push(){}};export const useRouter=()=>router;export const usePathname=()=>window.__testNavPath;export const Link=({href,prefetch,...rest})=>React.createElement('a',{href,...rest});`,
    "@/hooks/use-native-app": `export const useNativeApp=()=>true;`,
    "@/hooks/use-auth": `export const useAuth=()=>({user:null,avatarUrl:null});`,
    "@/hooks/use-mode": `export const useMode=()=>({mode:'use'});`,
    "@/hooks/use-avisos-por-ver": `export const useAvisosPorVer=()=>0;`,
    "@/hooks/use-direct-message-unread": `export const useDirectMessageUnread=()=>0;`,
    "@/components/mobile/hoja-de-crear": `export const HojaDeCrear=()=>null;`,
    "@/lib/data/categories": `export const esServicioDelCatalogo=()=>true;`,
    "@/lib/buscar-url": `export const esRutaDeBusqueda=path=>path?.startsWith('/buscar')??false;`,
  };
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{NativeBottomNav}from'./src/components/mobile/native-bottom-nav';function App(){const [path,setPath]=useState('/');window.__testNavPath=path;window.__setTestNavPath=setPath;const box={height:200,overflowY:'auto'};return <><div data-current-path={path}/><main id="home-scroll" style={box}><div style={{height:2000}}/></main><div className="ccr-tablero-marco"><section id="board-scroll" style={box}><div style={{height:2000}}/></section></div><div id="search-scroll" className="ccr-search-bottom-sheet" style={box}><div style={{height:2000}}/></div><NativeBottomNav/></>}createRoot(document.getElementById('root')).render(<App/>);` },
    bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", tsconfig: "tsconfig.json", define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "nav-boundaries", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: "nav-mock" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "nav-mock" }, args => ({ contents: mocks[args.path], loader: "jsx", resolveDir: process.cwd() }));
    } }],
  });
  await page.route("**/nav-scroll-harness", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><meta name="viewport" content="width=device-width"><div id="root"></div>' }));
  await page.goto("/nav-scroll-harness");
  await page.addStyleTag({ content: await scrollNavigationCSS });
  await page.evaluate(() => {
    document.documentElement.classList.add("ccr-native-app");
    document.body.classList.add("ccr-native-app");
    const clock = window as unknown as { __navTestNow: number };
    clock.__navTestNow = 0;
    Object.defineProperty(performance, "now", { configurable: true, value: () => clock.__navTestNow });
  });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await expect(page.locator("nav.ccr-native-bottom-nav")).toHaveCount(1);
  await expect(page.locator("body")).toHaveClass(/ccr-native-bottom-nav-visible/);
}

async function scrollValues(page: Page, selector: string, values: number[], interval = 16) {
  await page.locator(selector).evaluate(async (element, { positions, interval }) => {
    for (const position of positions) {
      (window as unknown as { __navTestNow: number }).__navTestNow += interval;
      element.scrollTop = position;
      element.dispatchEvent(new Event("scroll"));
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
  }, { positions: values, interval });
}

const navigationOffset = (page: Page) => page.locator("nav.ccr-native-bottom-nav").evaluate(nav => new DOMMatrixReadOnly(getComputedStyle(nav).transform).m42);

test("native bottom navigation follows each downward pixel and requires a fast upward gesture", async ({ page }) => {
  await mountScrollNavigation(page);
  const body = page.locator("body");
  for (const [path, selector] of [["/", "#home-scroll"], ["/proyectos", "#board-scroll"], ["/buscar", "#search-scroll"]] as const) {
    await page.evaluate(pathname => (window as unknown as { __setTestNavPath: (path: string) => void }).__setTestNavPath(pathname), path);
    await expect(page.locator("[data-current-path]")).toHaveAttribute("data-current-path", path);
    await expect(body).not.toHaveClass(/ccr-native-bottom-nav-hidden/);
    await scrollValues(page, selector, [1], 120);
    expect(await navigationOffset(page)).toBeCloseTo(1, 1);
    await scrollValues(page, selector, [2, 3, 4, 5], 120);
    expect(await navigationOffset(page)).toBeCloseTo(5, 1);
    await scrollValues(page, selector, [25], 120);
    expect(await navigationOffset(page)).toBeCloseTo(25, 1);
    await expect(body).not.toHaveClass(/ccr-native-bottom-nav-hidden/);
    await scrollValues(page, selector, [200]);
    await expect(body).toHaveClass(/ccr-native-bottom-nav-hidden/);
    const hidden = await navigationOffset(page);
    await scrollValues(page, selector, [196, 192, 188, 184, 180, 176], 120);
    expect(await navigationOffset(page)).toBeCloseTo(hidden, 1);
    await expect(body).toHaveClass(/ccr-native-bottom-nav-hidden/);
    await scrollValues(page, selector, [172, 168, 164], 8);
    await expect(body).not.toHaveClass(/ccr-native-bottom-nav-hidden/);
    await expect.poll(() => navigationOffset(page)).toBeCloseTo(0, 1);
    await scrollValues(page, selector, [165], 120);
    expect(await navigationOffset(page)).toBeCloseTo(1, 1);
    await scrollValues(page, selector, [300]);
    await expect(body).toHaveClass(/ccr-native-bottom-nav-hidden/);
    // Reaching the top remains an accessible way to recover the menu slowly.
    await scrollValues(page, selector, [200, 100, 0], 1000);
    await expect(body).not.toHaveClass(/ccr-native-bottom-nav-hidden/);
    await expect.poll(() => navigationOffset(page)).toBeCloseTo(0, 1);
  }
  await page.evaluate(() => (window as unknown as { __setTestNavPath: (path: string) => void }).__setTestNavPath("/mensajes"));
  await expect(page.locator("[data-current-path]")).toHaveAttribute("data-current-path", "/mensajes");
  await scrollValues(page, "#home-scroll", [60, 100, 150]);
  expect(await navigationOffset(page)).toBe(0);
});

test("native bottom navigation ignores the simulated iOS bottom bounce", async ({ page }) => {
  await mountScrollNavigation(page);
  const body = page.locator("body");
  await page.locator("#board-scroll").evaluate(element => {
    let position = 120;
    Object.defineProperty(element, "scrollTop", { configurable: true, get: () => position, set: value => { position = value; } });
    Object.defineProperty(element, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(element, "clientHeight", { configurable: true, value: 200 });
  });
  await page.evaluate(() => (window as unknown as { __setTestNavPath: (path: string) => void }).__setTestNavPath("/proyectos"));
  await expect(page.locator("[data-current-path]")).toHaveAttribute("data-current-path", "/proyectos");
  await scrollValues(page, "#board-scroll", [120, 300]);
  await expect(body).toHaveClass(/ccr-native-bottom-nav-hidden/);
  await scrollValues(page, "#board-scroll", [800, 818, 810, 800, 798], 8);
  await expect(body).toHaveClass(/ccr-native-bottom-nav-hidden/);
  await scrollValues(page, "#board-scroll", [794, 790, 786, 782], 120);
  await expect(body).toHaveClass(/ccr-native-bottom-nav-hidden/);
  await scrollValues(page, "#board-scroll", [778, 774, 770], 8);
  await expect(body).not.toHaveClass(/ccr-native-bottom-nav-hidden/);
});

test("native bottom navigation slides in from below and can reverse without jumping", async ({ page }) => {
  await mountScrollNavigation(page);
  await scrollValues(page, "#home-scroll", [200]);
  await scrollValues(page, "#home-scroll", [196, 192, 188], 8);
  const movement = await page.locator("#home-scroll").evaluate(element => {
    const nav = document.querySelector("nav.ccr-native-bottom-nav")!;
    const animation = nav.getAnimations()[0];
    if (!animation) throw new Error("The upward gesture must start a visible entrance animation");
    animation.pause();
    animation.currentTime = 0;
    const start = new DOMMatrixReadOnly(getComputedStyle(nav).transform).m42;
    animation.currentTime = 100;
    const before = new DOMMatrixReadOnly(getComputedStyle(nav).transform).m42;
    (window as unknown as { __navTestNow: number }).__navTestNow += 8;
    element.scrollTop -= 4;
    element.dispatchEvent(new Event("scroll"));
    const sameAnimation = nav.getAnimations()[0] === animation && animation.currentTime === 100;
    animation.currentTime = 200;
    const end = new DOMMatrixReadOnly(getComputedStyle(nav).transform).m42;
    animation.currentTime = 100;
    (window as unknown as { __navTestNow: number }).__navTestNow += 8;
    element.scrollTop += 1;
    element.dispatchEvent(new Event("scroll"));
    return { start, before, end, sameAnimation, duration: animation.effect?.getTiming().duration, after: new DOMMatrixReadOnly(getComputedStyle(nav).transform).m42 };
  });
  expect(movement.start).toBeGreaterThan(movement.before);
  expect(movement.before).toBeGreaterThan(0);
  expect(movement.before / movement.start).toBeGreaterThan(0.15);
  expect(movement.duration).toBe(200);
  expect(movement.end).toBeCloseTo(0, 1);
  expect(movement.sameAnimation).toBe(true);
  expect(movement.after - movement.before).toBeCloseTo(1, 1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => (window as unknown as { __setTestNavPath: (path: string) => void }).__setTestNavPath("/buscar"));
  await expect(page.locator("[data-current-path]")).toHaveAttribute("data-current-path", "/buscar");
  await scrollValues(page, "#search-scroll", [200]);
  await scrollValues(page, "#search-scroll", [196, 192, 188], 8);
  expect(await navigationOffset(page)).toBe(0);
  await expect(page.locator("nav.ccr-native-bottom-nav")).toHaveCSS("transition-duration", "0s");
});
