// Isolated: synthetic data through tests/locations/serve-preview.mjs (port 3195); no auth or production I/O.
import { chromium, webkit, expect } from 'playwright/test';
const base = 'http://127.0.0.1:3195';
for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch();
  try {
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      // Public profile: one block per modality, areas named by geography, no first-person copy.
      await page.goto(`${base}/?info`);
      const info = page.locator('[data-service-modalities]');
      await expect(info.locator('[data-service-modality]')).toHaveText([/En sus locales/, /A domicilio/, /Por videollamada/]);
      await expect(info.locator('[data-service-modality="local"] li')).toHaveCount(2);
      await expect(info.locator('[data-service-modality="local"]')).toContainText('Otra dirección de ejemplo'); // saved hidden before: shown now
      await expect(info.locator('[data-service-modality="domicilio"] li')).toHaveText(['Atenas, Alajuela', 'Heredia (toda la provincia)']);
      await expect(info.locator('[data-service-modality="video"]')).toContainText('En todo Costa Rica');
      await expect(info).not.toContainText('mi local');
      await expect(info).not.toContainText('Cobertura Atenas');
      // Maps and Waze: same 36px circle as the social links, original icons.
      const row = page.locator('[data-social-row]');
      const boxes = await row.locator(':scope > a, [data-directions-provider] > summary').evaluateAll(els => els.map(e => [Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)]));
      expect(boxes).toEqual([[36, 36], [36, 36], [36, 36]]);
      const srcs = await row.locator('img').evaluateAll(els => els.map(e => [e.getAttribute('src'), e.naturalWidth > 0, Math.round(e.getBoundingClientRect().width)]));
      expect(srcs).toEqual([['/brand/maps/google-maps.png', true, 20], ['/brand/waze/waze-icon.png', true, 20]]);
      await page.screenshot({ path: `/tmp/ccr-public-workplaces/${name}-${width}-info.png`, fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

      // Editor: no zone subtitle, one row per area, address keeps the card width.
      await page.evaluate(() => sessionStorage.removeItem('locations'));
      await page.goto(`${base}/?editor&multi`);
      await expect(page.getByText('Elegí las zonas donde atendés.')).toHaveCount(0);
      await expect(page.getByRole('switch', { name: /Mostrar dirección/ })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Quitar / })).toHaveText(['', '', '']);
      await expect(page.getByRole('button', { name: 'Quitar Atenas, Alajuela' })).toHaveCount(1);
      await expect(page.getByText('Segunda sede', { exact: true })).toHaveCount(1);
      const card = await page.getByText('Otra dirección', { exact: true }).evaluate(el => {
        const row = el.closest('.overflow-hidden'); return [el.getBoundingClientRect().width, row.getBoundingClientRect().width, el.getBoundingClientRect().height];
      });
      expect(card[0] / card[1]).toBeGreaterThan(0.6);
      expect(card[2]).toBeLessThanOrEqual(22);
      await expect(page.getByRole('button', { name: 'Editar ubicación', exact: true })).toHaveCount(2);
      // Removing the area removes every saved copy of it; re-adding is not reported as duplicate.
      await page.getByRole('button', { name: 'Quitar Atenas, Alajuela' }).click();
      await expect(page.getByRole('button', { name: 'Quitar Atenas, Alajuela' })).toHaveCount(0);
      await expect(page.getByText('Nueva zona de atención')).toBeVisible();
      await page.getByRole('button', { name: 'Elegí una provincia' }).click();
      await page.getByRole('option', { name: 'Alajuela' }).click();
      await page.getByRole('button', { name: 'Elegí un cantón' }).click();
      await page.getByRole('option', { name: 'Atenas' }).click();
      await page.getByRole('button', { name: 'Agregar zona', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Quitar Atenas, Alajuela' })).toHaveCount(1);
      await page.getByRole('button', { name: 'Agregar otra zona' }).click();
      await page.getByRole('button', { name: 'Elegí una provincia' }).click();
      await page.getByRole('option', { name: 'Alajuela' }).click();
      await page.getByRole('button', { name: 'Elegí un cantón' }).click();
      await page.getByRole('option', { name: 'Atenas' }).click();
      await page.getByRole('button', { name: 'Agregar zona', exact: true }).click();
      await expect(page.getByText('Esta zona ya está agregada.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Quitar Atenas, Alajuela' })).toHaveCount(1);
      await page.screenshot({ path: `/tmp/ccr-public-workplaces/${name}-${width}-editor.png`, fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      expect(errors).toEqual([]);
      await page.close();
      console.log(`PASS ${name} ${width}px: modalities by type, 36px Maps/Waze icons, grouped areas, duplicate check, address width`);
    }
  } finally { await browser.close(); }
}
