import type { User } from "@supabase/supabase-js";
import { freshestAuthUser } from "../../src/lib/auth/fresh-user";
import { test, expect, type Page } from "playwright/test";
import { cleanupDisposableAccount, createDisposableAccount } from "./disposable-account";
import { canRunSeededRegression, regressionAdminClient } from "./seed";
import { loginAs } from "./helpers";
import { registrationComplete, pendingRegistrationPath, registrationIntentMatches } from "../../src/lib/auth/registration-state";

// A guard's full redirect is the expected result of these forbidden visits.
// WebKit can report that redirect as an interrupted goto even before commit.
// Accept only interruption to this exact registration URL, then independently
// require both that URL and the form. Do not retry the forbidden navigation.
async function visitWhilePending(page: Page, path: string, formPath: string) {
  const destination = new URL(formPath, page.url()).href;
  try { await page.goto(path, { waitUntil: "commit" }); }
  catch (error) {
    if (!(error instanceof Error) || !error.message.includes(`is interrupted by another navigation to "${destination}"`)) throw error;
  }
  await expect(page).toHaveURL(new RegExp(`${formPath}$`));
  await expect(page.getByRole("button", { name: /Guardar y continuar|Save and continue|Continuar|Continue/, exact: true }).first()).toBeVisible();
}

test("explicit pending registration wins over a stale completed profile", () => {
  const old = { app_metadata: {}, aud: "authenticated", created_at: "2026-10-17T09:00:00Z", id: "same-account", updated_at: "2026-10-17T10:00:00Z", user_metadata: { onboarding_completed: true } } as User;
  const fresh = { ...old, updated_at: "2026-10-17T11:00:00Z", user_metadata: { onboarding_completed: false } };
  expect(freshestAuthUser(old, fresh)).toBe(fresh);
  expect(freshestAuthUser(fresh, old)).toBe(fresh);
  expect(freshestAuthUser(null, fresh)).toBeNull();
  expect(freshestAuthUser({ ...old, id: "different-account" }, fresh)?.id).toBe("different-account");
  expect(registrationIntentMatches({ role: "client", onboarding_completed: false }, "client")).toBe(true);
  expect(registrationIntentMatches({ role: "client", onboarding_completed: false, intended_role: null }, "client")).toBe(true);
  expect(registrationIntentMatches({ role: "client", onboarding_completed: false, intended_role: "professional" }, "client")).toBe(false);
  expect(registrationComplete({ onboarding_completed: false }, true)).toBe(false);
  expect(registrationComplete({}, true)).toBe(true);
  expect(registrationComplete({ onboarding_completed: true }, false)).toBe(false);
  expect(registrationComplete({ onboarding_completed: true }, true)).toBe(true);
  expect(pendingRegistrationPath({ role: "client" })).toBe("/registro/cliente");
  expect(pendingRegistrationPath({ role: "client", intended_role: "professional" })).toBe("/registro/profesional");
  expect(pendingRegistrationPath({})).toBe("/onboarding");
});

