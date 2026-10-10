import { expect, test } from "playwright/test";
import { notificationActionHref } from "../../src/lib/notification-link";
import { expectHealthyPage, gotoOK, loginAs } from "./helpers";
import { E2E_USERS } from "./seed";

for (const locale of ["es", "en"] as const) {
  test(`approved suggestion opens service selection without adding a service (${locale})`, async ({ page }) => {
    test.slow();
    test.skip(!E2E_USERS.professional.password, "Requires the regression account credentials.");
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
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
