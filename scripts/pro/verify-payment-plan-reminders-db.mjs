// LOCAL PRO ONLY (row 57, 2026-11-23): disposable in-memory PGlite verification of migration 382 (installment mora + reminders) and of the reminder adapter.
// Installs the whole ordered local manifest, creates a real plan through pro_payment_plan_mutate, then checks mora levels, the reminder log (once per level and channel,
// skipped channels without contact), the sandbox adapter (never a real send, live mode refuses), message text ES/EN, immutability, authorization, grants and reapply.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {localSqlManifest,localSqlDependencies} from './local-sql-manifest.mjs';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
// The API routes parse every read with the strict schemas of src/lib/pro/payment-plan.ts: check the SQL against them here.
const libRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(s,c,n){return n(c.parentURL?.startsWith(libRoot)&&s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);},load(u,c,n){return u.startsWith(libRoot)&&u.endsWith('.ts')?{format:'module',source:ts.transpileModule(readFileSync(new URL(u),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true}:n(u,c);}});
const schemas=await import('../../src/lib/pro/payment-plan.ts');
const adapter=await import('../../src/lib/pro/reminders/channel.ts'),messages=await import('../../src/lib/pro/reminders/message.ts');
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
 moduleSql=await readFile(new URL('supabase/migrations/382_pro_28_payment_plan_reminders.sql',root),'utf8');await db.exec(moduleSql);
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


 const mora=async(q={},actor=owner)=>{const v=(await one('select pro_payment_plan_mora_read($1,$2) v',[actor,q])).v;if(v)schemas.paymentPlanMoraSchema.parse(v);return v;};
 const prepare=async(i={},actor=owner)=>(await one('select pro_payment_plan_reminders_prepare($1,$2) v',[actor,i])).v;
 const queue=async(actor=owner)=>(await one('select pro_payment_plan_reminders_queue($1) v',[actor])).v;
 const mark=async(i,actor=owner)=>(await one('select pro_payment_plan_reminders_mark($1,$2) v',[actor,i])).v;
 const addDays=(d,n)=>{const x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
 const today=(await one("select (now() at time zone 'America/Costa_Rica')::date::text d")).d;
 const clientId='budget-client';
 await db.query("update pro_clients set email='cliente@example.com',phone='+506 8888-0000' where user_id=$1 and id=$2",[owner,clientId]);
 const core=Number((await one('select revision from pro_workspace_core where user_id=$1',[owner])).revision);
 await db.query('select pro_record_client_operation($1,$2,$3)',[owner,{actionId:crypto.randomUUID(),clientId,workId:work,kind:'agreement',amountCents:1000000,note:'Acuerdo'},core]);
 assert.equal((await mora()).rows.length,0,'no plan, no mora');
 const planId=crypto.randomUUID();
 const items=[[-40],[-10],[-3],[2],[30]].map(([d])=>({amountCents:10000,dueDate:addDays(today,d),milestoneId:null,taskId:null}));
 await db.query('select pro_payment_plan_mutate($1,$2)',[owner,{action:'create',actionId:crypto.randomUUID(),workId:work,planId,totalCents:50000,downPaymentCents:0,downPaymentDate:null,schedule:{mode:'custom',items},feeCents:0,lateFeeCents:500,terms:''}]);

 // ---- Mora states ----
 const m=await mora({workId:work});
 assert.deepEqual(m.rows.map(r=>[r.kind,r.daysOverdue,r.pendingCents,r.lateFeeCents]),[['late_severe',40,10000,500],['late_moderate',10,10000,500],['late_light',3,10000,500],['upcoming',0,10000,0]]);
 assert.deepEqual([m.summary.lateCount,m.summary.lateCents,m.summary.lateFeeCents,m.summary.upcomingCount,m.summary.worstDays,m.summary.worstLevel,m.summary.clientCount],[3,30000,1500,1,40,'late_severe',1]);
 assert.deepEqual((await mora()).summary,m.summary,'all works scope matches');
 pass('mora levels (light 1-7, moderate 8-30, severe 31+), upcoming within 3 days, flat late fee per overdue installment');

 // ---- Reminder log: once per installment, level and channel ----
 const p1=await prepare({workId:work});
 assert.deepEqual([p1.created,p1.app,p1.email,p1.sms,p1.withoutContact],[12,4,4,4,0]);
 assert.deepEqual(await prepare({workId:work}),{created:0,app:0,email:0,sms:0,withoutContact:0},'idempotent: nothing is repeated');
 const q=await queue();assert.equal(q.length,8);assert.ok(q.every(r=>r.to));
 await db.query("update pro_clients set phone='' where user_id=$1 and id=$2",[owner,clientId]);
 await db.query("update pro_payment_plan_reminders set status='sandbox_sent',sent_at=now() where channel='sms' and status='queued' and owner_id=$1",[owner]);
 const first=(await mora({workId:work})).reminders;assert.equal(first.filter(r=>r.channel==='app').every(r=>r.status==='recorded'),true);
 pass('reminders recorded once per installment, level and channel; app tray recorded, e-mail and SMS queued');

 // ---- Sandbox adapter and messages ----
 const channel=new adapter.SandboxReminderChannel();assert.equal(channel.mode,'sandbox');
 const emailRow=q.find(r=>r.channel==='email'&&r.kind==='late_severe');
 const msg=messages.reminderMessage({...emailRow,workTitle:'Remodelación de cocina',to:emailRow.to},'es');
 assert.match(msg.body,/Estimado\(a\) /);assert.match(msg.body,/venció el/);assert.match(msg.body,/40 días de atraso/);assert.match(msg.body,/comunicarse con nosotros/);assert.equal(msg.subject,'Cuota vencida');
 const en=messages.reminderMessage({...emailRow,workTitle:'Remodelación de cocina',to:emailRow.to},'en');assert.match(en.body,/40 days overdue/);assert.equal(en.subject,'Overdue installment');
 const sms=messages.reminderMessage({...q.find(r=>r.channel==='sms'),to:'+506 8888-0000',workTitle:'X'},'es');assert.equal(sms.subject,null);assert.ok(sms.body.length<=480);
 const sent=await channel.send(msg);assert.equal(sent.ok,true);assert.match(sent.providerRef,/^sandbox-[0-9a-f]{24}$/);assert.equal(channel.outbox.length,1,'recorded in memory only');
 assert.deepEqual(await channel.send({...msg,to:'no-es-correo'}),{ok:false,error:'invalid_target'});
 assert.equal((await adapter.resolveReminderChannel({NODE_ENV:'development'})).mode,'sandbox');assert.equal((await adapter.resolveReminderChannel({NODE_ENV:'production'})).mode,'sandbox','live needs an explicit flag');
 const live=adapter.resolveReminderChannel({NODE_ENV:'production',PRO_REMINDERS_LIVE:'1'});assert.equal(live.mode,'live');assert.deepEqual(await live.send(msg),{ok:false,error:'provider_not_configured'});
 for(const r of q.filter(x=>x.channel==='email'))assert.equal((await mark({id:r.id,status:'sandbox_sent',providerRef:'sandbox-'+r.id.slice(0,8)})).status,'sandbox_sent');
 await assert.rejects(()=>mark({id:emailRow.id,status:'failed',providerRef:null}),code('40001'),'a sent reminder cannot be marked again');
 await assert.rejects(()=>mark({id:crypto.randomUUID(),status:'sent',providerRef:null}),code('22023'));
 assert.equal((await queue()).filter(r=>r.channel==='email').length,0);
 pass('sandbox adapter never sends for real (live refuses), messages in Spanish with usted and English, results recorded once');

 // ---- Escalation creates one new reminder per level, never repeats ----
 await db.exec('set session_replication_role=replica');await db.query("update pro_payment_plan_items set due_date=due_date-30 where owner_id=$1 and plan_id=$2 and seq=3",[owner,planId]);await db.exec('set session_replication_role=origin');
 const esc=await prepare({workId:work});assert.ok(esc.created>0&&esc.app>0,'a new level is a new reminder');
 assert.deepEqual(await prepare({workId:work}),{created:0,app:0,email:0,sms:0,withoutContact:esc.withoutContact});
 pass('escalation to a higher level records a new reminder once');

 // ---- Immutability, authorization, grants, reapply ----
 await assert.rejects(()=>db.query("update pro_payment_plan_reminders set pending_cents=1 where owner_id=$1",[owner]),code('23514'));
 await assert.rejects(()=>db.query("delete from pro_payment_plan_reminders where owner_id=$1",[owner]),code('23514'));
 assert.equal((await mora({},rival)).rows.length,0,'another owner sees nothing');
 assert.equal(await mora({workId:work},rival).catch(()=>null),null);
 await assert.rejects(()=>prepare({workId:work},rival),code('42501'));
 for(const bad of [{extra:1},{workId:5}])await assert.rejects(()=>prepare(bad),code('22023'));
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`);
 await assert.rejects(()=>db.query('select * from pro_payment_plan_reminders'),code('42501'));await db.exec('reset role');
 for(const fn of ['pro_payment_plan_mora_read(uuid,jsonb)','pro_payment_plan_reminders_prepare(uuid,jsonb)','pro_payment_plan_reminders_queue(uuid)','pro_payment_plan_reminders_mark(uuid,jsonb)','pro_payment_plan_mora_rows(uuid,text)'])
  for(const [role,yes] of [['anon',false],['authenticated',false],['service_role',true]])assert.equal((await one('select has_function_privilege($1,$2,$3) v',[role,'public.'+fn,'EXECUTE'])).v,yes,role+' '+fn);
 const snap=JSON.stringify((await mora({workId:work})).summary);await db.exec(moduleSql);assert.equal(JSON.stringify((await mora({workId:work})).summary),snap);
 pass('immutable log, authorization, RLS/grants service_role only, idempotent reapply');
 console.log(`${checks} payment-plan reminder contract groups passed; in-memory PGlite only.`);
}finally{await db.close();}