for (const [pendingSource, metadataComplete, profileComplete] of [["session", false, true], ["profile", true, false]] as const) {
for (const locale of ["es", "en"] as const) {
  for (const role of ["client", "professional"] as const) {
    test(`${pendingSource} pending, ${locale} ${role}: incomplete social identity cannot bypass registration with Back, reload or a panel link`, async ({ page }) => {
      test.skip(!canRunSeededRegression(), "Requires isolated regression data.");
      await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
      const account = await createDisposableAccount({ prefix: `registration-back-${role}` });
      const admin = regressionAdminClient();
      const prefix = locale === "en" ? "/en" : "";
      const formPath = `${prefix}/registro/${role === "client" ? "cliente" : "profesional"}`;
      try {
        await loginAs(page, account.email, account.password);
        await page.goto(`${prefix}/como-funciona`);
        // Reproduce a connected Google/Apple identity with no completed signup.
        // Exercise both disagreement directions, including legacy OAuth accounts.
        const { error } = await admin.auth.admin.updateUserById(account.id, {
          user_metadata: { onboarding_completed: metadataComplete, role: "client", intended_role: role === "professional" ? "professional" : null },
        });
        expect(error).toBeNull();
        const savedProfile = await admin.from("profiles").update({ onboarding_completed: profileComplete, phone: null }).eq("id", account.id);
        expect(savedProfile.error).toBeNull();
        await page.goto(formPath);
        await expect(page).toHaveURL(new RegExp(`${formPath}$`));
        await expect(page.getByRole("button", { name: /Guardar y continuar|Save and continue|Continuar|Continue/, exact: true }).first()).toBeVisible();
        await page.reload();
        await expect(page).toHaveURL(new RegExp(`${formPath}$`));
        const pendingState = await page.request.get("/api/auth/registration-state");
        expect(pendingState.status()).toBe(200);
        expect((await pendingState.json()).complete).toBe(false);
        // A real browser Back can restore the old completed panel from history.
        await page.goBack({ waitUntil: "load" });
        await page.goBack({ waitUntil: "commit" });
        await expect(page).toHaveURL(new RegExp(`${formPath}$`), { timeout: 30_000 });
        await visitWhilePending(page, `${prefix}/dashboard/profesional?tab=cuenta`, formPath);
        await expect(page).toHaveURL(new RegExp(`${formPath}$`));
        await visitWhilePending(page, `/auth/callback?flow=native&locale=${locale}`, formPath);
        await expect(page).toHaveURL(new RegExp(`${formPath}$`));
        await visitWhilePending(page, `/auth/callback?flow=native&locale=${locale}&next=${encodeURIComponent(`${prefix}/dashboard/profesional`)}`, formPath);
        await expect(page).toHaveURL(new RegExp(`${formPath}$`));
        await visitWhilePending(page, `${prefix}/onboarding`, formPath);
        await expect(page).toHaveURL(new RegExp(`${formPath}$`));
        const state = await admin.auth.admin.getUserById(account.id);
        const profile = await admin.from("profiles").select("phone,onboarding_completed").eq("id", account.id).single();
        expect(registrationComplete(state.data.user?.user_metadata, profile.data?.onboarding_completed)).toBe(false);
        expect(profile.data?.phone).toBeFalsy();
        const serverState = await page.request.get("/api/auth/registration-state");
        expect(serverState.status()).toBe(200);
        expect(serverState.headers()["cache-control"]).toContain("no-store");
        expect((await serverState.json()).complete).toBe(false);
        if (role === "client") {
          const invalid = await page.request.post("/api/register/client", { data: { fullName: "Cliente de prueba", phone: "" } });
          expect(invalid.status()).toBe(400);
          expect(registrationComplete((await admin.auth.admin.getUserById(account.id)).data.user?.user_metadata, profile.data?.onboarding_completed)).toBe(false);
          await page.locator('input[type="tel"]').fill("88887777");
          const terms = page.getByRole("checkbox");
          await terms.locator("..").locator('span[aria-hidden="true"]').click();
          await expect(terms).toBeChecked();
          const saved = page.waitForResponse(response => response.url().endsWith("/api/register/client") && response.request().method() === "POST");
          await page.getByRole("button", { name: /Guardar y continuar|Save and continue/, exact: true }).click();
          expect((await saved).status()).toBe(200);
          const enterPanel = page.getByRole("button", { name: locale === "en" ? "Go to my dashboard" : "Ir a mi panel", exact: true });
          await expect(enterPanel).toBeVisible();
          const completedProfile = await admin.from("profiles").select("onboarding_completed,phone").eq("id", account.id).single();
          expect(registrationComplete((await admin.auth.admin.getUserById(account.id)).data.user?.user_metadata, completedProfile.data?.onboarding_completed)).toBe(true);
          expect(completedProfile.data?.phone).toBeTruthy();
          expect((await (await page.request.get("/api/auth/registration-state")).json()).complete).toBe(true);
          await enterPanel.click();
          await expect(page).toHaveURL(/\/dashboard\/profesional/);
          await expect(page.getByRole("main").getByRole("heading", { level: 1 }).filter({ visible: true }).first()).toBeVisible();
          await page.reload();
          await expect(page).toHaveURL(/\/dashboard\/profesional/);
        }
      } finally { await cleanupDisposableAccount(account); }
    });
  }
}
}


test("anonymous registration cannot overwrite a confirmed account by its public ID", async ({ request }) => {
  test.skip(!canRunSeededRegression(), "Requires isolated regression data.");
  const account = await createDisposableAccount({ prefix: "registration-owner" });
  try {
    const state = await request.get("/api/auth/registration-state");
    expect(state.status()).toBe(401);
    expect(state.headers()["cache-control"]).toContain("no-store");
    const response = await request.post("/api/register/client", { data: { userId: account.id, fullName: "Nombre ajeno", phone: "50688887777" } });
    expect(response.status()).toBe(401);
    const result = await regressionAdminClient().auth.admin.getUserById(account.id);
    expect(result.data.user?.user_metadata.full_name).not.toBe("Nombre ajeno");
  } finally { await cleanupDisposableAccount(account); }
});
