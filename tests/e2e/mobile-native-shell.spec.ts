import { expect, test, type Page } from "playwright/test";
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
    navLabel: "Navegacion de la app",
    navItems: ["Buscar", "Ofertas", "Asistente", "Empleos", "Panel"],
    messages: "Mensajes",
    assistant: "Abrir asistente",
    assistantDialog: /Asistente ContrataCR/i,
    assistantInput: /Escribe una pregunta/i,
    assistantSend: /^Enviar mensaje$/i,
    assistantAnswer: "Encontré una opción para su solicitud.",
    messageAction: "Mensaje",
  },
  {
    locale: "en",
    navLabel: "App navigation",
    navItems: ["Search", "Deals", "Assistant", "Jobs", "Panel"],
    messages: "Messages",
    assistant: "Open assistant",
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
  await expect(nav.locator(":scope > div > *")).toHaveText(contract.navItems);

  const messagesLink = page.locator(`header a[href$="/mensajes"][aria-label="${contract.messages}"]`).filter({ visible: true });
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
  expect(geometry!.mainBottom).toBeLessThanOrEqual(geometry!.navTop + 1);
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
      shellBottom: shellRect?.bottom ?? null,
      shellHeight: shellRect?.height ?? null,
      shellPosition: shell ? getComputedStyle(shell).position : null,
      visualHeight: getComputedStyle(root).getPropertyValue("--app-visual-viewport-height").trim(),
    };
  }, { composerSelector, inputSelector });

  expect(geometry).not.toBeNull();
  expect(geometry!.composerHeight).toBeLessThan(120);
  expect(geometry!.composerBottom, JSON.stringify(geometry)).toBeLessThanOrEqual(501);
  expect(geometry!.fieldBottom).toBeLessThanOrEqual(501);

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

  test("signed-out public pages reserve the compact native header and keep the offer-services icon", async ({ page }) => {
    await resetAuth(page);
    await gotoOK(page, "/es/ofertas");

    const header = page.locator("header.ccr-app-header");
    const main = page.locator("main");
    await expect(header).toBeVisible();
    await expect(main).toBeVisible();

    const geometry = await page.evaluate(() => {
      const headerElement = document.querySelector<HTMLElement>("header.ccr-app-header");
      const mainElement = document.querySelector<HTMLElement>("main");
      if (!headerElement || !mainElement) return null;
      const headerRect = headerElement.getBoundingClientRect();
      const mainRect = mainElement.getBoundingClientRect();
      return {
        headerBottom: headerRect.bottom,
        mainTop: mainRect.top,
        reservedHeaderHeight: getComputedStyle(document.body).getPropertyValue("--ccr-native-header-height").trim(),
      };
    });
    expect(geometry).not.toBeNull();
    expect(geometry!.mainTop).toBeGreaterThanOrEqual(geometry!.headerBottom - 1);
    expect(geometry!.reservedHeaderHeight).toBe("64px");

    const apple = page.getByRole("button", { name: /continuar con apple/i });
    const google = page.getByRole("button", { name: /continuar con google/i });
    await expect(page.getByRole("button", { name: /^ingresar$/i })).toBeEnabled();
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(apple).toBeEnabled();
    await expect(google).toBeEnabled();

    await page.getByRole("button", { name: /abrir men[uú]/i }).click();
    const offerServices = page.getByRole("link", { name: "Ofrecer mis servicios" });
    await expect(offerServices).toBeVisible();
    await expect(offerServices.locator("svg")).toHaveCount(1);
  });

  test("first installation keeps incomplete login and registration journeys retryable", async ({ page }) => {
    await resetAuth(page);
    await page.evaluate(() => {
      window.sessionStorage.setItem("ccr:e2e-show-first-run-onboarding", "1");
      window.localStorage.removeItem("ccr:native-first-run-onboarding:v12");
      window.localStorage.removeItem("ccr:native-first-run-pending-path:v1");
    });
    await gotoOK(page, "/es");

    const onboarding = page.getByTestId("native-first-run-onboarding");
    await expect(onboarding).toBeVisible();
    await expect(onboarding.getByText("Elige cómo quieres comenzar")).toBeVisible();
    const clientRole = onboarding.getByRole("button", { name: /Buscar servicios/i });
    const professionalRole = onboarding.getByRole("button", { name: /Ofrecer servicios/i });
    await expect(clientRole).toHaveAttribute("aria-pressed", "true");
    await expect(professionalRole).toHaveAttribute("aria-pressed", "false");
    await professionalRole.click();
    await expect(professionalRole).toHaveAttribute("aria-pressed", "true");
    await clientRole.click();
    await onboarding.getByRole("button", { name: "Crear una cuenta" }).click();
    await expect(onboarding).toBeHidden();
    await expect(page).toHaveURL(/\/es\/registro\/cliente/);
    await expect(page.getByRole("heading", { name: "Crear cuenta de cliente", exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem("ccr:native-first-run-onboarding:v12"))).toBeNull();
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem("ccr:native-first-run-pending-path:v1"))).toBeNull();
    await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem("ccr:native-first-run-auth-session:v1"))).toBe("1");

    await page.goBack({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/es\/?$/);
    await expect(onboarding).toBeVisible();
    await expect(onboarding.getByText("Elige cómo quieres comenzar")).toBeVisible();

    await onboarding.getByRole("button", { name: /Ofrecer servicios/i }).click();
    await onboarding.getByRole("button", { name: "Crear una cuenta" }).click();
    await expect(page).toHaveURL(/\/es\/registro\/profesional/);
    await expect(page.getByRole("heading", { name: "Crea tu cuenta profesional", exact: true })).toBeVisible();
    await page.goBack({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/es\/?$/);
    await expect(onboarding).toBeVisible();

    await onboarding.getByRole("button", { name: /Inicia sesión/i }).click();
    await expect(page).toHaveURL(/\/es\/login/);
    await expect(page.getByRole("heading", { name: "Bienvenido de vuelta", exact: true })).toBeVisible();
    await page.goBack({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/es\/?$/);
    await expect(onboarding).toBeVisible();

    await onboarding.getByRole("button", { name: /Inicia sesión/i }).click();
    await expect(page).toHaveURL(/\/es\/login/);
    await expect(page.getByRole("heading", { name: "Bienvenido de vuelta", exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem("ccr:native-first-run-onboarding:v12"))).toBeNull();
  });

  test("native marketplace tabs survive localized document navigations", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await gotoOK(page, "/es");

    for (const destination of [
      { label: "Ofertas", path: "/es/ofertas", heading: "Ofertas" },
      { label: "Empleos", path: "/es/empleos", heading: "Empleos" },
    ]) {
      const nativeNav = page.locator("nav.ccr-native-bottom-nav").filter({ visible: true });
      await expect(nativeNav).toBeVisible();
      await Promise.all([
        page.waitForURL(new RegExp(`${destination.path.replaceAll("/", "\\/")}(?:[?#].*)?$`), { waitUntil: "domcontentloaded" }),
        nativeNav.getByRole("link", { name: destination.label, exact: true }).click(),
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

    expect(pageErrors).toEqual([]);
  });

  test("native search owns the full viewport without a hidden footer reserve", async ({ page }) => {
    await gotoOK(page, "/es/buscar?regression=1");

    await expect(page.locator("nav.ccr-native-bottom-nav")).toHaveCount(0);
    await expect(page.locator("body")).not.toHaveClass(/ccr-native-bottom-nav-visible/);

    const sheet = page.locator(".ccr-search-bottom-sheet");
    const handle = sheet.getByRole("button", { name: "Cambiar tamaño del panel de resultados" });
    await expect(sheet).toBeVisible();
    await handle.press("Enter");
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
      return { top: rect.top, bottom: rect.bottom, viewportHeight: window.innerHeight };
    });
    expect(overlayGeometry).not.toBeNull();
    expect(overlayGeometry!.top).toBe(0);
    expect(overlayGeometry!.bottom).toBeLessThanOrEqual(overlayGeometry!.viewportHeight + 1);
    expect(overlayGeometry!.bottom).toBeGreaterThanOrEqual(overlayGeometry!.viewportHeight - 1);
  });

  test("notification item actions escape the scrolling panel", async ({ page }) => {
    await gotoOK(page, "/es/notificaciones");
    await expect(page.getByRole("heading", { name: "Notificaciones", exact: true })).toBeVisible();

    const itemOptions = page.getByRole("button", { name: "Opciones", exact: true });
    await expect(itemOptions.first()).toBeVisible();
    await itemOptions.last().click();

    const menu = page.locator("[data-notification-item-menu]");
    await expect(menu).toBeVisible();
    const geometry = await menu.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        parentIsBody: element.parentElement === document.body,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        zIndex: Number.parseInt(getComputedStyle(element).zIndex, 10),
      };
    });
    expect(geometry.parentIsBody).toBe(true);
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
    expect(geometry.zIndex).toBeGreaterThan(200);
  });

  for (const contract of LOCALES) {
    test(`${contract.locale.toUpperCase()} keeps native navigation, messages and assistant chat isolated from web`, async ({ page }) => {
      const conversationId = "00000000-0000-4000-8000-00000000cafe";
      let directChatRequests = 0;
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
                actionLabel: contract.locale === "en" ? "Contact on WhatsApp" : "Contactar por WhatsApp",
                actionKind: "message",
              },
            ],
          }),
        });
      });

      await page.getByRole("button", { name: contract.assistant }).click();
      const dialog = page.getByRole("dialog", { name: contract.assistantDialog });
      await expect(dialog).toBeVisible();
      await expect(page.locator("nav.ccr-native-bottom-nav")).toBeHidden();
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

      await expect.poll(() => directChatRequests).toBe(1);
      await expect(page).toHaveURL(new RegExp(`/${contract.locale}/mensajes\\?conversation=${conversationId}$`));
      await expect(page.locator("html")).toHaveClass(/contratacr-chat-thread-open/);
      await expect(page.locator("nav.ccr-native-bottom-nav")).toBeHidden();
      await expect(page.locator(".ccr-direct-chat-composer")).toBeVisible();
      await assertKeyboardSafeComposer(
        page,
        ".ccr-direct-chat-composer",
        ".ccr-direct-chat-composer textarea",
      );
    });
  }
});
