import {test,expect,type BrowserContext,type Browser,type Page} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
const origin='http://127.0.0.1:3185',leadApi='/api/pro/lead-center',formApi='/api/pro/contact-form',publicApi='/api/pro/contact-form-public';

function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}
async function makePro(prefix:string){const db=regressionAdminClient(),owner=await createDisposableAccount({prefix});try{const account=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();return owner;}catch(error){await cleanupDisposableAccount(owner);throw error;}}
async function warm(context:BrowserContext){for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);}
async function fixture(context:BrowserContext){
 await stabilizeLocalProRuntime(context,origin);
 const db=regressionAdminClient(),owner=await makePro('inbox-owner');let client:DisposableAccount|undefined;
 try{
  client=await createDisposableAccount({prefix:'inbox-client'});
  const professional=(await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Bandejas local',slug:'inbox-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).select('id').single().throwOnError()).data!;
  const workId=crypto.randomUUID(),requestId=crypto.randomUUID(),day=crTodayISO(),linked='reservation-'+client.id,document=emptyBusiness();
  document.clients=[{id:'cli-ana',name:'Ana Local',email:'ana@example.test',phone:'8888-1111',notes:'',archived:false},{id:'cli-beto',name:'Beto Local',email:'beto@example.test',phone:'',address:'Avenida 2, San Jose',notes:'',archived:false},{id:linked,name:'Cliente vinculado',email:'',phone:'',notes:'',archived:false}];
  document.work=[{id:workId,clientId:linked,client:'Cliente vinculado',service:'Electricidad',stage:'scheduled',start:day+'T11:00:00-06:00',end:day+'T12:00:00-06:00',cancelled:false,bookingClientId:client.id}];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(context,owner);await warm(context);
  expect((await context.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({workId,clientId:linked}),{timeout:45000})).status()).toBe(200);
  await db.from('pro_appointment_requests').insert({id:requestId,professional_id:professional.id,owner_id:owner.id,client_user_id:client.id,client_name:'Cliente vinculado',professional_name:'Bandejas local',professional_slug:'inbox-'+owner.id,service:'Electricidad',duration_minutes:60,location_kind:'agree',location_text:'',note:'',requested_start:day+'T11:00:00-06:00',status:'confirmed',revision:0,work_id:workId}).throwOnError();
  await db.from('pro_appointment_events').insert({request_id:requestId,actor_id:owner.id,side:'provider',action:'confirm',note:'',status:'confirmed'}).throwOnError();
  const manual=async(clientId:string,title:string,projectType:string)=>{const input={action:'create',actionId:crypto.randomUUID(),kind:'manual',id:crypto.randomUUID(),revision:0,catalogRevision:0,clientId,title,description:'',address:'',sourceLabel:'',forecast:{projectType,expectedStart:null,currency:'CRC',revenueCents:null,budgetCents:null,profitCents:null},stageMode:'automatic',stageId:null},response=await context.request.post(origin+leadApi,{headers:{Origin:origin,'X-Pro-Expected-Actor':owner.id},data:input});expect(response.status()).toBe(200);return input.id;};
  const paint=await manual('cli-ana','Pintura de casa','Pintura'),roof=await manual('cli-beto','Techos','');
  return {owner,client,professional,db,workId,requestId,paint,roof,day};
 }catch(error){await cleanupDisposableAccount(owner);if(client)await cleanupDisposableAccount(client);throw error;}
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
async function cleanup(f:Fixture){await cleanupDisposableAccount(f.owner);await cleanupDisposableAccount(f.client);}
async function openLeads(page:Page,language:'es'|'en'){await gotoOK(page,`/${language}/dashboard/pro?tab=pro_leads`);await expect(page.locator('[data-lead-inbox-layout]')).toBeVisible({timeout:45000});}


// Leads area: contact form builder. Owner API (draft, publish, revisions), public page and API (validation, honeypot, idempotent submissions),
// lead creation with the Website channel and the answers shown in the lead, and the builder journey ES/EN.
const ns=()=>({'x-ccr-rate-limit-namespace':'cf-'+crypto.randomUUID().slice(0,16)});
const owner=(c:BrowserContext,actor:string)=>({get:()=>c.request.get(origin+formApi,{headers:{'X-Pro-Expected-Actor':actor}}),post:(data:unknown)=>c.request.post(origin+formApi,{headers:{Origin:origin,'X-Pro-Expected-Actor':actor},data})});
const baseConfig=(question?:Record<string,unknown>)=>({labels:{name:'Nombre',email:'Correo electrónico',phone:'Teléfono',zip:'Código postal',address:'Dirección',message:'Mensaje'},zip:{show:true,required:false},address:{show:true,required:true},questions:question?[question]:[],order:['name','email','phone','zip','address','message',...(question?[question.id as string]:[])],confirmation:'Gracias, le respondemos pronto.'});

