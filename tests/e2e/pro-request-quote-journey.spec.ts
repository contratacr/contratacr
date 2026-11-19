import {test,expect,type Browser,type BrowserContext,type APIResponse,type TestInfo,type Page,type Locator} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {appointmentCopy} from '../../src/components/pro/appointment-copy';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';

type Language='es'|'en';
const copyFor=(language:Language)=>language==='en'?{
 prepare:'Prepare quote',send:'Send quote',description:'Description',price:'Price (₡)',back:'Back to request',accept:'Accept quote',acceptTitle:'Accept this quote?',backConfirm:'Back',finish:'Complete job',finishTitle:'Complete this job?',finishConfirm:'Yes, complete',close:'Close',review:'Review quote',extra:'Optional visit material',
}: {
 prepare:'Preparar cotización',send:'Enviar cotización',description:'Descripción',price:'Precio (₡)',back:'Volver a la solicitud',accept:'Aceptar cotización',acceptTitle:'¿Aceptar esta cotización?',backConfirm:'Volver',finish:'Finalizar trabajo',finishTitle:'¿Finalizar este trabajo?',finishConfirm:'Sí, finalizar',close:'Cerrar',review:'Revisar cotización',extra:'Material opcional de la visita',
};

function deviceFor(testInfo:TestInfo){const {viewport,isMobile,hasTouch,userAgent,deviceScaleFactor}=testInfo.project.use;return {viewport,isMobile,hasTouch,userAgent,deviceScaleFactor};}

async function readyWithRecovery(page:Page,target:Locator,language:Language){
 const recovery=page.locator('[data-session-recovery]');
 await expect.poll(async()=>await recovery.isVisible()||await target.isVisible()).toBe(true);
 if(await recovery.isVisible()){
  await expect(recovery.getByRole('alert')).toBeVisible();
  await recovery.getByRole('button',{name:language==='en'?'Try again':'Reintentar',exact:true}).click();
  await expect(recovery).toHaveCount(0);
 }
 await expect(target).toBeVisible();
}

