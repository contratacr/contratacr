import { test, expect, type Locator } from "playwright/test";
import { createDisposableAccount, cleanupDisposableAccount, type DisposableAccount } from "./disposable-account";
import { regressionAdminClient } from "./seed";
import { loginAs, gotoOK, expectNoHorizontalOverflow } from "./helpers";

// Count text lines, not the heading box: the inline check has its own height.
async function textLineCount(locator: Locator) {
  return locator.evaluate(root => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const tops: number[] = [];
    while (walker.nextNode()) {
      if (!walker.currentNode.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(walker.currentNode);
      for (const rect of range.getClientRects()) if (rect.width) tops.push(Math.round(rect.top));
    }
    return new Set(tops).size;
  });
}

test("panel and public profile share readable identity sizes and immediately adopt the saved official name", async ({ page }) => {
  test.setTimeout(120_000);
  let account: DisposableAccount | undefined;
  let releaseAuth: (() => void) | undefined;
  const oldName = "Sebastián Alejandro Fernández Rodríguez";
  const newName = "Alejandra Patricia Fernández Rodríguez";
  try {
    account = await createDisposableAccount({ prefix: "identity-layout", professional: true });
    const db = regressionAdminClient();
    await db.from("profiles").update({ full_name: oldName }).eq("id", account.id).throwOnError();
    await db.auth.admin.updateUserById(account.id, { user_metadata: { full_name: oldName } });
    const { data: pro, error } = await db.from("professionals")
      .update({ business_name: null, is_banned: false, is_available: true, is_verified: true, verification_status: "verified", review_count: 1, rating_avg: 5 })
      .eq("id", account.professionalId!).select("slug").single();
    if (error) throw error;
    await loginAs(page, account.email, account.password);
    await gotoOK(page, "/dashboard/profesional?tab=home");
    const mobile = (page.viewportSize()?.width ?? 1280) < 640;
    const panelName = mobile ? page.getByTestId("dashboard-identity-name") : page.locator("h1[title]").filter({ visible: true });
    await expect(panelName).toHaveText("Sebastián Fernández Rodríguez");
    const panelPhoto = page.getByRole("button", { name: "Opciones de foto de perfil", exact: true });
    const before = { name: await panelName.boundingBox(), photo: await panelPhoto.boundingBox() };
    expect(before.photo!.width).toBe(mobile ? 72 : 88);
    await expect(panelName).toHaveCSS("font-size", mobile ? "17px" : "24px");
    expect(await panelName.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const reviews = page.getByTestId("dashboard-identity-actions");
    expect((await reviews.boundingBox())!.y).toBeGreaterThanOrEqual(before.name!.y + before.name!.height);
    // A committed server result, with auth reconciliation deliberately delayed:
    // navbar and dashboard must use its name without waiting for that request.
    await db.from("profiles").update({ full_name: newName }).eq("id", account.id).throwOnError();
    await db.auth.admin.updateUserById(account.id, { user_metadata: { full_name: newName } });
    const heldAuth = new Promise<void>(resolve => { releaseAuth = resolve; });
    await page.route("**/auth/v1/user", async route => { await heldAuth; await route.continue(); });
    await page.evaluate(fullName => window.dispatchEvent(new CustomEvent("ccr:identity-updated", { detail: { fullName, verified: true } })), newName);
    await expect(panelName).toHaveText("Alejandra Fernández Rodríguez");
    const accountTrigger = page.getByRole("button", { name: /Alejandra Fernández Rodríguez/ }).filter({ visible: true });
    if ((page.viewportSize()?.width ?? 1280) >= 1024) {
      await expect(accountTrigger).toBeVisible();
    } else {
      await page.getByRole("button", { name: /abrir menú/i }).filter({ visible: true }).click();
      await expect(page.locator("[data-menu-account]")).toContainText("Alejandra Fernández Rodríguez");
      await page.keyboard.press("Escape");
    }
    releaseAuth?.();
    await page.unroute("**/auth/v1/user");
    await expectNoHorizontalOverflow(page);
    if (mobile) {
      const original = page.viewportSize()!;
      await page.setViewportSize({ width: 600, height: original.height });
      await expect(panelName).toHaveText("Alejandra Fernández Rodríguez");
      expect(await textLineCount(panelName)).toBe(1);
      await page.setViewportSize({ width: 320, height: original.height });
      await expect(panelName).toHaveText("Alejandra Fernández Rodríguez");
      expect(await panelName.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      const narrowName = await panelName.boundingBox();
      expect(await textLineCount(panelName)).toBe(2);
      expect((await reviews.boundingBox())!.y).toBeGreaterThanOrEqual(narrowName!.y + narrowName!.height);
      await expectNoHorizontalOverflow(page);
      await page.setViewportSize(original);
    }
    await panelPhoto.locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]").screenshot({ path: test.info().outputPath("panel-identity-card.png") });
    await page.screenshot({ path: test.info().outputPath("panel-identity.png"), fullPage: true });
    await gotoOK(page, "/profesionales/" + pro.slug);
    const publicName = page.getByTestId("professional-profile-name");
    await expect(publicName).toHaveText("Alejandra Fernández Rodríguez");
    await expect(publicName).toHaveCSS("font-size", mobile ? "17px" : "24px");
    await expect(page.locator("[data-profile-identity-avatar]")).toBeVisible();
    const photo = await page.locator("[data-profile-identity-avatar]").boundingBox();
    expect(photo?.width).toBe(before.photo!.width);
    expect(await publicName.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expectNoHorizontalOverflow(page);
    if (mobile) {
      const original = page.viewportSize()!;
      await page.setViewportSize({ width: 600, height: original.height });
      await expect(publicName).toHaveText("Alejandra Fernández Rodríguez");
      expect(await textLineCount(publicName)).toBe(1);
      await page.setViewportSize({ width: 320, height: original.height });
      await expect(publicName).toHaveText("Alejandra Fernández Rodríguez");
      expect(await textLineCount(publicName)).toBe(2);
      expect(await publicName.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await expectNoHorizontalOverflow(page);
      await page.setViewportSize(original);
    }
    await publicName.locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]").screenshot({ path: test.info().outputPath("public-identity-card.png") });
    await page.screenshot({ path: test.info().outputPath("public-identity.png"), fullPage: true });
  } finally {
    releaseAuth?.();
    await cleanupDisposableAccount(account);
  }
});
