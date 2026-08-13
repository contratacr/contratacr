import { expect, test } from "playwright/test";
import esMessages from "../../messages/es.json";
import enMessages from "../../messages/en.json";
import { notificationContext, notificationHref } from "../../src/lib/notification-link";
import { localizedNotificationCopy, TRANSLATED_NOTIFICATION_TYPES } from "../../src/lib/localized-notification";
import { resolveAuthCallbackLocale } from "../../src/lib/auth/callback-locale";
import { apiJson, resetAuth } from "./helpers";

const notificationTypes = [...TRANSLATED_NOTIFICATION_TYPES].sort();

test.describe("@contract product safety contracts", () => {
  test("public account deletion CTA opens Account and security", async ({ page }) => {
    await resetAuth(page);
    await page.goto("/es/eliminar-cuenta");
    const cta = page.getByRole("link", { name: "Ir a Cuenta y seguridad" });
    await expect(cta).toHaveAttribute("href", "/es/dashboard/profesional?tab=cuenta");
  });

  test("OAuth callback locale follows English login and safe English deep links", () => {
    expect(resolveAuthCallbackLocale("en", null)).toBe("en");
    expect(resolveAuthCallbackLocale(null, "/en/dashboard/profesional?tab=cuenta")).toBe("en");
    expect(resolveAuthCallbackLocale("es", "/es/dashboard/profesional")).toBe("es");
    expect(resolveAuthCallbackLocale(null, null)).toBe("es");
  });

  test("Spanish product copy has no broken encoding placeholders", () => {
    const serialized = JSON.stringify(esMessages);
    expect(serialized).not.toMatch(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]\?[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/);
    expect(serialized).not.toMatch(/Ã.|Â.|â.|�/);
  });

  test("every notification type is translated and stays inside the localized app", async () => {
    const esTypes = esMessages.notifications.types as Record<string, string>;
    const enTypes = enMessages.notifications.types as Record<string, string>;

    for (const type of notificationTypes) {
      expect(esTypes[type], `Missing Spanish notification label for ${type}`).toBeTruthy();
      expect(enTypes[type], `Missing English notification label for ${type}`).toBeTruthy();

      const esHref = notificationHref({ type, data: { booking_id: "booking-e2e", project_id: "project-e2e" } }, undefined, "es");
      const enHref = notificationHref({ type }, undefined, "en");
      for (const [locale, href] of [["es", esHref], ["en", enHref]] as const) {
        expect(href, `${type} should stay inside the ${locale} app`).toMatch(new RegExp(`^/${locale}/`));
        expect(href, `${type} must not reopen the retired client dashboard`).not.toContain("/dashboard/cliente");

        const target = new URL(href, "https://test.contratacr.com");
        if (target.pathname === `/${locale}/dashboard/profesional`) {
          expect(target.searchParams.get("tab"), `${type} should target a concrete panel tab`).toBeTruthy();
        }
      }
      expect(["professional", "client", "support", null]).toContain(notificationContext(type));
    }
  });

  test("structured notification metadata localizes dates, categories, ratings, and legacy verification", () => {
    const booking = {
      type: "booking_received",
      title: "Nueva solicitud",
      message: "Ana solicitó 'Desarrollo web'.",
      data: {
        client_name: "Ana",
        service_description: "Desarrollo web",
        scheduled_date: "2026-08-13",
        scheduled_time: "10:30:00",
      },
    };
    expect(localizedNotificationCopy(booking, "es").message).toContain("jueves, 13 de agosto a las 10:30");
    expect(localizedNotificationCopy(booking, "en").message).toContain("Thursday, August 13 at 10:30");

    const project = {
      type: "new_project",
      title: "Nuevo proyecto",
      message: 'Un cliente publicó "Sitio institucional" en Desarrollo web.',
      data: { project_title: "Sitio institucional", category_id: "desarrollo_web" },
    };
    expect(localizedNotificationCopy(project, "es").message).toContain("en Desarrollo web");
    expect(localizedNotificationCopy(project, "en").message).toContain("in Web development");

    const review = {
      type: "review_received",
      title: "Nueva reseña recibida",
      message: "Ana te dejó una reseña de 4,5 estrellas.",
      data: { client_name: "Ana", rating: 4.5 },
    };
    expect(localizedNotificationCopy(review, "es").message).toContain("4,5 estrellas");
    expect(localizedNotificationCopy(review, "en").message).toContain("4.5-star review");

    const legacyVerification = {
      type: "verification",
      title: "Actualización de verificación",
      message: "Tu verificación de identidad no fue aprobada. Motivo: Documento borroso. Puedes apelar desde tu panel.",
    };
    const verificationEs = localizedNotificationCopy(legacyVerification, "es").message;
    const verificationEn = localizedNotificationCopy(legacyVerification, "en").message;
    expect(verificationEs).toBe("Tu verificación de identidad no fue aprobada. Puedes apelar desde tu panel. Motivo: Documento borroso");
    expect(verificationEn).toBe("Your identity verification was not approved. You can appeal from your panel. Reason: Documento borroso");
    expect(verificationEn).not.toContain("Puedes apelar");

    const legacyReverted = localizedNotificationCopy({
      type: "verification_reverted",
      title: "Tu verificación fue actualizada",
      message: "Tu verificación fue quitada. Motivo: Documento vencido. Revisa tu panel para ver el detalle.",
    }, "en").message;
    expect(legacyReverted).toBe("Your verification badge was removed. Check your panel for details. Reason: Documento vencido");
  });

  test("guest write boundaries reject protected account actions", async ({ page }) => {
    await resetAuth(page);
    const checks = [
      { name: "projects", response: apiJson(page, "/api/projects", { method: "POST", body: { title: "E2E", description: "E2E", categoryId: "plomeria" } }) },
      { name: "proposals", response: apiJson(page, "/api/proposals", { method: "POST", body: { projectId: "missing", price: 1000, message: "E2E" } }) },
      { name: "reviews", response: apiJson(page, "/api/reviews", { method: "POST", body: { professionalId: "missing", rating: 5, comment: "E2E" } }) },
      { name: "account disable", response: apiJson(page, "/api/account/disable", { method: "POST", body: { reason: "E2E" } }) },
      { name: "direct chat", response: apiJson(page, "/api/direct-chat") },
      { name: "add identity", response: apiJson(page, "/api/add-cedula", { method: "POST", body: { cedula: "990000001" } }) },
      { name: "identity appeal", response: apiJson(page, "/api/appeals", { method: "POST", body: { message: "E2E" } }) },
      { name: "support", response: apiJson(page, "/api/support") },
    ];

    const results = await Promise.all(checks.map(async ({ name, response }) => ({ name, result: await response })));
    for (const { name, result } of results) {
      expect([401, 403], `Expected ${name} to reject guest, got ${result.status}`).toContain(result.status);
    }

    const guestAiHistory = await apiJson<{ conversations?: unknown[] }>(page, "/api/ai-assistant/history");
    expect(guestAiHistory.status).toBe(200);
    expect(guestAiHistory.body.conversations).toEqual([]);

    const malformedBooking = await apiJson(page, "/api/bookings", { method: "POST", body: {} });
    expect(malformedBooking.status).toBe(400);
  });

  test("password reset keeps account discovery private and validates malformed requests", async ({ page }) => {
    await resetAuth(page);
    const malformed = await apiJson(page, "/api/auth/password-reset", {
      method: "POST",
      body: { email: "not-an-email", redirectTo: "" },
    });
    expect(malformed.status).toBe(400);

    const unknown = await apiJson<{ ok?: boolean; error?: string }>(page, "/api/auth/password-reset", {
      method: "POST",
      body: {
        email: `missing-${Date.now()}@contratacr.test`,
        redirectTo: `${new URL(page.url()).origin}/es/reset-password`,
      },
    });
    expect(unknown.status).toBe(200);
    expect(unknown.body.ok).toBe(true);
    expect(unknown.body.error).toBeUndefined();
  });
});