/** Every row belongs to fresh local actors; no acceptance, quote or work link is seeded. */
async function fixture(language:Language,browser:Browser,ownerContext:BrowserContext,baseURL:string,device:ReturnType<typeof deviceFor>){
 expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const actors:DisposableAccount[]=[],contexts:BrowserContext[]=[],db=regressionAdminClient();
 async function cleanup(bodyError?:unknown){
  const failures:unknown[]=[];
  for(const context of contexts){try{await context.close();}catch(error){failures.push(error);}}
  // These actors share FK references through requests and quotes. Parallel
  // profile deletion can deadlock and hide an otherwise useful test failure.
  for(const actor of actors){try{await cleanupDisposableAccount(actor);}catch(error){failures.push(error);}}
  if(failures.length)throw new AggregateError(bodyError?[bodyError,...failures]:failures,bodyError?'Request quote body failed and fixture cleanup failed':'Request quote fixture cleanup failed',{cause:bodyError});
 }
 async function login(context:BrowserContext,actor:DisposableAccount){
  const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>{await context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:baseURL,sameSite:'Lax' as const})));}}});
  expect((await auth.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();await context.addCookies([{name:'NEXT_LOCALE',value:language,url:baseURL}]);
 }
 try{
  const owner=await createDisposableAccount({prefix:'request-quote-owner'});actors.push(owner);
  const client=await createDisposableAccount({prefix:'request-quote-client'});actors.push(client);
  const outsider=await createDisposableAccount({prefix:'request-quote-other'});actors.push(outsider);
  async function provider(actor:DisposableAccount){
   const account=await db.auth.admin.getUserById(actor.id);expect(account.error).toBeNull();expect((await db.auth.admin.updateUserById(actor.id,{user_metadata:{...account.data.user!.user_metadata,role:'professional',is_provider:true}})).error).toBeNull();
   await db.from('profiles').update({role:'professional',is_provider:true}).eq('id',actor.id).throwOnError();await db.from('pro_memberships').insert({user_id:actor.id,status:'active'}).throwOnError();await db.from('pro_appointment_preferences').insert({owner_id:actor.id,enabled:true,revision:1}).throwOnError();
   return (await db.from('professionals').insert({profile_id:actor.id,category_id:'desarrollo_web',business_name:'Cita y cotización local '+actor.id.slice(0,8),slug:'request-quote-'+actor.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_available:true,is_banned:false}).select('id').single().throwOnError()).data!;
  }
  const professional=await provider(owner),otherProfessional=await provider(outsider),day=new Date(Date.now()+3*86400000).toISOString().slice(0,10),contactId='reservation-'+client.id;
  const workspaceDocument=emptyBusiness();workspaceDocument.clients=[{id:contactId,name:'Contacto conservado de la solicitud',email:'',phone:'',notes:'PRIVADO_FICHA_'+owner.id,archived:false}];workspaceDocument.availability=[{start:day+'T08:00:00-06:00',end:day+'T16:00:00-06:00'}];
  await db.from('pro_workspaces').insert({user_id:owner.id,document:workspaceDocument,revision:1}).throwOnError();await db.from('pro_workspaces').insert({user_id:outsider.id,document:{...emptyBusiness(),availability:workspaceDocument.availability},revision:1}).throwOnError();
  // Exercise both causal orders: ES approves the quote before confirming the
  // appointment; EN books normally first, then approves its quote.
  if(language==='en')expect((await db.rpc('pro_appointment_schedule_record',{p_actor:owner.id,p_input:{revision:0,actionId:crypto.randomUUID(),durationMinutes:60,weekly:[],closedDates:[]}})).error).toBeNull();
  for(const actor of actors)await db.from('notification_once_receipts').insert({user_id:actor.id,type:'resena_google',status:'historical_unknown',sent_at:null}).throwOnError();
  await login(ownerContext,owner);const customer=await browser.newContext({baseURL,...device}),foreign=await browser.newContext({baseURL,...device}),anonymous=await browser.newContext({baseURL,...device});contexts.push(customer,foreign,anonymous);await login(customer,client);await login(foreign,outsider);
  const headers={origin:new URL(baseURL).origin},requestId=crypto.randomUUID(),otherRequestId=crypto.randomUUID(),service='Revisión ordinaria '+owner.id.slice(0,8),foreignService='SERVICIO_PRIVADO_'+outsider.id,foreignNote='NOTA_PRIVADA_'+outsider.id;
  async function request(id:string,professionalId:string,title:string,start:string,note='Solicitud conservada sin extras'){
   const response=await customer.request.post('/api/pro/appointment-requests',{headers,data:{action:'create',id,actionId:crypto.randomUUID(),professionalId,service:title,durationMinutes:60,locationKind:'agree',locationText:'',note,start,preferredDay:null,preference:''}});expect(response.status()).toBe(200);return response.json();
  }
  await request(requestId,professional.id,service,day+'T10:00:00-06:00');await request(otherRequestId,otherProfessional.id,foreignService,day+'T10:00:00-06:00',foreignNote);
  const initialRequest=(await db.from('pro_appointment_requests').select('*').eq('id',requestId).single().throwOnError()).data!;expect(initialRequest.status).toBe(language==='en'?'confirmed':'requested');
  const initialWork=(await db.from('pro_work').select('*').eq('user_id',owner.id).order('id').throwOnError()).data!,contactBefore=(await db.from('pro_clients').select('*').eq('user_id',owner.id).eq('id',contactId).single().throwOnError()).data!,notifications=(await db.from('notifications').select('*').in('user_id',actors.map(actor=>actor.id)).order('id').throwOnError()).data!;
  return {db,owner,client,outsider,professional,otherProfessional,day,contactId,workspaceDocument,customer,foreign,anonymous,headers,requestId,otherRequestId,service,foreignService,foreignNote,initialRequest,initialWork,contactBefore,notifications,actors,request,cleanup};
 }catch(error){await cleanup(error);throw error;}
}

