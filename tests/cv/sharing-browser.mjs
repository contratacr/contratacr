import {chromium,webkit,expect} from 'playwright/test';
import {jsPDF} from 'jspdf';
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch();const page=await browser.newPage({viewport:{width:390,height:1100}});let file=null,uploads=0,fail=false;
 await page.route('**/api/professional-cv?*',async route=>{const method=route.request().method();if(!fail){if(method==='POST'){uploads++;file={name:'CV.pdf',version:String(uploads),visible:true}}if(method==='PATCH')file={...file,visible:JSON.parse(route.request().postData()).visible};if(method==='DELETE')file=null;}await route.fulfill({status:fail?503:200,json:fail?{error:'No se pudo guardar el cambio.'}:{file}})});
 try{
 await page.goto('http://127.0.0.1:3194');const toggle=page.getByRole('switch',{name:'Mostrar en mi perfil',exact:true});
 await expect(page.getByRole('button',{name:'Subir CV',exact:true})).toBeVisible();await expect(toggle).toHaveCount(0);
 const pdf=new jsPDF();pdf.text(['Formación académica','Curso de ejemplo','Instituto de Ejemplo','01/2018 – 12/2020'],20,20);
 const file={name:'CV.pdf',mimeType:'application/pdf',buffer:Buffer.from(pdf.output('arraybuffer'))};
 const pick=async name=>{const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name,exact:true}).click();await (await chooser).setFiles(file);};
 // Reading the CV fills the form only: it never uploads or offers to attach the file.
 await pick('Elegir CV para leer');await expect(page.getByLabel('Revisar información importada',{exact:true})).toBeVisible();expect(uploads).toBe(0);
 await expect(page.getByRole('button',{name:'Adjuntar y mostrar CV',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Descartar importación',exact:true}).click();
 const choose=()=>pick(file && (page.__attached ? 'Cambiar CV' : 'Subir CV'));
 await choose();await expect(page.getByLabel('Revisar información importada',{exact:true})).toHaveCount(0);expect(uploads).toBe(0);
 await page.getByRole('button',{name:'Adjuntar y mostrar CV',exact:true}).click();await expect(toggle).toHaveAttribute('aria-checked','true');expect(uploads).toBe(1);page.__attached=true;
 await expect(page.getByRole('link',{name:'Ver CV',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Cambiar CV',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Subir CV',exact:true})).toHaveCount(0);
 await toggle.click();await expect(toggle).toHaveAttribute('aria-checked','false');fail=true;await toggle.click();await expect(page.getByRole('alert')).toContainText('No se pudo guardar');await expect(toggle).toHaveAttribute('aria-checked','false');fail=false;
 await choose();await expect(page.getByRole('button',{name:'Reemplazar y mostrar CV',exact:true})).toBeVisible();expect(uploads).toBe(1);await expect(toggle).toHaveAttribute('aria-checked','false');
 await page.locator('[data-cv-sharing]').getByRole('button',{name:'Cancelar',exact:true}).click();await expect(page.getByRole('button',{name:'Reemplazar y mostrar CV',exact:true})).toHaveCount(0);expect(uploads).toBe(1);
 await choose();await page.getByRole('button',{name:'Reemplazar y mostrar CV',exact:true}).click();await expect(toggle).toHaveAttribute('aria-checked','true');expect(uploads).toBe(2);
 await page.locator('[data-cv-sharing]').screenshot({path:`/tmp/ccr-cv-ui/${name}-sharing.png`});
 page.__attached=false;await page.getByRole('button',{name:'Retirar CV',exact:true}).click();await expect(page.getByRole('link',{name:'Ver CV',exact:true})).toHaveCount(0);await expect(toggle).toHaveCount(0);await expect(page.getByRole('button',{name:'Subir CV',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);console.log(`PASS ${name}: empty/attached CV actions, explicit upload, hide/show failure, replacement cancellation/confirmation, remove without stale selection and mobile layout`);
 }finally{await browser.close()}
}
