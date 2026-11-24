import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';

// Row 79 (migration 439): a task template with the work-calendar option attached to an APPOINTMENT REQUEST lead stays pending
// until the provider confirms the request; the confirmation creates the tasks in the new job with the existing writers.
test('Appointment request plan templates: pending until confirmation, then created in the job',async({browser,baseURL})=>{
 test.setTimeout(180000);
 expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const owner=await createDisposableAccount({prefix:'reqplan-owner'}),client=await createDisposableAccount({prefix:'reqplan-client'}),db=regressionAdminClient(),contexts:BrowserContext[]=[];
 async function auth(actor:typeof owner){const context=await browser.newContext();contexts.push(context);const a=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>{await context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:baseURL!,sameSite:'Lax' as const})));}}});expect((await a.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();return context;}
 const api='/api/pro/appointment-requests',day=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
 try{
  const professional=await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Plan solicitudes local',slug:'reqplan-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_available:true,is_banned:false}).select('id').single();expect(professional.error).toBeNull();
  expect((await db.from('profiles').update({is_provider:true}).eq('id',owner.id)).error).toBeNull();expect((await db.from('pro_memberships').insert({user_id:owner.id,status:'active'})).error).toBeNull();
  const document=emptyBusiness();document.availability=[{start:`${day}T08:00:00-06:00`,end:`${day}T16:00:00-06:00`}];
  expect((await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1})).error).toBeNull();
  const account=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true}})).error).toBeNull();
  const ownerContext=await auth(owner),clientContext=await auth(client),post=(c:BrowserContext,path:string,data:unknown)=>c.request.post(baseURL!+path,{headers:{origin:baseURL!,'X-Pro-Expected-Actor':owner.id},data});
  expect((await post(ownerContext,'/api/pro/appointment-preferences',{enabled:true,revision:1,actionId:crypto.randomUUID()})).status()).toBe(200);
  const template=crypto.randomUUID();
  expect((await post(ownerContext,'/api/pro/task-templates',{action:'save',actionId:crypto.randomUUID(),templateId:template,revision:0,name:'Plan visita',notes:'',rows:[{id:crypto.randomUUID(),title:'Preparar visita',details:'',assignee:'',dueOffset:0}]})).status()).toBe(200);
  const created=await clientContext.request.post(baseURL!+api,{headers:{origin:baseURL!},data:{action:'create',id:crypto.randomUUID(),actionId:crypto.randomUUID(),professionalId:professional.data!.id,service:'Visita con plan',durationMinutes:60,locationKind:'agree',locationText:'',note:'',start:`${day}T10:00:00-06:00`,preferredDay:null,preference:''}});
  expect(created.status()).toBe(200);const receipt=await created.json();
  const plans='/api/pro/lead-plans',attach={action:'attach',actionId:crypto.randomUUID(),leadId:receipt.id,kind:'tasks',templateId:template,startDate:day,calendar:true};
  const one=await post(ownerContext,plans,attach);expect(one.status()).toBe(200);expect(await one.json()).toMatchObject({status:'pending',calendar:true,kind:'tasks'});
  const read=async()=>(await (await ownerContext.request.get(baseURL!+plans+'?leadId='+receipt.id,{headers:{origin:baseURL!,'X-Pro-Expected-Actor':owner.id}})).json());
  expect((await read()).converted).toBe(false);
  expect((await db.from('pro_work_tasks').select('id').eq('owner_id',owner.id)).data).toHaveLength(0);
  expect((await post(ownerContext,api,{action:'confirm',id:receipt.id,revision:receipt.revision,actionId:crypto.randomUUID()})).status()).toBe(200);
  const state=await read();expect(state.converted).toBe(true);expect(state.items.map((i:{status:string})=>i.status)).toEqual(['applied']);
  const tasks=(await db.from('pro_work_tasks').select('title,work_id').eq('owner_id',owner.id).throwOnError()).data!;
  expect(tasks).toEqual([{title:'Preparar visita',work_id:receipt.id}]);
  expect((await post(ownerContext,plans,{...attach,actionId:crypto.randomUUID()})).status()).toBe(409);
 }finally{for(const c of contexts)await c.close();await db.from('professionals').delete().eq('profile_id',owner.id);await cleanupDisposableAccount(client);await cleanupDisposableAccount(owner);}
});
