import {test,expect,type Page,type BrowserContext} from 'playwright/test';
import {createHash,randomBytes} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {gotoOK,expectNoHorizontalOverflow,warmLocalRoutes} from './helpers';
import {ownerFixture,local,origin,login} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {newCompanyInviteCode} from '../../src/lib/pro/team-roles';

// Fix round 13 (2026-11-16), after Round 12: print routes keep their own strict CSP, internal costs / finance
// reports / customer export are for owner, Administrator and Manager only, a concurrent first won/lost
// outcome gives exactly one 409, the customer's «Agreement and changes» shows an empty state (not an error),
// the leads board shows how to reach hidden stages and keeps a moved card in view, the sample weather of the
// daily log is only copied on an explicit choice, the team page of a collaborator without a company starts
// with its own header, and the customer's linked job opens as «My project». Disposable accounts, loopback
// only; nothing is sent, charged or issued.
const shots=process.env.FIX13_SHOTS_DIR;
// Desktop captures are taken at 1440 px wide (the project runs at 1366); mobile ones at the project's 390 px.
async function shot(page:Page,name:string,project:string,fullPage=false){if(!shots)return;mkdirSync(shots,{recursive:true});const size=page.viewportSize();
 if(size&&size.width>=1024){await page.setViewportSize({width:1440,height:size.height});await page.waitForTimeout(300);}
 await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage});if(size&&size.width>=1024)await page.setViewportSize(size);}
const label=(language:string)=>language+randomBytes(3).toString('hex');
const newContext=(browser:import('playwright/test').Browser,info:import('playwright/test').TestInfo)=>browser.newContext({baseURL:origin,viewport:info.project.use.viewport??undefined,isMobile:info.project.use.isMobile,hasTouch:info.project.use.hasTouch,userAgent:info.project.use.userAgent});
async function openPro(page:Page,path:string,en:boolean){
 await gotoOK(page,path);
 const failed=page.getByText(en?'Could not verify Pro access. Your data is preserved.':'No se pudo comprobar el acceso a Pro. Sus datos se conservan.');
 const ready=page.locator('[data-independent-pro]');
 await expect(failed.or(ready).first()).toBeVisible({timeout:90000});
 if(await failed.isVisible())await page.getByRole('button',{name:en?'Retry':'Reintentar',exact:true}).click();
 await expect(ready.first()).toBeVisible({timeout:90000});
}
const strictCsp=(value:string|undefined)=>!!value&&value.includes("default-src 'none'")&&value.includes("script-src 'nonce-");

