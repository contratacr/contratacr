// LOCAL PRO ONLY (rows 42/44, 2026-11-23): disposable in-memory PGlite verification of migration 383 (invoice delivery and lifecycle).
// Installs the whole ordered local manifest, seeds invoice drafts, then checks send/resend/recall, derived status (draft, sent, viewed, partial, paid, overdue, void),
// due date from the preparation, the customer reader (first view recorded once, never for the owner preview), idempotent receipts, authorization, immutability, grants and reapply.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {localSqlManifest,localSqlDependencies} from './local-sql-manifest.mjs';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
// The API routes parse every read with the strict schemas of src/lib/pro/invoice-delivery.ts: check the SQL against them here.
const libRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(s,c,n){return n(c.parentURL?.startsWith(libRoot)&&s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);},load(u,c,n){return u.startsWith(libRoot)&&u.endsWith('.ts')?{format:'module',source:ts.transpileModule(readFileSync(new URL(u),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true}:n(u,c);}});
const schemas=await import('../../src/lib/pro/invoice-delivery.ts');
const root=new URL('../../',import.meta.url),db=new PGlite();
const owner='00000000-0000-4000-8000-000000000001',rival='00000000-0000-4000-8000-000000000002',customer='00000000-0000-4000-8000-000000000003',stranger='00000000-0000-4000-8000-000000000004';
const code=c=>e=>{assert.equal(e.code,c,`${c} expected, got ${e.code}: ${e.message}`);return true;};
const foundation=await readFile(new URL('scripts/pro/verify-direct-project-quotes-db.mjs',root),'utf8');
const begin=foundation.indexOf('await db.exec(`')+'await db.exec(`'.length,end=foundation.indexOf('`);',begin);
assert.ok(begin>14&&end>begin);const ddl=foundation.slice(begin,end);assert.ok(!ddl.includes('${'));
let checks=0;const pass=name=>{checks++;console.log('PASS '+name);};
try{
 await db.exec(ddl);
 await db.exec(`create table auth.users(id uuid primary key);create function public.uuid_generate_v4() returns uuid language sql as $$select gen_random_uuid()$$;
 create function auth.role() returns text language sql as $$select current_user::text$$;
 create table projects(id uuid primary key,client_id uuid,title text,status text,allow_direct_contact boolean);
 create schema cron;create table cron.job(jobname text primary key,schedule text,command text);
 create function cron.schedule(p_name text,p_schedule text,p_command text) returns bigint language plpgsql as $$begin insert into cron.job values(p_name,p_schedule,p_command) on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command;return 1;end$$;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);alter table storage.objects enable row level security;
 insert into profiles(id,full_name,role,is_disabled,is_provider) values('${owner}','Dueña Presupuesto','professional',false,true),('${rival}','Otra Empresa','professional',false,true),('${customer}','Cliente Cuenta','client',false,false),('${stranger}','Cuenta Ajena','client',false,false);`);
 const notifications=await readFile(new URL('supabase/migrations/002_sprint2.sql',root),'utf8');
 await db.exec(notifications.slice(notifications.indexOf('CREATE TABLE IF NOT EXISTS public.notifications'),notifications.indexOf('-- SAVED PROFESSIONALS')));
 const emptyDoc=clientId=>({version:1,clients:[{id:clientId,name:'Cliente presupuesto',email:'',phone:'',notes:'',archived:false}],products:[],movements:[],work:[],availability:[],quotes:[],quoteLinks:[],social:[]});
 let moduleSql='';
 // The whole manifest is installed; a module that is NOT a declared ancestor of this one may be work in progress of
 // another round: its failure is rolled back and reported, never hidden for an ancestor or for this module.
 const needed=new Set(['cost-codes-local.sql','private-estimate-work-local.sql','work-changes-local.sql','work-change-details-local.sql']);for(let grew=true;grew;){grew=false;for(const [from,to] of localSqlDependencies)if(needed.has(to)&&!needed.has(from)){needed.add(from);grew=true;}}
 for(const step of localSqlManifest){
  if(step.ifMissing&&(await db.query('select to_regclass($1) is not null present',[step.ifMissing])).rows[0].present)continue;
  let text=await readFile(new URL('docs/pro/sql/'+step.file,root),'utf8');
  if(step.file==='identity-lookup-maintenance-local.sql')text=text.replace('create extension if not exists pg_cron;','');
  
  try{await db.exec(text);}catch(error){if(needed.has(step.file))throw new Error('Manifest SQL failed: '+step.file,{cause:error});await db.exec('rollback');console.log('SKIP unrelated module that does not install here: '+step.file);}
  if(step.file==='memberships-draft.sql')for(const id of [owner,rival])await db.query('select pro_save_workspace($1,$2,0)',[id,emptyDoc('budget-client')]);
 }
 moduleSql=await readFile(new URL('supabase/migrations/383_pro_28_invoice_delivery.sql',root),'utf8');await db.exec(moduleSql);
 for(const [id,profile] of [[owner,'30000000-0000-4000-8000-000000000001'],[rival,'30000000-0000-4000-8000-000000000002']]){
  await db.query('insert into professionals(id,profile_id,business_name,slug,is_banned) values($1,$2,$3,$4,false)',[profile,id,'Empresa '+id.slice(-1),'budget-'+id.slice(-1)]);
  await db.query("insert into pro_memberships(user_id,status) values($1,'active')",[id]);
 }
 const work='budget-work',work2='budget-work-2';
 for(const [user,id,title] of [[owner,work,'Remodelación de cocina'],[owner,work2,'Baño principal'],[rival,'rival-work','Trabajo ajeno']])
  await db.query('insert into pro_work(user_id,id,client,service,stage,start,"end","clientId",cancelled) values($1,$2,$3,$4,$5,$6,$7,$8,false)',[user,id,'Cliente presupuesto',title,'scheduled','','','budget-client']);
 const request=crypto.randomUUID();
 await db.query("insert into pro_appointment_requests(id,professional_id,owner_id,client_user_id,client_name,professional_name,service,duration_minutes,location_kind,status,work_id) values($1,$2,$3,$4,'Cliente Cuenta','Empresa 1','Remodelación de cocina',60,'agree','confirmed',$5)",[request,'30000000-0000-4000-8000-000000000001',owner,customer,work]);
 const one=async(sql,args)=>(await db.query(sql,args)).rows[0];



 const addDays=(d,n)=>{const x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
 const today=(await one("select (now() at time zone 'America/Costa_Rica')::date::text d")).d;const client='budget-client';
 const draft=async(total,{days=0,credit=null,work:w=work}={})=>{const id=crypto.randomUUID();
  await db.query("insert into pro_invoice_drafts(user_id,id,client_id,source_kind,source_id,work_id,title,receiver_name,receiver_identification,receiver_email,receiver_phone,receiver_address,total_cents,tax_cents,material_count,material_cost,basis,source_fingerprint,created_at) values($1,$2,$3,'direct',$7,$4,'Avance cocina','Cliente','','','','',$5,0,0,0,'manual',repeat('a',32),now()-($6||' days')::interval)",[owner,id,client,w,total,String(days),id]);
  if(credit!==null)await db.query("insert into pro_invoice_preparation(user_id,draft_id,issuer_name,issuer_id_type,issuer_id,issuer_email,issuer_phone,issuer_address,issuer_activity,planned_date,sale_condition,credit_days,payment_method,order_reference) values($1,$2,'','','','','','','',$3,'credit',$4,'','')",[owner,id,addDays(today,-days),credit]);
  return id;};
 const pay=async(id,amount)=>{const p=crypto.randomUUID();await db.query("insert into pro_invoice_payments(user_id,id,client_id,work_id,amount_cents,received_on,method,reference) values($1,$2,$3,null,$4,$5,'sinpe','R')",[owner,p,client,amount,today]);
  await db.query('insert into pro_invoice_payment_applications(user_id,id,draft_id,payment_id,amount_cents) values($1,$2,$3,$4,$5)',[owner,crypto.randomUUID(),id,p,amount]);};
 const read=async(id,actor=owner)=>{const v=(await one('select pro_invoice_delivery_read($1,$2) v',[actor,id])).v;if(v)schemas.invoiceDeliverySchema.parse(v);return v;};
 const send=async(id,extra={},actor=owner,aid=crypto.randomUUID())=>{const input={action:'send',actionId:aid,draftId:id,email:false,emailRef:null,...extra};const v=(await one('select pro_invoice_delivery_mutate($1,$2) v',[actor,input])).v;schemas.invoiceLifecycleSchema.parse(v);return v;};
 const recall=async(id,actor=owner)=>(await one('select pro_invoice_delivery_mutate($1,$2) v',[actor,{action:'recall',actionId:crypto.randomUUID(),draftId:id}])).v;
 const customerRead=async(record=true,actor=customer)=>{const v=(await one('select pro_invoice_delivery_client_read($1,$2,$3) v',[actor,request,record])).v;if(v)schemas.clientInvoiceDeliverySchema.parse(v);return v;};

 // ---- Draft -> sent -> viewed; due date and overdue ----
 const a=await draft(100000,{days:10,credit:30});
 let r=await read(a);assert.equal(r.status,'draft');assert.equal(r.dueDate,addDays(today,20));assert.equal(r.delivered,false);assert.deepEqual(r.events,[]);
 assert.deepEqual(await customerRead(),{visible:false},'finances are hidden until the owner enables them');
 const aid=crypto.randomUUID();const s1=await send(a,{},owner,aid);assert.equal(s1.status,'sent');assert.deepEqual(await send(a,{},owner,aid),s1,'idempotent receipt');
 await assert.rejects(()=>send(a,{email:true},owner,aid),code('40001'),'reused action id');
 await db.query("insert into pro_client_dashboards(owner_id,work_id,show_finances) values($1,$2,true) on conflict(owner_id,work_id) do update set show_finances=true",[owner,work]);
 pass('draft status, due date from the preparation, send with idempotent receipt');
 const viewPreview=await customerRead(false);assert.equal(viewPreview.invoices.length,1);assert.equal((await read(a)).viewedAt,null,'owner preview never marks viewed');
 const seen=await customerRead(true);assert.equal(seen.invoices[0].status,'viewed','the opening itself marks it viewed');assert.equal((await read(a)).status,'viewed');
 await customerRead(true);assert.equal((await read(a)).events.filter(e=>e.action==='view').length,1,'first view recorded once');
 pass('customer reader lists sent invoices only; the first opening is recorded once and never by the preview');

 // ---- Partial, paid, overdue, void, recall ----
 await pay(a,30000);assert.equal((await read(a)).status,'partial');assert.equal((await read(a)).balanceCents,70000);
 await pay(a,70000);assert.equal((await read(a)).status,'paid');
 const b=await draft(50000,{days:40,credit:30});await send(b);assert.equal((await read(b)).status,'overdue');assert.equal((await read(b)).daysOverdue,10);
 assert.equal((await customerRead(false)).invoices.find(x=>x.id===b).status,'overdue');
 const c=await draft(20000);await send(c);assert.equal((await recall(c)).status,'draft');assert.equal((await customerRead(false)).invoices.some(x=>x.id===c),false,'a recalled invoice disappears for the customer');
 assert.equal((await send(c)).status,'sent','it can be sent again');assert.ok((await read(c)).events.map(e=>e.action).includes('send'));
 pass('partial, paid, overdue, recall and resend lifecycle');

 // ---- Guards, e-mail sandbox record, authorization, immutability, grants, reapply ----
 const zero=await draft(0);await assert.rejects(()=>send(zero),code('22023'),'nothing to send');
 await assert.rejects(()=>send(crypto.randomUUID()),code('42501'));await assert.rejects(()=>send(a,{},rival),code('42501'));
 const dBad=await draft(1000);for(const bad of [{extra:1},{email:'x'},{emailRef:5}])await assert.rejects(()=>send(dBad,bad),code('22023'),JSON.stringify(bad));
 const d2=await draft(7000);await send(d2,{email:true,emailRef:'sandbox-abc'});assert.ok((await read(d2)).events.some(e=>e.action==='email_sandbox_sent'));
 const d3=await draft(7000);await send(d3,{email:true,emailRef:null});assert.ok((await read(d3)).events.some(e=>e.action==='email_failed'));
 await assert.rejects(()=>db.query("update pro_invoice_delivery_events set action='view' where user_id=$1",[owner]),code('23514'));
 await assert.rejects(()=>db.query("delete from pro_invoice_delivery_events where user_id=$1",[owner]),code('23514'));
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`);
 for(const t of ['pro_invoice_deliveries','pro_invoice_delivery_events'])await assert.rejects(()=>db.query(`select * from ${t}`),code('42501'));await db.exec('reset role');
 for(const fn of ['pro_invoice_delivery_read(uuid,uuid)','pro_invoice_delivery_mutate(uuid,jsonb)','pro_invoice_delivery_client_read(uuid,uuid,boolean)','pro_invoice_lifecycle(uuid,uuid)'])
  for(const [role,yes] of [['anon',false],['authenticated',false],['service_role',true]])assert.equal((await one('select has_function_privilege($1,$2,$3) v',[role,'public.'+fn,'EXECUTE'])).v,yes,role+' '+fn);
 const snap=JSON.stringify(await read(a));await db.exec(moduleSql);assert.equal(JSON.stringify(await read(a)),snap);
 pass('guards, e-mail sandbox events, authorization, immutable events, RLS/grants service_role only, idempotent reapply');
 console.log(`${checks} invoice delivery contract groups passed; in-memory PGlite only.`);
}finally{await db.close();}
