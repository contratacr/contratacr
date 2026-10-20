import { test, expect } from "playwright/test";
import { gotoOK, waitForInteractivePage, loginAs } from "./helpers";
import { canRunSeededRegression, E2E_USERS, regressionAdminClient } from "./seed";
import { createDisposableAccount, cleanupDisposableAccount, type DisposableAccount } from "./disposable-account";

// The loopback CI database starts with only two professionals. Exercise real
// server pagination with disposable discoverable rows instead of assuming that
// a hosted catalogue happens to contain three full pages.
const paginationFixtures: DisposableAccount[] = [];
test.beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!canRunSeededRegression() || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) return;
  test.setTimeout(180_000);
  for (let batch = 0; batch < 15; batch++) {
    await Promise.all(Array.from({ length: 4 }, async () => {
      const account = await createDisposableAccount({ prefix: "pagination", professional: true, publicDiscoverable: true });
      paginationFixtures.push(account);
      await regressionAdminClient().from("professionals").update({ oculto_del_buscador: false }).eq("id", account.professionalId!).throwOnError();
    }));
  }
});
test.afterAll(async () => {
  test.setTimeout(180_000);
  for (const account of paginationFixtures) await cleanupDisposableAccount(account);
});

for (const slow of [false, true]) {
  test(`search loads twenty near the actual list end; ${slow ? "slow" : "fast"} feedback`, async ({ page }) => {
    test.setTimeout(90_000);
    const offsets: number[] = [];
    let responseMs = Infinity;
    let release: (() => void) | undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/buscar/results?*", async route => {
      offsets.push(Number(new URL(route.request().url()).searchParams.get("offset")));
      const start = Date.now();
      const response = await route.fetch();
      responseMs = Date.now() - start;
      if (slow) await gate;
      await route.fulfill({ response });
    });
    try {
      await gotoOK(page, "/buscar");
      await waitForInteractivePage(page);
      const list = page.locator(".ccr-search-sheet-scroll").first();
      await expect(list.locator("[data-pro-id]")).toHaveCount(20);
      await expect(list.locator("[data-search-load-more]")).toHaveCount(1);
      await expect(list.locator('[role="status"]')).toHaveCount(0);
      await list.evaluate(el => { el.scrollTop = 40; });
      await page.waitForTimeout(700);
      expect(offsets).toEqual([]);
      await page.evaluate(() => {
        (window as unknown as { sawSearchSkeleton: boolean }).sawSearchSkeleton = false;
        new MutationObserver(() => {
          if (document.querySelector('[data-search-load-more] [role="status"]'))
            (window as unknown as { sawSearchSkeleton: boolean }).sawSearchSkeleton = true;
        }).observe(document.body, { subtree: true, childList: true });
      });
      await list.evaluate(el => { el.scrollTop = el.scrollHeight; });
      await expect.poll(() => offsets.length).toBe(1);
      if (slow) {
        await expect(list.locator('[data-search-load-more] [role="status"]')).toBeVisible();
        await expect(list.locator("[data-pro-id]")).toHaveCount(20);
        release?.();
      }
      await expect(list.locator("[data-search-result]")).toHaveCount(20);
      await page.waitForTimeout(700);
      expect(offsets).toEqual([20]);
      await expect(list.locator('[role="status"]')).toHaveCount(0);
      // Fast responses must not introduce a skeleton flash. Only enforce this
      // when the measured request fits within the feedback delay.
      if (!slow && responseMs < 350) expect(await page.evaluate(() => (window as unknown as { sawSearchSkeleton: boolean }).sawSearchSkeleton)).toBe(false);
      if (slow) expect(await page.evaluate(() => (window as unknown as { sawSearchSkeleton: boolean }).sawSearchSkeleton)).toBe(true);
    } finally { release?.(); await page.unrouteAll({ behavior: "wait" }); }
  });
}

for (const hasApp of [true, false, "blocked"] as const) {
  test(`first search card has its ${hasApp === "blocked" ? "blocked chat" : hasApp ? "chat" : "WhatsApp"} channel before browser lookup`, async ({ page }) => {
    test.skip(!canRunSeededRegression(), "Requires isolated TEST fixtures.");
    test.setTimeout(120_000);
    const account = await createDisposableAccount({ prefix: "search-channel", professional: true, publicDiscoverable: true });
    try {
      const searchName = `Zqx${account.id.replace(/[0-9-]/g, "z")}`;
      await regressionAdminClient().from("professionals").update({ business_name: searchName, oculto_del_buscador: false }).eq("id", account.professionalId!).throwOnError();
      if (hasApp === "blocked") {
        const db = regressionAdminClient();
        const { data: client } = await db.from("profiles").select("id").eq("email", E2E_USERS.client.email).single().throwOnError();
        await db.from("direct_conversations").insert({ client_id: client!.id, professional_id: account.professionalId!, professional_profile_id: account.id, status: "blocked" }).throwOnError();
      }
      if (hasApp === true) await regressionAdminClient().from("user_push_tokens").insert({ user_id: account.id, token: `regression-${account.id}`, platform: "android", is_active: true, last_seen_at: new Date().toISOString() }).throwOnError();
      await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
      // A broken browser lookup cannot delay the initial server-resolved card.
      let browserLookups = 0;
      await page.route("**/api/direct-chat?conApp=*", route => { browserLookups++; return route.abort(); });
      await gotoOK(page, `/buscar?q=${encodeURIComponent(searchName)}&regression=${Date.now()}`);
      const card = page.locator(`[data-pro-id="${account.professionalId}"]`);
      await expect(card).toBeVisible();
      await expect(card.locator("[data-contact-pending]")).toHaveCount(0);
      await expect(card.getByRole("button", { name: hasApp ? "Enviar mensaje" : /WhatsApp/ }).first()).toBeVisible();
      expect(browserLookups).toBe(0);
    } finally { await page.unrouteAll({ behavior: "wait" }); await cleanupDisposableAccount(account); }
  });
}

test("a shared second page continues after its twenty cards", async ({ page }) => {
  const offsets: number[] = [];
  await page.route("**/api/buscar/results?*", async route => {
    offsets.push(Number(new URL(route.request().url()).searchParams.get("offset")));
    await route.continue();
  });
  await gotoOK(page, "/buscar?page=2");
  await waitForInteractivePage(page);
  const list = page.locator(".ccr-search-sheet-scroll").first();
  await expect(list.locator("[data-pro-id]")).toHaveCount(20);
  await list.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(list.locator("[data-search-result]")).toHaveCount(20);
  expect(offsets).toEqual([40]);
});

test("an exhausted batch stops loading even when the displayed total is stale", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/buscar/results?*", async route => {
    requests++;
    await route.fulfill({ json: { professionals: [], total: 20 } });
  });
  await gotoOK(page, "/buscar");
  await waitForInteractivePage(page);
  const list = page.locator(".ccr-search-sheet-scroll").first();
  await expect(list.locator("[data-search-load-more]")).toHaveCount(1);
  await list.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(list.locator("[data-search-load-more]")).toHaveCount(0);
  await list.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(700);
  expect(requests).toBe(1);
  await expect(list.locator('[role="status"]')).toHaveCount(0);
});