test('contact form API: draft, publish, public validation, honeypot, idempotent submission, lead with answers, unpublish and isolation',async({page,baseURL,browser}:{page:Page;baseURL:string|undefined;browser:Browser})=>{
 test.setTimeout(240000);local(baseURL);const f=await fixture(page.context()),c=page.context(),anon=await browser.newContext(),api=owner(c,f.owner.id);
 const pub=(data:unknown)=>anon.request.post(origin+publicApi,{headers:{Origin:origin,...ns()},data});
 try{
  expect(await (await api.get()).json()).toEqual({form:null});
  const qid=crypto.randomUUID(),config=baseConfig({id:qid,label:'Tipo de trabajo',type:'single',required:true,options:['Pintura','Techos']});
  expect((await api.post({action:'save',revision:0,config:{...config,order:['name']}})).status()).toBe(400);
  expect((await api.post({action:'save',revision:3,config})).status()).toBe(409);
  const saved=await api.post({action:'save',revision:0,config});expect(saved.status()).toBe(200);const form=(await saved.json()).form;expect(form).toMatchObject({status:'draft',revision:1,submissions:0});
  expect((await api.post({action:'save',revision:0,config})).status()).toBe(200);
  expect((await api.post({action:'save',revision:0,config:{...config,confirmation:'Otro texto'}})).status()).toBe(409);
  // Not published yet: the public link does not exist.
  expect((await anon.request.get(origin+publicApi+'?id='+form.publicId,{headers:ns()})).status()).toBe(404);
  expect((await anon.request.get(origin+publicApi+'?id=nope',{headers:ns()})).status()).toBe(400);
  const published=await api.post({action:'publish',revision:1});expect(published.status()).toBe(200);expect((await published.json()).form).toMatchObject({status:'published',revision:2});
  expect((await api.post({action:'publish',revision:1})).status()).toBe(200);
  const view=await anon.request.get(origin+publicApi+'?id='+form.publicId,{headers:ns()});expect(view.status()).toBe(200);expect((await view.json()).config.questions).toHaveLength(1);
  const good={name:'Ana Prueba',email:'ana.form@example.test',phone:'8888-2222',address:'Barrio Amón',message:'Necesito pintar mi casa',zip:'10101',[qid]:'Pintura'};
  const submissionId=crypto.randomUUID(),send=(extra:Record<string,unknown>={},answers:Record<string,unknown>=good)=>pub({id:form.publicId,submissionId,consent:true,website:'',answers,...extra});
  const missing=await send({},{...good,email:'no-es-correo',[qid]:'Otra'});expect(missing.status()).toBe(400);expect((await missing.json()).fields).toMatchObject({email:'email',[qid]:'choice'});
  const noAddress=await send({},{...good,address:''});expect(noAddress.status()).toBe(400);expect((await noAddress.json()).fields).toMatchObject({address:'required'});
  expect((await send({consent:false})).status()).toBe(400);
  expect((await send({extra:1})).status()).toBe(400);
  // A bot filling the hidden field is answered as a success but nothing is stored.
  expect((await send({website:'http://spam.example'})).status()).toBe(200);
  expect((await f.db.from('pro_contact_form_submissions').select('id').eq('owner_id',f.owner.id).throwOnError()).data).toHaveLength(0);
  const ok=await send();expect(ok.status()).toBe(200);expect(await ok.json()).toMatchObject({ok:true,confirmation:'Gracias, le respondemos pronto.'});
  expect((await send()).status()).toBe(200);
  const rows=(await f.db.from('pro_contact_form_submissions').select('id,lead_id').eq('owner_id',f.owner.id).throwOnError()).data!;expect(rows).toHaveLength(1);expect(rows[0].lead_id).toBeTruthy();
  const lead=(await f.db.from('pro_lead_center_records').select('kind,title,archived').eq('owner_id',f.owner.id).eq('id',rows[0].lead_id).single().throwOnError()).data!;expect(lead.title).toContain('Formulario de contacto: Ana Prueba');
  expect((await f.db.from('pro_clients').select('id').eq('user_id',f.owner.id).eq('email','ana.form@example.test').throwOnError()).data).toHaveLength(1);
  const answers=await api.get();expect((await answers.json()).form.submissions).toBe(1);
  const detail=await c.request.get(origin+formApi+'?leadId='+rows[0].lead_id,{headers:{'X-Pro-Expected-Actor':f.owner.id}});expect(detail.status()).toBe(200);
  const body=await detail.json();expect(body.answers.map((a:{label:string;value:string})=>a.label+'='+a.value)).toEqual(expect.arrayContaining(['Mensaje=Necesito pintar mi casa','Tipo de trabajo=Pintura']));
  // A second submission by the same person reuses the customer.
  const again=await pub({id:form.publicId,submissionId:crypto.randomUUID(),consent:true,website:'',answers:good});expect(again.status()).toBe(200);
  expect((await f.db.from('pro_clients').select('id').eq('user_id',f.owner.id).eq('email','ana.form@example.test').throwOnError()).data).toHaveLength(1);
  expect((await f.db.from('pro_contact_form_submissions').select('id').eq('owner_id',f.owner.id).throwOnError()).data).toHaveLength(2);
  // Offline again; another account sees no form of this company.
  expect((await api.post({action:'unpublish',revision:2})).status()).toBe(200);
  expect((await anon.request.get(origin+publicApi+'?id='+form.publicId,{headers:ns()})).status()).toBe(404);
  expect((await send()).status()).toBe(404);
  const stranger=await createDisposableAccount({prefix:'cf-stranger'});
  try{await login(anon,stranger);const other=owner(anon,stranger.id);expect(await (await other.get()).json()).toEqual({form:null});expect((await anon.request.get(origin+formApi+'?leadId='+rows[0].lead_id,{headers:{'X-Pro-Expected-Actor':stranger.id}})).status()).not.toBe(200);}finally{await cleanupDisposableAccount(stranger);}
  expect((await c.request.get(origin+formApi,{headers:{'X-Pro-Expected-Actor':crypto.randomUUID()}})).status()).toBe(403);
 }finally{await anon.close();await page.goto('about:blank').catch(()=>{});await cleanup(f);}
});

