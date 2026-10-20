import { test, expect } from "playwright/test";
import { gotoOK, waitForInteractivePage } from "./helpers";

for (const locationFirst of [false, true]) {
  test(`suggestions fill fields without navigating (${locationFirst ? "location" : "service"} first)`, async ({ page }) => {
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
      await expect(service).toHaveValue("Desarrollo web");
      await expect(location).toBeFocused();
      expect(page.url()).toBe(before);
    };
    const selectLocation = async () => {
      await location.fill("Alajuela");
      await page.getByRole("option").filter({ hasText: /^Alajuela/ }).filter({ visible: true }).first().click();
      await expect(location).toHaveValue(/Alajuela/);
      await expect((await service.inputValue()) ? location : service).toBeFocused();
      expect(page.url()).toBe(before);
    };
    if (locationFirst) { await selectLocation(); await selectService(); }
    else { await selectService(); await selectLocation(); }
    await expect(page.getByRole("combobox", { name: "Servicio", exact: true }).filter({ visible: true }).first()).toHaveValue("Desarrollo web");
    if (mobile) {
      await expect(page.locator(".ccr-native-search-panel").getByRole("button", { name: "Buscar profesionales", exact: true })).toHaveCount(0);
      await location.press("Enter");
    } else await page.getByRole("button", { name: "Buscar", exact: true }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/profesionales\/desarrollo-web\/alajuela/);
  });
}

test("a recent service fills the sheet without submitting the previous render", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) >= 1024, "Recent services live in the mobile sheet");
  await page.addInitScript(() => localStorage.setItem("ccr-search-recents", JSON.stringify([{ termino: "Desarrollo web", at: Date.now() }])));
  await gotoOK(page, "/profesionales?provincia=al");
  await waitForInteractivePage(page);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("ccr:open-native-search")));
  const panel = page.locator(".ccr-native-search-panel");
  const before = page.url();
  await panel.getByRole("button", { name: "Desarrollo web", exact: true }).click();
  await expect(panel.getByRole("combobox", { name: "Servicio", exact: true })).toHaveValue("Desarrollo web");
  expect(page.url()).toBe(before);
  await panel.getByRole("combobox", { name: "Ubicación", exact: true }).press("Enter");
  await expect(page).toHaveURL(/\/profesionales\/desarrollo-web\/alajuela/);
});

test("desktop home suggestions also wait for the search button", async ({ page }) => {
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
  await expect(service).toHaveValue("Desarrollo web");
  expect(page.url()).toBe(before);
  await hero.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page).toHaveURL(/\/profesionales\/desarrollo-web\/alajuela/);
});

for (const field of ["Servicio", "Ubicación"]) {
  test(`incomplete ${field} search moves focus to the missing field`, async ({ page }) => {
    await gotoOK(page, "/profesionales");
    await waitForInteractivePage(page);
    if ((page.viewportSize()?.width ?? 1280) < 1024) await page.evaluate(() => window.dispatchEvent(new CustomEvent("ccr:open-native-search")));
    const service = page.getByRole("combobox", { name: "Servicio", exact: true }).filter({ visible: true }).first();
    const location = page.getByRole("combobox", { name: "Ubicación", exact: true }).filter({ visible: true }).first();
    const input = field === "Servicio" ? service : location;
    const missing = field === "Servicio" ? location : service;
    const before = page.url();
    await input.fill(field === "Servicio" ? "Desarrollo web" : "Alajuela");
    await input.press("Escape");
    await input.press("Enter");
    await expect(missing).toBeFocused();
    expect(page.url()).toBe(before);
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
