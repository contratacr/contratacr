import {test,expect,type Page,type BrowserContext} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import sharp from 'sharp';
import {gotoOK,expectNoHorizontalOverflow,warmLocalRoutes} from './helpers';
import {ownerFixture,local,origin,login} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';

// Round 8 (2026-11-15): the job as its own page (deep link, section in the URL, Back, right column),
// editable overview per person, person timer through the single time writer, job files organizer
// (folders, multi-upload, favorites, trash/restore, search), message attachments for both sides and
// subcontractor access limited to assigned tasks, shared files and the schedule of linked jobs.
// Disposable accounts, loopback only; nothing is sent, charged or issued.
const shots=process.env.ROUND8_SHOTS_DIR;
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

for(const language of ['es','en'] as const)test(`Round 8: job page, overview layout and timer [${language}]`,async({page},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name,tr=(es:string,english:string)=>en?english:es;
 const f=await ownerFixture(page.context(),id);
 try{
  const prefix=en?'/en':'';
  await warmLocalRoutes(page,['/api/pro/work-sidebar?workId='+f.workId,'/api/pro/overview-layout','/api/pro/work-timers']);
  // (1) Readable deep link → the job page with the section in the URL.
  await gotoOK(page,`/${language}/dashboard/pro/trabajo/${encodeURIComponent(f.workId)}/tasks`);
  // Round 9 (intentional change, QA «Ronda 9»): the job is its own route and page (no full-screen dialog).
  await expect(page).toHaveURL(/\/trabajo\/[^/?]+\/tasks$/,{timeout:90000});
  const jobPage=page.locator('[data-job-page]');await expect(jobPage).toBeVisible({timeout:90000});
  await expect(page.getByRole('heading',{level:1,name:'Remodelación de cocina '+id,exact:true})).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-job-workspace] [aria-current="page"]').first()).toHaveText(tr('Tareas','Tasks'));
  // (2) Section change is a history step: Back returns to the previous section.
  await page.locator('[data-job-workspace] nav').getByRole('button',{name:tr('Resumen','Overview'),exact:true}).click();
  await expect(page).toHaveURL(/\/trabajo\/[^/?]+$/);
  const sidebar=page.locator('[data-work-sidebar]');await expect(sidebar.locator('[data-work-sidebar-section="status"]')).toBeVisible({timeout:60000});
  for(const section of ['location','people','meetings','tags','timer'])await expect(sidebar.locator(`[data-work-sidebar-section="${section}"]`)).toBeVisible();
  await expect(sidebar).toContainText('Cliente ronda '+id);
  await page.goBack();await expect(page).toHaveURL(/\/trabajo\/[^/?]+\/tasks$/,{timeout:30000});await expect(jobPage).toBeVisible();
  await page.goForward();await expect(page).toHaveURL(/\/trabajo\/[^/?]+$/,{timeout:30000});
  await expectNoHorizontalOverflow(page);await shot(page,`r8-job-page-${language}`,project);
  // (3) Overview layout: hide «Recent activity», move «Finances» to the top, saved for this person.
  const overview=page.locator('[data-work-overview]');await expect(overview.locator('[data-work-overview-widget="finance"]')).toBeVisible({timeout:60000});
  await page.getByRole('button',{name:tr('Personalizar resumen','Customize overview'),exact:true}).click();
  const editor=page.locator('[data-overview-layout-editor]');await expect(editor).toBeVisible();
  for(let i=0;i<3;i++)await editor.getByRole('button',{name:tr('Subir Finanzas','Move Finances up'),exact:true}).click();
  await editor.locator('[data-overview-layout-item="activity"]').getByRole('checkbox').uncheck();
  await shot(page,`r8-overview-editor-${language}`,project);
  await editor.getByRole('button',{name:tr('Guardar disposición','Save layout'),exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:tr('Disposición guardada.','Layout saved.')})).toBeVisible({timeout:30000});
  const order=async()=>overview.evaluate(node=>Array.from(node.querySelectorAll<HTMLElement>('[data-work-overview-widget]')).filter(w=>!w.hidden).sort((a,b)=>Number(a.style.order)-Number(b.style.order)).map(w=>w.dataset.workOverviewWidget));
  expect(await order()).toEqual(['finance','client','next','schedule','open']);
  await page.reload();await expect(overview.locator('[data-work-overview-widget="finance"]')).toBeVisible({timeout:90000});
  await expect.poll(order,{timeout:30000}).toEqual(['finance','client','next','schedule','open']);
  await expect(overview.locator('[data-work-overview-widget="activity"]')).toBeHidden();
  await shot(page,`r8-overview-custom-${language}`,project);
  await page.getByRole('button',{name:tr('Personalizar resumen','Customize overview'),exact:true}).click();
  await page.locator('[data-overview-layout-editor]').getByRole('button',{name:tr('Restablecer predeterminado','Reset to default'),exact:true}).click();
  await expect.poll(order,{timeout:30000}).toEqual(['client','next','schedule','finance','activity','open']);
  // (4) Timer: start in the right column, stop, review (edit minutes, not billable), save once.
  const timer=sidebar.locator('[data-work-timer]');await timer.scrollIntoViewIfNeeded();
  await timer.getByLabel(tr('Nota del cronómetro (opcional)','Timer note (optional)'),{exact:true}).fill('Visita '+id);
  await timer.getByRole('button',{name:tr('Iniciar cronómetro','Start timer'),exact:true}).click();
  await expect(timer.locator('[data-work-timer-open="running"]')).toBeVisible({timeout:30000});await expect(timer.locator('[data-work-timer-clock]')).toHaveText(/^0:00:0[1-9]|^0:00:[1-5]\d/,{timeout:15000});
  await shot(page,`r8-timer-running-${language}`,project);
  // One open timer per person (server): a second start is refused.
  const second=await page.request.post(origin+'/api/pro/work-timers',{headers:{Origin:origin},data:{action:'start',actionId:crypto.randomUUID(),workId:f.workId,activityId:null,billable:true,note:''}});expect(second.status()).toBe(409);
  await timer.getByRole('button',{name:tr('Detener','Stop'),exact:true}).click();
  const review=page.getByRole('dialog',{name:tr('Revisar tiempo','Review time'),exact:true});await expect(review).toBeVisible({timeout:30000});
  await review.getByLabel(tr('Minutos','Minutes'),{exact:true}).fill('45');await review.getByText(tr('Facturable','Billable'),{exact:true}).click();
  await shot(page,`r8-timer-review-${language}`,project);
  await review.getByRole('button',{name:tr('Guardar tiempo','Save time'),exact:true}).click();await expect(review).toHaveCount(0,{timeout:30000});
  await expect.poll(async()=>(await f.db.from('pro_time_entries').select('minutes,billable,note,source').eq('owner_id',f.owner.id).eq('work_id',f.workId)).data,{timeout:30000}).toEqual([{minutes:45,billable:false,note:'Visita '+id,source:'manual'}]);
  expect((await f.db.from('pro_work_cost_entries').select('id').eq('user_id',f.owner.id).eq('work_id',f.workId)).data?.length).toBe(1);
  // Running indicator outside the job page (header of the Pro space).
  await timer.getByRole('button',{name:tr('Iniciar cronómetro','Start timer'),exact:true}).click();await expect(timer.locator('[data-work-timer-open="running"]')).toBeVisible({timeout:30000});
  await page.locator('[data-job-route]').getByRole('button',{name:tr('Volver','Back'),exact:true}).first().click();await expect(jobPage).toHaveCount(0,{timeout:60000});await expect(page).not.toHaveURL(/cita=|\/trabajo\//);
  const indicator=page.locator('[data-running-timer="running"]');await expect(indicator).toBeVisible({timeout:30000});await expect(indicator).toContainText('Remodelación de cocina '+id);
  await expectNoHorizontalOverflow(page);await shot(page,`r8-timer-indicator-${language}`,project);
  await indicator.getByRole('button',{name:tr('Detener','Stop'),exact:true}).click();
  const review2=page.getByRole('dialog',{name:tr('Revisar tiempo','Review time'),exact:true});await expect(review2).toBeVisible({timeout:30000});
  await review2.getByRole('button',{name:tr('Descartar','Discard'),exact:true}).click();await expect(page.locator('[data-running-timer]')).toHaveCount(0,{timeout:30000});
  expect((await f.db.from('pro_time_entries').select('id').eq('owner_id',f.owner.id).eq('work_id',f.workId)).data?.length).toBe(1);
  // (5) Mi panel entry point opens the job page in the Pro space.
  await gotoOK(page,`${prefix}/dashboard/profesional?tab=pro_agenda&cita=${encodeURIComponent(f.workId)}`);
  const open=page.locator('[data-open-job-page]');await expect(open).toBeVisible({timeout:90000});await open.click();
  await expect(page).toHaveURL(/\/dashboard\/pro\/trabajo\/[^/?]+$/,{timeout:90000});await expect(page.locator('[data-job-page]')).toBeVisible({timeout:90000});
 }finally{await f.cleanup();}
});

