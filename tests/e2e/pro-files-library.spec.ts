import {test,expect,type Page,type BrowserContext} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {gotoOK,expectNoHorizontalOverflow,warmLocalRoutes} from './helpers';
import {ownerFixture,local,origin,login} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';

// Ronda F2-D (2026-11-19), rows 28/29/31/33: job files and company library with Office, CSV, video
// and PDF (drag and drop or picker, per-file progress/error/retry), in-app preview, sort, desktop
// drag to a folder (menu on phones), folder shared with the linked customer, permanent delete from
// the trash with confirmation, and library tags with filter. Fixtures are generated in memory
// (minimal valid OOXML zip, ftyp video, PDF). Disposable accounts, loopback only; nothing is sent.
const shots=process.env.F2D_SHOTS_DIR;
async function shot(page:Page,name:string,project:string,fullPage=false){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage});}
const label=(language:string)=>language+randomBytes(3).toString('hex');
const pdf=(text:string)=>Buffer.from(`%PDF-1.4\n% ${text}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`,'latin1');
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc32=(data:Buffer)=>{let c=0xffffffff;for(const b of data)c=crcTable[(c^b)&0xff]^(c>>>8);return (c^0xffffffff)>>>0;};
/** Minimal stored (uncompressed) zip: enough for the server's OOXML check. */
function zip(entries:Record<string,string>){
 const locals:Buffer[]=[],centrals:Buffer[]=[];let offset=0;
 for(const [name,text] of Object.entries(entries)){
  const data=Buffer.from(text,'utf8'),file=Buffer.from(name,'utf8'),crc=crc32(data);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(file.length,26);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(file.length,28);central.writeUInt32LE(offset,42);
  locals.push(local,file,data);centrals.push(central,file);offset+=30+file.length+data.length;
 }
 const dir=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(Object.keys(entries).length,8);end.writeUInt16LE(Object.keys(entries).length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,dir,end]);
}
const types='<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>';
const docx=()=>zip({'[Content_Types].xml':types,'word/document.xml':'<w:document/>'});
const xlsx=()=>zip({'[Content_Types].xml':types,'xl/workbook.xml':'<workbook/>'});
const pptx=()=>zip({'[Content_Types].xml':types,'ppt/presentation.xml':'<p:presentation/>'});
const mp4=()=>{const ftyp=Buffer.alloc(24);ftyp.writeUInt32BE(24,0);ftyp.write('ftypisom',4,'latin1');ftyp.writeUInt32BE(512,12);ftyp.write('isommp41',16,'latin1');const mdat=Buffer.alloc(64);mdat.writeUInt32BE(64,0);mdat.write('mdat',4,'latin1');return Buffer.concat([ftyp,mdat]);};
const DOCX='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
async function openPro(page:Page,path:string,en:boolean){
 await gotoOK(page,path);
 const failed=page.getByText(en?'Could not verify Pro access. Your data is preserved.':'No se pudo comprobar el acceso a Pro. Sus datos se conservan.');
 const ready=page.locator('[data-independent-pro]');
 await expect(failed.or(ready).first()).toBeVisible({timeout:90000});
 if(await failed.isVisible())await page.getByRole('button',{name:en?'Retry':'Reintentar',exact:true}).click();
 await expect(ready.first()).toBeVisible({timeout:90000});
}
async function account(context:BrowserContext,prefix:string):Promise<DisposableAccount>{const person=await createDisposableAccount({prefix});await login(context,person);return person;}
const newContext=(browser:import('playwright/test').Browser,info:import('playwright/test').TestInfo)=>browser.newContext({baseURL:origin,viewport:info.project.use.viewport??undefined,isMobile:info.project.use.isMobile,hasTouch:info.project.use.hasTouch,userAgent:info.project.use.userAgent});

