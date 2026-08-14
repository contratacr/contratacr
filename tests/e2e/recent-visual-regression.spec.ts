import { expect, test, type Locator, type Page } from "playwright/test";
import { expectHealthyPage, gotoOK, loginAs } from "./helpers";
import { cleanupDisposableAccount, createDisposableAccount, type DisposableAccount } from "./disposable-account";
import { canRunSeededRegression, E2E_USERS, ensureRegressionSeed, type RegressionSeedState } from "./seed";

test.describe.configure({ mode: "serial" });

async function expandFirstCardWithActions(page: Page) {
  const expandable = page.locator('article button[aria-expanded="false"], [id^="booking-"] button[aria-expanded="false"], [id^="project-"] button[aria-expanded="false"]').filter({ visible: true }).first();
  await expect(expandable).toBeVisible();
  await expandable.click();
}

async function visibleMoreOptions(page: Page) {
  return page.getByRole("button", { name: /M[aá]s opciones|More options|M[aá]s|More/i }).filter({ visible: true }).first();
}

async function resolveMoreOptions(page: Page) {
  const trigger = await visibleMoreOptions(page);
  const ready = await expect(trigger).toBeVisible({ timeout: 6_000 }).then(() => true, () => false);
  if (!ready) await expandFirstCardWithActions(page);
  await expect(trigger).toBeVisible({ timeout: 12_000 });
  return trigger;
}

async function expectVerticalMenuInsideViewport(page: Page, trigger: Locator) {
  await expect(trigger).toBeVisible();
  await expect(async () => {
    if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true", { timeout: 2_000 });
  }).toPass({ timeout: 12_000 });
  const menu = page.getByRole("menu").filter({ visible: true }).first();
  await expect(menu).toBeVisible();
  const geometry = await menu.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const items = Array.from(node.querySelectorAll('[role="menuitem"]')).map((item) => item.getBoundingClientRect());
    return {
      box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
      viewport: { width: document.documentElement.clientWidth, height: window.visualViewport?.height ?? window.innerHeight },
      items: items.map((item) => ({ left: item.left, top: item.top, right: item.right, bottom: item.bottom })),
    };
  });
  expect(geometry.box.left).toBeGreaterThanOrEqual(0);
  expect(geometry.box.top).toBeGreaterThanOrEqual(0);
  expect(geometry.box.right).toBeLessThanOrEqual(geometry.viewport.width + 1);
  expect(geometry.box.bottom).toBeLessThanOrEqual(geometry.viewport.height + 1);
  expect(geometry.items.length).toBeGreaterThan(0);
  for (let index = 1; index < geometry.items.length; index += 1) {
    expect(geometry.items[index].top).toBeGreaterThanOrEqual(geometry.items[index - 1].bottom - 1);
  }
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await trigger.click();
  await expect(menu).toBeVisible();
  await page.locator("main").click({ position: { x: 4, y: 4 } });
  await expect(menu).toBeHidden();
}

