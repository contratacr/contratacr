// LOCAL PRO ONLY (2026-11-19, round F1-A, register row 55): disposable in-memory PGlite verification of
// payables-cashflow-local.sql. Installs the whole ordered local manifest (same foundation stubs as
// verify-pro-work-activity-db.mjs), seeds expenses, a purchase order, an invoice draft, a payment, recorded hours and a
// payment plan through the real module writers, then checks accounts payable (status, aging by supplier, overdue,
// filters, bill record with receipts/CAS/history, payments delegated to the Expenses and Purchase-order writers, void
// and restore), the cash flow (actual vs expected, overdue placed on today, running balance, week/month periods) and the
// income statement (per period and per job, without IVA). Authorization (no Pro → 42501), grants (service_role only),
// read-only readers (source fingerprints) and idempotent reapply. No Supabase, network or shared database.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {localSqlManifest} from './local-sql-manifest.mjs';
const root=new URL('../../',import.meta.url),db=new PGlite();
const owner='00000000-0000-4000-8000-000000000001',outsider='00000000-0000-4000-8000-000000000004',customer='00000000-0000-4000-8000-000000000005';
const code=c=>e=>{assert.equal(e.code,c,`${c} expected, got ${e.code}: ${e.message}`);return true;};
const foundation=await readFile(new URL('scripts/pro/verify-direct-project-quotes-db.mjs',root),'utf8');
const begin=foundation.indexOf('await db.exec(`')+'await db.exec(`'.length,end=foundation.indexOf('`);',begin);
assert.ok(begin>14&&end>begin);const ddl=foundation.slice(begin,end);assert.ok(!ddl.includes('${'));
const crToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const addDays=(day,n)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
let checks=0;const ok=(value,message)=>{assert.ok(value,message);checks++;};const eq=(a,b,message)=>{assert.deepEqual(a,b,message);checks++;};
try{
 await db.exec(ddl);
 await db.exec(`create table auth.users(id uuid primary key);create function public.uuid_generate_v4() returns uuid language sql as $$select gen_random_uuid()$$;
 create function auth.role() returns text language sql as $$select current_user::text$$;
 create table projects(id uuid primary key,client_id uuid,title text,status text,allow_direct_contact boolean);
 create schema cron;create table cron.job(jobname text primary key,schedule text,command text);
 create function cron.schedule(p_name text,p_schedule text,p_command text) returns bigint language plpgsql as $$begin insert into cron.job values(p_name,p_schedule,p_command) on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command;return 1;end$$;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);alter table storage.objects enable row level security;
 insert into profiles(id,full_name,role,is_disabled,is_provider) values('${owner}','Dueña Activa','professional',false,true),('${outsider}','Cuenta Ajena','professional',false,true),('${customer}','Cliente Cuenta','client',false,false);`);
 const notifications=await readFile(new URL('supabase/migrations/002_sprint2.sql',root),'utf8');
 await db.exec(notifications.slice(notifications.indexOf('CREATE TABLE IF NOT EXISTS public.notifications'),notifications.indexOf('-- SAVED PROFESSIONALS')));
 const emptyDoc=clientId=>({version:1,clients:[{id:clientId,name:'Cliente flujo',email:'',phone:'',notes:'',archived:false}],products:[],movements:[],work:[],availability:[],quotes:[],quoteLinks:[],social:[]});
 let moduleSql='';
 for(const step of localSqlManifest){
  if(step.ifMissing&&(await db.query('select to_regclass($1) is not null present',[step.ifMissing])).rows[0].present)continue;
  let text=await readFile(new URL('docs/pro/sql/'+step.file,root),'utf8');
  if(step.file==='identity-lookup-maintenance-local.sql')text=text.replace('create extension if not exists pg_cron;','');
  if(step.file==='payables-cashflow-local.sql')moduleSql=text;
  try{await db.exec(text);}catch(error){throw new Error('Manifest SQL failed: '+step.file,{cause:error});}
  if(step.file==='memberships-draft.sql')for(const id of [owner,outsider])await db.query('select pro_save_workspace($1,$2,0)',[id,emptyDoc('flow-client')]);
 }
 ok(moduleSql,'payables-cashflow-local.sql must be in the manifest');
 for(const [id,profile] of [[owner,'30000000-0000-4000-8000-000000000001'],[outsider,'30000000-0000-4000-8000-000000000002']]){
  await db.query('insert into professionals(id,profile_id,business_name,slug,is_banned) values($1,$2,$3,$4,false)',[profile,id,'Empresa '+id.slice(-1),'flow-'+id.slice(-1)]);
  await db.query("insert into pro_memberships(user_id,status) values($1,'active')",[id]);
 }
 const today=crToday(),work='flow-work',client='flow-client';
 await db.query('insert into pro_work(user_id,id,client,service,stage,start,"end","clientId",cancelled) values($1,$2,$3,$4,$5,$6,$7,$8,false)',[owner,work,'Cliente flujo','Remodelación flujo','scheduled','','',client]);
 const one=async(sql,params)=>(await db.query(sql,params)).rows[0];
 const expRev=async()=>Number((await one('select coalesce((select revision from pro_expense_state where user_id=$1),0) r',[owner])).r);
 const saveExpense=async input=>(await one('select pro_expense_meta_save($1,$2) v',[owner,{actionId:crypto.randomUUID(),revision:await expRev(),...input}])).v;
 // Suppliers (expense suppliers = the Company › Vendors directory) and a subcontractor profile.
 const s1=crypto.randomUUID(),s2=crypto.randomUUID();
 await saveExpense({action:'supplier',id:s1,name:'Subcontratos Arias',identification:'',email:'',phone:'',archived:false});
 await saveExpense({action:'supplier',id:s2,name:'Ferretería Central',identification:'',email:'',phone:'',archived:false});
 await db.query("insert into pro_company_vendor_profiles(owner_id,supplier_id,kind,trade) values($1,$2,'subcontractor','Electricidad')",[owner,s1]);
 // E1: 40 days old, due 10 days ago, ₡1 130 with IVA 13 %, subcontract; linked to the job. E2: today, no due date.
 const e1=crypto.randomUUID(),e2=crypto.randomUUID();
 await saveExpense({action:'expense',id:e1,supplierId:s1,date:addDays(today,-40),dueDate:addDays(today,-10),currency:'CRC',concept:'Instalación eléctrica',amountCents:113000,vatRateBps:1300,category:'subcontract'});
 await saveExpense({action:'expense',id:e2,supplierId:s2,date:today,dueDate:null,currency:'CRC',concept:'Tornillería',amountCents:50000});
 const costRev=async()=>Number((await one('select coalesce((select revision from pro_work_cost_state where user_id=$1),0) r',[owner])).r);
 await db.query('select pro_work_costs_mutate($1,$2)',[owner,{action:'link_expense',clientId:client,workId:work,requestId:crypto.randomUUID(),revision:await costRev(),expenseId:e1,expenseRevision:await expRev()}]);
 // Recorded hours: 120 min at ₡50/h = ₡100 of internal cost.
 await db.query('select pro_work_costs_mutate($1,$2)',[owner,{action:'add_time',clientId:client,workId:work,requestId:crypto.randomUUID(),revision:await costRev(),date:today,minutes:120,hourlyCostCents:5000,note:'Mano de obra'}]);
 // Purchase order P1 (issued, supplier S1): 2 × ₡250 + 13 % = ₡565. P2 stays a draft.
 const po=async input=>(await one('select pro_purchase_orders_mutate($1,$2) v',[owner,{actionId:crypto.randomUUID(),workId:work,...input}])).v;
 const line=()=>({id:crypto.randomUUID(),description:'Cable THHN',quantity:2,unit:'rollo',unitCents:25000,taxRate:13,budgetCodeId:null,selectionOptionId:null,allowanceId:null});
 const p1=crypto.randomUUID(),p2=crypto.randomUUID();
 await po({action:'create',id:p1,supplierId:s1,supplierName:null,supplierContact:null,title:'Cableado cocina',issueDate:addDays(today,-3),expectedDate:null,notes:null,lines:[line()]});
 await po({action:'issue',id:p1,revision:1});
 await po({action:'create',id:p2,supplierId:null,supplierName:'Proveedor libre',supplierContact:null,title:'Borrador',issueDate:today,expectedDate:null,notes:null,lines:[line()]});
 // Receivables: invoice draft I1 created 10 days ago, ₡2 260 (IVA ₡260), credit 30 days; ₡260 received today.
 const i1=crypto.randomUUID(),pay=crypto.randomUUID();
 await db.query("insert into pro_invoice_drafts(user_id,id,client_id,source_kind,source_id,work_id,title,receiver_name,receiver_identification,receiver_email,receiver_phone,receiver_address,total_cents,tax_cents,material_count,material_cost,basis,source_fingerprint,created_at) values($1,$2,$3,'work',$4,$4,'Avance cocina','Cliente flujo','','','','',226000,26000,0,0,'manual',repeat('a',32),now()-interval '10 days')",[owner,i1,client,work]);
 await db.query("insert into pro_invoice_preparation(user_id,draft_id,issuer_name,issuer_id_type,issuer_id,issuer_email,issuer_phone,issuer_address,issuer_activity,planned_date,sale_condition,credit_days,payment_method,order_reference) values($1,$2,'','','','','','','',$3,'credit',30,'','')",[owner,i1,addDays(today,-10)]);
 await db.query("insert into pro_invoice_payments(user_id,id,client_id,work_id,amount_cents,received_on,method,reference) values($1,$2,$3,null,26000,$4,'sinpe','R-1')",[owner,pay,client,today]);
 await db.query('insert into pro_invoice_payment_applications(user_id,id,draft_id,payment_id,amount_cents) values($1,$2,$3,$4,26000)',[owner,crypto.randomUUID(),i1,pay]);
 // Payment plan: agreement then two weekly installments of ₡500, the first due tomorrow.
 const core=Number((await one('select revision from pro_workspace_core where user_id=$1',[owner])).revision);
 await db.query('select pro_record_client_operation($1,$2,$3)',[owner,{actionId:crypto.randomUUID(),clientId:client,workId:work,kind:'agreement',amountCents:1000000,note:'Acuerdo'},core]);
 await db.query('select pro_payment_plan_mutate($1,$2)',[owner,{action:'create',actionId:crypto.randomUUID(),workId:work,planId:crypto.randomUUID(),totalCents:100000,downPaymentCents:0,downPaymentDate:null,schedule:{mode:'auto',frequency:'weekly',count:2,firstDue:addDays(today,1)},feeCents:0,lateFeeCents:0,terms:''}]);

 const read=async(query={},actor=owner)=>(await one('select pro_payables_read($1,$2) v',[actor,query])).v;
 const mutate=async(input,actor=owner)=>(await one('select pro_payables_mutate($1,$2) v',[actor,input])).v;
 const flow=async(from,to,grain='month',actor=owner)=>(await one('select pro_cash_flow_read($1,$2,$3,$4) v',[actor,from,to,grain])).v;
 const income=async(from,to,grain='month',actor=owner)=>(await one('select pro_income_statement_read($1,$2,$3,$4) v',[actor,from,to,grain])).v;
 const item=(page,id)=>page.items.find(x=>x.sourceId===id);

 // ---- Accounts payable
 let ap=await read();
 eq(ap.items.map(x=>x.sourceId).sort(),[e1,e2].sort(),'expenses are payables; an order without a bill is not');
 eq(ap.toRegister.map(x=>x.purchaseOrderId),[p1],'issued order waits for its bill; a draft order does not');
 eq(ap.toRegister[0].totalCents,56500);eq(ap.toRegister[0].reference,'OC-0001');
 eq(item(ap,e1),{...item(ap,e1),status:'pending',overdue:true,daysOverdue:10,amountCents:113000,balanceCents:113000,vendorKind:'subcontractor',workId:work,workTitle:'Remodelación flujo',dueDate:addDays(today,-10),docDate:addDays(today,-40),billRevision:0});
 eq(item(ap,e2),{...item(ap,e2),status:'pending',overdue:false,dueDate:today,workId:null});
 eq(ap.aging,{d0_30:50000,d31_60:113000,d61_90:0,d90_plus:0});
 eq(ap.totals,{openCents:163000,openCount:2,overdueCents:113000,overdueCount:1,billedCents:163000,paidCents:0});
 eq(ap.suppliers.map(s=>[s.supplierName,s.openCents,s.d31_60,s.overdueCents,s.oldestDays]),[['Subcontratos Arias',113000,113000,113000,40],['Ferretería Central',50000,0,0,0]]);
 // Record the supplier's bill of P1 (receipt by actionId, CAS revision, history).
 const save={action:'save',actionId:crypto.randomUUID(),sourceKind:'purchase_order',sourceId:p1,revision:0,billNumber:'F-100',billDate:addDays(today,-2),dueDate:addDays(today,20),note:null};
 const saved=await mutate(save);eq(saved.payable.status,'pending');eq(saved.payable.billRevision,1);eq(saved.payable.amountCents,56500);eq(saved.payable.reference,'OC-0001');
 eq(await mutate(save),saved,'same actionId replays the receipt');
 await assert.rejects(async()=>mutate({...save,billNumber:'F-101'}),code('22023'));checks++;
 await assert.rejects(async()=>mutate({...save,actionId:crypto.randomUUID(),billNumber:'F-101'}),code('40001'),'stale revision');checks++;
 await assert.rejects(async()=>mutate({...save,actionId:crypto.randomUUID(),revision:1}),code('22023'),'no changes');checks++;
 await assert.rejects(async()=>mutate({...save,actionId:crypto.randomUUID(),revision:1,dueDate:addDays(today,-5)}),code('22023'),'due before bill');checks++;
 await assert.rejects(async()=>mutate({...save,actionId:crypto.randomUUID(),revision:1,billDate:addDays(today,1)}),code('22023'),'future bill');checks++;
 await assert.rejects(async()=>mutate({...save,actionId:crypto.randomUUID(),revision:1,billDate:addDays(today,-30)}),code('22023'),'bill before the order');checks++;
 await assert.rejects(async()=>mutate({...save,actionId:crypto.randomUUID(),sourceId:p2}),e=>e.code==='22023'&&/Issue the order/.test(e.message));checks++;
 await assert.rejects(async()=>mutate({...save,actionId:crypto.randomUUID(),sourceKind:'expense',sourceId:e1}),code('22023'),'expense due date lives in Expenses');checks++;
 await assert.rejects(async()=>mutate({...save,actionId:crypto.randomUUID(),sourceId:crypto.randomUUID()}),code('P0002'));checks++;
 await assert.rejects(async()=>mutate({...save,actionId:crypto.randomUUID(),extra:1}),code('22023'));checks++;
 eq((await one('select count(*)::int n from pro_payable_bill_history where owner_id=$1',[owner])).n,1);
 const billE1=await mutate({action:'save',actionId:crypto.randomUUID(),sourceKind:'expense',sourceId:e1,revision:0,billNumber:'FE-77',billDate:null,dueDate:null,note:'Factura electrónica'});
 eq([billE1.payable.billNumber,billE1.payable.billRevision,billE1.payable.dueDate],['FE-77',1,addDays(today,-10)]);
 // Payments made, delegated to the Expenses and Purchase-order writers.
 const payE1={action:'pay',actionId:crypto.randomUUID(),sourceKind:'expense',sourceId:e1,revision:1,sourceRevision:await expRev(),amountCents:13000,paidOn:today,method:'transfer',reference:'TR-1',note:null};
 const paid=await mutate(payE1);eq([paid.payable.status,paid.payable.paidCents,paid.payable.balanceCents],['partial',13000,100000]);
 eq(await mutate(payE1),paid);
 eq((await one('select count(*)::int n from pro_expense_payments where user_id=$1 and expense_id=$2',[owner,e1])).n,1,'one payment in the Expenses module');
 await assert.rejects(async()=>mutate({...payE1,actionId:crypto.randomUUID()}),code('40001'),'stale expense revision');checks++;
 await assert.rejects(async()=>mutate({...payE1,actionId:crypto.randomUUID(),sourceRevision:await expRev(),amountCents:100001}),code('22023'),'over the balance');checks++;
 await assert.rejects(async()=>mutate({...payE1,actionId:crypto.randomUUID(),sourceRevision:await expRev(),paidOn:addDays(today,1)}),code('22023'),'future payment');checks++;
 await assert.rejects(async()=>mutate({...payE1,actionId:crypto.randomUUID(),sourceRevision:await expRev(),method:'sinpe'}),code('22023'),'expense methods');checks++;
 await assert.rejects(async()=>mutate({...payE1,actionId:crypto.randomUUID(),sourceRevision:await expRev(),amountCents:1.5}),code('22023'));checks++;
 const poRev=async id=>(await one('select revision from pro_purchase_orders where owner_id=$1 and id=$2',[owner,id])).revision;
 const payP1=await mutate({action:'pay',actionId:crypto.randomUUID(),sourceKind:'purchase_order',sourceId:p1,revision:1,sourceRevision:await poRev(p1),amountCents:10000,paidOn:today,method:'sinpe',reference:null,note:'Adelanto'});
 eq([payP1.payable.status,payP1.payable.balanceCents],['partial',46500]);
 eq((await one("select count(*)::int n from pro_purchase_order_payments where owner_id=$1 and order_id=$2 and kind='payment'",[owner,p1])).n,1,'one payment in the PO module');
 // Void: refused with payments; an expense without payments can be voided and restored.
 await assert.rejects(async()=>mutate({action:'void',actionId:crypto.randomUUID(),sourceKind:'expense',sourceId:e1,revision:1,reason:'Duplicado'}),e=>e.code==='22023'&&e.hint==='pro_payable_paid');checks++;
 const voided=await mutate({action:'void',actionId:crypto.randomUUID(),sourceKind:'expense',sourceId:e2,revision:0,reason:'Registrado dos veces'});
 eq([voided.payable.status,voided.payable.voidReason,voided.payable.overdue],['void','Registrado dos veces',false]);
 await assert.rejects(async()=>mutate({action:'pay',actionId:crypto.randomUUID(),sourceKind:'expense',sourceId:e2,revision:1,sourceRevision:await expRev(),amountCents:100,paidOn:today,method:'cash',reference:null,note:null}),e=>e.hint==='pro_payable_void');checks++;
 ap=await read();
 eq(ap.items.map(x=>x.sourceId).sort(),[e1,p1].sort(),'open list leaves out the voided one');
 eq(ap.totals.openCents,146500);eq((await read({status:'void'})).items.map(x=>x.sourceId),[e2]);
 eq((await read({status:'all'})).items.length,3);eq((await read({overdue:'1'})).items.map(x=>x.sourceId),[e1]);
 eq((await read({supplier:s1})).items.map(x=>x.sourceId).sort(),[e1,p1].sort());
 eq(ap.suppliers.map(s=>[s.supplierName,s.openCents,s.openBills]),[['Subcontratos Arias',146500,2]]);
 eq((await read({from:addDays(today,-5)})).items.map(x=>x.sourceId),[p1],'period by bill/expense date');
 for(const bad of [{status:'x'},{overdue:'2'},{from:addDays(today,1),to:today},{other:'1'},{from:1}])await assert.rejects(async()=>read(bad),code('22023'));
 await assert.rejects(async()=>read({from:'2026-13-01'}),e=>['22008','22023'].includes(e.code));
 checks+=6;
 // ---- Cash flow
 const from=addDays(today,-60),to=addDays(today,60);
 let cf=await flow(from,to);
 eq(cf.totals.actualInCents,26000,'payment received');eq(cf.totals.actualOutCents,23000,'expense + PO payments');
 eq(cf.totals.expectedInCents,200000+100000,'open invoice + installments');eq(cf.totals.expectedOutCents,100000+46500,'open payables (voided left out)');
 eq(cf.totals.netCents,26000-23000+300000-146500);
 const sum=k=>cf.periods.reduce((t,p)=>t+p[k],0);
 for(const k of ['actualInCents','actualOutCents','expectedInCents','expectedOutCents'])eq(sum(k),cf.totals[k]);
 eq(cf.periods.at(-1).cumulativeCents,cf.totals.netCents,'running balance ends at the net');
 const current=cf.periods.find(p=>p.current);ok(current,'current period flagged');
 eq(current.overdueOutCents,100000,'overdue expense placed on today');eq(current.overdueInCents,0);
 eq(cf.overdue.outCents,100000);eq(cf.overdue.items.map(i=>[i.direction,i.kind,i.daysOverdue]),[['out','expense',10]]);
 eq(cf.periods[0].start,from);eq(cf.periods.at(-1).end,to);
 const weeks=await flow(from,to,'week');ok(weeks.periods.length>=17&&weeks.periods.length<=19,'weekly periods');
 eq(new Date(weeks.periods[1].start+'T12:00:00Z').getUTCDay(),1,'weeks start on Monday');
 eq(weeks.totals,cf.totals,'same totals by week and by month');
 // A reversal of the expense payment (Expenses writer) is negative on its own day.
 const paymentId=(await one('select id from pro_expense_payments where user_id=$1 and expense_id=$2',[owner,e1])).id;
 await saveExpense({action:'reverse',expenseId:e1,paymentId,date:today,note:'Error de monto'});
 cf=await flow(from,to);eq(cf.totals.actualOutCents,10000);eq(cf.totals.expectedOutCents,113000+46500);
 for(const [a,b,g] of [[null,to,'month'],[to,from,'month'],[from,to,'day'],['2020-01-01','2026-12-31','month'],['2024-01-01','2026-12-31','week']])await assert.rejects(async()=>flow(a,b,g),code('22023'));
 checks+=5;
 // ---- Income statement (management report)
 const is=await income(addDays(today,-60),today);
 eq(is.totals,{incomeCents:200000,collectedCents:26000,expensesCents:100000,laborCents:10000,purchaseBillsCents:50000,costCents:160000,resultCents:40000},'voided expense left out; costs without IVA');
 eq(is.basis,'management');eq(is.categories,[{category:'subcontract',cents:100000}]);
 const job=is.jobs.find(j=>j.workId===work);eq([job.incomeCents,job.expensesCents,job.laborCents,job.purchaseBillsCents,job.resultCents],[200000,100000,10000,50000,40000]);
 eq(is.jobs.find(j=>j.workId===null)?.collectedCents,26000,'payment without a job stays apart');
 for(const k of ['incomeCents','costCents','resultCents'])eq(is.periods.reduce((t,p)=>t+p[k],0),is.totals[k]);
 await mutate({action:'restore',actionId:crypto.randomUUID(),sourceKind:'expense',sourceId:e2,revision:1});
 const restored=await income(addDays(today,-60),today);eq(restored.totals.expensesCents,150000);eq(restored.categories.at(-1),{category:'uncategorized',cents:50000});
 eq((await income(addDays(today,-60),today,'quarter')).totals,restored.totals);
 for(const [a,b,g] of [[null,today,'month'],[today,addDays(today,-1),'month'],[today,today,'week'],['2000-01-01','2026-12-31','month']])await assert.rejects(async()=>income(a,b,g),code('22023'));
 checks+=4;
 // ---- Authorization, read-only readers, grants, immutability
 const outsiderView=await read({},outsider);eq([outsiderView.items,outsiderView.toRegister,outsiderView.totals.openCents],[[],[],0],'another account sees only its own (empty) payables');
 eq((await flow(from,to,'month',outsider)).totals.expectedOutCents,0);
 await assert.rejects(async()=>mutate({...payE1,actionId:crypto.randomUUID(),revision:0},outsider),code('P0002'),'another owner\'s expense');checks++;
 for(const fn of [()=>read({},customer),()=>flow(from,to,'month',customer),()=>income(from,to,'month',customer),()=>mutate(save,customer)])await assert.rejects(fn,code('42501'));
 checks+=4;
 await db.query("update pro_memberships set expires_at=now()-interval '1 day' where user_id=$1",[owner]);
 await assert.rejects(async()=>read(),code('42501'),'owner without Pro');checks++;
 await db.query('update pro_memberships set expires_at=null where user_id=$1',[owner]);
 const sources=['pro_internal_expenses','pro_expense_payments','pro_expense_state','pro_purchase_orders','pro_purchase_order_payments','pro_invoice_drafts','pro_invoice_payments','pro_payment_plans','pro_payable_bills','pro_payable_actions','pro_payable_bill_history','pro_work_cost_entries'];
 const fingerprint=async()=>{const out={};for(const t of sources)out[t]=(await one(`select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text,'[]')) h from ${t} r`)).h;return out;};
 const before=await fingerprint();await read({status:'all'});await flow(from,to,'week');await income(from,today,'year');eq(await fingerprint(),before,'readers write nothing');
 await assert.rejects(async()=>db.query("update pro_payable_bill_history set action='void' where owner_id=$1",[owner]),code('23514'));checks++;
 await assert.rejects(async()=>db.query("update pro_payable_actions set result='{}' where owner_id=$1",[owner]),code('23514'));checks++;
 for(const fn of ['pro_payables_read(uuid,jsonb)','pro_payables_mutate(uuid,jsonb)','pro_cash_flow_read(uuid,date,date,text)','pro_income_statement_read(uuid,date,date,text)','pro_payable_rows(uuid,date)']){
  for(const role of ['anon','authenticated'])eq((await one("select has_function_privilege($1,$2,'EXECUTE') yes",[role,'public.'+fn])).yes,false,role+' '+fn);
  eq((await one("select has_function_privilege('service_role',$1,'EXECUTE') yes",['public.'+fn])).yes,true,'service_role '+fn);
 }
 for(const t of ['pro_payable_bills','pro_payable_bill_history','pro_payable_actions']){
  eq((await one('select relrowsecurity r from pg_class where oid=$1::regclass',['public.'+t])).r,true,t+' RLS');
  eq((await one("select has_table_privilege('authenticated',$1,'SELECT') yes",['public.'+t])).yes,false);
 }
 eq((await one("select count(*)::int n from pg_proc where proname in('pro_payables_read','pro_cash_flow_read','pro_income_statement_read') and provolatile='s' and not prosecdef")).n,3,'stable security invoker readers');
 eq((await one("select count(*)::int n from pg_proc where proname like 'pro\\_payable%' and (proconfig is null or not exists(select 1 from unnest(proconfig) c where c like 'search_path=%'))")).n,0,'pinned search_path');
 await db.exec(moduleSql);eq((await read()).totals,(await read()).totals);eq((await read({status:'all'})).items.length,3,'idempotent reapply keeps the bills');
 console.log(`PASS payables/cash flow/income statement: ${checks} checks (payables from expenses + PO bills, aging by supplier, overdue, filters, receipts/CAS/history, payments through the Expenses and PO writers, void/restore; cash flow actual vs expected, overdue on today, running balance, week/month; income statement per period/job without IVA; 42501 without Pro; readers write nothing; service_role only; immutable receipts; idempotent reapply).`);
}finally{await db.close();}
