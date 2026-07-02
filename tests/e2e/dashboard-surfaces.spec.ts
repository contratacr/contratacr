import { expect, test } from "playwright/test";
import { expectHealthyPage, gotoOK, loginAs } from "./helpers";
import { canRunSeededRegression, E2E_USERS, ensureRegressionSeed } from "./seed";

const professionalTabs = [
  { tab: "profile", marker: /Mi perfil|My profile/i },
  { tab: "services", marker: /Servicios|Services/i },
  { tab: "photos", marker: /Casos de exito|Casos de .xito|Success cases/i },
  { tab: "availability", marker: /Disponibilidad|Availability/i },
  { tab: "bookings", marker: /Solicitudes recibidas|Requests received/i },
  { tab: "proposals", marker: /Oportunidades|Opportunities/i },
  { tab: "verificacion", marker: /Verificacion|Verificaci.n|Verification/i },
  { tab: "notifications", marker: /Notificaciones|Notifications/i },
  { tab: "soporte", marker: /Soporte|Support/i },
  { tab: "cuenta", marker: /Cuenta y seguridad|Account and security/i },
] as const;

const clientTabs = [
  { tab: "profile&mode=use", marker: /Mi perfil|My profile/i },
  { tab: "sent_bookings", marker: /Mis solicitudes|My requests/i },
  { tab: "sent_projects", marker: /Mis publicaciones|My posts/i },
  { tab: "saved", marker: /Mis favoritos|My favorites/i },
  { tab: "notifications&mode=use", marker: /Notificaciones|Notifications/i },
  { tab: "soporte&mode=use", marker: /Soporte|Support/i },
  { tab: "cuenta&mode=use", marker: /Cuenta y seguridad|Account and security/i },
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
      await expect(page.locator("main").getByText(section.marker).first()).toBeVisible();
      await expectHealthyPage(page);
    }
  });

  test("client mode sections render without broken states", async ({ page }) => {
    test.slow();
    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);

    for (const section of clientTabs) {
      await gotoOK(page, `/es/dashboard/profesional?tab=${section.tab}`);
      await expect(page.locator("main").getByText(section.marker).first()).toBeVisible();
      await expectHealthyPage(page);
    }
  });
});
