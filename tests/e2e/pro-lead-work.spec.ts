import {test,expect,type BrowserContext,type Browser,type Page} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
const origin='http://127.0.0.1:3185',leadApi='/api/pro/lead-center',workApi='/api/pro/lead-work',filesApi='/api/pro/lead-files',deleteApi='/api/pro/lead-delete';

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


const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const upload=(c:BrowserContext,actor:string,fields:Record<string,string>,name='plano.pdf',buffer:Buffer=pdf)=>c.request.post(origin+filesApi,{headers:{Origin:origin,'X-Pro-Expected-Actor':actor},multipart:{...fields,file:{name,mimeType:'application/pdf',buffer}}});
const postJson=(c:BrowserContext,actor:string,url:string,data:unknown)=>c.request.post(origin+url,{headers:{Origin:origin,'X-Pro-Expected-Actor':actor},data});
async function openLead(page:Page,language:'es'|'en',id:string){await gotoOK(page,`/${language}/dashboard/pro?tab=pro_leads&solicitudManual=${id}`);await expect(page.locator('[data-lead-work]')).toBeVisible({timeout:60000});}

// Leads area: tasks, files, plans, estimate uploads and delete of a lead.
test('lead work API: tasks, files, plans, delete, idempotency, conflicts, validation and isolation',async({page,baseURL,browser}:{page:Page;baseURL:string|undefined;browser:Browser})=>{
 test.setTimeout(240000);local(baseURL);const f=await fixture(page.context()),c=page.context(),other=await browser.newContext();
 try{
  const lead=f.paint,base={kind:'manual',leadId:lead},q=new URLSearchParams(base).toString();
  // Tasks.
  const empty=await c.request.get(origin+workApi+'?'+q,{headers:{'X-Pro-Expected-Actor':f.owner.id}});expect(empty.status()).toBe(200);expect(await empty.json()).toMatchObject({kind:'manual',leadId:lead,items:[]});
  const taskId=crypto.randomUUID(),add={action:'add',...base,id:taskId,title:'Llamar al cliente',dueDate:'2026-12-01'};
  const one=await postJson(c,f.owner.id,workApi,add);expect(one.status()).toBe(200);expect((await one.json()).items).toMatchObject([{id:taskId,title:'Llamar al cliente',dueDate:'2026-12-01',done:false,revision:1}]);
  expect((await (await postJson(c,f.owner.id,workApi,add)).json()).items).toHaveLength(1);
  expect((await postJson(c,f.owner.id,workApi,{...add,title:'Otro'})).status()).toBe(400);
  expect((await postJson(c,f.owner.id,workApi,{...add,id:crypto.randomUUID(),title:'  '})).status()).toBe(400);
  expect((await postJson(c,f.owner.id,workApi,{...add,id:crypto.randomUUID(),extra:1})).status()).toBe(400);
  const done={action:'set_done',...base,id:taskId,done:true,revision:1};
  const finished=await postJson(c,f.owner.id,workApi,done);expect(finished.status()).toBe(200);expect((await finished.json()).items[0]).toMatchObject({done:true,revision:2});
  expect((await postJson(c,f.owner.id,workApi,done)).status()).toBe(200);
  expect((await postJson(c,f.owner.id,workApi,{...done,done:false})).status()).toBe(409);
  const gone=await postJson(c,f.owner.id,workApi,{action:'remove',...base,id:taskId,revision:2});expect(gone.status()).toBe(200);expect((await gone.json()).items).toHaveLength(0);
  expect((await postJson(c,f.owner.id,workApi,{...add,id:crypto.randomUUID(),leadId:crypto.randomUUID()})).status()).toBe(404);
  // A ContrataCR request is a lead too.
  expect((await postJson(c,f.owner.id,workApi,{action:'add',kind:'request',leadId:f.requestId,id:crypto.randomUUID(),title:'Confirmar horario',dueDate:null})).status()).toBe(200);
  // Files, plans and estimate uploads.
  const fileId=crypto.randomUUID(),planId=crypto.randomUUID();
  const up=await upload(c,f.owner.id,{...base,id:fileId,purpose:'file'},'foto-sitio.pdf');expect(up.status()).toBe(200);expect((await up.json()).items).toMatchObject([{id:fileId,purpose:'file',name:'foto-sitio.pdf',mimeType:'application/pdf'}]);
  expect((await (await upload(c,f.owner.id,{...base,id:fileId,purpose:'file'},'foto-sitio.pdf')).json()).items).toHaveLength(1);
  expect((await upload(c,f.owner.id,{...base,id:planId,purpose:'plan'},'planta.pdf')).status()).toBe(200);
  expect((await upload(c,f.owner.id,{...base,id:crypto.randomUUID(),purpose:'estimate'},'cotizacion.pdf')).status()).toBe(200);
  const listed=await (await c.request.get(origin+filesApi+'?'+q,{headers:{'X-Pro-Expected-Actor':f.owner.id}})).json();expect(listed.items.map((i:{purpose:string})=>i.purpose).sort()).toEqual(['estimate','file','plan']);
  const download=await c.request.get(origin+filesApi+'?fileId='+planId,{headers:{'X-Pro-Expected-Actor':f.owner.id}});expect(download.status()).toBe(200);expect(download.headers()['content-type']).toContain('application/pdf');expect(download.headers()['content-disposition']).toContain('attachment');expect(await download.body()).toEqual(pdf);
  expect((await upload(c,f.owner.id,{...base,id:crypto.randomUUID(),purpose:'file'},'falso.pdf',Buffer.from('no es un pdf'))).status()).toBe(400);
  expect((await upload(c,f.owner.id,{...base,id:crypto.randomUUID(),purpose:'otro'})).status()).toBe(400);
  expect((await upload(c,f.owner.id,{...base,id:crypto.randomUUID(),purpose:'file',leadId:crypto.randomUUID()})).status()).toBe(404);
  const stranger=await createDisposableAccount({prefix:'work-stranger'});
  try{await login(other,stranger);expect((await other.request.get(origin+filesApi+'?fileId='+planId,{headers:{'X-Pro-Expected-Actor':stranger.id}})).status()).not.toBe(200);}finally{await cleanupDisposableAccount(stranger);}
  expect((await other.request.get(origin+filesApi+'?'+q)).status()).toBe(401);
  const removed=await postJson(c,f.owner.id,filesApi,{action:'remove',...base,id:fileId});expect(removed.status()).toBe(200);expect((await removed.json()).items).toHaveLength(2);
  expect((await c.request.get(origin+filesApi+'?fileId='+fileId,{headers:{'X-Pro-Expected-Actor':f.owner.id}})).status()).toBe(404);
  // Delete: only manual opportunities, idempotent, everything attached goes with it.
  expect((await postJson(c,f.owner.id,deleteApi,{kind:'request',leadId:f.requestId})).status()).toBe(400);
  expect((await postJson(c,f.owner.id,deleteApi,{kind:'manual',leadId:lead,extra:1})).status()).toBe(400);
  const deleted=await postJson(c,f.owner.id,deleteApi,{kind:'manual',leadId:lead});expect(deleted.status()).toBe(200);expect(await deleted.json()).toMatchObject({deleted:true,leadId:lead});
  expect((await postJson(c,f.owner.id,deleteApi,{kind:'manual',leadId:lead})).status()).toBe(200);
  expect((await c.request.get(origin+filesApi+'?'+q,{headers:{'X-Pro-Expected-Actor':f.owner.id}})).status()).toBe(404);
  const rows=await f.db.from('pro_lead_files').select('id').eq('lead_id',lead);expect(rows.data).toEqual([]);
 }finally{await other.close();await page.goto('about:blank').catch(()=>{});await cleanup(f);}
});

