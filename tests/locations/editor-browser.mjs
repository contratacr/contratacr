import { chromium, webkit, expect } from 'playwright/test';

for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('http://127.0.0.1:3195/?editor&multi');
    await expect(page.getByRole('switch', { name: 'Recibo clientes en un lugar' })).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Voy donde el cliente' })).toBeVisible();
    await expect(page.getByText('Segunda sede', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Sede de ejemplo').first()).toBeVisible();
    await expect(page.getByText('Nueva zona de atención')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Agregar otro lugar' })).toBeVisible();
    await page.getByRole('button', { name: 'Agregar otro lugar' }).click();
    await expect(page.getByRole('button', { name: 'Cancelar edición' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar edición' }).click();
    await expect(page.getByRole('button', { name: 'Agregar otro lugar' })).toBeVisible();
    await page.getByRole('button', { name: 'Agregar otra zona' }).click();
    await page.getByRole('button', { name: 'Un cantón', exact: true }).click();
    await page.getByRole('option', { name: 'Toda una provincia' }).click();
    await page.getByRole('button', { name: 'Elegí una provincia' }).click();
    await page.getByRole('option', { name: 'Heredia' }).click();
    await page.getByRole('button', { name: 'Agregar zona', exact: true }).click();
    await expect(page.getByText('Heredia', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Agregar otra zona' })).toBeVisible();
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    expect(JSON.parse(await page.locator('[data-saved-locations]').textContent()).some(place => place.level === 'provincia' && place.provinciaId === 'he')).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
    console.log(`PASS ${name}: separate compact lists, add and cancel local, add whole province, save, mobile width`);
  } finally { await browser.close(); }
}
