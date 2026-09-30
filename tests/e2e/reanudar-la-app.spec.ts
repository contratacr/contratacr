import { expect, test } from "playwright/test";
import { expectHealthyPage, gotoOK, loginAs, waitForInteractivePage } from "./helpers";
import { canRunSeededRegression, E2E_USERS } from "./seed";

/**
 * LA APP SIGUE RESPONDIENDO AL VOLVER.
 *
 * Isaac dejó la app abierta unos minutos y al retomarla no reaccionaba: hubo
 * que cerrarla y abrirla. Eso pasa cuando el sistema congela la pestaña (o la
 * WebView), se cae la red un rato, o la sesión se refresca en medio, y algo
 * queda esperando una respuesta que nunca llega. Aquí se provoca lo mismo:
 *
 *  1. se corta la red unos segundos y vuelve;
 *  2. la página pasa a oculta y vuelve a visible (lo que hace el sistema al
 *     cambiar de app), con «pageshow» restaurado desde la memoria;
 *
 * y después se exige lo que exigiría una persona: que un toque navegue, que
 * una petición al servidor conteste en menos de 8 s y que no haya quedado
 * ningún error ni una pantalla en blanco. Corre sin sesión (búsqueda, la
 * pantalla más pesada) y, cuando hay datos sembrados, con sesión en el panel.
 * Con la cookie de la app nativa también, que es donde se vio.
 */

const ESPERA_RED_CAIDA_MS = 3_000;
const RESPUESTA_MAX_MS = 8_000;

async function irYVolver(page: import("playwright/test").Page) {
  // 1. Corte de red y regreso.
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await page.waitForTimeout(ESPERA_RED_CAIDA_MS);
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  // 2. Oculta → visible, como al cambiar de app, y «pageshow» desde la memoria.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
}

async function sigueRespondiendo(page: import("playwright/test").Page) {
  // El servidor contesta desde la página (no desde Playwright) y rápido.
  const tardo = await page.evaluate(async (max) => {
    const inicio = performance.now();
    const r = await fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(max) });
    return r.ok ? Math.round(performance.now() - inicio) : -r.status;
  }, RESPUESTA_MAX_MS);
  expect(tardo, `/api/health tardó ${tardo} ms tras reanudar`).toBeGreaterThanOrEqual(0);
  expect(tardo).toBeLessThanOrEqual(RESPUESTA_MAX_MS);

  // Y la pantalla sigue viva: hay contenido y un enlace navega.
  await expect(page.locator("body")).not.toBeEmpty();
  const enlace = page.locator('a[href*="/servicios"], a[href*="/ayuda"]').filter({ visible: true }).first();
  if (await enlace.count()) {
    await Promise.all([
      page.waitForURL(/\/(servicios|ayuda)/, { timeout: 15_000, waitUntil: "domcontentloaded" }),
      enlace.click(),
    ]);
  }
  await waitForInteractivePage(page);
  await expectHealthyPage(page);
}

test.describe("@smoke reanudar la app", () => {
  for (const nativa of [false, true]) {
    test(`la búsqueda sigue respondiendo tras un corte de red y volver del segundo plano${nativa ? " (app)" : ""}`, async ({ page, context }) => {
      test.setTimeout(120_000);
      if (nativa) {
        await context.addCookies([{ name: "ccr_platform", value: "native", url: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000" }]);
        await page.addInitScript(() => localStorage.setItem("ccr:native-first-run-onboarding:v12", "1"));
      }
      await gotoOK(page, "/profesionales/todos");
      await waitForInteractivePage(page);
      await irYVolver(page);
      await sigueRespondiendo(page);
    });
  }

  test("el panel con sesión sigue respondiendo tras volver del segundo plano", async ({ page }) => {
    test.skip(!canRunSeededRegression(), "Necesita las cuentas de regresión.");
    test.setTimeout(120_000);
    await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);
    await gotoOK(page, "/dashboard/profesional");
    await waitForInteractivePage(page);
    await irYVolver(page);
    await sigueRespondiendo(page);
    // La sesión no se perdió en el camino.
    await expect(page.locator("body")).not.toContainText(/Ingresa a tu cuenta|Log in to your account/);
  });
});