for(const language of ['es','en'] as const)test(`Ordinary request quote reaches its real customer, approval and linked job through the UI [${language}]`,async({page,browser,baseURL},testInfo)=>{
 test.setTimeout(240000);const f=await fixture(language,browser,page.context(),baseURL!,deviceFor(testInfo)),copy=copyFor(language),appointment=appointmentCopy[language],prefix='/'+language;let bodyError:unknown;
 try{
  const quoteInput={clientActionId:crypto.randomUUID(),clientName:'No revelar información',title:'Intento sin permiso',items:[{description:'Solo prueba local',quantity:1,unit_price:1000}],taxMode:'exento',validDays:15};
  const sourcePost=(sourceRequestId:string,patch:Record<string,unknown>={})=>({...quoteInput,clientActionId:crypto.randomUUID(),sourceRequestId,...patch});
  async function rejected(response:APIResponse,status:number){expect(response.status()).toBe(status);const body=await response.json();expect(body).toEqual({error:expect.any(String)});for(const secret of [f.foreignService,f.foreignNote,f.client.email,f.outsider.id,f.client.id])expect(JSON.stringify(body)).not.toContain(secret);}
  const quoteSnapshot=async()=>(await f.db.from('quotes').select('*').in('professional_id',[f.professional.id,f.otherProfessional.id]).order('id').throwOnError()).data!;
  const beforeRejected=await quoteSnapshot();
  await rejected(await page.request.post('/api/quotes',{headers:f.headers,data:sourcePost('not-a-uuid')}),400);
  await rejected(await page.request.post('/api/quotes',{headers:f.headers,data:sourcePost(crypto.randomUUID())}),404);
  await rejected(await page.request.post('/api/quotes',{headers:f.headers,data:sourcePost(f.otherRequestId)}),404);
  await rejected(await f.foreign.request.post('/api/quotes',{headers:f.headers,data:sourcePost(f.requestId)}),404);
  await rejected(await f.customer.request.post('/api/quotes',{headers:f.headers,data:sourcePost(f.requestId)}),403);
  await rejected(await f.anonymous.request.post('/api/quotes',{headers:f.headers,data:sourcePost(f.requestId)}),401);
  await rejected(await page.request.post('/api/quotes',{headers:f.headers,data:sourcePost(f.requestId,{projectId:crypto.randomUUID()})}),400);
  await rejected(await page.request.post('/api/quotes',{headers:{origin:'https://invalid.test'},data:sourcePost(f.requestId)}),403);
  expect(await quoteSnapshot()).toEqual(beforeRejected);expect((await f.db.from('pro_quote_links').select('*').in('user_id',[f.owner.id,f.outsider.id]).throwOnError()).data).toEqual([]);expect((await f.db.from('pro_work').select('*').eq('user_id',f.owner.id).order('id').throwOnError()).data).toEqual(f.initialWork);
  const downloads:string[]=[],agendaPatches:{afterAutomaticLink:boolean;body:{work?:{id?:string;externalQuoteId?:string;stage?:string}}}[]=[],createBodies:Record<string,unknown>[]=[];let automaticLinkVerified=false;
  await page.route('**/api/pro/workspace**',route=>{downloads.push(route.request().url());return route.abort();});
  page.on('request',request=>{const url=new URL(request.url());if(request.method()==='PATCH'&&url.pathname==='/api/pro/agenda')agendaPatches.push({afterAutomaticLink:automaticLinkVerified,body:request.postDataJSON()});if(request.method()==='POST'&&url.pathname==='/api/quotes')createBodies.push(request.postDataJSON());});
  await gotoOK(page,prefix+'/dashboard/profesional?tab=pro_agenda&citaSolicitud='+f.requestId);const requestPath=page.url();const requestDialog=()=>page.getByRole('dialog',{name:appointment.detailTitle,exact:true});await readyWithRecovery(page,requestDialog(),language);await requestDialog().getByRole('button',{name:copy.prepare,exact:true}).click();
  await expect(page).toHaveURL(/solicitudOrigen=/);const quoteForm=page.getByRole('dialog');await expect(quoteForm.getByPlaceholder(copy.description,{exact:true})).toHaveValue(f.service);await quoteForm.getByLabel(copy.price,{exact:true}).fill('12500');
  await page.reload();await readyWithRecovery(page,quoteForm.getByLabel(copy.price,{exact:true}),language);await expect(quoteForm.getByLabel(copy.price,{exact:true})).toHaveValue('12500');expect(new URL(page.url()).searchParams.get('solicitudOrigen')).toBe(f.requestId);
  const created=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname==='/api/quotes');await quoteForm.getByRole('button',{name:copy.send,exact:true}).click();const createdResponse=await created;expect(createdResponse.status()).toBe(200);const quote=(await createdResponse.json()).quote;
  await rejected(await f.foreign.request.get('/api/pro/request-quotes?quoteId='+quote.id),404);await rejected(await f.anonymous.request.get('/api/pro/request-quotes?quoteId='+quote.id),401);
  expect(createBodies).toHaveLength(1);expect(createBodies[0].sourceRequestId).toBe(f.requestId);expect(createBodies[0].clientActionId).toMatch(/^[\da-f-]{36}$/);expect(quote).toMatchObject({client_id:f.client.id,status:'sent',project_id:null,total:12500});
  await expect.poll(()=>new URL(page.url()).searchParams.get('cotizacion')).toBe(quote.id);await expect(quoteForm.getByRole('button',{name:copy.back,exact:true})).toBeVisible();
  // Nothing in quote creation books a new time or links an unaccepted document.
  expect((await f.db.from('pro_work').select('*').eq('user_id',f.owner.id).order('id').throwOnError()).data).toEqual(f.initialWork);expect((await f.db.from('pro_appointment_requests').select('*').eq('id',f.requestId).single().throwOnError()).data).toEqual(f.initialRequest);
  const clientPage=await f.customer.newPage();expect(clientPage.viewportSize()).toEqual(page.viewportSize());await gotoOK(clientPage,prefix+'/dashboard/profesional?tab=appointments&citaSolicitud='+f.requestId);
  /* Closing round: since Fix 14 a request linked to a job opens as the customer's «Mi proyecto» page (same body as the dialog). */const clientRequest=()=>clientPage.getByRole('dialog',{name:appointment.detailTitle,exact:true}).or(clientPage.locator('[data-client-project-page]')).first();await readyWithRecovery(clientPage,clientRequest(),language);await expect(clientRequest()).toContainText(f.service,{timeout:60000});const quoteList=clientRequest().locator('[data-client-quote-choices]');await readyWithRecovery(clientPage,quoteList,language);const received=quoteList.getByRole('button',{name:new RegExp(f.service)});await readyWithRecovery(clientPage,received,language);await received.click();
  const approval=()=>clientPage.getByRole('dialog').filter({has:clientPage.getByRole('button',{name:copy.accept,exact:true})}).filter({hasText:f.service});
  await readyWithRecovery(clientPage,approval(),language);await expect(approval()).not.toContainText(f.workspaceDocument.clients[0].notes);await expect(approval().locator('[data-quote-choices]')).toHaveCount(0);await expect(approval().getByRole('checkbox')).toHaveCount(0);await expectNoHorizontalOverflow(clientPage);
  await approval().getByRole('button',{name:copy.accept,exact:true}).click();const acceptance=()=>clientPage.getByRole('dialog').filter({has:clientPage.getByRole('heading',{name:copy.acceptTitle,exact:true})});await acceptance().getByRole('button',{name:copy.backConfirm,exact:true}).click();expect((await f.db.from('quotes').select('status').eq('id',quote.id).single().throwOnError()).data!.status).toBe('sent');
  const accepted=clientPage.waitForResponse(response=>response.request().method()==='PATCH'&&new URL(response.url()).pathname==='/api/quotes');await approval().getByRole('button',{name:copy.accept,exact:true}).click();await acceptance().getByRole('button',{name:copy.accept,exact:true}).click();const acceptedResponse=await accepted;expect(acceptedResponse.status()).toBe(200);const acceptedBody=acceptedResponse.request().postDataJSON();expect(acceptedBody).toMatchObject({id:quote.id,action:'accept',clientActionId:expect.any(String),expectedUpdatedAt:expect.any(String)});
  await expect.poll(async()=>(await f.db.from('quotes').select('status').eq('id',quote.id).single().throwOnError()).data!.status).toBe('accepted');
  // The customer approval must be real UI, never a direct status UPDATE.
  expect((await f.db.from('pro_appointment_requests').select('status').eq('id',f.requestId).single().throwOnError()).data!.status).toBe(f.initialRequest.status);
  if(language==='es')expect((await f.db.from('pro_work').select('*').eq('user_id',f.owner.id).order('id').throwOnError()).data).toEqual(f.initialWork);
  await quoteForm.getByRole('button',{name:copy.back,exact:true}).click();await expect(page).toHaveURL(requestPath);await page.reload();await readyWithRecovery(page,requestDialog(),language);
  if(language==='es'){
   await requestDialog().getByRole('button',{name:appointment.confirm,exact:true}).click();const confirmTime=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:appointment.confirmationTitle,exact:true})});await confirmTime.getByRole('button',{name:appointment.confirm,exact:true}).click();
  }
  await expect.poll(async()=>(await f.db.from('pro_work').select('id').eq('user_id',f.owner.id).eq('externalQuoteId',quote.id).throwOnError()).data?.length).toBe(1);
  const work=(await f.db.from('pro_work').select('*').eq('user_id',f.owner.id).eq('externalQuoteId',quote.id).single().throwOnError()).data!,savedRequest=(await f.db.from('pro_appointment_requests').select('*').eq('id',f.requestId).single().throwOnError()).data!;expect(work).toMatchObject({clientId:f.contactId,service:f.service,bookingClientId:f.client.id});expect(savedRequest).toMatchObject({status:'confirmed',work_id:work.id});expect(agendaPatches).toEqual([]);automaticLinkVerified=true;
  const acceptedQuote=(await f.db.from('quotes').select('*').eq('id',quote.id).single().throwOnError()).data!,eventsBefore=(await f.db.from('pro_appointment_events').select('*').eq('request_id',f.requestId).order('position').throwOnError()).data!;
  // Accepted source quotes supply a read-only commercial amount; no manual
  // agreement or payment may be inserted to make this account look priced.
  const accountUrl='/api/pro/client-operations?'+new URLSearchParams({clientId:f.contactId,workId:work.id});
  const accountResponse=await page.request.get(accountUrl);expect(accountResponse.status()).toBe(200);const derivedAccount=await accountResponse.json();
  expect(derivedAccount.work).toMatchObject({id:work.id,externalQuoteId:quote.id,agreedCents:1250000,paidCents:0,balanceCents:1250000});
  expect(derivedAccount.summary).toEqual({agreedCents:1250000,paidCents:0,balanceCents:1250000,unpriced:0,creditNotesCents:0,customerBalanceCents:1250000});expect(derivedAccount.entries).toEqual([]);
  // Withdrawing or soft-deleting the accepted source would silently erase the
  // read-only price. Neither action may invalidate this confirmed agreement.
  for(const action of ['withdraw','delete'])await rejected(await page.request.patch('/api/quotes',{headers:f.headers,data:{id:quote.id,action}}),409);
  expect((await f.db.from('quotes').select('*').eq('id',quote.id).single().throwOnError()).data).toEqual(acceptedQuote);
  expect(await(await page.request.get(accountUrl)).json()).toEqual(derivedAccount);
  expect((await f.db.from('pro_client_entries').select('*').eq('user_id',f.owner.id).throwOnError()).data).toEqual([]);
  await requestDialog().getByRole('button',{name:appointment.work,exact:true}).click();const job=page.getByRole('dialog',{name:f.service,exact:true});
  const workNavigation=job.getByRole('navigation',{name:language==='en'?'Job workspace':'Gestión del trabajo',exact:true});await workNavigation.getByRole('button',{name:language==='en'?'Changes':'Extras y cambios',exact:true}).click();
  const agreement=job.locator('[data-work-changes]');await expect(agreement.locator('dl > div').filter({has:page.getByText(language==='en'?'Agreed amount':'Importe acordado',{exact:true})}).locator('dd')).toContainText(/12[.,]500/);
  await expect(agreement).not.toContainText(language==='en'?'Not set':'Sin definir');
  await workNavigation.getByRole('button',{name:language==='en'?'Overview':'Resumen',exact:true}).click();
  await job.getByRole('button',{name:copy.finish,exact:true}).click();const finish=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:copy.finishTitle,exact:true})});await finish.getByRole('button',{name:copy.finishConfirm,exact:true}).click();
  await expect.poll(async()=>(await f.db.from('pro_work').select('stage').eq('user_id',f.owner.id).eq('id',work.id).single().throwOnError()).data!.stage).toBe('completed');await expect(job.getByText(language==='en'?'Completed':'Finalizada',{exact:true})).toBeVisible();await expect(job.getByRole('button',{name:copy.finish,exact:true})).toHaveCount(0);expect((await f.db.from('pro_work').select('id').eq('user_id',f.owner.id).throwOnError()).data).toEqual([{id:work.id}]);
  expect((await f.db.from('pro_appointment_requests').select('status,work_id').eq('id',f.requestId).single().throwOnError()).data).toEqual({status:'completed',work_id:work.id});expect((await f.db.from('pro_appointment_events').select('*').eq('request_id',f.requestId).order('position').throwOnError()).data).toEqual(expect.arrayContaining(eventsBefore));expect((await f.db.from('quotes').select('*').eq('id',quote.id).single().throwOnError()).data).toEqual(acceptedQuote);expect((await f.db.from('pro_clients').select('*').eq('user_id',f.owner.id).eq('id',f.contactId).single().throwOnError()).data).toEqual(f.contactBefore);expect((await f.db.from('pro_client_entries').select('*').eq('user_id',f.owner.id).throwOnError()).data).toEqual([]);
  // The same accepted total must reach the customer account after completing
  // the job, and enable recording a received payment without asking for a price.
  await job.getByRole('button',{name:language==='en'?'Balance and payments':'Saldo y abonos',exact:true}).click();
  const account=job.locator('[data-work-account]');await expect(account).toBeVisible();
  await expect(account.locator('dl > div').filter({hasText:language==='en'?'Agreed amount:':'Importe acordado:'}).locator('strong')).toContainText(/12[.,]500/);
  await expect(account.getByRole('button',{name:language==='en'?'Record payment':'Registrar abono',exact:true})).toBeVisible();
  await expect(account.getByRole('button',{name:language==='en'?'Set amount':'Definir importe',exact:true})).toHaveCount(0);
  await expect(account).not.toContainText(language==='en'?'Not set':'Sin definir');
  expect((await(await page.request.get(accountUrl)).json()).work).toEqual({...derivedAccount.work,stage:'completed'});
  expect((await f.db.from('pro_client_entries').select('*').eq('user_id',f.owner.id).throwOnError()).data).toEqual([]);
  await workNavigation.getByRole('button',{name:language==='en'?'Overview':'Resumen',exact:true}).click();await expect(job).toBeVisible();
  await expectNoHorizontalOverflow(page);await page.screenshot({path:testInfo.outputPath('ordinary-request-job-'+language+'.png'),fullPage:true});
  // Extras retain versioned selection. The ordinary PATCH cannot bypass them.
  const extraRequestId=crypto.randomUUID();await f.request(extraRequestId,f.professional.id,'Visita con complementos '+language,f.day+'T13:00:00-06:00');
  expect((await page.request.post('/api/pro/appointment-quote-context',{headers:f.headers,data:{requestId:extraRequestId}})).status()).toBe(200);
  const extrasCreated=await page.request.post('/api/quotes',{headers:f.headers,data:{sourceRequestId:extraRequestId,clientActionId:crypto.randomUUID(),clientName:'Contacto conservado de la solicitud',title:'Visita con complementos '+language,items:[{description:'Servicio base',quantity:1,unit_price:1000}],taxMode:'exento',validDays:15}});expect(extrasCreated.status()).toBe(200);const extrasQuote=(await extrasCreated.json()).quote;
  const extraId=crypto.randomUUID();expect((await page.request.post('/api/pro/quote-choices',{headers:f.headers,data:{action:'configure',quoteId:extrasQuote.id,actionId:crypto.randomUUID(),revision:0,extras:[{id:extraId,description:copy.extra,quantity:1,unit_price:500}]}})).status()).toBe(200);
  expect((await f.customer.request.patch('/api/quotes',{headers:f.headers,data:{id:extrasQuote.id,action:'accept',clientActionId:crypto.randomUUID(),expectedUpdatedAt:extrasQuote.updated_at}})).status()).toBe(409);expect((await f.db.from('quotes').select('status,total').eq('id',extrasQuote.id).single().throwOnError()).data).toEqual({status:'sent',total:1000});
  await gotoOK(clientPage,prefix+'/dashboard/profesional?tab=appointments&citaSolicitud='+extraRequestId);await readyWithRecovery(clientPage,clientRequest(),language);const extraRow=clientRequest().locator('[data-client-quote-choices]').getByRole('button',{name:new RegExp('Visita con complementos '+language)});await readyWithRecovery(clientPage,extraRow,language);await extraRow.click();const extras=clientPage.getByRole('dialog',{name:copy.review,exact:true});await expect(extras.getByRole('checkbox',{name:copy.extra,exact:true})).not.toBeChecked();await expect(extras.locator('[data-quote-choices]')).toBeVisible();
  expect((await f.db.from('notifications').select('*').in('user_id',f.actors.map(actor=>actor.id)).order('id').throwOnError()).data).toEqual(f.notifications);expect(downloads).toEqual([]);expect(agendaPatches).toHaveLength(1);expect(agendaPatches[0]).toMatchObject({afterAutomaticLink:true,body:{work:{id:work.id,externalQuoteId:quote.id,stage:'completed'}}});
 }catch(error){bodyError=error;await page.screenshot({path:testInfo.outputPath('request-quote-owner-failure-'+language+'.png'),fullPage:true}).catch(()=>{});await f.customer.pages().at(-1)?.screenshot({path:testInfo.outputPath('request-quote-customer-failure-'+language+'.png'),fullPage:true}).catch(()=>{});throw error;}
 finally{await page.goto('about:blank').catch(()=>{});await f.cleanup(bodyError);}
});

