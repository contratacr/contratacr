import { expect, test } from "playwright/test";
import { expectHealthyPage, expectVisibleText, gotoOK, loginAs, resetAuth, waitForInteractivePage } from "./helpers";
import { canRunSeededRegression } from "./seed";
import { cleanupDisposableAccount, createDisposableAccount, type DisposableAccount } from "./disposable-account";

// Block A of docs/quality-roadmap.md: the account screens a person actually
// walks through — role choice, onboarding hand-off, profile completion and the
// recovery link — exercised on the real pages with disposable accounts.

function randomCedula() {
  // Nine digits, first digit 1-9: what detectIdType recognises as a cédula.
  const digits = String(Math.floor(Math.random() * 8) + 1) + String(Date.now()).slice(-8);
  return digits.slice(0, 9);
}

test.describe("@account screens through the real pages", () => {
  test("registration chooser offers the two roles and leads to their forms", async ({ page }) => {
    await resetAuth(page);
    await gotoOK(page, "/es/registro");
    await expectVisibleText(page.locator("body"), /Busco servicios/);
    await expectVisibleText(page.locator("body"), /Ofrezco servicios/);
    // Each role card is a link; the "Continuar" caption is part of the card.
    await page.getByRole("link", { name: /Busco servicios/ }).first().click();
    await page.waitForURL(/\/es\/registro\/cliente/, { waitUntil: "domcontentloaded" });
    await expectVisibleText(page.locator("body"), /Crear cuenta de cliente/);
    await expectHealthyPage(page);

    await gotoOK(page, "/es/registro");
    await page.getByRole("link", { name: /Ofrezco servicios/ }).first().click();
    await page.waitForURL(/\/es\/registro\/profesional/, { waitUntil: "domcontentloaded" });
    await expectHealthyPage(page);
  });

  test("recovery page without a valid link explains that the link expired", async ({ page }) => {
    await resetAuth(page);
    await gotoOK(page, "/es/reset-password");
    await waitForInteractivePage(page);
    await expectVisibleText(page.locator("body"), /El enlace puede haber expirado/);
    await expectHealthyPage(page);
  });

  test.describe("with a disposable client", () => {
    test.skip(!canRunSeededRegression(), "Requires the isolated test project.");
    let account: DisposableAccount | undefined;

    test.beforeEach(async () => {
      account = await createDisposableAccount({ prefix: "account-screens" });
    });

    test.afterEach(async () => {
      await cleanupDisposableAccount(account);
      account = undefined;
    });

    test("an existing account never sees the onboarding role cards again", async ({ page }) => {
      await loginAs(page, account!.email, account!.password);
      await gotoOK(page, "/es/onboarding");
      // The page resolves the account before rendering the cards and hands off
      // to the panel; the role question must not flash for someone who already chose.
      await page.waitForURL(/\/dashboard\//, { timeout: 30_000, waitUntil: "domcontentloaded" });
      await expect(page.getByText(/¿Para qué usarás ContrataCR\?/)).toHaveCount(0);
      await expectHealthyPage(page);
    });

    test("profile completion validates and saves name, phone and identification", async ({ page }) => {
      await loginAs(page, account!.email, account!.password);
      await gotoOK(page, "/es/completar-perfil");
      await expectVisibleText(page.locator("body"), /Completa tu perfil/);

      // Empty submit: the first missing field is named, nothing navigates.
      await page.getByPlaceholder(/Tu nombre como aparece en tu identificación/).fill("");
      await page.getByRole("button", { name: /Guardar y continuar/ }).click();
      await expectVisibleText(page.locator("body"), /Ingresa tu nombre completo/);

      await page.getByPlaceholder(/Tu nombre como aparece en tu identificación/).fill("Cliente Regresión Pantallas");
      await page.locator('input[type="tel"]').first().fill("88887777");
      await page.getByPlaceholder("1-0000-0000").fill(randomCedula());
      await page.getByRole("button", { name: /Guardar y continuar/ }).click();
      await page.waitForURL(/\/dashboard\//, { timeout: 30_000, waitUntil: "domcontentloaded" });
      await expectHealthyPage(page);
    });
  });
});
