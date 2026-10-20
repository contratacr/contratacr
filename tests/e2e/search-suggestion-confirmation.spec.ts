import { test, expect } from "playwright/test";
import { gotoOK, waitForInteractivePage } from "./helpers";

for (const locationFirst of [false, true]) {
  test(`second suggestion submits immediately (${locationFirst ? "location" : "service"} first)`, async ({ page }) => {
    await gotoOK(page, "/profesionales");
    await waitForInteractivePage(page);
    const mobile = (page.viewportSize()?.width ?? 1280) < 1024;
    if (mobile) await page.evaluate(() => window.dispatchEvent(new CustomEvent("ccr:open-native-search")));
    const service = page.getByRole("combobox", { name: "Servicio", exact: true }).filter({ visible: true }).first();
    const location = page.getByRole("combobox", { name: "Ubicación", exact: true }).filter({ visible: true }).first();
    const before = page.url();
    const selectService = async () => {
      await service.fill("Desarrollo web");
      await page.getByRole("option").filter({ hasText: /^Desarrollo web/ }).filter({ visible: true }).first().click();
    };
    const selectLocation = async () => {
      await location.fill("Alajuela");
      await page.getByRole("option").filter({ hasText: /^Alajuela/ }).filter({ visible: true }).first().click();
    };
    if (locationFirst) {
      await selectLocation();
      await expect(service).toBeFocused();
      expect(page.url()).toBe(before);
      await selectService();
    } else {
      await selectService();
      await expect(location).toBeFocused();
      expect(page.url()).toBe(before);
      await selectLocation();
    }
    await expect(page).toHaveURL(/\/profesionales\/desarrollo-web\/alajuela/);
    if (mobile) await expect(page.locator(".ccr-native-search-panel")).toHaveCount(0);
  });
}

test("a recent service submits immediately with an existing location", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) >= 1024, "Recent services live in the mobile sheet");
  await page.addInitScript(() => localStorage.setItem("ccr-search-recents", JSON.stringify([{ termino: "Desarrollo web", at: Date.now() }])));
  await gotoOK(page, "/profesionales?provincia=al");
  await waitForInteractivePage(page);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("ccr:open-native-search")));
  const panel = page.locator(".ccr-native-search-panel");
  await panel.getByRole("button", { name: "Desarrollo web", exact: true }).click();
  await expect(page).toHaveURL(/\/profesionales\/desarrollo-web\/alajuela/);
});

test("desktop home submits when a suggestion completes both fields", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 1024, "Desktop home fields; mobile uses the sheet");
  await gotoOK(page, "/");
  await waitForInteractivePage(page);
  const hero = page.locator(".ccr-hero-foto");
  const service = hero.getByRole("combobox").nth(0);
  const location = hero.getByRole("combobox").nth(1);
  const before = page.url();
  await location.fill("Alajuela");
  await page.getByRole("option").filter({ hasText: /^Alajuela/ }).filter({ visible: true }).first().click();
  expect(page.url()).toBe(before);
  await service.fill("Desarrollo web");
  await page.getByRole("option").filter({ hasText: /^Desarrollo web/ }).filter({ visible: true }).first().click();

  await expect(page).toHaveURL(/\/profesionales\/desarrollo-web\/alajuela/);
});

