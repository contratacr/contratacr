import {test,expect,type BrowserContext,type Page} from 'playwright/test';
import {mkdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {ownerFixture,local,origin,login,headersFor,type Owner} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {estimateInput,json as estimateJson,post as estimatePost} from './pro-private-estimate-publications-fixture';
import {newCompanyInviteCode} from '../../src/lib/pro/team-roles';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';
import type {WorkActivityPage} from '../../src/lib/pro/work-activity';

// Per-job «Actividad» history (owner of /api/pro/work-activity in scripts/ci/verify-app-surface-ownership.mjs).
// Real events through the existing APIs (quote shared, change order, file, tasks), newest first, keyset pages,
// «Cargar más», outsider 403, Read-only company member reads. Disposable accounts, loopback only; e-mail is the
// local mock outbox, nothing is sent, charged or issued.
const shots='/private/tmp/claude-501/-Users-contratacr/856767fe-101a-4aaa-8927-aa0cf5e87baa/scratchpad/gaps-shots';
const api='/api/pro/work-activity';
const pdf=Buffer.from('%PDF-1.4\n% LOCAL_ACTIVITY_TEST_ONLY\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
async function activity(context:BrowserContext,workId:string,cursor?:{before:string;beforeId:string}|null,headers?:Record<string,string>){
 return context.request.get(origin+api+'?'+new URLSearchParams({workId,...cursor?{before:cursor.before,beforeId:cursor.beforeId}:{}}),{headers,timeout:120000});
}
async function seed(page:Page,f:Owner,label:string){
 const context=page.context(),headers=headersFor(f.owner);
 const task=async(input:Record<string,unknown>)=>{const r=await context.request.post(origin+'/api/pro/work-tasks',{headers,data:input,timeout:120000});expect(r.status(),await r.text()).toBe(200);};
 // 17 older tasks so the history has more than one page (20 per page).
 for(let i=1;i<=17;i++)await task({action:'create',actionId:crypto.randomUUID(),workId:f.workId,taskId:crypto.randomUUID(),revision:0,title:`Tarea previa ${i} ${label}`,details:'Detalle interno',dueDate:null,assignee:''});
 // 1) Quote of the job shared with the customer (by code; mock outbox).
 const ctx=await estimateJson(context,{view:'context',clientId:f.clientId,sourceKind:'work',sourceId:f.workId});
 const saved=await estimatePost(context,f.owner,estimateInput(ctx,{validUntil:'2030-12-31',title:'Cotización cocina '+label,currency:'CRC',lines:[{id:crypto.randomUUID(),description:'Muebles de cocina',unit:'unid.',qtyMilli:1000,unitPriceCents:50000000,discountBps:0,taxBps:1300,catalogProductId:null}]}));
 expect(saved.status(),await saved.text()).toBe(200);const estimate=(await saved.json()).estimate;
 const shared=await estimatePost(context,f.owner,{action:'publish',actionId:crypto.randomUUID(),publicationId:crypto.randomUUID(),estimateId:estimate.id,estimateRevision:1,recipient:{kind:'claim',email:'cliente.'+label+'@example.test',code:randomBytes(32).toString('hex')}},'/api/pro/private-estimate-publications');
 expect(shared.status(),await shared.text()).toBe(200);
 // 2) Change order on the agreed amount.
 const revision=(await f.db.from('pro_workspace_core').select('revision').eq('user_id',f.owner.id).single().throwOnError()).data!.revision;
 const agreement=await context.request.post(origin+'/api/pro/client-operations',{headers,data:{kind:'agreement',clientId:f.clientId,workId:f.workId,actionId:crypto.randomUUID(),revision,amountCents:100000000},timeout:120000});expect(agreement.status(),await agreement.text()).toBe(200);
 const change=await context.request.post(origin+'/api/pro/work-changes',{headers,data:{action:'propose',id:crypto.randomUUID(),actionId:crypto.randomUUID(),workId:f.workId,baseCents:100000000,reason:'Isla adicional '+label,lines:[{description:'Isla',amountCents:2500000}]},timeout:120000});expect(change.status(),await change.text()).toBe(200);
 // 3) File added to the job.
 const file=await context.request.post(origin+'/api/pro/work-files',{headers,data:{action:'upload',workId:f.workId,fileId:crypto.randomUUID(),name:'Plano cocina.pdf',data:pdf.toString('base64')},timeout:120000});expect(file.status(),await file.text()).toBe(200);
 // 4) Task created and completed.
 const taskId=crypto.randomUUID();
 await task({action:'create',actionId:crypto.randomUUID(),workId:f.workId,taskId,revision:0,title:'Instalar fregadero '+label,details:'',dueDate:null,assignee:''});
 await task({action:'complete',actionId:crypto.randomUUID(),workId:f.workId,taskId,revision:1});
}
const newest=['task_completed','task_created','file_added','change_propose','quote_publish'];

for(const language of ['es','en'] as const)test(`Job activity: real events newest first, pages, roles and screenshots [${language}]`,async({page,browser},info)=>{
 test.setTimeout(600000);local(info.project.use.baseURL);const en=language==='en',label='act'+language+crypto.randomUUID().slice(0,5);
 const desktop=!info.project.name.includes('mobile');if(desktop)await page.setViewportSize({width:1440,height:900});
 const f=await ownerFixture(page.context(),label);const contexts:BrowserContext[]=[];const accounts:DisposableAccount[]=[];
 try{
  // Empty state through the API before any event.
  const empty=await activity(page.context(),f.workId);expect(empty.status(),await empty.text()).toBe(200);expect(((await empty.json()) as WorkActivityPage).items).toEqual([]);
  await seed(page,f,label);
  // API: newest first, 20 + cursor, then the rest; strict order and no duplicates.
  const first=await activity(page.context(),f.workId);expect(first.status()).toBe(200);expect(first.headers()['cache-control']).toContain('no-store');
  const one=await first.json() as WorkActivityPage;expect(one.items).toHaveLength(20);expect(one.items.slice(0,5).map(i=>i.kind)).toEqual(newest);expect(one.nextCursor).not.toBeNull();
  expect(one.items[0].data.title).toBe('Instalar fregadero '+label);expect(one.items[3].data).toMatchObject({title:'Isla adicional '+label,amountCents:2500000});expect(one.items[4].data.title).toBe('Cotización cocina '+label);
  expect(one.items[4].section).toBe('estimates');expect(one.items[2].section).toBe('files');expect(JSON.stringify(one)).not.toContain('Detalle interno');
  const second=await activity(page.context(),f.workId,one.nextCursor);expect(second.status()).toBe(200);const two=await second.json() as WorkActivityPage;
  expect(two.items).toHaveLength(2);expect(two.nextCursor).toBeNull();expect(two.items.every(i=>i.kind==='task_created')).toBe(true);
  const all=[...one.items,...two.items];expect(new Set(all.map(i=>i.id)).size).toBe(22);
  for(let i=1;i<all.length;i++)expect(all[i-1].at>all[i].at||all[i-1].at===all[i].at&&all[i-1].id>all[i].id).toBe(true);
  expect((await activity(page.context(),f.workId,{before:'2026-01-01',beforeId:'x'})).status()).toBe(400);
  // Outsider (another account) → 403; a professional with their own Pro space → 403 as well.
  const outsider=await createDisposableAccount({prefix:'activity-outsider',professional:true});accounts.push(outsider);
  const outsiderContext=await browser.newContext({baseURL:origin});contexts.push(outsiderContext);await login(outsiderContext,outsider);
  expect((await activity(outsiderContext,f.workId)).status()).toBe(403);
  // Read-only company member: invited and accepted through the roles API, then enters the company.
  const member=await createDisposableAccount({prefix:'activity-reader'});accounts.push(member);
  const memberContext=await browser.newContext({baseURL:origin});contexts.push(memberContext);await login(memberContext,member);
  const code=newCompanyInviteCode();
  const invited=await page.context().request.post(origin+'/api/pro/team-roles',{headers:{Origin:origin},data:{action:'invite',actionId:crypto.randomUUID(),email:member.email,role:'read_only',code,locale:language},timeout:120000});expect(invited.status(),await invited.text()).toBe(200);
  const accepted=await memberContext.request.post(origin+'/api/pro/team-roles',{headers:{Origin:origin},data:{action:'accept',actionId:crypto.randomUUID(),code},timeout:120000});expect(accepted.status(),await accepted.text()).toBe(200);
  const entered=await memberContext.request.post(origin+'/api/pro/team-roles',{headers:{Origin:origin},data:{action:'enter',ownerId:f.owner.id},timeout:120000});expect(entered.status(),await entered.text()).toBe(200);
  const memberRead=await activity(memberContext,f.workId);expect(memberRead.status(),await memberRead.text()).toBe(200);
  expect(((await memberRead.json()) as WorkActivityPage).items.map(i=>i.id)).toEqual(one.items.map(i=>i.id));
  // UI: the Activity section of the job.
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_agenda&cita=${f.workId}&vistaTrabajo=activity`);
  const section=page.locator('[data-work-activity]');
  // The shared dev server may still be compiling the bounded Pro access probe: use its own «Retry» (never a product change).
  for(let i=0;i<3&&!await section.isVisible();i++){const retry=page.getByRole('button',{name:en?'Retry':'Reintentar',exact:true}).first();await expect(section.or(retry)).toBeVisible({timeout:120000});if(!await section.isVisible())await retry.click();}
  await expect(section).toBeVisible({timeout:120000});
  await expect(section.getByRole('heading',{name:en?'Activity':'Actividad',exact:true})).toBeVisible();
  const items=section.locator('[data-work-activity-item]');await expect(items).toHaveCount(20,{timeout:60000});
  for(const [i,kind] of newest.entries())await expect(items.nth(i)).toHaveAttribute('data-work-activity-item',kind);
  const labels=en?['Task completed','Task created','File added','Change order proposed','Quote shared']:['Tarea completada','Tarea creada','Archivo agregado','Cambio propuesto','Cotización compartida'];
  for(const [i,text] of labels.entries())await expect(items.nth(i)).toContainText(text);
  await expect(items.nth(0)).toContainText('Instalar fregadero '+label);await expect(items.nth(3)).toContainText('Isla adicional '+label);
  const date=new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'America/Costa_Rica'}).format(new Date(one.items[0].at));
  await expect(items.nth(0).locator('time')).toContainText(date);await expect(items.nth(0)).toContainText(en?'(Company)':'(Empresa)');
  await expect(page.locator('[data-job-workspace-nav]').getByRole('button',{name:en?'Activity':'Actividad',exact:true})).toHaveAttribute('aria-current','page');
  mkdirSync(shots,{recursive:true});const width=page.viewportSize()!.width;
  await expectNoHorizontalOverflow(page);await section.scrollIntoViewIfNeeded();await page.screenshot({path:`${shots}/activity-${language}-${width}.png`});
  const more=section.getByRole('button',{name:en?'Load more':'Cargar más',exact:true});await more.click();
  await expect(items).toHaveCount(22);await expect(more).toHaveCount(0);
  // Related-section link opens the files section.
  await items.nth(2).locator('[data-work-activity-link="files"]').click();
  await expect(page.locator('[data-job-workspace-nav]').getByRole('button',{name:en?'Files':'Archivos',exact:true})).toHaveAttribute('aria-current','page');
  // Summary card: last 5 and a way to the full history.
  await page.locator('[data-job-workspace-nav]').getByRole('button',{name:en?'Overview':'Resumen',exact:true}).click();
  const card=page.locator('[data-work-activity-summary]');await expect(card).toBeVisible({timeout:60000});
  await expect(card.getByRole('heading',{name:en?'Recent activity':'Actividad reciente'})).toBeVisible();await expect(card.locator('[data-work-activity-item]')).toHaveCount(5);
  await card.getByRole('button',{name:en?'View all activity':'Ver toda la actividad',exact:true}).click();await expect(section).toBeVisible();
  // Error state (ES/EN) with retry.
  let fail=true;await page.route('**/api/pro/work-activity**',route=>fail?route.fulfill({status:503,json:{error:'local'}}):route.continue());
  await section.getByRole('button',{name:en?'Refresh':'Actualizar',exact:true}).click();
  await expect(section.locator('[data-work-activity-error]')).toContainText(en?'Could not load the activity.':'No se pudo cargar la actividad.');
  fail=false;await section.locator('[data-work-activity-error]').getByRole('button',{name:en?'Retry':'Reintentar',exact:true}).click();
  await expect(section.locator('[data-work-activity-error]')).toHaveCount(0);await expect(items.first()).toHaveAttribute('data-work-activity-item','task_completed');
 }finally{for(const c of contexts)await c.close().catch(()=>{});for(const a of accounts)await cleanupDisposableAccount(a);await f.cleanup();}
});
