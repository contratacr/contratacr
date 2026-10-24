import { mkdirSync } from "node:fs";
import { test, expect } from "playwright/test";
import { createDisposableAccount, cleanupDisposableAccount, type DisposableAccount } from "./disposable-account";
import { canRunSeededRegression, regressionAdminClient } from "./seed";
import { gotoOK, loginAs, expectNoHorizontalOverflow } from "./helpers";

const testDatabase = canRunSeededRegression();

for (const professional of [false, true]) {
  for (const native of [false, true]) {
    test(`account settings keep groups distinct and blocked users in privacy (${professional ? "professional" : "client"}, ${native ? "native" : "web"})`, async ({ page, context }) => {
      test.skip(!testDatabase, "Requires the isolated test database.");
      test.setTimeout(120_000);
      let account: DisposableAccount | undefined;
      let blocked: DisposableAccount | undefined;
      try {
        if (native || test.info().project.name === "chromium-mobile") await page.setViewportSize({ width: 320, height: 740 });
        if (native) {
          await context.addCookies([{ name: "ccr_platform", value: "native", url: test.info().project.use.baseURL as string }]);
          await page.addInitScript(() => {
            localStorage.setItem("ccr:native-first-run-onboarding:v12", "1");
            const bridge: Record<string, unknown> = { isNativePlatform: () => true };
            Object.defineProperty(window, "Capacitor", { configurable: true, get: () => bridge, set: (value) => {
              if (value && typeof value === "object") Object.assign(bridge, value);
              bridge.isNativePlatform = () => true;
            } });
          });
        }
        account = await createDisposableAccount({ prefix: "settings-layout", professional });
        blocked = await createDisposableAccount({ prefix: "settings-blocked" });
        const db = regressionAdminClient();
        const seed = await db.from("user_blocks").insert({ blocker_id: account.id, blocked_id: blocked.id, reason: "Disposable privacy regression" });
        if (seed.error) throw seed.error;
        await loginAs(page, account.email, account.password);
        await gotoOK(page, "/dashboard/profesional?tab=cuenta");
        const security = page.locator("[data-account-security]");
        await expect(security).toBeVisible();
        await expect(page.locator("[data-blocked-users]")).toHaveCount(0);
        const securityGroups = security.locator("[data-security-group]");
        await expect(securityGroups).toHaveCount(4);
        const groupStyles = await securityGroups.evaluateAll(nodes => nodes.map(node => {
          const style = getComputedStyle(node);
          return { border: style.borderTopWidth, padding: style.paddingTop };
        }));
        expect(groupStyles[0]).toEqual({ border: "0px", padding: "0px" });
        for (const style of groupStyles.slice(1)) expect(style).toEqual({ border: "1px", padding: "24px" });
        const rows = security.locator("[data-sign-in-methods] li");
        await expect(rows).toHaveCount(3);
        for (const row of await rows.all()) {
          expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        }
        const groups = security.locator(":scope > div, :scope > section");
        const boxes = await groups.evaluateAll((items) => items.map((item) => {
          const box = item.getBoundingClientRect(); return { top: box.top, bottom: box.bottom };
        }));
        for (let i = 1; i < boxes.length; i++) expect(boxes[i].top - boxes[i - 1].bottom).toBeGreaterThanOrEqual(20);
        await expect(page.locator("[data-account-management]").getByRole("heading", { name: "Gestión de cuenta" })).toBeVisible();
        await expectNoHorizontalOverflow(page);
        if (native && !professional && test.info().project.name === "webkit-mobile" && process.env.SETTINGS_EVIDENCE_DIR) {
          const evidence = process.env.SETTINGS_EVIDENCE_DIR;
          if (!process.env.CI) {
            mkdirSync(evidence, { recursive: true });
            await security.screenshot({ path: `${evidence}/cuenta-seguridad-ordenada.png` });
          }
        }

        const lastAccountAction = page.locator("[data-account-management] button").last();
        await lastAccountAction.scrollIntoViewIfNeeded();
        await expect.poll(async () => {
          await lastAccountAction.scrollIntoViewIfNeeded();
          return lastAccountAction.evaluate((el) => {
          const box = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
          });
        }).toBe(true);

        await gotoOK(page, "/dashboard/profesional?tab=profile");
        await page.locator("#sec-privacidad > button").click();
        const privacy = page.locator("[data-account-privacy]");
        await expect(privacy.getByRole("heading", { name: "Usuarios bloqueados" })).toBeVisible();
        const closePrivacy = async () => {
          if ((page.viewportSize()?.width ?? 0) < 640) {
            await page.getByRole("button", { name: /^Volver/ }).filter({ visible: true }).first().click();
          } else {
            await page.locator("#sec-privacidad > button").click();
          }
        };
        const unblock = privacy.getByRole("button", { name: "Desbloquear", exact: true });
        await expect(unblock).toBeVisible();
        await closePrivacy();
        await page.route("**/api/block", async (route) => {
          if (route.request().method() === "GET") await new Promise((resolve) => setTimeout(resolve, 500));
          await route.continue();
        });
        await page.locator("#sec-privacidad > button").click();
        await expect(unblock).toBeVisible();
        await expect(privacy.getByText("No has bloqueado a nadie.", { exact: true })).toHaveCount(0);
        await expect(privacy.locator("[data-blocked-users] [aria-busy]")).toHaveCount(0);
        if (native) await expect(privacy.getByRole("switch", { name: /^Confirmaciones de lectura/ })).toBeVisible();
        else await expect(privacy.getByRole("switch", { name: /^Confirmaciones de lectura/ })).toHaveCount(0);
        await unblock.click();
        await expect(unblock).toHaveCount(0);
        await closePrivacy();
        await page.locator("#sec-privacidad > button").click();
        await expect(privacy.getByText("No has bloqueado a nadie.", { exact: true })).toBeVisible();
        await expect(privacy.locator("[data-blocked-users] [aria-busy]")).toHaveCount(0);
        const remaining = await page.request.get("/api/block");
        expect(remaining.ok()).toBe(true);
        expect((await remaining.json()).blocked).toEqual([]);
        await expectNoHorizontalOverflow(page);
      } finally {
        await cleanupDisposableAccount(account);
        await cleanupDisposableAccount(blocked);
      }
    });
  }
}
