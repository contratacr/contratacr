// LOCAL PRO ONLY (Ronda F2-C, 2026-11-19): in-memory PGlite verification of operations-schedule-time-local.sql (rows 13, 15, 17, 20, 22, 24).
// Installs the whole ordered local manifest, then checks estimate->schedule, saved task views, time clock and timesheets,
// notification channels, daily log crew and custom roles. No Supabase, network or shared database.
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
const schemas=await import('../../src/lib/pro/operations.ts');
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
 insert into profiles(id,full_name,role,is_disabled,is_provider) values('${owner}','Dueña Obras','professional',false,true),('${rival}','Otra Empresa','professional',false,true),('${customer}','Cliente Cuenta','client',false,false),('${stranger}','Cuenta Ajena','client',false,false);`);
 const notifications=await readFile(new URL('supabase/migrations/002_sprint2.sql',root),'utf8');
 await db.exec(notifications.slice(notifications.indexOf('CREATE TABLE IF NOT EXISTS public.notifications'),notifications.indexOf('-- SAVED PROFESSIONALS')));
 const emptyDoc=clientId=>({version:1,clients:[{id:clientId,name:'Cliente presupuesto',email:'',phone:'',notes:'',archived:false}],products:[],movements:[],work:[],availability:[],quotes:[],quoteLinks:[],social:[]});
 let moduleSql='';
 // The whole manifest is installed; a module that is NOT a declared ancestor of this one may be work in progress of
 // another round: its failure is rolled back and reported, never hidden for an ancestor or for this module.
 const needed=new Set(['operations-schedule-time-local.sql']);for(let grew=true;grew;){grew=false;for(const [from,to] of localSqlDependencies)if(needed.has(to)&&!needed.has(from)){needed.add(from);grew=true;}}
 for(const step of localSqlManifest){
  if(step.ifMissing&&(await db.query('select to_regclass($1) is not null present',[step.ifMissing])).rows[0].present)continue;
  let text=await readFile(new URL('docs/pro/sql/'+step.file,root),'utf8');
  if(step.file==='identity-lookup-maintenance-local.sql')text=text.replace('create extension if not exists pg_cron;','');
  if(step.file==='operations-schedule-time-local.sql')moduleSql=text;
  try{await db.exec(text);}catch(error){if(needed.has(step.file))throw new Error('Manifest SQL failed: '+step.file,{cause:error});await db.exec('rollback');console.log('SKIP unrelated module that does not install here: '+step.file);}
  if(step.file==='memberships-draft.sql')for(const id of [owner,rival])await db.query('select pro_save_workspace($1,$2,0)',[id,emptyDoc('budget-client')]);
 }
 assert.ok(moduleSql,'operations-schedule-time-local.sql must be in the manifest');
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
 const v=async(sql,args)=>(await one(sql,args)).v;
 const member=stranger;
 await db.query("insert into pro_company_members(owner_id,member_user_id,member_name,member_email,role) values($1,$2,'Ana Maestra','ana@example.test','member')",[owner,member]);
 const memberRow=(await one('select id from pro_company_members where owner_id=$1 and member_user_id=$2',[owner,member])).id;

 // ---------- 1. Estimate -> schedule ----------
 const est=crypto.randomUUID();
 await db.query(`insert into pro_private_estimates(owner_id,id,client_id,client_snapshot,source,issuer,title,notes,currency,subtotal_cents,discount_cents,tax_cents,total_cents,revision) values($1,$2,'budget-client','{}',$3,'{}','Remodelación cocina','', 'CRC',0,0,0,0,1)`,[owner,est,{kind:'work',id:work}]);
 const lines=[['Demolición','Obra gris','días',3000],['Repello','Obra gris','m2',20000],['Gabinetes','Acabados','unidad',1000],['Pintura',null,'días',2500],['   ',null,'u',1000]];
 for(const [i,[d,g,u,q]] of lines.entries())await db.query('insert into pro_private_estimate_items(owner_id,estimate_id,id,position,content) values($1,$2,$3,$4,$5)',[owner,est,crypto.randomUUID(),i,{id:crypto.randomUUID(),description:d+'\nDetalle interno',unit:u,qtyMilli:q,unitPriceCents:100,discountBps:0,taxBps:0,catalogProductId:null,...(g?{group:g}:{})}]);
 const source=schemas.estimateScheduleSourceSchema.parse(await v('select pro_estimate_schedule_source($1,$2) v',[owner,work]));
 assert.equal(source.estimates.length,1);const sl=source.estimates[0].lines;
 assert.deepEqual(sl.map(l=>[l.title,l.group,l.days]),[['Demolición','Obra gris',3],['Repello','Obra gris',1],['Gabinetes','Acabados',1],['Pintura',null,3]],'blank lines skipped, days from unit');
 await assert.rejects(()=>db.query('select pro_estimate_schedule_source($1,$2)',[rival,work]),code('42501'));
 assert.equal((await v('select pro_estimate_schedule_source($1,$2) v',[owner,work2])).estimates.length,0,'other job does not see this quote');
 pass('estimate proposal: sections, lines, default durations, isolation');
 const proposal={action:'apply',actionId:crypto.randomUUID(),workId:work,estimateId:est,estimateRevision:1,revision:source.revision,startDate:'2026-12-01',
  phases:[{title:'Obra gris',tasks:[{lineId:sl[0].lineId,title:'Demolición',days:3,lagDays:0},{lineId:sl[1].lineId,title:'Repello',days:2,lagDays:1}]},{title:'Acabados',tasks:[{lineId:null,title:'Gabinetes',days:1,lagDays:0}]}]};
 for(const bad of [{...proposal,phases:[]},{...proposal,startDate:'2026-13-01'},{...proposal,extra:1},{...proposal,phases:[{title:'',tasks:[{lineId:null,title:'x',days:1,lagDays:0}]}]},{...proposal,phases:[{title:'A',tasks:[{lineId:null,title:'x',days:0,lagDays:0}]}]},{...proposal,phases:[{title:'A',tasks:[{lineId:null,title:'x',days:1,lagDays:61}]}]}])
  await assert.rejects(()=>db.query('select pro_estimate_schedule_apply($1,$2)',[owner,bad]),code('22023'));
 await assert.rejects(()=>db.query('select pro_estimate_schedule_apply($1,$2)',[owner,{...proposal,actionId:crypto.randomUUID(),estimateRevision:2}]),code('40001'),'stale estimate');
 await assert.rejects(()=>db.query('select pro_estimate_schedule_apply($1,$2)',[owner,{...proposal,actionId:crypto.randomUUID(),revision:source.revision+1}]),code('40001'),'stale schedule');
 await assert.rejects(()=>db.query('select pro_estimate_schedule_apply($1,$2)',[owner,{...proposal,actionId:crypto.randomUUID(),workId:work2}]),code('P0002'),'quote of another job');
 await assert.rejects(()=>db.query('select pro_estimate_schedule_apply($1,$2)',[rival,proposal]),code('42501'));
 const applied=schemas.estimateScheduleResultSchema.parse(await v('select pro_estimate_schedule_apply($1,$2) v',[owner,proposal]));
 assert.equal(applied.startDate,'2026-12-01');assert.equal(applied.endDate,'2026-12-07');assert.equal(applied.phaseIds.length,2);assert.equal(applied.taskIds.length,3);
 assert.equal(applied.revision,source.revision+5,'2 phases + 3 plans through the plan writer');
 const replay=await v('select pro_estimate_schedule_apply($1,$2) v',[owner,proposal]);assert.equal(replay.replayed,true);assert.deepEqual({...replay,replayed:undefined},{...applied,replayed:undefined});
 await assert.rejects(()=>db.query('select pro_estimate_schedule_apply($1,$2)',[owner,{...proposal,startDate:'2026-12-02'}]),code('22023'),'action id reused');
 const plans=(await db.query('select t.title,p.planned_start::text s,p.planned_end::text e,ph.title phase from pro_work_tasks t join pro_work_schedule_plans p on p.owner_id=t.owner_id and p.task_id=t.id join pro_work_schedule_phases ph on ph.owner_id=p.owner_id and ph.work_id=p.work_id and ph.id=p.phase_id where t.owner_id=$1 and t.work_id=$2 order by p.planned_start',[owner,work])).rows;
 assert.deepEqual(plans.map(r=>[r.title,r.s,r.e,r.phase]),[['Demolición','2026-12-01','2026-12-03','Obra gris'],['Repello','2026-12-05','2026-12-06','Obra gris'],['Gabinetes','2026-12-07','2026-12-07','Acabados']]);
 const links=(await db.query('select t.title,l.kind,l.lag_days from pro_schedule_links_of($1,$2) l join pro_work_tasks t on t.owner_id=$1 and t.id=l.task_id order by t.title',[owner,work])).rows;
 assert.deepEqual(links.map(r=>[r.title,r.kind,r.lag_days]),[['Gabinetes','fs',0],['Repello','fs',1]],'finish-to-start links with lag');
 assert.equal((await one('select count(*)::int n from pro_work_task_history where owner_id=$1 and work_id=$2',[owner,work])).n,3,'task history through the task writer');
 assert.equal((await one('select count(*)::int n from pro_estimate_schedule_runs where owner_id=$1',[owner])).n,1);
 await assert.rejects(()=>db.query('update pro_estimate_schedule_runs set start_date=start_date'),code('23514'));
 // Second apply appends phases after the existing ones.
 const src2=await v('select pro_estimate_schedule_source($1,$2) v',[owner,work]);assert.equal(src2.existingTasks,3);assert.equal(src2.existingPhases,2);
 const applied2=await v('select pro_estimate_schedule_apply($1,$2) v',[owner,{...proposal,actionId:crypto.randomUUID(),revision:src2.revision,phases:[proposal.phases[1]]}]);
 assert.equal((await one('select position from pro_work_schedule_phases where owner_id=$1 and id=$2',[owner,applied2.phaseIds[0]])).position,2);
 assert.equal((await one("select count(*)::int n from notifications")).n,0,'no notifications');
 pass('estimate apply: writers, FS links with lag, CAS, receipt replay, validation, append');

 // ---------- 2. Saved views ----------
 const filters={status:'open',timing:'overdue',q:'pintura',job:work,assignee:'Ana'};
 assert.deepEqual(schemas.taskViewsSchema.parse(await v('select pro_task_views_read($1,$2) v',[owner,owner])),{revision:0,capacity:20,items:[]});
 const view1=crypto.randomUUID(),saveView={action:'save',actionId:crypto.randomUUID(),viewId:view1,revision:0,name:'Atrasadas de pintura',filters};
 assert.equal(schemas.taskViewResultSchema.parse(await v('select pro_task_views_mutate($1,$2,$3) v',[owner,owner,saveView])).revision,1);
 assert.equal((await v('select pro_task_views_mutate($1,$2,$3) v',[owner,owner,saveView])).replayed,true);
 await assert.rejects(()=>db.query('select pro_task_views_mutate($1,$2,$3)',[owner,owner,{...saveView,actionId:crypto.randomUUID()}]),code('40001'));
 await assert.rejects(()=>db.query('select pro_task_views_mutate($1,$2,$3)',[owner,owner,{...saveView,actionId:crypto.randomUUID(),revision:1,viewId:crypto.randomUUID(),name:'atrasadas DE pintura'}]),code('23505'));
 for(const f of [{...filters,status:'x'},{...filters,extra:''},{...filters,q:'x'.repeat(101)}])await assert.rejects(()=>db.query('select pro_task_views_mutate($1,$2,$3)',[owner,owner,{...saveView,actionId:crypto.randomUUID(),revision:1,filters:f}]),code('22023'));
 await v('select pro_task_views_mutate($1,$2,$3) v',[owner,member,{...saveView,actionId:crypto.randomUUID(),viewId:crypto.randomUUID(),name:'Mías'}]);
 assert.deepEqual((await v('select pro_task_views_read($1,$2) v',[owner,owner])).items.map(i=>i.name),['Atrasadas de pintura'],'views are per person');
 assert.deepEqual((await v('select pro_task_views_read($1,$2) v',[owner,member])).items.map(i=>i.name),['Mías']);
 await assert.rejects(()=>db.query('select pro_task_views_read($1,$2)',[owner,rival]),code('42501'),'not in the company');
 assert.equal((await v('select pro_task_views_mutate($1,$2,$3) v',[owner,owner,{action:'delete',actionId:crypto.randomUUID(),viewId:view1,revision:1}])).revision,2);
 await assert.rejects(()=>db.query('select pro_task_views_mutate($1,$2,$3)',[owner,owner,{action:'delete',actionId:crypto.randomUUID(),viewId:view1,revision:2}]),code('P0002'));
 pass('saved task views: per person, CAS, receipts, names, validation, delete');

 // ---------- 3. Time clock and timesheets ----------
 const task1=applied.taskIds[0],clock={action:'clock_in',actionId:crypto.randomUUID(),workId:work,taskId:task1,activityId:null,billable:true,note:'',gps:{lat:9.93333,lng:-84.08333,accuracy:12}};
 await assert.rejects(()=>db.query('select pro_time_clock_in($1,$2,$3)',[owner,member,clock]),code('22023'),'location is off by default');
 await assert.rejects(()=>db.query('select pro_time_clock_settings_save($1,$2,$3)',[owner,member,{action:'settings',gpsEnabled:true,revision:0}]),code('42501'),'only admin configures');
 assert.deepEqual(await v('select pro_time_clock_settings_save($1,$2,$3) v',[owner,owner,{action:'settings',gpsEnabled:true,revision:0}]),{gpsEnabled:true,revision:1});
 await assert.rejects(()=>db.query('select pro_time_clock_in($1,$2,$3)',[owner,member,{...clock,actionId:crypto.randomUUID(),taskId:applied2.taskIds[0],workId:work2}]),code('40001'),'task of another job');
 await assert.rejects(()=>db.query('select pro_time_clock_in($1,$2,$3)',[owner,member,{...clock,actionId:crypto.randomUUID(),gps:{lat:91,lng:0,accuracy:1}}]),code('22023'));
 const opts=await v('select pro_time_clock_options($1,$2,$3) v',[owner,member,work]);assert.equal(opts.gpsEnabled,true);assert.equal(opts.tasks[0].title,'Demolición');assert.equal(opts.tasks.length,4,'both applies');
 await assert.rejects(()=>db.query('select pro_time_clock_options($1,$2,$3)',[owner,rival,work]),code('42501'));
 const clocked=await v('select pro_time_clock_in($1,$2,$3) v',[owner,member,clock]);assert.equal(clocked.location,true);assert.equal(clocked.taskId,task1);
 assert.equal((await v('select pro_time_clock_in($1,$2,$3) v',[owner,member,clock])).replayed,true);
 await assert.rejects(()=>db.query('select pro_time_clock_in($1,$2,$3)',[owner,member,{...clock,actionId:crypto.randomUUID(),gps:null,taskId:null}]),code('40001'),'one open timer per person');
 const today=(await one("select (clock_timestamp() at time zone 'America/Costa_Rica')::date::text d")).d;
 const week=(await one('select (date_trunc(\'week\',$1::date))::date::text w',[today])).w;
 let sheet=schemas.timesheetSchema.parse(await v('select pro_timesheet_read($1,$2,$3) v',[owner,owner,week]));
 assert.equal(sheet.open.length,1);assert.equal(sheet.open[0].taskTitle,'Demolición');assert.equal(sheet.open[0].location,true);assert.equal(sheet.canApprove,true);
 // Clock out through the existing timer writer (stop, review, save).
 const timer=(await v('select pro_work_timer_read($1,$2) v',[owner,member])).timer;
 const stopped=await v('select pro_work_timer_mutate($1,$2,$3) v',[owner,member,{action:'stop',actionId:crypto.randomUUID(),timerId:timer.id,revision:timer.revision}]);
 await v('select pro_work_timer_mutate($1,$2,$3) v',[owner,member,{action:'save',actionId:crypto.randomUUID(),timerId:timer.id,revision:stopped.timer?.revision??timer.revision+1,activityId:null,billable:true,note:'Cuadrilla',minutes:120,date:today}]);
 sheet=schemas.timesheetSchema.parse(await v('select pro_timesheet_read($1,$2,$3) v',[owner,owner,week]));
 const ana=sheet.people.find(p=>p.personKey==='person:'+member);assert.ok(ana,'member listed');assert.equal(ana.totalMinutes,120);assert.equal(ana.entries[0].taskTitle,'Demolición');assert.equal(ana.days.reduce((a,b)=>a+b,0),120);
 assert.ok(sheet.people.some(p=>p.personKey==='person:'+owner),'owner listed even without hours');assert.equal(JSON.stringify(sheet).includes('cost'),false,'no internal cost');
 const mine=schemas.timesheetSchema.parse(await v('select pro_timesheet_read($1,$2,$3) v',[owner,member,week]));assert.deepEqual(mine.people.map(p=>p.personKey),['person:'+member],'a member sees only their own week');assert.equal(mine.canApprove,false);
 await assert.rejects(()=>db.query('select pro_timesheet_read($1,$2,$3)',[owner,owner,'2026-11-18']),code('22023'),'not a Monday');
 const decide={action:'approve',actionId:crypto.randomUUID(),personKey:ana.personKey,weekStart:week,digest:ana.digest,note:''};
 await assert.rejects(()=>db.query('select pro_timesheet_decide($1,$2,$3)',[owner,member,decide]),code('42501'),'member cannot approve');
 await assert.rejects(()=>db.query('select pro_timesheet_decide($1,$2,$3)',[owner,owner,{...decide,actionId:crypto.randomUUID(),digest:'0'.repeat(32)}]),code('40001'),'digest mismatch');
 assert.equal(schemas.timesheetDecisionResultSchema.parse(await v('select pro_timesheet_decide($1,$2,$3) v',[owner,owner,decide])).minutes,120);
 assert.equal((await v('select pro_timesheet_decide($1,$2,$3) v',[owner,owner,decide])).replayed,true);
 await assert.rejects(()=>db.query('select pro_timesheet_decide($1,$2,$3)',[owner,owner,{...decide,actionId:crypto.randomUUID()}]),code('40001'),'already approved');
 await assert.rejects(()=>db.query('select pro_timesheet_decide($1,$2,$3)',[owner,owner,{...decide,actionId:crypto.randomUUID(),personKey:'person:'+owner,digest:sheet.people.find(p=>p.personKey==='person:'+owner).digest}]),code('22023'),'empty week');
 sheet=schemas.timesheetSchema.parse(await v('select pro_timesheet_read($1,$2,$3) v',[owner,owner,week]));assert.equal(sheet.people.find(p=>p.personKey===ana.personKey).decision.decision,'approved');assert.equal(sheet.people.find(p=>p.personKey===ana.personKey).decision.stale,false);
 // A manual entry for the same person changes the digest: the approval is marked stale.
 const t2=await v('select pro_time_clock_in($1,$2,$3) v',[owner,member,{...clock,actionId:crypto.randomUUID(),gps:null,taskId:null}]);
 const t2open=(await v('select pro_work_timer_read($1,$2) v',[owner,member])).timer;assert.equal(t2open.status,'running');assert.equal(t2.location,false);
 await v('select pro_work_timer_mutate($1,$2,$3) v',[owner,member,{action:'stop',actionId:crypto.randomUUID(),timerId:t2open.id,revision:t2open.revision}]);
 const t2row=(await v('select pro_work_timer_read($1,$2) v',[owner,member])).timer;
 await v('select pro_work_timer_mutate($1,$2,$3) v',[owner,member,{action:'save',actionId:crypto.randomUUID(),timerId:t2row.id,revision:t2row.revision,activityId:null,billable:false,note:'',minutes:30,date:today}]);
 sheet=schemas.timesheetSchema.parse(await v('select pro_timesheet_read($1,$2,$3) v',[owner,owner,week]));const ana2=sheet.people.find(p=>p.personKey===ana.personKey);
 assert.equal(ana2.totalMinutes,150);assert.equal(ana2.billableMinutes,120);assert.equal(ana2.decision.stale,true,'approval marked as changed');
 const reopen=await v('select pro_timesheet_decide($1,$2,$3) v',[owner,owner,{...decide,action:'reopen',actionId:crypto.randomUUID(),digest:ana2.digest}]);assert.equal(reopen.action,'reopen');
 await assert.rejects(()=>db.query('select pro_timesheet_decide($1,$2,$3)',[owner,owner,{...decide,action:'reopen',actionId:crypto.randomUUID(),digest:ana2.digest}]),code('40001'),'not approved');
 await assert.rejects(()=>db.query('delete from pro_timesheet_decisions'),code('23514'),'decisions append-only');
 const csv=schemas.timesheetCsv(sheet,false);assert.ok(csv.startsWith('﻿Persona;Fecha'));assert.ok(csv.includes('Ana Maestra;'+today));
 pass('time clock: location off by default, task, one open timer, timesheet, approve/stale/reopen, roles, CSV');

 // ---------- 4. Notification channels ----------
 const base=(await v('select pro_notifications_read($1,$2,$3,$4,$5) v',[owner,owner,'all',null,today])).settings;
 const ch=schemas.notificationChannelsSchema.parse(await v('select pro_notification_channels_read($1,$2) v',[owner,owner]));assert.equal(ch.revision,0);assert.ok(Object.values(ch.whatsapp).every(x=>x===false),'WhatsApp off by default');
 const prefs=Object.fromEntries(Object.entries(base.prefs).map(([e,p])=>[e,{...p,whatsapp:e==='task_assigned'}]));prefs.task_due={inApp:false,email:true,whatsapp:true};
 const chSave={actionId:crypto.randomUUID(),revision:base.revision,channelRevision:0,dueSoonDays:3,overdueGraceDays:1,prefs};
 const saved=await v('select pro_notification_channels_save($1,$2,$3) v',[owner,owner,chSave]);
 assert.equal(saved.channels.whatsapp.task_due,true);assert.equal(saved.settings.prefs.task_due.inApp,false);assert.equal(saved.settings.dueSoonDays,3);
 assert.equal((await v('select pro_notification_channels_save($1,$2,$3) v',[owner,owner,chSave])).replayed,true);
 await assert.rejects(()=>db.query('select pro_notification_channels_save($1,$2,$3)',[owner,owner,{...chSave,actionId:crypto.randomUUID()}]),code('40001'));
 await assert.rejects(()=>db.query('select pro_notification_channels_save($1,$2,$3)',[owner,owner,{...chSave,actionId:crypto.randomUUID(),channelRevision:1,prefs:{task_due:{inApp:true,email:false}}}]),code('22023'));
 await assert.rejects(()=>db.query('select pro_notification_channels_save($1,$2,$3)',[owner,owner,{...chSave,actionId:crypto.randomUUID(),channelRevision:1,prefs:{nope:{inApp:true,email:false,whatsapp:true}}}]),code('22023'));
 assert.equal((await one('select count(*)::int n from notifications')).n,0);
 pass('notification channels: WhatsApp stored with in-app/email through the existing writer, CAS, validation, nothing sent');

 // ---------- 5. Daily log crew ----------
 const log=crypto.randomUUID();
 await db.query("insert into pro_daily_logs(owner_id,work_id,id,log_date,title,summary,sections,snapshot,revision,created_by,created_by_name) values($1,$2,$3,$4,'Día 1','', '{}','{}',1,$1,'Dueña')",[owner,work,log,today]);
 const crew=schemas.dailyLogCrewSchema.parse(await v('select pro_daily_log_crew_read($1,$2,$3) v',[owner,work,log]));
 assert.deepEqual(crew.people.map(p=>p.role),['owner','member']);assert.equal(crew.crew.length,0);
 const crewSave={actionId:crypto.randomUUID(),workId:work,logId:log,revision:crew.revision,crew:[{personKey:'person:'+member,minutes:480},{personKey:'person:'+owner,minutes:null}]};
 const cs=schemas.dailyLogCrewResultSchema.parse(await v('select pro_daily_log_crew_save($1,$2) v',[owner,crewSave]));assert.equal(cs.crewCount,2);assert.equal(cs.crewMinutes,480);assert.equal(cs.revision,crew.revision+1);
 assert.equal((await v('select pro_daily_log_crew_save($1,$2) v',[owner,crewSave])).replayed,true);
 await assert.rejects(()=>db.query('select pro_daily_log_crew_save($1,$2)',[owner,{...crewSave,actionId:crypto.randomUUID()}]),code('40001'));
 await assert.rejects(()=>db.query('select pro_daily_log_crew_save($1,$2)',[owner,{...crewSave,actionId:crypto.randomUUID(),revision:cs.revision,crew:[{personKey:'person:'+rival,minutes:1}]}]),code('40001'),'not on the team');
 await assert.rejects(()=>db.query('select pro_daily_log_crew_save($1,$2)',[owner,{...crewSave,actionId:crypto.randomUUID(),revision:cs.revision,crew:[crewSave.crew[0],crewSave.crew[0]]}]),code('22023'));
 const after=await v('select pro_daily_log_crew_read($1,$2,$3) v',[owner,work,log]);assert.deepEqual(after.crew.map(c=>[c.personName,c.minutes]),[['Ana Maestra',480],[crew.people[0].name,null]]);
 assert.equal((await one("select count(*)::int n from pro_daily_log_history where owner_id=$1 and log_id=$2",[owner,log])).n,1,'journal writer history');
 const cleared=await v('select pro_daily_log_crew_save($1,$2) v',[owner,{...crewSave,actionId:crypto.randomUUID(),revision:cs.revision,crew:[]}]);assert.equal(cleared.crewCount,null);
 pass('daily log crew: team people, minutes, summary through the journal writer, CAS, validation');

 // ---------- 6. Custom roles ----------
 const cr=schemas.customRolesSchema.parse(await v('select pro_custom_roles_read($1,$2) v',[owner,owner]));assert.equal(cr.canManage,true);assert.ok(cr.matrix.member.includes('work.write'));
 assert.equal((await v('select pro_custom_roles_read($1,$2) v',[member,owner])).canManage,false);
 const role=crypto.randomUUID(),saveRole={action:'save',actionId:crypto.randomUUID(),roleId:role,revision:0,name:'Cuadrilla sin solicitudes',baseRole:'member',capabilities:['read','work.write']};
 await assert.rejects(()=>db.query('select pro_custom_roles_mutate($1,$2,$3)',[member,owner,saveRole]),code('42501'),'only admins manage roles');
 await assert.rejects(()=>db.query('select pro_custom_roles_mutate($1,$2,$3)',[owner,owner,{...saveRole,capabilities:['read','sales.write']}]),code('22023'),'cannot exceed the base role');
 await assert.rejects(()=>db.query('select pro_custom_roles_mutate($1,$2,$3)',[owner,owner,{...saveRole,capabilities:['work.write']}]),code('22023'),'read is required');
 assert.equal((await v('select pro_custom_roles_mutate($1,$2,$3) v',[owner,owner,saveRole])).revision,1);
 assert.equal(await v("select pro_role_require($1,$2,'lead.write') v",[member,owner]),'member','base role allows before assignment');
 await v('select pro_custom_roles_mutate($1,$2,$3) v',[owner,owner,{action:'assign',actionId:crypto.randomUUID(),memberId:memberRow,roleId:role}]);
 await assert.rejects(()=>db.query("select pro_role_require($1,$2,'lead.write')",[member,owner]),code('42501'),'custom role removes lead.write');
 assert.equal(await v("select pro_role_require($1,$2,'work.write') v",[member,owner]),'member');
 assert.deepEqual(await v("select pro_team_route_authorize($1,$2,'POST','/api/pro/lead-board') v",[member,owner]),{allowed:false,reason:'role',role:'member',capability:'lead.write'},'route gate honours the custom role');
 assert.equal((await v("select pro_team_route_authorize($1,$2,'POST','/api/pro/work-tasks') v",[member,owner])).allowed,true,'work.write still allowed');
 assert.deepEqual((await v('select pro_team_workspace_resolve($1,$2) v',[member,owner])).capabilities,['read','work.write'],'UI capabilities narrowed');
 assert.equal(await v("select pro_role_require($1,$2,'team.manage') v",[owner,owner]),'admin','owner unaffected');
 await assert.rejects(()=>db.query('select pro_custom_roles_mutate($1,$2,$3)',[owner,owner,{action:'archive',actionId:crypto.randomUUID(),roleId:role,revision:1}]),code('40001'),'in use');
 await v('select pro_custom_roles_mutate($1,$2,$3) v',[owner,owner,{action:'assign',actionId:crypto.randomUUID(),memberId:memberRow,roleId:null}]);
 assert.equal(await v("select pro_role_require($1,$2,'lead.write') v",[member,owner]),'member','unassigned: base role again');assert.deepEqual((await v('select pro_team_workspace_resolve($1,$2) v',[member,owner])).capabilities,cr.matrix.member);
 assert.equal((await v('select pro_custom_roles_mutate($1,$2,$3) v',[owner,owner,{action:'archive',actionId:crypto.randomUUID(),roleId:role,revision:1}])).revision,2);
 assert.equal((await v('select pro_custom_roles_read($1,$2) v',[owner,owner])).roles[0].archived,true);
 await v('select pro_custom_roles_mutate($1,$2,$3) v',[owner,owner,{action:'restore',actionId:crypto.randomUUID(),roleId:role,revision:2}]);
 await v('select pro_custom_roles_mutate($1,$2,$3) v',[owner,owner,{action:'assign',actionId:crypto.randomUUID(),memberId:memberRow,roleId:role}]);
 await db.query('delete from pro_company_custom_roles where owner_id=$1',[owner]);
 assert.equal((await one('select count(*)::int n from pro_company_member_custom_roles where owner_id=$1',[owner])).n,0,'account deletion cascades assignments');
 pass('custom roles: clone restricts only, gate intersection, admin only, archive guard');

 // ---------- Grants, RLS, reapply ----------
 for(const t of ['pro_ops_actions','pro_estimate_schedule_runs','pro_task_center_views','pro_time_clock_details','pro_timesheet_decisions','pro_notification_channel_prefs','pro_daily_log_crew','pro_company_custom_roles'])
  assert.equal((await one('select relrowsecurity r from pg_class where oid=$1::regclass',['public.'+t])).r,true,t+' RLS');
 assert.equal((await one("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'pro_ops_%' or p.proname like 'pro_timesheet_%' or p.proname like 'pro_custom_roles_%') and has_function_privilege('public',p.oid,'execute')")).n,0,'no public execute');
 await db.exec(moduleSql);await db.exec(moduleSql);
 assert.equal((await v('select pro_task_views_read($1,$2) v',[owner,member])).items.length,1,'reapply keeps data');
 pass('RLS, grants and idempotent reapply');
 console.log(`PASS ${checks}/${checks} groups`);
}finally{await db.close();}
