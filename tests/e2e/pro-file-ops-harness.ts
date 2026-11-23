import {expect,type BrowserContext,type Page} from 'playwright/test';
import {createHash} from 'node:crypto';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';

/** Shared setup of the file-operations specs (rows 28 to 31): a Pro owner with one job, a login helper and storage cleanup. */
export const origin='http://127.0.0.1:3185';
export const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export const pdf=(text:string)=>Buffer.from(`%PDF-1.4\n% ${text}\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n`,'latin1');
export async function loginAs(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});expect((await auth.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();}
export async function proOwner(page:Page,prefix:string){
 const db=regressionAdminClient(),owner=await createDisposableAccount({prefix});
 const user=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...user.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
 await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
 await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Biblioteca local',slug:prefix+'-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).throwOnError();
 const workId=crypto.randomUUID(),clientId=prefix+'-client',day=crTodayISO(),document=emptyBusiness();
 document.clients=[{id:clientId,name:'Cliente biblioteca',email:'',phone:'',notes:'',archived:false}];
 document.work=[{id:workId,clientId,client:'Cliente biblioteca',service:'Obra de archivos',stage:'scheduled',start:day+'T09:00:00-06:00',end:day+'T10:00:00-06:00',cancelled:false}];
 await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await loginAs(page.context(),owner);
 for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await page.request.get(endpoint,{timeout:45000})).status()).toBe(200);
 expect((await page.request.get('/api/pro/client-operations?'+new URLSearchParams({workId,clientId}),{timeout:45000})).status()).toBe(200);
 const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id};
 const post=async(url:string,data:Record<string,unknown>,status=200)=>{const r=await page.request.post(url,{headers,data,timeout:60000});expect(r.status(),JSON.stringify(data).slice(0,160)).toBe(status);return status===200?await r.json():null;};
 const cleanStorage=async()=>{for(const [table,bucket] of [['pro_company_files','pro-company-files'],['pro_work_files','pro-work-files']] as const){const paths=(await db.from(table).select('object_path').eq('owner_id',owner.id).throwOnError()).data!.map(row=>row.object_path as string);if(paths.length)expect((await db.storage.from(bucket).remove(paths)).error).toBeNull();}};
 return{db,owner,workId,clientId,headers,post,cleanStorage,cleanup:async()=>{await cleanStorage().catch(()=>{});await cleanupDisposableAccount(owner);}};
}
