// Isolated CV preview (tests/cv/serve-preview.mjs, port 3194): synthetic data, no uploads or production I/O.
import { chromium, webkit, expect } from 'playwright/test';
import { zipSync, strToU8 } from 'fflate';
const lines=['Formación académica','Técnico en Administración','Instituto de Ejemplo','01/2018 – 12/2020','','Experiencia laboral','Asistente administrativa','Empresa de Ejemplo','01/2021 – 12/2024','','Habilidades','Excel'];
const docx=Buffer.from(zipSync({'word/document.xml':strToU8('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+lines.map(l=>`<w:p><w:r><w:t>${l}</w:t></w:r></w:p>`).join('')+'</w:body></w:document>')}));
for (const [name, engine, viewport] of [['chromium-mobile', chromium, { width: 390, height: 900 }], ['webkit-mobile', webkit, { width: 390, height: 900 }], ['chromium-desktop', chromium, { width: 1280, height: 900 }]]) {
  const browser = await engine.launch(); const page = await browser.newPage({ viewport }); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/professional-cv?*', route => route.fulfill({ json: { file: null } }));
  try {
    await page.goto('http://127.0.0.1:3194/?legacy');
    const editor = page.locator('[data-cv-editor]'), publicView = page.locator('[data-cv-public]');
    // Legacy certifications live inside Education with the same card, not as a separate block.
    await expect(editor.locator('[data-cv-editor-section="education"] [data-cv-entry="legacy"]')).toHaveCount(2);
    await expect(editor.getByText('Estudios y certificaciones', { exact: true })).toBeVisible();
    await expect(publicView.locator('[data-cv-section="education"] h4')).toHaveText(['Técnico en Administración', 'Curso de Excel']);
    await page.screenshot({ path: `/tmp/ccr-cv-ui/${name}-legacy-start.png`, fullPage: true });
    // Reading a CV that repeats a legacy certification (different dates) marks it and never adds it twice.
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Elegir CV para leer', exact: true }).click();
    await (await chooser).setFiles({ name: 'cv.docx', mimeType: 'application/octet-stream', buffer: docx });
    const review = page.getByLabel('Revisar información importada', { exact: true });
    await expect(review).toBeVisible();
    await expect(review.getByText('Ya está en tu perfil', { exact: true })).toHaveCount(1);
    await expect(review).toContainText('1 ya está en tu perfil (no se agrega de nuevo)');
    await page.screenshot({ path: `/tmp/ccr-cv-ui/${name}-legacy-review.png`, fullPage: true });
    await review.getByRole('button', { name: 'Agregar al formulario', exact: true }).click();
    await page.getByTestId('profile-save-certs').click();
    await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('cv-saved') || '{}').experience?.length)).toBe(1);
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('cv-saved')).education.length)).toBe(0);
    await expect(publicView.locator('[data-cv-section="education"] h4')).toHaveText(['Técnico en Administración', 'Curso de Excel']);
    await expect(publicView.locator('[data-cv-section]')).toHaveCount(3);
    expect(await publicView.locator('[data-cv-section]').evaluateAll(els => els.map(e => e.dataset.cvSection))).toEqual(['experience', 'education', 'skills']);
    await page.screenshot({ path: `/tmp/ccr-cv-ui/${name}-legacy-saved.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
    console.log(`PASS ${name}: legacy certifications in Education with the same card, tolerant duplicate on import, public order experience/education/skills, no overflow`);
  } finally { await browser.close(); }
}
