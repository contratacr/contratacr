import { test, expect } from "playwright/test";
import { createDisposableAccount, cleanupDisposableAccount, type DisposableAccount } from "./disposable-account";
import { regressionAdminClient } from "./seed";
import { loginAs, gotoOK } from "./helpers";

for (const native of [true, false]) for (const hasApp of [true, false]) {
  test(`${native ? "native" : "web"} contact resolves once to ${hasApp ? "message" : "WhatsApp"} without a provisional channel`, async ({ page, context, baseURL }) => {
    test.setTimeout(120_000);
    let account: DisposableAccount | undefined;
    let release: (() => void) | undefined;
    try {
      account = await createDisposableAccount({ prefix: "contact-stability", professional: true });
      const db = regressionAdminClient();
      const { data: pro } = await db.from("professionals").update({ is_banned: false }).eq("id", account.professionalId!).select("slug").single().throwOnError();
      if (native) await context.addCookies([{ name: "ccr_platform", value: "native", url: baseURL! }]);
      await page.addInitScript(() => localStorage.setItem("ccr:native-first-run-onboarding:v12", "1"));
      await loginAs(page, account.email, account.password);
      const gate = new Promise<void>(resolve => { release = resolve; });
      await page.route("**/api/direct-chat?conApp=*", async route => {
        await gate;
        const ids = new URL(route.request().url()).searchParams.get("conApp")!.split(",");
        await route.fulfill({ json: { conApp: Object.fromEntries(ids.map(id => [id, hasApp])) } });
      });
      await gotoOK(page, "/profesionales/" + pro!.slug);
      const pending = page.locator("[data-contact-pending]").filter({ visible: true });
      await expect(pending.first()).toBeVisible();
      await expect(pending.first()).toBeDisabled();
      await expect(page.getByRole("button", { name: /WhatsApp/i }).filter({ visible: true })).toHaveCount(0);
      // Delayed network must not cause a green WhatsApp frame before the chat.
      await page.waitForTimeout(400);
      await expect(pending.first()).toBeVisible();
      const before = await pending.first().boundingBox();
      const beforeInset = await pending.first().evaluate(e => e.parentElement!.getBoundingClientRect().width - e.getBoundingClientRect().width);
      release?.();
      const final = page.getByRole("button", { name: hasApp ? "Enviar mensaje" : /WhatsApp/ }).filter({ visible: true }).first();
      await expect(final).toBeVisible();
      await expect(pending).toHaveCount(0);
      const after = await final.boundingBox();
      expect(after!.height).toBe(before!.height);
      // WebKit's reserved viewport scrollbar can change the fixed footer's
      // containing width on layout. Compare the button's inset within it.
      const afterInset = await final.evaluate(e => e.parentElement!.getBoundingClientRect().width - e.getBoundingClientRect().width);
      expect(afterInset).toBeCloseTo(beforeInset, 0);
      // Revisit with the session cache: the same channel remains selected.
      await page.reload();
      await expect(final).toBeVisible();
      if (hasApp) await expect(page.getByRole("button", { name: /WhatsApp/i }).filter({ visible: true })).toHaveCount(0);
    } finally {
      release?.();
      await page.unrouteAll({ behavior: "wait" });
      if (account) await cleanupDisposableAccount(account);
    }
  });
}

test("contact retries a transient availability failure without keeping WhatsApp for the session", async ({ page }) => {
  test.setTimeout(120_000);
  let account: DisposableAccount | undefined;
  try {
    account = await createDisposableAccount({ prefix: "contact-retry", professional: true });
    const db = regressionAdminClient();
    const { data: pro } = await db.from("professionals").update({ is_banned: false }).eq("id", account.professionalId!).select("slug").single().throwOnError();
    await loginAs(page, account.email, account.password);
    let requests = 0;
    await page.route("**/api/direct-chat?conApp=*", async route => {
      requests++;
      if (requests === 1) return route.fulfill({ status: 503, json: { error: "temporary" } });
      const ids = new URL(route.request().url()).searchParams.get("conApp")!.split(",");
      await route.fulfill({ json: { conApp: Object.fromEntries(ids.map(id => [id, true])) } });
    });
    await gotoOK(page, "/profesionales/" + pro!.slug);
    await expect(page.getByRole("button", { name: /WhatsApp/ }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Enviar mensaje", exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 20_000 });
    expect(requests).toBeGreaterThan(1);
    await page.reload();
    await expect(page.getByRole("button", { name: "Enviar mensaje", exact: true }).filter({ visible: true }).first()).toBeVisible();
  } finally { await page.unrouteAll({ behavior: "wait" }); if (account) await cleanupDisposableAccount(account); }
});
