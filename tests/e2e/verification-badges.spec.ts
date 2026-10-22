import { VERIFIED_SEAL_DATA_URL } from "../../src/lib/verified-seal";
import { test, expect } from "playwright/test";
import { gotoOK, waitForInteractivePage, expectNoHorizontalOverflow, loginAs } from "./helpers";
import { createDisposableAccount, cleanupDisposableAccount, type DisposableAccount } from "./disposable-account";
import { canRunSeededRegression, E2E_USERS, regressionAdminClient } from "./seed";

for (const path of ["/profesionales", "/promociones", "/empleos", "/proyectos"]) {
  test(`${path}: check explains identity without opening the card`, async ({ page }) => {
    await gotoOK(page, path);
    await waitForInteractivePage(page);
    const check = page.locator("[data-verification-badge]").filter({ visible: true }).first();
    await expect(check).toBeVisible();
    expect(await check.textContent()).toBe("");
    // The exported QR uses this SVG too: outline, check and stroke must match
    // the visible profile badge, not a separately drawn approximation.
    const sameSeal = await check.locator("svg").evaluate((svg, dataUrl) => {
      const exported = new DOMParser().parseFromString(decodeURIComponent(dataUrl.split(",")[1]), "image/svg+xml");
      const paths = (root: ParentNode) => Array.from(root.querySelectorAll("path"), (path) =>
        ["d", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"].map((key) => path.getAttribute(key)));
      return JSON.stringify(paths(svg)) === JSON.stringify(paths(exported));
    }, VERIFIED_SEAL_DATA_URL);
    expect(sameSeal, "QR exports and profile badges must share the same seal").toBe(true);
    expect(await check.evaluate((el) => el.closest("a"))).toBeNull();
    const before = page.url();
    const identity = check.locator("xpath=ancestor::*[@data-inline-identity-name][1]");
    if (await identity.count()) {
      const alignment = await identity.evaluate(el => {
        const text = el.querySelector("[data-identity-name-text]")!;
        const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
        let node: Node | null, last: Node | null = null;
        while ((node = walker.nextNode())) if (node.textContent?.trim()) last = node;
        const value = last!.textContent!.trimEnd();
        const range = document.createRange();
        range.setStart(last!, value.lastIndexOf(" ") + 1);
        range.setEnd(last!, value.length);
        const word = Array.from(range.getClientRects()).at(-1)!;
        const badge = el.querySelector("[data-verification-badge]")!.getBoundingClientRect();
        return { gap: badge.left - word.right, sameLine: badge.top < word.bottom && badge.bottom > word.top, centerDelta: Math.abs((badge.top + badge.bottom - word.top - word.bottom) / 2) };
      });
      expect(alignment.gap).toBeGreaterThanOrEqual(-1);
      expect(alignment.gap).toBeLessThanOrEqual(4);
      expect(alignment.centerDelta).toBeLessThanOrEqual(4);
      expect(alignment.sameLine).toBe(true);
    }
    await check.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Identidad verificada", { exact: true })).toBeVisible();
    await expect(dialog).toContainText("Verificamos los datos de identificación de esta cuenta.");
    await expect(dialog).not.toContainText(/Hacienda|biométric|revisión manual/);
    await expect(dialog).toContainText(path === "/proyectos" ? "No garantiza pagos ni contrataciones" : "no garantiza la calidad del trabajo");
    expect(page.url()).toBe(before);
    await expectNoHorizontalOverflow(page);
    await dialog.getByRole("button", { name: "Entendido", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await check.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(page.url()).toBe(before);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    if (path === "/profesionales" || (page.viewportSize()?.width ?? 0) < 1024) {
      const card = check.locator("xpath=ancestor::article[1]");
      await card.locator("h3 a, h2 a").first().click();
      await expect(page).not.toHaveURL(before);
    }
  });
}

for (const path of ["/promociones", "/empleos", "/proyectos"]) {
  test(`${path}: publication detail keeps the owner's check beside the name`, async ({ page }) => {
    await gotoOK(page, path);
    const cardCheck = page.locator("article [data-verification-badge]").filter({ visible: true }).first();
    await expect(cardCheck).toBeVisible();
    const href = await cardCheck.locator("xpath=ancestor::article[1]").locator("h3 a, h2 a").first().getAttribute("href");
    expect(href).toBeTruthy();
    await gotoOK(page, href!);
    const owner = page.locator("[data-verification-owner]").filter({ visible: true }).first();
    const check = owner.locator("[data-verification-badge]");
    await expect(check).toBeVisible();
    expect(await check.textContent()).toBe("");
    await expect(owner.locator(".lucide-chevron-right")).toHaveCount(0);
    await expect(owner.locator("[data-cedula-verificada]")).toHaveCount(0);
    expect(await check.evaluate((el) => el.closest("a"))).toBeNull();
    const before = page.url();
    await check.click();
    await expect(page.getByRole("dialog")).toContainText("Verificamos los datos de identificación");
    expect(page.url()).toBe(before);
    await expectNoHorizontalOverflow(page);
    await page.getByRole("dialog").getByRole("button", { name: "Entendido", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath(`verified-owner-${path.slice(1)}.png`) });
    // Compare against the final rendered word, not the text element's box:
    // a flex-centred seal beside a two-line name used to pass this test.
    for (const width of [150, 220, 320]) {
      const geometry = await owner.evaluate((el, width) => {
        const identity = el.querySelector<HTMLElement>("[data-inline-identity-name]")!;
        identity.style.display = "block";
        identity.style.width = `${width}px`;
        identity.style.maxWidth = "100%";
        const text = identity.querySelector("[data-identity-name-text]")!;
        const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
        let node: Node | null, last: Node | null = null;
        while ((node = walker.nextNode())) if (node.textContent?.trim()) last = node;
        const value = last!.textContent!;
        const range = document.createRange();
        range.setStart(last!, value.trimEnd().lastIndexOf(" ") + 1);
        range.setEnd(last!, value.trimEnd().length);
        const word = Array.from(range.getClientRects()).at(-1)!;
        const badge = identity.querySelector("[data-verification-badge]")!.getBoundingClientRect();
        const rect = identity.getBoundingClientRect();
        return { gap: badge.left - word.right, overlap: badge.top < word.bottom && badge.bottom > word.top,
          overflow: identity.scrollWidth > identity.clientWidth + 1, badgeInside: badge.right <= rect.right + 1,
          text: text.textContent, clipped: getComputedStyle(text).textOverflow === "ellipsis" };
      }, width);
      expect(geometry.gap).toBeGreaterThanOrEqual(-1);
      expect(geometry.gap).toBeLessThan(14);
      expect(geometry.overlap).toBe(true);
      expect(geometry.overflow).toBe(false);
      expect(geometry.badgeInside).toBe(true);
      expect(geometry.clipped).toBe(false);
      expect(geometry.text?.trim()).toBeTruthy();
    }
  });
}

test("the professional profile keeps only the interactive check beside its name", async ({ page }) => {
  await gotoOK(page, "/profesionales");
  const check = page.locator("[data-verification-badge]").filter({ visible: true }).first();
  await expect(check).toBeVisible();
  const card = check.locator("xpath=ancestor::article[1]");
  const href = await card.locator("h3 a").first().getAttribute("href");
  expect(href).toBeTruthy();
  await gotoOK(page, href!);
  const owner = page.locator("[data-verification-owner]").filter({ visible: true }).first();
  await expect(owner.locator("[data-verification-badge]")).toBeVisible();
  await expect(page.locator("[data-cedula-verificada]")).toHaveCount(0);
  await owner.locator("[data-verification-badge]").click();
  await expect(page.getByRole("dialog")).toContainText("no garantiza la calidad del trabajo");
});

test("registration explains the badge and opens the shared explanation", async ({ page }) => {
  await gotoOK(page, "/registro/profesional");
  const help = page.locator("[data-verification-education]");
  await expect(help.getByRole("button", { name: "Qué significa el check de identidad", exact: true })).toBeVisible();
  await expect(help).toContainText(/Cuando tu identidad esté verificada|Tu identidad está verificada/);
  await help.getByRole("button", { name: "Qué significa el check de identidad", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Verificamos los datos de identificación");
  await expect(page.getByRole("dialog")).toContainText("no garantiza la calidad del trabajo");
  await expectNoHorizontalOverflow(page);
});

test("dashboard name keeps only an interactive identity check", async ({ page }) => {
  test.skip(!canRunSeededRegression(), "Requires isolated regression accounts.");
  // A slower account-reactivation check leaves a real handoff window after
  // SIGNED_IN. Keep its actual response; only add normal mobile latency.
  await page.route("**/api/account/disable", async route => {
    if (route.request().postDataJSON()?.action === "reactivate") {
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    await route.continue();
  });
  const speculativePanels: string[] = [];
  page.on("request", request => {
    if (/\/login(?:[?#]|$)/.test(page.url()) && request.headers()["next-router-prefetch"] === "1" && new URL(request.url()).pathname.includes("/dashboard/")) {
      speculativePanels.push(new URL(request.url()).pathname);
    }
  });
  await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
  expect(speculativePanels, "Login must hand off its session without speculative panel navigation").toEqual([]);
  await gotoOK(page, "/dashboard/profesional");
  const name = page.locator("h1").filter({ visible: true }).first();
  const check = name.locator("..").locator("[data-verification-badge]");
  await expect(check).toBeVisible();
  expect(await check.textContent()).toBe("");
  const gap = await check.evaluate((el) => {
    const icon = el.getBoundingClientRect();
    const name = el.closest("[data-inline-identity-name]")!.querySelector("[data-profile-name-last-word]")!.getBoundingClientRect();
    return icon.left - name.right;
  });
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThanOrEqual(5);
  await expect(name.locator("..").locator("[data-cedula-verificada]")).toHaveCount(0);
  await check.click();
  await expect(page.getByRole("dialog")).toContainText("no garantiza la calidad del trabajo");
  await expectNoHorizontalOverflow(page);
});

test("the badge explanation is translated into English", async ({ page }) => {
  await gotoOK(page, "/en/profesionales");
  const check = page.getByRole("button", { name: "Identity verified: see what was checked", exact: true }).first();
  await expect(check).toBeVisible();
  await check.click();
  await expect(page.getByRole("dialog")).toContainText("does not guarantee work quality");
});

test("native phone shell keeps the explanation above its navigation", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.addCookies([{ name: "ccr_platform", value: "native", url: test.info().project.use.baseURL as string }]);
  await page.addInitScript(() => {
    localStorage.setItem("ccr:native-first-run-onboarding:v12", "1");
    const nativeRuntime: Record<string, unknown> = { isNativePlatform: () => true };
    Object.defineProperty(window, "Capacitor", {
      configurable: true,
      get: () => nativeRuntime,
      set: (value) => {
        if (value && typeof value === "object") Object.assign(nativeRuntime, value);
        nativeRuntime.isNativePlatform = () => true;
      },
    });
  });
  await gotoOK(page, "/profesionales");
  await waitForInteractivePage(page);
  await page.locator("[data-verification-badge]").filter({ visible: true }).first().click();
  await expect(page.getByRole("dialog")).not.toContainText(/Hacienda|revisión manual/);
  await expect(page.locator("html")).toHaveClass(/ccr-native-app/);
  const close = page.getByRole("dialog").getByRole("button", { name: "Entendido", exact: true });
  expect(await close.evaluate((el) => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
  await expectNoHorizontalOverflow(page);
  await page.getByRole("dialog").getByRole("button", { name: "Entendido", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});


test("verification shows only the identification check and its explanation", async ({ page }) => {
  test.skip(!(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").includes("oqheayqqprpciqdvdaqo") || !process.env.SUPABASE_SERVICE_ROLE_KEY,
    "Requires the isolated test database.");
  let account: DisposableAccount | undefined;
  try {
    account = await createDisposableAccount({ prefix: "verification-layout", professional: true });
    const db = regressionAdminClient();
    const profile = await db.from("profiles").update({ cedula: "700000001" }).eq("id", account.id);
    if (profile.error) throw profile.error;
    const pro = await db.from("professionals").update({ is_verified: true, verification_status: "verified" }).eq("id", account.professionalId!);
    if (pro.error) throw pro.error;
    await loginAs(page, account.email, account.password);
    await gotoOK(page, "/dashboard/profesional?tab=verificacion");
    const education = page.locator("[data-verification-education]").filter({ visible: true }).first();
    const identity = page.locator("[data-current-identification]").filter({ visible: true }).first();
    await expect(education).toHaveCount(0);
    await expect(identity).toContainText("700000001");

    await expect(identity.locator("[data-verification-badge]")).toHaveCount(1);
    for (const block of [identity]) {
      await block.locator("[data-verification-badge]").click();
      await expect(page.getByRole("dialog")).toContainText("Verificamos los datos de identificación de esta cuenta.");
      await page.getByRole("dialog").getByRole("button", { name: "Entendido", exact: true }).click();
    }
    const finalWord = await identity.locator("[data-profile-name-last-word]").boundingBox();
    const check = await identity.locator("[data-verification-badge]").boundingBox();
    expect(finalWord).not.toBeNull(); expect(check).not.toBeNull();
    const gap = check!.x - (finalWord!.x + finalWord!.width);
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThanOrEqual(5);
    await expectNoHorizontalOverflow(page);
    const unverified = await db.from("professionals").update({ is_verified: false, verification_status: "pending" }).eq("id", account.professionalId!);
    if (unverified.error) throw unverified.error;
    await gotoOK(page, "/dashboard/profesional?tab=verificacion");
    await expect(identity.locator("[data-verification-badge]")).toHaveCount(0);
    await expect(education).toHaveCount(0);
  } finally {
    await cleanupDisposableAccount(account);
  }
});

test("official identification and public cards preserve full names and bind the badge to the final word", async ({ page }) => {
  const { build } = await import("esbuild");
  const bundled = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{IdentityInfoBlock}from'./src/components/ui/identity-info-block';import{ResponsiveVerifiedName}from'./src/components/professionals/responsive-verified-name';const name='MARÍA DE LOS ÁNGELES ALEJANDRA FERNÁNDEZ RODRÍGUEZ';createRoot(document.getElementById('root')).render(<div style={{width:200}}><IdentityInfoBlock fullName={name} verified={false}/><div data-public-name><ResponsiveVerifiedName name={name} verified={true} verifiedLabel=""/></div></div>);`,loader:'tsx',resolveDir:process.cwd()},jsx:'automatic',bundle:true,write:false,platform:'browser',format:'iife',tsconfig:'tsconfig.json',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'presentation-boundaries',setup(b){
    b.onResolve({filter:/^(next-intl|@\/i18n\/navigation|@\/components\/ui\/verification-info)$/},a=>({path:a.path,namespace:'presentation'}));
    b.onLoad({filter:/.*/,namespace:'presentation'},a=>({resolveDir:process.cwd(),contents:a.path==='next-intl'?`export const useTranslations=()=>key=>key;`:a.path==='@/i18n/navigation'?`export const Link=()=>null;`:`import React from "react";export const VerificationInfo=()=>React.createElement("button",{"data-verification-badge":"",style:{width:24,height:24,padding:0,display:"inline-flex"}});`}));
  }}]});
  await page.route('**/official-name-harness',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width"><style>.flex{display:flex}.w-full{width:100%}.min-w-0{min-width:0}.flex-1{flex:1}.truncate{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.whitespace-normal{white-space:normal}.break-words{overflow-wrap:break-word}.whitespace-nowrap{white-space:nowrap}.inline-block{display:inline-block}.align-middle{vertical-align:middle}.ml-1{margin-left:4px}.leading-none{line-height:1}[data-inline-identity-name]{overflow-wrap:anywhere}[data-identity-name-tail]{overflow-wrap:normal}</style><div id="root"></div>'}));
  await page.goto('/official-name-harness');await page.addScriptTag({content:bundled.outputFiles[0].text});
  const official=page.locator('[data-nombre-identificacion] .whitespace-normal');
  await expect(official).toHaveText('MARÍA DE LOS ÁNGELES ALEJANDRA FERNÁNDEZ RODRÍGUEZ');
  expect(await official.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  const publicName=page.locator('[data-public-name] [data-inline-identity-name]');
  await expect(publicName.locator('[data-identity-name-text]')).toHaveText('MARÍA DE LOS ÁNGELES ALEJANDRA FERNÁNDEZ RODRÍGUEZ');
  for (const width of [150, 200, 320]) {
    const aligned = await publicName.evaluate((e, width) => {
      (e.parentElement as HTMLElement).style.width = `${width}px`;
      const tail = e.querySelector('[data-profile-name-last-word]')!;
      const range = document.createRange(); range.selectNodeContents(tail);
      const word = Array.from(range.getClientRects()).at(-1)!;
      const badge = e.querySelector('[data-verification-badge]')!.getBoundingClientRect();
      return {gap: badge.left - word.right, overlap: badge.top < word.bottom && badge.bottom > word.top,
        overflow: e.parentElement!.scrollWidth > e.parentElement!.clientWidth};
    }, width);
    // WebKit DOM Range edges can differ by half a 1/64 px layout unit.
    expect(aligned.gap).toBeGreaterThanOrEqual(-1 / 64);
    expect(aligned.gap).toBeLessThan(10);
    expect(aligned.overlap).toBe(true);
    expect(aligned.overflow).toBe(false);
  }
});
