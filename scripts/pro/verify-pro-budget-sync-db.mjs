// LOCAL PRO ONLY (row 54, budget synchronisation, 2026-11-23): disposable in-memory PGlite verification of migration 380.
// Installs the whole ordered local manifest, then migration 380_pro_27_budget_document_sync.sql, and checks that an accepted quote and accepted
// change orders create budget codes THROUGH pro_work_budget_mutate: sections, planned cost (cost or net sale), markup/VAT, netted reductions,
// one-time application, CAS, idempotent receipts, atomic rollback, authorization, immutability, RLS/grants and an idempotent reapply.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {localSqlManifest,localSqlDependencies} from './local-sql-manifest.mjs';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
// The API routes parse every read with the strict schemas of src/lib/pro/cost-codes.ts: check the SQL against them here.
const libRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(s,c,n){return n(c.parentURL?.startsWith(libRoot)&&s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);},load(u,c,n){return u.startsWith(libRoot)&&u.endsWith('.ts')?{format:'module',source:ts.transpileModule(readFileSync(new URL(u),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true}:n(u,c);}});
const schemas=await import('../../src/lib/pro/cost-codes.ts');
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
 moduleSql=await readFile(new URL('supabase/migrations/380_pro_27_budget_document_sync.sql',root),'utf8');await db.exec(moduleSql);
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

 const forecast=async(actor=owner,w=work)=>{const v=(await one('select pro_cost_code_forecast_read($1,$2) v',[actor,w])).v;schemas.budgetForecastSchema.parse(v);return v;};
 const budget=async(input,w=work)=>{const o=(await one('select pro_work_budget_read($1,$2) v',[owner,w])).v;return (await one('select pro_work_budget_mutate($1,$2) v',[owner,{actionId:crypto.randomUUID(),workId:w,clientId:o.work.clientId,revision:o.revision,...input}])).v;};
 const syncRead=async(actor=owner,w=work)=>{const v=(await one('select pro_work_budget_sync_read($1,$2) v',[actor,w])).v;schemas.budgetSyncSchema.parse(v);return v;};
 const syncApply=async(input,actor=owner)=>{const v=(await one('select pro_work_budget_sync_apply($1,$2) v',[actor,input])).v;schemas.budgetSyncResultSchema.parse(v);return v;};
 const codesOf=async w=>(await db.query('select code,kind,planned_cents::int planned,archived,parent_id is not null as child from pro_work_budget_codes where owner_id=$1 and work_id=$2 order by code',[owner,w])).rows;
 // Fixture rows are inserted with constraints relaxed: only the budget module is under test, not the quote/change writers.
 const agreement=async(w,lines,currency='CRC')=>{
  const pub=crypto.randomUUID(),hash='a'.repeat(64);
  await db.exec('set session_replication_role=replica');
  await db.query("insert into pro_private_estimate_publications(owner_id,id,estimate_id,client_id,version,estimate_revision,content,content_hash) values($1,$2,$3,'budget-client',1,1,'{}',$4)",[owner,pub,crypto.randomUUID(),hash]);
  await db.query("insert into pro_private_estimate_work_agreements(owner_id,work_id,publication_id,estimate_id,version,estimate_revision,client_id,title,currency,total_cents,content_hash,accepted_action_id,accepted_actor_id,accepted_at,source_snapshot,work_snapshot) values($1,$2,$3,$4,1,1,'budget-client','Cotización cocina',$5,100000,$6,$7,$8,now(),$9,'{}')",
   [owner,w,pub,crypto.randomUUID(),currency,hash,crypto.randomUUID(),customer,{lines}]);
  await db.exec('set session_replication_role=origin');return pub;};
 const change=async(w,lines,status='accepted')=>{
  const id=crypto.randomUUID(),delta=lines.reduce((a,l)=>a+l.amountCents,0);
  await db.exec('set session_replication_role=replica');
  const r=await db.query("insert into pro_work_changes(owner_id,id,work_id,reason,lines,base_cents,base_position,delta_cents,total_cents,status) values($1,$2,$3,'Ampliación de terraza',$4,1000000,0,$5,$6,$7) returning position",[owner,id,w,JSON.stringify(lines),delta,1000000+delta,status]);
  await db.exec('set session_replication_role=origin');return {id,position:Number(r.rows[0].position)};};
 const act=(w,kind,id,revision)=>({action:'apply',actionId:crypto.randomUUID(),workId:w,revision,sourceKind:kind,sourceId:id});
 const lines=[
  {id:crypto.randomUUID(),description:'Muros de bloque',unit:'m2',qtyMilli:2000,unitPriceCents:10000,discountBps:0,taxBps:1300,catalogProductId:null,group:'Obra gris',unitCostCents:4000},
  {id:crypto.randomUUID(),description:'Repello',unit:'m2',qtyMilli:1000,unitPriceCents:5000,discountBps:1000,taxBps:400,catalogProductId:null,group:'Obra gris'},
  {id:crypto.randomUUID(),description:'Transporte',unit:'u',qtyMilli:1000,unitPriceCents:3000,discountBps:0,taxBps:0,catalogProductId:null}];

 // ---- Read: nothing synchronised yet ----
 assert.deepEqual((await syncRead()).sources,[],'no accepted source yet');
 const pub=await agreement(work,lines);
 const c1=await change(work,[{description:'Cambio A',amountCents:10000},{description:'Cambio B',amountCents:5000},{description:'Credito',amountCents:-12000}]);
 const c2=await change(work,[{description:'Solo credito',amountCents:-500}]);
 await change(work,[{description:'Propuesto',amountCents:900}],'proposed');
 const first=await syncRead();
 assert.deepEqual(first.sources.map(x=>[x.kind,x.applied,x.itemCount,x.plannedCents,x.unallocatedCents]),[['estimate',false,3,15500,0],['change',false,2,3000,0],['change',false,0,0,500]]);
 assert.equal(first.budgetRevision,0);assert.equal(first.canWrite,true);
 pass('read lists the accepted quote and accepted changes only, with the planned plan and no writes');

 // ---- Apply the accepted quote ----
 const a1=act(work,'estimate',pub,0),r1=await syncApply(a1);
 assert.equal(r1.created,4);assert.equal(r1.plannedCents,15500);assert.equal(r1.revision,5);
 assert.deepEqual(await syncApply(a1),r1,'idempotent receipt');
 await assert.rejects(()=>syncApply({...a1,sourceId:'x'}),code('40001'),'reused action id');
 assert.deepEqual(await codesOf(work),[{code:'COT-001',kind:'item',planned:8000,archived:false,child:true},{code:'COT-002',kind:'item',planned:4500,archived:false,child:true},
  {code:'COT-003',kind:'item',planned:3000,archived:false,child:false},{code:'COT-G01',kind:'group',planned:null,archived:false,child:false}]);
 const st=(await db.query("select c.code,s.markup_bp,s.vat_code from pro_work_budget_line_settings s join pro_work_budget_codes c on c.owner_id=s.owner_id and c.work_id=s.work_id and c.id=s.code_id where s.owner_id=$1 and s.work_id=$2 order by c.code",[owner,work])).rows;
 assert.deepEqual(st,[{code:'COT-001',markup_bp:15000,vat_code:'08'},{code:'COT-002',markup_bp:0,vat_code:'04'},{code:'COT-003',markup_bp:0,vat_code:'01'}]);
 await assert.rejects(()=>syncApply(act(work,'estimate',pub,5)),code('40001'),'a source is applied once');
 const f1=await forecast();assert.equal(f1.totals.costCents,15500);
 assert.equal((await one('select revision from pro_work_budget_state where owner_id=$1 and work_id=$2',[owner,work])).revision,5);
 assert.equal((await syncRead()).sources[0].applied,true);
 pass('accepted quote creates sections and lines with cost or net sale, markup and VAT, once, through the budget writer');

 // ---- Apply changes ----
 await assert.rejects(()=>syncApply(act(work,'change',c1.id,0)),code('40001'),'stale budget revision');
 const r2=await syncApply(act(work,'change',c1.id,5));assert.equal(r2.created,3);assert.equal(r2.plannedCents,3000);assert.equal(r2.unallocatedCents,0);
 const co=(await codesOf(work)).filter(x=>x.code.startsWith('CO'+c1.position));
 assert.deepEqual(co.map(x=>[x.code,x.planned]),[['CO'+c1.position,null],['CO'+c1.position+'-01',0],['CO'+c1.position+'-02',3000]],'reductions netted largest first');
 const r3=await syncApply(act(work,'change',c2.id,r2.revision));assert.equal(r3.created,0);assert.equal(r3.unallocatedCents,500);assert.equal(r3.revision,r2.revision);
 assert.deepEqual((await syncRead()).sources.map(x=>x.applied),[true,true,true]);
 assert.equal((await db.query('select 1 from pro_work_budget_doc_syncs where owner_id=$1',[owner])).rows.length,3);
 pass('accepted changes become one group with netted reductions; the unallocated rest is reported, never negative');

 // ---- Atomicity, limits and sources ----
 const w3='budget-work-3',w4='budget-work-4';
 for(const id of [w3,w4])await db.query('insert into pro_work(user_id,id,client,service,stage,start,"end","clientId",cancelled) values($1,$2,$3,$4,$5,$6,$7,$8,false)',[owner,id,'Cliente presupuesto','Otro','scheduled','','','budget-client']);
 const pub3=await agreement(w3,lines);
 await budget({action:'save_item',id:crypto.randomUUID(),code:'COT-003',title:'Manual',parentId:null,plannedCents:1},w3);
 const before=(await codesOf(w3)).length,rev3=(await syncRead(owner,w3)).budgetRevision;
 await assert.rejects(()=>syncApply(act(w3,'estimate',pub3,rev3)),code('40001'),'code already in use');
 assert.equal((await codesOf(w3)).length,before,'nothing was created');assert.equal((await db.query('select 1 from pro_work_budget_doc_syncs where work_id=$1',[w3])).rows.length,0);
 const pub4=await agreement(w4,lines,'USD');
 assert.equal((await syncRead(owner,w4)).sources[0].reason,'currency');
 await assert.rejects(()=>syncApply(act(w4,'estimate',pub4,0)),code('22023'),'only colones');
 await assert.rejects(()=>syncApply(act(w3,'estimate',crypto.randomUUID(),rev3)),code('40001'),'unknown source');
 for(const patch of [{extra:1},{sourceKind:'x'},{revision:-1},{action:'nope'}])await assert.rejects(()=>syncApply({...act(w3,'estimate',pub3,rev3),...patch}),code('22023'),JSON.stringify(patch));
 pass('atomic rollback on conflicts, USD and unknown sources refused, strict input');

 // ---- Security, immutability, grants, reapply ----
 await assert.rejects(()=>syncRead(rival),code('42501'));await assert.rejects(()=>syncRead(customer),code('42501'));
 await assert.rejects(()=>syncApply(act(work,'estimate',pub,5),rival),code('42501'));
 await db.query("update pro_memberships set expires_at=now()-interval '1 day' where user_id=$1",[owner]);
 await assert.rejects(()=>syncRead(),code('42501'));await db.query('update pro_memberships set expires_at=null where user_id=$1',[owner]);
 await assert.rejects(()=>db.query("update pro_work_budget_doc_syncs set planned_cents=0 where owner_id=$1",[owner]),code('23514'));
 await assert.rejects(()=>db.query("delete from pro_work_budget_doc_syncs where owner_id=$1",[owner]),code('23514'));
 await assert.rejects(()=>db.query("update pro_work_budget_doc_actions set result='{}' where owner_id=$1",[owner]),code('23514'));
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`);
 for(const t of ['pro_work_budget_doc_syncs','pro_work_budget_doc_actions'])await assert.rejects(()=>db.query(`select * from ${t}`),code('42501'));
 await db.exec('reset role');
 for(const fn of ['pro_work_budget_sync_read(uuid,text)','pro_work_budget_sync_apply(uuid,jsonb)','pro_work_budget_sync_plan(uuid,text,text,text)'])
  for(const [role,yes] of [['anon',false],['authenticated',false],['service_role',true]])assert.equal((await one('select has_function_privilege($1,$2,$3) v',[role,'public.'+fn,'EXECUTE'])).v,yes,role+' '+fn);
 const snap=JSON.stringify(await syncRead());await db.exec(moduleSql);assert.equal(JSON.stringify(await syncRead()),snap,'idempotent reapply keeps data');
 pass('authorization, immutable records, RLS/grants service_role only, idempotent reapply');
 console.log(`${checks} budget-sync contract groups passed; in-memory PGlite only.`);
}finally{await db.close();}
