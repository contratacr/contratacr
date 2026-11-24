import {test,expect,type Page,type BrowserContext} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import sharp from 'sharp';
import {collectPageErrors,gotoOK,expectNoHorizontalOverflow,warmLocalRoutes} from './helpers';
import {ownerFixture,local,origin,login} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';

// Round 7C (2026-11-13): company roles enforced by the server gate (+ invitation email draft, lead
// assignment), Gantt inline add/undo/keyboard, one Daily Log with «Visible al cliente», one time form
// and one cost form, catalog item image + preferred vendor, mood board text/arrow/drawing, the
// 20 MiB file limit wording and job messages between the professional and the customer.
// Disposable accounts, loopback only; nothing is sent, charged or issued.
const shots=process.env.ROUND7C_SHOTS_DIR;
async function shot(page:Page,name:string,project:string,fullPage=false){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage});}
const label=(language:string)=>language+randomBytes(3).toString('hex');
async function openPro(page:Page,path:string,en:boolean){
 await gotoOK(page,path);
 const failed=page.getByText(en?'Could not verify Pro access. Your data is preserved.':'No se pudo comprobar el acceso a Pro. Sus datos se conservan.');
 const ready=page.locator('[data-independent-pro]');
 await expect(failed.or(ready).first()).toBeVisible({timeout:90000});
 if(await failed.isVisible())await page.getByRole('button',{name:en?'Retry':'Reintentar',exact:true}).click();
 await expect(ready.first()).toBeVisible({timeout:90000});
}
async function account(context:BrowserContext,prefix:string):Promise<DisposableAccount>{const person=await createDisposableAccount({prefix});await login(context,person);return person;}