test.describe("@visual recent bug contracts", () => {
  test.skip(!canRunSeededRegression(), "Requires prepared ContrataCR/SG test fixtures.");
  let seed: RegressionSeedState;

  test.beforeAll(async () => {
    seed = await ensureRegressionSeed();
  });

  test("web test keeps the production navbar, WhatsApp flow and footer at both viewports", async ({ page }) => {
    for (const viewport of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await gotoOK(page, "/es");
      if (viewport.width < 600) {
        await page.getByRole("button", { name: /Abrir men[uú]|Open menu/i }).first().click();
      }
      await expect(page.getByText(/^Asistente$|^Assistant$/i).filter({ visible: true })).toHaveCount(0);
      await expect(page.getByRole("contentinfo")).toBeVisible();
      await expect(page.locator("[data-mobile-bottom-navigation]:visible, nav.fixed.bottom-0:visible")).toHaveCount(0);
      await expect(page.getByText(/^Mensajes$|^Messages$/i).filter({ visible: true })).toHaveCount(0);
      await expectHealthyPage(page);

      await gotoOK(page, `/es/profesionales/${seed.professionalSlug}`);
      await expect(page.getByRole("button", { name: /WhatsApp/i }).filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /Enviar mensaje|Send message/i }).filter({ visible: true })).toHaveCount(0);
    }
  });

  test("professional registration is turquoise text for client-only accounts and hidden for providers", async ({ page }) => {
    let clientOnly: DisposableAccount | undefined;
    let provider: DisposableAccount | undefined;
    try {
      clientOnly = await createDisposableAccount({ prefix: "client-navbar" });
      provider = await createDisposableAccount({ prefix: "provider-navbar", professional: true });
      for (const width of [1366, 390]) {
        await page.setViewportSize({ width, height: width > 600 ? 900 : 844 });
        await loginAs(page, clientOnly.email, clientOnly.password);
        await gotoOK(page, "/es");
        const clientNavigation = width < 600
          ? page.getByRole("dialog", { name: /Men[uú]|Menu/i })
          : page.getByRole("banner");
        if (width < 600) {
          await page.getByRole("button", { name: /Abrir men[uú]|Open menu/i }).first().click();
          await expect(clientNavigation).toBeVisible();
        }
        const link = clientNavigation.getByRole("link", { name: /^Ofrecer mis servicios$/i }).filter({ visible: true }).first();
        await expect(link).toBeVisible();
        await expect(link.locator("svg")).toHaveCount(0);
        const style = await link.evaluate((node) => {
          const computed = getComputedStyle(node);
          return { color: computed.color, background: computed.backgroundColor };
        });
        expect(style.color).toBe("rgb(0, 159, 217)");
        expect(style.background).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);

        await loginAs(page, provider.email, provider.password);
        await gotoOK(page, "/es");
        const providerNavigation = width < 600
          ? page.getByRole("dialog", { name: /Men[uú]|Menu/i })
          : page.getByRole("banner");
        if (width < 600) {
          await page.getByRole("button", { name: /Abrir men[uú]|Open menu/i }).first().click();
          await expect(providerNavigation).toBeVisible();
        }
        await expect(providerNavigation.getByRole("link", { name: /^Ofrecer mis servicios$/i })).toHaveCount(0);
        if (width < 600) {
          await expect(providerNavigation.getByRole("link", { name: /^Mi panel$/i })).toBeVisible();
        } else {
          const accountMenu = providerNavigation
            .getByRole("button", { name: provider.businessName, exact: true })
            .filter({ visible: true })
            .first();
          await expect(accountMenu).toBeVisible();
          await accountMenu.click();
          await expect(providerNavigation.getByRole("link", { name: /^Mi panel$/i }).filter({ visible: true })).toBeVisible();
        }
      }
    } finally {
      await cleanupDisposableAccount(provider);
      await cleanupDisposableAccount(clientOnly);
    }
  });

  test("every three-dot panel menu is vertical, visible and closes by Escape/outside click", async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);

    for (const route of [
      "/es/dashboard/profesional?tab=bookings",
      `/es/dashboard/profesional?tab=jobs&job=${seed.publishedJobId}`,
      `/es/dashboard/profesional?tab=offers&offer=${seed.publishedOfferId}`,
    ]) {
      await gotoOK(page, route);
      await expectVerticalMenuInsideViewport(page, await resolveMoreOptions(page));
      await expectHealthyPage(page);
    }

    // Accepted proposals expose exactly two frequent actions and intentionally
    // have no overflow menu. A pending proposal has the secondary Withdraw
    // action, so it is the correct proposal state for the three-dot contract.
    await gotoOK(page, "/es/dashboard/profesional?tab=proposals");
    await page.getByRole("button", { name: /Mis propuestas|My proposals/i }).click();
    const pendingProposal = page.locator('[id^="project-"]').filter({ hasText: "ContrataCR: proyecto open" }).first();
    await expect(pendingProposal).toBeVisible();
    await pendingProposal.getByRole("button", { expanded: false }).first().click();
    await expectVerticalMenuInsideViewport(page, pendingProposal.getByRole("button", { name: /M[aá]s opciones|More options/i }));
    await expectHealthyPage(page);
  });

  test("paired actions keep equal geometry and compact dialogs stay centered", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    await gotoOK(page, "/es/dashboard/profesional?tab=bookings");
    const booking = page.locator('[id^="booking-"]').first();
    await expect(booking).toBeVisible();
    await booking.locator(":scope > button[aria-expanded='false']").click();
    const actions = booking.locator("button, a").filter({ hasText: /Enviar mensaje|WhatsApp|Marcar completado/i });
    await expect(actions).toHaveCount(2);
    const boxes = await actions.evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { width: box.width, height: box.height };
    }));
    expect(Math.abs(boxes[0].height - boxes[1].height)).toBeLessThanOrEqual(1);
    expect(Math.abs(boxes[0].width - boxes[1].width)).toBeLessThanOrEqual(2);

    // Use the professional's own public profile: the blocked self-action is the
    // compact informational dialog from the recent responsive bug report.
    await gotoOK(page, `/es/profesionales/${seed.professionalSlug}`);
    const serviceRequest = page.locator("article").filter({
      has: page.getByRole("button", { name: /Ver disponibilidad|View availability/i }),
    }).first().getByRole("button", { name: /Ver disponibilidad|View availability/i });
    await expect(serviceRequest).toBeVisible();
    await serviceRequest.click();
    const dialog = page.getByRole("dialog").filter({ visible: true }).first();
    await expect(dialog).toBeVisible();
    const centered = await dialog.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const screen = node.parentElement?.getBoundingClientRect();
      if (!screen) throw new Error("Centered dialog screen is missing");
      return {
        horizontalDelta: Math.abs((box.left + box.width / 2) - (screen.left + screen.width / 2)),
        verticalDelta: Math.abs((box.top + box.height / 2) - (screen.top + screen.height / 2)),
        top: box.top,
        bottom: box.bottom,
        screenTop: screen.top,
        screenBottom: screen.bottom,
      };
    });
    expect(centered.horizontalDelta).toBeLessThanOrEqual(2);
    expect(centered.verticalDelta).toBeLessThanOrEqual(2);
    expect(centered.top).toBeGreaterThanOrEqual(centered.screenTop - 1);
    expect(centered.bottom).toBeLessThanOrEqual(centered.screenBottom + 1);
  });

  test("brand loading mark uses the breathing animation without remount flicker", async ({ page }) => {
    await gotoOK(page, "/es/buscar");
    const contract = await page.evaluate(async () => {
      const mark = document.createElement("img");
      mark.className = "ccr-brand-loading-mark";
      document.body.appendChild(mark);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const style = getComputedStyle(mark);
      const result = {
        animationName: style.animationName,
        animationDuration: style.animationDuration,
        opacity: Number(style.opacity),
      };
      mark.remove();
      return result;
    });
    expect(contract.animationName).toMatch(/breathe/i);
    expect(contract.animationDuration).not.toBe("0s");
    expect(contract.opacity).toBeGreaterThan(0);
  });
});
