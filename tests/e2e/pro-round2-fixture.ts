import {expect,type BrowserContext,type Page} from 'playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness,type Business} from '../../src/lib/pro/business';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';

// Round 2 (UX after the manual walkthrough, 2026-11-12): one disposable owner with an active Pro
// membership and a workspace document shaped by each spec. Loopback only.
// PRO_LOCAL_ORIGIN lets the same specs walk a local production build (next start) on another loopback port.
export const origin=process.env.PRO_LOCAL_ORIGIN??'http://127.0.0.1:3185';
/** Launch mirror with PRO_ENABLED=false (E2E_PRO_OFF=1): Pro routes answer 404, so setup only warms the generic auth routes. */
export const proOff=process.env.E2E_PRO_OFF==='1';
export function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
export async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}
const shots=process.env.ROUND2_SHOTS_DIR;
export async function shot(page:Page,name:string,project:string,fullPage=false){if(!shots)return;mkdirSync(shots,{recursive:true});await page.screenshot({path:join(shots,`${name}-${project}.png`),fullPage});}
export const headersFor=(owner:DisposableAccount)=>({Origin:origin,'X-Pro-Expected-Actor':owner.id});

export type Owner={owner:DisposableAccount;db:ReturnType<typeof regressionAdminClient>;workId:string;clientId:string;cleanup:()=>Promise<void>};
/** Owner with business «Remodelaciones <label>», one customer and one NEW unscheduled job. */
export async function ownerFixture(context:BrowserContext,label:string,shape?:(document:Business,ids:{workId:string;clientId:string})=>void):Promise<Owner>{
 const owner=await createDisposableAccount({prefix:'r2-owner'}),db=regressionAdminClient();
 try{
  const account=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...account.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
  await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Remodelaciones '+label,slug:'r2-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).throwOnError();
  const workId=crypto.randomUUID(),clientId='r2-client-'+label,document=emptyBusiness();
  document.clients=[{id:clientId,name:'Cliente ronda '+label,email:'cliente.'+label+'@example.test',phone:'',notes:'',archived:false}];
  document.work=[{id:workId,clientId,client:'Cliente ronda '+label,service:'Remodelación de cocina '+label,stage:'new',start:'',end:'',cancelled:false}];
  shape?.(document,{workId,clientId});
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(context,owner);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state',...(proOff?[]:['/api/pro/access'])])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  if(!proOff)expect((await context.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({workId,clientId}),{timeout:45000})).status()).toBe(200);
  return {owner,db,workId,clientId,cleanup:()=>cleanupDisposableAccount(owner)};
 }catch(error){await cleanupDisposableAccount(owner);throw error;}
}
export const isMobile=(page:Page)=>(page.viewportSize()?.width??1366)<640;
