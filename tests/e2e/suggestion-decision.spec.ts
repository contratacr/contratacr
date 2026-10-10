import { expect, test } from "playwright/test";
import { notificationActionHref } from "../../src/lib/notification-link";
import { expectHealthyPage, gotoOK, loginAs } from "./helpers";
import { cleanupDisposableAccount, createDisposableAccount, type DisposableAccount } from "./disposable-account";

const hasTestDatabase = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").includes("oqheayqqprpciqdvdaqo") && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
let account: DisposableAccount;
test.beforeAll(async () => { if (hasTestDatabase) account = await createDisposableAccount({ prefix: "suggestion-decision", professional: true }); });
test.afterAll(async () => { if (account) await cleanupDisposableAccount(account); });

for (const locale of ["es", "en"] as const) {
  test(`approved suggestion opens service selection without adding a service (${locale})`, async ({ page }) => {
    test.slow();
    test.skip(!hasTestDatabase, "Requires the isolated regression database.");
    await loginAs(page, account.email, account.password);
    const serviceWrites: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "PATCH" || !request.url().includes("/rest/v1/professionals")) return;
      const body = request.postDataJSON();
      if (body && ("services" in body || "professions" in body)) serviceWrites.push(request.url());
    });
    const href = notificationActionHref({
      type: "suggestion_approved",
      data: { link: "/dashboard/profesional?tab=notifications" },
    }, undefined, locale)!;
    await gotoOK(page, href);
    const picker = page.getByTestId("services-add-picker");
    await expect(picker).toBeVisible({ timeout: 30_000 });
    await expect(picker.locator("input")).toBeVisible();
    await expect(page).toHaveURL(/tab=services/);
    await expect(page).toHaveURL(/mode=offer/);
    await expect(page).not.toHaveURL(/focus=/);
    expect(new URL(page.url()).pathname).toBe(`${locale === "en" ? "/en" : ""}/dashboard/profesional`);
    expect(serviceWrites).toEqual([]);
    await expectHealthyPage(page);
  });
}
