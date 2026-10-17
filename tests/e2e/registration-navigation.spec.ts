import { test, expect } from "playwright/test";
import { cleanupDisposableAccount, createDisposableAccount } from "./disposable-account";
import { canRunSeededRegression, regressionAdminClient } from "./seed";
import { loginAs } from "./helpers";
import { registrationComplete, pendingRegistrationPath } from "../../src/lib/auth/registration-state";

test("explicit pending registration wins over a stale completed profile", () => {
  expect(registrationComplete({ onboarding_completed: false }, true)).toBe(false);
  expect(registrationComplete({}, true)).toBe(true);
  expect(registrationComplete({ onboarding_completed: true }, false)).toBe(true);
  expect(pendingRegistrationPath({ role: "client" })).toBe("/registro/cliente");
  expect(pendingRegistrationPath({ role: "client", intended_role: "professional" })).toBe("/registro/profesional");
  expect(pendingRegistrationPath({})).toBe("/onboarding");
});

for (const locale of ["es", "en"] as const) {
  for (const role of ["client", "professional"] as const) {
    test(`${locale} ${role}: incomplete social identity cannot bypass registration with Back, reload or a panel link`, async ({ page }) => {
      test.skip(!canRunSeededRegression(), "Requires isolated regression data.");
      const account = await createDisposableAccount({ prefix: `registration-back-${role}` });
      const admin = regressionAdminClient();
      const prefix = locale === "en" ? "/en" : "";
      const formPath = `${prefix}/registro/${role === "client" ? "cliente" : "profesional"}`;
      try {
        await loginAs(page, account.email, account.password);
        await page.goto(`${prefix}/como-funciona`);
        // Reproduce a connected Google/Apple identity with no completed signup.
        // Keep the old profile flag true to exercise the disagreeing-source bug.
        const { error } = await admin.auth.admin.updateUserById(account.id, {
          user_metadata: { onboarding_completed: false, role: "client", intended_role: role === "professional" ? "professional" : null },
        });
        expect(error).toBeNull();
        await page.goto(formPath);
        await expect(page).toHaveURL(new RegExp(`${formPath}$`));
        await expect(page.getByRole("button", { name: /Guardar y continuar|Save and continue|Continuar|Continue/, exact: true }).first()).toBeVisible();
        await page.reload();
        await expect(page).toHaveURL(new RegExp(`${formPath}$`));
        // A real browser Back can restore the old completed panel from history.
        await page.goBack();
        await page.goBack();
        await expect(page).toHaveURL(new RegExp(`${formPath}$`), { timeout: 30_000 });
        await page.goto(`${prefix}/dashboard/profesional?tab=cuenta`);
        await expect(page).toHaveURL(new RegExp(`${formPath}$`));
        await page.goto(`${prefix}/onboarding`);
        await expect(page).toHaveURL(new RegExp(`${formPath}$`));
        const state = await admin.auth.admin.getUserById(account.id);
        expect(state.data.user?.user_metadata.onboarding_completed).toBe(false);
        const profile = await admin.from("profiles").select("phone").eq("id", account.id).single();
        expect(profile.data?.phone).toBeFalsy();
        if (role === "client") {
          await page.locator('input[type="tel"]').fill("88887777");
          await page.getByRole("checkbox").check({ force: true });
          await page.getByRole("button", { name: /Guardar y continuar|Save and continue/, exact: true }).click();
          await expect.poll(async () => (await admin.auth.admin.getUserById(account.id)).data.user?.user_metadata.onboarding_completed).toBe(true);
          await page.goto(`${prefix}/dashboard/profesional`);
          await expect(page).toHaveURL(/\/dashboard\/profesional/);
          await page.reload();
          await expect(page).toHaveURL(/\/dashboard\/profesional/);
        }
      } finally { await cleanupDisposableAccount(account); }
    });
  }
}