for (const field of ["Servicio", "Ubicación"]) {
  test(`Enter submits ${field} immediately with suggestions open`, async ({ page }) => {
    await gotoOK(page, "/profesionales");
    await waitForInteractivePage(page);
    if ((page.viewportSize()?.width ?? 1280) < 1024) await page.evaluate(() => window.dispatchEvent(new CustomEvent("ccr:open-native-search")));
    const service = page.getByRole("combobox", { name: "Servicio", exact: true }).filter({ visible: true }).first();
    const location = page.getByRole("combobox", { name: "Ubicación", exact: true }).filter({ visible: true }).first();
    const input = field === "Servicio" ? service : location;
    await input.fill(field === "Servicio" ? "Desarrollo web" : "Alajuela");
    await input.press("Enter");
    if (field === "Servicio") {
      await expect(page).toHaveURL(/\/profesionales\/desarrollo-web(?:[/?#]|$)/);
    } else {
      await expect(page).toHaveURL(/(?:provincia=al|\/alajuela)/);
    }
  });
}

test("a recent professional opens directly without requiring search fields", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) >= 1024, "Recent profiles live in the mobile sheet");
  await gotoOK(page, "/profesionales");
  await waitForInteractivePage(page);
  const href = await page.locator("article h3 a").first().getAttribute("href");
  expect(href).toBeTruthy();
  await page.evaluate(href => localStorage.setItem("ccr-recent-visits:profesionales", JSON.stringify([{id:"test-recent",titulo:"Profesional reciente",href,at:Date.now()}])), href);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("ccr:open-native-search")));
  await page.locator(".ccr-native-search-panel").getByRole("link", { name: "Profesional reciente" }).click();
  await expect(page).toHaveURL(new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

for (const field of ["Servicio", "Ubicación"]) {
  test(`home: Enter in the empty field searches with ${field} alone`, async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 1280) < 1024, "Mobile home uses the shared navbar sheet");
    await gotoOK(page, "/");
    await waitForInteractivePage(page);
    const fields = page.locator(".ccr-hero-foto").getByRole("combobox");
    const filled = fields.nth(field === "Servicio" ? 0 : 1);
    const empty = fields.nth(field === "Servicio" ? 1 : 0);
    await filled.fill(field === "Servicio" ? "Desarrollo web" : "Alajuela");
    await empty.focus();
    await empty.press("Enter");
    if (field === "Servicio") await expect(page).toHaveURL(/\/profesionales\/desarrollo-web(?:[/?#]|$)/);
    else await expect(page).toHaveURL(/(?:provincia=al|\/alajuela)/);
  });
}

for (const field of ["Servicio", "Ubicación"]) {
  test(`Enter with both fields empty submits all professionals from ${field}`, async ({ page }) => {
    await gotoOK(page, "/profesionales?provincia=al");
    await waitForInteractivePage(page);
    const mobile = (page.viewportSize()?.width ?? 1280) < 1024;
    if (mobile) await page.evaluate(() => window.dispatchEvent(new CustomEvent("ccr:open-native-search")));
    const service = page.getByRole("combobox", { name: "Servicio", exact: true }).filter({ visible: true }).first();
    const location = page.getByRole("combobox", { name: "Ubicación", exact: true }).filter({ visible: true }).first();
    await service.fill(""); await location.fill("");
    await (field === "Servicio" ? service : location).press("Enter");
    await expect(page).toHaveURL(/\/profesionales\/?$/);
    if (mobile) await expect(page.locator(".ccr-native-search-panel")).toHaveCount(0);
  });
}


test("a recent service alone focuses location; the second selection submits", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) >= 1024, "Mobile recents");
  await page.addInitScript(() => localStorage.setItem("ccr-search-recents", JSON.stringify([{ termino: "Desarrollo web", at: Date.now() }])));
  await gotoOK(page, "/profesionales");await waitForInteractivePage(page);
  const before = page.url();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("ccr:open-native-search")));
  const panel = page.locator(".ccr-native-search-panel");
  await panel.getByRole("button", { name: "Desarrollo web", exact: true }).click();
  const location = panel.getByRole("combobox", { name: "Ubicación", exact: true });
  await expect(location).toBeFocused();expect(page.url()).toBe(before);
  await location.fill("Alajuela");
  await panel.getByRole("option").filter({ hasText: /^Alajuela/ }).first().click();
  await expect(page).toHaveURL(/\/profesionales\/desarrollo-web\/alajuela/);
});

for (const changeService of [true, false]) test(`replacing the ${changeService ? "service" : "location"} submits the fresh selection`, async ({ page }) => {
  await gotoOK(page, changeService ? "/profesionales?categoria=redes_internet&provincia=al" : "/profesionales/desarrollo-web/alajuela");
  await waitForInteractivePage(page);
  if ((page.viewportSize()?.width ?? 1280) < 1024) await page.evaluate(() => window.dispatchEvent(new CustomEvent("ccr:open-native-search")));
  const field = page.getByRole("combobox", { name: changeService ? "Servicio" : "Ubicación", exact: true }).filter({ visible: true }).first();
  await field.fill(changeService ? "Desarrollo web" : "Heredia");
  await page.getByRole("option").filter({ hasText: changeService ? /^Desarrollo web/ : /^Heredia/ }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(changeService ? /\/profesionales\/desarrollo-web\/alajuela/ : /\/profesionales\/desarrollo-web\/heredia/);
});

test("near me completes the search and a later place selection replaces its coordinates", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) >= 1024, "Mobile location sheet");
  await page.addInitScript(() => Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: (ok: (position: unknown) => void) => ok({coords:{latitude:9.99,longitude:-84.2}}) } }));
  await gotoOK(page, "/profesionales/desarrollo-web/alajuela");await waitForInteractivePage(page);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("ccr:open-native-search")));
  let panel = page.locator(".ccr-native-search-panel");
  await panel.getByRole("combobox", { name: "Ubicación", exact: true }).fill("");
  await panel.getByRole("button", { name: /Buscar cerca de mí/ }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("lat")).toBe("9.99000");
  await waitForInteractivePage(page);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("ccr:open-native-search")));
  panel = page.locator(".ccr-native-search-panel");
  await panel.getByRole("combobox", { name: "Ubicación", exact: true }).fill("Heredia");
  await panel.getByRole("option").filter({ hasText: /^Heredia/ }).first().click();
  await expect(page).toHaveURL(/\/profesionales\/desarrollo-web\/heredia/);
  expect(new URL(page.url()).searchParams.has("lat")).toBe(false);
});
