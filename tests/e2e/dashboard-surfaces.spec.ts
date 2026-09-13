import { expect, test } from "playwright/test";
import { expectHealthyPage, expectNoHorizontalOverflow, expectPageShell, expectVisibleText, gotoOK, isMobileProject, loginAs } from "./helpers";
import { canRunSeededRegression, E2E_USERS, ensureRegressionSeed, type RegressionSeedState } from "./seed";

const professionalTabs = [
  // En escritorio «home» cae en la sección de arranque del panel profesional
  // (Citas); en teléfono muestra el menú de secciones con el cambio de panel.
  { tab: "home", marker: /Citas|Appointments|Ir a mi panel cliente|Go to my client panel/i },
  { tab: "profile", marker: /Perfil|Profile/i },
  { tab: "services", marker: /Servicios|Services/i },
  { tab: "photos", marker: /Casos de exito|Casos de .xito|Success cases|Success stories/i },
  { tab: "availability", marker: /Disponibilidad|Availability/i },
  { tab: "bookings", marker: /Citas|Appointments/i },
  { tab: "proposals", marker: /Proyectos|Projects/i },
  { tab: "jobs", marker: /Empleos|Jobs/i },
  { tab: "offers", marker: /Ofertas|Offers/i },
  // Seguir se retiró en 553536d1 («guardar es el único gesto para lo quiero a
  // mano»): ya no hay pestaña de seguidores. En su lugar se cubren las dos
  // secciones que sí existen y no estaban en la lista.
  { tab: "quotes", marker: /Cotizaciones|Quotes/i },
  { tab: "guides", marker: /Gu[ií]as|Guides/i },
  { tab: "verificacion", marker: /Verificacion|Verificaci.n|Verification/i },
  { tab: "notifications", marker: /Notificaciones|Notifications/i },
  { tab: "soporte", marker: /Soporte|Support/i },
  { tab: "cuenta", marker: /Cuenta y seguridad|Account (?:and|&) security/i },
] as const;

const clientTabs = [
  { tab: "home&mode=use", marker: /Mis citas|My appointments/i },
  { tab: "profile&mode=use", marker: /Perfil|Profile/i },
  { tab: "sent_bookings", marker: /Citas|Appointments/i },
  { tab: "sent_projects", marker: /Mis proyectos|My projects/i },
  { tab: "applications", marker: /Mis postulaciones|My applications/i },
  { tab: "connections", marker: /Volver a contratar|Hire again/i },
  { tab: "saved", marker: /Favoritos|Favorites/i },
  { tab: "notifications&mode=use", marker: /Notificaciones|Notifications/i },
  { tab: "soporte&mode=use", marker: /Soporte|Support/i },
  { tab: "cuenta&mode=use", marker: /Cuenta y seguridad|Account (?:and|&) security/i },
] as const;

