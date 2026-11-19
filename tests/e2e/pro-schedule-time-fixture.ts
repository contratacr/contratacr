import {expect,type BrowserContext,type Page} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import sharp from 'sharp';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';

// Shared fixture for pro-project-schedule and pro-time-tracking: disposable owner,
// linked customer, rival Pro, materialized jobs and confirmed requests. Local only.
export const origin='http://127.0.0.1:3185';
export const uuid=()=>crypto.randomUUID();
export const shiftDay=(iso:string,days:number)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
export function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
export async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}
type Db=ReturnType<typeof regressionAdminClient>;
async function makePro(db:Db,account:DisposableAccount,slug:string){
 const user=await db.auth.admin.getUserById(account.id);expect((await db.auth.admin.updateUserById(account.id,{user_metadata:{...user.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
 await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',account.id).throwOnError();await db.from('pro_memberships').insert({user_id:account.id,status:'active'}).throwOnError();
 return (await db.from('professionals').insert({profile_id:account.id,category_id:'desarrollo_web',business_name:'Cronograma local',slug:slug+'-'+account.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).select('id').single().throwOnError()).data!;
}
export type Fixture={owner:DisposableAccount;client:DisposableAccount;rival:DisposableAccount;db:Db;linkedClient:string;works:string[];requests:string[];cleanup:()=>Promise<void>};
/** Owner with `count` materialized jobs, each with a confirmed request of the linked customer. */
export async function fixture(context:BrowserContext,prefix:string,count=3):Promise<Fixture>{
 const owner=await createDisposableAccount({prefix:prefix+'-owner'}),db=regressionAdminClient();let client:DisposableAccount|undefined,rival:DisposableAccount|undefined;
 const cleanup=async()=>{await cleanupDisposableAccount(owner);if(client)await cleanupDisposableAccount(client);if(rival)await cleanupDisposableAccount(rival);};
 try{
  client=await createDisposableAccount({prefix:prefix+'-client'});rival=await createDisposableAccount({prefix:prefix+'-rival'});
  const professional=await makePro(db,owner,prefix);await makePro(db,rival,prefix+'-rival');
  const day=crTodayISO(),linkedClient='reservation-'+client.id,document=emptyBusiness(),works=Array.from({length:count},()=>uuid()),requests=works.map(()=>uuid());
  const services=['Remodelación de cocina','Baño principal','Terraza techada','Pintura exterior'];
  document.clients=[{id:linkedClient,name:'Cliente cronograma local',email:'',phone:'',notes:'',archived:false}];
  document.work=works.map((id,i)=>({id,clientId:linkedClient,client:'Cliente cronograma local',service:services[i%services.length],stage:'scheduled',start:day+'T1'+i+':00:00-06:00',end:day+'T1'+i+':30:00-06:00',cancelled:false,bookingClientId:client!.id}));
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(context,owner);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  for(const id of works)expect((await context.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({workId:id,clientId:linkedClient}),{timeout:45000})).status()).toBe(200);
  for(let i=0;i<works.length;i++){
   await db.from('pro_appointment_requests').insert({id:requests[i],professional_id:professional.id,owner_id:owner.id,client_user_id:client.id,client_name:'Cliente cronograma local',professional_name:'Cronograma local',professional_slug:prefix+'-'+owner.id,service:services[i%services.length],duration_minutes:60,location_kind:'agree',location_text:'',note:'',requested_start:day+'T1'+i+':00:00-06:00',status:'confirmed',revision:0,work_id:works[i]}).throwOnError();
   await db.from('pro_appointment_events').insert({request_id:requests[i],actor_id:owner.id,side:'provider',action:'confirm',note:'',status:'confirmed'}).throwOnError();
  }
  return {owner,client,rival,db,linkedClient,works,requests,cleanup};
 }catch(error){await cleanup();throw error;}
}
export async function uploadPhoto(page:Page,owner:DisposableAccount,workId:string,name:string,color:string){
 const png=await sharp({create:{width:64,height:48,channels:3,background:color}}).png().toBuffer();const fileId=uuid();
 const r=await page.request.post(origin+'/api/pro/work-files',{headers:{Origin:origin,'X-Pro-Expected-Actor':owner.id},data:{action:'upload',workId,fileId,name,data:png.toString('base64')}});
 expect(r.status(),await r.text()).toBe(200);return fileId;
}
/** Turns customer-view sections on/off through the existing client-dashboard API. */
export async function setSections(page:Page,owner:DisposableAccount,workId:string,sections:Record<string,boolean>){
 const read=await page.request.get(origin+'/api/pro/client-dashboard?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(read.status()).toBe(200);const settings=(await read.json()).settings;
 const r=await page.request.post(origin+'/api/pro/client-dashboard',{headers:{Origin:origin,'X-Pro-Expected-Actor':owner.id},data:{workId,actionId:uuid(),revision:settings.revision,showUpdates:settings.showUpdates,showDailyLogs:settings.showDailyLogs,showFiles:settings.showFiles,welcomeText:settings.welcomeText,...sections}});
 expect(r.status(),await r.text()).toBe(200);return (await r.json()).settings;
}