for(const language of ['es','en'] as const){
 test(`${language}: contact form builder journey, public page and the lead it creates`,async({page,baseURL,browser}:{page:Page;baseURL:string|undefined;browser:Browser})=>{
  test.setTimeout(300000);local(baseURL);const en=language==='en',f=await fixture(page.context()),errors:string[]=[],visitor=await browser.newContext();onAppPageError(page,message=>errors.push(message));
  try{
   await openLeads(page,language);
   await page.getByRole('button',{name:en?'Contact form':'Formulario de contacto',exact:true}).click();
   await page.locator('[data-contact-builder-open]').click();
   const builder=page.locator('[data-contact-builder]');await expect(builder).toBeVisible({timeout:45000});
   await expect(builder.locator('[data-contact-builder-field]')).toHaveCount(6);
   await builder.locator('[data-contact-show="address"]').check();
   await builder.locator('[data-contact-add-question]').click();
   await builder.locator('[data-contact-question-label]').fill(en?'Kind of work':'Tipo de trabajo');
   await builder.locator('[data-contact-question-type]').selectOption('single');
   await builder.locator('[data-contact-question-options]').fill('Pintura\nTechos');
   await builder.locator('[data-contact-confirmation]').fill(en?'Thanks, we will call you.':'Gracias, lo llamamos.');
   await builder.locator('[data-contact-mode="preview"]').click();
   const preview=builder.locator('[data-contact-preview]');await expect(preview).toBeVisible();await expect(preview.locator('[data-contact-field]')).toHaveCount(7);
   await builder.locator('[data-contact-mode="edit"]').click();
   await expectNoHorizontalOverflow(page);
   await page.locator('[data-contact-publish]').click();
   const share=page.locator('[data-contact-share-url]');await expect(share).toBeVisible({timeout:45000});
   const url=await share.inputValue();expect(url).toContain('/formulario-contacto/');
   // The public page, as a person with no account.
   const pub=await visitor.newPage();await pub.setExtraHTTPHeaders(ns());await gotoOK(pub,url.replace(origin,''));
   const form=pub.locator('[data-contact-form-form]');await expect(form).toBeVisible({timeout:45000});
   await form.getByRole('button',{name:en?'Submit':'Enviar'}).click();
   await expect(form.getByRole('alert').first()).toBeVisible();
   await form.locator('#cf-name').fill('Luis Visitante');await form.locator('#cf-email').fill('luis.form@example.test');await form.locator('#cf-phone').fill('8777-1234');await form.locator('#cf-address').fill('Heredia centro');await form.locator('#cf-message').fill(en?'Please repaint two rooms':'Necesito pintar dos cuartos');
   await form.getByLabel('Techos').check();await form.locator('[data-contact-consent]').check();
   await expectNoHorizontalOverflow(pub);
   await form.getByRole('button',{name:en?'Submit':'Enviar'}).click();
   await expect(pub.locator('[data-contact-form-sent]')).toContainText(en?'Thanks, we will call you.':'Gracias, lo llamamos.',{timeout:45000});
   await pub.close();
   // The lead is in the list with its answers.
   await page.reload();await expect(page.locator('[data-lead-inbox-layout]')).toBeVisible({timeout:45000});
   const card=page.locator('[data-pro-lead]').filter({hasText:'Luis Visitante'}).first();await expect(card).toBeVisible({timeout:45000});
   await card.getByRole('button',{name:en?'Open lead':'Abrir solicitud'}).first().click();
   const answers=page.locator('[data-contact-form-answers]');await expect(answers).toBeVisible({timeout:45000});await expect(answers).toContainText('Techos');await expect(answers).toContainText(en?'Please repaint two rooms':'Necesito pintar dos cuartos');
   expect(errors).toEqual([]);
  }finally{await visitor.close();await page.goto('about:blank').catch(()=>{});await cleanup(f);}
 });
}
