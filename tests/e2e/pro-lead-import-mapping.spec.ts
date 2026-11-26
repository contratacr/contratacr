import {test,expect,type BrowserContext,type Page} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError,openLeadOption} from './helpers';
const origin='http://127.0.0.1:3185',leadApi='/api/pro/lead-center';

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


// Leads area: CSV import with a file whose column titles are not the template ones; the person maps the columns before the preview.
for(const language of ['es','en'] as const){
 test(`${language}: import a CSV with other column titles by mapping its columns`,async({page,baseURL}:{page:Page;baseURL:string|undefined})=>{
  test.setTimeout(240000);local(baseURL);const en=language==='en',f=await fixture(page.context()),errors:string[]=[];onAppPageError(page,message=>errors.push(message));
  try{
   await openLeads(page,language);
   await openLeadOption(page,en,en?'Import from file':'Importar archivo');
   const dialog=page.locator('[data-lead-import-dialog]');await expect(dialog).toBeVisible();
   const csv='Cliente;Mail;Teléfono;Trabajo;Notas;Zona\r\nLuisa Mapeo;luisa.map@example.test;8666-1000;Pintura de fachada;Llamar mañana;Heredia\r\nMarco Mapeo;;8666-2000;Cambio de techo;;Alajuela';
   await dialog.locator('input[type="file"]').setInputFiles({name:'clientes.csv',mimeType:'text/csv',buffer:Buffer.from(csv,'utf8')});
   const mapping=dialog.locator('[data-lead-import-mapping]');await expect(mapping).toBeVisible({timeout:45000});
   await expect(mapping.locator('[data-lead-import-map="0"]')).toHaveValue('name');await expect(mapping.locator('[data-lead-import-map="1"]')).toHaveValue('');
   await expect(mapping.locator('[data-lead-import-map-apply]')).toBeDisabled();await expect(mapping.locator('[data-lead-import-map-missing]')).toBeVisible();
   await mapping.locator('[data-lead-import-map="1"]').selectOption('email');await mapping.locator('[data-lead-import-map="3"]').selectOption('service');
   await expect(mapping.locator('[data-lead-import-map="0"] option[value="email"]')).toBeDisabled();
   await expect(mapping.locator('[data-lead-import-map-apply]')).toBeEnabled();await expectNoHorizontalOverflow(page);
   await mapping.locator('[data-lead-import-map-apply]').click();
   await expect(dialog.locator('[data-lead-import-row]')).toHaveCount(2,{timeout:45000});await expect(dialog.locator('[data-lead-import-summary]')).toBeVisible();
   await expect(dialog.locator('[data-lead-import-remap]')).toBeVisible();
   await page.getByRole('button',{name:en?/^Import 2 leads$/:/^Importar 2 solicitudes$/}).click();
   await expect(dialog.locator('[data-lead-import-result]')).toBeVisible({timeout:45000});
   const rows=(await f.db.from('pro_lead_center_records').select('title').eq('owner_id',f.owner.id).throwOnError()).data!.map(r=>r.title);
   expect(rows).toEqual(expect.arrayContaining(['Pintura de fachada','Cambio de techo']));
   expect(errors).toEqual([]);
  }finally{await page.goto('about:blank').catch(()=>{});await cleanup(f);}
 });
}
