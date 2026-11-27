import { test, expect } from "playwright/test";
import { expectNoHorizontalOverflow, gotoOK, isMobileProject, waitForInteractivePage } from "./helpers";
import { dirDb, hideSeededPlaces, label, seedPlace } from "./pro-dir-fixture";

// IA 2026-11-21 (owner decision): "Lugares" hub, "Para negocios y profesionales" page and the Categorias menu.
// Owner of those two pages in verify-app-surface-ownership.mjs. Needs the directory ON (DIR_ENABLED): without it the
// hubs answer 404 and the navbar keeps the classic "Explorar" menu (covered by public-smoke).
// The Categorías page offers a business tile only for a section whose total is above 0 (the total is cached on the server for
// ten minutes). The local stack has no OSM seed, so one synthetic published place is created before any test visits /servicios.
test.beforeAll(async () => {
  await seedPlace(dirDb(), { slug: `e2e-hubs-${label()}`, vertical: "restaurant", name: `E2E Hubs ${label()}`, adminArea1: "Heredia" });
});
test.afterAll(() => hideSeededPlaces());

for (const language of ["es", "en"] as const) {
  const prefix = language === "en" ? "/en" : "";

  test(`/lugares no longer exists: the old address goes to Categorías [${language}]`, async ({ page }) => {
    await page.goto(`${prefix}/lugares`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(new RegExp(`${prefix}/categorias$`));
    await expect(page.locator("[data-places-hub-group]")).toHaveCount(0);
  });

  test(`/negocios-y-profesionales no longer exists: old links go to the professional registration [${language}]`, async ({ page }) => {
    await page.goto(`${prefix}/negocios-y-profesionales`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(new RegExp(`${prefix}/registro/profesional$`));
  });
}

// Categorías (2026-11-23, Yelp style): the directory sections are a grid of brand tiles ("Empresas") ABOVE the professional
// categories, each section once; the professional groups no longer repeat them. A section whose total is a confirmed 0 is
// not offered, so the tiles asserted are the ones present, never a fixed list.
const ALL_SECTIONS = ["restaurantes", "cafes", "supermercados", "pulperias", "ferreterias", "farmacias", "gasolineras", "talleres", "parqueos", "lavacar", "bancos", "hospedaje", "atracciones", "tours", "salud", "gimnasios", "veterinarias", "belleza",
  "tiendas", "centros-comerciales", "mercados-y-carnicerias", "tramites", "educacion", "transporte"];

test("desktop navbar: Categorías is a link to the full page, with no dropdown and no business entry", async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), "Desktop navigation only");
  await page.setViewportSize({ width: 1366, height: 900 });
  await gotoOK(page, "/");
  const header = page.getByRole("banner");
  await expect(header.getByRole("button", { name: /^Lugares$/ })).toHaveCount(0);
  await expect(header.locator("[data-nav-business]")).toHaveCount(0);
  const link = header.getByRole("link", { name: /^Categorías$/ });
  await expect(link).toHaveAttribute("href", "/categorias");
  await link.click();
  await expect(page).toHaveURL(/\/categorias$/);
  await expect(page.getByTestId("services-mega-menu")).toHaveCount(0);
  // Two tabs (owner 2026-11-26): "Servicios" is open first with the professional groups; "Negocios" shows the business tiles, once each.
  await expect(page.getByTestId("services-group-option").first()).toBeVisible();
  await page.locator("[data-categorias-tab=negocios]").filter({ visible: true }).click();
  await expect(page.locator("[data-categorias-tab=negocios]").filter({ visible: true })).toHaveAttribute("aria-selected", "true");
  const tiles = page.locator("[data-place-tiles] [data-place-tile]");
  // The page renders a mobile and a desktop tree; only the one for this viewport is visible.
  await expect(tiles.filter({ visible: true }).first()).toBeVisible();
  for (const section of ALL_SECTIONS) expect(await page.locator(`[data-place-tile="${section}"]`).filter({ visible: true }).count(), section).toBeLessThanOrEqual(1);
  for (const tile of await tiles.all()) await expect(tile).toHaveAttribute("href", /^\/[a-z]+(?:-[a-z]+)*$/);
  await expect(page.locator("[data-nav-directory-section]")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("quick links row under the navbar: sections, Profesionales and Más, active state, keyboard", async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), "Desktop layout of the row");
  await page.setViewportSize({ width: 1280, height: 900 });
  await gotoOK(page, "/restaurantes");
  const row = page.getByRole("navigation", { name: /Accesos rápidos|Quick links/ });
  await expect(row).toBeVisible();
  await expect(row.locator('[data-quick-nav-link="restaurantes"]')).toHaveAttribute("aria-current", "page");
  await expect(row.locator('[data-quick-nav-link="farmacias"]')).toHaveAttribute("href", "/farmacias");
  await expect(row.locator('[data-quick-nav-link="pros"]')).toHaveAttribute("href", "/profesionales");
  await expect(row.locator('[data-quick-nav-link="more"]')).toHaveAttribute("href", "/categorias");
  await row.locator('[data-quick-nav-link="farmacias"]').focus();
  await expect(row.locator('[data-quick-nav-link="farmacias"]')).toBeFocused();
  await row.locator('[data-quick-nav-link="more"]').click();
  await expect(page).toHaveURL(/\/categorias$/);
  await expect(page.getByRole("navigation", { name: /Accesos rápidos|Quick links/ }).locator('[data-quick-nav-link="more"]')).toHaveAttribute("aria-current", "page");
  // The row is in flow: the fixed bar keeps its height (64px) and the row starts right below it.
  const bar = await page.getByTestId("landing-navbar").filter({ visible: true }).boundingBox();
  const strip = await page.locator("[data-quick-nav]").boundingBox();
  expect(bar!.height).toBeLessThanOrEqual(65);
  expect(Math.abs(strip!.y - (bar!.y + bar!.height))).toBeLessThanOrEqual(1);
  await expectNoHorizontalOverflow(page);
});

