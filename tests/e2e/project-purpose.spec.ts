import { test, expect } from 'playwright/test';
import { gotoOK, waitForInteractivePage } from './helpers';

for (const locale of ['es', 'en'] as const) {
  test(`project publishing explains requests and points service providers to their profile (${locale})`, async ({ page }) => {
    await gotoOK(page, `${locale === 'en' ? '/en' : ''}/publicar-proyecto`);
    await waitForInteractivePage(page);
    await expect(page.locator('#publish-project-title')).toHaveText(locale === 'es' ? '¿En qué consiste su proyecto?' : 'What is your project about?');
    await expect(page.getByText(locale === 'es' ? 'Publique el trabajo que necesita para recibir contactos de profesionales.' : 'Post the work you need done so professionals can contact you.')).toBeVisible();
    const offer = page.getByRole('link', { name: locale === 'es' ? '¿Quiere ofrecer sus servicios? Agréguelos a su perfil.' : 'Want to offer your services? Add them to your profile.' });
    await expect(offer).toBeVisible();
    await expect(offer).toHaveAttribute('href', /\/registro\/profesional$/);
    await expect(page.getByPlaceholder(locale === 'es' ? 'Ej.: Necesito reparar una moto que no enciende.' : 'e.g. I need to repair a motorcycle that won’t start.')).toBeVisible();
    await expect(page.getByRole('button', { name: locale === 'es' ? 'Publicar proyecto' : 'Post project', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const locale of ['es', 'en'] as const) {
  test(`project board keeps the section name and explains its purpose (${locale})`, async ({ page }) => {
    await gotoOK(page, `${locale === 'en' ? '/en' : ''}/proyectos`);
    await waitForInteractivePage(page);
    await expect(page.getByText(locale === 'es' ? 'Trabajos que los clientes necesitan realizar' : 'Work that clients need done').filter({ visible: true })).toBeVisible();
    await expect(page.getByRole('link', { name: locale === 'es' ? 'Publicar un proyecto' : 'Post a project', exact: true }).filter({ visible: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
