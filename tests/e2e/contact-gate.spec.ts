import { expect, test } from "playwright/test";
import { apiJson, firstProfessionalHref, gotoOK, loginAs, resetAuth, waitForInteractivePage } from "./helpers";
import { canRunSeededRegression, ensureRegressionSeed, regressionAdminClient, E2E_USERS } from "./seed";

// Contactar NO exige cuenta: pide nombre y teléfono, y con eso el profesional
// puede devolver la llamada. Lo que sigue protegido es el listado —ahí los
// números nunca viajan, que es por donde se raspa— y el tope por hora.

type PublicProfile = { whatsapp?: string; callPhone?: string; contactEmail?: string; hasWhatsapp?: boolean; hasCallPhone?: boolean };

test.describe("@seeded contact gate", () => {
  let seed!: NonNullable<Awaited<ReturnType<typeof ensureRegressionSeed>>>;
  test.beforeAll(async () => {
    if (canRunSeededRegression()) seed = await ensureRegressionSeed();
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

    // Las rutas de contacto ya no rechazan a un invitado; lo que no existe es
    // el profesional inventado.
    const reveal = await apiJson(page, "/api/contact/reveal?professionalId=00000000-0000-0000-0000-000000000000");
    expect(reveal.status).toBe(404);

    // Search HTML carries no phone numbers for guests.
    const html = await page.evaluate(async () => (await fetch("/es/buscar")).text());
    expect(html).not.toMatch(/"whatsapp":"\+?\d{8,}/);
    expect(html).not.toMatch(/tel:\+\d{8,}/);
  });

  test("un invitado contacta de un solo toque, sin ventana de por medio", async ({ page }) => {
    await resetAuth(page);
    await gotoOK(page, `/es/profesionales/${seed.professionalSlug}`);
    await waitForInteractivePage(page);

    // El botón abre WhatsApp en otra pestaña; lo que se comprueba aquí es que
    // NADA se interponga: ni registro, ni formulario, ni pedirle la cédula.
    // Un solo rótulo en todo el app.
    const whatsapp = page.getByRole("button", { name: /^WhatsApp$/i }).filter({ visible: true }).first();
    await expect(whatsapp).toBeVisible({ timeout: 15_000 });
    const urlAntes = page.url();
    await whatsapp.click();
    await page.waitForTimeout(1500);

    await expect(page.getByRole("dialog").filter({ visible: true })).toHaveCount(0);
    await expect(page.getByText(/Crea tu cuenta|Create your free account|Nombre completo/i)).toHaveCount(0);
    expect(page.url()).toBe(urlAntes);
  });
});
