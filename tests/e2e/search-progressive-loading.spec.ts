import { test, expect } from "playwright/test";
import { gotoOK, waitForInteractivePage, loginAs } from "./helpers";
import { canRunSeededRegression, E2E_USERS, regressionAdminClient } from "./seed";
import { createDisposableAccount, cleanupDisposableAccount, type DisposableAccount } from "./disposable-account";

// Exercise real server pagination with isolated discoverable rows, rather than
// depending on the catalogue size or a previously cached global search.
const paginationFixtures: DisposableAccount[] = [];
let paginationPath = "/buscar";
test.beforeAll(async () => {
  if (!canRunSeededRegression()) return;
  test.setTimeout(180_000);
  const namespace = `ZqxPagination${crypto.randomUUID().replace(/[^a-z]/gi, "")}`;
  paginationPath = `/buscar?q=${namespace}`;
  for (let batch = 0; batch < 15; batch++) {
    await Promise.all(Array.from({ length: 4 }, async () => {
      const account = await createDisposableAccount({ prefix: "pagination", professional: true, publicDiscoverable: true });
      paginationFixtures.push(account);
      await regressionAdminClient().from("professionals").update({ oculto_del_buscador: false, business_name: `${namespace} ${account.id}` }).eq("id", account.professionalId!).throwOnError();
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
      await gotoOK(page, paginationPath);
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

for (const native of [false, true]) {
  test(`${native ? "native" : "web"} next twenty cards finish the full-card skeleton with their contact channel ready`, async ({ page, context, baseURL }) => {
    test.skip(!canRunSeededRegression(), "Requires isolated TEST fixtures.");
    test.setTimeout(120_000);
    if (native) await context.addCookies([{name:"ccr_platform",value:"native",url:baseURL!}]);
    await page.addInitScript(() => localStorage.setItem("ccr:native-first-run-onboarding:v12", "1"));
    await loginAs(page, E2E_USERS.client.email, E2E_USERS.client.password);
    const db = regressionAdminClient();
    const {data:viewer}=await db.from("profiles").select("id").eq("email",E2E_USERS.client.email).single().throwOnError();
    const preflight=await page.request.get(paginationPath.replace("/buscar?","/api/buscar/results?")+"&offset=20");
    expect(preflight.ok()).toBe(true);
    const preview=await preflight.json();
    const nextIds=preview.professionals.map((row:{professional:{id:string}})=>row.professional.id) as string[];
    expect(nextIds).toHaveLength(20);
    const appAccount=paginationFixtures.find(row=>row.professionalId===nextIds[0])!;
    const blockedAccount=paginationFixtures.find(row=>row.professionalId===nextIds[1])!;
    const token=`regression-paginated-${crypto.randomUUID()}`;
    let conversationId:string|undefined;
    let release=()=>{};
    const gate=new Promise<void>(resolve=>{release=resolve;});
    const extraLookups:string[]=[];
    let payload:typeof preview;
    try {
      await db.from("user_push_tokens").insert({user_id:appAccount.id,token,platform:"android",is_active:true,last_seen_at:new Date().toISOString()}).throwOnError();
      const {data:conversation}=await db.from("direct_conversations").insert({client_id:viewer!.id,professional_id:blockedAccount.professionalId!,professional_profile_id:blockedAccount.id,status:"blocked"}).select("id").single().throwOnError();
      conversationId=conversation!.id;
      await page.route("**/api/direct-chat?conApp=*",route=>{
        extraLookups.push(...new URL(route.request().url()).searchParams.get("conApp")!.split(",").filter(id=>nextIds.includes(id)));
        return route.abort();
      });
      await page.route("**/api/buscar/results?*",async route=>{
        const response=await route.fetch();
        payload=await response.json();
        await gate;
        await route.fulfill({response});
      });
      await gotoOK(page,paginationPath);
      await waitForInteractivePage(page);
      const list=page.locator(".ccr-search-sheet-scroll").first();
      await expect(list.locator("[data-pro-id]")).toHaveCount(20);
      await page.evaluate(()=>{
        (window as unknown as {pendingContactEver:boolean}).pendingContactEver=false;
        new MutationObserver(()=>{
          if(document.querySelector('[data-search-result] [data-contact-pending]')) (window as unknown as {pendingContactEver:boolean}).pendingContactEver=true;
        }).observe(document.body,{childList:true,subtree:true});
      });
      await list.evaluate(el=>{el.scrollTop=el.scrollHeight;});
      await expect(list.locator('[data-search-load-more] [role="status"]')).toBeVisible();
      await expect(list.locator("[data-search-result]")).toHaveCount(0);
      release();
      await expect(list.locator("[data-search-result]")).toHaveCount(20);
      await expect(list.locator('[data-search-load-more] [role="status"]')).toHaveCount(0);
      expect(payload.contactAvailability.viewerId).toBe(viewer!.id);
      expect(payload.contactAvailability.values[nextIds[0]]).toBe(true);
      expect(payload.contactAvailability.values[nextIds[1]]).toBe(true);
      expect(payload.contactAvailability.values[nextIds[2]]).toBe(false);
      for(const [index,name] of [[0,"Enviar mensaje"],[1,"Enviar mensaje"],[2,"WhatsApp"]] as const){
        const card=list.locator(`[data-result-id="${nextIds[index]}"]`);
        await card.scrollIntoViewIfNeeded();
        await expect(card.getByRole("button",{name:new RegExp(name)}).first()).toBeVisible();
      }
      await expect(list.locator('[data-search-result] [data-contact-pending]')).toHaveCount(0);
      expect(await page.evaluate(()=>(window as unknown as {pendingContactEver:boolean}).pendingContactEver)).toBe(false);
      expect(extraLookups).toEqual([]);
      expect(payload.professionals.every((row:{professional:{whatsapp?:string;callPhone?:string;contactEmail?:string}})=>!row.professional.whatsapp&&!row.professional.callPhone&&!row.professional.contactEmail)).toBe(true);
    } finally {
      release();
      await page.unrouteAll({behavior:"wait"});
      await db.from("user_push_tokens").delete().eq("token",token).throwOnError();
      if(conversationId) await db.from("direct_conversations").delete().eq("id",conversationId).throwOnError();
    }
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
  await gotoOK(page, `${paginationPath}${paginationPath.includes("?") ? "&" : "?"}page=2`);
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
  await gotoOK(page, paginationPath);
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
