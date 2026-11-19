import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';

// Row 40: contratos por proyecto (templates, clause library, merge fields, immutable shared version
// and the linked customer's authenticated acceptance — NOT a certified e-signature, row 41 stays E).
// Local types on purpose: this spec must type-check before phase 2 copies src/lib/pro/contracts.ts.
type Clause={id:string;title:string;body:string;sourceClauseId:string|null};
type Response_={action:'accept'|'decline';typedName:string|null;reason:string|null;contentHash:string;at:string;atCostaRica:string};
type Contract={id:string;workId:string;number:number;code:string;title:string;language:'es'|'en';estimateId:string|null;depositPercent:number|null;status:'draft'|'shared'|'accepted'|'declined'|'voided';latestVersion:number|null;clauseCount:number;response:Response_|null;revision:number;clauses?:Clause[]};
type Version={id:string;version:number;contentHash:string;content:{code:string;title:string;clauses:Array<{position:number;title:string;body:string}>;estimate:{code:string;totalCents:number}|null};response:Response_|null};
type Detail={contract:Contract&{clauses:Clause[]};preview:{title:string;clauses:Array<{id:string;title:string;body:string}>;fields:Record<string,string|null>;usedFields:string[];missingFields:string[]};versions:Version[];history:Array<{action:string;byCustomer:boolean}>};
type List={workId:string;items:Contract[];estimates:Array<{id:string;code:string;status:string;totalCents:number}>;templates:Array<{id:string;title:string;clauseCount:number}>;clientVisible:boolean;recipientName:string|null};
type ClientView={visible:false}|{visible:true;contracts:Array<{id:string;code:string;status:string;canRespond:boolean;version:number;contentHash:string;content:Version['content'];response:Response_|null}>};
const origin='http://127.0.0.1:3185',api='/api/pro/contracts';
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}
const uuid=()=>crypto.randomUUID();

