import { expect, test } from "playwright/test";
import { expectHealthyPage, expectVisibleText, gotoOK, loginAs } from "./helpers";
import { canRunSeededRegression, E2E_USERS, ensureRegressionSeed, type RegressionSeedState } from "./seed";

test.describe.configure({ mode: "serial" });

test.describe("@seeded interaction surfaces", () => {
  test.skip(!canRunSeededRegression(), "Set E2E_SEED=1 with the test Supabase secrets to run interaction regression.");

  let seed: RegressionSeedState;

  test.beforeAll(async () => {
    seed = await ensureRegressionSeed();
  });

  test("booking flow opens from a professional profile without submitting", async ({ page }) => {
    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    await gotoOK(page, `/es/profesionales/${seed.professionalSlug}`);

    const action = page.getByRole("button", { name: seed.slotTime }).first();
    await expect(action).toBeVisible();
    await action.click();

    const dialog = page.getByRole("dialog").first();
    await expect(dialog).toBeVisible();
    await expectVisibleText(
      dialog,
      /Que servicio necesitas|Qu. servicio necesitas|Elige fecha y hora|Describe lo que necesitas|Request service|Tu identificaci.n|Your identification/i,
    );
    await expectHealthyPage(page);
  });

  test("publish request modal opens from client publications without submitting", async ({ page }) => {
    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    await gotoOK(page, "/es/dashboard/profesional?tab=sent_projects");

    const publish = page.getByRole("button", { name: /Publicar una solicitud|Publicar|Post a request|Post/i }).first();
    await expect(publish).toBeVisible();
    await publish.click();

    const dialog = page.getByRole("dialog", { name: /Publicar una solicitud|Post a request/i });
    await expect(dialog).toBeVisible();
    await expectVisibleText(
      dialog,
      /Titulo|T.tulo|Servicio|Descripcion|Descripci.n|Provincia|Canton|Cant.n|Cuando lo necesitas|Cu.ndo lo necesitas/i,
    );
    await expectHealthyPage(page);
  });
});
