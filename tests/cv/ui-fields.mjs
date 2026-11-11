import { chromium, webkit, expect } from 'playwright/test';
const sample = {education:[{title:'Ingeniería de Software',organization:'Universidad de Ejemplo',period:'01/2018 – 12/2021',description:''}],experience:[{title:'Ingeniero de calidad',organization:'Empresa de Ejemplo',period:'04/2024 – 12/2024',description:'Responsable de automatización y calidad de aplicaciones. '.repeat(12)}],skills:['Playwright','TypeScript']};
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
 const browser=await engine.launch();const page=await browser.newPage({viewport:{width:390,height:844}}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try {
 await page.addInitScript(data=>{if(!sessionStorage.getItem('cv-saved'))sessionStorage.setItem('cv-saved',JSON.stringify(data));},sample);
 await page.route('**/api/professional-cv?*',route=>route.fulfill({json:{file:{name:'cv.pdf',visible:true,version:'example'}}}));
 await page.goto('http://127.0.0.1:3194');
 const editor=page.locator('[data-cv-editor]');
 await expect(editor.getByText('Importá tus estudios',{exact:false})).toHaveCount(0);
 await expect(editor.getByText('PDF · DOCX',{exact:false})).toHaveCount(0);
 await expect(editor.getByText('Los visitantes podrán',{exact:false})).toHaveCount(0);
 for(const control of [editor.getByRole('link',{name:'Ver CV'}),editor.getByRole('button',{name:'Retirar CV'})]){const box=await control.boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);}
 await editor.getByLabel('Nueva habilidad',{exact:true}).fill('Comunicación');
 await editor.getByLabel('Nueva habilidad',{exact:true}).press('Enter');
 await expect(editor.getByRole('button',{name:'Quitar Comunicación',exact:true})).toBeVisible();
 await editor.getByLabel('Nueva habilidad',{exact:true}).fill('comunicacion');await editor.getByLabel('Nueva habilidad',{exact:true}).press('Enter');
 await expect(editor.getByText('Ya agregaste esta habilidad.')).toBeVisible();
 await editor.getByLabel('Nueva habilidad',{exact:true}).fill('');
 await editor.getByRole('button',{name:'Quitar TypeScript',exact:true}).click();
 // Entries are closed cards; the pencil opens the form.
 await expect(editor.getByRole('combobox')).toHaveCount(0);
 await expect(editor.locator('[data-cv-editor-section="experience"]')).toContainText('Ingeniero de calidad');
 await editor.getByRole('button',{name:'Editar Experiencia laboral 1',exact:true}).click();
 const startYear=editor.getByRole('combobox',{name:'Inicio: año',exact:true}).nth(0);
 await expect(startYear).toHaveValue('2024');
 for(const select of await editor.getByRole('combobox').all()){expect((await select.boundingBox()).height).toBeGreaterThanOrEqual(44);}
 await expect(editor.getByRole('combobox',{name:'Inicio: mes',exact:true}).nth(0)).toHaveValue('4');
 await editor.getByRole('combobox',{name:'Fin: año',exact:true}).nth(0).selectOption('2023');
 await page.getByTestId('profile-save-certs').click();
 await expect(page.getByRole('alert').filter({hasText:'Revisá los títulos, las fechas'})).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('cv-saved')).experience[0].period)).toBe('04/2024 – 12/2024');
 await editor.getByLabel('Actualmente trabajo aquí',{exact:true}).check();
 await expect(editor.getByRole('combobox',{name:'Fin: año',exact:true})).toHaveCount(0);
 await page.getByTestId('profile-save-certs').click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('cv-saved')).experience[0].period)).toBe('04/2024 – Present');
 const publicView=page.locator('[data-cv-public]');
 await expect(publicView.getByText('Actualidad',{exact:false})).toBeVisible();
 await expect(publicView.getByText('Comunicación',{exact:true})).toBeVisible();
 await expect(publicView.getByText('TypeScript',{exact:true})).toHaveCount(0);
 const more=publicView.getByRole('button',{name:'Ver más',exact:true});await more.click();
 await expect(publicView.getByRole('button',{name:'Ver menos',exact:true})).toHaveAttribute('aria-expanded','true');
 await publicView.getByRole('button',{name:'Ver menos',exact:true}).click();
 await publicView.screenshot({path:`/tmp/ccr-cv-ui/${name}-public.png`});
 await page.reload();
 await expect(editor.getByRole('button',{name:'Quitar Comunicación',exact:true})).toBeVisible();
 await expect(editor.locator('[data-cv-editor-section="experience"]')).toContainText('Actualidad');
 await editor.getByRole('button',{name:'Editar Experiencia laboral 1',exact:true}).click();
 await expect(editor.getByLabel('Actualmente trabajo aquí',{exact:true})).toBeChecked();
 await editor.screenshot({path:`/tmp/ccr-cv-ui/${name}-editor.png`});
 await editor.locator('[data-cv-sharing]').screenshot({path:`/tmp/ccr-cv-ui/${name}-cv-actions.png`});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expect(errors).toEqual([]);
 console.log(`PASS ${name}: individual skills, dedup/removal, date editing/current/range validation, save/reload, public expand, 44px CV controls and mobile layout`);
 }finally{await browser.close();}
}
