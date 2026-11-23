import { expect, test } from "playwright/test";
import { expectNoHorizontalOverflow, gotoOK } from "./helpers";
import { ownerFixture, local, login, proOff } from "./pro-round2-fixture";

// Public offer page of ContrataCR Pro (/contratacr-pro, owner 2026-11-22: a logged-out visitor is offered Pro).
// Flag OFF (production, E2E_PRO_OFF=1): the page answers 404 in both languages. Flag ON (test Worker, local development):
// it lists only the working features, "Próximamente" and "En preparación" (never as available), points the CTAs to the
// existing register / login (login returns to the Pro space) and sends a professional with an account to /dashboard/pro.
let PRO_OFF = proOff;

test.describe("@pro-landing offer page", () => {
  test.beforeAll(async ({ playwright, baseURL }) => {
    const context = await playwright.request.newContext({ baseURL });
    const probe = await context.get("/api/pro/access", { maxRedirects: 0 });
    PRO_OFF = PRO_OFF || probe.status() === 404;
    await context.dispose();
  });

  for (const path of ["/contratacr-pro", "/en/contratacr-pro"]) {
    test(`${path} is gated by the Pro flag`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      if (PRO_OFF) expect(response.status()).toBe(404);
      else expect(response.status()).toBe(200);
    });
  }

  test("offers Pro to a visitor without a session, with honest status labels and working CTAs", async ({ page }) => {
    test.skip(PRO_OFF, "Pro is off in this environment");
    await gotoOK(page, "/contratacr-pro");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Gestione su trabajo completo");
    await expect(page.locator("[data-pro-family]")).toHaveCount(8);
    const soon = page.locator("[data-pro-soon]");
    await expect(soon.getByRole("heading", { name: "Próximamente" })).toBeVisible();
    await expect(soon.getByRole("heading", { name: "En preparación" })).toBeVisible();
    for (const id of ["hero", "end"]) {
      const cta = page.locator(`[data-pro-landing-cta="${id}"]`);
      await expect(cta.getByRole("link", { name: "Crear cuenta profesional" })).toHaveAttribute("href", /\/registro\/profesional$/);
      await expect(cta.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", /\/login\?redirect=%2Fdashboard%2Fpro$/);
    }
    await expect(page.locator("main")).toContainText("se lanza gratis");
    await expect(page.locator("footer.ccr-app-footer").filter({ visible: true }).getByRole("link", { name: "ContrataCR Pro" }).first()).toHaveAttribute("href", /\/contratacr-pro$/);
    await expectNoHorizontalOverflow(page);
  });

  test("English version of the offer page", async ({ page }) => {
    test.skip(PRO_OFF, "Pro is off in this environment");
    await gotoOK(page, "/en/contratacr-pro");
    await expect(page.locator("[data-pro-family]")).toHaveCount(8);
    await expect(page.locator("[data-pro-landing-cta=hero]").getByRole("link", { name: "Create a professional account" })).toBeVisible();
    await expect(page.locator("[data-pro-soon]").getByRole("heading", { name: "In preparation" })).toBeVisible();
  });

  test("a professional with an account is sent to the Pro space", async ({ page }, info) => {
    test.skip(PRO_OFF, "Pro is off in this environment");
    test.setTimeout(240000);
    local(info.project.use.baseURL);
    const f = await ownerFixture(page.context(), "landing");
    try {
      await login(page.context(), f.owner);
      await page.goto("/contratacr-pro", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/dashboard\/pro/);
    } finally {
      await f.cleanup();
    }
  });
});
