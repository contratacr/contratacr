import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {createHmac} from 'node:crypto';

test('private identity API enforces real session, origin, membership, disabled and suspended accounts without external lookups',async({browser,baseURL})=>{
 test.setTimeout(120000);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const owner=await createDisposableAccount({prefix:'identity-private'}),basic=await createDisposableAccount({prefix:'identity-basic'}),db=regressionAdminClient(),contexts:BrowserContext[]=[];
 async function context(actor?:typeof owner){const ctx=await browser.newContext();contexts.push(ctx);if(actor){const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>{await ctx.addCookies(cookies.map(c=>({name:c.name,value:c.value,url:baseURL!,sameSite:'Lax' as const})));}}});expect((await auth.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();}return ctx;}
 const path='/api/pro/identity-lookup',headers={origin:new URL(baseURL!).origin},invalid={identification:'invalid-no-external-request',purpose:'client_billing'};
 try{
  const anon=await context();expect((await anon.request.post(path,{headers,data:invalid})).status()).toBe(401);
  const free=await context(basic);expect((await free.request.post(path,{headers,data:invalid})).status()).toBe(403);
  await db.from('profiles').update({is_provider:true}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
  await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Consulta privada local',slug:'identity-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending'}).throwOnError();
  const pro=await context(owner);
  expect((await pro.request.get(path)).status()).toBe(405);
  expect((await pro.request.post(path,{data:invalid})).status()).toBe(403);
  expect((await pro.request.post(path,{headers:{origin:'https://untrusted.invalid'},data:invalid})).status()).toBe(403);
  const accepted=await pro.request.post(path,{headers,data:invalid});expect(accepted.status()).toBe(400);expect(accepted.headers()['cache-control']).toContain('no-store');
  expect((await pro.request.post(path+'?identification=not-a-real-id',{headers,data:invalid})).status()).toBe(400);
  await db.from('pro_memberships').update({expires_at:'2020-01-01T00:00:00Z'}).eq('user_id',owner.id).throwOnError();expect((await pro.request.post(path,{headers,data:invalid})).status()).toBe(403);
  await db.from('pro_memberships').update({expires_at:null}).eq('user_id',owner.id).throwOnError();
  await db.from('profiles').update({is_disabled:true}).eq('id',owner.id).throwOnError();expect((await pro.request.post(path,{headers,data:invalid})).status()).toBe(403);
  await db.from('profiles').update({is_disabled:false}).eq('id',owner.id).throwOnError();
  await db.from('professionals').update({is_banned:true}).eq('profile_id',owner.id).throwOnError();expect((await pro.request.post(path,{headers,data:invalid})).status()).toBe(403);
  const token=createHmac('sha256',process.env.PRO_IDENTITY_RATE_LIMIT_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY!).update('account:'+owner.id).digest('hex');
  expect((await db.from('pro_identity_quota').select('key').eq('key','account:'+token).throwOnError()).data).toEqual([]);
 }finally{await Promise.all(contexts.map(ctx=>ctx.close()));await cleanupDisposableAccount(owner);await cleanupDisposableAccount(basic);}
});
