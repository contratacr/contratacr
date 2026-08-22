import { expect, test, type Page } from "playwright/test";
import { expectHealthyPage, expectVisibleText, gotoOK, loginAs } from "./helpers";
import { canRunSeededRegression, E2E_USERS, ensureRegressionSeed, regressionAdminClient } from "./seed";

// Block A of docs/quality-roadmap.md: the marketplace editors through the real
// screens. marketplace-lifecycle.spec.ts proves the APIs; this file proves the
// forms, the detail pages, the edit pages and the owner managers a professional
// actually uses — on desktop and on the phone layout.

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9Z8AAAAASUVORK5CYII=",
  "base64",
);

async function pickSelectMenu(page: Page, label: RegExp, option: RegExp) {
  const trigger = page.getByRole("button", { name: label }).first();
  await trigger.click();
  await page.getByRole("option", { name: option }).first().click();
}


// Desktop edits inside a modal; the phone layout navigates to the edit page.
// Either way the same form shows up with the saved values.
async function openOwnerEditor(page: Page, label: string, editPath: RegExp) {
  await page.getByText(label, { exact: true }).filter({ visible: true }).first().click();
  const dialog = page.getByRole("dialog").filter({ hasText: label });
  const inDialog = await dialog.isVisible({ timeout: 4_000 }).catch(() => false);
  if (inDialog) return dialog;
  await page.waitForURL(editPath, { waitUntil: "domcontentloaded" });
  return page.locator("main");
}

// After a save the detail is re-rendered on the server; CI runners can take
// longer than the default expectation, and a single reload settles the rare
// case where the router still shows the previous payload.
async function expectUpdatedDetail(page: Page, text: string) {
  const updated = page.getByText(text).first();
  if (!(await updated.isVisible({ timeout: 15_000 }).catch(() => false))) await page.reload();
  await expectVisibleText(page.locator("body"), text, 30_000);
}
async function openItemActions(page: Page, card: ReturnType<Page["locator"]>) {
  await card.getByRole("button", { name: /M[aá]s opciones|More options/i }).first().click();
}

// The row menu renders inside the card, so scope the action there: the page
// header also carries a "Publicar" control that must never be the match.
async function chooseItemAction(card: ReturnType<Page["locator"]>, label: RegExp) {
  await card.getByRole("menuitem", { name: label }).or(card.getByRole("button", { name: label })).first().click();
}

const LOCAL_STACK = process.env.LOCAL_REGRESSION_SEED === "1";

