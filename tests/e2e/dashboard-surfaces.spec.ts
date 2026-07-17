import { expect, test } from "playwright/test";
import { expectHealthyPage, expectVisibleText, gotoOK, loginAs } from "./helpers";
import { canRunSeededRegression, E2E_USERS, ensureRegressionSeed } from "./seed";

const professionalTabs = [
  { tab: "profile", marker: /Mi perfil|My profile/i },
  { tab: "services", marker: /Servicios|Services/i },
  { tab: "photos", marker: /Casos de exito|Casos de .xito|Success cases|Success stories/i },
  { tab: "availability", marker: /Disponibilidad|Availability/i },
  { tab: "bookings", marker: /Solicitudes recibidas|Requests received/i },
  { tab: "proposals", marker: /Oportunidades|Opportunities/i },
  { tab: "verificacion", marker: /Verificacion|Verificaci.n|Verification/i },
  { tab: "notifications", marker: /Notificaciones|Notifications/i },
  { tab: "chat", marker: /Mensajes|Messages/i },
  { tab: "soporte", marker: /Soporte|Support/i },
  { tab: "cuenta", marker: /Cuenta y seguridad|Account (?:and|&) security/i },
] as const;

const clientTabs = [
  { tab: "profile&mode=use", marker: /Mi perfil|My profile/i },
  { tab: "sent_bookings", marker: /Mis solicitudes|My requests/i },
  { tab: "sent_projects", marker: /Mis publicaciones|My posts/i },
  { tab: "saved", marker: /Mis favoritos|My favorites/i },
  { tab: "notifications&mode=use", marker: /Notificaciones|Notifications/i },
  { tab: "chat&mode=use", marker: /Mensajes|Messages/i },
  { tab: "soporte&mode=use", marker: /Soporte|Support/i },
  { tab: "cuenta&mode=use", marker: /Cuenta y seguridad|Account (?:and|&) security/i },
] as const;

test.describe.configure({ mode: "serial" });

test.describe("@seeded dashboard surfaces", () => {
  test.skip(!canRunSeededRegression(), "Set E2E_SEED=1 with the test Supabase secrets to run dashboard regression.");

  test.beforeAll(async () => {
    await ensureRegressionSeed();
  });

  test("professional panel sections render without broken states", async ({ page }) => {
    test.slow();
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);

    for (const section of professionalTabs) {
      await gotoOK(page, `/es/dashboard/profesional?tab=${section.tab}`);
      await expectVisibleText(page.locator("main"), section.marker);
      await expectHealthyPage(page);
    }
  });

  test("panel tabs navigate without reloading the document", async ({ page }) => {
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    await gotoOK(page, "/es/dashboard/profesional?tab=bookings");

    await page.evaluate(() => {
      (window as Window & { __contratacrSoftNavigation?: string }).__contratacrSoftNavigation = "active";
    });

    const servicesTab = page.getByTestId("panel-tab-services").filter({ visible: true });
    await expect(servicesTab).toHaveCount(1);
    await servicesTab.click();
    await expect(page).toHaveURL(/tab=services/);
    await expectVisibleText(page.locator("main"), /Servicios|Services/i);
    expect(await page.evaluate(() => (window as Window & { __contratacrSoftNavigation?: string }).__contratacrSoftNavigation)).toBe("active");

    const availabilityTab = page.getByTestId("panel-tab-availability").filter({ visible: true });
    await expect(availabilityTab).toHaveCount(1);
    await availabilityTab.click();
    await expect(page).toHaveURL(/tab=availability/);
    await expectVisibleText(page.locator("main"), /Disponibilidad|Availability/i);
    expect(await page.evaluate(() => (window as Window & { __contratacrSoftNavigation?: string }).__contratacrSoftNavigation)).toBe("active");
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
      await expectVisibleText(page.locator("main"), section.marker);
      await expectHealthyPage(page);
    }
  });

  test("English professional and client panels keep their sections translated", async ({ page }) => {
    test.slow();
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);

    for (const section of professionalTabs) {
      await gotoOK(page, `/en/dashboard/profesional?tab=${section.tab}`);
      await expectVisibleText(page.locator("main"), section.marker);
      await expect(page.locator("main").last()).not.toContainText(/Notificaciones|Solicitudes recibidas|Disponibilidad|Cuenta y seguridad/i);
      await expectHealthyPage(page);
    }

    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    for (const section of clientTabs) {
      await gotoOK(page, `/en/dashboard/profesional?tab=${section.tab}`);
      await expectVisibleText(page.locator("main"), section.marker);
      await expectHealthyPage(page);
    }
  });
});
