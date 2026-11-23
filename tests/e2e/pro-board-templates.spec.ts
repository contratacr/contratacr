import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';

// Row 61: the owner's own idea-board page templates (layout only, owner-only, CAS, limit of 50, idempotent by actionId).
// Written to run with playwright.pro-local.config.ts (local Supabase); it does not run without a database. The pure
// layout rules (drop photos/items, fresh ids, built-in kitchen/bathroom/living/palette starters) are covered by
// pro-board-templates-unit.spec.ts, which does run offline.
const origin='http://127.0.0.1:3185',api='/api/pro/mood-board-templates';
const uuid=()=>crypto.randomUUID();
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});expect((await auth.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();}
async function makePro(db:ReturnType<typeof regressionAdminClient>,account:DisposableAccount){
 const user=await db.auth.admin.getUserById(account.id);expect((await db.auth.admin.updateUserById(account.id,{user_metadata:{...user.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
 await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',account.id).throwOnError();await db.from('pro_memberships').insert({user_id:account.id,status:'active'}).throwOnError();
 await db.from('pro_workspaces').insert({user_id:account.id,document:emptyBusiness(),revision:1}).throwOnError();
}
type Template={id:string;name:string;pageFormat:string;background:string;elements:Array<{kind:string}>;revision:number};
const swatch=(label:string)=>({kind:'swatch',id:uuid(),x:100,y:100,w:1500,h:1500,rotation:0,color:'#008bb5',label});
const note=(text:string)=>({kind:'note',id:uuid(),x:2000,y:100,w:2500,h:1500,rotation:0,text});

for(const language of ['es','en'] as const)test(`Board templates: save, list, apply data, rename, archive, owner-only and limits [${language}]`,async({page,browser,baseURL})=>{
 test.setTimeout(240000);expect(baseURL).toBe(origin);const en=language==='en',db=regressionAdminClient();
 const owner=await createDisposableAccount({prefix:'tpl-owner'}),rival=await createDisposableAccount({prefix:'tpl-rival'});let other:BrowserContext|undefined;
 try{
  await makePro(db,owner);await makePro(db,rival);await login(page.context(),owner);
  const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  const list=async(request=page.request,actor=owner.id)=>{const r=await request.get(api,{headers:{'X-Pro-Expected-Actor':actor}});expect(r.status()).toBe(200);return (await r.json() as {items:Template[]}).items;};
  const post=async(data:Record<string,unknown>,status=200)=>{const r=await page.request.post(api,{headers,data});expect(r.status(),JSON.stringify(data).slice(0,200)).toBe(status);return status===200?await r.json() as {template:Template}:null;};
  expect(await list()).toEqual([]);
  expect((await page.request.get(api+'?x=1',{headers:{'X-Pro-Expected-Actor':owner.id}})).status()).toBe(400);
  expect((await page.request.get(api,{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).toBe(403);// account changed
  const id=uuid(),actionId=uuid(),create={action:'create',actionId,id,name:en?'  Living room  ':'  Sala  ',pageFormat:'wide',background:'#f7f9fc',elements:[swatch('Principal'),note(en?'Floor':'Piso')]};
  expect((await page.request.post(api,{headers:{'X-Pro-Expected-Actor':owner.id},data:create})).status()).toBe(403);// no same-origin header
  const created=(await post(create))!.template;expect(created).toMatchObject({name:en?'Living room':'Sala',pageFormat:'wide',background:'#f7f9fc',revision:1});expect(created.elements.map(e=>e.kind)).toEqual(['swatch','note']);
  // Replaying the same action returns the same template (no duplicate); the same actionId with other data is refused.
  expect((await post(create))!.template.id).toBe(id);expect(await list()).toHaveLength(1);
  await post({...create,name:'Otro'},400);
  // Strict validation: photos/items, repeated ids, bad color, unknown keys and a second template with the same name are refused.
  const bad=(extra:Record<string,unknown>)=>({action:'create',actionId:uuid(),id:uuid(),name:'Mala',pageFormat:'wide',background:'#ffffff',elements:[swatch('a')],...extra});
  await post(bad({elements:[{kind:'image',id:uuid(),x:0,y:0,w:300,h:300,rotation:0,fileId:uuid()}]}),400);
  const same=swatch('a');await post(bad({elements:[same,same]}),400);
  await post(bad({background:'red'}),400);await post(bad({extra:1}),400);await post(bad({name:'   '}),400);
  await post({...bad({}),name:en?'living ROOM':'sala'},409);
  // Rename with the current revision; a stale revision is a conflict.
  const renamed=(await post({action:'rename',actionId:uuid(),id,revision:1,name:en?'Living':'Estar'}))!.template;expect(renamed).toMatchObject({revision:2,name:en?'Living':'Estar'});
  await post({action:'rename',actionId:uuid(),id,revision:1,name:'Viejo'},409);
  // Owner-only: another professional sees nothing and cannot change it.
  other=await browser.newContext({baseURL});await login(other,rival);
  expect(await list(other.request,rival.id)).toEqual([]);
  expect((await other.request.post(api,{headers:{Origin:origin,'X-Pro-Expected-Actor':rival.id},data:{action:'archive',actionId:uuid(),id,revision:2}})).status()).toBe(400);
  // Archive frees the name and removes it from the list.
  await post({action:'archive',actionId:uuid(),id,revision:2});expect(await list()).toEqual([]);
  await post({action:'archive',actionId:uuid(),id,revision:3},400);
  // Limit of 50 active templates.
  for(let i=0;i<50;i++)await post({action:'create',actionId:uuid(),id:uuid(),name:`P${i}`,pageFormat:i%2?'a4':'wide',background:'#ffffff',elements:[swatch('x')]});
  await post({action:'create',actionId:uuid(),id:uuid(),name:'P50',pageFormat:'wide',background:'#ffffff',elements:[swatch('x')]},429);
  expect(await list()).toHaveLength(50);
 }finally{if(other)await other.close();await cleanupDisposableAccount(owner);await cleanupDisposableAccount(rival);}
});
