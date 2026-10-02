import { expect, test, type Page } from "playwright/test";
import { gotoOK, isMobileProject, waitForInteractivePage } from "./helpers";

// LO NUEVO DEL 1-OCT-2026: cabecera sin íconos sin sesión, menú a pantalla
// completa, marcas que abren su perfil, Mensajes en la barra de abajo de la app
// y la flecha del perfil que no existe. Todo sin sesión y sin crear datos.

function comoApp(page: Page) {
  return page.addInitScript(() => {
    window.localStorage.setItem("ccr:native-first-run-onboarding:v12", "1");
    const rt: Record<string, unknown> = { isNativePlatform: () => true };
    Object.defineProperty(window, "Capacitor", { configurable: true, get: () => rt, set: (v) => { if (v && typeof v === "object") Object.assign(rt, v); rt.isNativePlatform = () => true; } });
  });
}

test.describe("portada y menú (1-oct-2026) @smoke", () => {
  test("sin sesión, la cabecera del teléfono solo lleva el logo y el menú", async ({ page }) => {
    test.skip(!isMobileProject(test.info()), "Cabecera del teléfono.");
    await gotoOK(page, "/");
    await expect(page.locator("header a[aria-label='Mensajes']:visible")).toHaveCount(0);
    await expect(page.locator("header a[aria-label='Ingresar']:visible")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Abrir men[uú]/i }).filter({ visible: true }).first()).toBeVisible();
  });

  test("el menú se abre a pantalla completa y se cierra con la X", async ({ page }) => {
    test.skip(!isMobileProject(test.info()), "Menú del teléfono.");
    await gotoOK(page, "/");
    await waitForInteractivePage(page);
    const menu = page.locator(".ccr-menu-completo.ccr-menu-abierto");
    // Un toque antes de hidratar se pierde: se reintenta hasta que abra.
    await expect(async () => {
      await page.getByRole("button", { name: /Abrir men[uú]/i }).filter({ visible: true }).first().click();
      await expect(menu).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    await expect.poll(() => menu.evaluate((e) => Math.round(e.getBoundingClientRect().x))).toBe(0);
    await expect(menu.getByRole("link", { name: /^Ingresar$/ })).toBeVisible();
    await expect(menu.getByRole("link", { name: /^Registrarme$/ })).toHaveAttribute("href", /\/registro/);
    await expect(menu.getByRole("link", { name: /^Términos$/ })).toBeVisible();
    await menu.getByRole("button", { name: /Ayuda y soporte/ }).click();
    await expect(menu.getByRole("link", { name: /Preguntas frecuentes/ })).toBeVisible();
    await menu.getByRole("button", { name: /Cerrar men[uú]/ }).click();
    await expect(page.locator(".ccr-menu-completo.ccr-menu-abierto")).toHaveCount(0);
  });

  test("cada marca de la cinta enlaza al perfil de su negocio", async ({ page }) => {
    await gotoOK(page, "/");
    const enlaces = await page.locator(".featured-brands-ribbon a[data-brand-slug]").evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")))]);
    expect(enlaces.length).toBeGreaterThanOrEqual(9);
    for (const href of enlaces) expect(href).toMatch(/^\/(en\/)?profesionales\/[a-z0-9-]+$/);
  });

  test("perfil que no existe: la flecha vuelve y no hay «···»", async ({ page }) => {
    test.skip(!isMobileProject(test.info()), "Cabecera del teléfono.");
    await comoApp(page);
    await gotoOK(page, "/");
    await page.goto("/profesionales/no-existe-e2e-zz");
    await expect(page.getByRole("heading", { name: /Perfil no encontrado/ })).toBeVisible();
    await expect(page.locator("[data-ccr-section-menu]")).toHaveCount(0);
    await page.locator("[data-ccr-section-back]").click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("en la app, Mensajes está en la barra de abajo y sin sesión pide entrar", async ({ page }) => {
    test.skip(!isMobileProject(test.info()), "Barra de la app.");
    await comoApp(page);
    await gotoOK(page, "/");
    const nav = page.locator("nav.ccr-native-bottom-nav");
    await expect(nav).toBeVisible();
    const mensajes = nav.getByRole("link", { name: "Mensajes" });
    await expect(mensajes).toHaveAttribute("href", /\/login\?redirect=%2Fmensajes/);
    await expect(nav.getByRole("button", { name: "Asistente" })).toHaveCount(0);
  });

  test("los videos de la guía están silenciados y corren solos", async ({ page }) => {
    await gotoOK(page, "/");
    await page.locator("h2", { hasText: /Así se usa|How ContrataCR works/ }).scrollIntoViewIfNeeded();
    const activo = page.locator("video.ccr-guia-video.opacity-100").first();
    await expect(activo).toBeVisible();
    // Lo que Safari exige para reproducir solo: silenciado y en línea. (El Chromium
    // de Playwright no trae el códec H.264, así que no se mide la reproducción.)
    expect(await activo.evaluate((v: HTMLVideoElement) => v.muted && v.hasAttribute("muted") && v.hasAttribute("playsinline"))).toBe(true);
  });

  test("las secciones de abajo de la portada se ven al bajar", async ({ page }) => {
    await gotoOK(page, "/");
    const zona = page.locator("h2", { hasText: /Encuentra profesionales en tu zona|Find professionals in your area/ });
    await zona.scrollIntoViewIfNeeded();
    await expect.poll(() => zona.evaluate((e) => Number(getComputedStyle(e.closest("section") ?? e).opacity))).toBe(1);
  });
});
