import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {proMoney} from '../../src/lib/pro/money';
import {gotoOK,expectNoHorizontalOverflow,collectPageErrors} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import type {ClientStatementPage} from '../../src/lib/pro/client-statement';
import type {PaymentOverviewPage} from '../../src/lib/pro/payment-overview';

// Applied credit notes (family 50) in the customer statement and the payment overview
// (docs/pro/sql/credit-notes-statement-local.sql). Read-only views; nothing is charged or sent.
const origin='http://127.0.0.1:3185';
const money=(cents:number,en:boolean)=>proMoney(cents/100,en);
type Db=ReturnType<typeof regressionAdminClient>;
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});expect((await auth.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();}
async function makePro(db:Db,account:DisposableAccount){
 const user=await db.auth.admin.getUserById(account.id);expect((await db.auth.admin.updateUserById(account.id,{user_metadata:{...user.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
 await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',account.id).throwOnError();await db.from('pro_memberships').insert({user_id:account.id,status:'active'}).throwOnError();
 await db.from('professionals').insert({profile_id:account.id,category_id:'desarrollo_web',business_name:'Notas de crédito local',slug:'credit-notes-'+account.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).throwOnError();
}
async function ledger(db:Db,owner:string,input:Record<string,unknown>){
 const core=await db.from('pro_workspace_core').select('revision').eq('user_id',owner).single().throwOnError();
 const r=await db.rpc('pro_record_client_operation',{p_user:owner,p_input:{actionId:crypto.randomUUID(),...input},p_revision:core.data!.revision});expect(r.error).toBeNull();
}

for(const language of ['es','en'] as const)test(`Credit notes reduce the customer statement balance and show in the payment overview [${language}]`,async({page,baseURL},info)=>{
 test.setTimeout(300000);expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const en=language==='en',db=regressionAdminClient(),owner=await createDisposableAccount({prefix:'credit-notes'}),errors=collectPageErrors(page);
 const mobile=(page.viewportSize()?.width??1366)<1024,shot=(name:string)=>info.outputPath(`${name}-${language}${mobile?'-mobile':''}.png`);
 try{
  await makePro(db,owner);
  const workId=crypto.randomUUID(),clientId='credit-notes-'+owner.id.slice(0,8),day=crTodayISO(),document=emptyBusiness();
  document.clients=[{id:clientId,name:'Cliente notas de crédito',email:'',phone:'',notes:'',archived:false}];
  document.work=[{id:workId,clientId,client:'Cliente notas de crédito',service:'Remodelación de terraza',stage:'scheduled',start:day+'T09:00:00-06:00',end:day+'T10:00:00-06:00',cancelled:false}];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(page.context(),owner);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await page.request.get(endpoint,{timeout:45000})).status()).toBe(200);
  expect((await page.request.get('/api/pro/client-operations?'+new URLSearchParams({workId,clientId}),{timeout:45000})).status()).toBe(200);
  await ledger(db,owner.id,{workId,clientId,kind:'agreement',amountCents:1000000});await ledger(db,owner.id,{workId,clientId,kind:'payment',amountCents:300000,note:'Abono inicial'});
  const source=await db.rpc('pro_invoice_source',{p_user:owner.id,p_kind:'work',p_id:workId});expect(source.error).toBeNull();
  const saved=await db.rpc('pro_invoice_draft_save',{p_user:owner.id,p_input:{action:'create',kind:'work',sourceId:workId,clientId,title:'Factura interna terraza',notes:'',receiver:{name:'Cliente notas de crédito',identification:'',email:'',phone:'',address:''},fingerprint:(source.data as {fingerprint:string}).fingerprint}});expect(saved.error).toBeNull();const draftId=saved.data as string;
  const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  const credit=async(data:Record<string,unknown>)=>{const r=await page.request.post('/api/pro/credits-retainers',{headers,data});expect(r.status(),JSON.stringify(data)).toBe(200);return (await r.json()).credit as {id:string;revision:number};};
  const statement=async()=>{const r=await page.request.get('/api/pro/client-statement?'+new URLSearchParams({clientId}),{timeout:60000});expect(r.status()).toBe(200);return await r.json() as ClientStatementPage;};
  const overview=async(query:Record<string,string>={})=>{const r=await page.request.get('/api/pro/payment-overview?'+new URLSearchParams(query),{timeout:60000});expect(r.status()).toBe(200);return await r.json() as PaymentOverviewPage;};
  const before=await statement();expect(before.summary).toMatchObject({agreedCents:1000000,paidCents:300000,balanceCents:700000,creditNotesCents:0,creditNoteCount:0});
  const moneyBefore=await overview();expect(moneyBefore.summary).toMatchObject({receivedCents:300000,creditNotesCents:0,creditNoteCount:0});
  let note=await credit({action:'create_credit_note',actionId:crypto.randomUUID(),workId,id:crypto.randomUUID(),title:'Descuento por atraso',amountCents:200000,reason:'Entrega tardía acordada',note:null});
  const applicationId=crypto.randomUUID();note=await credit({action:'apply',actionId:applicationId,workId,id:note.id,revision:note.revision,draftId,amountCents:150000});
  // The statement subtracts the applied note and shows it as its own line; received money does not change.
  const withNote=await statement();expect(withNote.summary).toMatchObject({agreedCents:1000000,paidCents:300000,balanceCents:550000,creditCents:0,creditNotesCents:150000,creditNoteCount:1});
  expect(withNote.items[0]).toMatchObject({id:applicationId,kind:'credit_note',amountCents:150000,balanceDeltaCents:-150000,label:'Descuento por atraso',workId,reversed:false,creditNote:{creditId:note.id,code:'NC-0001',reason:'Entrega tardía acordada',draftId,draftTitle:'Factura interna terraza'}});
  const withNoteOverview=await overview();expect(withNoteOverview.summary).toEqual({...moneyBefore.summary,creditNotesCents:150000,creditNoteCount:1});
  expect((await overview({q:'NC-0001'})).summary).toMatchObject({creditNotesCents:150000,count:0});expect((await overview({from:'2020-01-01',through:'2020-01-02'})).summary.creditNotesCents).toBe(0);
  expect((await page.request.get('/api/pro/payment-overview?'+new URLSearchParams({from:'2026-02-02',through:'2026-02-01'}))).status()).toBe(400);

  // UI: the statement lists the note and its total.
  await gotoOK(page,`/${language}/dashboard/profesional?`+new URLSearchParams({tab:'pro_clients',cliente:clientId,estadoCuenta:'1'}));
  const modal=page.getByRole('dialog',{name:en?'Account statement':'Estado de cuenta',exact:true});await expect(modal).toBeVisible({timeout:60000});
  const total=modal.locator('[data-statement-credit-notes]');await expect(total).toContainText(en?'Applied credit notes':'Notas de crédito aplicadas');await expect(total).toContainText(money(150000,en));
  await expect(modal.locator('dl')).toContainText(money(550000,en));await expect(modal).toContainText(en?'“Outstanding” already deducts applied credit notes.':'«Por cobrar» ya descuenta las notas de crédito aplicadas.');
  const line=modal.locator('article').filter({has:page.locator('[data-statement-credit-note="NC-0001"]')});await expect(line).toHaveCount(1);
  await expect(line.getByRole('heading',{level:4})).toHaveText(en?'Credit note applied':'Nota de crédito aplicada');await expect(line).toContainText(money(150000,en));await expect(line).toContainText((en?'Draft: ':'Borrador: ')+'Factura interna terraza');await expect(line).toContainText((en?'Reason: ':'Motivo: ')+'Entrega tardía acordada');await expect(line).toContainText((en?'Balance change when recorded: ':'Cambio en el saldo al registrarse: ')+money(-150000,en));
  for(const button of await line.getByRole('button').all())expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expectNoHorizontalOverflow(page);await line.scrollIntoViewIfNeeded();await page.screenshot({path:shot('statement-credit-note')});

  // UI: the payment overview keeps the note apart from received money.
  await gotoOK(page,`/${language}/dashboard/profesional?tab=pro_payments`);
  const totals=page.locator('details').filter({has:page.getByText(en?'View totals':'Ver totales',{exact:true})}).first();await expect(totals).toBeVisible({timeout:60000});
  await totals.locator(':scope > summary').click();const notesLine=totals.locator('[data-overview-credit-notes]');await expect(notesLine).toContainText(money(150000,en));await expect(notesLine).toContainText(en?'they are not money received':'no son dinero recibido');
  await expectNoHorizontalOverflow(page);await notesLine.scrollIntoViewIfNeeded();await page.screenshot({path:shot('overview-credit-notes')});

  // Reversal: the original line is kept (reversed) and a reversal line restores the balance.
  await credit({action:'unapply',actionId:crypto.randomUUID(),workId,id:note.id,revision:note.revision,applicationId,reason:'Aplicada por error'});
  const reverted=await statement();expect(reverted.summary).toMatchObject({balanceCents:700000,creditNotesCents:0,creditNoteCount:0});
  const pair=reverted.items.filter(item=>item.kind==='credit_note'||item.kind==='credit_note_reversal');expect(pair.map(item=>[item.kind,item.balanceDeltaCents,item.reversed])).toEqual([['credit_note_reversal',150000,false],['credit_note',-150000,true]]);
  expect((await overview()).summary).toEqual(moneyBefore.summary);
  await gotoOK(page,`/${language}/dashboard/profesional?`+new URLSearchParams({tab:'pro_clients',cliente:clientId,estadoCuenta:'1'}));await expect(modal).toBeVisible({timeout:60000});
  await expect(modal.locator('[data-statement-credit-notes]')).toHaveCount(0);await expect(modal.getByRole('heading',{level:4,name:en?'Credit note reversed':'Nota de crédito revertida'})).toBeVisible();await expect(modal).toContainText(en?'Application reversed; retained in history':'Aplicación revertida; se conserva en el historial');await expect(modal).toContainText((en?'Reversal reason: ':'Motivo de la reversión: ')+'Aplicada por error');
  await expectNoHorizontalOverflow(page);await page.screenshot({path:shot('statement-credit-note-reversed'),fullPage:true});
  expect((await db.from('notifications').select('id').eq('user_id',owner.id).throwOnError()).data).toEqual([]);
  expect(errors()).toEqual([]);
 }finally{await page.goto('about:blank').catch(()=>{});await cleanupDisposableAccount(owner);}
});