test('Fix 13: print routes keep their own CSP; finance reads by role; one 409 on a concurrent first outcome',async({page,browser},info)=>{
 test.setTimeout(900000);local(info.project.use.baseURL);const id=label('x');
 const f=await ownerFixture(page.context(),id);const contexts:BrowserContext[]=[];let member:DisposableAccount|null=null;
 try{
  const owner=f.owner.id,headers={Origin:origin,'X-Pro-Expected-Actor':owner};
  await warmLocalRoutes(page,['/api/pro/selections-print?'+new URLSearchParams({workId:f.workId}),'/api/pro/finance-reports','/api/pro/lead-board?view=board']);
  // (1) CSP of the print routes: the route's own strict policy reaches the browser (security review #1).
  const selections=await page.request.get('/api/pro/selections-print?'+new URLSearchParams({workId:f.workId,lang:'es'}));expect(selections.status()).toBe(200);
  expect(strictCsp(selections.headers()['content-security-policy']),selections.headers()['content-security-policy']).toBe(true);
  // The print button script carries the nonce of THAT policy (issued once per response).
  const nonce=/'nonce-([a-f0-9]{32})'/.exec(selections.headers()['content-security-policy']??'')?.[1];expect(nonce).toBeTruthy();expect(await selections.text()).toContain(`nonce="${nonce}"`);
  const forged=await page.request.get('/api/pro/selections-print?'+new URLSearchParams({workId:f.workId,lang:'es'}),{headers:{'x-ccr-print-nonce':'a'.repeat(32)}});expect(forged.headers()['content-security-policy']).not.toContain('a'.repeat(32));
  const revision=(await f.db.from('pro_workspace_core').select('revision').eq('user_id',owner).single().throwOnError()).data!.revision as number;
  expect((await f.db.rpc('pro_record_client_operation',{p_user:owner,p_input:{actionId:crypto.randomUUID(),clientId:f.clientId,workId:f.workId,kind:'agreement',amountCents:10000000,note:'Acuerdo F13'},p_revision:revision})).error).toBeNull();
  const changeId=crypto.randomUUID();
  const proposed=await page.request.post('/api/pro/work-changes',{headers:{...headers,'Content-Type':'application/json'},data:{action:'propose',id:changeId,actionId:crypto.randomUUID(),workId:f.workId,baseCents:10000000,reason:'Muro F13',lines:[{description:'Bloques',amountCents:23000,qtyMilli:2000,unitCostCents:10000,markupBps:1500}],scheduleDays:1}});
  expect(proposed.status(),await proposed.text()).toBe(200);
  const change=await page.request.get('/api/pro/work-changes-print?'+new URLSearchParams({id:changeId,lang:'es'}));expect(change.status()).toBe(200);
  expect(strictCsp(change.headers()['content-security-policy']),change.headers()['content-security-policy']).toBe(true);
  const ctx=await page.request.get('/api/pro/private-estimates?'+new URLSearchParams({view:'context',clientId:f.clientId}),{headers:{'X-Pro-Expected-Actor':owner}});expect(ctx.status()).toBe(200);
  const context=await ctx.json(),estimateId=crypto.randomUUID();
  const save=await page.request.post('/api/pro/private-estimates',{headers,data:{action:'save',actionId:crypto.randomUUID(),estimateId,revision:0,clientId:f.clientId,refreshClient:false,clientFingerprint:context.clientFingerprint,source:null,issuer:{...context.issuer,issuerName:context.issuer.issuerName||'Remodelaciones '+id},title:'Cocina F13',notes:'',currency:'CRC',validUntil:null,lines:[{id:crypto.randomUUID(),description:'Gabinetes',unit:'u',qtyMilli:1000,unitPriceCents:100000,discountBps:0,taxBps:1300,catalogProductId:null,group:'Muebles'}]}});
  expect(save.status(),await save.text()).toBe(200);
  const quote=await page.request.get('/api/pro/quote-print?'+new URLSearchParams({estimateId,lang:'es'}));expect(quote.status()).toBe(200);
  expect(strictCsp(quote.headers()['content-security-policy']),quote.headers()['content-security-policy']).toBe(true);
  // Without saved branding, the print names the company instead of only ContrataCR (C2).
  expect(await quote.text()).toContain('Remodelaciones '+id);
  // (2) Concurrent FIRST outcome of the same lead (revision 0): exactly one wins, the other is a 409.
  const lead=crypto.randomUUID();
  await f.db.from('pro_lead_center_records').insert({owner_id:owner,kind:'manual',id:lead,client_id:f.clientId,title:'Terraza F13 '+id,description:'',address:'',source_label:'',project_type:'',currency:'CRC',stage_mode:'automatic',revision:1}).throwOnError();
  const outcome=(value:'won'|'lost')=>page.request.post('/api/pro/lead-board',{headers,data:{action:'outcome',actionId:crypto.randomUUID(),kind:'manual',id:lead,revision:0,outcome:value,reason:value==='won'?'referral':'price',note:''}});
  const both=await Promise.all([outcome('won'),outcome('lost')]);
  expect(both.map(r=>r.status()).sort()).toEqual([200,409]);
  expect((await f.db.from('pro_lead_outcome_history').select('action_id').eq('owner_id',owner).eq('lead_id',lead).throwOnError()).data).toHaveLength(1);
  // (3) Read-only member of the company: no internal cost, margin, finance reports or customer export.
  const memberContext=await browser.newContext({baseURL:origin});contexts.push(memberContext);
  member=await createDisposableAccount({prefix:'f13-member'});await login(memberContext,member);
  const code=newCompanyInviteCode();
  const team=(context:BrowserContext,data:Record<string,unknown>)=>context.request.post(origin+'/api/pro/team-roles',{headers:{Origin:origin},data,timeout:120000});
  expect((await team(page.context(),{action:'invite',actionId:crypto.randomUUID(),email:member.email,role:'read_only',code,locale:'es'})).status()).toBe(200);
  expect((await team(memberContext,{action:'accept',actionId:crypto.randomUUID(),code})).status()).toBe(200);
  expect((await team(memberContext,{action:'enter',ownerId:owner})).status()).toBe(200);
  for(const path of ['/api/pro/finance-reports','/api/pro/reports','/api/pro/purchase-order-sources?'+new URLSearchParams({workId:f.workId}),'/api/pro/client-contacts?view=export']){
   const r=await memberContext.request.get(origin+path,{timeout:120000});expect(r.status(),path+' '+(await r.text()).slice(0,200)).toBe(403);expect((await r.json()).code).toBe('pro_role');
  }
  const tracking=await memberContext.request.get(origin+'/api/pro/selections-tracking?'+new URLSearchParams({workId:f.workId}),{timeout:120000});expect(tracking.status()).toBe(200);
  const body=await tracking.json() as {costsHidden?:boolean;totals:{approvedCostCents:number;marginCents:number}};expect(body.costsHidden).toBe(true);expect(body.totals.approvedCostCents).toBe(0);expect(body.totals.marginCents).toBe(0);
  // The owner still reads them.
  for(const path of ['/api/pro/finance-reports','/api/pro/reports','/api/pro/purchase-order-sources?'+new URLSearchParams({workId:f.workId}),'/api/pro/client-contacts?view=export'])expect((await page.request.get(path,{headers:{'X-Pro-Expected-Actor':owner}})).status(),path).toBe(200);
 }finally{for(const c of contexts)await c.close();if(member)await cleanupDisposableAccount(member);await f.cleanup();}
});

