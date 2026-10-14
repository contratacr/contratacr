import { test, expect } from 'playwright/test';
import { gotoOK } from './helpers';

test('content canvases stay white on public sections', async ({ page }) => {
  for (const route of ['/ayuda', '/servicios', '/registro', '/login', '/proyectos', '/promociones', '/empleos', '/privacidad']) {
    await gotoOK(page, route);
    await expect(page.locator('main').first()).toBeVisible();
    const grayContainers = await page.locator('main').first().evaluate(main => {
      return [main, ...main.querySelectorAll('section, aside, form, div')].flatMap(element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        // Media placeholders, loading indicators and semantic states are intentional.
        if (rect.width < 150 || rect.height < 80 || element.closest('[aria-busy="true"], [role="status"]') || /animate-pulse|aspect-|overflow-hidden/.test(element.className)) return [];
        const rgb = style.backgroundColor.match(/^rgb\((\d+), (\d+), (\d+)\)$/);
        if (!rgb) return [];
        const channels = rgb.slice(1).map(Number);
        const neutral = Math.max(...channels) - Math.min(...channels) <= 12;
        return neutral && Math.min(...channels) >= 230 && Math.max(...channels) < 255
          ? [`${element.tagName}: ${style.backgroundColor} ${element.className}`] : [];
      });
    });
    expect(grayContainers, route).toEqual([]);
  }
});
