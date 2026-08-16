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
    assistantInput: /Pregunte o describa lo que necesita/i,
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
    assistantInput: /Ask or describe what you need/i,
    assistantSend: /^Send message$/i,
    assistantAnswer: "I found an option for your request.",
    messageAction: "Message",
  },
];

function enableNativeRuntime(page: Page) {
  return page.addInitScript(() => {
    if (window.sessionStorage.getItem("ccr:e2e-show-first-run-onboarding") !== "1") {
      window.localStorage.setItem("ccr:native-first-run-onboarding:v1", "1");
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

  test("signed-out public pages reserve the complete native header and keep the offer-services icon", async ({ page }) => {
    await resetAuth(page);
    await gotoOK(page, "/es/login");

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
    expect(geometry!.reservedHeaderHeight).toBe("124px");

    const terms = page.getByRole("checkbox");
    const apple = page.getByRole("button", { name: /continuar con apple/i });
    await expect(terms).not.toBeChecked();
    await expect(apple).toBeDisabled();
    await terms.check();
    await expect(apple).toBeEnabled();

    await page.getByRole("button", { name: /abrir men[uú]/i }).click();
    const offerServices = page.getByRole("link", { name: "Ofrecer mis servicios" });
    await expect(offerServices).toBeVisible();
    await expect(offerServices.locator("svg")).toHaveCount(1);
  });

  test("first installation explains notifications and lets people choose or skip a role", async ({ page }) => {
    await resetAuth(page);
    await page.evaluate(() => {
      window.sessionStorage.setItem("ccr:e2e-show-first-run-onboarding", "1");
      window.localStorage.removeItem("ccr:native-first-run-onboarding:v1");
    });
    await gotoOK(page, "/es");

    const onboarding = page.getByTestId("native-first-run-onboarding");
    await expect(onboarding).toBeVisible();
    await expect(onboarding.getByText("No te pierdas ninguna oportunidad")).toBeVisible();
    await onboarding.getByRole("button", { name: "Ahora no" }).click();
    await expect(onboarding.getByText("¿Qué quieres hacer?")).toBeVisible();
    await expect(onboarding.getByRole("button", { name: /Buscar servicios/i })).toBeVisible();
    await expect(onboarding.getByRole("button", { name: /Ofrecer servicios/i })).toBeVisible();
    await onboarding.getByRole("button", { name: "Omitir por ahora" }).click();
    await expect(onboarding).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem("ccr:native-first-run-onboarding:v1"))).toBe("1");
  });

  for (const contract of LOCALES) {
    test(`${contract.locale.toUpperCase()} keeps native navigation, messages and assistant chat isolated from web`, async ({ page }) => {
      const conversationId = "00000000-0000-4000-8000-00000000cafe";
      let directChatRequests = 0;
      await page.route("**/api/direct-chat", async (route) => {
        if (route.request().method() === "GET") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              conversations: [{ client_id: seed.clientId, client_unread_count: 3, professional_unread_count: 0 }],
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
      await dialog.getByRole("textbox", { name: contract.assistantInput }).fill("E2E native assistant contact");
      await dialog.getByRole("button", { name: contract.assistantSend }).click();

      const messageButton = dialog.getByRole("button", { name: contract.messageAction, exact: true });
      await expect(messageButton).toBeVisible();
      await expect(dialog.getByText(/WhatsApp/i)).toHaveCount(0);
      await messageButton.click();

      await expect.poll(() => directChatRequests).toBe(1);
      await expect(page).toHaveURL(new RegExp(`/${contract.locale}/mensajes\\?conversation=${conversationId}$`));
    });
  }
});
