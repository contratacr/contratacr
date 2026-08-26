import { expect, test } from "playwright/test";
import { apiJson, firstProfessionalHref, gotoOK, resetAuth, waitForInteractivePage } from "./helpers";
import { canRunSeededRegression, ensureRegressionSeed } from "./seed";

// Direct contact (WhatsApp, call, email) is account-gated: guests never receive
// a number, and the buttons open the in-page registration modal instead of
// leaving the page. Account holders get the number from the contact endpoints.

type PublicProfile = { whatsapp?: string; callPhone?: string; contactEmail?: string; hasWhatsapp?: boolean; hasCallPhone?: boolean };

test.describe("@seeded contact gate", () => {
  test.beforeAll(async () => {
    if (canRunSeededRegression()) await ensureRegressionSeed();
  });

  test("guests get flags, never numbers, and the contact endpoints refuse them", async ({ page }) => {
    await resetAuth(page);
    const href = await firstProfessionalHref(page);
    expect(href).toBeTruthy();
    const slug = href!.split("/profesionales/")[1].split(/[?#]/)[0];

    const profile = await apiJson<PublicProfile>(page, `/api/professionals/${slug}`);
    expect(profile.status).toBe(200);
    expect(profile.body.whatsapp ?? "").toBe("");
    expect(profile.body.callPhone).toBeUndefined();
    expect(profile.body.contactEmail).toBeUndefined();
    expect(typeof profile.body.hasWhatsapp).toBe("boolean");

    const results = await apiJson<{ professionals?: Array<{ professional: PublicProfile }> }>(page, "/api/buscar/results?offset=0&limit=3");
    expect(results.status).toBe(200);
    for (const item of results.body.professionals ?? []) expect(item.professional.whatsapp ?? "").toBe("");

    const link = await apiJson<{ code?: string }>(page, "/api/contact/whatsapp-link", { method: "POST", body: { professionalId: "00000000-0000-0000-0000-000000000000", locale: "es" } });
    expect(link.status).toBe(401);
    const reveal = await apiJson(page, "/api/contact/reveal?professionalId=00000000-0000-0000-0000-000000000000");
    expect(reveal.status).toBe(401);

    // Search HTML carries no phone numbers for guests.
    const html = await page.evaluate(async () => (await fetch("/es/buscar")).text());
    expect(html).not.toMatch(/"whatsapp":"\+?\d{8,}/);
    expect(html).not.toMatch(/tel:\+\d{8,}/);
  });

  test("a guest tapping WhatsApp gets the registration modal in place", async ({ page }) => {
    await resetAuth(page);
    await gotoOK(page, "/es/buscar");
    await waitForInteractivePage(page);
    const whatsapp = page.getByRole("button", { name: /Contactar por WhatsApp|Contact on WhatsApp/i }).filter({ visible: true }).first();
    await expect(whatsapp).toBeVisible({ timeout: 15_000 });
    const urlBefore = page.url();
    await whatsapp.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Para escribirle por WhatsApp a|To message on WhatsApp/i)).toBeVisible();
    await expect(dialog.getByText(/Crea tu cuenta gratis|Create your free account/i)).toBeVisible();
    expect(page.url()).toBe(urlBefore);
  });
});
