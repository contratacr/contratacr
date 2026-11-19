import {test,expect,type Page,type BrowserContext} from 'playwright/test';
import {randomBytes,createHash} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import sharp from 'sharp';
import {gotoOK,expectNoHorizontalOverflow,warmLocalRoutes} from './helpers';
import {ownerFixture,local,origin,login} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';

// Round 9 (2026-11-15): global hours, task center filters/reassign/overdue, notification center with
// preferences and email drafts (never sent), company library multi-upload + recursive trash/restore,
// subcontractor comment attachments (both sides), branded prints and selection options from the
// catalog. Disposable accounts, loopback only; nothing is sent, charged or issued.
const shots=process.env.ROUND9_SHOTS_DIR;
async function shot(page:Page,name:string,project:string,fullPage=false){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage});}
const label=(language:string)=>language+randomBytes(3).toString('hex');
const pdf=(text:string)=>Buffer.from(`%PDF-1.4\n% ${text}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`,'latin1');
async function png(color:string){return sharp({create:{width:96,height:64,channels:3,background:color}}).png().toBuffer();}
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
const crToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const addDays=(day:string,n:number)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};

for(const language of ['es','en'] as const)test(`Round 9: hours, task center and notifications [${language}]`,async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name,tr=(es:string,english:string)=>en?english:es,prefix=en?'/en':'';
 const secondWork=crypto.randomUUID();
 const f=await ownerFixture(page.context(),id,(document,ids)=>{document.work.push({id:secondWork,clientId:ids.clientId,client:'Cliente ronda '+id,service:'Techo '+id,stage:'new',start:'',end:'',cancelled:false});});
 try{
  const today=crToday(),owner=f.owner.id,ownerName=(await f.db.from('profiles').select('full_name').eq('id',owner).single()).data!.full_name as string;
  await warmLocalRoutes(page,['/api/pro/time-report?from='+today+'&to='+today,'/api/pro/notifications?view=count','/api/pro/task-center?view=options']);
  // Seed: two jobs with hours (single time writer) and tasks.
  const activity=crypto.randomUUID();await f.db.from('pro_time_activities').insert({owner_id:owner,id:activity,name:tr('Instalación','Installation'),rate_cents:1500000,billable:true}).throwOnError();
  for(const [work,minutes,billable] of [[f.workId,120,true],[secondWork,45,false]] as const)expect((await f.db.rpc('pro_time_mutate',{p_actor:owner,p_input:{action:'manual',actionId:crypto.randomUUID(),entryId:crypto.randomUUID(),workId:work,activityId:billable?activity:null,billable,date:today,minutes,note:''}})).error).toBeNull();
  const t1=crypto.randomUUID(),t2=crypto.randomUUID(),t3=crypto.randomUUID();
  await f.db.from('pro_work_tasks').insert([{owner_id:owner,work_id:f.workId,id:t1,title:tr('Medir ventanas ','Measure windows ')+id,details:'',assignee:'',due_date:addDays(today,-3)},{owner_id:owner,work_id:f.workId,id:t2,title:tr('Pedir azulejo ','Order tiles ')+id,details:'',assignee:'',due_date:addDays(today,1)},{owner_id:owner,work_id:secondWork,id:t3,title:tr('Revisar techo ','Inspect roof ')+id,details:'',assignee:'Ana '+id,due_date:addDays(today,10)}]).throwOnError();
  // (1) Hours across jobs: totals, filters, CSV.
  await openPro(page,`${prefix}/dashboard/pro?tab=pro_hours`,en);const hours=page.locator('[data-time-report]');
  await expect(hours.locator('[data-time-report-total="minutes"]')).toContainText('2 h 45 min',{timeout:90000});
  await expect(hours.locator('[data-time-report-row]')).toHaveCount(2);await expect(hours.locator('[data-time-report-group="work"] li')).toHaveCount(2);
  await hours.getByLabel(tr('Trabajo','Job'),{exact:true}).selectOption(secondWork);await expect(hours.locator('[data-time-report-total="minutes"]')).toContainText('45 min',{timeout:30000});await expect(hours.locator('[data-time-report-row]')).toHaveCount(1);
  await hours.getByLabel(tr('Trabajo','Job'),{exact:true}).selectOption('');await hours.getByLabel(tr('Facturable','Billable'),{exact:true}).selectOption('billable');await expect(hours.locator('[data-time-report-total="minutes"]')).toContainText('2 h',{timeout:30000});
  await expect(hours.locator('[data-time-report-total="amount"]')).toContainText('30');
  const csv=await page.request.get('/api/pro/time-report?'+new URLSearchParams({from:today,to:today,billable:'billable',format:'csv',lang:language}));expect(csv.status()).toBe(200);expect(csv.headers()['content-type']).toContain('text/csv');
  const text=(await csv.text()).replace(/^﻿/,'');expect(text.split('\r\n')[0]).toBe(tr('Fecha;Trabajo;Persona;Actividad;Minutos;Horas;Facturable;Monto facturable (CRC);Costo (CRC);Origen;Nota','Date;Job;Person;Activity;Minutes;Hours;Billable;Billable amount (CRC);Cost (CRC);Source;Note'));expect(text).toContain('Remodelación de cocina '+id);expect(text).not.toContain('Techo '+id);expect(text).toContain('30000.00');
  expect((await page.request.get('/api/pro/time-report?from=2020-01-01&to=2022-01-01')).status()).toBe(400);
  await expectNoHorizontalOverflow(page);await shot(page,`r9-hours-${language}`,project);
  // (2) Task center: filter by job and responsible, overdue highlight, bulk reassign through the task writer.
  await openPro(page,`${prefix}/dashboard/pro?tab=pro_tasks`,en);const center=page.locator('section').filter({has:page.getByRole('group',{name:tr('Estado de tareas','Task status'),exact:true})}).first();
  const overdueRow=page.locator(`[data-task-center-item="${t1}"]`).filter({visible:true});await expect(overdueRow).toHaveAttribute('data-task-center-overdue','',{timeout:90000});
  await expect(page.locator(`[data-task-center-item="${t2}"]`).filter({visible:true})).not.toHaveAttribute('data-task-center-overdue','');
  await center.getByLabel(tr('Trabajo','Job'),{exact:true}).selectOption(secondWork);await expect(page).toHaveURL(/taskJob=/);await expect(page.locator('[data-task-center-item]').filter({visible:true})).toHaveCount(1,{timeout:30000});
  await center.getByLabel(tr('Trabajo','Job'),{exact:true}).selectOption('');await center.getByLabel(tr('Responsable','Assignee'),{exact:true}).selectOption('~none');await expect(page.locator('[data-task-center-item]').filter({visible:true})).toHaveCount(2,{timeout:30000});
  for(const task of [t1,t2])await page.locator(`[data-task-center-item="${task}"]`).filter({visible:true}).getByRole('checkbox').check();
  await shot(page,`r9-task-center-${language}`,project);
  await page.locator('[data-task-center-reassign]').selectOption(ownerName);
  await expect(page.getByRole('status').filter({hasText:tr('2 tareas reasignadas.','2 tasks reassigned.')})).toBeVisible({timeout:60000});
  await expect(page.locator('[data-task-center-item]').filter({visible:true})).toHaveCount(0,{timeout:30000});
  const rows=(await f.db.from('pro_work_tasks').select('id,assignee,revision').in('id',[t1,t2])).data!;expect(rows.every(row=>row.assignee===ownerName&&row.revision===2)).toBe(true);
  expect((await f.db.from('pro_work_task_history').select('task_id').in('task_id',[t1,t2])).data!.length).toBeGreaterThanOrEqual(2);
  // (3) Notifications: bell count, center, mark read, preferences with an email draft (never sent).
  await openPro(page,`${prefix}/dashboard/pro?tab=pro_tools`,en);const bell=page.locator('[data-pro-notification-bell]');await expect(bell.locator('[data-pro-notification-count]')).toBeVisible({timeout:90000});
  await expect(async()=>{await bell.click();await expect(page).toHaveURL(/tab=pro_notifications/,{timeout:5000});}).toPass({timeout:60000});const centerN=page.locator('[data-notification-center]');
  await expect(centerN.locator('[data-notification="task_assigned"]').filter({hasText:tr('Medir ventanas','Measure windows')})).toBeVisible({timeout:60000});
  await expect(centerN.locator('[data-notification="task_due"]').filter({hasText:tr('Medir ventanas','Measure windows')})).toContainText(tr('Vencida','Overdue'));
  await expect(centerN.locator('[data-notification]').filter({hasText:tr('Revisar techo','Inspect roof')})).toHaveCount(0);
  await shot(page,`r9-notifications-${language}`,project);
  const before=Number(await bell.locator('[data-pro-notification-count]').innerText());
  await centerN.locator('[data-notification="task_assigned"]').first().getByRole('button',{name:tr('Marcar como leído','Mark as read'),exact:true}).click();
  await expect(bell.locator('[data-pro-notification-count]')).toHaveText(String(before-1),{timeout:30000});
  const pref=centerN.locator('[data-notification-pref="task_due"]');await pref.getByLabel(tr('Borrador de correo','Email draft'),{exact:true}).check();
  await centerN.locator('[data-notification-settings]').getByLabel(tr('Recordar tareas antes del vencimiento','Remind me about tasks before they are due'),{exact:true}).selectOption('14');
  await centerN.getByRole('button',{name:tr('Guardar preferencias','Save preferences'),exact:true}).click();await expect(centerN.getByRole('status').filter({hasText:tr('Preferencias guardadas.','Preferences saved.')})).toBeVisible({timeout:30000});
  await centerN.getByRole('button',{name:tr('Todos','All'),exact:true}).click();
  await expect(centerN.locator('[data-notification="task_due"]').filter({hasText:tr('Revisar techo','Inspect roof')})).toHaveCount(0);
  const drafts=(await f.db.from('pro_notification_email_drafts').select('delivery').eq('owner_id',owner)).data!;expect(drafts.every(row=>row.delivery==='draft_not_sent')).toBe(true);
  // A stale revision is refused (409); read-all clears the badge.
  expect((await page.request.post('/api/pro/notifications',{headers:{Origin:origin},data:{action:'settings',actionId:crypto.randomUUID(),revision:0,dueSoonDays:2,overdueGraceDays:0,prefs:{}}})).status()).toBe(409);
  await centerN.getByRole('button',{name:tr('Marcar todo como leído','Mark all as read'),exact:true}).click();await expect(bell.locator('[data-pro-notification-count]')).toHaveCount(0,{timeout:30000});
  await expectNoHorizontalOverflow(page);await shot(page,`r9-notification-settings-${language}`,project,true);
 }finally{await f.cleanup();}
});

