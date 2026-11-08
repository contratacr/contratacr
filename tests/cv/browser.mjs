import { chromium, webkit, expect } from 'playwright/test';
import { zipSync, strToU8 } from 'fflate';
import { jsPDF } from 'jspdf';
import { mkdir } from 'node:fs/promises';
const directory='/tmp/ccr-cv-review'; await mkdir(directory,{recursive:true});
const lines=['María Ejemplo','correo@example.test','Formación académica','Técnico en Administración','Instituto de Ejemplo','2020','','Experiencia laboral','Asistente administrativa','Empresa de Ejemplo','2021 - 2024','Atención a clientes','','Habilidades','Excel, Organización','Referencias','Persona privada'];
const xml='<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+lines.map(l=>`<w:p><w:r><w:t>${l}</w:t></w:r></w:p>`).join('')+'</w:body></w:document>';
const docx=Buffer.from(zipSync({'word/document.xml':strToU8(xml)}));
const pdf=new jsPDF(); lines.forEach((line,i)=>pdf.text(line,20,20+i*8)); const pdfBytes=Buffer.from(pdf.output('arraybuffer'));
const oversized=new Uint8Array(5*1024*1024+1);
for(const [name,engine,viewport] of [['chromium-mobile',chromium,{width:390,height:844}],['webkit-mobile',webkit,{width:390,height:844}],['chromium-desktop',chromium,{width:1280,height:900}]]) {
 const browser=await engine.launch(); const page=await browser.newPage({viewport}); const errors=[]; const requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const req=route.request();requests.push({url:req.url(),method:req.method(),body:req.postData()});return req.url().startsWith('http://127.0.0.1:3194/') ? route.continue():route.abort();});
 try {
 await page.goto('http://127.0.0.1:3194');
 await expect(page.getByRole('heading',{name:'Completá tu perfil con tu CV'})).toBeVisible();
 const input=page.locator('input[type=file][accept*=".docx"]');
 await page.screenshot({path:`${directory}/${name}-start.png`,fullPage:true});
 await input.setInputFiles({name:'curriculum.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:docx});
 const review=page.getByLabel('Revisar información importada',{exact:true});
 await expect(review).toBeVisible(); await expect(review.getByLabel('Título o curso',{exact:true})).toHaveValue('Técnico en Administración');
 expect(await page.evaluate(()=>sessionStorage.getItem('cv-saved'))).toBeNull();
 await review.getByLabel('Empresa (opcional)',{exact:true}).fill('Empresa corregida');
 await page.screenshot({path:`directory/${name}-review.png`.replace('directory',directory),fullPage:true});
 await review.getByRole('button',{name:'Agregar al formulario',exact:true}).click();
 await expect(review).toHaveCount(0);
 await page.getByTestId('profile-save-certs').click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('cv-saved')||'{}').experience?.[0]?.organization)).toBe('Empresa corregida');
 await expect(page.locator('[data-cv-public]').getByText('Empresa corregida',{exact:false})).toBeVisible();
 await page.reload();
 await expect(page.getByLabel('Empresa (opcional)',{exact:true})).toHaveValue('Empresa corregida');
 // Reimport cannot overwrite the corrected record if the original key still matches.
 await input.setInputFiles({name:'curriculum.pdf',mimeType:'application/pdf',buffer:pdfBytes});
 await expect(review).toBeVisible({timeout:25000});
 await expect(review.getByLabel('Título o curso',{exact:true})).toHaveValue('Técnico en Administración');
 await review.getByRole('button',{name:'Descartar importación'}).click();
 await expect(page.getByLabel('Empresa (opcional)',{exact:true})).toHaveValue('Empresa corregida');
 // Denied persistence must remain dirty and show the error, never a success.
 await page.evaluate(()=>sessionStorage.setItem('cv-denied','1'));
 await page.getByLabel('Puesto',{exact:true}).fill('Puesto corregido');
 await page.getByTestId('profile-save-certs').click();
 await expect(page.getByRole('alert').filter({hasText:'Error al guardar'})).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('cv-saved')).experience[0].title)).toBe('Asistente administrativa');
 await page.evaluate(()=>sessionStorage.removeItem('cv-denied'));
 await page.getByTestId('profile-save-certs').click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('cv-saved')).experience[0].title)).toBe('Puesto corregido');
 await page.reload();
 for(const [filename,buffer,expected] of [['bad.pdf',Buffer.from('not a pdf'),'Elegí un archivo'],['huge.pdf',Buffer.from(oversized),'demasiado grande'],['image.pdf',Buffer.from(new jsPDF().output('arraybuffer')),'No pudimos leer'],['old.doc',Buffer.from('word'),'Elegí un archivo']]) {
  await input.setInputFiles({name:filename,mimeType:'application/octet-stream',buffer});
  await expect(page.getByRole('alert')).toContainText(expected,{timeout:25000});
 }
 const protectedPdf=new jsPDF({encryption:{userPassword:'synthetic',ownerPassword:'owner'}});protectedPdf.text('Private synthetic CV',20,20);
 await input.setInputFiles({name:'locked.pdf',mimeType:'application/pdf',buffer:Buffer.from(protectedPdf.output('arraybuffer'))});
 await expect(page.getByRole('alert')).toContainText('sin contraseña',{timeout:25000});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expect(requests.filter(r=>r.method!=='GET' && !(r.url.endsWith('/api/analytics/professional-ready') && !r.body))).toEqual([]);
 expect(errors).toEqual([]);
 console.log(`PASS ${name}: DOCX + PDF, edit/review/save/reload, discard, denied save/retry, 5 invalid formats, no uploads, no overflow`);
 } finally {await browser.close();}
}
