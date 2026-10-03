import { expect, test } from "playwright/test";
import { expectHealthyPage, expectPageShell, gotoOK, isMobileProject, waitForInteractivePage } from "./helpers";

const routes = [
  "/",
  "/categorias",
  "/servicios",
  "/profesionales",
  "/empleos",
  "/promociones",
  "/proyectos",
  "/login",
  "/registro",
  "/registro/cliente",
  "/registro/profesional",
  "/olvide-contrasena",
  "/reset-password",
  "/soporte",
  "/ayuda",
  "/contacto",
  "/como-funciona",
  "/mejorar-mi-perfil",
  "/publicar-proyecto",
  "/verificacion-de-identidad",
  "/eliminar-cuenta",
  "/mantenimiento",
  "/servicio-no-disponible",
  "/privacidad",
  "/terminos",
  "/en",
  "/en/categorias",
  "/en/servicios",
  "/en/profesionales",
  "/en/empleos",
  "/en/promociones",
  "/en/proyectos",
  "/en/login",
  "/en/registro",
  "/en/registro/cliente",
  "/en/registro/profesional",
  "/en/olvide-contrasena",
  "/en/reset-password",
  "/en/soporte",
  "/en/ayuda",
  "/en/contacto",
  "/en/como-funciona",
  "/en/mejorar-mi-perfil",
  "/en/publicar-proyecto",
  "/en/verificacion-de-identidad",
  "/en/eliminar-cuenta",
  "/en/mantenimiento",
  "/en/servicio-no-disponible",
  "/en/privacidad",
  "/en/terminos",
];