test("quick links row on phones: Profesionales, Restaurantes, Gasolineras, Farmacias and Más, without widening the page", async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), "Mobile only");
  await gotoOK(page, "/");
  const row = page.locator("[data-quick-nav]").filter({ visible: true });
  await expect(row).toHaveCount(1);
  const keys = await row.locator("[data-quick-nav-link]").evaluateAll((links) => links.map((l) => l.getAttribute("data-quick-nav-link")));
  expect(keys).toEqual(["pros", "restaurantes", "gasolineras", "farmacias", "more"]);
  await expectNoHorizontalOverflow(page);
});

test("footer: cookie and privacy settings is a discreet link in the legal row", async ({ page }) => {
  await gotoOK(page, "/");
  const footer = page.locator("footer.ccr-app-footer");
  const privacy = footer.getByRole("link", { name: /^Política de Privacidad$/ });
  const settings = footer.locator("[data-advertising-preferences]");
  await settings.scrollIntoViewIfNeeded();
  await expect(settings).toHaveText(/Configurar cookies y privacidad/);
  expect(await settings.evaluate((el) => getComputedStyle(el).fontSize)).toBe(await privacy.evaluate((el) => getComputedStyle(el).fontSize));
  expect(await settings.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("0px");
  await expectNoHorizontalOverflow(page);
});

test("mobile drawer: Categorías is a plain link to the full page and there is no business entry", async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), "Mobile navigation only");
  await gotoOK(page, "/");
  await waitForInteractivePage(page);
  await page.getByRole("button", { name: /Abrir men[uú]|Open menu|Mi cuenta y men[uú]|My account and menu/i }).filter({ visible: true }).first().click();
  const drawer = page.getByRole("dialog", { name: /Men[uú]|Menu/i });
  await expect(drawer.getByRole("link", { name: /^Categorías$|^Categories$/ })).toHaveAttribute("href", /\/categorias$/);
  await expect(drawer.getByRole("button", { name: /^Categorías$|^Categories$/ })).toHaveCount(0);
  await expect(drawer.getByRole("link", { name: /Para negocios y profesionales|For businesses and professionals/ })).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: /^Lugares$|^Places$/ })).toHaveCount(0);
});
