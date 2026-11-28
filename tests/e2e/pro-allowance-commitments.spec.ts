import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {proMoney} from '../../src/lib/pro/money';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import type {AllowanceDetail,AllowanceItem} from '../../src/lib/pro/allowances';

// Row 75 (batch F, migration 562): purchase-order commitments in the allowance reconciliation.
const origin='http://127.0.0.1:3185',api='/api/pro/allowances',poApi='/api/pro/purchase-orders';
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}

async function makePro(db:ReturnType<typeof regressionAdminClient>,account:DisposableAccount,slug:string){
 const user=await db.auth.admin.getUserById(account.id);expect((await db.auth.admin.updateUserById(account.id,{user_metadata:{...user.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
 await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',account.id).throwOnError();await db.from('pro_memberships').insert({user_id:account.id,status:'active'}).throwOnError();
 await db.from('professionals').insert({profile_id:account.id,category_id:'desarrollo_web',business_name:'Compromisos local',slug:slug+'-'+account.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).throwOnError();
}

async function fixture(context:BrowserContext){
 const owner=await createDisposableAccount({prefix:'commit-owner'}),db=regressionAdminClient();let rival:DisposableAccount|undefined;
 try{
  rival=await createDisposableAccount({prefix:'commit-rival'});await makePro(db,owner,'commit');await makePro(db,rival,'commit-rival');
  const workId=crypto.randomUUID(),day=crTodayISO(),clientId='private-commit-'+owner.id.slice(0,8),document=emptyBusiness();
  document.clients=[{id:clientId,name:'Cliente compromisos local',email:'',phone:'',notes:'',archived:false}];
  document.work=[{id:workId,clientId,client:'Cliente compromisos local',service:'Remodelación de cocina',stage:'scheduled',start:day+'T11:00:00-06:00',end:day+'T12:00:00-06:00',cancelled:false}];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(context,owner);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  expect((await context.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({workId,clientId}),{timeout:45000})).status()).toBe(200);
  return {owner,rival,db,workId};
 }catch(error){await cleanupDisposableAccount(owner);if(rival)await cleanupDisposableAccount(rival);throw error;}
}

type Line={id:string;description:string;quantity:number;unit:string;unitCents:number;taxRate:number;budgetCodeId:string|null;selectionOptionId:string|null;allowanceId:string|null};
const line=(fields:Partial<Line>):Line=>({id:crypto.randomUUID(),description:'Grifo',quantity:1,unit:'unidad',unitCents:100000,taxRate:0,budgetCodeId:null,selectionOptionId:null,allowanceId:null,...fields});

for(const language of ['es','en'] as const)test(`Allowance commitments: issued purchase orders against each allowance, drafts apart, cancelled never [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(300000);local(baseURL);const en=language==='en',money=(cents:number)=>proMoney(cents/100,en);
 const f=await fixture(page.context()),{owner,rival,db,workId}=f;let other:BrowserContext|undefined;
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id},today=crTodayISO();
  const read=async()=>{const r=await page.request.get(api+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(r.status()).toBe(200);return await r.json() as AllowanceDetail;};
  const allowance=async(data:Record<string,unknown>)=>{const r=await page.request.post(api,{headers,data});expect(r.status(),JSON.stringify(data)).toBe(200);return (await r.json()).item as AllowanceItem;};
  const po=async(data:Record<string,unknown>)=>{const r=await page.request.post(poApi,{headers,data});expect(r.status(),(await r.text()).slice(0,300)).toBe(200);return (await r.json()).order as {id:string;number:number;status:string;revision:number};};
  const order=(title:string,lines:Line[])=>({action:'create',actionId:crypto.randomUUID(),workId,id:crypto.randomUUID(),supplierId:null,supplierName:'Ferretería Central',supplierContact:null,title,issueDate:today,expectedDate:null,notes:null,lines});

  const faucet=await allowance({action:'create',actionId:crypto.randomUUID(),workId,id:crypto.randomUUID(),name:en?'Kitchen faucet':'Grifería de cocina',category:null,plannedCents:15000000,dueDate:null,notes:null});
  const tile=await allowance({action:'create',actionId:crypto.randomUUID(),workId,id:crypto.randomUUID(),name:en?'Floor tile':'Cerámica de piso',category:null,plannedCents:5000000,dueDate:null,notes:null});
  expect(await read()).toMatchObject({commitments:{},commitmentTotals:{committedCents:0,draftCents:0,receivedCents:0}});

  // A draft order is shown apart: not a commitment yet. 2 × ₡50.000 + 13 % = ₡113.000.
  const l1=line({description:'Grifo monomando',quantity:2,unitCents:5000000,taxRate:13,allowanceId:faucet.id});
  let first=await po(order('Grifería',[l1,line({description:'Silicona',unitCents:250000})]));expect(first.status).toBe('draft');
  let detail=await read();
  expect(detail.commitments[faucet.id]).toEqual({committedCents:0,draftCents:11300000,receivedCents:0,orders:[{id:first.id,number:first.number,status:'draft'}]});
  expect(detail.commitments[tile.id]).toBeUndefined();expect(detail.commitmentTotals).toEqual({committedCents:0,draftCents:11300000,receivedCents:0});

  // Issued: committed against the planned amount (₡150.000), ₡37.000 still uncommitted.
  first=await po({action:'issue',actionId:crypto.randomUUID(),workId,id:first.id,revision:first.revision});expect(first.status).toBe('issued');
  detail=await read();expect(detail.commitments[faucet.id]).toMatchObject({committedCents:11300000,draftCents:0,receivedCents:0,orders:[{status:'issued'}]});
  // Partial receipt: 1 of 2 units → half of the line total counts as received.
  first=await po({action:'receive',actionId:crypto.randomUUID(),workId,id:first.id,revision:first.revision,receivedOn:today,note:null,entries:[{lineId:l1.id,quantity:1}]});expect(first.status).toBe('partial');
  detail=await read();expect(detail.commitments[faucet.id]).toMatchObject({committedCents:11300000,receivedCents:5650000,orders:[{status:'partial'}]});

  // A second issued order for the same allowance goes over the planned amount.
  let second=await po(order('Accesorios',[line({description:'Desagüe',quantity:1,unitCents:4000000,allowanceId:faucet.id})]));
  second=await po({action:'issue',actionId:crypto.randomUUID(),workId,id:second.id,revision:second.revision});
  detail=await read();expect(detail.commitments[faucet.id]).toEqual({committedCents:15300000,draftCents:0,receivedCents:5650000,orders:[{id:first.id,number:first.number,status:'partial'},{id:second.id,number:second.number,status:'issued'}]});

  // A cancelled order never counts.
  let third=await po(order('Cerámica',[line({description:'Porcelanato 60x60',quantity:10,unitCents:400000,allowanceId:tile.id})]));
  third=await po({action:'issue',actionId:crypto.randomUUID(),workId,id:third.id,revision:third.revision});
  expect((await read()).commitments[tile.id]).toMatchObject({committedCents:4000000});
  await po({action:'cancel',actionId:crypto.randomUUID(),workId,id:third.id,revision:third.revision,reason:null});
  detail=await read();expect(detail.commitments[tile.id]).toBeUndefined();expect(detail.commitmentTotals).toEqual({committedCents:15300000,draftCents:0,receivedCents:5650000});
  // The item JSON and its history are unchanged by the read (no commitment keys inside items).
  expect(Object.keys(detail.items.find(item=>item.id===faucet.id)!)).not.toContain('commitment');

  // Once decided, the reference is the chosen total (₡160.000): the same orders fit again.
  await allowance({action:'decide',actionId:crypto.randomUUID(),workId,id:faucet.id,revision:faucet.revision,choiceDescription:en?'Brushed steel faucet':'Grifo acero cepillado',supplier:'Ferretería Central',quantity:1,actualCents:16000000});

  // Another account never reads them.
  other=await browser.newContext({baseURL});await login(other,rival);
  expect((await other.request.get(origin+api+'?'+new URLSearchParams({workId}),{headers:{'X-Pro-Expected-Actor':rival.id}})).status()).toBe(404);

  // ---- UI ----
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:workId,vistaTrabajo:'allowances'}));
  const view=page.locator('[data-allowances]');await expect(view).toBeVisible({timeout:60000});
  const card=view.locator(`[data-allowance-item="${faucet.id}"]`),box=card.locator('[data-allowance-commitment]');
  await expect(box).toHaveAttribute('data-allowance-commitment','within');
  await expect(box).toContainText(en?'Purchase orders':'Órdenes de compra');
  await expect(box.locator('[data-allowance-committed]')).toHaveText((en?'Committed in issued orders: ':'Comprometido en órdenes emitidas: ')+money(15300000));
  await expect(box.locator('[data-allowance-received]')).toHaveText((en?'Received so far: ':'Recibido hasta ahora: ')+money(5650000));
  await expect(box.locator('[data-allowance-commitment-state="within"]')).toHaveText(en?`Still uncommitted: ${money(700000)} of ${money(16000000)}`:`Sin comprometer: ${money(700000)} de ${money(16000000)}`);
  const code=(n:number)=>'OC-'+String(n).padStart(4,'0');
  await expect(box.locator('[data-allowance-order]')).toHaveText([`${code(first.number)} · ${en?'Partially received':'Recibida en parte'}`,`${code(second.number)} · ${en?'Issued':'Emitida'}`]);
  await expect(view.locator(`[data-allowance-item="${tile.id}"] [data-allowance-commitment]`)).toHaveCount(0);
  await expect(view.locator('[data-allowance-commitment-totals]')).toHaveText(en
   ?`Committed in issued purchase orders: ${money(15300000)} · In draft orders: ${money(0)} · Received: ${money(5650000)}`
   :`Comprometido en órdenes de compra emitidas: ${money(15300000)} · En órdenes en borrador: ${money(0)} · Recibido: ${money(5650000)}`);
  await box.scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`allowance-commitments-${language}.png`),fullPage:true});

  // Reopening goes back to the planned amount (₡150.000): the issued orders now exceed it by ₡3.000.
  const decided=(await read()).items.find(item=>item.id===faucet.id)!;
  await allowance({action:'reopen',actionId:crypto.randomUUID(),workId,id:faucet.id,revision:decided.revision});
  await page.reload();
  await expect(page.locator(`[data-allowance-item="${faucet.id}"] [data-allowance-commitment-state="over"]`)).toHaveText(en?`The issued orders exceed ${money(15000000)} by ${money(300000)}`:`Las órdenes emitidas superan ${money(15000000)} en ${money(300000)}`,{timeout:60000});
  await expectNoHorizontalOverflow(page);
  // Archived allowances leave the totals (like the allowance totals) but keep their figures.
  const reopened=(await read()).items.find(item=>item.id===faucet.id)!;
  await allowance({action:'archive',actionId:crypto.randomUUID(),workId,id:faucet.id,revision:reopened.revision});
  detail=await read();expect(detail.commitmentTotals).toEqual({committedCents:0,draftCents:0,receivedCents:0});expect(detail.commitments[faucet.id]).toMatchObject({committedCents:15300000});
  expect(runtime).toEqual([]);
 }finally{await other?.close();await cleanupDisposableAccount(owner);await cleanupDisposableAccount(rival);}
});
