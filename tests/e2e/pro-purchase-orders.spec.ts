import {test,expect,type BrowserContext} from 'playwright/test';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {proMoney} from '../../src/lib/pro/money';
import {gotoOK,expectNoHorizontalOverflow,onAppPageError} from './helpers';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';
import type {PurchaseOrder,PurchaseOrderBudget,PurchaseOrderDetail,PurchaseOrderList} from '../../src/lib/pro/purchase-orders';

// Families 51/52/54: purchase orders per project, receipts, manual payments and budget commitments.
const origin='http://127.0.0.1:3185',api='/api/pro/purchase-orders';
function local(baseURL:string|undefined){expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');}
async function login(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});const result=await auth.auth.signInWithPassword({email:actor.email,password:actor.password});expect(result.error).toBeNull();}
const shiftDay=(iso:string,days:number)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
let specEnglish=false;const money=(cents:number)=>proMoney(cents/100,specEnglish);

async function makePro(db:ReturnType<typeof regressionAdminClient>,account:DisposableAccount,slug:string){
 const user=await db.auth.admin.getUserById(account.id);expect((await db.auth.admin.updateUserById(account.id,{user_metadata:{...user.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
 await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',account.id).throwOnError();await db.from('pro_memberships').insert({user_id:account.id,status:'active'}).throwOnError();
 await db.from('professionals').insert({profile_id:account.id,category_id:'desarrollo_web',business_name:'Órdenes de compra local',slug:slug+'-'+account.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).throwOnError();
}

async function fixture(context:BrowserContext){
 const owner=await createDisposableAccount({prefix:'po-owner'}),db=regressionAdminClient();let rival:DisposableAccount|undefined;
 try{
  rival=await createDisposableAccount({prefix:'po-rival'});await makePro(db,owner,'po');await makePro(db,rival,'po-rival');
  const workId=crypto.randomUUID(),uiWorkId=crypto.randomUUID(),day=crTodayISO(),clientId='private-po-'+owner.id.slice(0,8),document=emptyBusiness();
  document.clients=[{id:clientId,name:'Cliente compras local',email:'',phone:'',notes:'',archived:false}];
  document.work=[
   {id:workId,clientId,client:'Cliente compras local',service:'Remodelación de cocina',stage:'scheduled',start:day+'T11:00:00-06:00',end:day+'T12:00:00-06:00',cancelled:false},
   {id:uiWorkId,clientId,client:'Cliente compras local',service:'Baño principal',stage:'scheduled',start:day+'T14:00:00-06:00',end:day+'T15:00:00-06:00',cancelled:false},
  ];
  await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await login(context,owner);
  for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await context.request.get(origin+endpoint,{timeout:45000})).status()).toBe(200);
  for(const id of [workId,uiWorkId])expect((await context.request.get(origin+'/api/pro/client-operations?'+new URLSearchParams({workId:id,clientId}),{timeout:45000})).status()).toBe(200);
  return {owner,rival,db,workId,uiWorkId,clientId};
 }catch(error){await cleanupDisposableAccount(owner);if(rival)await cleanupDisposableAccount(rival);throw error;}
}

type Line={id:string;description:string;quantity:number;unit:string;unitCents:number;taxRate:number;budgetCodeId:string|null;selectionOptionId:string|null;allowanceId:string|null};
const line=(fields:Partial<Line>={}):Line=>({id:crypto.randomUUID(),description:'Cemento gris',quantity:1,unit:'saco',unitCents:100000,taxRate:0,budgetCodeId:null,selectionOptionId:null,allowanceId:null,...fields});

for(const language of ['es','en'] as const)test(`Purchase orders: numbering, lines, tax, receipts, payments, budget commitments and UI [${language}]`,async({page,browser,baseURL},info)=>{
 test.setTimeout(420000);local(baseURL);const en=language==='en';specEnglish=en;const f=await fixture(page.context()),{owner,rival,db,workId,uiWorkId,clientId}=f;let other:BrowserContext|undefined;
 try{
  const runtime:string[]=[];onAppPageError(page,message=>runtime.push(message));
  const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id};
  const get=async(query:Record<string,string>,status=200)=>{const r=await page.request.get(api+'?'+new URLSearchParams(query),{headers:{'X-Pro-Expected-Actor':owner.id}});expect(r.status(),JSON.stringify(query)).toBe(status);return status===200?await r.json():null;};
  const list=async(query:Record<string,string>={},id=workId)=>await get({workId:id,...query}) as PurchaseOrderList;
  const detail=async(id:string,work=workId)=>await get({workId:work,view:'detail',id}) as Extract<PurchaseOrderDetail,{history:unknown}>;
  const budget=async(work=workId)=>await get({workId:work,view:'budget'}) as PurchaseOrderBudget;
  const post=async(data:Record<string,unknown>,status=200)=>{const r=await page.request.post(api,{headers,data});expect(r.status(),JSON.stringify(data).slice(0,400)).toBe(status);return status===200?(await r.json()).order as PurchaseOrder:null;};
  // Bulk setup straight through the RPC (same validation, no route rate limit).
  const rpc=async(input:Record<string,unknown>)=>{const r=await db.rpc('pro_purchase_orders_mutate',{p_actor:owner.id,p_input:input});expect(r.error).toBeNull();return (r.data as {order:PurchaseOrder}).order;};
  const today=crTodayISO(),yesterday=shiftDay(today,-1),lastWeek=shiftDay(today,-7);

  // ---- References: a saved supplier (expenses), a budget item, a time cost, an allowance and an approved selection option ----
  const expenses=await (await page.request.get('/api/pro/expenses?kind=expenses')).json();
  const supplierId=crypto.randomUUID();
  expect((await page.request.post('/api/pro/expenses',{headers,data:{actionId:crypto.randomUUID(),revision:expenses.revision,action:'supplier',id:supplierId,name:'Ferretería Central',identification:'3-101-000000',email:'ventas@ejemplo.test',phone:'2222-0000',archived:false}})).status()).toBe(200);
  const budgetOverview=async()=>await (await page.request.get('/api/pro/work-budget?'+new URLSearchParams({view:'overview',workId}))).json();
  const codeA=crypto.randomUUID(),codeB=crypto.randomUUID();
  for(const [id,code,title,plannedCents] of [[codeA,'01.10','Materiales',5000000],[codeB,'01.20','Acabados',100000]] as const){
   const o=await budgetOverview();expect((await page.request.post('/api/pro/work-budget',{headers,data:{actionId:crypto.randomUUID(),workId,clientId:o.work.clientId,revision:o.revision,action:'save_item',id,code,title,parentId:null,plannedCents}})).status()).toBe(200);
  }
  const addTime=async(minutes:number)=>{const costs=await (await page.request.get('/api/pro/work-costs?'+new URLSearchParams({clientId,workId}))).json();expect((await page.request.post('/api/pro/work-costs',{headers,data:{requestId:crypto.randomUUID(),clientId,workId,revision:costs.revision,action:'add_time',date:today,minutes,hourlyCostCents:1000000,note:'Instalación'}})).status()).toBe(200);};
  const assignAll=async()=>{const page1=await (await page.request.get('/api/pro/work-budget?'+new URLSearchParams({view:'costs',workId,codeId:'unassigned'}))).json();for(const source of page1.items){const o=await budgetOverview();expect((await page.request.post('/api/pro/work-budget',{headers,data:{actionId:crypto.randomUUID(),workId,clientId:o.work.clientId,revision:o.revision,action:'assign',source:{kind:source.kind,id:source.id,fingerprint:source.fingerprint},codeId:codeA}})).status()).toBe(200);}};
  await addTime(60);await assignAll();
  const allowanceId=crypto.randomUUID();
  expect((await page.request.post('/api/pro/allowances',{headers,data:{action:'create',actionId:crypto.randomUUID(),workId,id:allowanceId,name:'Grifería',category:null,plannedCents:15000000,dueDate:null,notes:null}})).status()).toBe(200);
  const areaId=crypto.randomUUID(),itemId=crypto.randomUUID(),optionId=crypto.randomUUID(),openItemId=crypto.randomUUID(),openOptionId=crypto.randomUUID();
  await db.from('pro_work_selection_areas').insert({owner_id:owner.id,id:areaId,work_id:workId,name:'Cocina'}).throwOnError();
  await db.from('pro_work_selection_items').insert([{owner_id:owner.id,id:itemId,work_id:workId,area_id:areaId,name:'Fregadero'},{owner_id:owner.id,id:openItemId,work_id:workId,area_id:areaId,name:'Lámpara'}]).throwOnError();
  await db.from('pro_work_selection_options').insert([{owner_id:owner.id,id:optionId,work_id:workId,item_id:itemId,name:'Fregadero doble acero',quantity:1,unit_cents:12000000},{owner_id:owner.id,id:openOptionId,work_id:workId,item_id:openItemId,name:'Lámpara colgante',quantity:1,unit_cents:3000000}]).throwOnError();
  await db.from('pro_work_selection_items').update({status:'approved',approved_option_id:optionId,approved_at:new Date().toISOString()}).eq('owner_id',owner.id).eq('id',itemId).throwOnError();

  // ---- API: empty list and query validation ----
  const empty=await list();expect(empty).toMatchObject({workId,canWrite:true,today,items:[],nextCursor:null,nextNumber:1,totals:{count:0,totalCents:0,paidCents:0,balanceCents:0,overdueCount:0}});
  expect(empty.references.suppliers.map(s=>s.name)).toEqual(['Ferretería Central']);expect(empty.references.budgetCodes.map(c=>c.code)).toEqual(['01.10','01.20']);
  expect(empty.references.selectionOptions.map(o=>o.id)).toEqual([optionId]);expect(empty.references.allowances.map(a=>a.id)).toEqual([allowanceId]);
  await get({},400);await get({workId,status:'nope'},400);await get({workId,from:today,to:yesterday},400);await get({workId,view:'detail'},400);await get({workId,extra:'1'},400);
  expect((await page.request.get(api+'?workId='+workId+'&workId='+workId)).status()).toBe(400);
  await get({workId:'no-such-work'},404);

  // ---- API: body validation (400) ----
  const base={action:'create',actionId:crypto.randomUUID(),workId,id:crypto.randomUUID(),supplierId,supplierName:null,supplierContact:'Laura · 8888-0000',title:'Materiales de obra gris',issueDate:lastWeek,expectedDate:yesterday,notes:'Entregar por la mañana',
   lines:[line({description:'Cemento gris',quantity:2.5,unit:'saco',unitCents:199999,taxRate:13}),line({description:'Varilla #3',quantity:3,unit:'m²',unitCents:1000000,taxRate:0,budgetCodeId:codeA}),line({description:'Clavos',quantity:1,unit:'caja',unitCents:50,taxRate:13,selectionOptionId:optionId})]};
  for(const bad of [{...base,extra:true},{...base,title:'  '},{...base,lines:[]},{...base,expectedDate:shiftDay(lastWeek,-1)},{...base,issueDate:'2026-02-30'},{...base,supplierName:'Otro'},{...base,supplierId:null,supplierName:null},
   {...base,lines:[line({quantity:0})]},{...base,lines:[line({quantity:1.0005})]},{...base,lines:[line({taxRate:101})]},{...base,lines:[line({taxRate:13.555})]},{...base,lines:[line({unitCents:10.5})]},
   {...base,lines:[line({selectionOptionId:optionId,allowanceId})]},{...base,lines:[line({budgetCodeId:crypto.randomUUID()})]},{...base,lines:[line({selectionOptionId:openOptionId})]},{...base,lines:[line({allowanceId:crypto.randomUUID()})]},
   {...base,lines:[line({quantity:1000000,unitCents:10000000000})]}])await post(bad,400);
  expect((await page.request.post(api,{headers:{'X-Pro-Expected-Actor':owner.id},data:base})).status()).toBe(403);

  // ---- API: create, tax rounding and idempotent replay ----
  const first=await post(base);
  // Per line: subtotal=round(q×unit), tax=round(subtotal×rate/100). 2.5×199999=499997.5→499998; ×13%=64999.74→65000. 50×13%=6.5→7 (half away from zero).
  expect(first).toMatchObject({number:1,code:'OC-0001',status:'draft',supplierName:'Ferretería Central',supplierId,subtotalCents:499998+3000000+50,taxCents:65000+7,totalCents:3565055,paidCents:0,balanceCents:3565055,lineCount:3,revision:1,overdue:false});
  expect(first!.lines.map(l=>[l.subtotalCents,l.taxCents,l.totalCents])).toEqual([[499998,65000,564998],[3000000,0,3000000],[50,7,57]]);
  const replay=await page.request.post(api,{headers,data:base});expect(replay.status()).toBe(200);expect((await replay.json()).order).toEqual(first);
  await post({...base,title:'Otro título'},400);await post({...base,actionId:crypto.randomUUID()},409);

  // ---- API: numbering without gaps or duplicates under concurrent retries ----
  const drafts=[0,1,2,3].map(n=>({...base,actionId:crypto.randomUUID(),id:crypto.randomUUID(),supplierId:null,supplierName:n%2?'Maderas del Valle':'Vidrios Sol',supplierContact:null,title:'Pedido '+n,issueDate:today,expectedDate:null,notes:null,lines:[line({unitCents:500000,budgetCodeId:n===0?codeA:null})]}));
  const responses=await Promise.all(drafts.flatMap(d=>[page.request.post(api,{headers,data:d}),page.request.post(api,{headers,data:d})]));
  const numbers=await Promise.all(responses.map(async r=>{expect(r.status()).toBe(200);return (await r.json()).order.number as number;}));
  for(let i=0;i<numbers.length;i+=2)expect(numbers[i]).toBe(numbers[i+1]);
  expect(numbers.filter((_,i)=>i%2===0).toSorted((a,b)=>a-b)).toEqual([2,3,4,5]);
  const stored=(await db.from('pro_purchase_orders').select('number').eq('owner_id',owner.id).order('number').throwOnError()).data!.map(row=>row.number);expect(stored).toEqual([1,2,3,4,5]);
  expect((await db.from('pro_purchase_order_counters').select('last_number').eq('owner_id',owner.id).single().throwOnError()).data!.last_number).toBe(5);
  // A rejected create does not consume a number.
  await post({...base,actionId:crypto.randomUUID(),id:crypto.randomUUID(),lines:[line({budgetCodeId:crypto.randomUUID()})]},400);
  expect((await list()).nextNumber).toBe(6);

  // ---- API: optimistic revision, edit, no-op edit ----
  const edit={...base,action:'update',actionId:crypto.randomUUID(),id:first!.id,revision:2,title:'Materiales de obra gris y acero'};
  await post(edit,409);const edited=await post({...edit,actionId:crypto.randomUUID(),revision:1});expect(edited).toMatchObject({title:'Materiales de obra gris y acero',revision:2,number:1,totalCents:3565055});
  await post({...edit,actionId:crypto.randomUUID(),revision:2},400);

  // ---- API: issue, receipts by line, payments and balance ----
  await post({action:'receive',actionId:crypto.randomUUID(),workId,id:first!.id,revision:2,receivedOn:today,note:null,entries:[{lineId:first!.lines[0].id,quantity:1}]},400);// draft
  await post({action:'pay',actionId:crypto.randomUUID(),workId,id:first!.id,revision:2,amountCents:100,paidOn:today,method:'cash',reference:null,note:null},400);// draft
  const issued=await post({action:'issue',actionId:crypto.randomUUID(),workId,id:first!.id,revision:2});expect(issued).toMatchObject({status:'issued',overdue:true});
  await post({action:'issue',actionId:crypto.randomUUID(),workId,id:first!.id,revision:3},400);
  await post({...edit,actionId:crypto.randomUUID(),revision:3,title:'Editada tras emitir'});// issued without receipts can still be corrected
  const [l1,l2,l3]=first!.lines;
  const receive=(revision:number,entries:Array<{lineId:string;quantity:number}>,receivedOn=today)=>({action:'receive',actionId:crypto.randomUUID(),workId,id:first!.id,revision,receivedOn,note:null,entries});
  await post(receive(4,[{lineId:l1.id,quantity:3}]),400);// more than ordered
  await post(receive(4,[{lineId:l1.id,quantity:1}],shiftDay(today,1)),400);// future (Costa Rica day)
  await post(receive(4,[{lineId:l1.id,quantity:1}],shiftDay(lastWeek,-1)),400);// before issue date
  await post(receive(4,[{lineId:crypto.randomUUID(),quantity:1}]),400);
  const partial=await post(receive(4,[{lineId:l1.id,quantity:1.5},{lineId:l2.id,quantity:3}]));expect(partial).toMatchObject({status:'partial',overdue:true});
  expect(partial!.lines.map(l=>l.receivedQuantity)).toEqual([1.5,3,0]);
  await post({...edit,actionId:crypto.randomUUID(),revision:5,title:'Ya no se puede'},400);// receipts lock the lines
  await post({action:'pay',actionId:crypto.randomUUID(),workId,id:first!.id,revision:5,amountCents:3565056,paidOn:today,method:'transfer',reference:null,note:null},400);// above balance
  const payment={action:'pay',actionId:crypto.randomUUID(),workId,id:first!.id,revision:5,amountCents:1000000,paidOn:yesterday,method:'transfer',reference:'TRX-1',note:null};
  const paid=await post(payment);expect(paid).toMatchObject({paidCents:1000000,balanceCents:2565055,revision:6});
  expect(await post(payment)).toEqual(paid);// idempotent replay, paid once
  await post({action:'cancel',actionId:crypto.randomUUID(),workId,id:first!.id,revision:6,reason:null},400);// payments must be reversed first
  const reversed=await post({action:'reverse_payment',actionId:crypto.randomUUID(),workId,id:first!.id,revision:6,paymentId:payment.actionId,note:'Registrado dos veces'});
  expect(reversed).toMatchObject({paidCents:0,balanceCents:3565055});expect(reversed!.payments.map(p=>[p.kind,p.reversed])).toEqual([['payment',true],['reverse',false]]);
  await post({action:'reverse_payment',actionId:crypto.randomUUID(),workId,id:first!.id,revision:7,paymentId:payment.actionId,note:'Otra vez'},400);
  const received=await post(receive(7,[{lineId:l1.id,quantity:1},{lineId:l3.id,quantity:1}]));expect(received).toMatchObject({status:'received',overdue:false});
  await post(receive(8,[{lineId:l1.id,quantity:0.001}]),400);
  const settled=await post({action:'pay',actionId:crypto.randomUUID(),workId,id:first!.id,revision:8,amountCents:3565055,paidOn:today,method:'sinpe',reference:'SINPE-77',note:null});expect(settled).toMatchObject({paidCents:3565055,balanceCents:0});
  await post({action:'pay',actionId:crypto.randomUUID(),workId,id:first!.id,revision:9,amountCents:1,paidOn:today,method:'cash',reference:null,note:null},400);
  await post({action:'cancel',actionId:crypto.randomUUID(),workId,id:first!.id,revision:9,reason:null},400);// received orders stay
  const firstDetail=await detail(first!.id);
  expect(firstDetail.history.map(entry=>entry.action)).toEqual(['pay','receive','reverse_payment','pay','receive','update','issue','update','create']);
  expect(firstDetail.order.receipts).toHaveLength(4);
  for(const table of ['pro_purchase_order_history','pro_purchase_order_payments','pro_purchase_order_receipts']){
   const rewrite=await db.from(table).update({owner_id:owner.id}).eq('owner_id',owner.id).eq('order_id',first!.id);expect(rewrite.error?.message,table).toContain('immutable');
  }

  // ---- API: a cancelled order leaves the committed amount; budget per code without double counting ----
  const orders=(await list()).items,pedido0=orders.find(o=>o.title==='Pedido 0')!;
  const cancelled=await post({action:'cancel',actionId:crypto.randomUUID(),workId,id:pedido0.id,revision:1,reason:'Proveedor sin existencias'});expect(cancelled).toMatchObject({status:'cancelled'});
  let b=await budget();const rowA=()=>b.rows.find(row=>row.code==='01.10')!,rowB=()=>b.rows.find(row=>row.code==='01.20')!;
  expect(rowA()).toMatchObject({plannedCents:5000000,committedCents:3000000,actualCents:1000000,projectedCents:3000000,varianceCents:2000000});
  expect(rowB()).toMatchObject({plannedCents:100000,committedCents:0,actualCents:0,varianceCents:100000});
  // The real cost of the same purchase is recorded later: projected = greatest(committed, actual), never the sum.
  await addTime(180);await assignAll();b=await budget();
  expect(rowA()).toMatchObject({committedCents:3000000,actualCents:4000000,projectedCents:4000000,varianceCents:1000000});
  expect(b.totals).toMatchObject({plannedCents:5100000,committedCents:3565055+1500000,actualCents:4000000,uncodedCommittedCents:565055+1500000,unassignedActualCents:0,projectedCents:4000000+2065055,varianceCents:5100000-6065055});
  // The existing work-budget API is unchanged (no committed field mixed into actuals).
  expect((await budgetOverview()).summary).toMatchObject({plannedCents:5100000,actualCents:4000000,varianceCents:1100000});

  // ---- API: overdue uses the Costa Rica calendar day; filters ----
  const late=await rpc({...base,actionId:crypto.randomUUID(),id:crypto.randomUUID(),supplierId:null,supplierName:'Vidrios Sol',supplierContact:null,title:'Ventanas',issueDate:lastWeek,expectedDate:yesterday,notes:null,lines:[line({unitCents:700000})]});
  const onTime=await rpc({...base,actionId:crypto.randomUUID(),id:crypto.randomUUID(),supplierId:null,supplierName:'Vidrios Sol',supplierContact:null,title:'Espejos',issueDate:lastWeek,expectedDate:today,notes:null,lines:[line({unitCents:300000})]});
  for(const o of [late,onTime])await rpc({action:'issue',actionId:crypto.randomUUID(),workId,id:o.id,revision:1});
  let page1=await list({overdue:'1'});expect(page1.items.map(o=>o.title)).toEqual(['Ventanas']);expect(page1.totals).toMatchObject({count:1,totalCents:700000,overdueCount:1});
  expect((await list({status:'cancelled'})).items.map(o=>o.id)).toEqual([pedido0.id]);
  expect((await list({status:'cancelled'})).totals).toMatchObject({count:0,totalCents:0,cancelledCount:1});
  expect((await list({supplier:'vidrios sol'})).items.map(o=>o.title).toSorted()).toEqual(['Espejos','Pedido 0','Pedido 2','Ventanas']);
  expect((await list({from:today})).items.every(o=>o.issueDate>=today)).toBe(true);
  expect((await list({to:lastWeek})).items.map(o=>o.title).toSorted()).toEqual(['Editada tras emitir','Espejos','Ventanas']);
  expect((await list({status:'open'})).items.every(o=>['draft','issued','partial'].includes(o.status))).toBe(true);

  // ---- API: pagination of 20 with totals over the whole filtered set ----
  for(let n=0;n<20;n++)await rpc({...base,actionId:crypto.randomUUID(),id:crypto.randomUUID(),supplierId:null,supplierName:'Lote',supplierContact:null,title:'Lote '+n,issueDate:today,expectedDate:null,notes:null,lines:[line({unitCents:1000})]});
  page1=await list();expect(page1.items).toHaveLength(20);expect(page1.items[0].number).toBe(27);expect(page1.nextCursor).toBe(8);
  const page2=await list({after:'8'});expect(page2.items.map(o=>o.number)).toEqual([7,6,5,4,3,2,1]);expect(page2.nextCursor).toBeNull();
  expect(page2.totals).toEqual(page1.totals);expect(page1.totals).toMatchObject({count:26,cancelledCount:1,totalCents:3565055+1500000+1000000+20000,paidCents:3565055,overdueCount:1});

  // ---- API: isolation and print ----
  other=await browser.newContext({baseURL});await login(other,rival);
  const rivalHeaders={'X-Pro-Expected-Actor':rival.id};
  for(const query of [{workId},{workId,view:'detail',id:first!.id},{workId,view:'budget'}] as Record<string,string>[])expect((await other.request.get(origin+api+'?'+new URLSearchParams(query),{headers:rivalHeaders})).status()).toBe(404);
  expect((await other.request.post(origin+api,{headers:{Origin:origin,...rivalHeaders},data:{action:'issue',actionId:crypto.randomUUID(),workId,id:late.id,revision:2}})).status()).toBe(403);
  expect((await other.request.get(origin+'/api/pro/purchase-order-print?'+new URLSearchParams({workId,id:first!.id}))).status()).toBe(404);
  expect((await page.request.get(api+'?'+new URLSearchParams({workId}),{headers:rivalHeaders})).status()).toBe(403);
  expect((await page.request.get('/api/pro/purchase-order-print?'+new URLSearchParams({workId,id:'nope'}))).status()).toBe(400);
  const printed=await page.request.get('/api/pro/purchase-order-print?'+new URLSearchParams({workId,id:first!.id,lang:language}));expect(printed.status()).toBe(200);
  expect(printed.headers()['content-type']).toContain('text/html');const html=await printed.text();
  for(const text of ['OC-0001','Ferretería Central','Remodelación de cocina',en?'Purchase order':'Orden de compra','/brand/'])expect(html).toContain(text);
  expect(await db.from('notifications').select('id').eq('user_id',owner.id).then(r=>r.data)).toEqual([]);

  // ---- UI on a second, empty project ----
  const mobile=(page.viewportSize()?.width??1366)<1024;
  let failFirst=true;
  await page.route('**/api/pro/purchase-orders?**',async route=>{if(failFirst&&route.request().method()==='GET'&&!route.request().url().includes('view=')){failFirst=false;return route.fulfill({status:503,json:{error:'LOCAL failure'}});}return route.continue();});
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:uiWorkId,vistaTrabajo:'orders'}));
  const nav=page.getByRole('navigation',{name:en?'Job workspace':'Gestión del trabajo'});await expect(nav).toBeVisible({timeout:60000});
  const finance=nav.locator(`[data-job-workspace-group="${en?'Finance':'Finanzas'}"]`);
  await expect(finance.getByRole('button',{name:en?'Purchase orders':'Órdenes de compra',exact:true})).toHaveAttribute('aria-current','page');
  const loadError=page.locator('[data-purchase-orders-load-error]');await expect(loadError).toBeVisible({timeout:60000});
  await loadError.getByRole('button',{name:en?'Retry':'Reintentar'}).click();
  const view=page.locator('[data-purchase-orders]');await expect(view.locator('[data-purchase-orders-empty]')).toBeVisible();
  await expect(view.locator('[data-purchase-orders-empty]')).toContainText(en?'There are no purchase orders for this project yet.':'Todavía no hay órdenes de compra en este proyecto.');
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`po-empty-${language}.png`),fullPage:true});
  await view.getByRole('button',{name:en?'New purchase order':'Nueva orden de compra'}).click();
  const form=view.locator('[data-purchase-order-form="create"]');await expect(form).toBeVisible();
  const overview=nav.getByRole('button',{name:en?'Overview':'Resumen',exact:true});await expect(overview).toBeEnabled();
  await form.locator('[data-po-field="title"]').fill(en?'Bathroom tiles':'Porcelanato del baño');await expect(overview).toBeDisabled();
  await form.locator('[data-po-field="supplier"]').selectOption({label:'Ferretería Central'});await expect(form.locator('[data-po-field="supplierName"]')).toHaveCount(0);
  const l0=form.locator('[data-po-line="0"]');
  await l0.locator('[data-po-line-field="description"]').fill('Porcelanato 60x60');await l0.locator('[data-po-line-field="quantity"]').fill('12,5');
  await l0.locator('[data-po-line-field="unit"]').fill('m²');await l0.locator('[data-po-line-field="price"]').fill('8.500');await l0.locator('[data-po-line-field="tax"]').fill('13');
  await expect(l0.locator('[data-po-line-total]')).toContainText(money(12006250));
  await form.getByRole('button',{name:en?'Add line':'Agregar línea'}).click();
  const l1ui=form.locator('[data-po-line="1"]');
  await l1ui.locator('[data-po-line-field="description"]').fill(en?'Tile adhesive':'Pegamento');await l1ui.locator('[data-po-line-field="quantity"]').fill('4');
  await l1ui.locator('[data-po-line-field="unit"]').fill(en?'bag':'saco');await l1ui.locator('[data-po-line-field="price"]').fill('abc');
  await form.getByRole('button',{name:en?'Save purchase order':'Guardar orden de compra'}).click();
  await expect(view.locator('[data-purchase-order-error]')).toContainText(en?'valid cost':'costo válido');
  await l1ui.locator('[data-po-line-field="price"]').fill('6500');
  await expect(form.locator('[data-po-form-total]')).toContainText(money(14606250));
  if(!mobile)await page.screenshot({path:info.outputPath(`po-form-${language}.png`),fullPage:true});
  else{await form.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(`po-form-${language}-mobile.png`)});}
  await form.getByRole('button',{name:en?'Save purchase order':'Guardar orden de compra'}).click();
  await expect(view.getByRole('status').filter({hasText:en?'Purchase order saved.':'Orden de compra guardada.'})).toBeVisible();
  const card=view.locator('[data-purchase-order-detail="OC-0028"]');await expect(card).toBeVisible();
  await expect(card.locator('[data-po-status]').first()).toHaveAttribute('data-po-status','draft');await expect(overview).toBeEnabled();
  // Edit.
  await card.getByRole('button',{name:en?'Edit':'Editar',exact:true}).click();
  const editForm=view.locator('[data-purchase-order-form="edit"]');await expect(editForm.locator('[data-po-line="0"] [data-po-line-field="price"]')).toHaveValue('8500');await expect(editForm.locator('[data-po-line="0"] [data-po-line-field="quantity"]')).toHaveValue(en?'12.5':'12,5');
  await editForm.locator('[data-po-field="title"]').fill(en?'Bathroom tiles and adhesive':'Porcelanato y pegamento del baño');
  await editForm.getByRole('button',{name:en?'Save changes':'Guardar cambios'}).click();
  await expect(card).toContainText(en?'Bathroom tiles and adhesive':'Porcelanato y pegamento del baño');
  // Issue (manual record; nothing is sent).
  await card.getByRole('button',{name:en?'Mark as issued':'Marcar como emitida'}).click();
  const issueDialog=page.getByRole('dialog').last();await expect(issueDialog).toContainText(en?'ContrataCR does not send anything.':'ContrataCR no envía nada.');
  await issueDialog.getByRole('button',{name:en?'Mark as issued':'Marcar como emitida'}).click();
  await expect(card.locator('[data-po-status]').first()).toHaveAttribute('data-po-status','issued');
  // Partial delivery.
  await card.getByRole('button',{name:en?'Record delivery':'Registrar entrega'}).click();
  const receiveForm=card.locator('[data-po-receive-form]');await expect(receiveForm.locator('[data-po-receive-line="1"]')).toHaveValue(en?'12.5':'12,5');await expect(receiveForm.getByRole('textbox',{name:(en?'Received: ':'Recibido: ')+'Porcelanato 60x60',exact:true})).toHaveValue(en?'12.5':'12,5');
  // The suggested quantities are not a user change: opening the form alone keeps the job menu usable; editing blocks it.
  await expect(overview).toBeEnabled();
  await receiveForm.locator('[data-po-receive-line="1"]').fill('5');await receiveForm.locator('[data-po-receive-line="2"]').fill('0');await expect(overview).toBeDisabled();
  await receiveForm.getByRole('button',{name:en?'Save delivery':'Guardar entrega'}).click();
  await expect(card.locator('[data-po-status]').first()).toHaveAttribute('data-po-status','partial');
  await expect(card.locator('[data-po-detail-line="1"] [data-po-line-received]')).toContainText(en?'5 / 12.5':'5 / 12,5');
  // Manual payment.
  await card.getByRole('button',{name:en?'Record payment':'Registrar pago'}).click();
  const payForm=card.locator('[data-po-pay-form]');await expect(payForm).toContainText(en?'No money is moved.':'No se mueve dinero.');
  await payForm.locator('[data-po-pay-field="amount"]').fill('50000');await payForm.locator('[data-po-pay-field="method"]').selectOption('sinpe');await payForm.locator('[data-po-pay-field="reference"]').fill('SINPE-123');
  await payForm.getByRole('button',{name:en?'Save payment':'Guardar pago'}).click();
  await expect(card.locator('[data-po-total="detail-paid"]')).toContainText(money(5000000));
  await expect(card.locator('[data-po-total="detail-balance"]')).toContainText(money(9606250));
  await expect(card.locator('[data-po-payments]')).toContainText('SINPE-123');
  await expectNoHorizontalOverflow(page);
  await card.locator('header').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(`po-detail-top-${language}${mobile?'-mobile':''}.png`)});
  await card.locator('[data-po-payments]').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(`po-detail-${language}${mobile?'-mobile':''}.png`)});
  // Printable copy with the ContrataCR brand.
  const href=await card.locator('[data-po-print]').getAttribute('href');expect(href).toContain('/api/pro/purchase-order-print?');
  const printPage=await page.context().newPage();onAppPageError(printPage,message=>runtime.push(message));
  await gotoOK(printPage,href!);await expect(printPage.locator('[data-purchase-order-print]')).toContainText('OC-0028');
  await expect(printPage.locator('.brand img').first()).toBeVisible();await expect(printPage.locator('[data-purchase-order-print]')).toContainText(en?'Partially received':'Recibida en parte');
  await expectNoHorizontalOverflow(printPage);
  // Every column (including the tax one) stays inside the viewport: narrow screens stack each line as a labelled card.
  const clipped=await printPage.locator('tbody td').evaluateAll(cells=>cells.filter(cell=>{const box=cell.getBoundingClientRect();return box.right>document.documentElement.clientWidth+1||box.left<-1;}).length);expect(clipped).toBe(0);
  if(mobile){const tax=printPage.locator('tbody tr').first().locator('td').nth(4);await expect(tax).toHaveAttribute('data-label',en?'Tax':'Impuesto');expect(await tax.evaluate(node=>getComputedStyle(node,'::before').content)).toBe(en?'"Tax"':'"Impuesto"');await tax.scrollIntoViewIfNeeded();await expect(tax).toBeInViewport({ratio:1});}
  // Narrow screens never break words letter by letter (stacked cards on phones, table lane otherwise).
  for(const cell of [printPage.locator('tbody td').first(),printPage.locator('thead th').first()])expect(await cell.evaluate(node=>{const text=node.firstChild!,word=text.textContent!.split(' ')[0],range=document.createRange();range.setStart(text,0);range.setEnd(text,word.length);return range.getClientRects().length;})).toBe(1);
  await printPage.screenshot({path:info.outputPath(`po-print-${language}${mobile?'-mobile':''}.png`),fullPage:true});await printPage.close();
  // Back to the list: totals and filters.
  await card.getByRole('button',{name:en?'Back to the list':'Volver a la lista'}).click();
  const row=view.locator('[data-purchase-order="OC-0028"]');await expect(row).toBeVisible();await expect(row.locator('[data-po-status]')).toHaveAttribute('data-po-status','partial');
  await expect(view.locator('[data-po-total="total"]')).toContainText(money(14606250));await expect(view.locator('[data-po-total="paid"]')).toContainText(money(5000000));await expect(view.locator('[data-po-total="balance"]')).toContainText(money(9606250));
  // Round 2: on phones the filters are folded behind «Filtros».
  if(await view.locator('[data-po-filters-toggle]').isVisible()){await expect(view.locator('[data-po-filter="status"]')).toBeHidden();await view.locator('[data-po-filters-toggle]').click();}
  await view.locator('[data-po-filter="status"]').selectOption('received');await expect(view.locator('[data-purchase-orders-empty]')).toContainText(en?'No purchase orders match these filters.':'Ninguna orden de compra coincide con estos filtros.');
  await view.getByRole('button',{name:en?'Clear filters':'Quitar filtros'}).click();await expect(row).toBeVisible();
  await view.locator('[data-po-filter="supplier"]').selectOption('Ferretería Central');await expect(row).toBeVisible();
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`po-list-${language}${mobile?'-mobile':''}.png`),fullPage:true});
  // Reload: persisted, with history.
  await page.reload();
  const reloaded=page.locator('[data-purchase-orders]');await expect(reloaded.locator('[data-purchase-order="OC-0028"]')).toBeVisible({timeout:60000});
  await reloaded.locator('[data-purchase-order="OC-0028"]').getByRole('button',{name:en?'Open':'Abrir',exact:true}).click();
  const again=reloaded.locator('[data-purchase-order-detail="OC-0028"]');await expect(again.locator('[data-po-total="detail-paid"]')).toContainText(money(5000000));
  await again.locator('[data-po-history] summary').click();
  await expect(again.locator('[data-po-history-entry]')).toHaveCount(5);
  expect(await again.locator('[data-po-history-entry]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-po-history-entry')))).toEqual(['pay','receive','issue','update','create']);
  await again.getByRole('button',{name:en?'Back to the list':'Volver a la lista'}).click();
  // Budget tab.
  await reloaded.locator('[data-purchase-orders-tab="budget"]').click();await expect(reloaded.locator('[data-purchase-orders-tab="budget"]')).toHaveAttribute('aria-pressed','true');await expect(reloaded.locator('[data-purchase-orders-tab="orders"]')).toHaveAttribute('aria-pressed','false');await expect(reloaded.getByRole('tablist')).toHaveCount(0);
  await expect(reloaded.locator('[data-po-budget]')).toContainText(en?'Budget with commitments':'Presupuesto con compromisos');
  await expect(reloaded.locator('[data-po-budget-total="committed"]')).toContainText(money(14606250));await expect(reloaded.locator('[data-po-budget-empty]')).toBeVisible();
  await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`po-budget-${language}${mobile?'-mobile':''}.png`),fullPage:true});
  // Budget with codes on the first project, inside the purchase orders view and inside the existing job budget.
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:workId,vistaTrabajo:'orders'}));
  const firstView=page.locator('[data-purchase-orders]');await expect(firstView.locator('[data-purchase-order]')).toHaveCount(20,{timeout:60000});
  await expect(firstView.locator('[data-purchase-order]').first()).toHaveAttribute('data-purchase-order','OC-0027');
  await firstView.getByRole('button',{name:en?'Next':'Siguiente',exact:true}).click();await expect(firstView.locator('[data-purchase-order]')).toHaveCount(7);
  await expect(firstView.locator('[data-purchase-order="OC-0001"] [data-po-status]')).toHaveAttribute('data-po-status','received');
  await expect(firstView.locator('[data-purchase-order="OC-0006"] [data-po-overdue]')).toBeVisible();
  await expect(firstView.locator(`[data-purchase-order="${cancelled!.code}"] [data-po-status]`)).toHaveAttribute('data-po-status','cancelled');
  await firstView.locator('[data-purchase-order-pages]').scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`po-page2-${language}${mobile?'-mobile':''}.png`)});
  await firstView.getByRole('button',{name:en?'Previous':'Anterior',exact:true}).click();await expect(firstView.locator('[data-purchase-order]')).toHaveCount(20);
  if(!await firstView.locator('[data-po-filter="overdue"]').isVisible())await firstView.locator('[data-po-filters-toggle]').click();
  await firstView.locator('[data-po-filter="overdue"]').check();await expect(firstView.locator('[data-purchase-order]')).toHaveCount(1);await expect(firstView.locator('[data-purchase-order="OC-0006"]')).toBeVisible();
  await expect(firstView.locator('[data-po-total="overdue"]')).toContainText('1');
  await firstView.locator('[data-purchase-orders-tab="budget"]').click();
  const budgetRow=firstView.locator('[data-po-budget-row="01.10"]');await expect(budgetRow.locator('[data-po-budget-committed]')).toContainText(money(3000000));
  await expect(budgetRow.locator('[data-po-budget-actual]')).toContainText(money(4000000));await expect(budgetRow.locator('[data-po-budget-variance]')).toContainText(money(1000000));
  await firstView.locator('[data-po-budget]').scrollIntoViewIfNeeded();await expectNoHorizontalOverflow(page);await page.screenshot({path:info.outputPath(`po-budget-codes-${language}${mobile?'-mobile':''}.png`)});
  await nav.getByRole('button',{name:en?'Costs & payments':'Costos y pagos',exact:true}).click();
  await page.locator('[data-work-budget-trigger]').click({timeout:60000});
  const budgetDialog=page.getByRole('dialog',{name:en?'Cost budget (CRC)':'Presupuesto de costos (CRC)',exact:true});
  const embedded=budgetDialog.locator('[data-po-budget-row="01.10"] [data-po-budget-committed]');await expect(embedded).toContainText(en?'₡30,000':'₡30.000',{timeout:60000});
  await budgetDialog.locator('[data-po-budget]').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(`work-budget-committed-${language}${mobile?'-mobile':''}.png`)});
  const uiOrder=(await list({},uiWorkId)).items[0];expect(uiOrder).toMatchObject({code:'OC-0028',status:'partial',totalCents:14606250,paidCents:5000000,balanceCents:9606250});
  // QA 2026-11-11 (pulido): a saved link that is no longer offered (archived allowance) is shown as such and never dropped silently.
  const goneAllowance=crypto.randomUUID();expect((await page.request.post('/api/pro/allowances',{headers,data:{action:'create',actionId:crypto.randomUUID(),workId,id:goneAllowance,name:'Partida que se archivará',category:null,plannedCents:100000,dueDate:null,notes:null}})).status()).toBe(200);
  const staleOrder=await rpc({...base,actionId:crypto.randomUUID(),id:crypto.randomUUID(),title:'Orden con vínculo viejo',lines:[line({allowanceId:goneAllowance})]});
  await db.from('pro_work_allowances').update({archived:true}).eq('owner_id',owner.id).eq('id',goneAllowance).throwOnError();
  await gotoOK(page,`/${language}/dashboard/pro?`+new URLSearchParams({tab:'pro_agenda',cita:workId,vistaTrabajo:'orders'}));
  const staleView=page.locator('[data-purchase-orders]');await staleView.locator(`[data-purchase-order="${staleOrder.code}"]`).getByRole('button',{name:en?'Open':'Abrir',exact:true}).click({timeout:60000});
  const staleCard=staleView.locator(`[data-purchase-order-detail="${staleOrder.code}"]`);await staleCard.getByRole('button',{name:en?'Edit':'Editar',exact:true}).click();
  const staleForm=staleView.locator('[data-purchase-order-form="edit"]'),staleSelect=staleForm.locator('[data-po-line="0"] [data-po-line-field="link"]');
  await expect(staleSelect).toHaveValue('alw:'+goneAllowance);await expect(staleSelect.locator('option:checked')).toHaveText(en?'Previous link (no longer available)':'Vínculo anterior (ya no disponible)');await expect(staleSelect).toHaveAttribute('aria-invalid','true');
  await expect(staleForm.locator('[data-po-stale-link]')).toHaveText(en?'The selection is no longer approved or the allowance was archived. Choose another link or “Nothing linked” before saving.':'La selección ya no está aprobada o el monto previsto se archivó. Elija otro vínculo o «Sin vínculo» antes de guardar.');
  let stalePosts=0;const countPosts=(request:import('playwright/test').Request)=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/pro/purchase-orders')stalePosts++;};page.on('request',countPosts);
  await staleForm.getByRole('button',{name:en?'Save changes':'Guardar cambios'}).click();
  await expect(staleView.locator('[data-purchase-order-error]')).toContainText(en?'A line keeps a link that is no longer available. Choose another link or “Nothing linked” and save again.':'Una línea conserva un vínculo que ya no está disponible. Elija otro vínculo o «Sin vínculo» y guarde de nuevo.');expect(stalePosts).toBe(0);
  await expectNoHorizontalOverflow(page);await staleForm.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(`po-stale-link-${language}${mobile?'-mobile':''}.png`)});
  await staleSelect.selectOption('');await expect(staleForm.locator('[data-po-stale-link]')).toHaveCount(0);await staleForm.getByRole('button',{name:en?'Save changes':'Guardar cambios'}).click();
  await expect(staleView.getByRole('status').filter({hasText:en?'Purchase order saved.':'Orden de compra guardada.'})).toBeVisible();page.off('request',countPosts);expect(stalePosts).toBe(1);
  expect((await db.from('pro_purchase_order_lines').select('allowance_id').eq('owner_id',owner.id).eq('order_id',staleOrder.id).throwOnError()).data).toEqual([{allowance_id:null}]);
  // Printable copy escapes every user field (no markup or script from titles, suppliers, notes or lines).
  const hostile='<img src=x onerror="alert(1)">\'&<script>alert(2)</script>';
  const xss=await rpc({...base,actionId:crypto.randomUUID(),id:crypto.randomUUID(),supplierId:null,supplierName:hostile.slice(0,60),supplierContact:hostile,title:hostile,issueDate:today,expectedDate:null,notes:hostile,lines:[line({description:hostile,unit:'<b>u</b>'})]});
  const xssHtml=await (await page.request.get('/api/pro/purchase-order-print?'+new URLSearchParams({workId,id:xss.id,lang:language}))).text();
  expect(xssHtml).not.toContain('<img src=x');expect(xssHtml).not.toContain('<script>alert');expect(xssHtml).not.toContain('<b>u</b>');
  expect(xssHtml).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&#39;&amp;&lt;script&gt;alert(2)&lt;/script&gt;');
  expect(xssHtml.match(/<script/g)).toHaveLength(1);expect(xssHtml).toContain(en?'Prepared by':'Preparada por');
  expect(runtime).toEqual([]);
 }finally{await other?.close();await cleanupDisposableAccount(f.owner);await cleanupDisposableAccount(f.rival);}
});