for(const language of ['es','en'] as const){
 test(`${language}: lead work panel with quick create, tasks, files, plans, estimate entry, print and delete`,async({page,baseURL}:{page:Page;baseURL:string|undefined})=>{
  test.setTimeout(240000);local(baseURL);const en=language==='en',f=await fixture(page.context()),errors:string[]=[];onAppPageError(page,message=>errors.push(message));
  try{
   await openLead(page,language,f.paint);
   const panel=page.locator('[data-lead-work]');
   await expect(panel.locator('[data-lead-tile]')).toHaveCount(5);
   await panel.locator('[data-lead-tile="tasks"]').click();
   await expect(panel.locator('[data-lead-task-input]')).toBeFocused();
   await panel.locator('[data-lead-task-input]').fill('Visitar el sitio');
   await panel.getByRole('button',{name:en?'Add task':'Agregar tarea'}).click();
   await expect(panel.locator('[data-lead-task]')).toHaveCount(1);
   await panel.locator('[data-lead-task-done]').check();
   await expect(panel.locator('[data-lead-task][data-done="true"]')).toHaveCount(1);
   await panel.getByRole('button',{name:en?'Open':'Pendientes',exact:true}).click();
   await expect(panel.locator('[data-lead-task]')).toHaveCount(0);
   await panel.getByRole('button',{name:en?'All':'Todas',exact:true}).click();
   await panel.locator('[data-lead-upload="plan"]').setInputFiles({name:'planta.pdf',mimeType:'application/pdf',buffer:pdf});
   await expect(panel.locator('[data-lead-plan]')).toHaveCount(1);
   await panel.locator('[data-lead-upload="file"]').setInputFiles({name:'documento.pdf',mimeType:'application/pdf',buffer:pdf});
   await expect(panel.locator('[data-lead-files] [data-lead-file]')).toHaveCount(1);
   await panel.locator('[data-lead-upload="estimate"]').setInputFiles({name:'cotizacion.pdf',mimeType:'application/pdf',buffer:pdf});
   await expect(panel.locator('[data-lead-estimate] [data-lead-file]')).toHaveCount(1);
   await expect(panel.locator('[data-lead-estimate] [data-ai-assist]')).toBeVisible();
   await page.reload();await expect(panel).toBeVisible({timeout:60000});
   await expect(panel.locator('[data-lead-task]')).toHaveCount(1);await expect(panel.locator('[data-lead-plan]')).toHaveCount(1);
   await expectNoHorizontalOverflow(page);
   await page.evaluate(()=>{(window as unknown as {__printed:number}).__printed=0;window.print=()=>{(window as unknown as {__printed:number}).__printed++;};});
   await panel.locator('[data-lead-more]').click();await page.locator('[data-lead-print]').click();
   await expect.poll(()=>page.evaluate(()=>(window as unknown as {__printed:number}).__printed)).toBe(1);
   page.once('dialog',d=>void d.accept());
   await panel.locator('[data-lead-more]').click();await page.locator('[data-lead-delete]').click();
   await expect.poll(async()=>(await f.db.from('pro_lead_center_records').select('id').eq('id',f.paint)).data?.length,{timeout:45000}).toBe(0);
   expect(errors).toEqual([]);
  }finally{await page.goto('about:blank').catch(()=>{});await cleanup(f);}
 });
}