async function exerciseVisibleFilters(page: import("playwright/test").Page) {
  const filters = page.locator("[data-status-filter-tabs]:visible");
  const visibleFilterEmptyState = page
    .getByText(
      /^(?:No tienes (?:citas|proyectos) activ[oa]s|Todav[ií]a no (?:hay|tienes) (?:citas|proyectos|tiquetes) finalizad[oa]s|No hay proyectos nuevos por ahora|No tienes tiquetes pendientes|No hay tiquetes en proceso|No tienes (?:profesionales favoritos|ofertas favoritas|empleos favoritos)\.)$/i,
      { exact: true },
    )
    .filter({ visible: true });
  // Dashboard sections render their filter groups only after their client-side
  // profile/list requests resolve. `gotoOK` intentionally waits for the document,
  // not every section request, so wait for that stable UI marker before measuring
  // it. Keep the timeout bounded so a filter that truly never renders still fails.
  await expect(filters.first(), `Expected at least one filter group on ${page.url()}`).toBeVisible();
  const filterCount = await filters.count();

  const layouts: string[] = [];
  for (let index = 0; index < filterCount; index += 1) {
    layouts.push((await filters.nth(index).getAttribute("data-filter-layout")) ?? "");
  }
  for (const layout of layouts) {
    const filter = page.locator(`[data-status-filter-tabs][data-filter-layout="${layout}"]:visible`).first();
    if (!(await filter.isVisible().catch(() => false))) continue;
    const geometry = await filter.evaluate((container) => ({
      clientWidth: container.clientWidth,
      scrollWidth: container.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      buttons: Array.from(container.querySelectorAll("button:not([data-rail-hint])")).map((button) => {
        const box = button.getBoundingClientRect();
        return { clientWidth: button.clientWidth, scrollWidth: button.scrollWidth, left: box.left, right: box.right };
      }),
    }));
    // A rail (5+ filters) scrolls sideways by design: its later chips start past
    // the viewport and the click loop below brings each one into view. Segmented
    // groups must fit the screen outright.
    // "chips" is a rail too: small outlined pills on an overflow-x-auto row.
    // "segmented-scroll" (4-5 steps) is both: it shares the row from 640px up and
    // scrolls below that, bringing the selected step into view. Forcing four steps
    // to share a 390px row squeezed the cells until the labels clipped ("Enviad…"),
    // so the whole label wins over fitting them all at once — which is exactly what
    // the per-button check below enforces at every width.
    const rail = layout === "scroll" || layout === "scroll-pills" || layout === "chips" || layout === "tabs"
      || (layout === "segmented-scroll" && geometry.viewportWidth < 640);
    if (!rail) {
      expect(geometry.scrollWidth, `Filter group should not be clipped (${page.url()})`).toBeLessThanOrEqual(geometry.clientWidth + 2);
    }
    for (const button of geometry.buttons) {
      expect(button.scrollWidth, `Filter label should not be clipped (${page.url()})`).toBeLessThanOrEqual(button.clientWidth + 2);
      if (rail) continue;
      expect(button.left, `Filter should start on screen (${page.url()})`).toBeGreaterThanOrEqual(-1);
      expect(button.right, `Filter should end on screen (${page.url()})`).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    }

    // The rail's "more" chevron is not a filter; it only scrolls the rail.
    const buttons = filter.locator("button:not([data-rail-hint])");
    await expect
      .poll(() => buttons.count(), {
        message: `Expected at least two populated filter buttons on ${page.url()}`,
      })
      .toBeGreaterThan(1);
    const buttonCount = await buttons.count();
    for (let buttonIndex = 0; buttonIndex < buttonCount; buttonIndex += 1) {
      if (!(await filter.isVisible().catch(() => false))) break;
      if (buttonIndex >= (await buttons.count())) break;
      const button = buttons.nth(buttonIndex);
      if (!(await button.isVisible().catch(() => false))) continue;
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
      // Every deterministic regression filter is intentionally populated. This
      // catches a valid-looking tab whose query/mapping silently returns zero.
      if (layout !== "pills" && layout !== "chips") {
        // El conteo llega cuando termina de cargar la sección (favoritos, por
        // ejemplo, sincroniza con el servidor antes de pintar): se espera a que
        // aparezca en vez de leerlo una sola vez y acusar a la sección de estar
        // vacía por ir un instante por delante.
        await expect
          .poll(async () => Number((await button.innerText()).match(/\b(\d+)\b/)?.[1] ?? 0), {
            message: `Filter "${await button.innerText()}" must have data on ${page.url()}`,
            timeout: 15_000,
          })
          .toBeGreaterThan(0);
      }
      await expect(page.locator(".ccr-empty-state:visible")).toHaveCount(0);
      await expect(
        visibleFilterEmptyState,
        `Filter "${await button.innerText()}" rendered an empty result despite its populated fixture (${page.url()})`,
      ).toHaveCount(0);
    }
  }
}

test.describe.configure({ mode: "serial" });

