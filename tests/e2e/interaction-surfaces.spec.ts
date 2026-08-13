import { expect, test } from "playwright/test";
import { expectHealthyPage, expectVisibleText, gotoOK, loginAs } from "./helpers";
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

  test("create project modal opens from client projects without submitting", async ({ page }) => {
    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    await gotoOK(page, "/es/dashboard/profesional?tab=sent_projects");

    const publish = page.getByRole("button", { name: /Crear un proyecto|Crear|Create a project|Create/i }).first();
    await expect(publish).toBeVisible();
    await publish.click();

    const dialog = page.getByRole("dialog", { name: /Crear (?:un )?proyecto|Create a project/i });
    await expect(dialog).toBeVisible();
    await expectVisibleText(
      dialog,
      /Titulo|T.tulo|Servicio|Descripcion|Descripci.n|Provincia|Canton|Cant.n|Cuando lo necesitas|Cu.ndo lo necesitas/i,
    );
    await expectHealthyPage(page);
  });

  test("favorite and follow actions persist, render and remove for a disposable client", async ({ page }) => {
    const admin = regressionAdminClient();
    let account: DisposableAccount | undefined;
    try {
      account = await createDisposableAccount({ prefix: "save-follow" });
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

      const follow = page.getByRole("button", { name: /^Follow$/i }).filter({ visible: true }).first();
      await expect(follow).toHaveAttribute("aria-pressed", "false");
      await follow.click();
      await expect(follow).toHaveAttribute("aria-pressed", "true");
      await expect.poll(async () => {
        const { count } = await admin.from("professional_follows").select("id", { count: "exact", head: true })
          .eq("follower_id", account!.id).eq("professional_id", seed.professionalId);
        return count ?? 0;
      }).toBe(1);

      await gotoOK(page, "/en/dashboard/profesional?tab=saved&mode=use");
      await expect(page.getByText(/SG Solutions/i).first()).toBeVisible();
      await gotoOK(page, "/en/dashboard/profesional?tab=network&mode=use");
      await expect(page.getByText(/SG Solutions/i).first()).toBeVisible();

      await gotoOK(page, `/en/profesionales/${seed.professionalSlug}`);
      await page.locator("[data-save-button]:visible").first().click();
      await page.getByRole("button", { name: /^Following$/i }).filter({ visible: true }).first().click();
      await expect.poll(async () => {
        const [{ count: favorites }, { count: follows }] = await Promise.all([
          admin.from("saved_professionals").select("id", { count: "exact", head: true }).eq("client_id", account!.id),
          admin.from("professional_follows").select("id", { count: "exact", head: true }).eq("follower_id", account!.id),
        ]);
        return { favorites: favorites ?? 0, follows: follows ?? 0 };
      }).toEqual({ favorites: 0, follows: 0 });
      await expectHealthyPage(page);
    } finally {
      if (account) {
        // Following creates a cross-account notification for SG Solutions.
        // It has no FK to the disposable follower, so remove that exact JSON
        // reference before deleting the temporary account.
        await regressionAdminClient()
          .from("notifications")
          .delete()
          .contains("data", { follower_id: account.id });
      }
      await cleanupDisposableAccount(account);
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