for(const language of ['es','en'] as const)test(`Round 9: company library, branded prints and catalog selections [${language}]`,async({page,browser},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name,tr=(es:string,english:string)=>en?english:es,prefix=en?'/en':'';
 const f=await ownerFixture(page.context(),id);const customerContext=await newContext(browser,info);
 try{
  const owner=f.owner.id;
  await warmLocalRoutes(page,['/api/pro/company-files?view=list&scope=folder&status=active','/api/pro/company-file-trash','/api/pro/document-branding','/api/pro/selections?workId='+encodeURIComponent(f.workId)]);
  // (1) Company library: several files at once, then a folder with contents to the trash and back.
  await openPro(page,`${prefix}/dashboard/pro?tab=pro_files`,en);const lib=page.locator('[data-company-files]');
  await expect(lib.locator('[data-company-files-many]')).toBeVisible({timeout:90000});
  await lib.getByLabel(tr('Subir varios archivos','Upload several files'),{exact:true}).setInputFiles([{name:'lista.pdf',mimeType:'application/pdf',buffer:pdf('lista')},{name:'foto.png',mimeType:'image/png',buffer:await png('#3388cc')},{name:'precios.pdf',mimeType:'application/pdf',buffer:pdf('precios')}]);
  await expect(lib.getByRole('status').filter({hasText:tr('3 archivos subidos.','3 files uploaded.')})).toBeVisible({timeout:120000});
  const stored=(await f.db.from('pro_company_files').select('id,name,mime_type').eq('owner_id',owner)).data!;expect(stored.length).toBe(3);expect(stored.some(row=>row.mime_type==='image/jpeg')).toBe(true);
  const folder=crypto.randomUUID(),sub=crypto.randomUUID();
  await f.db.from('pro_company_folders').insert([{owner_id:owner,id:folder,parent_id:null,name:'Proveedores '+id,revision:1},{owner_id:owner,id:sub,parent_id:folder,name:'2030',revision:1}]).throwOnError();
  await f.db.from('pro_company_files').update({folder_id:sub,revision:2}).eq('owner_id',owner).eq('id',stored[0].id).throwOnError();
  await page.reload();await expect(lib.locator('article').filter({hasText:'Proveedores '+id})).toBeVisible({timeout:90000});
  await lib.locator('article').filter({hasText:'Proveedores '+id}).getByRole('button',{name:tr('Más opciones','More options'),exact:true}).click();
  await page.getByRole('menuitem',{name:tr('Enviar a la papelera con su contenido','Move to trash with contents'),exact:true}).click();
  await page.getByRole('dialog').last().getByRole('button',{name:tr('Enviar a la papelera','Move to trash'),exact:true}).click();
  await expect(lib.getByRole('status').filter({hasText:tr('Carpeta enviada a la papelera con su contenido.','Folder moved to the trash with its contents.')})).toBeVisible({timeout:60000});
  expect((await f.db.from('pro_company_files').select('archived').eq('id',stored[0].id).single()).data!.archived).toBe(true);
  await lib.locator('[data-company-trash-open]').click();const trash=lib.locator('[data-company-trash]');await expect(trash.locator('[data-company-trash-item]')).toHaveCount(1,{timeout:30000});
  await expect(trash).toContainText(tr('2 carpetas · 1 archivo','2 folders · 1 file'));await expect(trash).toContainText(tr('Se puede restaurar hasta el','Can be restored until'));
  await expectNoHorizontalOverflow(page);await shot(page,`r9-company-trash-${language}`,project);
  await trash.getByRole('button',{name:tr('Restaurar','Restore'),exact:true}).click();await expect(lib.getByRole('status').filter({hasText:tr('Carpeta restaurada con su contenido.','Folder restored with its contents.')})).toBeVisible({timeout:60000});
  expect((await f.db.from('pro_company_files').select('archived').eq('id',stored[0].id).single()).data!.archived).toBe(false);
  // (2) Branded documents: theme, company line and footer on the printed account statement.
  await openPro(page,`${prefix}/dashboard/pro?tab=pro_company&empresa=documentos`,en);const brand=page.locator('[data-document-branding-settings]');await expect(brand).toBeVisible({timeout:90000});
  await brand.getByRole('radio',{name:tr('Verde bosque','Forest green')}).check();
  await brand.getByLabel(tr('Nombre de la empresa en el encabezado','Company name in the header'),{exact:true}).fill('Constructora '+id);
  await brand.getByLabel(tr('Pie de página (opcional)','Footer (optional)'),{exact:true}).fill(tr('Gracias por su confianza.','Thank you for your trust.'));
  await brand.getByLabel(tr('Elegir el logo de la empresa','Choose the company logo'),{exact:true}).setInputFiles({name:'logo.png',mimeType:'image/png',buffer:await png('#0f7a3d')});
  await expect(brand.locator('[data-document-branding-preview]')).toContainText('Constructora '+id);await shot(page,`r9-branding-${language}`,project,true);
  await brand.getByRole('button',{name:tr('Guardar marca','Save branding'),exact:true}).click();await expect(brand.getByRole('status')).toContainText(tr('Marca guardada.','Branding saved.'),{timeout:60000});
  const statement=await page.request.get('/api/pro/client-statement-print?'+new URLSearchParams({clientId:f.clientId,lang:language}));expect(statement.status()).toBe(200);
  const html=await statement.text();expect(html).toContain('data-document-branding="bosque"');expect(html).toContain('#0f7a3d');expect(html).not.toContain('#008bb5');expect(html).toContain('Constructora '+id);expect(html).toContain(tr('Gracias por su confianza.','Thank you for your trust.'));expect(html).toContain('data:image/jpeg;base64,');
  const printPage=await page.context().newPage();await printPage.goto('/api/pro/client-statement-print?'+new URLSearchParams({clientId:f.clientId,lang:language,preview:'1'}));await expect(printPage.locator('.ccr-company')).toBeVisible();await expect.poll(()=>printPage.locator('.ccr-company img').evaluate(img=>(img as HTMLImageElement).complete&&(img as HTMLImageElement).naturalWidth>0)).toBe(true);await shot(printPage,`r9-branded-statement-${language}`,project,true);await printPage.close();
  // (3) Selections: an option from the catalog (price, vendor, image copy), customer approves it.
  const supplier=crypto.randomUUID(),product='r9-'+id;
  await f.db.from('pro_expense_suppliers').insert({user_id:owner,id:supplier,name:'Cerámicas '+id,identification:'',email:'',phone:'',archived:false}).throwOnError();
  await f.db.from('pro_products').insert({user_id:owner,id:product,sku:'AZ-'+id,name:tr('Azulejo blanco ','White tile ')+id,stock:10,minimum:0,cost:8000,price:12500,archived:false,itemType:'product'}).throwOnError();
  const imageId=crypto.randomUUID(),imageBytes=await sharp(await png('#c0a080')).jpeg().toBuffer(),imagePath=owner+'/'+imageId+'.jpg';
  expect((await f.db.storage.from('pro-catalog-images').upload(imagePath,imageBytes,{contentType:'image/jpeg',upsert:true})).error).toBeNull();
  await f.db.from('pro_product_details').insert({user_id:owner,product_id:product,preferred_vendor_id:supplier,image_id:imageId,image_path:imagePath,image_sha256:createHash('sha256').update(imageBytes).digest('hex'),image_size:imageBytes.length}).throwOnError();
  const area=crypto.randomUUID(),item=crypto.randomUUID();
  for(const input of [{action:'area_create',actionId:crypto.randomUUID(),id:area,name:tr('Baño principal','Main bathroom'),workId:f.workId},{action:'item_create',actionId:crypto.randomUUID(),id:item,areaId:area,name:tr('Piso','Floor'),dueDate:null,notes:null,allowanceId:null,workId:f.workId}])expect((await page.request.post('/api/pro/selections',{headers:{Origin:origin},data:input})).status()).toBe(200);
  await openPro(page,`${prefix}/dashboard/pro/trabajo/${encodeURIComponent(f.workId)}/selections`,en);
  const itemCard=page.locator('[data-job-route]').locator('article,li,div').filter({has:page.getByRole('button',{name:tr('Agregar desde el catálogo','Add from catalog'),exact:true})}).last();
  await page.getByRole('button',{name:tr('Agregar desde el catálogo','Add from catalog'),exact:true}).first().click({timeout:90000});
  const picker=page.locator('[data-selection-catalog-picker]');await picker.getByLabel(tr('Buscar en el catálogo','Search the catalog'),{exact:true}).fill('AZ-'+id);await picker.getByLabel(tr('Cantidad','Quantity'),{exact:true}).fill('12');
  await picker.locator(`[data-selection-catalog-product="${product}"]`).click({timeout:60000});
  await expect(page.locator('[data-selection-catalog-option]')).toBeVisible({timeout:60000});
  await expect.poll(()=>page.locator('[data-selection-image]').first().evaluate(img=>(img as HTMLImageElement).complete&&(img as HTMLImageElement).naturalWidth>0),{timeout:60000}).toBe(true);
  const option=(await f.db.from('pro_work_selection_options').select('id,name,brand,unit_cents,quantity').eq('owner_id',owner).eq('item_id',item)).data!;expect(option).toHaveLength(1);expect(option[0]).toMatchObject({brand:'Cerámicas '+id,unit_cents:1250000});expect(Number(option[0].quantity)).toBe(12);
  const image=await page.request.get('/api/pro/selections?'+new URLSearchParams({image:option[0].id}));expect(image.status()).toBe(200);expect(image.headers()['content-type']).toBe('image/jpeg');
  expect(itemCard).toBeTruthy();await expectNoHorizontalOverflow(page);await shot(page,`r9-selection-catalog-${language}`,project);
 }finally{await customerContext.close();await f.cleanup();}
});