async function createOfferThroughApi(page: Page, title: string) {
  const admin = regressionAdminClient();
  const professionalId = (await ensureRegressionSeed()).professionalId;
  const { data: professional, error } = await admin
    .from("professionals")
    .select("portfolio_urls,portfolio_items,services,category_id")
    .eq("id", professionalId)
    .single();
  if (error || !professional) throw error ?? new Error("SG Solutions fixture not found");
  const items = Array.isArray(professional.portfolio_items)
    ? (professional.portfolio_items as Array<{ url?: string; image_url?: string; photos?: string[] }>)
    : [];
  const imageUrl = (Array.isArray(professional.portfolio_urls) ? professional.portfolio_urls[0] : null)
    || items.flatMap((item) => [item.url, item.image_url, ...(item.photos ?? [])]).find(Boolean);
  expect(imageUrl, "SG Solutions needs one existing image to seed an offer").toBeTruthy();
  const services = Array.isArray(professional.services)
    ? (professional.services as Array<{ id?: string; serviceId?: string; name?: string; label?: string }>)
    : [];
  const service = services[0] ?? {};
  const response = await page.evaluate(async (body) => {
    const res = await fetch("/api/offers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }, {
    professional_id: professionalId,
    service_category_id: service.id || service.serviceId || professional.category_id,
    title,
    description: "Oferta sembrada por la regresión para validar edición, pausa y republicación desde la interfaz real.",
    offer_type: "service_offer",
    service_label: service.name || service.label || "Servicio profesional",
    image_urls: [imageUrl],
    price_now: 45000,
    price_before: 60000,
    currency: "CRC",
    price_unit: "total",
    location_label: "Todo Costa Rica",
    valid_until: null,
    quantity_available: 3,
    status: "published",
  });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  const id = (response.body as { id?: string; offer?: { id?: string } }).id ?? (response.body as { offer?: { id?: string } }).offer?.id;
  expect(id, JSON.stringify(response.body)).toBeTruthy();
  return id as string;
}

test.describe.configure({ mode: "serial" });

test.describe("@seeded marketplace editors through the real screens", () => {
  test.skip(!canRunSeededRegression(), "Requires prepared ContrataCR/SG test fixtures.");
  const stamp = Date.now();
  const offerTitle = `Oferta UI regression ${stamp}`;
  const jobTitle = `Empleo UI regression ${stamp}`;
  const created = { offerId: "", jobId: "" };

  test.beforeAll(async () => {
    await ensureRegressionSeed();
  });

  test.afterAll(async () => {
    // The advertising-parity check counts SG Solutions' rows, so anything this
    // file created must be gone before verify-regression-pair runs.
    const admin = regressionAdminClient();
    const contentIds = [created.offerId, created.jobId].filter(Boolean);
    // Publishing also writes the follower feed; those rows would point at
    // content that no longer exists and trip the isolation check.
    if (contentIds.length) {
      await admin.from("notifications").delete().eq("type", "followed_professional_activity").in("data->>content_id", contentIds);
      await admin.from("professional_activity").delete().in("content_id", contentIds);
    }
    if (created.offerId) await admin.from("professional_offers").delete().eq("id", created.offerId);
    if (created.jobId) await admin.from("job_posts").delete().eq("id", created.jobId);
  });

  test("publishes an offer from the form, edits it, pauses and republishes it from the manager", async ({ page }) => {
    test.slow();
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);

    if (LOCAL_STACK) {
      // The runner's local stack has no image host (/api/upload/photo answers
      // 503), and an offer requires an image, so the offer starts through the
      // API with one of SG Solutions' existing images. The form with a real
      // upload is exercised by the mobile workflow against the test project.
      created.offerId = await createOfferThroughApi(page, offerTitle);
      await gotoOK(page, `/es/ofertas/${created.offerId}`);
    } else {
      await gotoOK(page, "/es/ofertas/publicar");
      await expectVisibleText(page.locator("body"), /Publicar oferta/);
      await page.locator('input[name="title"]').fill(offerTitle);
      // The service picker is a trigger button that reveals a search box.
      await page.getByText("Selecciona un servicio", { exact: true }).first().click();
      const service = page.getByPlaceholder(/Ejemplo: Redes e internet/);
      await service.fill("Desarrollo");
      await page.locator("#offer-service-options").getByRole("option").first().click();
      await page.locator('textarea[name="description"]').fill("Oferta publicada desde el formulario real por la regresión, con imagen, precio y cantidad.");
      await page.locator('input[type="file"]').setInputFiles({ name: "e2e-offer.png", mimeType: "image/png", buffer: ONE_PIXEL_PNG });
      // The picker decodes the file before it counts as attached; wait for the preview.
      await expect(page.locator('img[src^="blob:"]').first()).toBeVisible({ timeout: 15_000 });
      await page.locator('input[name="price_now"]').fill("45000");
      await page.locator('input[name="price_before"]').fill("60000");
      await page.locator('input[name="quantity_available"]').fill("3");
      await page.getByRole("button", { name: /^Publicar oferta$/ }).click();

      await page.waitForURL(/\/es\/ofertas\/[0-9a-f-]{36}/, { timeout: 45_000, waitUntil: "domcontentloaded" });
      created.offerId = page.url().match(/\/ofertas\/([0-9a-f-]{36})/)![1];
    }
    await expectVisibleText(page.locator("body"), offerTitle);
    await expectVisibleText(page.locator("body"), /45[\s.,]?000/);
    await expectHealthyPage(page);

    // Owner actions on the detail lead to the edit form with the saved values.
    const offerEditor = await openOwnerEditor(page, "Editar oferta", /\/ofertas\/[0-9a-f-]{36}\/editar/);
    await expect(offerEditor.locator('input[name="title"]')).toHaveValue(offerTitle);
    await offerEditor.locator('input[name="title"]').fill(`${offerTitle} editada`);
    await offerEditor.locator('input[name="price_now"]').fill("40000");
    await offerEditor.getByRole("button", { name: /^Guardar cambios$/ }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 45_000 });
    await page.waitForURL(/\/es\/ofertas\/[0-9a-f-]{36}(?:\?|$)/, { timeout: 45_000, waitUntil: "domcontentloaded" });
    await expectUpdatedDetail(page, `${offerTitle} editada`);
    await expectVisibleText(page.locator("body"), /40[\s.,]?000/);
    await expectHealthyPage(page);

    // Manager: pause, then publish again, with the status pill following along.
    await gotoOK(page, "/es/ofertas/mis-ofertas");
    const card = page.locator("article").filter({ hasText: `${offerTitle} editada` }).first();
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: new RegExp(`${offerTitle} editada`) }).first().click();
    await openItemActions(page, card);
    await chooseItemAction(card, /^Pausar$/);
    await expectVisibleText(card, /Pausada/);
    await openItemActions(page, card);
    await chooseItemAction(card, /^Publicar$/);
    await expectVisibleText(card, /Publicada/);
    await expectHealthyPage(page);
  });

  test("publishes a remote job from the form, edits it and closes the vacancy from the manager", async ({ page }) => {
    test.slow();
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);

    await gotoOK(page, "/es/empleos/publicar");
    await expectVisibleText(page.locator("body"), /Publicar empleo/);
    await page.locator('input[name="title"]').fill(jobTitle);
    // Employment type and experience keep their defaults; the workplace select
    // shows its current value ("Presencial") as its accessible name.
    await pickSelectMenu(page, /^Presencial$/, /^Remoto$/);
    await page.locator('textarea[name="description"]').fill("Empleo publicado desde el formulario real por la regresión para validar edición y cierre de vacante.");
    await page.getByLabel(/Responsabilidades 1/).fill("Completar el trabajo descrito");
    await page.getByLabel(/Requisitos 1/).fill("Experiencia demostrable");
    await page.locator('input[name="openings"]').fill("2");
    await page.getByRole("button", { name: /^Publicar empleo$/ }).click();

    await page.waitForURL(/\/es\/empleos\/[0-9a-f-]{36}/, { timeout: 45_000, waitUntil: "domcontentloaded" });
    created.jobId = page.url().match(/\/empleos\/([0-9a-f-]{36})/)![1];
    await expectVisibleText(page.locator("body"), jobTitle);
    await expectVisibleText(page.locator("body"), /Remoto/);
    await expectHealthyPage(page);

    const jobEditor = await openOwnerEditor(page, "Editar empleo", /\/empleos\/[0-9a-f-]{36}\/editar/);
    await expect(jobEditor.locator('input[name="title"]')).toHaveValue(jobTitle);
    await jobEditor.locator('input[name="title"]').fill(`${jobTitle} editado`);
    await jobEditor.locator('input[name="openings"]').fill("1");
    await jobEditor.getByRole("button", { name: /^Guardar cambios$/ }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 45_000 });
    await page.waitForURL(/\/es\/empleos\/[0-9a-f-]{36}(?:\?|$)/, { timeout: 45_000, waitUntil: "domcontentloaded" });
    await expectUpdatedDetail(page, `${jobTitle} editado`);
    await expectHealthyPage(page);

    await gotoOK(page, "/es/empleos/mis-empleos");
    const card = page.locator("article").filter({ hasText: `${jobTitle} editado` }).first();
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: new RegExp(`${jobTitle} editado`) }).first().click();
    await openItemActions(page, card);
    await chooseItemAction(card, /^Cerrar vacante$/);
    await expectVisibleText(card, /Cerrado/);
    await expectHealthyPage(page);

    // A closed vacancy is no longer on the public board.
    await gotoOK(page, "/es/empleos");
    await expect(page.getByText(`${jobTitle} editado`)).toHaveCount(0);
  });
});
