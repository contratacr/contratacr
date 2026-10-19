import { test, expect } from "playwright/test";
import { createDisposableAccount, cleanupDisposableAccount, type DisposableAccount } from "./disposable-account";
import { regressionAdminClient } from "./seed";
import { loginAs, gotoOK } from "./helpers";

for (const hasApp of [true, false]) {
  test(`native contact resolves once to ${hasApp ? "message" : "WhatsApp"} without a provisional channel`, async ({ page, context, baseURL }) => {
    test.setTimeout(120_000);
    let account: DisposableAccount | undefined;
    let release: (() => void) | undefined;
    try {
      account = await createDisposableAccount({ prefix: "contact-stability", professional: true });
      const db = regressionAdminClient();
      const { data: pro } = await db.from("professionals").update({ is_banned: false }).eq("id", account.professionalId!).select("slug").single().throwOnError();
      await context.addCookies([{ name: "ccr_platform", value: "native", url: baseURL! }]);
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
