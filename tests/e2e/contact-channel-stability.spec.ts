import { test, expect } from "playwright/test";
import { createDisposableAccount, cleanupDisposableAccount, type DisposableAccount } from "./disposable-account";
import { regressionAdminClient } from "./seed";
import { loginAs, gotoOK } from "./helpers";

for (const native of [true, false]) for (const hasApp of [true, false]) {
  test(`${native ? "native" : "web"} contact resolves once to ${hasApp ? "message" : "WhatsApp"} without a provisional channel`, async ({ page, context, baseURL }) => {
    test.setTimeout(120_000);
    let account: DisposableAccount | undefined;
    try {
      account = await createDisposableAccount({ prefix: "contact-stability", professional: true });
      const db = regressionAdminClient();
      const { data: pro } = await db.from("professionals").update({ is_banned: false, slug: `contact-stability-${account.id}` }).eq("id", account.professionalId!).select("slug").single().throwOnError();
      if (native) await context.addCookies([{ name: "ccr_platform", value: "native", url: baseURL! }]);
      await page.addInitScript(() => localStorage.setItem("ccr:native-first-run-onboarding:v12", "1"));
      await loginAs(page, account.email, account.password);
      if (hasApp) await db.from("user_push_tokens").insert({user_id:account.id,token:`regression-contact-${account.id}`,platform:"android",is_active:true,last_seen_at:new Date().toISOString()}).throwOnError();
      let lookups = 0;
      await page.route("**/api/direct-chat?conApp=*", route => {
        lookups++;
        return route.fulfill({status:503,json:{error:"unexpected-client-lookup"}});
      });
      await page.addInitScript(() => {
        (window as unknown as {contactFrames:string[]}).contactFrames=[];
        new MutationObserver(() => {
          for (const button of document.querySelectorAll('[data-contact-pending]')) {
            if ((button as HTMLElement).offsetHeight) (window as unknown as {contactFrames:string[]}).contactFrames.push('pending');
          }
        }).observe(document,{childList:true,subtree:true});
      });
      await gotoOK(page, "/profesionales/" + pro!.slug);
      const final = page.getByRole("button", { name: hasApp ? "Enviar mensaje" : /WhatsApp/ }).filter({ visible: true }).first();
      await expect(final).toBeVisible();
      await expect(page.locator('[data-contact-pending]').filter({visible:true})).toHaveCount(0);
      expect(await page.evaluate(()=>(window as unknown as {contactFrames:string[]}).contactFrames)).toEqual([]);
      expect(lookups).toBe(0);
      // Revisit with the session cache: the same channel remains selected.
      await page.reload();
      await expect(final).toBeVisible();
      if (hasApp) await expect(page.getByRole("button", { name: /WhatsApp/i }).filter({ visible: true })).toHaveCount(0);
    } finally {
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
    const { data: pro } = await db.from("professionals").update({ is_banned: false, slug: `contact-stability-${account.id}` }).eq("id", account.professionalId!).select("slug").single().throwOnError();
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
    await expect(page.getByRole("button", { name: "Enviar mensaje", exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 40_000 });
    expect(requests).toBeGreaterThan(1);
    await db.from("user_push_tokens").insert({user_id:account.id,token:`regression-retry-${account.id}`,platform:"android",is_active:true,last_seen_at:new Date().toISOString()}).throwOnError();
    await page.reload();
    await expect(page.getByRole("button", { name: "Enviar mensaje", exact: true }).filter({ visible: true }).first()).toBeVisible();
  } finally { await page.unrouteAll({ behavior: "wait" }); if (account) await cleanupDisposableAccount(account); }
});