for(const language of ['es','en'] as const)test(`Round 8: job files organizer and message attachments [${language}]`,async({page,browser},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name,tr=(es:string,english:string)=>en?english:es;
 const f=await ownerFixture(page.context(),id);let customer:DisposableAccount|null=null;const customerContext=await newContext(browser,info);
 try{
  const job=(view:string)=>`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:view});
  await warmLocalRoutes(page,['/api/pro/work-file-organizer?workId='+f.workId,'/api/pro/work-files?workId='+f.workId]);
  // (1) Folders, multi-upload into a subfolder, favorite, search, trash with 30-day note, restore.
  await openPro(page,job('files'),en);const org=page.locator('[data-work-file-organizer]');await expect(org.getByRole('button',{name:tr('Nueva carpeta','New folder'),exact:true})).toBeVisible({timeout:90000});
  const newFolder=async(name:string)=>{await org.getByRole('button',{name:tr('Nueva carpeta','New folder'),exact:true}).click();const d=page.getByRole('dialog',{name:tr('Nueva carpeta','New folder'),exact:true});await d.getByLabel(tr('Nombre','Name'),{exact:true}).fill(name);await d.getByRole('button',{name:tr('Guardar','Save'),exact:true}).click();await expect(d).toHaveCount(0,{timeout:30000});};
  await newFolder('Planos '+id);await org.locator('[data-organizer-folder]').filter({hasText:'Planos '+id}).getByRole('button').first().click();
  await newFolder(tr('Eléctrico','Electrical'));await org.locator('[data-organizer-folder]').filter({hasText:tr('Eléctrico','Electrical')}).getByRole('button').first().click();
  await expect(org.getByRole('navigation')).toContainText('Planos '+id);
  await org.getByLabel(tr('Subir archivos','Upload files'),{exact:true}).setInputFiles([{name:'tablero.pdf',mimeType:'application/pdf',buffer:pdf('tablero')},{name:'foto-tablero.png',mimeType:'image/png',buffer:await png('#3366aa')}]);
  await expect(org.locator('[data-organizer-upload-progress]')).toContainText(tr('Subidos 2 de 2.','Uploaded 2 of 2.'),{timeout:120000});
  await expect(org.locator('[data-organizer-file]')).toHaveCount(2,{timeout:30000});await expect(org.locator('[data-organizer-file]').filter({hasText:'foto-tablero.jpg'})).toBeVisible();
  await org.getByRole('button',{name:tr('Marcar tablero.pdf como favorito','Mark tablero.pdf as favorite'),exact:true}).click();
  await expect(org.getByRole('button',{name:tr('Quitar tablero.pdf de favoritos','Remove tablero.pdf from favorites'),exact:true})).toBeVisible({timeout:30000});
  await expectNoHorizontalOverflow(page);await shot(page,`r8-files-folder-${language}`,project);
  await org.getByRole('button',{name:tr('Favoritos','Favorites'),exact:true}).click();await expect(org.locator('[data-organizer-file]')).toHaveCount(1,{timeout:30000});
  await org.getByLabel(tr('Buscar archivos','Search files'),{exact:true}).fill('foto-tab');await org.getByRole('button',{name:tr('Buscar','Search'),exact:true}).click();
  await expect(org.locator('[data-organizer-file]')).toHaveCount(1,{timeout:30000});await expect(org.locator('[data-organizer-file]')).toContainText('foto-tablero.jpg');
  await org.getByRole('button',{name:tr('Carpetas','Folders'),exact:true}).click();
  await org.getByRole('button',{name:tr(`Enviar Planos ${id} a la papelera`,`Move Planos ${id} to trash`),exact:true}).click();
  await expect(org.locator('[data-organizer-folder]')).toHaveCount(0,{timeout:30000});
  await org.getByRole('button',{name:new RegExp('^'+tr('Papelera','Trash'))}).click();await expect(org.locator('[data-organizer-retention]')).toBeVisible();
  await expect(org.locator('[data-organizer-folder]')).toContainText(tr('Se puede restaurar hasta el','Can be restored until'));await shot(page,`r8-files-trash-${language}`,project);
  await org.locator('[data-organizer-folder]').getByRole('button',{name:tr('Restaurar','Restore'),exact:true}).click();await expect(org.locator('[data-organizer-folder]')).toHaveCount(0,{timeout:30000});
  await org.getByRole('button',{name:tr('Carpetas','Folders'),exact:true}).click();await expect(org.locator('[data-organizer-folder]').filter({hasText:'Planos '+id})).toBeVisible({timeout:30000});
  expect((await f.db.from('pro_work_files').select('id').eq('owner_id',f.owner.id).eq('work_id',f.workId)).data?.length).toBe(2);
  // (2) Message attachments both ways.
  customer=await account(customerContext,'r8-customer');const requestId=crypto.randomUUID();
  const professional=(await f.db.from('professionals').select('id').eq('profile_id',f.owner.id).single().throwOnError()).data!;
  await f.db.from('pro_appointment_requests').insert({id:requestId,professional_id:professional.id,owner_id:f.owner.id,client_user_id:customer.id,client_name:'Cliente ronda '+id,professional_name:'Remodelaciones '+id,professional_slug:'r2-'+f.owner.id,service:'Remodelación de cocina '+id,duration_minutes:60,location_kind:'agree',location_text:'',note:'',status:'confirmed',revision:0,work_id:f.workId}).throwOnError();
  await openPro(page,job('messages'),en);const messages=page.locator('[data-work-messages]');await expect(messages.locator('[data-message-form]')).toBeVisible({timeout:90000});
  await messages.getByLabel(tr('Mensaje','Message'),{exact:true}).fill(tr('Le adjunto el plano.','Here is the plan.'));
  await messages.getByLabel(tr('Adjuntar foto o PDF','Attach photo or PDF'),{exact:true}).setInputFiles({name:'plano-cocina.pdf',mimeType:'application/pdf',buffer:pdf('plano')});
  await expect(messages.locator('[data-message-attachment-pending]')).toContainText('plano-cocina.pdf');
  await messages.getByRole('button',{name:tr('Enviar','Send'),exact:true}).click();
  await expect(messages.locator('[data-message-side="pro"] [data-message-file]')).toHaveCount(1,{timeout:60000});await expect(messages.locator('[data-message-side="pro"]')).toContainText(tr('Le adjunto el plano.','Here is the plan.'));
  await shot(page,`r8-messages-pro-attachment-${language}`,project);
  const customerPage=await customerContext.newPage();await gotoOK(customerPage,`/${language}/dashboard/profesional?tab=appointments&citaSolicitud=${requestId}`);
  const clientMessages=customerPage.locator('[data-client-messages]');await expect(clientMessages).toBeVisible({timeout:90000});
  await clientMessages.getByRole('button',{name:tr('Abrir conversación','Open conversation')}).click();
  await expect(clientMessages.locator('[data-message-side="pro"] [data-message-file]')).toContainText('plano-cocina.pdf',{timeout:60000});
  const fileId=await clientMessages.locator('[data-message-side="pro"] [data-message-file]').getAttribute('data-message-file');
  const download=await customerPage.request.get(origin+'/api/pro/work-message-files?fileId='+fileId);expect(download.status()).toBe(200);expect(download.headers()['content-type']).toBe('application/pdf');expect((await download.body()).subarray(0,8).toString('latin1')).toBe('%PDF-1.4');
  await clientMessages.getByLabel(tr('Adjuntar foto o PDF','Attach photo or PDF'),{exact:true}).setInputFiles({name:'avance.png',mimeType:'image/png',buffer:await png('#cc8844')});
  await clientMessages.getByRole('button',{name:tr('Enviar','Send'),exact:true}).click();
  await expect(clientMessages.locator('[data-message-side="client"] [data-message-file]')).toContainText('avance.jpg',{timeout:60000});
  await expect(clientMessages.locator('[data-message-side="client"] img')).toBeVisible();await expectNoHorizontalOverflow(customerPage);await shot(customerPage,`r8-messages-customer-attachment-${language}`,project);
  await openPro(page,job('messages'),en);await expect(page.locator('[data-work-messages] [data-message-side="client"] [data-message-file]')).toContainText('avance.jpg',{timeout:60000});
  // Outsider (another account) cannot list or download.
  const outsiderContext=await newContext(browser,info);const outsider=await account(outsiderContext,'r8-outsider');
  try{expect((await outsiderContext.request.get(origin+'/api/pro/work-message-files?fileId='+fileId)).status()).toBe(404);expect((await outsiderContext.request.get(origin+'/api/pro/work-message-files?requestId='+requestId)).status()).toBe(403);}
  finally{await outsiderContext.close();await cleanupDisposableAccount(outsider);}
 }finally{await customerContext.close();if(customer)await cleanupDisposableAccount(customer);await f.cleanup();}
});

for(const language of ['es','en'] as const)test(`Round 8: subcontractor access limited to assigned tasks, shared files and schedule [${language}]`,async({page,browser},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name,tr=(es:string,english:string)=>en?english:es;
 const f=await ownerFixture(page.context(),id);let sub:DisposableAccount|null=null;const subContext=await newContext(browser,info);
 try{
  const job=(view:string)=>`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:view});
  const supplierId=crypto.randomUUID(),t1=crypto.randomUUID(),t2=crypto.randomUUID();
  await warmLocalRoutes(page,[`/${language}/dashboard/subcontratista`,'/api/pro/subcontractors?workId='+encodeURIComponent(f.workId),'/api/pro/work-file-organizer?workId='+encodeURIComponent(f.workId)]);
  await f.db.from('pro_expense_suppliers').insert({user_id:f.owner.id,id:supplierId,name:'Electricidad '+id,identification:'',email:'',phone:'',archived:false}).throwOnError();
  await f.db.from('pro_company_vendor_profiles').insert({owner_id:f.owner.id,supplier_id:supplierId,kind:'subcontractor',trade:tr('Electricidad','Electrical')}).throwOnError();
  await f.db.from('pro_work_tasks').insert([{owner_id:f.owner.id,work_id:f.workId,id:t1,title:tr('Cablear cocina ','Wire the kitchen ')+id,details:'EMT'},{owner_id:f.owner.id,work_id:f.workId,id:t2,title:tr('Presupuesto interno ','Internal budget ')+id,details:'Margen 30%'}]).throwOnError();
  await f.db.from('pro_work_schedule_plans').insert({owner_id:f.owner.id,work_id:f.workId,task_id:t1,planned_start:'2030-01-05',planned_end:'2030-01-07'}).throwOnError();
  // A job file to share (organizer upload) and one that stays private.
  await openPro(page,job('files'),en);const org=page.locator('[data-work-file-organizer]');await expect(org.getByRole('button',{name:tr('Nueva carpeta','New folder'),exact:true})).toBeVisible({timeout:90000});
  await org.getByLabel(tr('Subir archivos','Upload files'),{exact:true}).setInputFiles([{name:'diagrama.pdf',mimeType:'application/pdf',buffer:pdf('diagrama')},{name:'costos.pdf',mimeType:'application/pdf',buffer:pdf('costos')}]);
  await expect(org.locator('[data-organizer-upload-progress]')).toContainText(tr('Subidos 2 de 2.','Uploaded 2 of 2.'),{timeout:120000});
  // (1) Owner invites the vendor; the code is shown once; nothing is sent.
  sub=await account(subContext,'r8-sub');
  await openPro(page,job('subs'),en);const panel=page.locator('[data-work-subcontractors]');await expect(panel.locator('[data-subcontractor-invite]')).toBeVisible({timeout:90000});
  await panel.getByLabel(tr('Proveedor o subcontratista','Vendor or subcontractor'),{exact:true}).selectOption(supplierId);
  await panel.getByLabel(tr('Correo de la persona','Person’s email'),{exact:true}).fill(sub.email);
  await panel.getByRole('button',{name:tr('Crear invitación','Create invitation'),exact:true}).click();
  const code=(await panel.locator('[data-subcontractor-code-value]').innerText({timeout:60000})).trim();expect(code).toMatch(/^[A-Z2-9]{12}$/);
  await expect(panel.locator('[data-subcontractor-status="pending"]')).toBeVisible();await expectNoHorizontalOverflow(page);await shot(page,`r8-subs-invite-${language}`,project);
  // (2) The subcontractor accepts with the code (verified email) and sees the job, no tasks yet.
  const subPage=await subContext.newPage();await gotoOK(subPage,`/${language}/dashboard/subcontratista`);
  const portal=subPage.locator('[data-subcontractor-portal]');await expect(portal.locator('[data-subcontractor-accept]')).toBeVisible({timeout:90000});
  // Typed after hydration (a value filled into the server HTML is not in React state yet).
  const codeInput=portal.getByLabel(tr('Código de invitación','Invitation code'),{exact:true}),acceptButton=portal.getByRole('button',{name:tr('Aceptar invitación','Accept invitation'),exact:true});
  await expect(async()=>{await codeInput.fill('');await codeInput.fill(code.toLowerCase().replace(/(.{4})/g,'$1-').replace(/-$/,''));await expect(acceptButton).toBeEnabled({timeout:2000});}).toPass({timeout:60000});
  await portal.getByRole('button',{name:tr('Aceptar invitación','Accept invitation'),exact:true}).click();
  const subJob=portal.locator(`[data-subcontractor-job="${f.workId}"]`);await expect(subJob).toBeVisible({timeout:60000});
  await expect(subJob).toContainText('Remodelación de cocina '+id);await expect(subJob).toContainText('Cliente ronda '+id);await expect(subJob.locator('[data-subcontractor-task]')).toHaveCount(0);
  // (3) Owner assigns ONE task and shares ONE file.
  await page.reload();await expect(panel.locator('[data-subcontractor-status="active"]')).toBeVisible({timeout:90000});
  const card=panel.locator('[data-subcontractor]').first();
  await card.getByRole('checkbox',{name:new RegExp(tr('Cablear cocina','Wire the kitchen'))}).click();await expect(card.getByRole('checkbox',{name:new RegExp(tr('Cablear cocina','Wire the kitchen'))})).toBeChecked({timeout:30000});
  await card.getByRole('checkbox',{name:'diagrama.pdf'}).click();await expect(card.getByRole('checkbox',{name:'diagrama.pdf'})).toBeChecked({timeout:30000});
  await shot(page,`r8-subs-owner-scope-${language}`,project,true);
  await subPage.reload();await expect(subJob.locator('[data-subcontractor-task]')).toHaveCount(1,{timeout:90000});
  await expect(subJob).toContainText(tr('Cablear cocina ','Wire the kitchen ')+id);await expect(subJob).not.toContainText(tr('Presupuesto interno','Internal budget'));await expect(subJob).not.toContainText('Margen');
  await expect(subJob.getByRole('link',{name:'diagrama.pdf'})).toBeVisible();await expect(subJob).not.toContainText('costos.pdf');
  await expect(subJob).not.toContainText('cliente.'+id);await expect(subJob).not.toContainText('₡');
  // (4) Comment and mark the task done; the owner sees both.
  const task=subJob.locator('[data-subcontractor-task]').first();
  await task.getByRole('textbox').fill(tr('Cableado listo.','Wiring done.'));await task.getByRole('button',{name:tr('Comentar','Comment'),exact:true}).click();await expect(task).toContainText(tr('Cableado listo.','Wiring done.'),{timeout:30000});
  await task.getByRole('button',{name:tr('Marcar como hecha','Mark done'),exact:true}).click();await expect(task).toHaveAttribute('data-status','done',{timeout:30000});
  await expectNoHorizontalOverflow(subPage);await shot(subPage,`r8-subs-portal-${language}`,project,true);
  expect((await f.db.from('pro_work_tasks').select('status').eq('owner_id',f.owner.id).eq('id',t1).single()).data?.status).toBe('done');
  await page.reload();await expect(panel.locator('[data-subcontractor-comment="sub"]')).toContainText(tr('Cableado listo.','Wiring done.'),{timeout:90000});
  // (5) Server-side scope: shared file downloads; the other job file, finances, client data and Pro tools are refused.
  const shared=(await f.db.from('pro_work_files').select('id,name').eq('owner_id',f.owner.id).eq('work_id',f.workId)).data!;
  const yes=shared.find(x=>x.name==='diagrama.pdf')!,no=shared.find(x=>x.name==='costos.pdf')!;
  expect((await subContext.request.get(origin+'/api/pro/sub-portal?'+new URLSearchParams({ownerId:f.owner.id,fileId:yes.id}))).status()).toBe(200);
  expect((await subContext.request.get(origin+'/api/pro/sub-portal?'+new URLSearchParams({ownerId:f.owner.id,fileId:no.id}))).status()).toBe(404);
  expect((await subContext.request.get(origin+'/api/pro/work-files?fileId='+no.id)).status()).toBeGreaterThanOrEqual(403);
  expect((await subContext.request.get(origin+'/api/pro/work-overview?'+new URLSearchParams({workId:f.workId,part:'finance'}))).status()).toBeGreaterThanOrEqual(403);
  expect((await subContext.request.get(origin+'/api/pro/subcontractors?workId='+encodeURIComponent(f.workId))).status()).toBeGreaterThanOrEqual(403);
  expect((await subContext.request.post(origin+'/api/pro/sub-portal',{headers:{Origin:origin},data:{action:'complete',actionId:crypto.randomUUID(),ownerId:f.owner.id,accessId:crypto.randomUUID(),taskId:t2,revision:1}})).status()).toBe(403);
  // (6) Revoke: the job disappears from the portal.
  await card.getByRole('button',{name:tr('Revocar acceso','Revoke access'),exact:true}).click();await expect(panel.locator('[data-subcontractor]')).toHaveCount(0,{timeout:30000});
  await subPage.reload();await expect(portal.locator('[data-subcontractor-job]')).toHaveCount(0,{timeout:90000});
 }finally{await subContext.close();if(sub)await cleanupDisposableAccount(sub);await f.cleanup();}
});