test.describe("@seeded dashboard surfaces", () => {
  test.skip(!canRunSeededRegression(), "Set E2E_FIXTURES_READY=1 with the test Supabase secrets to run dashboard regression.");
  let seed: RegressionSeedState;

  test.beforeAll(async () => {
    seed = await ensureRegressionSeed();
  });

  test("professional panel sections render without broken states", async ({ page }) => {
    test.slow();
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);

    for (const section of professionalTabs) {
      await gotoOK(page, `/es/dashboard/profesional?tab=${section.tab}`);
      await expectVisibleText(page.locator("body"), section.marker);
      await expectHealthyPage(page);
    }
  });

  test("responsive identity keeps a single-line name with its badge and aligns profile access with network counts", async ({ page }) => {
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    await gotoOK(page, "/es/dashboard/profesional");
    if ((page.viewportSize()?.width ?? 1280) >= 640) return;

    const name = page.getByTestId("dashboard-identity-name");
    const actions = page.getByTestId("dashboard-identity-actions");
    const profileLink = page.getByTestId("dashboard-mobile-view-profile");
    await name.evaluate((element) => {
      element.textContent = "Constructora de Costa Rica instalación de proyectos especializados";
    });
    await expect(profileLink).toBeVisible();
    const geometry = await Promise.all([
      name.boundingBox(),
      actions.boundingBox(),
      profileLink.boundingBox(),
    ]);
    expect(geometry.every(Boolean)).toBe(true);
    // The phone header shows the business name (or a short person name) on a
    // single truncated line with the verification badge right after it, so an
    // overlong name must never push the header to a second line.
    expect(geometry[0]!.height).toBeGreaterThan(14);
    expect(geometry[0]!.height).toBeLessThanOrEqual(24);
    await expect(name.locator("xpath=following-sibling::*[1]").locator("svg").first()).toBeVisible();
    // "Ver perfil" sits vertically centred on the counts row.
    const linkCentre = geometry[2]!.y + geometry[2]!.height / 2;
    const actionsCentre = geometry[1]!.y + geometry[1]!.height / 2;
    expect(Math.abs(linkCentre - actionsCentre)).toBeLessThanOrEqual(8);
    await expectNoHorizontalOverflow(page);
  });

  test("follow network modal closes when tapping outside", async ({ page }, testInfo) => {
    if (!isMobileProject(testInfo)) return;
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    await gotoOK(page, "/es/dashboard/profesional");

    for (const label of [/seguidos|following/i, /seguidores|followers/i]) {
      await page.getByRole("button", { name: label }).filter({ visible: true }).first().click();
      const dialog = page.getByRole("dialog", { name: label });
      await expect(dialog).toBeVisible();
      await page.mouse.click(10, 120);
      await expect(dialog).toHaveCount(0);
    }
  });

  test("dashboard sections never expose a blank body while their first request is pending", async ({ page }) => {
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);

    let releaseProjects!: () => void;
    let releaseProposals!: () => void;
    const projectsGate = new Promise<void>((resolve) => { releaseProjects = resolve; });
    const proposalsGate = new Promise<void>((resolve) => { releaseProposals = resolve; });
    let projectsStarted!: () => void;
    let proposalsStarted!: () => void;
    const projectsRequest = new Promise<void>((resolve) => { projectsStarted = resolve; });
    const proposalsRequest = new Promise<void>((resolve) => { proposalsStarted = resolve; });

    await page.route("**/api/projects?**", async (route) => {
      projectsStarted();
      await projectsGate;
      await route.continue();
    });
    await page.route("**/api/proposals?mine=true", async (route) => {
      proposalsStarted();
      await proposalsGate;
      await route.continue();
    });

    try {
      await gotoOK(page, "/es/dashboard/profesional?tab=proposals");
      await Promise.all([projectsRequest, proposalsRequest]);

      const sectionCard = page.locator(".dashboard-section-card:visible").first();
      await expect(sectionCard).toBeVisible();
      await expect(sectionCard.locator("[data-panel-loading]")).toBeVisible();
      await expect(sectionCard.locator("[data-panel-loading]")).toHaveAttribute("aria-busy", "true");

      const geometry = await sectionCard.evaluate((card) => {
        const loading = card.querySelector<HTMLElement>("[data-panel-loading]");
        return {
          cardHeight: card.getBoundingClientRect().height,
          loadingHeight: loading?.getBoundingClientRect().height ?? 0,
        };
      });
      expect(geometry.loadingHeight, "Pending sections must reserve visible body space").toBeGreaterThanOrEqual(200);
      expect(geometry.cardHeight, "The section card must not collapse to its header").toBeGreaterThan(geometry.loadingHeight);
    } finally {
      releaseProjects();
      releaseProposals();
    }

    await expect(page.locator("[data-panel-loading]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Nuevas|New/i }).filter({ visible: true })).toBeVisible();
  });

  test("panel tabs navigate without reloading the document", async ({ page }) => {
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    await gotoOK(page, "/es/dashboard/profesional?tab=bookings");

    await page.evaluate(() => {
      (window as Window & { __contratacrSoftNavigation?: string }).__contratacrSoftNavigation = "active";
    });

    if (isMobileProject(test.info())) {
      await page.getByRole("button", { name: /^Volver(?: al panel)?$|^Back(?: to panel)?$/i }).filter({ visible: true }).first().click();
    }

    const servicesTab = page.getByTestId("panel-tab-services").filter({ visible: true });
    await expect(servicesTab).toHaveCount(1);
    await servicesTab.click();
    await expect(page).toHaveURL(/tab=services/);
    await expectVisibleText(page.locator("main"), /Servicios|Services/i);
    expect(await page.evaluate(() => (window as Window & { __contratacrSoftNavigation?: string }).__contratacrSoftNavigation)).toBe("active");

    if (isMobileProject(test.info())) {
      await page.getByRole("button", { name: /^Volver(?: al panel)?$|^Back(?: to panel)?$/i }).filter({ visible: true }).first().click();
    }

    const availabilityTab = page.getByTestId("panel-tab-availability").filter({ visible: true });
    await expect(availabilityTab).toHaveCount(1);
    await availabilityTab.click();
    await expect(page).toHaveURL(/tab=availability/);
    await expectVisibleText(page.locator("main"), /Disponibilidad|Availability/i);
    expect(await page.evaluate(() => (window as Window & { __contratacrSoftNavigation?: string }).__contratacrSoftNavigation)).toBe("active");
  });

  test("dashboard landing keeps core sections in the panel and shared tools in the navbar", async ({ page }, testInfo) => {
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    await gotoOK(page, "/es/dashboard/profesional");

    // Entrar al panel es entrar al PROFESIONAL: lo que confirma el contexto es
    // que el cambio de panel ofrezca ir al de cliente. (Antes se buscaba el
    // texto "Panel profesional", que en realidad venía del propio botón cuando
    // el panel abría en cliente: la prueba pasaba por el motivo contrario.)
    const cambioDePanel = page.locator("[data-panel-mode-selector], [data-testid='panel-mode-switch']").filter({ visible: true }).first();
    await expect(cambioDePanel).toBeVisible();
    // En escritorio el cambio es un selector con la opción profesional marcada;
    // en teléfono es una tarjeta que ofrece ir al panel de cliente. Las dos
    // dicen lo mismo: estás en el panel profesional.
    const enProfesional = page
      .locator("[data-panel-mode-selector] button[aria-pressed='true']")
      .filter({ hasText: /Profesional|Professional/i })
      .or(page.getByTestId("panel-mode-switch").filter({ hasText: /Ir a mi panel cliente|Go to my client panel/i }))
      .filter({ visible: true })
      .first();
    await expect(enProfesional).toBeVisible();
    await expect(page.getByTestId("panel-tab-bookings").filter({ visible: true })).toHaveCount(1);
    await expect(page.getByTestId("panel-tab-proposals").filter({ visible: true })).toHaveCount(1);
    await expect(page.getByTestId("panel-tab-chat").filter({ visible: true })).toHaveCount(0);
    await expect(page.getByTestId("panel-tab-notifications").filter({ visible: true })).toHaveCount(0);
    if (isMobileProject(testInfo)) {
      await expect(page).not.toHaveURL(/tab=bookings/);
      await expect(page.getByTestId("panel-tab-services").filter({ visible: true })).toHaveCount(1);
      await page.getByRole("button", { name: /Abrir men|Open menu/i }).click();
      await expect(page.getByText(/^Asistente$|^Assistant$/i).filter({ visible: true })).toHaveCount(0);
    } else {
      await expect(page.getByRole("button", { name: /Abrir asistente de ContrataCR|Open ContrataCR assistant/i })).toHaveCount(0);
    }

    await expectHealthyPage(page);
  });

  test("navbar hides professional registration for providers", async ({ page }, testInfo) => {
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    await gotoOK(page, "/es");
    if (isMobileProject(testInfo)) {
      await page.getByRole("button", { name: /Abrir men|Open menu/i }).first().click();
      const navigation = page.getByRole("dialog", { name: /Men[uú]|Menu/i });
      await expect(navigation.getByRole("link", { name: /Ofrecer mis servicios/i })).toHaveCount(0);
    } else {
      const navigation = page.getByRole("banner");
      await expect(navigation.getByRole("link", { name: /Ofrecer mis servicios/i })).toHaveCount(0);
    }
  });

  test("guides open as a panel section with its own content", async ({ page }) => {
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    await gotoOK(page, "/es/dashboard/profesional");

    await page.getByRole("button", { name: /^Gu[ií]as$/i }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/tab=guides/);
    await expectVisibleText(page.locator("body"), /Panel profesional|Professional panel/i);
    await expect(page.getByPlaceholder(/Buscar en las gu[ií]as|Search the guides/i)).toBeVisible();
  });

  test("favorites keep every saveable filter and connections show verification", async ({ page }) => {
    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    await gotoOK(page, "/es/dashboard/profesional?tab=saved&mode=use");
    for (const label of [/^Profesionales(?: \d+)?$/i, /^Ofertas(?: \d+)?$/i, /^Empleos(?: \d+)?$/i]) {
      await expect(page.getByRole("button", { name: label }).filter({ visible: true }).first()).toBeVisible();
    }

    await gotoOK(page, "/es/dashboard/profesional?tab=connections&mode=use");
    await expect(page.locator('svg[aria-label="Verificado"]').filter({ visible: true }).first()).toBeVisible();
  });

  test("every populated dashboard filter works without clipping at 320, 390 and desktop widths", async ({ page }) => {
    test.slow();
    const professionalSections = ["photos", "bookings", "soporte"];
    const clientSections = ["sent_bookings&mode=use", "sent_projects&mode=use", "saved&mode=use", "soporte&mode=use"];

    // Keep one stable authenticated document per actor. Repeatedly clearing
    // cookies and logging in while also changing the viewport made the same
    // page alternate between server redirects and a streamed client shell,
    // which could leave a transient all-white document unrelated to filters.
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    for (const width of [320, 390, 1366]) {
      await page.setViewportSize({ width, height: width >= 1000 ? 900 : 844 });
      for (const section of professionalSections) {
        await gotoOK(page, `/es/dashboard/profesional?tab=${section}`);
        await exerciseVisibleFilters(page);
      }

      await gotoOK(page, "/es/dashboard/profesional?tab=proposals");
      await exerciseVisibleFilters(page);
      await page.getByRole("button", { name: /Enviadas|Sent/i }).filter({ visible: true }).first().click();
      await exerciseVisibleFilters(page);
    }

    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    for (const width of [320, 390, 1366]) {
      await page.setViewportSize({ width, height: width >= 1000 ? 900 : 844 });
      for (const section of clientSections) {
        await gotoOK(page, `/es/dashboard/profesional?tab=${section}`);
        await exerciseVisibleFilters(page);
      }
      await expectHealthyPage(page);
    }
  });

  test("guides cover the current client, marketplace, and professional flows in both languages", async ({ page }) => {
    test.slow();
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);

    const locales = [
      {
        locale: "es",
        guideButton: /^Guías$/i,
        expected: [/Mis postulaciones/i, /Favoritos/i, /^Empleos$/i, /^Ofertas$/i, /Publicar empleos/i, /Publicar ofertas/i],
        expandable: /Mis postulaciones/i,
        profileGuide: /^Perfil profesional$/i,
        profileLastStep: /Usa Ver mi perfil para ver la versi.n p.blica/i,
      },
      {
        locale: "en",
        guideButton: /^Guides$/i,
        expected: [/My applications/i, /Favorites/i, /^Jobs$/i, /^Offers$/i, /Post jobs/i, /Publish offers/i],
        expandable: /My applications/i,
        profileGuide: /^Professional profile$/i,
        profileLastStep: /Use View my profile to see the public version/i,
      },
    ] as const;

    for (const copy of locales) {
      await gotoOK(page, `/${copy.locale}/dashboard/profesional`);
      const openGuides = page.getByRole("button", { name: copy.guideButton }).filter({ visible: true }).first();
      await expect(openGuides).toBeVisible();
      await openGuides.click();
      await expect(page).toHaveURL(/tab=guides/);

      for (const title of copy.expected) {
        await expect(page.getByText(title).filter({ visible: true }).first()).toBeVisible();
      }

      await page.getByRole("button", { name: copy.expandable }).filter({ visible: true }).first().click();
      await expect(page.getByRole("listitem").filter({ visible: true }).first()).toBeVisible();
      await page.getByRole("button").filter({ has: page.getByText(copy.profileGuide, { exact: true }) }).filter({ visible: true }).first().click();
      await expect(page.getByText(copy.profileLastStep).filter({ visible: true }).first()).toBeVisible();
      await expectHealthyPage(page);
    }
  });

  test("professional add-service picker keeps its scroll inside the modal", async ({ page }) => {
    test.slow();
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    await gotoOK(page, "/es/dashboard/profesional?tab=services");
    await expectVisibleText(page.locator("main"), /Servicios|Services/i);

    await page.getByRole("button", { name: /Agregar servicio|Add service/i }).last().click();
    const dialog = page.getByRole("dialog").filter({ hasText: /Agregar servicio|Add service/i }).first();
    const scroll = dialog.locator('[data-testid="services-add-picker-scroll"], .overflow-y-auto').last();

    await expect(dialog).toBeVisible();
    await expect(scroll).toBeVisible();
    await expect(dialog.getByText(/Hogar y construcci|Home and construction|Tecnolog|Technology/i).first()).toBeVisible();

    const dialogBox = await dialog.boundingBox();
    const scrollBox = await scroll.boundingBox();
    expect(dialogBox, "Dialog should have a bounding box").not.toBeNull();
    expect(scrollBox, "Add-service picker scroll area should have a bounding box").not.toBeNull();
    const contained =
      scrollBox!.x >= dialogBox!.x - 1 &&
      scrollBox!.x + scrollBox!.width <= dialogBox!.x + dialogBox!.width + 1 &&
      scrollBox!.y >= dialogBox!.y - 1 &&
      scrollBox!.y + scrollBox!.height <= dialogBox!.y + dialogBox!.height + 1;
    expect(contained, "Add-service picker scroll area should stay inside the modal").toBe(true);

    await scroll.evaluate((node) => { node.scrollTop = node.scrollHeight; });
    await expect(dialog.getByRole("button", { name: /Sugerir servicio|Suggest a service/i }).first()).toBeVisible();
    await expectHealthyPage(page);
  });

  test("client mode sections render without broken states", async ({ page }) => {
    test.slow();
    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);

    for (const section of clientTabs) {
      await gotoOK(page, `/es/dashboard/profesional?tab=${section.tab}`);
      // El título de la sección vive en la barra, no dentro de <main>.
      await expectVisibleText(page.locator("body"), section.marker);
      await expectHealthyPage(page);
    }
  });

  test("English professional and client panels keep their sections translated", async ({ page }) => {
    test.slow();
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);

    for (const section of professionalTabs) {
      await gotoOK(page, `/en/dashboard/profesional?tab=${section.tab}`);
      await expectVisibleText(page.locator("body"), section.marker);
      await expect(page.locator("main").last()).not.toContainText(/Notificaciones|Disponibilidad|Cuenta y seguridad/i);
      await expectHealthyPage(page);
    }

    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    for (const section of clientTabs) {
      await gotoOK(page, `/en/dashboard/profesional?tab=${section.tab}`);
      await expectVisibleText(page.locator("body"), section.marker);
      await expectHealthyPage(page);
    }
  });

  test("every active authenticated page route is reachable in Spanish and English", async ({ page }) => {
    test.setTimeout(360_000);
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    const context = page.context();
    // A second live Supabase tab can contend for the shared auth lock while the
    // first tab is still subscribing to realtime. Keep each route isolated, but
    // never leave two authenticated pages open at once.
    await page.close();

    for (const locale of ["es", "en"] as const) {
      const routes = [
        `/${locale}/dashboard/profesional?tab=home`,
        `/${locale}/dashboard/cliente`,
        `/${locale}/notificaciones`,
        `/${locale}/completar-perfil`,
        `/${locale}/onboarding`,
        `/${locale}/ofertas/publicar`,
        `/${locale}/ofertas/mis-ofertas`,
        `/${locale}/ofertas/${seed.publishedOfferId}/editar`,
        `/${locale}/empleos/publicar`,
        `/${locale}/empleos/mis-empleos`,
        `/${locale}/empleos/${seed.publishedJobId}/editar`,
      ];

      for (const route of routes) {
        // Onboarding and completion routes may finish a delayed client-side
        // redirect after their document is already interactive. Isolate each
        // route in a fresh page so that redirect cannot abort the next route's
        // navigation while preserving the authenticated browser context.
        const routePage = await context.newPage();
        try {
          await gotoOK(routePage, route);
          await expectPageShell(routePage, { timeout: 30_000, label: route });
          await expect(routePage).not.toHaveURL(/\/(?:es|en)\/login/);
          await expectHealthyPage(routePage);
        } finally {
          await routePage.close();
        }
      }
    }
  });

  test("English favorites, connections, following and followers expose no Spanish controls", async ({ page }) => {
    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);

    await gotoOK(page, "/en/dashboard/profesional?tab=saved&mode=use");
    for (const label of [/^Professionals(?: \d+)?$/i, /^Offers(?: \d+)?$/i, /^Jobs(?: \d+)?$/i]) {
      await expect(page.getByRole("button", { name: label }).filter({ visible: true }).first()).toBeVisible();
    }
    await expect(page.getByRole("button", { name: /^(?:Profesionales|Ofertas|Empleos)/i })).toHaveCount(0);

    await gotoOK(page, "/en/dashboard/profesional?tab=connections&mode=use");
    await expect(page.getByPlaceholder(/Search by professional or service/i)).toBeVisible();
    await expect(page.locator('svg[aria-label="Verified"]:visible').first()).toBeVisible();
    await expect(page.getByRole("link", { name: /View profile/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Ver perfil/i })).toHaveCount(0);

    // Seguir salió del producto (553536d1): en su lugar se comprueba que
    // Favoritos —el gesto que lo reemplazó— también está en inglés, y que una
    // pestaña retirada no revive con un enlace viejo.
    await gotoOK(page, "/en/dashboard/profesional?tab=network&mode=use");
    await expect(page.getByRole("heading", { name: /^(?:Following|Followers)$/i })).toHaveCount(0);
    await expectHealthyPage(page);
  });
});