for(const language of ['es','en'] as const)test(`Fix 13: leads board, daily log weather, customer «My project» and team page [${language}]`,async({page,browser},info)=>{
 test.setTimeout(900000);local(info.project.use.baseURL);const en=language==='en',id=label(language),project=info.project.name,tr=(es:string,english:string)=>en?english:es,prefix=en?'/en':'/es';
 const f=await ownerFixture(page.context(),id);let customer:DisposableAccount|null=null,collaborator:DisposableAccount|null=null;const contexts:BrowserContext[]=[];
 try{
  const owner=f.owner.id;
  await warmLocalRoutes(page,['/api/pro/lead-board?view=board','/api/pro/daily-log-autofill?'+new URLSearchParams({workId:f.workId,date:'2030-01-01'})]);
  // (M3) Leads board: hidden stages are announced with buttons; a card moved with the keyboard stays in view.
  const leads=[crypto.randomUUID(),crypto.randomUUID()];
  await f.db.from('pro_lead_center_records').insert(leads.map((lead,n)=>({owner_id:owner,kind:'manual',id:lead,client_id:f.clientId,title:tr('Solicitud F13 ','Lead F13 ')+n+' '+id,description:'',address:'',source_label:'',project_type:'',currency:'CRC',stage_mode:'automatic',revision:1}))).throwOnError();
  await openPro(page,`${prefix}/dashboard/pro?tab=pro_leads&tablero=1`,en);const board=page.locator('[data-lead-board]');
  const card=board.locator(`[data-lead-board-card="${leads[0]}"]`);await expect(card).toBeVisible({timeout:90000});
  await expect(board.locator('[data-lead-board-scroll-hint]')).toContainText(tr('etapas','stages'));
  await expect(board.locator('[data-lead-board-scroll="next"]')).toBeEnabled();await expectNoHorizontalOverflow(page);await shot(page,`f13-board-${language}`,project);
  const stages=await board.locator('[data-lead-board-column]').evaluateAll(els=>els.map(e=>(e as HTMLElement).dataset.leadBoardColumn!));
  await card.locator('[data-lead-board-handle]').focus();
  for(let n=1;n<=3;n++){await page.keyboard.press('ArrowRight');await expect(board.locator(`[data-lead-board-column="${stages[n]}"] [data-lead-board-card="${leads[0]}"]`)).toBeVisible({timeout:60000});await expect(board.locator(`[data-lead-board-card="${leads[0]}"] [data-lead-board-handle]`)).toBeFocused({timeout:15000});}
  const moved=board.locator(`[data-lead-board-card="${leads[0]}"]`);await expect(moved).toBeInViewport({ratio:0.5,timeout:30000});
  await expect(moved.locator('[data-lead-board-handle]')).toBeFocused();await expect(board.locator(`[data-lead-board-mark-won="${leads[1]}"]`)).toBeVisible();
  await shot(page,`f13-board-moved-${language}`,project);
  // (M4) Daily log: the sample weather is not written into the entry until the person copies it.
  await openPro(page,`${prefix}/dashboard/pro/trabajo/${encodeURIComponent(f.workId)}/updates`,en);
  await page.getByRole('button',{name:tr('Nuevo resumen','New daily log'),exact:true}).first().click();const form=page.locator('[data-daily-log-form]');await expect(form).toBeVisible({timeout:60000});
  await form.locator('[data-daily-log-autofill-button]').click();const suggestion=form.locator('[data-daily-log-autofill-weather]');await expect(suggestion).toBeVisible({timeout:60000});
  await expect(suggestion).toContainText(tr('no es el clima real','not the real weather'));
  expect((await form.locator('textarea').evaluateAll(els=>els.map(e=>(e as HTMLTextAreaElement).value))).some(v=>v.includes(tr('Clima de ejemplo','Sample weather')))).toBe(false);
  await suggestion.scrollIntoViewIfNeeded();await shot(page,`f13-daily-weather-${language}`,project);
  await suggestion.locator('[data-daily-log-autofill-weather-use]').click();await expect(suggestion.locator('[data-daily-log-autofill-weather-used]')).toBeVisible();
  expect((await form.locator('textarea').evaluateAll(els=>els.map(e=>(e as HTMLTextAreaElement).value))).some(v=>v.includes(tr('Clima de ejemplo (simulado, no es el clima real)','Sample weather (simulated, not the real weather)')))).toBe(true);
  // (M5, item 5) Customer linked by invitation to a job WITHOUT a formal agreement: «My project», empty changes state.
  const customerContext=await newContext(browser,info);contexts.push(customerContext);customer=await createDisposableAccount({prefix:'f13-cust'});await login(customerContext,customer);
  const token='f13-'+id,hash=createHash('sha256').update('ccr-work-invite:v1:'+token).digest('hex');
  expect((await f.db.rpc('pro_work_client_invitations_mutate',{p_actor:owner,p_input:{action:'create',actionId:crypto.randomUUID(),workId:f.workId,invitationId:crypto.randomUUID(),tokenHash:hash,expiresInDays:7}})).error).toBeNull();
  expect((await f.db.rpc('pro_work_client_invitation_accept',{p_actor:customer.id,p_input:{action:'accept',actionId:crypto.randomUUID(),tokenHash:hash}})).error).toBeNull();
  const requestId=(await f.db.from('pro_appointment_requests').select('id').eq('owner_id',owner).eq('client_user_id',customer.id).single()).data!.id as string;
  const cust=await customerContext.newPage();await gotoOK(cust,`/${language}/dashboard/profesional?tab=appointments&citaSolicitud=${requestId}`);
  const dialog=cust.locator('[data-client-project-page]')/* Fix 14: «Mi proyecto» is its own page */;await expect(dialog).toBeVisible({timeout:90000});
  const changes=dialog.locator('[data-client-section="changes"]');await changes.scrollIntoViewIfNeeded();
  await expect(changes.locator('[data-work-changes-empty]').or(changes.locator('[data-work-changes]').getByText(tr('Todavía no hay cambios propuestos.','No changes have been proposed yet.')))).toBeVisible({timeout:60000});
  await expect(changes.getByText(tr('No se pudieron cargar los cambios.','Could not load changes.'))).toHaveCount(0);
  await expectNoHorizontalOverflow(cust);await shot(cust,`f13-client-project-${language}`,project);if(shots)await changes.screenshot({path:join(shots,`f13-client-changes-${language}-${project}.png`)});
  // Back leaves «My project» (its own page since Fix 14).
  await cust.goBack().catch(()=>undefined);
  // (M6) Team page of a collaborator with no company: header and title first, company roles below them.
  const collaboratorContext=await newContext(browser,info);contexts.push(collaboratorContext);collaborator=await createDisposableAccount({prefix:'f13-collab'});await login(collaboratorContext,collaborator);
  const teamPage=await collaboratorContext.newPage();await gotoOK(teamPage,`/${language}/dashboard/pro/equipo`);
  const space=teamPage.locator('[data-team-space]');await expect(space).toBeVisible({timeout:90000});await expect(space.locator('[data-company-team]')).toBeVisible({timeout:60000});
  const order=await teamPage.evaluate(()=>{const h=document.querySelector('[data-team-space] h1'),c=document.querySelector('[data-company-team]'),hd=document.querySelector('[data-team-space] header');return {titleFirst:!!h&&!!c&&!!(h.compareDocumentPosition(c)&Node.DOCUMENT_POSITION_FOLLOWING),headerFirst:!!hd&&!!c&&!!(hd.compareDocumentPosition(c)&Node.DOCUMENT_POSITION_FOLLOWING)};});
  expect(order).toEqual({titleFirst:true,headerFirst:true});
  await expectNoHorizontalOverflow(teamPage);await shot(teamPage,`f13-team-collaborator-${language}`,project);
 }finally{for(const c of contexts)await c.close();if(customer)await cleanupDisposableAccount(customer);if(collaborator)await cleanupDisposableAccount(collaborator);await f.cleanup();}
});