for(const language of ['es','en'] as const)test(`Round 9: subcontractor comment attachments [${language}]`,async({page,browser},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name,tr=(es:string,english:string)=>en?english:es,prefix=en?'/en':'';
 const f=await ownerFixture(page.context(),id);let sub:DisposableAccount|null=null,outsider:DisposableAccount|null=null;const subContext=await newContext(browser,info),outsiderContext=await newContext(browser,info);
 try{
  const owner=f.owner.id,supplier=crypto.randomUUID(),access=crypto.randomUUID(),t1=crypto.randomUUID(),t2=crypto.randomUUID(),code='SUBR9'+randomBytes(4).toString('hex').toUpperCase();
  await warmLocalRoutes(page,[`/${language}/dashboard/subcontratista`,'/api/pro/subcontractors?workId='+encodeURIComponent(f.workId)]);
  await f.db.from('pro_expense_suppliers').insert({user_id:owner,id:supplier,name:'Electricidad '+id,identification:'',email:'',phone:'',archived:false}).throwOnError();
  await f.db.from('pro_work_tasks').insert([{owner_id:owner,work_id:f.workId,id:t1,title:tr('Cablear cocina ','Wire the kitchen ')+id,details:''},{owner_id:owner,work_id:f.workId,id:t2,title:tr('Interno ','Internal ')+id,details:''}]).throwOnError();
  sub=await account(subContext,'r9-sub');const hash=createHash('sha256').update(code).digest('hex');
  expect((await f.db.rpc('pro_sub_owner_mutate',{p_actor:owner,p_input:{action:'invite',actionId:access,workId:f.workId,supplierId:supplier,email:sub.email,tokenSha256:hash}})).error).toBeNull();
  expect((await f.db.rpc('pro_sub_accept',{p_actor:sub.id,p_verified_email:sub.email,p_input:{actionId:crypto.randomUUID(),tokenSha256:hash}})).error).toBeNull();
  expect((await f.db.rpc('pro_sub_owner_mutate',{p_actor:owner,p_input:{action:'assign_task',actionId:crypto.randomUUID(),workId:f.workId,accessId:access,subjectId:t1,on:true}})).error).toBeNull();
  // (1) Subcontractor attaches a photo to its task comment.
  const subPage=await subContext.newPage();await gotoOK(subPage,`/${language}/dashboard/subcontratista`);const task=subPage.locator(`[data-subcontractor-task="${t1}"]`);await expect(task).toBeVisible({timeout:90000});
  await task.getByLabel(tr(`Comentario sobre ${tr('Cablear cocina ','Wire the kitchen ')+id}`,`Comment on ${tr('Cablear cocina ','Wire the kitchen ')+id}`),{exact:true}).fill(tr('Tablero listo','Panel ready'));
  await task.getByLabel(tr('Adjuntar una foto o PDF al comentario','Attach a photo or PDF to the comment'),{exact:true}).setInputFiles({name:'tablero.png',mimeType:'image/png',buffer:await png('#336699')});
  await expect(task.locator('[data-sub-comment-file="photo"]')).toBeVisible({timeout:60000});await expect(task).toContainText(tr('Tablero listo','Panel ready'));
  await expectNoHorizontalOverflow(subPage);await shot(subPage,`r9-sub-attachment-${language}`,project);
  const file=(await f.db.from('pro_subcontractor_comment_files').select('id,side,mime_type').eq('owner_id',owner)).data!;expect(file).toEqual([expect.objectContaining({side:'sub',mime_type:'image/jpeg'})]);
  // (2) Owner sees it in the job and answers with a PDF; downloads are reauthorized.
  await openPro(page,`${prefix}/dashboard/pro/trabajo/${encodeURIComponent(f.workId)}/subs`,en);const thread=page.locator('[data-subcontractor-thread]').first();
  await expect(thread.locator('[data-sub-comment-file="photo"]')).toBeVisible({timeout:90000});
  await thread.getByLabel(tr('Adjuntar una foto o PDF al comentario','Attach a photo or PDF to the comment'),{exact:true}).setInputFiles({name:'plano.pdf',mimeType:'application/pdf',buffer:pdf('plano')});
  await expect(thread.locator('[data-sub-comment-file="pdf"]')).toBeVisible({timeout:60000});await shot(page,`r9-owner-sub-attachment-${language}`,project);
  const pdfRow=(await f.db.from('pro_subcontractor_comment_files').select('id').eq('owner_id',owner).eq('side','pro').single()).data!;
  expect((await subContext.request.get(origin+'/api/pro/sub-portal/files?'+new URLSearchParams({ownerId:owner,fileId:pdfRow.id}))).status()).toBe(200);
  expect((await page.request.get('/api/pro/subcontractors/files?'+new URLSearchParams({fileId:file[0].id}))).status()).toBe(200);
  outsider=await account(outsiderContext,'r9-out');
  expect((await outsiderContext.request.get(origin+'/api/pro/sub-portal/files?'+new URLSearchParams({ownerId:owner,fileId:pdfRow.id}))).status()).toBe(404);
  expect((await subContext.request.post(origin+'/api/pro/sub-portal/files',{headers:{Origin:origin},data:{ownerId:owner,accessId:access,taskId:t2,actionId:crypto.randomUUID(),body:'',name:'x.pdf',base64:pdf('x').toString('base64')}})).status()).toBe(403);
  // (3) Unassigning the task stops the subcontractor's downloads immediately.
  expect((await f.db.rpc('pro_sub_owner_mutate',{p_actor:owner,p_input:{action:'assign_task',actionId:crypto.randomUUID(),workId:f.workId,accessId:access,subjectId:t1,on:false}})).error).toBeNull();
  expect((await subContext.request.get(origin+'/api/pro/sub-portal/files?'+new URLSearchParams({ownerId:owner,fileId:pdfRow.id}))).status()).toBe(404);
 }finally{await subContext.close();await outsiderContext.close();if(sub)await cleanupDisposableAccount(sub);if(outsider)await cleanupDisposableAccount(outsider);await f.cleanup();}
});
