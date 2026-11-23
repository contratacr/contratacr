import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {proMoney} from '../../src/lib/pro/money';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import type {Credit,CreditDetail,CreditList} from '../../src/lib/pro/credits-retainers';

// Family 50: retainers, credit notes, overpayments and refunds per project. Internal, non-fiscal
// records reusing the existing payments ledger and invoice payments. Nothing real is charged or sent.
const origin='http://127.0.0.1:3185',api='/api/pro/credits-retainers';
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}
const money=(cents:number,en:boolean)=>proMoney(cents/100,en);
type Db=ReturnType<typeof regressionAdminClient>;

async function makePro(db:Db,account:DisposableAccount,slug:string){
 const user=await db.auth.admin.getUserById(account.id);expect((await db.auth.admin.updateUserById(account.id,{user_metadata:{...user.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
 await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',account.id).throwOnError();await db.from('pro_memberships').insert({user_id:account.id,status:'active'}).throwOnError();
 await db.from('professionals').insert({profile_id:account.id,category_id:'desarrollo_web',business_name:'Créditos local',slug:slug+'-'+account.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).throwOnError();
}
async function fixture(context:BrowserContext){
 const owner=await createDisposableAccount({prefix:'credit-owner'}),db=regressionAdminClient();let rival:DisposableAccount|undefined;
 try{
  rival=await createDisposableAccount({prefix:'credit-rival'});await makePro(db,owner,'credit');await makePro(db,rival,'credit-rival');
  const workId=crypto.randomUUID(),uiWorkId=crypto.randomUUID(),day=crTodayISO(),clientId='private-credit-'+owner.id.slice(0,8),document=emptyBusiness();
  document.clients=[{id:clientId,name:'Cliente créditos local',email:'',phone:'',notes:'',archived:false}];
  document.work=[
   {id:workId,clientId,client:'Cliente créditos local',service:'Remodelación de cocina',stage:'scheduled',start:day+'T11:00:00-06:00',end:day+'T12:00:00-06:00',cancelled:false},
   {id:uiWorkId,clientId,client:'Cliente créditos local',service:'Baño principal',stage:'scheduled',start:day+'T14:00:00-06:00',end:day+'T15:00:00-06:00',cancelled:false},
  ];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(context,owner);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  for(const id of [workId,uiWorkId])expect((await context.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({workId:id,clientId}),{timeout:45000})).status()).toBe(200);
  return {owner,rival,db,workId,uiWorkId,clientId};
 }catch(error){await cleanupDisposableAccount(owner);if(rival)await cleanupDisposableAccount(rival);throw error;}
}
/** Ledger writes through the existing writer (same validation as Costs & payments). */
async function ledger(db:Db,owner:string,input:Record<string,unknown>){
 const core=await db.from('pro_workspace_core').select('revision').eq('user_id',owner).single().throwOnError();
 const r=await db.rpc('pro_record_client_operation',{p_user:owner,p_input:{actionId:crypto.randomUUID(),...input},p_revision:core.data!.revision});expect(r.error).toBeNull();
}
async function workDraft(db:Db,owner:string,workId:string,clientId:string,title:string){
 const source=await db.rpc('pro_invoice_source',{p_user:owner,p_kind:'work',p_id:workId});expect(source.error).toBeNull();
 const r=await db.rpc('pro_invoice_draft_save',{p_user:owner,p_input:{action:'create',kind:'work',sourceId:workId,clientId,title,notes:'',receiver:{name:'Cliente créditos local',identification:'',email:'',phone:'',address:''},fingerprint:(source.data as {fingerprint:string}).fingerprint}});
 expect(r.error).toBeNull();return r.data as string;
}

for(const language of ['es','en'] as const)test(`Credits & retainers: ledger reuse, applications, refunds, overpayments and UI [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(420000);local(baseURL);const en=language==='en',f=await fixture(page.context()),{owner,rival,db,workId,uiWorkId,clientId}=f;
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  const get=async(query:Record<string,string>,status=200)=>{const r=await page.request.get(api+'?'+new URLSearchParams(query),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(r.status(),JSON.stringify(query)).toBe(status);return status===200?await r.json():null;};
  const list=async(query:Record<string,string>={},id=workId)=>await get({workId:id,...query}) as CreditList;
  const detail=async(id:string,work=workId)=>await get({workId:work,view:'detail',id}) as Extract<CreditDetail,{history:unknown}>;
  const post=async(data:Record<string,unknown>,status=200)=>{const r=await page.request.post(api,{headers,data});expect(r.status(),JSON.stringify(data).slice(0,400)).toBe(status);return status===200?(await r.json()).credit as Credit:null;};
  const today=crTodayISO();
  await ledger(db,owner.id,{workId,clientId,kind:'agreement',amountCents:1000000});
  const earlier=crypto.randomUUID();await ledger(db,owner.id,{actionId:earlier,workId,clientId,kind:'payment',amountCents:300000,note:'Abono previo'});
  const draftId=await workDraft(db,owner.id,workId,clientId,'Factura interna cocina');

  // ---- API: empty list and query validation ----
  const empty=await list();expect(empty).toMatchObject({workId,tab:'retainer',canWrite:true,readOnlyReason:null,today,items:[],nextCursor:null,nextNumbers:{retainer:1,credit_note:1,overpayment:1,refund:1}});
  expect(empty.references.drafts.map(d=>[d.id,d.balanceCents])).toEqual([[draftId,1000000]]);expect(empty.references.payments.map(p=>[p.entryId,p.freeCents,p.hasMetadata])).toEqual([[earlier,300000,false]]);
  await get({},400);await get({workId,tab:'nope'},400);await get({workId,tab:'credit_note',status:'requested'},400);await get({workId,view:'detail'},400);await get({workId,extra:'1'},400);
  expect((await page.request.get(api+'?workId='+workId+'&workId='+workId,{headers:{'X-Pro-Expected-Actor':owner.id}})).status()).toBe(400);
  await get({workId:'no-such-work'},404);
  expect((await page.request.get(api+'?workId='+workId,{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).toBe(403);

  // ---- API: create retainer, validation (400), origin (403), size (413), replay and conflicts (409) ----
  const ant1=crypto.randomUUID(),base={action:'create_retainer',actionId:crypto.randomUUID(),workId,id:ant1,title:'Anticipo para iniciar',amountCents:200000,requestedOn:today,note:null};
  for(const bad of [{...base,extra:true},{...base,title:' '},{...base,amountCents:0},{...base,amountCents:10.5},{...base,requestedOn:'2026-02-30'},{...base,note:undefined}])await post(bad,400);
  expect((await page.request.post(api,{headers:{'X-Pro-Expected-Actor':owner.id},data:base})).status()).toBe(403);
  expect((await page.request.post(api,{headers,data:{...base,note:'x'.repeat(17000)}})).status()).toBe(413);
  const retainer=await post(base);expect(retainer).toMatchObject({code:'ANT-0001',status:'requested',amountCents:200000,availableCents:0,recipient:'Cliente créditos local',revision:1});
  const replay=await page.request.post(api,{headers,data:base});expect(replay.status()).toBe(200);expect((await replay.json()).credit).toEqual(retainer);
  await post({...base,title:'Otro título'},400);await post({...base,actionId:crypto.randomUUID()},409);
  // Isolation: the rival account cannot read or change it.
  const rivalPage=await browser.newContext();try{await login(rivalPage,rival);const r=await rivalPage.request.get(origin+api+'?'+new URLSearchParams({workId,view:'detail',id:ant1}),{headers:{'X-Pro-Expected-Actor':rival.id}});expect(r.status()).toBe(404);
   expect((await rivalPage.request.post(origin+api,{headers:{Origin:origin,'X-Pro-Expected-Actor':rival.id},data:{action:'cancel',actionId:crypto.randomUUID(),workId,id:ant1,revision:1,reason:null}})).status()).toBe(403);}finally{await rivalPage.close();}

  // ---- API: gapless numbering per account under concurrent retries ----
  const creates=[0,1,2].map(n=>({...base,actionId:crypto.randomUUID(),id:crypto.randomUUID(),title:'Anticipo '+n,amountCents:10000}));
  const responses=await Promise.all(creates.flatMap(d=>[page.request.post(api,{headers,data:d}),page.request.post(api,{headers,data:d})]));
  const numbers=await Promise.all(responses.map(async r=>{expect(r.status()).toBe(200);return (await r.json()).credit.number as number;}));
  for(let i=0;i<numbers.length;i+=2)expect(numbers[i]).toBe(numbers[i+1]);expect(numbers.filter((_,i)=>i%2===0).toSorted((a,b)=>a-b)).toEqual([2,3,4]);
  await post({...base,actionId:crypto.randomUUID(),id:crypto.randomUUID(),amountCents:-1},400);expect((await list()).nextNumbers.retainer).toBe(5);

  // ---- API: receive with an existing ledger payment; CAS ----
  const receive={action:'receive_retainer',actionId:crypto.randomUUID(),workId,id:ant1,revision:1,source:'existing',entryId:earlier,amountCents:200000,receivedOn:today,method:'transfer',reference:'TRF-1'};
  await post({...receive,revision:2},409);await post({...receive,amountCents:300001},400);
  const received=await post(receive);expect(received).toMatchObject({status:'available',availableCents:200000,entryId:earlier,method:'transfer',reference:'TRF-1',revision:2});
  // ---- API: apply partially to the invoice draft (shared with invoice payments) ----
  const apply1=crypto.randomUUID();
  const applied=await post({action:'apply',actionId:apply1,workId,id:ant1,revision:2,draftId,amountCents:120000});expect(applied).toMatchObject({status:'partial',appliedCents:120000,availableCents:80000});
  const invoicePayments=await (await page.request.get('/api/pro/invoice-payments?'+new URLSearchParams({id:draftId}))).json();
  expect(JSON.stringify(invoicePayments)).toContain(apply1);
  await post({action:'apply',actionId:crypto.randomUUID(),workId,id:ant1,revision:3,draftId,amountCents:80001},400);
  // ---- API: credit note never takes the draft below zero ----
  const nc=await post({action:'create_credit_note',actionId:crypto.randomUUID(),workId,id:crypto.randomUUID(),title:'Descuento por atraso',amountCents:900000,reason:'Entrega tardía acordada',note:null});
  expect(nc).toMatchObject({code:'NC-0001',status:'available'});
  await post({action:'apply',actionId:crypto.randomUUID(),workId,id:nc!.id,revision:1,draftId,amountCents:880001},400);
  await post({action:'apply',actionId:crypto.randomUUID(),workId,id:nc!.id,revision:1,draftId,amountCents:880000});
  expect((await list()).references.drafts.map(d=>[d.id,d.paymentsCents,d.creditNotesCents,d.balanceCents])).toEqual([[draftId,120000,880000,0]]);
  // ---- API: revert with history ----
  const reverted=await post({action:'unapply',actionId:crypto.randomUUID(),workId,id:ant1,revision:3,applicationId:apply1,reason:'Se aplicó a la factura equivocada'});
  expect(reverted).toMatchObject({appliedCents:0,availableCents:200000});expect(reverted!.applications[0]).toMatchObject({id:apply1,state:'reverted'});
  expect((await detail(ant1)).history.map(h=>h.action)).toEqual(['unapply','apply','receive','create']);
  // ---- API: refund (manual record) and void ----
  const refunded=await post({action:'refund',actionId:crypto.randomUUID(),workId,id:ant1,revision:4,amountCents:50000,refundedOn:today,method:'sinpe',reference:'DEV-1',note:null});
  expect(refunded).toMatchObject({availableCents:150000,refundedCents:50000});expect(refunded!.refunds[0].code).toBe('REE-0001');
  // ---- API: customer credit ledger (row 50): signed append-only entries, reversal as an inverse entry, reconciled ----
  const ledgerApi='/api/pro/credit-ledger';
  const ledgerGet=async(query:Record<string,string>,status=200)=>{const r=await page.request.get(ledgerApi+'?'+new URLSearchParams(query),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(r.status(),JSON.stringify(query)).toBe(status);return status===200?await r.json():null;};
  const book=await ledgerGet({workId});
  expect(book.reconciled).toBe(true);expect(book.entries.map((e:{event:string})=>e.event)).toEqual(expect.arrayContaining(['received','apply','unapply','refund']));
  expect(book.entries.find((e:{event:string})=>e.event==='unapply').deltaCents).toBe(-book.entries.find((e:{event:string})=>e.event==='apply').deltaCents);
  expect(book.balanceCents).toBe(book.entries[0].balanceCents);expect((await ledgerGet({clientId})).scope).toBe('client');
  await ledgerGet({},400);await ledgerGet({workId,clientId},400);
  expect((await page.request.get(ledgerApi+'?workId='+workId,{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).toBe(403);
  const refundTab=await list({tab:'refund'});expect(refundTab.tab).toBe('refund');expect(refundTab.totals.totalCents).toBe(50000);
  // ---- API: overpayment detection from the ledger ----
  await ledger(db,owner.id,{workId,clientId,kind:'payment',amountCents:400000,note:'Pago adicional'});
  const over=await list({tab:'overpayment'});
  // paid 700 000 − billed (1 000 000 − 880 000) − held by ANT-0001 min(200 000, free 300 000) = 380 000
  expect(over.detection).toEqual({paidCents:700000,billedCents:120000,reservedCents:200000,excessCents:380000});
  const extra=over.references.payments.find(p=>p.amountCents===400000)!;
  const spBase={action:'create_overpayment',actionId:crypto.randomUUID(),workId,id:crypto.randomUUID(),title:'Pago de más',amountCents:380001,entryId:extra.entryId,receivedOn:today,method:'cash',reference:null,note:null};
  await post(spBase,400);const sp=await post({...spBase,actionId:crypto.randomUUID(),amountCents:380000});expect(sp).toMatchObject({code:'SP-0001',availableCents:380000});
  expect((await list({tab:'overpayment'})).detection.excessCents).toBe(0);

  // ---- UI on the second project ----
  const mobile=(page.viewportSize()?.width??1366)<1024;
  await ledger(db,owner.id,{workId:uiWorkId,clientId,kind:'agreement',amountCents:500000});
  const uiDraft=await workDraft(db,owner.id,uiWorkId,clientId,en?'Bathroom internal invoice':'Factura interna baño');
  let failFirst=true;
  await page.route('**/api/pro/credits-retainers?**',async route=>{if(failFirst&&route.request().method()==='GET'&&!route.request().url().includes('view=')){failFirst=false;return route.fulfill({status:503,json:{error:'LOCAL failure'}});}return route.continue();});
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:uiWorkId,vistaTrabajo:'credits'}));
  const nav=page.getByRole('navigation',{name:en?'Job workspace':'Gestión del trabajo'});await expect(nav).toBeVisible({timeout:60000});
  await expect(nav.locator(`[data-job-workspace-group="${en?'Finance':'Finanzas'}"]`).getByRole('button',{name:en?'Credits & retainers':'Créditos y anticipos',exact:true})).toHaveAttribute('aria-current','page');
  const loadError=page.locator('[data-credits-load-error]');await expect(loadError).toBeVisible({timeout:60000});await loadError.getByRole('button',{name:en?'Retry':'Reintentar'}).click();
  const view=page.locator('[data-credits]');await expect(view.locator('[data-credits-empty]')).toContainText(en?'There are no retainers for this project yet.':'Todavía no hay anticipos en este proyecto.');
  await expect(view.locator('[data-credits-nonfiscal]')).toContainText(en?'does not charge the customer, move money or issue an electronic invoice':'No cobra al cliente, no mueve dinero y no emite factura');
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`credits-empty-${language}${mobile?'-mobile':''}.png`),fullPage:true});
  // Create a retainer.
  await view.getByRole('button',{name:en?'New retainer':'Nuevo anticipo'}).click();
  const form=view.locator('[data-credit-form="retainer"]');await expect(form).toContainText('ANT-0005');
  const overview=nav.getByRole('button',{name:en?'Overview':'Resumen',exact:true});
  await form.locator('[data-credit-field="title"]').fill(en?'Retainer to start':'Anticipo para iniciar');await expect(overview).toBeDisabled();
  await form.locator('[data-credit-field="amount"]').fill('abc');await form.getByRole('button',{name:en?'Save':'Guardar',exact:true}).click();
  await expect(view.locator('[data-credits-error]')).toContainText(en?'amount greater than zero':'monto mayor que cero');
  await form.locator('[data-credit-field="amount"]').fill('1.500');await form.getByRole('button',{name:en?'Save':'Guardar',exact:true}).click();
  const card=view.locator('[data-credit-detail="ANT-0005"]');await expect(card).toBeVisible();await expect(card.locator('[data-credit-status]').first()).toHaveAttribute('data-credit-status','requested');await expect(overview).toBeEnabled();
  // Receive manually: recorded once in the existing ledger.
  await card.locator('[data-credit-action="receive"]').click();
  const receiveForm=card.locator('[data-credit-receive-form]');await expect(receiveForm.locator('[data-credit-source="manual"]')).toBeChecked();
  await expect(receiveForm).toContainText(en?'No money is moved.':'No se mueve dinero.');
  await receiveForm.locator('[data-credit-field="method"]').selectOption('sinpe');await receiveForm.locator('[data-credit-field="reference"]').fill('SINPE-77');
  await receiveForm.getByRole('button',{name:en?'Save receipt':'Guardar recepción'}).click();
  await expect(card.locator('[data-credit-status]').first()).toHaveAttribute('data-credit-status','available');
  await expect(card.locator('[data-credit-ledger]')).toContainText('SINPE-77');await expect(card.locator('[data-credits-total="detail-available"]')).toContainText(money(150000,en));
  // Apply part of it to the draft.
  await card.locator('[data-credit-action="apply"]').click();
  const applyForm=card.locator('[data-credit-apply-form]');await expect(applyForm.locator('[data-credit-field="draftId"]')).toHaveValue(uiDraft);
  await applyForm.locator('[data-credit-field="amount"]').fill('1000');await applyForm.getByRole('button',{name:en?'Apply':'Aplicar',exact:true}).click();
  await expect(card.locator('[data-credits-total="detail-applied"]')).toContainText(money(100000,en));await expect(card.locator('[data-credit-status]').first()).toHaveAttribute('data-credit-status','partial');
  await expectNoHorizontalOverflow(page);await card.locator('header').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(`credits-detail-${language}${mobile?'-mobile':''}.png`)});
  // Revert with a reason.
  await card.locator('[data-credit-action="unapply"]').click();
  const reasonForm=card.locator('[data-credit-reason-form="unapply"]');await reasonForm.getByRole('button',{name:en?'Revert application':'Revertir aplicación'}).click();
  await expect(view.locator('[data-credits-error]')).toContainText(en?'Write the reason.':'Escriba el motivo.');
  await reasonForm.locator('[data-credit-field="reason"]').fill(en?'Wrong draft':'Borrador equivocado');await reasonForm.getByRole('button',{name:en?'Revert application':'Revertir aplicación'}).click();
  await expect(card.locator('[data-credit-application="reverted"]')).toBeVisible();await expect(card.locator('[data-credits-total="detail-available"]')).toContainText(money(150000,en));
  // Back to the list: columns and totals; reload keeps everything.
  await card.getByRole('button',{name:en?'Back to the list':'Volver a la lista'}).click();
  const row=view.locator('[data-credit="ANT-0005"]:visible');await expect(row).toBeVisible();await expect(row.locator('[data-credit-available]')).toContainText(money(150000,en));
  await expect(view.locator('[data-credits-total="available"]')).toContainText(money(150000,en));
  await view.locator('[data-credits-filter="status"]').selectOption('cancelled');await expect(view.locator('[data-credits-empty]')).toContainText(en?'Nothing matches this status.':'Nada coincide con este estado.');
  await view.locator('[data-credits-filter="status"]').selectOption('all');
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`credits-list-${language}${mobile?'-mobile':''}.png`),fullPage:true});
  await page.reload();
  // Desktop opens from the title in the table; phones use the card's Open button.
  const reloaded=page.locator('[data-credits]'),reloadedRow=reloaded.locator('[data-credit="ANT-0005"]:visible');
  await reloadedRow.getByRole('button',{name:mobile?(en?'Open':'Abrir'):(en?'Retainer to start':'Anticipo para iniciar'),exact:true}).click({timeout:60000});
  const again=reloaded.locator('[data-credit-detail="ANT-0005"]');await again.locator('[data-credit-history] summary').click();
  expect(await again.locator('[data-credit-history-entry]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-credit-history-entry')))).toEqual(['unapply','apply','receive','create']);
  await again.getByRole('button',{name:en?'Back to the list':'Volver a la lista'}).click();
  // Other tabs: empty states and the refund tab.
  await reloaded.locator('[data-credits-tab="credit_note"]').click();await expect(reloaded.locator('[data-credits-empty]')).toContainText(en?'There are no credit notes for this project yet.':'Todavía no hay notas de crédito en este proyecto.');
  await reloaded.locator('[data-credits-tab="overpayment"]').click();await expect(reloaded.locator('[data-credits-detection]')).toContainText(en?'No overpayment detected':'No se detecta sobrepago');
  await reloaded.locator('[data-credits-tab="refund"]').click();await expect(reloaded.locator('[data-credits-empty]')).toContainText(en?'There are no refunds recorded for this project.':'No hay reembolsos registrados en este proyecto.');
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`credits-tabs-${language}${mobile?'-mobile':''}.png`),fullPage:true});
  const book2=reloaded.locator('[data-credit-ledger]');await expect(book2).toBeVisible();await expect(book2.locator('[data-ledger-reconciled="yes"]')).toBeVisible();
  await expect(book2.locator('[data-ledger-entry="received"]').first()).toBeVisible();await expectNoHorizontalOverflow(page);
  const uiList=await list({},uiWorkId);expect(uiList.items[0]).toMatchObject({code:'ANT-0005',status:'available',amountCents:150000,appliedCents:0,availableCents:150000});
  expect(runtime).toEqual([]);
 }finally{await cleanupDisposableAccount(f.owner);await cleanupDisposableAccount(f.rival);}
});
