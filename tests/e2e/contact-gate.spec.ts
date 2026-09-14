import { expect, test } from "playwright/test";
import { apiJson, firstProfessionalHref, gotoOK, resetAuth, waitForInteractivePage } from "./helpers";
import { canRunSeededRegression, ensureRegressionSeed, regressionAdminClient } from "./seed";

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

  test("un invitado que toca WhatsApp solo pone su nombre y su teléfono", async ({ page }) => {
    await resetAuth(page);
    const admin = regressionAdminClient();
    await admin.from("contact_leads").delete().eq("professional_id", seed.professionalId);

    await gotoOK(page, `/es/profesionales/${seed.professionalSlug}`);
    await waitForInteractivePage(page);
    const whatsapp = page.getByRole("button", { name: /^WhatsApp$|Contactar por WhatsApp|Contact on WhatsApp/i }).filter({ visible: true }).first();
    await expect(whatsapp).toBeVisible({ timeout: 15_000 });
    const urlBefore = page.url();
    await whatsapp.click();

    const dialog = page.getByRole("dialog").filter({ visible: true }).first();
    await expect(dialog).toBeVisible();
    // Dos campos, ni uno más: ni contraseña, ni cédula, ni código al correo.
    await expect(dialog.locator("input")).toHaveCount(2);
    await expect(dialog.getByText(/contrase|password|c[eé]dula|identificaci/i)).toHaveCount(0);
    expect(page.url()).toBe(urlBefore);

    await dialog.getByLabel(/Tu nombre/i).fill("Ana Prueba Invitada");
    await dialog.getByLabel(/Tu tel[eé]fono/i).fill("70000009");
    await dialog.getByRole("button", { name: /WhatsApp/i }).click();
    await page.waitForTimeout(2000);

    // El profesional se queda con quién lo buscó y a qué número devolverle.
    const { data: leads } = await admin
      .from("contact_leads")
      .select("name, phone")
      .eq("professional_id", seed.professionalId);
    expect(leads?.length).toBe(1);
    expect(leads?.[0].phone).toBe("+50670000009");
  });
});
