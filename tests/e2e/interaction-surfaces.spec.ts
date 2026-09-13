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

  test("booking flow opens from a professional profile without submitting", async ({ page }) => {
    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    await gotoOK(page, `/es/profesionales/${seed.professionalSlug}`);

    const action = page.getByRole("button", { name: /Ver disponibilidad|View availability/i }).first();
    await expect(action).toBeVisible();
    await action.click();

    // Reservar es una PANTALLA con su propia dirección (…/reservar?fecha&hora),
    // no un modal: así la persona puede volver, compartir el enlace y no pierde
    // el paso si la app se recarga.
    await page.waitForURL(/\/profesionales\/[^/]+\/reservar\?/, { timeout: 30_000, waitUntil: "domcontentloaded" });
    await expectVisibleText(
      page.locator("body"),
      /Que servicio necesitas|Qu. servicio necesitas|Elige fecha y hora|Describe lo que necesitas|Reservar cita|Request service|Tu identificaci.n|Your identification/i,
    );
    await expectHealthyPage(page);
  });

  test("create project modal opens from client projects without submitting", async ({ page }) => {
    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    await gotoOK(page, "/es/dashboard/profesional?tab=sent_projects");

    const publish = page.getByRole("button", { name: /Crear un proyecto|Crear|Create a project|Create/i }).first();
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

  test("favorite actions persist, render and remove for a disposable client", async ({ page }) => {
    // Seguir se retiró del producto en 553536d1: guardar quedó como el único
    // gesto de «lo quiero a mano», y esta prueba lo cubre de punta a punta.
    const admin = regressionAdminClient();
    let account: DisposableAccount | undefined;
    try {
      account = await createDisposableAccount({ prefix: "save-only" });
      await loginAs(page, account.email, account.password);
      await gotoOK(page, `/en/profesionales/${seed.professionalSlug}`);

      const favorite = page.locator("[data-save-button]:visible").first();
      await expect(favorite).toHaveAttribute("aria-pressed", "false");
      await favorite.click();
      await expect(favorite).toHaveAttribute("aria-pressed", "true");
      await expect.poll(async () => {
        const { count } = await admin.from("saved_professionals").select("id", { count: "exact", head: true })
          .eq("client_id", account!.id).eq("professional_id", seed.professionalId);
        return count ?? 0;
      }).toBe(1);
      // Y no revive el gesto retirado.
      await expect(page.locator("[data-follow-button]")).toHaveCount(0);

      await gotoOK(page, "/en/dashboard/profesional?tab=saved&mode=use");
      await expect(page.getByText(/SG Solutions/i).first()).toBeVisible();

      await gotoOK(page, `/en/profesionales/${seed.professionalSlug}`);
      await page.locator("[data-save-button]:visible").first().click();
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

  test("the followers endpoint only lets a professional remove their own follower", async ({ page }) => {
    // La pantalla de seguidores salió del panel con el gesto de Seguir
    // (553536d1), pero el endpoint sigue vivo para las cuentas que ya tenían
    // relaciones: lo que hay que sostener es que NADIE pueda borrar una
    // relación ajena.
    const admin = regressionAdminClient();
    let owner: DisposableAccount | undefined;
    let follower: DisposableAccount | undefined;
    try {
      owner = await createDisposableAccount({ prefix: "remove-follower-owner", professional: true });
      follower = await createDisposableAccount({ prefix: "remove-follower-source", professional: true });
      const { data: relation, error: relationError } = await admin
        .from("professional_follows")
        .insert({ follower_id: follower.id, professional_id: owner.professionalId! })
        .select("id")
        .single();
      if (relationError || !relation) throw relationError ?? new Error("Could not create disposable follower relation");
      const { data: foreignRelation, error: foreignRelationError } = await admin
        .from("professional_follows")
        .insert({ follower_id: owner.id, professional_id: follower.professionalId! })
        .select("id")
        .single();
      if (foreignRelationError || !foreignRelation) {
        throw foreignRelationError ?? new Error("Could not create foreign ownership guard relation");
      }

      await loginAs(page, owner.email, owner.password);

      // Una relación de la que no se es dueño se rechaza sin tocar nada.
      const foreignDelete = await apiJson<{ success?: boolean; removed?: boolean }>(page, "/api/professional-followers", {
        method: "DELETE",
        body: { followId: foreignRelation.id },
      });
      expect(foreignDelete.status).toBe(200);
      expect(foreignDelete.body).toMatchObject({ success: true, removed: false });
      const { count: foreignRelationCount } = await admin
        .from("professional_follows")
        .select("id", { count: "exact", head: true })
        .eq("id", foreignRelation.id);
      expect(foreignRelationCount).toBe(1);

      // La propia sí se retira.
      const ownDelete = await apiJson<{ success?: boolean; removed?: boolean }>(page, "/api/professional-followers", {
        method: "DELETE",
        body: { followId: relation.id },
      });
      expect(ownDelete.status).toBe(200);
      expect(ownDelete.body).toMatchObject({ success: true, removed: true });
      await expect.poll(async () => {
        const { count } = await admin
          .from("professional_follows")
          .select("id", { count: "exact", head: true })
          .eq("id", relation.id);
        return count ?? 0;
      }).toBe(0);
      await admin.from("professional_follows").delete().eq("id", foreignRelation.id);
    } finally {
      if (owner) {
        await admin.from("notifications").delete().contains("data", { follower_id: owner.id });
      }
      if (follower) {
        await admin.from("notifications").delete().contains("data", { follower_id: follower.id });
      }
      await cleanupDisposableAccount(follower);
      await cleanupDisposableAccount(owner);
    }
  });

  test("empty favorites keep Professionals, Offers and Jobs filters in English", async ({ page }) => {
    let account: DisposableAccount | undefined;
    try {
      account = await createDisposableAccount({ prefix: "empty-saved" });
      await loginAs(page, account.email, account.password);
      await gotoOK(page, "/en/dashboard/profesional?tab=saved&mode=use");

      for (const label of [/^Professionals(?: 0)?$/i, /^Offers(?: 0)?$/i, /^Jobs(?: 0)?$/i]) {
        await expect(page.getByRole("button", { name: label }).filter({ visible: true }).first()).toBeVisible();
      }
      await expect(page.getByRole("button", { name: /^All(?: 0)?$/i })).toHaveCount(0);
      await expectHealthyPage(page);
    } finally {
      await cleanupDisposableAccount(account);
    }
  });
});