for(const language of ['es','en'] as const)test(`Ronda F2-D: job files formats, organizer, shared folder and library tags [${language}]`,async({page,browser},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name,tr=(es:string,english:string)=>en?english:es;
 const mobile=(page.viewportSize()?.width??1366)<640;
 const f=await ownerFixture(page.context(),id);let customer:DisposableAccount|null=null;const customerContext=await newContext(browser,info);
 try{
  const job=(view:string)=>`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:view});
  await warmLocalRoutes(page,['/api/pro/work-file-organizer?workId='+f.workId,'/api/pro/work-files?workId='+f.workId,'/api/pro/company-file-tags']);
  await openPro(page,job('files'),en);const org=page.locator('[data-work-file-organizer]');await expect(org.locator('[data-pro-drop-zone]')).toBeVisible({timeout:90000});
  // (1) Row 28: six files at once; two refused with their own reason, the rest uploaded with progress.
  await org.getByLabel(tr('Subir archivos','Upload files'),{exact:true}).setInputFiles([
   {name:'contrato.docx',mimeType:DOCX,buffer:docx()},{name:'presupuesto.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:xlsx()},
   {name:'avance.mp4',mimeType:'video/mp4',buffer:mp4()},{name:'materiales.csv',mimeType:'text/csv',buffer:Buffer.from('material,cantidad\ncemento,10\n')},
   {name:'plano.pdf',mimeType:'application/pdf',buffer:pdf('plano')},{name:'macro.docm',mimeType:'application/octet-stream',buffer:Buffer.from('x')},{name:'falso.docx',mimeType:DOCX,buffer:Buffer.from('no es un zip')}]);
  const uploads=org.locator('[data-organizer-upload-progress]');
  await expect(uploads).toContainText(tr('Subidos 5 de 7.','Uploaded 5 of 7.'),{timeout:120000});
  await expect(uploads.locator('[data-upload-item="error"]')).toHaveCount(2);
  await expect(uploads.locator('[data-upload-item="error"]').filter({hasText:'macro.docm'})).toContainText(tr('macros','macros'));
  await expect(uploads.locator('[data-upload-item="error"]').filter({hasText:'falso.docx'})).toContainText(tr('Formato no aceptado o archivo dañado.','Format not accepted or damaged file.'));
  await expect(uploads.getByRole('button',{name:tr('Reintentar falso.docx','Retry falso.docx'),exact:true})).toBeVisible();
  await expect(org.locator('[data-organizer-file]')).toHaveCount(5,{timeout:30000});await expect(org.locator('[data-file-quota]')).toBeVisible();
  await expectNoHorizontalOverflow(page);await shot(page,'28-organizer-upload-'+language,project);
  const stored=(await f.db.from('pro_work_files').select('name,mime_type').eq('owner_id',f.owner.id).eq('work_id',f.workId)).data!.map(r=>r.name+':'+r.mime_type).sort();
  expect(stored).toEqual(['avance.mp4:video/mp4','contrato.docx:'+DOCX,'materiales.csv:text/csv','plano.pdf:application/pdf','presupuesto.xlsx:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
  // Private download: attachment, nosniff, exact type; never a public or signed URL.
  const docxRow=org.locator('[data-organizer-file]').filter({hasText:'contrato.docx'});const docxId=(await docxRow.getAttribute('data-organizer-file'))!;
  const bytes=await page.request.get(origin+'/api/pro/work-files?fileId='+docxId);expect(bytes.status()).toBe(200);expect(bytes.headers()['content-type']).toBe(DOCX);expect(bytes.headers()['content-disposition']).toMatch(/^attachment/);expect(bytes.headers()['x-content-type-options']).toBe('nosniff');
  // (2) Preview of video and PDF in the app; Office is download only.
  await expect(docxRow.getByRole('button',{name:tr('Ver','View'),exact:true})).toHaveCount(0);
  await org.locator('[data-organizer-file]').filter({hasText:'avance.mp4'}).getByRole('button',{name:tr('Ver','View'),exact:true}).click();
  const viewer=page.getByRole('dialog',{name:'avance.mp4'});await expect(viewer.locator('[data-pro-file-preview="video"] video')).toBeVisible({timeout:30000});
  await shot(page,'28-preview-video-'+language,project);await viewer.getByRole('button',{name:tr('Cerrar vista previa','Close preview'),exact:true}).click();await expect(viewer).toHaveCount(0);
  await org.locator('[data-organizer-file]').filter({hasText:'plano.pdf'}).getByRole('button',{name:tr('Ver','View'),exact:true}).click();
  const pdfViewer=page.getByRole('dialog',{name:'plano.pdf'});await expect(pdfViewer.locator('[data-pro-file-preview="pdf"] iframe')).toBeVisible({timeout:30000});
  await pdfViewer.getByRole('button',{name:tr('Cerrar vista previa','Close preview'),exact:true}).click();
  // (3) Row 29: sort by name.
  await org.getByLabel(tr('Ordenar archivos','Sort files'),{exact:true}).selectOption('name');
  await expect.poll(async()=>(await org.locator('[data-organizer-file-name]').allTextContents())).toEqual(['avance.mp4','contrato.docx','materiales.csv','plano.pdf','presupuesto.xlsx']);
  // (4) Folder for the customer; desktop drags the file onto it, phones use the menu.
  await org.getByRole('button',{name:tr('Nueva carpeta','New folder'),exact:true}).click();const d=page.getByRole('dialog',{name:tr('Nueva carpeta','New folder'),exact:true});
  await d.getByLabel(tr('Nombre','Name'),{exact:true}).fill(tr('Para el cliente','For the customer'));await d.getByRole('button',{name:tr('Guardar','Save'),exact:true}).click();await expect(d).toHaveCount(0,{timeout:30000});
  const folderRow=org.locator('[data-organizer-folder]').filter({hasText:tr('Para el cliente','For the customer')});await expect(folderRow).toBeVisible({timeout:30000});
  if(mobile){
   await docxRow.getByLabel(tr('Opciones de contrato.docx','Options for contrato.docx'),{exact:true}).click();await docxRow.getByRole('button',{name:tr('Mover','Move'),exact:true}).click();
   const move=page.getByRole('dialog',{name:tr('Mover a','Move to'),exact:true});await move.getByLabel(tr('Carpeta de destino','Destination folder'),{exact:true}).selectOption({label:tr('Para el cliente','For the customer')});await move.getByRole('button',{name:tr('Guardar','Save'),exact:true}).click();
  }else await docxRow.dragTo(folderRow);
  await expect(org.locator('[data-organizer-file]').filter({hasText:'contrato.docx'})).toHaveCount(0,{timeout:30000});
  await expect(folderRow).toContainText(tr('1 elemento','1 item'));
  await folderRow.getByLabel(tr(`Opciones de la carpeta ${tr('Para el cliente','For the customer')}`,'Options for folder For the customer'),{exact:true}).click();
  await folderRow.getByRole('button',{name:tr('Mostrar al cliente','Show to the customer'),exact:true}).click();
  await expect(folderRow.locator('[data-folder-client-visible]')).toBeVisible({timeout:30000});
  await expectNoHorizontalOverflow(page);await shot(page,'33-folder-shared-'+language,project);
  // (5) Row 29: trash, then permanent delete with confirmation.
  await org.getByRole('button',{name:tr('Enviar materiales.csv a la papelera','Move materiales.csv to trash'),exact:true}).click();
  await expect(org.locator('[data-organizer-file]').filter({hasText:'materiales.csv'})).toHaveCount(0,{timeout:30000});
  await org.getByRole('button',{name:new RegExp('^'+tr('Papelera','Trash'))}).click();const trashed=org.locator('[data-organizer-file]').filter({hasText:'materiales.csv'});await expect(trashed).toBeVisible({timeout:30000});
  await trashed.getByRole('button',{name:tr('Eliminar definitivamente','Delete permanently'),exact:true}).click();
  const sure=page.getByRole('alertdialog').or(page.getByRole('dialog',{name:tr('¿Eliminar el archivo definitivamente?','Delete the file permanently?')}));await expect(sure.first()).toBeVisible();await shot(page,'29-purge-confirm-'+language,project);
  await sure.first().getByRole('button',{name:tr('Eliminar definitivamente','Delete permanently'),exact:true}).click();
  await expect(org.getByRole('status').filter({hasText:tr('Archivo eliminado definitivamente.','File deleted permanently.')})).toBeVisible({timeout:30000});
  await expect.poll(async()=>(await f.db.from('pro_work_files').select('id').eq('owner_id',f.owner.id).eq('name','materiales.csv')).data?.length,{timeout:30000}).toBe(0);
  // (6) Row 33: the linked customer sees the shared folder (not the other files) and downloads it.
  customer=await account(customerContext,'f2d-customer');const requestId=crypto.randomUUID();
  const professional=(await f.db.from('professionals').select('id').eq('profile_id',f.owner.id).single().throwOnError()).data!;
  await f.db.from('pro_appointment_requests').insert({id:requestId,professional_id:professional.id,owner_id:f.owner.id,client_user_id:customer.id,client_name:'Cliente ronda '+id,professional_name:'Remodelaciones '+id,professional_slug:'r2-'+f.owner.id,service:'Remodelación de cocina '+id,duration_minutes:60,location_kind:'agree',location_text:'',note:'',status:'confirmed',revision:0,work_id:f.workId}).throwOnError();
  const customerPage=await customerContext.newPage();await gotoOK(customerPage,`/${language}/dashboard/profesional?tab=appointments&citaSolicitud=${requestId}`);
  const sharedFolders=customerPage.locator('[data-client-shared-folders]');await expect(sharedFolders).toBeVisible({timeout:90000});
  await expect(sharedFolders.locator('[data-client-shared-file]')).toHaveCount(1);await expect(sharedFolders).toContainText('contrato.docx');await expect(sharedFolders).not.toContainText('presupuesto.xlsx');
  await sharedFolders.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(customerPage);await shot(customerPage,'33-customer-shared-folder-'+language,project);
  const got=await customerPage.request.get(origin+'/api/pro/work-files?'+new URLSearchParams({requestId,sharedFileId:docxId}));expect(got.status()).toBe(200);expect(got.headers()['content-type']).toBe(DOCX);
  const otherId=(await org.page().request.get(origin+'/api/pro/work-file-organizer?'+new URLSearchParams({workId:f.workId,view:'search',q:'presupuesto'})).then(r=>r.json())).files[0].id;
  expect((await customerPage.request.get(origin+'/api/pro/work-files?'+new URLSearchParams({requestId,sharedFileId:otherId}))).status()).toBe(404);
  // (7) Row 31: library upload of Office/text files and tags with filter.
  await openPro(page,`/${language}/dashboard/pro?tab=pro_files`,en);const lib=page.locator('[data-company-files]');await expect(lib.locator('[data-pro-drop-zone]')).toBeVisible({timeout:90000});
  await lib.getByLabel(tr('Elegir archivos','Choose files'),{exact:true}).setInputFiles([{name:'Plantilla de presupuesto.pptx',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',buffer:pptx()},{name:'Manual de seguridad.txt',mimeType:'text/plain',buffer:Buffer.from(tr('Use casco.','Wear a helmet.'))}]);
  await expect(lib.getByRole('status').filter({hasText:tr('2 archivos subidos.','2 files uploaded.')})).toBeVisible({timeout:120000});
  const pptRow=lib.locator('article,li,div').filter({has:page.locator('[data-company-file-tags-open]')}).filter({hasText:'Plantilla de presupuesto.pptx'}).last();
  await pptRow.locator('[data-company-file-tags-open]').click();const editor=page.getByRole('dialog',{name:tr('Etiquetas','Tags'),exact:true});
  await editor.getByLabel(tr('Plantilla','Template'),{exact:true}).check();await editor.getByLabel(tr('Otra etiqueta','Other tag'),{exact:true}).fill(tr('Eléctrico','Electrical'));await editor.getByRole('button',{name:tr('Agregar','Add'),exact:true}).click();
  await shot(page,'31-tag-editor-'+language,project);
  await editor.getByRole('button',{name:tr('Guardar etiquetas','Save tags'),exact:true}).click();await expect(editor).toHaveCount(0,{timeout:30000});
  const filter=lib.locator('[data-company-tag-filter]');await expect(filter).toBeVisible({timeout:30000});
  await filter.getByRole('button',{name:new RegExp('^'+tr('Plantilla','Template'))}).click();
  await expect(filter.locator('[data-company-tag-result]')).toHaveCount(1,{timeout:30000});await expect(filter).toContainText('Plantilla de presupuesto.pptx');
  await expectNoHorizontalOverflow(page);await shot(page,'31-library-tags-'+language,project);
 }finally{await customerContext.close();if(customer)await cleanupDisposableAccount(customer);await f.cleanup();}
});
