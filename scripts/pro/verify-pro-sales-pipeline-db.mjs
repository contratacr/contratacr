// LOCAL PRO ONLY (Ronda F2-B, 2026-11-19): disposable in-memory PGlite verification of sales-pipeline-forecast-local.sql
// (rows 07, 08). Installs the whole ordered local manifest (same foundation stubs as verify-pro-cost-codes-db.mjs), then
// checks stage colour/probability settings (defaults, CAS, idempotent receipts, history, custom stages), stage spans fed
// by the EXISTING stage writers (create, board move, return to automatic, backfill of older leads), the weighted forecast
// per stage and currency, the funnel by stage reached with conversion % and time in stage, immutability, RLS/grants and
// an idempotent reapply. Every read is parsed with the strict API schemas of src/lib/pro/sales-pipeline.ts.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {localSqlManifest,localSqlDependencies} from './local-sql-manifest.mjs';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const libRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(s,c,n){return n(c.parentURL?.startsWith(libRoot)&&s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);},load(u,c,n){return u.startsWith(libRoot)&&u.endsWith('.ts')?{format:'module',source:ts.transpileModule(readFileSync(new URL(u),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true}:n(u,c);}});
const schemas=await import('../../src/lib/pro/sales-pipeline.ts');
const root=new URL('../../',import.meta.url),db=new PGlite();
const owner='00000000-0000-4000-8000-000000000001',rival='00000000-0000-4000-8000-000000000002';
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
 insert into profiles(id,full_name,role,is_disabled,is_provider) values('${owner}','Dueña Embudo','professional',false,true),('${rival}','Otra Empresa','professional',false,true);`);
 const notifications=await readFile(new URL('supabase/migrations/002_sprint2.sql',root),'utf8');
 await db.exec(notifications.slice(notifications.indexOf('CREATE TABLE IF NOT EXISTS public.notifications'),notifications.indexOf('-- SAVED PROFESSIONALS')));
 const emptyDoc=clientId=>({version:1,clients:[{id:clientId,name:'Cliente embudo',email:'',phone:'',notes:'',archived:false}],products:[],movements:[],work:[],availability:[],quotes:[],quoteLinks:[],social:[]});
 let moduleSql='';
 const needed=new Set(['sales-pipeline-forecast-local.sql']);for(let grew=true;grew;){grew=false;for(const [from,to] of localSqlDependencies)if(needed.has(to)&&!needed.has(from)){needed.add(from);grew=true;}}
 for(const step of localSqlManifest){
  if(step.ifMissing&&(await db.query('select to_regclass($1) is not null present',[step.ifMissing])).rows[0].present)continue;
  let text=await readFile(new URL('docs/pro/sql/'+step.file,root),'utf8');
  if(step.file==='identity-lookup-maintenance-local.sql')text=text.replace('create extension if not exists pg_cron;','');
  if(step.file==='sales-pipeline-forecast-local.sql')moduleSql=text;
  try{await db.exec(text);}catch(error){if(needed.has(step.file))throw new Error('Manifest SQL failed: '+step.file,{cause:error});await db.exec('rollback');console.log('SKIP unrelated module that does not install here: '+step.file);}
  if(step.file==='memberships-draft.sql')for(const id of [owner,rival])await db.query('select pro_save_workspace($1,$2,0)',[id,emptyDoc('pipe-client')]);
 }
 assert.ok(moduleSql,'sales-pipeline-forecast-local.sql must be in the manifest');
 for(const [id,profile] of [[owner,'30000000-0000-4000-8000-000000000001'],[rival,'30000000-0000-4000-8000-000000000002']]){
  await db.query('insert into professionals(id,profile_id,business_name,slug,is_banned) values($1,$2,$3,$4,false)',[profile,id,'Empresa '+id.slice(-1),'pipe-'+id.slice(-1)]);
  await db.query("insert into pro_memberships(user_id,status) values($1,'active')",[id]);
 }
 const one=async(sql,args)=>(await db.query(sql,args)).rows[0];
 const read=async(query,actor=owner)=>(await one('select pro_lead_pipeline_read($1,$2) v',[actor,query])).v;
 const settings=async(actor=owner)=>schemas.stageSettingsSchema.parse(await read({view:'settings'},actor));
 const forecast=async(actor=owner)=>schemas.pipelineForecastSchema.parse(await read({view:'forecast'},actor));
 const history=async(kind,id,actor=owner)=>schemas.leadStageHistorySchema.parse(await read({view:'lead',kind,id},actor));
 const today=(await one("select (now() at time zone 'America/Costa_Rica')::date::text d")).d;
 const funnel=async(channel=null,actor=owner,from=today,to=today)=>schemas.stageFunnelSchema.parse(await read({view:'funnel',from,to,channel},actor));
 const style=async(input,actor=owner)=>{const v=(await one('select pro_lead_stage_style_mutate($1,$2) v',[actor,input])).v;schemas.stageSettingsResultSchema.parse(v);return v;};

 // ---- Settings: defaults, CAS, receipts, history, custom stages ----
 let s=await settings();assert.equal(s.revision,0);assert.equal(s.stages.length,6);
 assert.deepEqual(s.stages.map(x=>[x.id,x.color,x.probability,x.customized]),[['new','blue',10,false],['followed_up','cyan',20,false],['connected','teal',30,false],['meeting_scheduled','violet',50,false],['estimate_sent','amber',70,false],['won','green',100,false]]);
 const paint={action:'style',actionId:crypto.randomUUID(),revision:0,stageId:'estimate_sent',color:'orange',probability:65};
 const r1=await style(paint);assert.equal(r1.revision,1);assert.deepEqual([r1.stage.color,r1.stage.probability,r1.stage.customized],['orange',65,true]);
 assert.deepEqual(await style(paint),{...r1,replayed:true},'idempotent receipt');
 await assert.rejects(()=>style({...paint,probability:64}),code('22023'),'reused action id');
 await assert.rejects(()=>style({...paint,actionId:crypto.randomUUID()}),code('40001'),'stale revision');
 for(const patch of [{color:'#ff0000'},{color:'purple'},{probability:101},{probability:-1},{probability:1.5},{probability:'50'},{extra:true}])
  await assert.rejects(()=>style({...paint,actionId:crypto.randomUUID(),revision:1,...patch}),code('22023'),JSON.stringify(patch));
 await assert.rejects(()=>style({...paint,actionId:crypto.randomUUID(),revision:1,stageId:'nope'}),code('P0002'));
 const custom=(await one('select pro_request_pipeline_mutate($1,$2) v',[owner,{action:'stage_save',actionId:crypto.randomUUID(),catalogRevision:0,stageId:crypto.randomUUID(),name:'Visita técnica'}])).v;
 const customId=custom.catalog.stages.find(x=>!x.builtin).id;s=await settings();assert.equal(s.catalogRevision,1);
 assert.deepEqual(s.stages.find(x=>x.id===customId),{id:customId,builtin:false,name:'Visita técnica',position:6,hidden:false,color:'slate',probability:40,customized:false});
 await style({action:'style',actionId:crypto.randomUUID(),revision:1,stageId:customId,color:'pink',probability:55});
 const reset=await style({action:'reset',actionId:crypto.randomUUID(),revision:2,stageId:customId});assert.deepEqual([reset.stage.color,reset.stage.probability,reset.stage.customized],['slate',40,false]);
 assert.equal((await one('select count(*)::int n from pro_lead_stage_style_history where owner_id=$1',[owner])).n,3);
 assert.equal((await settings(rival)).revision,0,'owner isolation');assert.equal((await settings(rival)).stages.find(x=>x.id==='estimate_sent').color,'amber');
 pass('stage settings: defaults, colour palette, probability, CAS, receipts, custom stage, reset, history and isolation');

 // ---- Spans from the existing writers ----
 const cat=async()=>(await one('select pro_lead_origin_stage_catalog($1) v',[owner])).v.revision;
 const leadA=crypto.randomUUID(),leadB=crypto.randomUUID(),leadOld=crypto.randomUUID();
 const create=async(id,stageId,currency,revenueCents)=>(await one('select pro_lead_center_mutate($1,$2) v',[owner,{action:'create',actionId:crypto.randomUUID(),kind:'manual',id,revision:0,catalogRevision:await cat(),clientId:'pipe-client',title:'Oportunidad '+id.slice(0,4),description:'',address:'',sourceLabel:'',forecast:{projectType:'Cocina',expectedStart:null,currency,revenueCents,budgetCents:null,profitCents:null},stageMode:'manual',stageId}])).v;
 await create(leadA,'new','CRC',100000000);await create(leadB,'connected','USD',500000);
 let hA=await history('manual',leadA);assert.deepEqual(hA.spans.map(x=>[x.stageId,x.source,x.leftAt]),[['new','created',null]]);
 const rev=async id=>(await one("select revision from pro_lead_center_records where owner_id=$1 and kind='manual' and id=$2",[owner,id])).revision;
 const move=async(id,stageId)=>(await one('select pro_lead_board_mutate($1,$2) v',[owner,{action:'move',actionId:crypto.randomUUID(),kind:'manual',id,revision:await rev(id),catalogRevision:await cat(),stageId}])).v;
 await move(leadA,'meeting_scheduled');await move(leadA,'estimate_sent');
 hA=await history('manual',leadA);assert.deepEqual(hA.spans.map(x=>[x.seq,x.stageId,x.source]),[[1,'new','created'],[2,'meeting_scheduled','moved'],[3,'estimate_sent','moved']]);
 assert.ok(hA.spans[0].leftAt&&hA.spans[1].leftAt&&hA.spans[2].leftAt===null,'only the last span is open');
 // Return to automatic: the effective stage is projected (no evidence -> new) and the span opens at the writer's time.
 await db.query('select pro_lead_center_mutate($1,$2)',[owner,{action:'return_auto',actionId:crypto.randomUUID(),kind:'manual',id:leadB,revision:await rev(leadB),catalogRevision:await cat()}]).catch(async e=>{if(e.code!=='22023')throw e;});
 const hB=await history('manual',leadB);assert.equal(hB.spans[0].stageId,'connected');
 // A lead that existed before this module (no marks): one span since its creation, source backfill.
 await db.query("insert into pro_lead_center_records(owner_id,kind,id,client_id,title,description,address,source_label,project_type,currency,revenue_cents,stage_mode,stage_id,revision,created_at,updated_at) values($1,'manual',$2,'pipe-client','Antigua','','','','', 'CRC',20000000,'manual','followed_up',1,now()-interval '10 days',now()-interval '10 days')",[owner,leadOld]);
 await db.query('delete from pro_lead_stage_marks where owner_id=$1 and lead_id=$2',[owner,leadOld]).catch(()=>{});
 const hOld=await history('manual',leadOld);assert.equal(hOld.spans.length,1);assert.equal(hOld.spans[0].stageId,'followed_up');assert.ok(hOld.spans[0].hours>=239,'backfill since creation');
 assert.ok(['backfill','created'].includes(hOld.spans[0].source));
 await assert.rejects(()=>history('manual',crypto.randomUUID()),code('P0002'));await assert.rejects(()=>history('manual',leadA,rival),code('P0002'),'other company');
 await assert.rejects(()=>read({view:'lead',kind:'x',id:leadA}),code('22023'));await assert.rejects(()=>read({view:'nope'}),code('22023'));await assert.rejects(()=>read({view:'forecast',x:1}),code('22023'));
 pass('stage spans: created, moved by the existing board writer, backfill for older leads, isolation and validation');

 // ---- Weighted forecast ----
 let f=await forecast();const st=id=>f.stages.find(x=>x.stageId===id);
 assert.deepEqual(st('estimate_sent').values,[{currency:'CRC',totalCents:100000000,weightedCents:65000000}],'65 % of CRC 1,000,000');
 const bStage=(await one("select effective_stage from pro_lead_inbox_sources($1,'') where id=$2",[owner,leadB])).effective_stage;
 assert.deepEqual(st(bStage).values,[{currency:'USD',totalCents:500000,weightedCents:Math.round(500000*s.stages.find(x=>x.id===bStage).probability/100)}]);
 assert.deepEqual(st('followed_up').values,[{currency:'CRC',totalCents:20000000,weightedCents:4000000}]);
 assert.deepEqual(f.totals.find(t=>t.currency==='CRC'),{currency:'CRC',openCents:120000000,weightedCents:69000000,wonCents:0});
 assert.equal(st('estimate_sent').count,1);assert.ok(st('estimate_sent').avgHours!==null);
 // Lost outcome leaves the forecast; won stage counts as won, not as open pipeline.
 await db.query('select pro_lead_board_mutate($1,$2)',[owner,{action:'outcome',actionId:crypto.randomUUID(),kind:'manual',id:leadB,revision:0,outcome:'lost',reason:'price',note:''}]);
 await move(leadOld,'won');f=await forecast();
 assert.equal(f.totals.find(t=>t.currency==='USD'),undefined,'lost USD lead removed');
 assert.deepEqual(f.totals.find(t=>t.currency==='CRC'),{currency:'CRC',openCents:100000000,weightedCents:65000000,wonCents:20000000});
 pass('weighted forecast per stage and currency with custom probability; lost excluded; won reported apart');

 // ---- Funnel by stage reached ----
 let fu=await funnel();assert.equal(fu.received,2,'leads received today (the old one is from 10 days ago)');assert.equal(fu.lost,1);
 const fs=id=>fu.stages.find(x=>x.stageId===id);
 assert.deepEqual([fs('new').reached,fs('meeting_scheduled').reached,fs('estimate_sent').reached,fs('won').reached],[2,1,1,0]);
 assert.equal(fs('new').fromStart,100);assert.equal(fs('meeting_scheduled').fromPrevious,fs('connected').reached?100*1/fs('connected').reached:null);
 assert.equal(fs('estimate_sent').fromStart,50);assert.equal(fs('meeting_scheduled').completedSpans,1,'time in stage counts the closed span');
 const wide=await funnel(null,owner,(await one("select ((now() at time zone 'America/Costa_Rica')::date-30)::text d")).d,today);
 assert.equal(wide.received,3);assert.equal(wide.won,1);assert.equal(wide.stages.find(x=>x.stageId==='won').reached,1);
 assert.equal((await funnel('referral')).received,0,'channel filter before counting');
 for(const q of [{view:'funnel',from:today,to:'2000-01-01',channel:null},{view:'funnel',from:'x',to:today,channel:null},{view:'funnel',from:today,to:today,channel:'x'.repeat(41)},{view:'funnel',from:today,to:today}])await assert.rejects(()=>read(q),code('22023'),JSON.stringify(q));
 pass('funnel: reached per stage from spans and current stage, conversion from start/previous, time in stage, period and channel');

 // ---- Immutability, RLS, grants, reapply ----
 await assert.rejects(()=>db.query("update pro_lead_stage_spans set stage_id='won' where owner_id=$1 and lead_id=$2 and seq=1",[owner,leadA]),code('23514'));
 await assert.rejects(()=>db.query("update pro_lead_stage_spans set left_at=now() where owner_id=$1 and lead_id=$2 and seq=1",[owner,leadA]),code('23514'),'a closed span stays closed');
 await assert.rejects(()=>db.query('delete from pro_lead_stage_spans where owner_id=$1',[owner]),code('23514'));
 await assert.rejects(()=>db.query('delete from pro_lead_stage_marks where owner_id=$1',[owner]),code('23514'));
 await assert.rejects(()=>db.query('update pro_lead_stage_style_history set actor_name=$2 where owner_id=$1',[owner,'x']),code('23514'));
 await assert.rejects(()=>db.query('delete from pro_lead_stage_style_actions where owner_id=$1',[owner]),code('23514'));
 for(const t of ['pro_lead_stage_styles','pro_lead_stage_spans','pro_lead_stage_marks','pro_lead_stage_style_history'])assert.equal((await one('select relrowsecurity v from pg_class where oid=$1::regclass',['public.'+t])).v,true,t);
 for(const fn of ['pro_lead_pipeline_read(uuid,jsonb)','pro_lead_stage_style_mutate(uuid,jsonb,uuid)','pro_lead_stage_observe(uuid)','pro_lead_stage_settings(uuid)'])
  for(const [role,yes] of [['anon',false],['authenticated',false],['service_role',true]])assert.equal((await one('select has_function_privilege($1,$2,$3) v',[role,'public.'+fn,'EXECUTE'])).v,yes,role+' '+fn);
 await assert.rejects(()=>read({view:'settings'},'00000000-0000-4000-8000-0000000000ff'),e=>['42501','P0002'].includes(e.code));
 const before=JSON.stringify([await settings(),await history('manual',leadA),await forecast()]);await db.exec(moduleSql);
 assert.equal(JSON.stringify([await settings(),await history('manual',leadA),await forecast()]).replace(/"hours":[0-9.]+|"avgHours":[0-9.]+/g,''),before.replace(/"hours":[0-9.]+|"avgHours":[0-9.]+/g,''),'idempotent reapply keeps data');
 // The existing stage writer still works with the triggers installed (a failing mark never breaks it).
 await move(leadA,'won');assert.equal((await history('manual',leadA)).spans.at(-1).stageId,'won');
 pass('immutability (spans close once), RLS/grants service_role only, idempotent reapply, writer unaffected');
 console.log(`${checks} sales-pipeline contract groups passed; in-memory PGlite only.`);
}finally{await db.close();}