for(const language of ['es','en'] as const)test(`Round 7C: company roles, invitation draft and lead assignment [${language}]`,async({page,browser},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name,tr=(es:string,english:string)=>en?english:es;
 const f=await ownerFixture(page.context(),id);const memberContext=await browser.newContext({baseURL:origin,viewport:page.viewportSize()??undefined,isMobile:info.project.use.isMobile,hasTouch:info.project.use.hasTouch,userAgent:info.project.use.userAgent});
 let member:DisposableAccount|null=null,outsider:DisposableAccount|null=null;
 try{
  await warmLocalRoutes(page,[`/${language}/dashboard/pro/equipo`,'/api/pro/team-roles?view=me',`/${language}/dashboard/pro?tab=pro_leads`]);
  const errors=collectPageErrors(page);
  // (1) Owner invites by email: a draft (never sent) + a one-time code.
  member=await account(memberContext,'r7c-member');const memberPage=await memberContext.newPage();
  await gotoOK(page,`/${language}/dashboard/pro/equipo`);
  const panel=page.locator('[data-company-team]');await expect(panel).toBeVisible({timeout:90000});
  const invite=panel.locator('[data-company-invite]');
  await invite.getByLabel(tr('Correo de la persona','Member email'),{exact:true}).fill(member.email);
  await invite.getByLabel(tr('Rol de la invitación','Invitation role'),{exact:true}).selectOption('read_only');
  await invite.getByRole('button',{name:tr('Crear invitación','Create invitation'),exact:true}).click();
  const draft=panel.locator('[data-company-invite-draft]');await expect(draft).toContainText(tr('Borrador de correo: no se envió','Draft email: not sent'),{timeout:60000});
  await expect(draft).toContainText(tr('Solo lectura','Read-only'));await expect(draft).toContainText(member.email);
  const code=await draft.getByLabel(tr('Código de invitación emitido','Issued invitation code'),{exact:true}).inputValue();expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
  // Launch fix I5: the invitation e-mail is recorded in the local test mailbox (mock mode: nothing is delivered) and never carries the code.
  await expect(draft.locator('[data-transactional-email="mock:recorded"]')).toBeVisible();
  const mailbox=await page.request.get('/api/pro/correos-prueba?kind=team_invite&to='+encodeURIComponent(member.email.toLowerCase()));expect(mailbox.ok()).toBeTruthy();
  const mails=(await mailbox.json()).items as {subject:string;text:string}[];expect(mails.length).toBe(1);expect(mails[0].subject).toContain(tr('Invitación para unirse','Invitation to join'));expect(mails[0].text).not.toContain(code);
  await panel.locator('[data-company-matrix] summary').click();await expect(panel.locator('[data-company-matrix] table')).toBeVisible();
  await expectNoHorizontalOverflow(page);await shot(page,`r7c-team-invite-${language}`,project,true);
  // (2) The member joins with the code and works in the company.
  await gotoOK(memberPage,`/${language}/dashboard/pro/equipo`);
  const join=memberPage.locator('[data-company-join]');await expect(join).toBeVisible({timeout:90000});
  await join.getByLabel(tr('Código de invitación de la empresa','Company invitation code'),{exact:true}).fill(code.toLowerCase());
  await join.getByRole('button',{name:tr('Unirme','Join'),exact:true}).click();
  await memberPage.getByRole('button',{name:tr('Aceptar','OK')}).or(memberPage.getByRole('button',{name:tr('Entendido','Got it')})).first().click({timeout:20000}).catch(()=>{});
  const memberships=memberPage.locator('[data-company-memberships]');await expect(memberships).toContainText('Remodelaciones '+id,{timeout:60000});
  await expect(memberships).toContainText(tr('Solo lectura','Read-only'));
  const enter=await memberPage.request.post(origin+'/api/pro/team-roles',{headers:{Origin:origin},data:{action:'enter',ownerId:f.owner.id}});expect(enter.status(),await enter.text()).toBe(200);
  // Read-only: reads the owner's job, every write is refused by the gate (403, before the route).
  const readTasks=await memberPage.request.get(origin+'/api/pro/work-tasks?workId='+encodeURIComponent(f.workId));expect(readTasks.status(),await readTasks.text()).toBe(200);
  const taskBody={action:'create',actionId:crypto.randomUUID(),workId:f.workId,taskId:crypto.randomUUID(),revision:0,title:'Tarea del integrante '+id,details:'',dueDate:null,assignee:''};
  const denied=await memberPage.request.post(origin+'/api/pro/work-tasks',{headers:{Origin:origin,'Content-Type':'application/json'},data:taskBody});
  expect(denied.status()).toBe(403);expect((await denied.json()).code).toBe('pro_role');
  // Owner raises the role to Member: job writes pass, finance writes still refused.
  const team=await page.request.get(origin+'/api/pro/team-roles?view=me');const teamBody=await team.json();const row=teamBody.members.find((m:{userId:string})=>m.userId===member!.id);
  expect((await page.request.post(origin+'/api/pro/team-roles',{headers:{Origin:origin},data:{action:'set_role',actionId:crypto.randomUUID(),memberId:row.id,revision:row.revision,role:'member'}})).status()).toBe(200);
  const created=await memberPage.request.post(origin+'/api/pro/work-tasks',{headers:{Origin:origin,'Content-Type':'application/json'},data:{...taskBody,actionId:crypto.randomUUID()}});expect(created.status(),await created.text()).toBe(200);
  const ownerTask=await f.db.from('pro_work_tasks').select('owner_id,title').eq('id',taskBody.taskId).single().throwOnError();expect(ownerTask.data!.owner_id).toBe(f.owner.id);
  const finance=await memberPage.request.post(origin+'/api/pro/expenses',{headers:{Origin:origin,'Content-Type':'application/json'},data:{}});expect(finance.status()).toBe(403);
  // The member's change is recorded with its identity.
  await page.reload();await expect(page.locator('[data-company-team]')).toBeVisible({timeout:90000});
  // Forged workspace headers from another account are ignored (the gate strips them).
  outsider=await createDisposableAccount({prefix:'r7c-outsider'});const outsiderContext=await browser.newContext({baseURL:origin});try{await login(outsiderContext,outsider);
   const forged=await outsiderContext.request.get(origin+'/api/pro/work-tasks?workId='+encodeURIComponent(f.workId),{headers:{'x-pro-workspace-owner':f.owner.id,'x-pro-workspace-member':outsider.id,'x-pro-workspace-role':'admin'}});expect(forged.status()).not.toBe(200);
  }finally{await outsiderContext.close();}
  // The member sees the company banner in the Pro space.
  await openPro(memberPage,`/${language}/dashboard/pro`,en);
  const banner=memberPage.locator('[data-pro-workspace-banner]');await expect(banner).toContainText('Remodelaciones '+id,{timeout:60000});await expect(banner).toContainText(tr('Miembro','Member'));
  await expectNoHorizontalOverflow(memberPage);await shot(memberPage,`r7c-member-banner-${language}`,project);
  // (3) Lead assignment («Asignado a») and the filter.
  const leadA=crypto.randomUUID(),leadB=crypto.randomUUID();
  await f.db.from('pro_lead_center_records').insert([{owner_id:f.owner.id,kind:'manual',id:leadA,client_id:f.clientId,title:'Baño '+id,description:'',address:'',source_label:'',project_type:'',currency:'CRC',stage_mode:'automatic',revision:1},{owner_id:f.owner.id,kind:'manual',id:leadB,client_id:f.clientId,title:'Terraza '+id,description:'',address:'',source_label:'',project_type:'',currency:'CRC',stage_mode:'automatic',revision:1}]).throwOnError();
  await openPro(page,`/${language}/dashboard/pro?tab=pro_leads`,en);
  const rowA=page.locator(`[data-pro-lead="${leadA}"]`);await expect(rowA).toBeVisible({timeout:90000});
  const assignee=rowA.locator('[data-lead-assignee] select');await expect(assignee).toBeVisible({timeout:60000});
  await assignee.selectOption(member.id);await expect(assignee).toHaveValue(member.id,{timeout:30000});
  const filter=page.locator('[data-lead-assignee-filter]');await filter.selectOption(member.id);
  await expect(page.locator(`[data-pro-lead="${leadB}"]`)).toHaveCount(0,{timeout:60000});await expect(rowA).toBeVisible();
  await filter.selectOption('unassigned');await expect(page.locator(`[data-pro-lead="${leadB}"]`)).toBeVisible({timeout:60000});await expect(rowA).toHaveCount(0);
  await expectNoHorizontalOverflow(page);await shot(page,`r7c-leads-assigned-${language}`,project);
  // Leaving the company removes the cookie: the member is back in its own account.
  expect((await memberPage.request.post(origin+'/api/pro/team-roles',{headers:{Origin:origin},data:{action:'exit'}})).status()).toBe(200);
  expect((await memberPage.request.get(origin+'/api/pro/work-tasks?workId='+encodeURIComponent(f.workId))).status()).not.toBe(200);
  expect(errors()).toEqual([]);
 }finally{await memberContext.close();if(member)await cleanupDisposableAccount(member);if(outsider)await cleanupDisposableAccount(outsider);await f.cleanup();}
});

