import { expect, test } from "playwright/test";
import { apiJson, expectHealthyPage, expectVisibleText, gotoOK, loginAs } from "./helpers";
import { cleanupDisposableAccount, createDisposableAccount, type DisposableAccount } from "./disposable-account";
import { canRunSeededRegression, E2E_USERS, ensureRegressionSeed, regressionAdminClient, type RegressionSeedState } from "./seed";

test.describe.configure({ mode: "serial" });

test.describe("@seeded interaction surfaces", () => {
  test.skip(!canRunSeededRegression(), "Set E2E_FIXTURES_READY=1 with the test Supabase secrets to run interaction regression.");

  let seed: RegressionSeedState;

  test.beforeAll(async () => {
    seed = await ensureRegressionSeed();
  });

  // Las citas salieron del menú y de la ficha: ya no hay botón «Ver
  // disponibilidad». La pantalla de reservar sigue viva y con su propia
  // dirección, y eso es lo que se comprueba aquí.
  test("booking screen still opens by its own address without submitting", async ({ page }) => {
    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    await gotoOK(page, `/es/profesionales/${seed.professionalSlug}/reservar`);

    await expectVisibleText(
      page.locator("body"),
      /Que servicio necesitas|Qu. servicio necesitas|Elige fecha y hora|Describe lo que necesitas|Reservar cita|Request service|Tu identificaci.n|Your identification/i,
    );
    await expectHealthyPage(page);
  });

  test("create project modal opens from client projects without submitting", async ({ page }) => {
    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    await gotoOK(page, "/es/dashboard/profesional?tab=sent_projects");

    const publish = page.getByRole("button", { name: /Publicar proyecto|Post a project|Crear/i }).first();
    await expect(publish).toBeVisible();
    await publish.click();

    // La ventana se llama por su título, que hoy es «Cuéntanos qué necesitas».
    const dialog = page.getByRole("dialog", { name: /Cu.ntanos qu. necesitas|Tell us what you need|Crear (?:un )?proyecto|Create a project/i });
    await expect(dialog).toBeVisible();
    await expectVisibleText(
      dialog,
      // El formulario se simplificó: ahora pregunta qué necesitas, qué hay que
      // hacer y dónde, en lenguaje llano.
      /.Qu. necesitas\?|What do you need\?|Contanos qu. hay que hacer|Tell us what needs doing|.D.nde\?|Where\?|T.tulo|Descripci.n|Provincia|Cant.n/i,
    );
    const submit = dialog.getByRole("button", { name: /Publicar|Publish/i });
    await expect(submit).toBeEnabled();
    await submit.click();
    // Lo que falta se avisa JUNTO AL CAMPO (el servicio es lo primero que el
    // formulario pide); la franja roja de abajo queda para los errores que no
    // pertenecen a un campo concreto.
    const validationNotice = dialog.getByTestId("category-field-error").or(dialog.getByTestId("project-form-error")).first();
    await expect(validationNotice).toBeVisible();
    await expect(validationNotice).toContainText(/categor.a|category|servicio|service/i);
    const [noticeBox, submitBox] = await Promise.all([validationNotice.boundingBox(), submit.boundingBox()]);
    expect(noticeBox, "The project validation notice needs visible geometry").not.toBeNull();
    expect(submitBox, "The project submit action needs visible geometry").not.toBeNull();
    expect(noticeBox!.y + noticeBox!.height).toBeLessThanOrEqual(submitBox!.y + 1);
    await expectHealthyPage(page);
  });

  // Guardar en la ficha profesional: botón propio donde hay sitio, opción del
  // «...» donde no. Devuelve cuando el gesto ya se disparó.
  async function alternarGuardado(page: import("playwright/test").Page) {
    const boton = page.locator("[data-save-button]").filter({ visible: true }).first();
    const opciones = page.getByRole("button", { name: /^(Options|Opciones|More|Más|Más opciones|More options)$/i }).filter({ visible: true }).first();
    // Esperar a que aparezca UNO de los dos antes de decidir: `count()` no
    // espera, y con la ficha todavía cargando daba 0 y la prueba se iba a
    // buscar el «···» del teléfono en computadora (15 s colgada, a veces).
    await expect(boton.or(opciones)).toBeVisible({ timeout: 15_000 });
    if (await boton.count()) {
      const antes = await boton.getAttribute("aria-pressed");
      await boton.click();
      await expect(boton).not.toHaveAttribute("aria-pressed", antes ?? "false");
      return;
    }
    await page.getByRole("button", { name: /^(Options|Opciones|More|Más|Más opciones|More options)$/i }).filter({ visible: true }).first().click();
    await page.getByRole("menuitem", { name: /Save|Saved|Guardar|Guardado/i }).first().click();
  }

  test("favorite actions persist, render and remove for a disposable client", async ({ page }) => {
    // Seguir se retiró del producto en 553536d1: guardar quedó como el único
    // gesto de «lo quiero a mano», y esta prueba lo cubre de punta a punta.
    const admin = regressionAdminClient();
    let account: DisposableAccount | undefined;
    try {
      account = await createDisposableAccount({ prefix: "save-only" });
      await loginAs(page, account.email, account.password);
      await gotoOK(page, `/en/profesionales/${seed.professionalSlug}`);

      // Guardar vive en dos sitios según el ancho: botón propio en la ficha de
      // computadora, y opción del «...» en el teléfono, donde comparte hoja con
      // Compartir y Reportar. La prueba usa el que esté a la vista.
      await alternarGuardado(page);
      await expect.poll(async () => {
        const { count } = await admin.from("saved_professionals").select("id", { count: "exact", head: true })
          .eq("client_id", account!.id).eq("professional_id", seed.professionalId);
        return count ?? 0;
      }).toBe(1);
      // Y no revive el gesto retirado.
      await expect(page.locator("[data-follow-button]")).toHaveCount(0);

      await gotoOK(page, "/en/dashboard/profesional?tab=saved&mode=use");
      await expect(page.getByText(/Redes Bahía/i).first()).toBeVisible();

      await gotoOK(page, `/en/profesionales/${seed.professionalSlug}`);
      await alternarGuardado(page);
      await expect.poll(async () => {
        const { count } = await admin.from("saved_professionals").select("id", { count: "exact", head: true })
          .eq("client_id", account!.id);
        return count ?? 0;
      }).toBe(0);
      await expectHealthyPage(page);
    } finally {
      await cleanupDisposableAccount(account);
    }
  });

  test("empty favorites keep the type filters in English", async ({ page }) => {
    let account: DisposableAccount | undefined;
    try {
      account = await createDisposableAccount({ prefix: "empty-saved" });
      await loginAs(page, account.email, account.password);
      await gotoOK(page, "/en/dashboard/profesional?tab=saved&mode=use");

      for (const label of [/^Professionals ?0?$/i, /^Promotions ?0?$/i, /^Jobs ?0?$/i]) {
        await expect(page.getByRole("button", { name: label }).filter({ visible: true }).first()).toBeVisible();
      }
      await expect(page.getByRole("button", { name: /^All(?: 0)?$/i })).toHaveCount(0);
      await expectHealthyPage(page);
    } finally {
      await cleanupDisposableAccount(account);
    }
  });
});