for(const language of ['es','en'] as const)test(`Request quote lost acknowledgement survives reload and retries one exact creation [${language}]`,async({page,browser,baseURL},testInfo)=>{
 test.setTimeout(180000);const f=await fixture(language,browser,page.context(),baseURL!,deviceFor(testInfo)),copy=copyFor(language),appointment=appointmentCopy[language],prefix='/'+language;let bodyError:unknown;
 try{
  const attempts:string[]=[];
  await page.route('**/api/quotes',async route=>{
   if(route.request().method()!=='POST'){await route.continue();return;}
   attempts.push(route.request().postData()!);
   // A session denial on retry says nothing about the first committed write.
   if(attempts.length===2){await route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'Session expired during recovery'})});return;}
   const response=await route.fetch();expect(response.status()).toBe(200);
   if(attempts.length===1){await route.abort('failed');return;}
   await route.fulfill({response});
  });
  await gotoOK(page,prefix+'/dashboard/profesional?tab=pro_agenda&citaSolicitud='+f.requestId);const requestDetail=page.getByRole('dialog',{name:appointment.detailTitle,exact:true});await readyWithRecovery(page,requestDetail,language);await requestDetail.getByRole('button',{name:copy.prepare,exact:true}).click();
  const editor=()=>page.getByRole('dialog').filter({has:page.getByLabel(copy.price,{exact:true})});await readyWithRecovery(page,editor(),language);await editor().getByLabel(copy.price,{exact:true}).fill('12750');await editor().getByRole('button',{name:copy.send,exact:true}).click();
  const retry=language==='en'?'Check saved result':'Comprobar guardado';await expect(editor().getByRole('button',{name:retry,exact:true})).toBeVisible();await expect(editor().getByLabel(copy.price,{exact:true})).toBeDisabled();await expect(editor().getByLabel(copy.price,{exact:true})).toHaveValue('12750');expect(attempts).toHaveLength(1);
  const first=JSON.parse(attempts[0]);expect(first.sourceRequestId).toBe(f.requestId);expect(first.clientActionId).toMatch(/^[\da-f-]{36}$/);
  const rows=() => f.db.from('quotes').select('*').eq('professional_id',f.professional.id).order('id').throwOnError();const committed=(await rows()).data!;expect(committed).toHaveLength(1);expect(committed[0]).toMatchObject({client_id:f.client.id,status:'sent',total:12750});
  const draftKey='ccr:pro:quote-draft:'+f.owner.id,saved=JSON.parse((await page.evaluate(key=>sessionStorage.getItem(key),draftKey))!);expect(saved).toMatchObject({sourceRequestId:f.requestId,clientActionId:first.clientActionId,requestPending:true});
  const editorPath=page.url();await editor().getByRole('button',{name:copy.close,exact:true}).click();await expect(editor()).toBeVisible();await expect(page).toHaveURL(editorPath);
  await editor().getByRole('button',{name:retry,exact:true}).click();await expect(editor().getByRole('alert').filter({hasText:language==='en'?'Could not send':'No se pudo enviar'})).toBeVisible();await expect(editor().getByLabel(copy.price,{exact:true})).toBeDisabled();await expect(editor().getByRole('button',{name:retry,exact:true})).toBeVisible();expect(attempts).toHaveLength(2);expect(attempts[1]).toBe(attempts[0]);expect((await rows()).data).toEqual(committed);
  const afterDenied=JSON.parse((await page.evaluate(key=>sessionStorage.getItem(key),draftKey))!);expect(afterDenied).toMatchObject({sourceRequestId:f.requestId,clientActionId:first.clientActionId,requestPending:true});
  // This deliberately abandons the document without changing its session-local
  // storage. Hydration must recover the identity, never send automatically.
  page.once('dialog',dialog=>dialog.accept());await page.reload();await readyWithRecovery(page,editor(),language);await expect(editor().getByRole('button',{name:retry,exact:true})).toBeVisible();await expect(editor().getByLabel(copy.price,{exact:true})).toHaveValue('12750');await expect(editor().getByLabel(copy.price,{exact:true})).toBeDisabled();expect(attempts).toHaveLength(2);
  const restored=JSON.parse((await page.evaluate(key=>sessionStorage.getItem(key),draftKey))!);expect(restored).toMatchObject({sourceRequestId:f.requestId,clientActionId:first.clientActionId,requestPending:true});
  await editor().getByRole('button',{name:retry,exact:true}).click();await expect.poll(()=>new URL(page.url()).searchParams.get('cotizacion')).toBe(committed[0].id);expect(attempts).toHaveLength(3);expect(attempts[1]).toBe(attempts[0]);expect(attempts[2]).toBe(attempts[0]);expect((await rows()).data).toEqual(committed);
  expect((await f.db.from('pro_quote_links').select('quoteId,clientId').eq('user_id',f.owner.id).throwOnError()).data).toEqual([{quoteId:committed[0].id,clientId:f.contactId}]);expect((await f.db.from('pro_appointment_requests').select('*').eq('id',f.requestId).single().throwOnError()).data).toEqual(f.initialRequest);expect((await f.db.from('pro_work').select('*').eq('user_id',f.owner.id).order('id').throwOnError()).data).toEqual(f.initialWork);expect((await f.db.from('pro_clients').select('*').eq('user_id',f.owner.id).eq('id',f.contactId).single().throwOnError()).data).toEqual(f.contactBefore);expect((await f.db.from('notifications').select('*').in('user_id',f.actors.map(actor=>actor.id)).order('id').throwOnError()).data).toEqual(f.notifications);
  await expectNoHorizontalOverflow(page);await page.screenshot({path:testInfo.outputPath('request-quote-recovered-'+language+'.png'),fullPage:true});
 }catch(error){bodyError=error;await page.screenshot({path:testInfo.outputPath('request-quote-recovery-failure-'+language+'.png'),fullPage:true}).catch(()=>{});throw error;}
 finally{await page.close().catch(()=>{});await f.cleanup(bodyError);}
});
