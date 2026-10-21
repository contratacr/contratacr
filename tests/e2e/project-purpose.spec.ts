import { test, expect } from 'playwright/test';
import { gotoOK, waitForInteractivePage } from './helpers';

for (const locale of ['es', 'en'] as const) {
  test(`project fields explain that a client needs a professional (${locale})`, async ({ page }) => {
    await gotoOK(page, `${locale === 'en' ? '/en' : ''}/publicar-proyecto`);
    await waitForInteractivePage(page);
    await expect(page.locator('#publish-project-title')).toHaveText(locale === 'es' ? 'Cuéntenos sobre su proyecto' : 'Tell us about your project');
    await expect(page.getByText(locale === 'es' ? 'Publique el trabajo que necesita para recibir contactos de profesionales.' : 'Post the work you need done so professionals can contact you.')).toHaveCount(0);
    await expect(page.getByRole('link', { name: locale === 'es' ? '¿Quiere ofrecer sus servicios? Agréguelos a su perfil.' : 'Want to offer your services? Add them to your profile.' })).toHaveCount(0);
    await expect(page.getByText(locale === 'es' ? '¿Qué servicio necesita?' : 'What service do you need?')).toBeVisible();
    await expect(page.getByText(locale === 'es' ? '¿Qué necesita que haga el profesional?' : 'What do you need the professional to do?')).toBeVisible();
    await expect(page.getByPlaceholder(locale === 'es' ? 'Ej.: Necesito reparar una moto que no enciende.' : 'e.g. I need to repair a motorcycle that won’t start.')).toBeVisible();
    await expect(page.getByRole('button', { name: locale === 'es' ? 'Publicar proyecto' : 'Post project', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const locale of ['es', 'en'] as const) {
  test(`project board keeps its section name without the explanatory subtitle (${locale})`, async ({ page }) => {
    await gotoOK(page, `${locale === 'en' ? '/en' : ''}/proyectos`);
    await waitForInteractivePage(page);
    await expect(page.getByText(locale === 'es' ? 'Trabajos que los clientes necesitan realizar' : 'Work that clients need done')).toHaveCount(0);
    await expect(page.getByRole('link', { name: locale === 'es' ? 'Publicar un proyecto' : 'Post a project', exact: true }).filter({ visible: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
