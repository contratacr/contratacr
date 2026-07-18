import { expect, test } from "playwright/test";
import esMessages from "../../messages/es.json";
import enMessages from "../../messages/en.json";
import { notificationContext, notificationHref } from "../../src/lib/notification-link";
import { TRANSLATED_NOTIFICATION_TYPES } from "../../src/lib/localized-notification";
import { apiJson, resetAuth } from "./helpers";

const notificationTypes = [...TRANSLATED_NOTIFICATION_TYPES].sort();

test.describe("@contract product safety contracts", () => {
  test("Spanish product copy has no broken encoding placeholders", () => {
    const serialized = JSON.stringify(esMessages);
    expect(serialized).not.toMatch(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]\?[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/);
    expect(serialized).not.toMatch(/Ã.|Â.|â.|�/);
  });

  test("every notification type is translated in both languages and routes inside the unified panel", async () => {
    const esTypes = esMessages.notifications.types as Record<string, string>;
    const enTypes = enMessages.notifications.types as Record<string, string>;

    for (const type of notificationTypes) {
      expect(esTypes[type], `Missing Spanish notification label for ${type}`).toBeTruthy();
      expect(enTypes[type], `Missing English notification label for ${type}`).toBeTruthy();

      const esHref = notificationHref({ type, data: { booking_id: "booking-e2e", project_id: "project-e2e" } }, undefined, "es");
      const enHref = notificationHref({ type }, undefined, "en");
      expect(esHref, `${type} should stay inside the unified Spanish panel`).toMatch(/^\/es\/dashboard\/profesional\?tab=/);
      expect(enHref, `${type} should stay inside the unified English panel`).toMatch(/^\/en\/dashboard\/profesional\?tab=/);
      expect(["professional", "client", "support", null]).toContain(notificationContext(type));
    }
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