test.describe("@smoke public routes", () => {
  for (const route of routes) {
    test(`${route} renders a healthy page`, async ({ page }) => {
      await gotoOK(page, route);
      await expectPageShell(page);
      await expectHealthyPage(page);
    });
  }

  test("navbar exposes the core public actions", async ({ page }, testInfo) => {
    await gotoOK(page, "/");
    await waitForInteractivePage(page);
    await expect(page.getByRole("link", { name: /ContrataCR/i }).first()).toBeVisible();

    if (isMobileProject(testInfo)) {
      await page.getByRole("button", { name: /Abrir menu|Abrir men/i }).first().click();
      const navigation = page.getByRole("dialog", { name: /Men[uú]|Menu/i });
      await expect(page.getByRole("link", { name: /^Servicios$/i }).first()).toBeVisible();
      // «Ayuda y soporte» se despliega: adentro, Preguntas frecuentes y soporte.
      await navigation.getByRole("button", { name: /Ayuda y soporte|Help and support/i }).click();
      await expect(navigation.getByRole("link", { name: /Preguntas frecuentes|FAQ/i }).first()).toBeVisible();
      await expect(navigation.getByRole("link", { name: /^Registrarme$|^Sign up$/i }).first()).toHaveAttribute("href", /\/registro/);
      // Entrar a la cuenta es UNA acción, no dos renglones más de la lista: el
      // cajón lleva un solo botón «Ingresar o crear cuenta» y la elección de
      // rol se hace ya dentro, en /registro.
      const entrar = navigation.getByRole("link", { name: /^Ingresar$|^Log in$/i }).first();
      await expect(entrar).toBeVisible();
      // El idioma se nombra completo, no con las siglas: es lo que la gente lee.
      await expect(navigation.getByRole("button", { name: /^English$|^Español$/ })).toBeVisible();
    } else {
      const navigation = page.getByRole("banner");
      await expect(navigation.getByRole("button", { name: /^Servicios$/i }).first()).toBeVisible();
      await expect(navigation.getByRole("button", { name: /^Explorar$/i }).first()).toBeVisible();
      await expect(navigation.getByRole("link", { name: /Ingresar/i }).first()).toBeVisible();
      // Desde el 1-oct-2026: «Ingresar» y «Registrarme» (el registro ofrece las dos cuentas).
      const registro = navigation.getByRole("link", { name: /^Registrarme$|^Sign up$/i }).first();
      await expect(registro).toBeVisible();
      await expect(registro).toHaveAttribute("href", /\/registro$/);
    }
    await expectHealthyPage(page);
  });

  test("home navbar search stays hidden until the hero search has been passed", async ({ page }) => {
    await page.addInitScript(() => {
      const compactSearchFlashes: Array<{ value: string | null; scrollY: number }> = [];
      Object.defineProperty(window, "__compactSearchFlashes", {
        configurable: true,
        value: compactSearchFlashes,
      });

      const observeNavbar = () => {
        const navbar = document.querySelector('[data-testid="landing-navbar"]');
        if (!navbar) {
          requestAnimationFrame(observeNavbar);
          return;
        }

        const recordUnexpectedVisibleState = () => {
          const value = navbar.getAttribute("data-compact-search");
          if (value === "visible" && window.scrollY <= 1) compactSearchFlashes.push({ value, scrollY: window.scrollY });
        };
        recordUnexpectedVisibleState();
        new MutationObserver(recordUnexpectedVisibleState).observe(navbar, {
          attributes: true,
          attributeFilter: ["data-compact-search"],
        });
      };
      requestAnimationFrame(observeNavbar);
    });

    for (const locale of ["es", "en"] as const) {
      await gotoOK(page, `/${locale}`);
      await waitForInteractivePage(page);
      const navbar = page.getByTestId("landing-navbar");
      const sentinel = page.locator("#hero-search-sentinel");

      await expect(navbar).toHaveAttribute("data-compact-search", "hidden");
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      await expect.poll(() => sentinel.evaluate((node) => node.getBoundingClientRect().top)).toBeGreaterThan(64);
      await expect.poll(() => page.evaluate(() => (window as Window & { __compactSearchFlashes?: unknown[] }).__compactSearchFlashes?.length ?? 0)).toBe(0);

      await page.reload();
      await waitForInteractivePage(page);
      await expect(navbar).toHaveAttribute("data-compact-search", "hidden");
      await expect.poll(() => sentinel.evaluate((node) => node.getBoundingClientRect().top)).toBeGreaterThan(64);
      await expect.poll(() => page.evaluate(() => (window as Window & { __compactSearchFlashes?: unknown[] }).__compactSearchFlashes?.length ?? 0)).toBe(0);

      await sentinel.evaluate((node) => {
        const top = node.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: Math.max(0, top + 80), behavior: "instant" });
      });
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
      await expect.poll(() => sentinel.evaluate((node) => node.getBoundingClientRect().top)).toBeLessThanOrEqual(0);
      await expect(navbar).toHaveAttribute("data-compact-search", "visible");

      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      await expect(navbar).toHaveAttribute("data-compact-search", "hidden");
    }
  });

  test("home near-me search uses proximity params", async ({ page }) => {
    await page.context().setGeolocation({ latitude: 9.9281, longitude: -84.0907 });
    await gotoOK(page, "/");
    await waitForInteractivePage(page);
    await page.context().grantPermissions(["geolocation"], { origin: new URL(page.url()).origin });

    const location = page
      .getByPlaceholder(/Ubicaci[oó]n|Location/i)
      .filter({ visible: true })
      .first();
    // En el teléfono (3-oct-2026) tocar la ubicación de la portada abre el
    // buscador a pantalla completa, con «Buscar cerca de mí» arriba: ese botón
    // busca en el acto.
    if ((page.viewportSize()?.width ?? 1280) < 640) {
      await location.click();
      const cercaEnHoja = page.locator(".ccr-native-search-panel").getByRole("button", { name: /Buscar cerca de m[ií]|Search near me/i }).filter({ visible: true }).first();
      await expect(cercaEnHoja).toBeVisible();
      await cercaEnHoja.click();
      // Sin servicio elegido, «cerca de mí» deja puesta la ubicación y pasa el
      // cursor al servicio; buscar así trae a los de cerca.
      const hoja = page.locator(".ccr-native-search-panel").filter({ visible: true }).first();
      await expect(hoja.getByPlaceholder(/Barrio|Neighborhood/i)).toHaveValue(/Ubicaci[oó]n actual|Current location/i);
      await hoja.locator("form").evaluate((f: HTMLFormElement) => f.requestSubmit());
      await expect(page).toHaveURL(/\/profesionales/);
      await expect(page).toHaveURL(/lat=9\.92810/);
      await expect(page).toHaveURL(/lng=-84\.09070/);
      return;
    }
    await location.fill("San");

    const nearMe = page
      .getByRole("button", { name: /Buscar cerca de m[ií]|Search near me/i })
      .filter({ visible: true })
      .first();
    await expect(nearMe).toBeVisible();

    await nearMe.click();
    await expect(location).toHaveValue(/Cerca de m[ií]|Near me/i);
    const homeSearchForm = page.locator("form").filter({ has: location });
    await expect(homeSearchForm).toHaveCount(1);
    // En PC hay lupa; en el teléfono no (se busca con «Ir»): se envía el formulario.
    const lupa = homeSearchForm.getByRole("button", { name: /^Buscar$|^Search$/i }).filter({ visible: true });
    if (await lupa.count()) await lupa.first().click();
    else await homeSearchForm.evaluate((f: HTMLFormElement) => f.requestSubmit());
    await expect(page).toHaveURL(/\/profesionales/);
    await expect(page).toHaveURL(/lat=9\.92810/);
    await expect(page).toHaveURL(/lng=-84\.09070/);
  });

  test("services navigation keeps the matching section context", async ({ page }, testInfo) => {
    await gotoOK(page, "/");
    await waitForInteractivePage(page);

    if (isMobileProject(testInfo)) {
      await page.getByRole("button", { name: /Abrir menu|Abrir men/i }).first().click();
      await expect(page.getByRole("link", { name: /^Servicios$/i }).first()).toBeVisible();
      await expect(page.locator("body")).not.toContainText(/servicesPage\./i);
      await expectHealthyPage(page);
      return;
    }

    await page.getByRole("button", { name: /^Servicios$/i }).first().click();
    const megaMenu = page.getByTestId("services-mega-menu");
    await expect(megaMenu).toBeVisible();
    const menuSearch = megaMenu.getByTestId("services-mega-menu-search");
    await expect(menuSearch).toBeVisible();
    await menuSearch.fill("Plomer");

    await expect(megaMenu.getByRole("heading", { name: /^Hogar$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Plomer/i }).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/servicesPage\./i);
    await expectHealthyPage(page);
  });

  test("services search uses the canonical design and art label", async ({ page }, testInfo) => {
    await gotoOK(page, "/servicios");
    await waitForInteractivePage(page);
    const pageSearch = page
      .getByTestId(isMobileProject(testInfo) ? "services-page-mobile-search" : "services-page-search")
      .locator("input");
    await expect(pageSearch).toBeVisible();
    await pageSearch.fill("diseño");

    await expect(page.locator("main").getByText("Diseño y arte", { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/Diseño\s*\/\s*Arte|Diseno/i);
    await expectHealthyPage(page);

    if (!isMobileProject(testInfo)) {
      await gotoOK(page, "/");
      await waitForInteractivePage(page);
      await page.getByRole("button", { name: /^Servicios$/i }).first().click();
      const megaMenu = page.getByTestId("services-mega-menu");
      await expect(megaMenu).toBeVisible();
      const menuSearch = megaMenu.getByTestId("services-mega-menu-search");
      await expect(menuSearch).toBeVisible();
      await menuSearch.fill("diseño");

      await expect(page.getByRole("button", { name: /Diseño y arte/i }).first()).toBeVisible();
      await expect(page.locator("body")).not.toContainText(/Diseño\s*\/\s*Arte|Diseno/i);
      await expectHealthyPage(page);
    }
  });

  test("footer keeps localized resources and safe external destinations", async ({ page }) => {
    // Desde el 28-sep-2026 el español va SIN prefijo: /servicios, /en/servicios.
    for (const locale of ["es", "en"] as const) {
      const prefijo = locale === "es" ? "" : "/en";
      await gotoOK(page, prefijo || "/");
      await expectPageShell(page);
      const footer = page.locator("footer.ccr-app-footer").filter({ visible: true });
      await expect(footer, "The page should expose exactly one visible application footer").toHaveCount(1);
      await expect(footer).toBeVisible();

      const internalRoutes = ["servicios", "como-funciona", "ayuda", "soporte", "privacidad", "terminos"];
      for (const route of internalRoutes) {
        await expect(footer.locator(`a[href="${prefijo}/${route}"]`).first(), `Missing ${prefijo}/${route} in footer`).toBeVisible();
      }

      const external = footer.locator('a[target="_blank"]');
      const count = await external.count();
      for (let index = 0; index < count; index += 1) {
        await expect(external.nth(index)).toHaveAttribute("rel", /noopener|noreferrer/);
      }
      await expectHealthyPage(page);
    }
  });

  // LO QUE NO EXISTE TIENE QUE DECIR QUE NO EXISTE.
  //
  // Con un `<Suspense>` encima de todas las páginas la respuesta salía con su
  // estado —200— antes de que la página pudiera decir que ese contenido no
  // está, así que una dirección inventada respondía «todo bien» mientras
  // dibujaba un 404. Google lo llama falso 404 y le hace desconfiar del sitio
  // entero. Se perdió en silencio durante meses porque en pantalla se veía
  // bien: solo se nota mirando el ESTADO de la respuesta, que es justo lo que
  // mide esta prueba.
  // 1-oct-2026: en producción TODOS los servicios de «Explora servicios»
  // abrían «Perfil no encontrado» (la base dejó de entregar el catálogo sin
  // sesión y el middleware los tomó por perfiles). El smoke diario de
  // producción corre esta prueba: si vuelve a pasar, avisa esa misma mañana.
  test("cada servicio de la portada abre su búsqueda, nunca «Perfil no encontrado»", async ({ page }) => {
    await gotoOK(page, "/");
    const enlaces = await page.locator('a[href^="/profesionales/"]').evaluateAll((ns) =>
      Array.from(new Set(ns.map((n) => (n as HTMLAnchorElement).getAttribute("href") ?? "")))
        .filter((h) => /^\/profesionales\/[a-z0-9-]+$/.test(h) && !/-[a-z0-9]{8}$/.test(h)));
    expect(enlaces.length, "la portada trae enlaces de servicios").toBeGreaterThan(0);
    const rotos: string[] = [];
    // Lo que SE VE (el HTML trae todos los textos de traducción, también
    // «Perfil no encontrado», aunque no se muestre).
    for (const ruta of enlaces.slice(0, 30)) {
      await page.goto(ruta, { waitUntil: "domcontentloaded" });
      const titulo = (await page.locator("h1").first().textContent({ timeout: 15_000 }).catch(() => "")) ?? "";
      if (/Perfil no encontrado|Profile not found/i.test(titulo)) rotos.push(ruta);
    }
    expect(rotos, "servicios que abren «Perfil no encontrado»").toEqual([]);
  });

  test("una dirección que no existe responde 404, no 200", async ({ page }) => {
    // Sin la cookie de idioma que deja la prueba anterior al pasar por /en:
    // con ella, cualquier ruta sin /en responde 307 hacia /en/… antes del 404.
    await page.context().clearCookies();
    const inexistente = "00000000-0000-0000-0000-000000000000";
    const casos: Array<[string, number]> = [
      ["/servicios/oficio-que-no-existe", 404],
      ["/servicios/electricidad/provincia-que-no-existe", 404],
      [`/promociones/${inexistente}`, 404],
      [`/empleos/${inexistente}`, 404],
      [`/proyectos/${inexistente}`, 404],
      // Y lo que sí existe sigue respondiendo que sí.
      ["/servicios/electricidad", 200],
      ["/servicios/electricidad/san-jose", 200],
    ];
    for (const [ruta, esperado] of casos) {
      // Se siguen las redirecciones y se mira la respuesta FINAL: una ruta
      // suelta en la raíz (/lo-que-sea) salta a /profesionales/lo-que-sea —son
      // los enlaces viejos de perfil— y es ahí donde tiene que decir 404. Lo que
      // se vigila es que ninguna termine en un 200 que dibuja «no encontrado».
      const respuesta = await page.request.get(ruta, { headers: { "accept-language": "es-CR,es;q=0.9" } });
      expect(respuesta.status(), `${ruta} debería responder ${esperado} (terminó en ${respuesta.url()})`).toBe(esperado);
    }

    // La excepción, a propósito: una dirección suelta en la raíz es un enlace
    // de perfil (/nombre-apellido → /profesionales/…) y la ficha que no existe
    // responde 200 con noindex, no 404. La consulta no distingue «no existe»
    // de «la base no contestó» y la página se guarda cinco minutos: un 404
    // cacheado dejaría a un profesional real fuera de Google (19-sep-2026).
    const raiz = await page.request.get("/pagina-que-no-existe-jamas", { headers: { "accept-language": "es-CR,es;q=0.9" } });
    expect(raiz.status(), "una ruta suelta en la raíz termina en la ficha").toBe(200);
    expect(raiz.url()).toContain("/profesionales/pagina-que-no-existe-jamas");
    expect(await raiz.text(), "la ficha inexistente debe pedir no indexarse").toMatch(/name="robots" content="noindex/);
  });

  // EL BUSCADOR NUNCA SE QUEDA EN BLANCO.
  //
  // Con el cursor en «Servicio», sin nada escrito y sin búsquedas recientes
  // —o sea, todo el mundo la primera vez— el panel del teléfono no pintaba
  // absolutamente nada: la primera pantalla del sitio era una hoja vacía que
  // no decía qué se puede buscar.
  test("el panel de servicio ofrece oficios aunque no haya búsquedas recientes", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes("mobile"), "El panel a pantalla completa es del teléfono.");
    await gotoOK(page, "/profesionales?regression=1");
    await page.getByRole("button", { name: "¿Qué servicio estás buscando?" }).click();
    await expect(page.getByRole("combobox", { name: "Servicio" })).toBeVisible();
    const panel = page.locator("#native-location-suggestions");
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/Los más buscados/i)).toBeVisible();
    // Y son oficios de verdad en los que se puede pulsar, no un rótulo suelto.
    await expect(panel.getByRole("button").filter({ visible: true }).nth(2)).toBeVisible();
  });
});
