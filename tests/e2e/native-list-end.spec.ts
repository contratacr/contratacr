import { test, expect } from 'playwright/test';

for (const route of ['/buscar', '/buscar?categoria=redes_internet', '/promociones', '/empleos', '/proyectos']) {
  test(`último resultado accesible sobre el menú: ${route}`, async ({ page, context, baseURL }) => {
    test.skip((page.viewportSize()?.width ?? 1280) >= 1024, 'El menú inferior pertenece al diseño móvil.');
    await context.addCookies([{ name: 'ccr_platform', value: 'native', url: baseURL! }]);
    await page.addInitScript(() => {
      localStorage.setItem('ccr:native-first-run-onboarding:v12', '1');
      const runtime: Record<string, unknown> = { isNativePlatform: () => true };
      Object.defineProperty(window, 'Capacitor', {
        configurable: true, get: () => runtime,
        set: (value) => { Object.assign(runtime, value); runtime.isNativePlatform = () => true; },
      });
    });
    await page.goto(route);
    const nav = page.locator('.ccr-barra-flotante-pastilla');
    await expect(nav).toBeVisible();
    const list = page.locator(route.startsWith('/buscar') ? '.ccr-search-sheet-scroll' : '.ccr-lista-tablero').first();
    await expect(list).toBeVisible();
    await expect(list.locator('article').first()).toBeVisible();
    // Infinite lists may append a batch as we reach the end: keep scrolling
    // until the last card is stable before measuring its visible clearance.
    for (let i = 0; i < 60; i++) {
      await list.evaluate(el => { el.scrollTop = el.scrollHeight; });
      await page.waitForTimeout(500);
      if (await list.locator('[data-search-load-more], [data-marketplace-has-more], [role="status"]').count() === 0) break;
    }
    await expect(list.locator('[data-search-load-more], [data-marketplace-has-more], [role="status"]')).toHaveCount(0);
    await list.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(200);
    // Virtualized cards are revealed over several frames after the final
    // response. Keep reaching the end while their measured heights settle.
    let lastMeasurement: unknown;
    try { await expect.poll(async () => {
      await list.evaluate(el => { el.scrollTop = el.scrollHeight; });
      const last = list.locator('article').last();
      const cardBox = await last.boundingBox();
      const navBox = await nav.boundingBox();
      if (!cardBox || !navBox) return false;
      const boundary = await page.evaluate(() => document.body.classList.contains("ccr-native-bottom-nav-hidden") ? (visualViewport?.height ?? innerHeight) : null);
      const gap = (boundary ?? navBox.y) - (cardBox.y + cardBox.height);
      const overflow = await list.evaluate(el => el.scrollHeight - el.clientHeight);
      lastMeasurement = { gap, overflow, cardBox, navBox, list: await list.evaluate(el => ({box:el.getBoundingClientRect().toJSON(),padding:getComputedStyle(el).paddingBottom,bar:getComputedStyle(el).getPropertyValue("--ccr-barra-flotante"),tail:getComputedStyle(el).getPropertyValue("--ccr-cola-fuera")})), viewport: await page.evaluate(() => ({ innerHeight, visual: visualViewport?.height, scrollY, keyboard: document.documentElement.getAttribute("data-keyboard-visible"), bodyClass: document.body.className })) };
      return gap >= 8 && (overflow <= 10 || gap <= 24);
    }, { timeout: 15000, message: 'La última tarjeta debe quedar 8–24 px sobre el menú, sin reserva duplicada', intervals: [300, 500, 1000] }).toBe(true); } catch (error) { console.error(JSON.stringify(lastMeasurement)); throw error; }

  });
}
