import { test, expect } from "playwright/test";
import { gotoOK, loginAs, expectNoHorizontalOverflow } from "./helpers";
import { createDisposableAccount, cleanupDisposableAccount } from "./disposable-account";
import { canRunSeededRegression, regressionAdminClient } from "./seed";

test.describe("client and professional identity", () => {
  test.skip(!canRunSeededRegression(), "Requires an isolated regression database.");
  for (const professional of [false, true]) {
    test(`${professional ? "professional" : "client"} badge and required project identity`, async ({ page }) => {
      const account = await createDisposableAccount({ prefix: "project-identity", professional });
      const db = regressionAdminClient();
      try {
        await db.from("profiles").update({ phone: "+50670009999", cedula: null, client_identity_status: "unverified" }).eq("id", account.id).throwOnError();
        await loginAs(page, account.email, account.password);
        const { data: category } = await db.from("categories").select("id").eq("is_hidden", false).limit(1).single();
        expect(category?.id).toBeTruthy();
        // Both UI and server reject omission; no external lookup is needed.
        const missing = await page.request.post("/api/projects", { data: { categoryId: category!.id, description: "Necesito reparar una puerta", phone: "+50670009999" } });
        expect(missing.status()).toBe(400);
        expect((await missing.json()).error).toContain("identificación");
        await gotoOK(page, `/publicar-proyecto?categoria=${category!.id}`);
        const identification = page.locator("#cedula-del-proyecto");
        await expect(identification).toBeVisible();
        await expect(page.locator('label[for="cedula-del-proyecto"]')).toContainText("*");
        await page.locator("textarea").fill("Necesito reparar una puerta");
        await page.locator('button[type="submit"]').click();
        await expect(identification).toHaveAttribute("aria-invalid", "true");
        await expect(page.getByTestId("project-form-error")).toContainText("Ingresá un número de identificación válido.");
        await expectNoHorizontalOverflow(page);
        await page.screenshot({ path: test.info().outputPath("project-identification-required.png"), fullPage: true });
        // All supported types show the client badge without a professional record.
        for (const cedula of ["208060421", "3101234567", "155801373125", "5001234567"]) {
          await db.from("profiles").update({ cedula, client_identity_status: "verified" }).eq("id", account.id).throwOnError();
          await gotoOK(page, "/dashboard/profesional?tab=home&mode=use");
          const name = page.locator("h1").filter({ visible: true }).first();
          const badge = name.locator("..").locator("[data-verification-badge]");
          await expect(badge).toBeVisible();
          await badge.click();
          const dialog = page.getByRole("dialog");
          await expect(dialog).toContainText(professional ? "no garantiza la calidad del trabajo" : "No garantiza pagos ni contrataciones");
          await expect(dialog).not.toContainText(/Hacienda/);
          if (!professional) await expect(dialog).not.toContainText(/certificaciones|calidad del trabajo/);
          await expectNoHorizontalOverflow(page);
          await page.screenshot({ path: test.info().outputPath(`${professional ? "professional" : "client"}-${cedula.length}-${cedula[0]}-badge.png`), fullPage: true });
          await dialog.getByRole("button", { name: "Entendido", exact: true }).click();
        }
        await gotoOK(page, `/publicar-proyecto?categoria=${category!.id}`);
        await expect(page.locator('input[type="tel"]').first()).toHaveValue(/7000/);
        await expect(page.locator("#cedula-del-proyecto")).toHaveCount(0);
        await page.locator("textarea").fill("Necesito reparar una puerta — prueba aislada");
        const [published] = await Promise.all([
          page.waitForResponse(response => response.url().endsWith("/api/projects") && response.request().method() === "POST"),
          page.locator('button[type="submit"]').click(),
        ]);
        expect(published.status()).toBe(200);
        expect((await published.json()).clientIdentityStatus).toBe("verified");
        await page.screenshot({ path: test.info().outputPath("project-published-with-saved-identity.png"), fullPage: true });
        if (professional) {
          await db.from("professionals").update({ is_verified: true, verification_status: "verified" }).eq("id", account.professionalId!).throwOnError();
          await gotoOK(page, "/dashboard/profesional?tab=home&mode=offer");
          const name = page.locator("h1").filter({ visible: true }).first();
          await name.locator("..").locator("[data-verification-badge]").click();
          await expect(page.getByRole("dialog")).toContainText("no garantiza la calidad del trabajo");
          await expect(page.getByRole("dialog")).not.toContainText("No garantiza pagos ni contrataciones");
          await page.screenshot({ path: test.info().outputPath("professional-badge.png"), fullPage: true });
        }
      } finally {
        await cleanupDisposableAccount(account);
      }
    });
  }
});
