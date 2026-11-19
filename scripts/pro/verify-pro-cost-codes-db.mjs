// LOCAL PRO ONLY (Ronda F1-B, 2026-11-19): disposable in-memory PGlite verification of cost-codes-local.sql (row 54).
// Installs the whole ordered local manifest (same foundation stubs as verify-pro-work-activity-db.mjs), then checks the
// company cost-code library (CAS, idempotent receipts, duplicates, archive/restore order, starter import, copy from a
// project), applying library codes to a work THROUGH pro_work_budget_mutate without touching existing per-work codes,
// markup/VAT arithmetic per line/group/total, the forecast (committed, actual, projected, EAC, variance, consumed,
// warning states, uncoded amounts), the client summary (snapshot without internal cost, share/replace/revoke, audience),
// immutability, RLS/grants and an idempotent reapply. No Supabase, network or shared database.
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
 const needed=new Set(['cost-codes-local.sql']);for(let grew=true;grew;){grew=false;for(const [from,to] of localSqlDependencies)if(needed.has(to)&&!needed.has(from)){needed.add(from);grew=true;}}
 for(const step of localSqlManifest){
  if(step.ifMissing&&(await db.query('select to_regclass($1) is not null present',[step.ifMissing])).rows[0].present)continue;
  let text=await readFile(new URL('docs/pro/sql/'+step.file,root),'utf8');
  if(step.file==='identity-lookup-maintenance-local.sql')text=text.replace('create extension if not exists pg_cron;','');
  if(step.file==='cost-codes-local.sql')moduleSql=text;
  try{await db.exec(text);}catch(error){if(needed.has(step.file))throw new Error('Manifest SQL failed: '+step.file,{cause:error});await db.exec('rollback');console.log('SKIP unrelated module that does not install here: '+step.file);}
  if(step.file==='memberships-draft.sql')for(const id of [owner,rival])await db.query('select pro_save_workspace($1,$2,0)',[id,emptyDoc('budget-client')]);
 }
 assert.ok(moduleSql,'cost-codes-local.sql must be in the manifest');
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
 const lib=async(query={view:'library'},actor=owner)=>{const v=(await one('select pro_cost_codes_read($1,$2) v',[actor,query])).v;(query.view==='starter'?schemas.costCodeStarterSchema:schemas.costCodeLibrarySchema).parse(v);return v;};
 const libWrite=async(input,actor=owner)=>{const v=(await one('select pro_cost_codes_mutate($1,$2) v',[actor,input])).v;schemas.costCodeResultSchema.parse(v);return v;};
 const forecast=async(actor=owner,w=work)=>{const v=(await one('select pro_cost_code_forecast_read($1,$2) v',[actor,w])).v;schemas.budgetForecastSchema.parse(v);return v;};
 const extras=async(input,actor=owner)=>{const v=(await one('select pro_cost_code_extras_mutate($1,$2) v',[actor,input])).v;schemas.budgetExtrasResultSchema.parse(v);return v;};
 const budget=async(input,w=work)=>{const o=(await one('select pro_work_budget_read($1,$2) v',[owner,w])).v;return (await one('select pro_work_budget_mutate($1,$2) v',[owner,{actionId:crypto.randomUUID(),workId:w,clientId:o.work.clientId,revision:o.revision,...input}])).v;};
 const clientRead=async(actor=customer,req=request)=>{const v=(await one('select pro_cost_code_client_read($1,$2) v',[actor,req])).v;if(v!==null)schemas.clientBudgetSummarySchema.parse(v);return v;};

 // ---- Library: CRUD, CAS, receipts ----
 assert.deepEqual(await lib(),{revision:0,status:'active',items:[],activeCount:0,archivedCount:0,capacity:500});
 const g1=crypto.randomUUID(),i1=crypto.randomUUID();
 const saveGroup={action:'save',actionId:crypto.randomUUID(),revision:0,id:g1,kind:'group',code:'A1',title:'Obra gris ñ',parentId:null,unit:null,vatCode:null,markupBp:null};
 const r1=await libWrite(saveGroup);assert.equal(r1.revision,1);assert.equal(r1.code.code,'A1');
 assert.deepEqual(await libWrite(saveGroup),r1,'idempotent receipt');
 await assert.rejects(()=>libWrite({...saveGroup,title:'Otro'}),code('40001'),'reused action id');
 await assert.rejects(()=>libWrite({...saveGroup,actionId:crypto.randomUUID()}),code('40001'),'stale revision');
 const saveItem={action:'save',actionId:crypto.randomUUID(),revision:1,id:i1,kind:'item',code:'A1.1',title:'Bloques',parentId:g1,unit:'m²',vatCode:'08',markupBp:1500};
 assert.equal((await libWrite(saveItem)).revision,2);
 await assert.rejects(()=>libWrite({...saveItem,actionId:crypto.randomUUID(),revision:2,id:crypto.randomUUID()}),code('23505'),'duplicate code');
 for(const patch of [{kind:'group',parentId:g1},{kind:'group',unit:'m'},{vatCode:'07'},{markupBp:100001},{markupBp:1.5},{code:'a b'},{title:''},{title:'x\u0001'},{unit:'x'.repeat(21)},{extra:1}])
  await assert.rejects(()=>libWrite({...saveItem,actionId:crypto.randomUUID(),revision:2,id:crypto.randomUUID(),code:'Z9',...patch}),code('22023'),JSON.stringify(patch));
 await assert.rejects(()=>libWrite({...saveItem,actionId:crypto.randomUUID(),revision:2,id:crypto.randomUUID(),code:'Z9',parentId:i1}),code('40001'),'parent must be a group');
 await assert.rejects(()=>libWrite({action:'archive',actionId:crypto.randomUUID(),revision:2,id:g1}),code('40001'),'archive children first');
 assert.equal((await libWrite({action:'archive',actionId:crypto.randomUUID(),revision:2,id:i1})).code.archived,true);
 assert.equal((await libWrite({action:'archive',actionId:crypto.randomUUID(),revision:3,id:g1})).code.archived,true);
 await assert.rejects(()=>libWrite({action:'restore',actionId:crypto.randomUUID(),revision:4,id:i1}),code('40001'),'restore parent first');
 await libWrite({action:'restore',actionId:crypto.randomUUID(),revision:4,id:g1});await libWrite({action:'restore',actionId:crypto.randomUUID(),revision:5,id:i1});
 await assert.rejects(()=>libWrite({action:'archive',actionId:crypto.randomUUID(),revision:6,id:crypto.randomUUID()}),code('P0002'));
 await assert.rejects(()=>lib({view:'library',status:'nope'}),code('22023'));await assert.rejects(()=>lib({view:'x'}),code('22023'));
 const listed=await lib();assert.deepEqual(listed.items.map(r=>[r.code,r.parentCode,r.usage]),[['A1',null,0],['A1.1','A1',0]]);assert.equal(listed.items[1].markupBp,1500);
 assert.deepEqual(await lib({view:'library'},rival),{revision:0,status:'active',items:[],activeCount:0,archivedCount:0,capacity:500},'owner isolation');
 pass('library CAS, receipts, duplicates, validation, archive/restore order and owner isolation');

 // ---- Starter set ----
 const starterEs=await lib({view:'starter',lang:'es'}),starterEn=await lib({view:'starter',lang:'en'});
 assert.equal(starterEs.items.length,55);assert.equal(starterEs.items.filter(r=>r.kind==='group').length,10);
 assert.equal(starterEs.items.find(r=>r.code==='06.03').title,'Pintura');assert.equal(starterEn.items.find(r=>r.code==='06.03').title,'Painting');
 assert.ok(starterEs.items.every(r=>/^[A-Z0-9][A-Z0-9._-]{0,29}$/.test(r.code)&&(r.kind==='group'?r.parentCode===null:starterEs.items.some(g=>g.code===r.parentCode&&g.kind==='group'))));
 await assert.rejects(()=>libWrite({action:'import_starter',actionId:crypto.randomUUID(),revision:6,lang:'es',codes:['99.99']}),code('22023'));
 await assert.rejects(()=>libWrite({action:'import_starter',actionId:crypto.randomUUID(),revision:6,lang:'es',codes:[]}),code('22023'));
 const imported=await libWrite({action:'import_starter',actionId:crypto.randomUUID(),revision:6,lang:'es',codes:['01.02','06.03','06.02']});
 assert.deepEqual([imported.created,imported.skipped],[5,0],'two groups + three items');
 const again=await libWrite({action:'import_starter',actionId:crypto.randomUUID(),revision:7,lang:'es',codes:['06.03']});assert.deepEqual([again.created,again.skipped],[0,2]);
 const afterStarter=await lib();const painting=afterStarter.items.find(r=>r.code==='06.03');
 assert.deepEqual([painting.parentCode,painting.unit,painting.vatCode,painting.markupBp,painting.source],['06','m²','08',2000,'starter']);
 assert.equal((await lib({view:'starter',lang:'es'})).items.find(r=>r.code==='06.03').exists,true);
 pass('starter set (55 own codes, ES/EN), group auto-included, duplicate-safe re-import');

 // ---- Existing per-work budget stays intact ----
 const wg=crypto.randomUUID(),wPaint=crypto.randomUUID(),wLoose=crypto.randomUUID();
 await budget({action:'save_group',id:wg,code:'G001',title:'Obra existente'});
 await budget({action:'save_item',id:wPaint,code:'06.03',title:'Pintura existente',parentId:wg,plannedCents:500000});
 await budget({action:'save_item',id:wLoose,code:'X1',title:'Partida suelta',parentId:null,plannedCents:100000});
 const tables=['pro_work_budget_codes','pro_work_budget_assignments','pro_work_budget_actions'];
 const rowsOf=async t=>(await db.query(`select to_jsonb(r) j from ${t} r where owner_id=$1 order by to_jsonb(r)::text`,[owner])).rows.map(r=>JSON.stringify(r.j));
 const before={};for(const t of tables)before[t]=await rowsOf(t);
 let f=await forecast();assert.equal(f.budgetRevision,3);assert.equal(f.revision,0);assert.equal(f.share,null);assert.equal(f.customerName,'Cliente Cuenta');
 const libIds=afterStarter.items.filter(r=>['01.02','06.03'].includes(r.code)).map(r=>r.id);
 const apply={action:'apply_library',actionId:crypto.randomUUID(),workId:work,revision:0,budgetRevision:3,libraryIds:libIds};
 await assert.rejects(()=>extras({...apply,budgetRevision:2}),code('40001'),'stale budget revision');
 const applied=await extras(apply);assert.deepEqual([applied.created,applied.linked,applied.skipped,applied.revision,applied.budgetRevision],[2,1,0,1,5]);
 assert.deepEqual(await extras(apply),applied,'idempotent apply');
 for(const t of tables){const now=await rowsOf(t);assert.ok(before[t].every(row=>now.includes(row)),t+' keeps every previous row unchanged');}
 const codes=(await db.query('select code,kind,title,planned_cents,parent_id from pro_work_budget_codes where owner_id=$1 and work_id=$2 order by code',[owner,work])).rows;
 assert.deepEqual(codes.map(r=>[r.code,r.kind,r.title,r.planned_cents===null?null:Number(r.planned_cents)]),[['01','group','Preliminares y trámites',null],['01.02','item','Diseño, planos y dirección técnica',0],['06.03','item','Pintura existente',500000],['G001','group','Obra existente',null],['X1','item','Partida suelta',100000]]);
 assert.equal(codes.find(r=>r.code==='06.03').parent_id,wg,'linked item keeps its group');
 assert.equal((await db.query("select count(*)::int n from pro_work_budget_actions where owner_id=$1 and work_id=$2",[owner,work])).rows[0].n,5,'created codes have budget history');
 assert.equal((await db.query("select count(*)::int n from pro_work_budget_codes where owner_id=$1 and code='06'",[owner])).rows[0].n,0,'no empty group for a linked item');
 f=await forecast();const row=c=>f.rows.find(r=>r.code===c);
 assert.equal(row('06.03').libraryCode,'06.03');assert.equal(row('01.02').markupBp,1000);assert.equal(row('01.02').vatCode,'08');
 assert.equal((await lib()).items.find(r=>r.code==='06.03').usage,1);
 pass('apply library through pro_work_budget_mutate: 2 created with history, existing code linked without changes, revision CAS, replay');

 // ---- Markup and VAT ----
 const price={action:'price',actionId:crypto.randomUUID(),workId:work,revision:1,codeIds:[wPaint],markupBp:2000,vatCode:'08'};
 await assert.rejects(()=>extras({...price,codeIds:[wg]}),code('40001'),'groups have no pricing');
 await assert.rejects(()=>extras({...price,vatCode:'13'}),code('22023'));await assert.rejects(()=>extras({...price,markupBp:-1}),code('22023'));
 await assert.rejects(()=>extras({...price,revision:0}),code('40001'));
 await extras(price);await extras({action:'price',actionId:crypto.randomUUID(),workId:work,revision:2,codeIds:[wLoose],markupBp:1250,vatCode:'04'});
 f=await forecast();
 assert.deepEqual([row('06.03').costCents,row('06.03').markupCents,row('06.03').saleCents,row('06.03').taxCents,row('06.03').totalCents],[500000,100000,600000,78000,678000]);
 assert.deepEqual([row('X1').markupCents,row('X1').saleCents,row('X1').taxCents],[12500,112500,4500]);
 assert.deepEqual([row('G001').costCents,row('G001').saleCents,row('G001').childCount],[500000,600000,1]);
 assert.deepEqual([f.totals.costCents,f.totals.markupCents,f.totals.saleCents,f.totals.taxCents,f.totals.totalCents],[600000,112500,712500,82500,795000]);
 pass('per-line markup/VAT: sale = cost + round(cost x markup), VAT on sale, group and total rollups');

 // ---- Forecast ----
 const addOrder=async(codeId,cents,status='issued')=>{const id=crypto.randomUUID(),n=(await one('select coalesce(max(number),0)+1 n from pro_purchase_orders where owner_id=$1',[owner])).n;
  await db.query("insert into pro_purchase_orders(owner_id,id,work_id,number,supplier_name,title,issue_date,status,issued_at,cancelled_at) values($1,$2,$3,$4,'Ferretería','Compra',current_date,$5,now(),case when $5='cancelled' then now() end)",[owner,id,work,n,status]);
  await db.query("insert into pro_purchase_order_lines(owner_id,work_id,order_id,id,position,description,quantity,unit,unit_cents,tax_rate,budget_code_id) values($1,$2,$3,$4,1,'Línea',1,'u',$5,0,$6)",[owner,work,id,crypto.randomUUID(),cents,codeId]);};
 const addTime=async(cents,minutes=60)=>{const id=crypto.randomUUID();
  await db.query("insert into pro_work_cost_entries(user_id,id,work_id,kind,recorded_on,minutes,hourly_cost_cents,amount_cents,note) values($1,$2,$3,'time',current_date,$4,$5,$6,'Tiempo')",[owner,id,work,minutes,cents===null?null:Math.round(cents*60/minutes),cents]);return id;};
 const assign=async(id)=>{const s=(await db.query("select * from pro_work_budget_sources($1,$2) where id=$3",[owner,work,id])).rows[0];await budget({action:'assign',source:{kind:'time',id,fingerprint:s.fingerprint},codeId:wPaint});};
 await addOrder(wPaint,300000);await assign(await addTime(200000));
 f=await forecast();let p=row('06.03');
 assert.deepEqual([p.committedCents,p.actualCents,p.projectedCents,p.remainingCents,p.eacCents,p.varianceCents,p.consumedBp,p.status],[300000,200000,300000,200000,500000,0,4000,'ok']);
 await addOrder(wPaint,160000);await addOrder(wPaint,999999,'cancelled');f=await forecast();p=row('06.03');
 assert.deepEqual([p.committedCents,p.projectedCents,p.eacCents,p.status],[460000,460000,500000,'watch'],'>= 90 % projected');
 await assign(await addTime(400000));f=await forecast();p=row('06.03');
 assert.deepEqual([p.actualCents,p.projectedCents,p.remainingCents,p.eacCents,p.varianceCents,p.consumedBp,p.status],[600000,600000,0,600000,-100000,12000,'over']);
 assert.equal(row('06.03').saleCents,600000,'sale is based on planned cost, not on actual');
 assert.equal(row('G001').status,'over');assert.equal(row('X1').status,'ok');assert.equal(row('01.02').status,'idle');
 await addOrder(null,50000);f=await forecast();
 assert.deepEqual(f.totals.uncoded,{committedCents:50000,actualCents:0,unknownCount:0,projectedCents:50000});
 assert.deepEqual([f.totals.eacCents,f.totals.varianceCents,f.totals.overCount,f.totals.status],[600000+100000+50000,600000-750000,1,'over']);
 const unknownTime=await addTime(null,30);await assign(unknownTime);f=await forecast();
 assert.deepEqual([row('06.03').status,row('06.03').varianceCents,f.totals.varianceCents],['incomplete',null,null],'time without cost keeps the variance incomplete');
 pass('forecast: committed vs actual, projected = max, EAC = projected + remaining, variance, consumed, ok/watch/over/idle/incomplete, uncoded in total');

 // ---- Client summary ----
 assert.deepEqual(await clientRead(),{visible:false});
 const shared=await extras({action:'share',actionId:crypto.randomUUID(),workId:work,revision:3});assert.ok(shared.shareId);
 let summary=await clientRead();
 assert.deepEqual(summary.groups,[{code:'01',title:'Preliminares y trámites',saleCents:0},{code:'G001',title:'Obra existente',saleCents:600000}]);
 assert.deepEqual([summary.visible,summary.otherSaleCents,summary.saleCents,summary.taxCents,summary.totalCents],[true,112500,712500,82500,795000]);
 const text=JSON.stringify(summary);for(const word of ['cost','markup','committed','actual','planned','eac','variance','Pintura existente'])assert.ok(!text.toLowerCase().includes(word.toLowerCase()),'client summary hides '+word);
 f=await forecast();assert.equal(f.share.stale,false);assert.equal(f.share.id,shared.shareId);
 await extras({action:'price',actionId:crypto.randomUUID(),workId:work,revision:4,codeIds:[wPaint],markupBp:2500,vatCode:'08'});
 f=await forecast();assert.equal(f.share.stale,true);assert.equal((await clientRead()).saleCents,712500,'snapshot does not follow live edits');
 const reshared=await extras({action:'share',actionId:crypto.randomUUID(),workId:work,revision:5});
 f=await forecast();assert.equal(f.share.stale,false);assert.deepEqual(f.shareHistory.map(h=>h.reason),[null,'replaced']);assert.equal((await clientRead()).saleCents,737500);
 assert.equal(await clientRead(stranger),null,'other accounts never read it');
 await assert.rejects(()=>extras({action:'revoke',actionId:crypto.randomUUID(),workId:work,revision:6,shareId:shared.shareId}),code('40001'),'only the active share');
 await extras({action:'revoke',actionId:crypto.randomUUID(),workId:work,revision:6,shareId:reshared.shareId});
 assert.deepEqual(await clientRead(),{visible:false});f=await forecast();assert.equal(f.share,null);assert.deepEqual(f.shareHistory.map(h=>h.reason),['revoked','replaced']);
 await extras({action:'share',actionId:crypto.randomUUID(),workId:work,revision:7});assert.equal((await clientRead()).visible,true);
 await db.query("update pro_appointment_requests set status='cancelled' where id=$1",[request]);assert.deepEqual(await clientRead(),{visible:false},'cancelled request');
 await db.query("update pro_appointment_requests set status='confirmed' where id=$1",[request]);
 await assert.rejects(()=>extras({action:'share',actionId:crypto.randomUUID(),workId:work2,revision:0}),code('40001'),'nothing to share');
 const rfc=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
 for(const [table,column] of [['pro_cost_code_library','id'],['pro_work_budget_codes','id'],['pro_work_budget_actions','action_id'],['pro_work_budget_client_shares','id']])
  for(const r of (await db.query(`select ${column}::text v from ${table} where owner_id=$1`,[owner])).rows)assert.match(r.v,rfc,table+' identities are RFC 9562 shaped (strict UUID readers accept them)');
 pass('client summary: groups and sale totals only, immutable snapshot, stale flag, replace, revoke, audience and cancelled request');

 // ---- Copy a project's codes into the library ----
 const b2=crypto.randomUUID();await budget({action:'save_group',id:b2,code:'B1',title:'Baño'},work2);await budget({action:'save_item',id:crypto.randomUUID(),code:'B1.1',title:'Enchape baño',parentId:b2,plannedCents:200000},work2);
 await budget({action:'save_item',id:crypto.randomUUID(),code:'06.03',title:'Pintura baño',parentId:null,plannedCents:1},work2);
 const rev=(await lib()).revision,copied=await libWrite({action:'import_work',actionId:crypto.randomUUID(),revision:rev,workId:work2});
 assert.deepEqual([copied.created,copied.linked,copied.skipped],[2,1,0]);
 const after=await lib();assert.equal(after.items.find(r=>r.code==='B1.1').parentCode,'B1');assert.equal(after.items.find(r=>r.code==='B1.1').source,'work');assert.equal(after.items.find(r=>r.code==='06.03').usage,2);
 await assert.rejects(()=>libWrite({action:'import_work',actionId:crypto.randomUUID(),revision:rev+1,workId:'rival-work'}),code('42501'));
 pass('copy a project budget into the library (created + linked, groups kept)');

 // ---- Security and integrity ----
 await assert.rejects(()=>forecast(rival),code('42501'));await assert.rejects(()=>forecast(customer),code('42501'));
 await assert.rejects(()=>extras({action:'share',actionId:crypto.randomUUID(),workId:work,revision:8},rival),code('42501'));
 await db.query("update pro_memberships set expires_at=now()-interval '1 day' where user_id=$1",[owner]);
 await assert.rejects(()=>lib(),code('42501'));await assert.rejects(()=>forecast(),code('42501'));
 await db.query('update pro_memberships set expires_at=null where user_id=$1',[owner]);
 await assert.rejects(()=>db.query("update pro_cost_code_actions set result='{}' where owner_id=$1",[owner]),code('23514'));
 await assert.rejects(()=>db.query("update pro_work_budget_client_shares set snapshot='{}' where owner_id=$1",[owner]),code('23514'));
 await assert.rejects(()=>db.query("delete from pro_work_budget_client_shares where owner_id=$1",[owner]),code('23514'));
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`);
 for(const t of ['pro_cost_code_library','pro_work_budget_line_settings','pro_work_budget_client_shares','pro_cost_code_actions'])await assert.rejects(()=>db.query(`select * from ${t}`),code('42501'));
 await assert.rejects(()=>forecast(),code('42501'));await assert.rejects(()=>clientRead(),code('42501'));
 await db.exec('reset role');
 for(const fn of ['pro_cost_codes_read(uuid,jsonb)','pro_cost_codes_mutate(uuid,jsonb)','pro_cost_code_forecast_read(uuid,text)','pro_cost_code_extras_mutate(uuid,jsonb)','pro_cost_code_client_read(uuid,uuid)'])
  for(const [role,yes] of [['anon',false],['authenticated',false],['service_role',true]])assert.equal((await one('select has_function_privilege($1,$2,$3) v',[role,'public.'+fn,'EXECUTE'])).v,yes,role+' '+fn);
 const snapshotBefore=JSON.stringify(await forecast());await db.exec(moduleSql);assert.equal(JSON.stringify(await forecast()),snapshotBefore,'idempotent reapply keeps data');
 pass('authorization (other owner, customer, no Pro 42501), immutable receipts and shares, RLS/grants service_role only, idempotent reapply');
 console.log(`${checks} cost-code contract groups passed; in-memory PGlite only.`);
}finally{await db.close();}