async function makePro(db:ReturnType<typeof regressionAdminClient>,account:DisposableAccount,slug:string){
 const user=await db.auth.admin.getUserById(account.id);expect((await db.auth.admin.updateUserById(account.id,{user_metadata:{...user.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
 await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',account.id).throwOnError();await db.from('pro_memberships').insert({user_id:account.id,status:'active'}).throwOnError();
 return (await db.from('professionals').insert({profile_id:account.id,category_id:'desarrollo_web',business_name:'Contratos local',slug:slug+'-'+account.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).select('id').single().throwOnError()).data!;
}

async function fixture(context:BrowserContext){
 const owner=await createDisposableAccount({prefix:'ctr-owner'}),db=regressionAdminClient();let client:DisposableAccount|undefined,rival:DisposableAccount|undefined,stranger:DisposableAccount|undefined;
 try{
  client=await createDisposableAccount({prefix:'ctr-client'});rival=await createDisposableAccount({prefix:'ctr-rival'});stranger=await createDisposableAccount({prefix:'ctr-stranger'});
  const professional=await makePro(db,owner,'ctr');await makePro(db,rival,'ctr-rival');
  const workId=uuid(),uiWorkId=uuid(),requestId=uuid(),uiRequestId=uuid(),day=crTodayISO(),linkedClient='reservation-'+client.id,document=emptyBusiness();
  document.clients=[{id:linkedClient,name:'Cliente contratos local',email:'',phone:'',notes:'',archived:false}];
  document.work=[
   {id:workId,clientId:linkedClient,client:'Cliente contratos local',service:'Remodelación de cocina',stage:'scheduled',start:day+'T11:00:00-06:00',end:day+'T12:00:00-06:00',cancelled:false,bookingClientId:client.id},
   {id:uiWorkId,clientId:linkedClient,client:'Cliente contratos local',service:'Baño principal',stage:'scheduled',start:day+'T14:00:00-06:00',end:day+'T15:00:00-06:00',cancelled:false,bookingClientId:client.id},
  ];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(context,owner);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  for(const id of [workId,uiWorkId])expect((await context.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({workId:id,clientId:linkedClient}),{timeout:45000})).status()).toBe(200);
  for(const [id,work,service,start] of [[requestId,workId,'Remodelación de cocina','T11:00:00-06:00'],[uiRequestId,uiWorkId,'Baño principal','T14:00:00-06:00']] as const){
   await db.from('pro_appointment_requests').insert({id,professional_id:professional.id,owner_id:owner.id,client_user_id:client.id,client_name:'Cliente contratos local',professional_name:'Contratos local',professional_slug:'ctr-'+owner.id,service,duration_minutes:60,location_kind:'customer',location_text:'San Pedro, Montes de Oca',note:'',requested_start:day+start,status:'confirmed',revision:0,work_id:work}).throwOnError();
   await db.from('pro_appointment_events').insert({request_id:id,actor_id:owner.id,side:'provider',action:'confirm',note:'',status:'confirmed'}).throwOnError();
  }
  // Estimates of each project (draft = never shared). Inserted directly: only title/total/currency are read.
  const estimateId=uuid(),uiEstimateId=uuid(),otherEstimateId=uuid();
  for(const [id,work,title,total] of [[estimateId,workId,'Cocina completa',113000050],[uiEstimateId,uiWorkId,'Baño completo',45000000],[otherEstimateId,uiWorkId,'Otro proyecto',100]] as const)
   await db.from('pro_private_estimates').insert({owner_id:owner.id,id,client_id:linkedClient,client_snapshot:{name:'Cliente contratos local'},source:{kind:'work',id:work},issuer:{},title,notes:'',currency:'CRC',subtotal_cents:total,discount_cents:0,tax_cents:0,total_cents:total,revision:1}).throwOnError();
  return {owner,client,rival,stranger,db,workId,uiWorkId,requestId,uiRequestId,estimateId,uiEstimateId,otherEstimateId};
 }catch(error){for(const a of [owner,client,rival,stranger])if(a)await cleanupDisposableAccount(a);throw error;}
}

for(const language of ['es','en'] as const)test(`Contracts: templates, merge fields, shared version and customer acceptance [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(480000);local(baseURL);const en=language==='en',f=await fixture(page.context()),{owner,client,rival,stranger,db,workId,uiWorkId,requestId,uiRequestId,estimateId,uiEstimateId,otherEstimateId}=f;
 let customer:BrowserContext|undefined,other:BrowserContext|undefined,strange:BrowserContext|undefined;
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const notices=async()=>{const out:Record<string,unknown>={};for(const table of ['notifications','notification_push_outbox'])out[table]=(await db.from(table).select('*').in('user_id',[owner.id,client.id]).order('id').throwOnError()).data;return out;};const noticesBefore=await notices();
  const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  const get=async<T,>(query:Record<string,string>,status=200)=>{const r=await page.request.get(api+'?'+new URLSearchParams(query),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(r.status(),JSON.stringify(query)).toBe(status);return status===200?await r.json() as T:null;};
  const post=async(data:Record<string,unknown>,status=200)=>{const r=await page.request.post(api,{headers,data});expect(r.status(),JSON.stringify(data).slice(0,300)).toBe(status);return status===200?await r.json() as {contract?:Contract&{clauses:Clause[]};version?:Version;template?:{id:string;revision:number;clauses:Clause[]};clause?:{id:string;revision:number}}:null;};
  const setSection=async(work:string,on:boolean)=>{const settings=(await (await page.request.get('/api/pro/client-dashboard?'+new URLSearchParams({workId:work}),{headers:{'X-Pro-Expected-Actor':owner.id}})).json()).settings;
   const r=await page.request.post('/api/pro/client-dashboard',{headers,data:{workId:work,actionId:uuid(),revision:settings.revision,showUpdates:true,showDailyLogs:true,showFiles:true,showContracts:on,welcomeText:null}});expect(r.status()).toBe(200);return (await r.json()).settings;};

  // ---- API: owner ----
  const initial=(await get<List>({workId}))!;
  expect(initial).toMatchObject({items:[],clientVisible:false,recipientName:'Cliente contratos local'});
  expect(initial.estimates.map(e=>e.id)).toEqual([estimateId]);// only this project's estimates
  for(const query of ['',`?workId=${workId}&workId=${workId}`,`?workId=${workId}&extra=1`,'?view=other','?view=templates&archived=1','?templateId=no-uuid',`?workId=${workId}&contractId=1`])
   expect((await page.request.get(api+query,{headers:{'X-Pro-Expected-Actor':owner.id}})).status(),query).toBe(400);
  expect((await page.request.get(api+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':client.id}})).status()).toBe(403);// account changed
  const clauseInput={action:'library_clause_create',actionId:uuid(),id:uuid(),title:en?'Scope':'Objeto',body:'{{empresa.nombre}} — {{proyecto.nombre}} ({{proyecto.direccion}}) — {{cliente.nombre}} — {{cotizacion.codigo}}: {{cotizacion.total}}'};
  expect((await page.request.post(api,{headers:{'X-Pro-Expected-Actor':owner.id},data:clauseInput})).status()).toBe(403);// no same-origin header
  await post({...clauseInput,extra:1},400);await post({...clauseInput,title:'  '},400);await post({...clauseInput,body:'{{cliente.celular}}'},400);// unknown field (Ronda F2-B: cliente.telefono is a real field now)
  const big=await page.request.post(api,{headers,data:{...clauseInput,body:'x'.repeat(17000)}});expect(big.status()).toBe(413);
  const clause=(await post(clauseInput))!;expect(clause.clause).toMatchObject({revision:1});
  expect(await post(clauseInput)).toEqual(clause);// idempotent replay
  await post({...clauseInput,title:'Otro'},400);// same action id, other payload
  await post({...clauseInput,actionId:uuid()},409);// same clause id
  const depositClause=(await post({action:'library_clause_create',actionId:uuid(),id:uuid(),title:en?'Deposit':'Anticipo',body:'{{anticipo.porcentaje}} = {{anticipo.monto}} · {{empresa.identificacion}} · {{fecha.hoy}}'}))!;
  const templateId=uuid();
  const template=(await post({action:'template_create',actionId:uuid(),id:templateId,title:en?'Remodeling':'Remodelación',description:null,depositPercent:30,libraryClauseIds:[clause.clause!.id,depositClause.clause!.id]}))!.template!;
  expect(template.clauses.map(c=>c.sourceClauseId)).toEqual([clause.clause!.id,depositClause.clause!.id]);
  await post({action:'template_update',actionId:uuid(),id:templateId,revision:template.revision,title:'R',description:null,depositPercent:100.5},400);
  // Contracts: numbering per account without gaps, estimate of THIS project only.
  const create=(id:string,extra:Record<string,unknown>={})=>({action:'contract_create',actionId:uuid(),workId,id,templateId,title:null,language,estimateId,depositPercent:null,...extra});
  await post(create(uuid(),{estimateId:otherEstimateId}),400);// estimate of another project
  const contractId=uuid();let contract=(await post(create(contractId)))!.contract!;
  expect(contract).toMatchObject({code:'CTR-0001',status:'draft',title:en?'Remodeling':'Remodelación',depositPercent:30,clauseCount:2,latestVersion:null});
  expect(contract.clauses.map(c=>c.id)).not.toContain(template.clauses[0].id);// fresh clause ids
  const second=(await post(create(uuid(),{templateId:null,title:en?'Blank agreement':'Contrato en blanco',estimateId:null})))!.contract!;expect(second).toMatchObject({code:'CTR-0002',clauseCount:0});
  // Preview: resolved fields and the list of used fields without data.
  let detail=(await get<Detail>({workId,contractId}))!;
  expect(detail.preview.missingFields).toEqual(['empresa.identificacion']);
  expect(detail.preview.clauses[0].body).toContain('Remodelación de cocina (San Pedro, Montes de Oca) — Cliente contratos local');
  expect(detail.preview.clauses[0].body).toContain('₡1.130.000,50');
  expect(detail.preview.clauses[1].body).toContain(en?'30% = ₡339.000,15':'30 % = ₡339.000,15');
  await post({action:'share',actionId:uuid(),id:contractId,revision:contract.revision},400);// field without data
  await db.from('pro_invoice_issuer_settings').upsert({user_id:owner.id,issuer_name:'Construcciones Local S.A.',issuer_id_type:'company',issuer_id:'3-101-123456',issuer_email:'',issuer_phone:'',issuer_address:'',issuer_activity:''}).throwOnError();
  detail=(await get<Detail>({workId,contractId}))!;expect(detail.preview.missingFields).toEqual([]);expect(detail.preview.fields['empresa.nombre']).toBe('Construcciones Local S.A.');
  await post({action:'contract_update',actionId:uuid(),id:contractId,revision:contract.revision+5,title:'X',language,estimateId,depositPercent:30},409);// stale revision
  contract=(await post({action:'clause_put',actionId:uuid(),scope:'contract',id:contractId,revision:contract.revision,clauseId:uuid(),position:1,title:en?'Parties':'Partes',body:'{{contrato.codigo}}'}))!.contract!;
  expect(contract.clauses[0].title).toBe(en?'Parties':'Partes');
  // Isolation: the rival Pro account and the customer cannot read or write the owner's contract.
  other=await browser.newContext({baseURL});await login(other,rival);
  expect((await other.request.get(api+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).toBe(404);
  expect((await other.request.get(api+'?'+new URLSearchParams({workId,contractId}),{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).toBe(404);
  expect((await other.request.post(api,{headers:{Origin:origin,'X-Pro-Expected-Actor':rival.id},data:{action:'void',actionId:uuid(),id:contractId,revision:contract.revision,reason:'x'}})).status()).toBe(404);
  const rivalFirst=await other.request.post(api,{headers:{Origin:origin,'X-Pro-Expected-Actor':rival.id},data:{action:'library_clause_create',actionId:uuid(),id:uuid(),title:'Rival',body:'x'}});expect(rivalFirst.status()).toBe(200);
  // Share: immutable version with resolved text and hash; drafts only.
  const shared=(await post({action:'share',actionId:uuid(),id:contractId,revision:contract.revision}))!;
  expect(shared.contract).toMatchObject({status:'shared',latestVersion:1});expect(shared.version!.contentHash).toMatch(/^[a-f0-9]{64}$/);
  expect(shared.version!.content.clauses[0].body).toBe('CTR-0001');expect(shared.version!.content.estimate).toMatchObject({totalCents:113000050});
  await post({action:'clause_remove',actionId:uuid(),scope:'contract',id:contractId,revision:shared.contract!.revision,clauseId:contract.clauses[0].id},400);// not a draft
  await db.from('pro_private_estimates').update({total_cents:1}).eq('owner_id',owner.id).eq('id',estimateId).throwOnError();
  detail=(await get<Detail>({workId,contractId}))!;expect(detail.versions[0].content.estimate!.totalCents).toBe(113000050);// frozen

  // ---- API: customer ----
  customer=await browser.newContext({baseURL});await login(customer,client);
  const cHeaders={Origin:origin,'X-Pro-Expected-Actor':client.id};
  const clientRead=async(id=requestId)=>{const r=await customer!.request.get(api+'?'+new URLSearchParams({requestId:id}),{headers:{'X-Pro-Expected-Actor':client.id}});expect(r.status()).toBe(200);return await r.json() as ClientView;};
  expect(await clientRead()).toEqual({visible:false});// section off by default
  const answer={action:'accept',actionId:uuid(),requestId,contractId,version:1,contentHash:shared.version!.contentHash,typedName:'  Cliente Contratos  '};
  expect((await customer.request.post(api,{headers:cHeaders,data:answer})).status()).toBe(403);// hidden section
  expect((await setSection(workId,true)).showContracts).toBe(true);
  const view=await clientRead();if(!view.visible)throw Error('hidden');expect(view.contracts).toHaveLength(1);expect(view.contracts[0]).toMatchObject({code:'CTR-0001',canRespond:true,version:1});
  expect(JSON.stringify(view)).not.toContain('{{');
  strange=await browser.newContext({baseURL});await login(strange,stranger);
  expect((await strange.request.get(api+'?'+new URLSearchParams({requestId}),{headers:{'X-Pro-Expected-Actor':stranger.id}})).status()).toBe(404);
  expect((await strange.request.post(api,{headers:{Origin:origin,'X-Pro-Expected-Actor':stranger.id},data:{...answer,actionId:uuid()}})).status()).toBe(403);
  const cPost=async(data:Record<string,unknown>,status=200)=>{const r=await customer!.request.post(api,{headers:cHeaders,data});expect(r.status(),JSON.stringify(data)).toBe(status);return status===200?await r.json():null;};
  await cPost({...answer,actionId:uuid(),contentHash:'0'.repeat(64)},409);// another text
  await cPost({...answer,actionId:uuid(),typedName:' M '},400);await cPost({...answer,actionId:uuid(),extra:1},400);
  const accepted=await cPost(answer);expect(accepted.contract).toMatchObject({status:'accepted',canRespond:false,response:{action:'accept',typedName:'Cliente Contratos'}});
  expect(accepted.contract.response.atCostaRica).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  expect(await cPost(answer)).toEqual(accepted);// replay
  await cPost({...answer,actionId:uuid()},409);// already answered
  detail=(await get<Detail>({workId,contractId}))!;expect(detail.contract.status).toBe('accepted');expect(detail.history.filter(h=>h.byCustomer).map(h=>h.action)).toEqual(['accept']);
  await post({action:'withdraw',actionId:uuid(),id:contractId,revision:detail.contract.revision},400);
  const voided=(await post({action:'void',actionId:uuid(),id:contractId,revision:detail.contract.revision,reason:en?'Replaced':'Reemplazado'}))!.contract!;expect(voided.status).toBe('voided');
  const after=await clientRead();if(!after.visible)throw Error('hidden');expect(after.contracts[0]).toMatchObject({status:'voided',response:{action:'accept'}});
  // Printable copy (owner and customer), never for others.
  const print=await page.request.get('/api/pro/contract-print?'+new URLSearchParams({workId,id:contractId,lang:language}));expect(print.status()).toBe(200);
  expect(print.headers()['content-type']).toContain('text/html');const html=await print.text();expect(html).toContain('CTR-0001');expect(html).toContain(shared.version!.contentHash);
  expect((await customer.request.get('/api/pro/contract-print?'+new URLSearchParams({requestId,id:contractId}))).status()).toBe(200);
  expect((await other.request.get('/api/pro/contract-print?'+new URLSearchParams({workId,id:contractId}))).status()).toBe(404);

  // ---- Owner UI ----
  const mobile=(page.viewportSize()?.width??1366)<1024,suffix=`${language}${mobile?'-mobile':''}`;
  let failFirst=true;
  await page.route('**/api/pro/contracts?**',async route=>{const url=new URL(route.request().url());if(failFirst&&route.request().method()==='GET'&&url.searchParams.has('workId')&&!url.searchParams.has('contractId')){failFirst=false;return route.fulfill({status:503,json:{error:'LOCAL failure'}});}return route.continue();});
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:uiWorkId,vistaTrabajo:'contracts'}));
  const nav=page.getByRole('navigation',{name:en?'Job workspace':'Gestión del trabajo'});await expect(nav).toBeVisible({timeout:60000});
  const planning=nav.locator('[data-job-workspace-group]').nth(1);await expect(planning).toHaveAttribute('data-job-workspace-group',en?'Planning':'Planificación');
  await expect(planning.getByRole('button',{name:en?'Contracts':'Contratos',exact:true})).toHaveAttribute('aria-current','page');
  const loadError=page.locator('[data-contracts-load-error]');await expect(loadError).toBeVisible({timeout:60000});await loadError.getByRole('button',{name:en?'Retry':'Reintentar'}).click();
  const section=page.locator('[data-work-contracts]');await expect(section.locator('[data-contracts-empty]')).toBeVisible();
  await expect(section.locator('[data-contracts-legal]')).toContainText(en?/not a certified digital signature/i:/no es una firma digital certificada/i);
  await expect(section.locator('[data-contracts-client-visibility]')).toContainText(en?'turn on the Contracts section':'active la sección Contratos');
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`contracts-empty-${suffix}.png`),fullPage:true});
  const overview=nav.getByRole('button',{name:en?'Overview':'Resumen',exact:true});
  await section.getByRole('button',{name:en?'New contract':'Nuevo contrato'}).click();await expect(overview).toBeEnabled();// untouched form is not dirty
  const form=section.locator('[data-contract-create]');await form.locator('[data-contract-field="template"]').selectOption({label:`${en?'Remodeling':'Remodelación'} (${en?'2 clauses':'2 cláusulas'})`});
  await expect(overview).toBeDisabled();// dirty form blocks the job menu
  await expect(form.locator('[data-contract-field="deposit"]')).toHaveValue('30');
  await form.locator('[data-contract-field="estimate"]').selectOption(uiEstimateId);
  await form.getByRole('button',{name:en?'Create contract':'Crear contrato'}).click();
  const editor=page.locator('[data-contract-editor="CTR-0003"]');await expect(editor).toBeVisible({timeout:60000});await expect(overview).toBeEnabled();
  await expect(editor.locator('[data-contract-clause]')).toHaveCount(2);
  // Edit a clause and insert a merge field.
  await editor.locator('[data-contract-clause="2"]').getByRole('button',{name:en?'Edit':'Editar',exact:true}).click();
  const clauseForm=editor.locator('[data-contract-clause-form]');await clauseForm.locator('[data-contract-field="clause-body"]').fill(en?'Payment on delivery. ':'Pago contra entrega. ');
  await expect(overview).toBeDisabled();
  await clauseForm.locator('[data-contract-field="insert-field"]').selectOption('cliente.nombre');
  await expect(clauseForm.locator('[data-contract-field="clause-body"]')).toHaveValue(en?'Payment on delivery. {{cliente.nombre}}':'Pago contra entrega. {{cliente.nombre}}');
  // Round 2: a field goes where the cursor is, not at the end.
  const body=clauseForm.locator('[data-contract-field="clause-body"]'),cut=(en?'Payment ':'Pago ').length;
  // Round 7B: WebKit may move the caret to the end after focus() on its next frame; place it again once focus settled.
  await body.evaluate(async(node,at)=>{const area=node as HTMLTextAreaElement;area.focus();await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,50)));area.setSelectionRange(at,at);},cut);await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowLeft');// the caret, as a user leaves it
  await clauseForm.locator('[data-contract-field="insert-field"]').selectOption('proyecto.nombre');
  await expect(body).toHaveValue(en?'Payment {{proyecto.nombre}}on delivery. {{cliente.nombre}}':'Pago {{proyecto.nombre}}contra entrega. {{cliente.nombre}}');
  await body.fill(en?'Payment on delivery. {{cliente.nombre}}':'Pago contra entrega. {{cliente.nombre}}');
  await clauseForm.getByRole('button',{name:en?'Save clause':'Guardar cláusula'}).click();await expect(clauseForm).toHaveCount(0);await expect(overview).toBeEnabled();
  // Add a blank clause with an unknown field: blocked in the browser.
  await editor.getByRole('button',{name:en?'Add clause':'Agregar cláusula'}).click();const newClause=editor.locator('[data-contract-clause-form]');
  await newClause.locator('[data-contract-field="clause-title"]').fill(en?'Warranty':'Garantía');await newClause.locator('[data-contract-field="clause-body"]').fill('{{cliente.celular}}');// Ronda F2-B: cliente.telefono is now a real field
  await newClause.getByRole('button',{name:en?'Save clause':'Guardar cláusula'}).click();await expect(newClause.getByRole('alert')).toContainText('cliente.celular');
  await newClause.locator('[data-contract-field="clause-body"]').fill(en?'Twelve months on workmanship for {{proyecto.nombre}}.':'Doce meses sobre la mano de obra de {{proyecto.nombre}}.');
  await newClause.getByRole('button',{name:en?'Save clause':'Guardar cláusula'}).click();await expect(editor.locator('[data-contract-clause]')).toHaveCount(3);
  await editor.locator('[data-contract-clause="3"]').getByRole('button',{name:new RegExp(en?'^Move up':'^Subir')}).click();
  await expect(editor.locator('[data-contract-clause="2"]')).toContainText(en?'Warranty':'Garantía');
  await editor.getByRole('button',{name:en?'Preview with data':'Vista previa con datos'}).click();
  await expect(editor.locator('[data-contract-preview]')).toContainText('Baño principal');await expect(editor.locator('[data-contract-preview]')).toContainText('₡450.000');
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`contracts-editor-${suffix}.png`),fullPage:true});
  // Reload keeps everything.
  await page.reload();const card=page.locator('[data-contract-card="CTR-0003"]');await expect(card).toBeVisible({timeout:60000});
  await card.getByRole('button',{name:en?'Open':'Abrir',exact:true}).click();await expect(editor.locator('[data-contract-clause]')).toHaveCount(3,{timeout:60000});
  await expect(editor.locator('[data-contract-clause="3"]')).toContainText('{{cliente.nombre}}');
  // Share (the dialog states it is not a certified signature).
  await editor.locator('[data-contract-share]').click();const dialog=page.getByRole('dialog').last();await expect(dialog).toContainText(en?/not a certified digital signature/i:/no es una firma digital certificada/i);
  await dialog.getByRole('button',{name:en?'Share with customer':'Compartir con el cliente'}).click();
  await expect(editor.locator('[data-contract-status="shared"]')).toBeVisible();await expect(editor.locator('[data-contract-versions]')).toContainText(en?'Version 1':'Versión 1');
  await expect(editor.locator('[data-contract-clauses]')).toHaveCount(0);// read-only once shared
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`contracts-shared-${suffix}.png`),fullPage:true});
  // Turn the section on in the customer view editor.
  await nav.getByRole('button',{name:en?'Customer view':'Vista del cliente',exact:true}).click();
  const dashboard=page.locator('[data-client-dashboard-editor]');await expect(dashboard).toBeVisible({timeout:60000});
  const toggle=dashboard.locator('[data-client-dashboard-section="showContracts"]');await expect(toggle).not.toBeChecked();await toggle.check();
  await dashboard.getByRole('button',{name:en?'Save customer view':'Guardar vista del cliente'}).click();
  await expect(dashboard.getByRole('status').filter({hasText:en?'Customer view saved.':'Vista del cliente guardada.'})).toBeVisible();

  // ---- Customer UI ----
  const customerPage=await customer.newPage();onAppPageError(customerPage,message=>runtime.push(message));
  await gotoOK(customerPage,`/${language}/dashboard/profesional?tab=appointments&citaSolicitud=${uiRequestId}`);
  const clientSection=customerPage.locator('[data-client-contracts]');await expect(clientSection).toBeVisible({timeout:60000});
  await expect(clientSection.locator('[data-client-contracts-legal]')).toContainText(en?/not a certified digital signature/i:/no es una firma digital certificada/i);
  const item=clientSection.locator('[data-client-contract="CTR-0003"]');await expect(item.locator('[data-client-contract-text]')).toContainText('Cliente contratos local');
  await item.getByRole('button',{name:en?'Accept contract':'Aceptar contrato'}).click();await expect(item.getByRole('alert')).toContainText(en?'Type your full name':'Escriba su nombre completo');
  await item.locator('[data-client-contract-field="name"]').fill('Cliente Contratos');await item.getByRole('button',{name:en?'Accept contract':'Aceptar contrato'}).click();
  await expect(item.getByRole('alert')).toContainText(en?'Confirm that you read':'Confirme que leyó');
  await item.locator('[data-client-contract-field="read"]').check();
  await expectNoHorizontalOverflow(customerPage);await customerPage.screenshot({path:info.outputPath(`customer-contract-${suffix}.png`),fullPage:true});
  await item.getByRole('button',{name:en?'Accept contract':'Aceptar contrato'}).click();
  await expect(item.locator('[data-client-contract-response]')).toContainText(en?'You accepted it as Cliente Contratos':'Usted lo aceptó como Cliente Contratos');
  await expect(item.locator('[data-client-contract-status="accepted"]')).toBeVisible();
  await customerPage.reload();await expect(customerPage.locator('[data-client-contract="CTR-0003"] [data-client-contract-status="accepted"]')).toBeVisible({timeout:60000});
  await expectNoHorizontalOverflow(customerPage);await customerPage.screenshot({path:info.outputPath(`customer-contract-accepted-${suffix}.png`),fullPage:true});
  // Owner sees the acceptance.
  // The owner left the job on Customer view; reload keeps that view, so go back to Contracts.
  await page.reload();await nav.getByRole('button',{name:en?'Contracts':'Contratos',exact:true}).click();await page.locator('[data-contract-card="CTR-0003"]').getByRole('button',{name:en?'Open':'Abrir',exact:true}).click();
  await expect(page.locator('[data-contract-response]')).toContainText(en?'Accepted by Cliente Contratos':'Aceptado por Cliente Contratos',{timeout:60000});

  // ---- Company › Templates ----
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_company',empresa:'plantillas'}));
  const hub=page.locator('[data-contract-templates]');await expect(hub).toBeVisible({timeout:60000});
  await expect(hub.locator(`[data-contract-template-row="${en?'Remodeling':'Remodelación'}"]`)).toBeVisible();
  await hub.locator('[data-contract-templates-tab="library"]').click();await expect(hub.locator('[data-contract-library-row]')).toHaveCount(2);
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`company-contract-templates-${suffix}.png`),fullPage:true});

  expect(await notices()).toEqual(noticesBefore);
  expect(runtime).toEqual([]);
 }finally{await customer?.close();await other?.close();await strange?.close();for(const a of [f.owner,f.client,f.rival,f.stranger])await cleanupDisposableAccount(a);}
});