for(const language of ['es','en'] as const)test(`Round 7C: Gantt, Daily Log, time/cost, catalog, boards, messages [${language}]`,async({page,browser},info)=>{
 test.setTimeout(900000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name,tr=(es:string,english:string)=>en?english:es;
 const f=await ownerFixture(page.context(),id);let customer:DisposableAccount|null=null;const customerContext=await browser.newContext({baseURL:origin,viewport:page.viewportSize()??undefined,isMobile:info.project.use.isMobile,hasTouch:info.project.use.hasTouch,userAgent:info.project.use.userAgent});
 try{
  const job=(view:string,extra:Record<string,string>={})=>`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:f.workId,vistaTrabajo:view,...extra});
  await warmLocalRoutes(page,[job('tasks',{vistaTareas:'plan'}),'/api/pro/work-journal?view=owner&workId='+f.workId,'/api/pro/work-messages?view=threads&workId='+f.workId]);
  // (1) Gantt: inline add, undo, keyboard move.
  await openPro(page,job('tasks',{vistaTareas:'plan'}),en);
  const plan=page.locator('[data-work-plan]'),details=plan.locator('[data-work-timeline-details]');await expect(details.locator('summary')).toHaveAttribute('aria-disabled','false',{timeout:90000});await details.locator('summary').click();
  const chart=details.locator('[data-work-timeline]'),inline=chart.locator('[data-work-timeline-inline-add]');await expect(inline).toBeVisible({timeout:60000});
  await inline.getByLabel(tr('Nombre de la nueva tarea','New task name'),{exact:true}).fill('Instalar muebles '+id);
  await inline.getByRole('button',{name:tr('Agregar','Add'),exact:true}).click();
  const entry=chart.locator('[data-work-timeline-entry^="task:"]').filter({hasText:'Instalar muebles '+id});await expect(entry).toHaveCount(1,{timeout:60000});
  await expect(chart.locator('[data-work-timeline-notice]')).toContainText(tr('Agregada','Added'));
  await chart.locator('[data-work-timeline-undo]').click();await expect(entry).toHaveCount(0,{timeout:60000});
  await inline.getByLabel(tr('Nombre de la nueva tarea','New task name'),{exact:true}).fill('Pintar '+id);await inline.getByRole('button',{name:tr('Agregar','Add'),exact:true}).click();
  const paint=chart.locator('[data-work-timeline-entry^="task:"]').filter({hasText:'Pintar '+id});await expect(paint).toHaveCount(1,{timeout:60000});
  const before=await paint.locator('[data-work-timeline-dates]').innerText();await expect(chart.locator('[data-work-timeline-drag-ready="true"]').first()).toBeVisible({timeout:60000});
  await paint.focus();await paint.press('ArrowRight');await expect(chart.locator('[data-work-timeline-notice]')).toContainText(tr('Movida','Moved'),{timeout:30000});
  await expect(paint.locator('[data-work-timeline-dates]')).not.toHaveText(before,{timeout:60000});
  await expect(chart.locator('[data-work-timeline-undo]')).toBeEnabled({timeout:60000});await chart.locator('[data-work-timeline-undo]').click();
  await expect(paint.locator('[data-work-timeline-dates]')).toHaveText(before,{timeout:60000});
  await expectNoHorizontalOverflow(page);await shot(page,`r7c-gantt-${language}`,project);
  // (2) Daily Log: a previous update becomes an entry; visible to the customer with crew/hours.
  customer=await account(customerContext,'r7c-customer');const requestId=crypto.randomUUID();
  const professional=(await f.db.from('professionals').select('id').eq('profile_id',f.owner.id).single().throwOnError()).data!;
  await f.db.from('pro_appointment_requests').insert({id:requestId,professional_id:professional.id,owner_id:f.owner.id,client_user_id:customer.id,client_name:'Cliente ronda '+id,professional_name:'Remodelaciones '+id,professional_slug:'r2-'+f.owner.id,service:'Remodelación de cocina '+id,duration_minutes:60,location_kind:'agree',location_text:'',note:'',status:'confirmed',revision:0,work_id:f.workId}).throwOnError();
  await f.db.from('pro_work_updates').insert({owner_id:f.owner.id,work_id:f.workId,id:crypto.randomUUID(),title:tr('Demolición terminada','Demolition done')+' '+id,text:tr('Se retiraron los muebles viejos.','Old cabinets removed.')}).throwOnError();
  await openPro(page,job('updates'),en);
  await expect(page.locator('[data-work-journal-note]')).toBeVisible({timeout:90000});
  const journal=page.locator('[data-journal-entry]').first();await expect(journal).toBeVisible({timeout:60000});await expect(journal).toContainText(tr('Venía de un avance anterior','From a previous update'));
  await journal.locator('[data-journal-visible]').check();await expect(journal.locator('[data-journal-visible]')).toBeChecked({timeout:30000});
  await journal.getByRole('button',{name:tr('Personal y horas','Crew and hours'),exact:true}).click();
  await journal.getByLabel(tr('Personas en obra','People on site'),{exact:true}).fill('3');await journal.getByLabel(tr('Horas totales del personal','Total crew hours'),{exact:true}).fill(en?'12.5':'12,5');
  await journal.getByRole('button',{name:tr('Guardar','Save'),exact:true}).click();
  await expect(page.locator('[data-journal-crew]').first()).toContainText(en?'3 people · 12.5 h':'3 personas · 12,5 h',{timeout:30000});
  await expectNoHorizontalOverflow(page);await shot(page,`r7c-daily-log-${language}`,project);
  // (3) One time form: «Registrar tiempo» in Costs opens the time form (activity, person, billable).
  await openPro(page,job('costs'),en);await page.locator('[data-work-cost-record-time]').click({timeout:90000});
  await expect(page).toHaveURL(/(?:vistaTrabajo=|\/trabajo\/[^/?]+\/)time(?:[?&]|$)/,{timeout:60000});const manual=page.locator('[data-time-manual]');await expect(manual).toBeVisible({timeout:60000});
  await expect(manual.getByRole('heading',{name:tr('Registrar tiempo','Record time')})).toBeVisible();await expect(manual).toContainText(tr('Facturable','Billable'));
  await shot(page,`r7c-time-form-${language}`,project);
  // One cost form: category, VAT, payment method, receipt, billable.
  await openPro(page,job('costs'),en);await page.getByRole('button',{name:tr('Registrar costo','Record cost'),exact:true}).click({timeout:90000});
  const costFields=page.locator('[data-cost-fields]');await expect(costFields).toBeVisible({timeout:60000});
  for(const field of ['category','vat','method','receipt','billable'])await expect(costFields.locator(`[data-cost-field="${field}"]`)).toBeVisible();
  await shot(page,`r7c-cost-form-${language}`,project);await page.keyboard.press('Escape');
  // (4) File limit wording: 20 MB.
  await openPro(page,job('updates'),en);await page.getByRole('button',{name:tr('Adjuntar archivo','Attach file'),exact:true}).click({timeout:90000});await expect(page.getByText(tr('Máximo 20 MB','Maximum 20 MB'),{exact:false}).first()).toBeVisible({timeout:60000});await expect(page.getByText(tr('PNG y WebP se guardan como JPG','PNG and WebP are saved as JPG'),{exact:false}).first()).toBeVisible();await page.keyboard.press('Escape');
  // (5) Catalog item: image (PNG → JPEG) and preferred vendor.
  const productId='r7c-'+id;await f.db.from('pro_products').insert({user_id:f.owner.id,id:productId,sku:'R7C-'+id,name:'Grifo '+id,stock:2,minimum:0,cost:10000,price:15000,archived:false,itemType:'product'}).throwOnError();
  const vendor=crypto.randomUUID();await f.db.from('pro_expense_suppliers').insert({user_id:f.owner.id,id:vendor,name:'Ferretería '+id,identification:'',email:'',phone:'',archived:false}).throwOnError();
  const png=await sharp({create:{width:64,height:48,channels:4,background:{r:0,g:139,b:181,alpha:0.5}}}).png().toBuffer();
  const up=await page.request.post(origin+'/api/pro/catalog-details',{headers:{Origin:origin},data:{action:'upload_image',actionId:crypto.randomUUID(),productId,revision:0,name:'grifo.png',data:png.toString('base64')}});expect(up.status(),await up.text()).toBe(200);
  const vendorSet=await page.request.post(origin+'/api/pro/catalog-details',{headers:{Origin:origin},data:{action:'set_vendor',actionId:crypto.randomUUID(),productId,revision:1,vendorId:vendor}});expect(vendorSet.status(),await vendorSet.text()).toBe(200);
  const image=await page.request.get(origin+'/api/pro/catalog-details?'+new URLSearchParams({view:'image',productId}));expect(image.status()).toBe(200);expect(image.headers()['content-type']).toBe('image/jpeg');
  const stale=await page.request.post(origin+'/api/pro/catalog-details',{headers:{Origin:origin},data:{action:'set_vendor',actionId:crypto.randomUUID(),productId,revision:1,vendorId:null}});expect(stale.status()).toBe(409);
  await openPro(page,`/${language}/dashboard/pro?tab=pro_inventory&producto=${productId}`,en);
  const extras=page.locator('[data-catalog-extras]');await expect(extras).toBeVisible({timeout:90000});await expect(extras.locator('[data-catalog-image]')).toBeVisible({timeout:60000});await expect(extras).toContainText('Ferretería '+id);
  await expectNoHorizontalOverflow(page);await shot(page,`r7c-catalog-item-${language}`,project);
  // (6) Mood board: free text, arrow and a freehand stroke (undo keeps one step per stroke).
  await openPro(page,job('moodboards'),en);const boards=page.locator('[data-mood-boards]');await expect(boards).toBeVisible({timeout:90000});
  await boards.getByRole('button',{name:tr('Nuevo tablero','New board')}).click();const boardForm=boards.locator('[data-mood-board-form]');await boardForm.locator('[data-mood-field="name"]').fill(tr('Cocina cálida','Warm kitchen'));
  await boardForm.getByRole('button',{name:tr('Crear tablero','Create board')}).click();const editor=page.locator('[data-mood-board-editor]');await expect(editor).toBeVisible({timeout:60000});
  const canvas=editor.locator('[data-mood-canvas="editor"]'),addPanel=editor.locator('[data-mood-add-panel]');
  await editor.locator('[data-mood-add="text"]').click();await addPanel.locator('[data-mood-field="text"]').fill(tr('Madera y latón','Wood and brass'));await addPanel.getByRole('button',{name:tr('Agregar texto','Add text')}).click();
  await expect(canvas.locator('[data-mood-element="text"]')).toHaveCount(1);
  await editor.locator('[data-mood-add="arrow"]').click();await addPanel.getByRole('button',{name:'↘'}).click();await addPanel.getByRole('button',{name:tr('Agregar flecha','Add arrow')}).click();
  await expect(canvas.locator('[data-mood-element="arrow"]')).toHaveCount(1);
  await editor.locator('[data-mood-add="drawing"]').click();const layer=canvas.locator('[data-mood-draw-layer]');await expect(layer).toBeVisible();
  const box=(await layer.boundingBox())!,points=[...Array(9).keys()].map(i=>({x:box.x+box.width*(0.2+i*0.06),y:box.y+box.height*(0.6-Math.sin(i/2)*0.15)}));
  if(info.project.use.hasTouch){// Touch stroke (pointerType touch) on the phone project; mouse on desktop.
   await layer.dispatchEvent('pointerdown',{pointerId:7,pointerType:'touch',isPrimary:true,button:0,buttons:1,clientX:points[0].x,clientY:points[0].y});
   for(const p of points.slice(1))await layer.dispatchEvent('pointermove',{pointerId:7,pointerType:'touch',isPrimary:true,buttons:1,clientX:p.x,clientY:p.y});
   await layer.dispatchEvent('pointerup',{pointerId:7,pointerType:'touch',isPrimary:true,button:0,buttons:0,clientX:points[8].x,clientY:points[8].y});
  }else{await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();for(const p of points.slice(1))await page.mouse.move(p.x,p.y);await page.mouse.up();}
  await expect(canvas.locator('[data-mood-element="drawing"]')).toHaveCount(1,{timeout:30000});
  await expectNoHorizontalOverflow(page);await shot(page,`r7c-moodboard-${language}`,project);
  await editor.getByRole('button',{name:tr('Deshacer','Undo'),exact:true}).click();await expect(canvas.locator('[data-mood-element="drawing"]')).toHaveCount(0);
  await editor.getByRole('button',{name:tr('Rehacer','Redo'),exact:true}).click();await expect(canvas.locator('[data-mood-element="drawing"]')).toHaveCount(1);
  // (7) Messages: the professional writes in the job; the customer sees the unread badge and replies.
  await openPro(page,job('messages'),en);const messages=page.locator('[data-work-messages]');await expect(messages.locator('[data-message-form]')).toBeVisible({timeout:90000});
  await messages.getByLabel(tr('Mensaje','Message'),{exact:true}).fill(tr('Mañana llegamos a las 8 a. m.','We arrive tomorrow at 8 a.m.'));await messages.getByRole('button',{name:tr('Enviar','Send'),exact:true}).click();
  await expect(messages.locator('[data-message-side="pro"]')).toHaveCount(1,{timeout:30000});await shot(page,`r7c-messages-pro-${language}`,project);
  const customerPage=await customerContext.newPage();await gotoOK(customerPage,`/${language}/dashboard/profesional?tab=appointments&citaSolicitud=${requestId}`);
  const clientMessages=customerPage.locator('[data-client-messages]');await expect(clientMessages.locator('[data-client-messages-unread]')).toBeVisible({timeout:90000});
  const clientJournal=customerPage.locator('[data-client-journal]');await expect(clientJournal.locator('[data-client-journal-entry]')).toHaveCount(1,{timeout:60000});await expect(clientJournal).toContainText(en?'3 people · 12.5 h':'3 personas · 12,5 h');
  await clientMessages.getByRole('button',{name:tr('Abrir conversación','Open conversation')}).click();await expect(clientMessages.locator('[data-message-side="pro"]')).toHaveCount(1,{timeout:30000});
  await clientMessages.getByLabel(tr('Mensaje','Message'),{exact:true}).fill(tr('Perfecto, gracias.','Perfect, thanks.'));await clientMessages.getByRole('button',{name:tr('Enviar','Send'),exact:true}).click();
  await expect(clientMessages.locator('[data-message-side="client"]')).toHaveCount(1,{timeout:30000});await expect(clientMessages.locator('[data-client-messages-unread]')).toHaveCount(0);
  await expectNoHorizontalOverflow(customerPage);await clientMessages.scrollIntoViewIfNeeded();await shot(customerPage,`r7c-customer-messages-journal-${language}`,project);
  await openPro(page,job('messages'),en);await expect(page.locator('[data-job-badge="messages"]').or(page.locator('[data-message-side="client"]')).first()).toBeVisible({timeout:60000});
  await expect(page.locator('[data-work-messages] [data-message-side="client"]')).toHaveCount(1,{timeout:60000});
  expect((await customerPage.request.post(origin+'/api/pro/work-messages',{headers:{Origin:origin},data:{action:'post',actionId:crypto.randomUUID(),requestId:crypto.randomUUID(),body:'x'}})).status()).toBe(403);
 }finally{await customerContext.close();if(customer)await cleanupDisposableAccount(customer);await f.cleanup();}
});
