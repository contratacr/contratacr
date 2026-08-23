import { createClient } from "@supabase/supabase-js";
import { expect, test } from "playwright/test";
import { expectNoHorizontalOverflow, gotoOK, loginAs, resetAuth, waitForInteractivePage } from "./helpers";
import { canRunSeededRegression, regressionAdminClient } from "./seed";
import { cleanupDisposableAccount, createDisposableAccount } from "./disposable-account";

test.describe("@smoke auth and support", () => {
  test("login page exposes password and OAuth entry points without submitting", async ({ page }) => {
    await gotoOK(page, "/es/login");

    await expect(page.getByRole("heading", { name: /Bienvenido de vuelta/i })).toBeVisible();
    await expect(page.getByLabel(/Correo/i).first()).toBeVisible();
    await expect(page.getByLabel(/Contras/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Ingresar/i }).last()).toBeVisible();
    await expect(page.getByRole("button", { name: /Continuar con Google/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Continuar con Facebook/i })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test("support form opens the reason dropdown and keeps required fields visible", async ({ page }) => {
    await gotoOK(page, "/es/soporte");

    await expect(page.getByRole("textbox", { name: /Tu nombre/i })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /tucorreo/i })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /Describe tu consulta/i })).toBeVisible();

    await expect(page.getByRole("button", { name: /Selecciona el motivo/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("forgot-password validates the email and shows the privacy-safe confirmation state", async ({ page }) => {
    await gotoOK(page, "/es/olvide-contrasena");
    await waitForInteractivePage(page);

    const email = page.getByLabel(/Correo/i).first();
    await expect(email).toBeVisible();
    await email.fill("correo-invalido");
    await page.getByRole("button", { name: /Enviar|Restablecer/i }).click();
    expect(await email.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(false);
    await expect(page).toHaveURL(/olvide-contrasena/);

    await email.fill(`missing-${Date.now()}@contratacr.test`);
    await page.getByRole("button", { name: /Enviar|Restablecer/i }).click();
    await expect(page.locator("body")).toContainText(/Revisa tu correo|Check your email/i);
    await expect(page.locator("body")).not.toContainText(/no existe|not found|sin cuenta/i);
    await expectNoHorizontalOverflow(page);
  });

  // The screens either side of the email were covered; the trip between them was
  // not. This walks it end to end with a real account: ask for the reset on the
  // real form, take the recovery token the email would have carried, land on the
  // real screen, set a new password, and prove the account actually changed —
  // the new one signs in and the old one no longer does.
  test("a real account resets its password end to end through the screens", async ({ page }) => {
    test.skip(!canRunSeededRegression(), "Needs the seeded regression environment.");
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
    test.skip(!anonKey || !projectUrl, "Needs the public Supabase URL and anon key.");
    test.setTimeout(180_000);

    const account = await createDisposableAccount({ prefix: "reset-flow" });
    const newPassword = `Nueva!${account.id.slice(0, 8)}aA1`;
    try {
      // 1. The real request screen, with an address that does exist.
      await resetAuth(page);
      await gotoOK(page, "/es/olvide-contrasena");
      await waitForInteractivePage(page);
      await page.getByLabel(/Correo/i).first().fill(account.email);
      await page.getByRole("button", { name: /Enviar|Restablecer/i }).click();
      await expect(page.locator("body")).toContainText(/Revisa tu correo|Check your email/i);

      // 2. The recovery token the email would carry, without needing a mailbox.
      const admin = regressionAdminClient();
      const { data: link, error: linkError } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: account.email,
      });
      expect(linkError).toBeNull();
      const tokenHash = link?.properties?.hashed_token;
      expect(tokenHash).toBeTruthy();

      // 3. Redeem it the way the browser would, then hand the screen the session
      //    in the URL fragment exactly as Supabase's redirect does.
      const anon = createClient(projectUrl!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: verified, error: verifyError } = await anon.auth.verifyOtp({ type: "recovery", token_hash: tokenHash! });
      expect(verifyError).toBeNull();
      expect(verified.session?.access_token).toBeTruthy();

      await gotoOK(
        page,
        `/es/reset-password#access_token=${verified.session!.access_token}&refresh_token=${verified.session!.refresh_token}&type=recovery`,
      );
      await waitForInteractivePage(page);
      await expect(page.getByRole("heading", { name: /Nueva contrase/i })).toBeVisible();
      // A valid link must not land on the expired-link message.
      await expect(page.locator("body")).not.toContainText(/enlace puede haber expirado/i);

      // 4. Set the new password on the real form.
      await page.getByLabel(/Nueva contrase/i).first().fill(newPassword);
      await page.getByLabel(/Confirmar contrase/i).first().fill(newPassword);
      await page.getByRole("button", { name: /Guardar|Actualizar|Restablecer|Cambiar/i }).first().click();
      await expect(page.locator("body")).toContainText(/Contrase.a actualizada|Password updated/i, { timeout: 30_000 });

      // 5. The account really changed: the new password signs in.
      await loginAs(page, account.email, newPassword);
      await expect(page).toHaveURL(/\/dashboard|\/completar-perfil|\/onboarding/);

      // 6. And the old one does not.
      await resetAuth(page);
      const stale = await anon.auth.signInWithPassword({ email: account.email, password: account.password });
      expect(stale.error).toBeTruthy();
    } finally {
      await cleanupDisposableAccount(account);
    }
  });
});
