import { test, expect } from 'playwright/test';
import { gotoOK, waitForInteractivePage } from './helpers';

test('about pages explain the four sections and help topics open their answers', async ({ page }) => {
  await gotoOK(page, '/como-funciona');
  const main = page.locator('main');
  for (const href of ['/profesionales', '/proyectos', '/empleos', '/promociones']) {
    await expect(main.locator(`a[href="${href}"]`)).toBeVisible();
  }
  await expect(main).toContainText('cuenta de cliente o profesional');
  await gotoOK(page, '/ayuda');
  await waitForInteractivePage(page);
  await page.getByRole('navigation', {name:'Elige un tema'}).getByRole('button', {name:'Proyectos',exact:true}).click();
  await expect(page.locator('#faq-answer-6')).toBeVisible();
  await expect(page.locator('#faq-answer-6')).toContainText('cuenta de cliente o profesional');
  await page.getByRole('navigation', {name:'Elige un tema'}).getByRole('button', {name:'Descargar la app',exact:true}).click();
  await page.getByRole('button', {name:'Ver opciones de descarga',exact:true}).click();
  await expect(page.locator('#descargar-app')).toBeInViewport();
  for (const route of ['/mejorar-mi-perfil','/soporte','/en/como-funciona','/en/ayuda']) {
    await gotoOK(page, route);
    await expect(page.locator('main h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
