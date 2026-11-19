// Isolated reminder verifier: real notification/push migrations, no network, shared database or delivery.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),uid=()=>crypto.randomUUID(),owner=uid(),other=uid(),client=uid(),stranger=uid(),professional=uid();
const day=new Date(Date.now()+3*86400000).toISOString().slice(0,10),at=hour=>`${day}T${String(hour).padStart(2,'0')}:00:00-06:00`;
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;
create table profiles(id uuid primary key,full_name text,role text,is_disabled boolean,is_provider boolean);
create table professionals(id uuid primary key,profile_id uuid not null references profiles(id),business_name text,slug text,is_banned boolean);
create table quotes(id uuid primary key default gen_random_uuid(),professional_id uuid not null references professionals(id) on delete cascade,client_id uuid references profiles(id) on delete cascade,booking_id uuid,project_id uuid,proposal_id uuid,title text,client_name text,client_phone text,client_cedula text,client_email text,public_code text not null unique,quote_number integer,items jsonb not null default '[]',tax_mode text not null default 'incluido' check(tax_mode in ('incluido','mas_iva','exento')),subtotal integer not null default 0,tax_amount integer not null default 0,total integer not null default 0,notes text,valid_until date,status text not null default 'sent' check(status in ('sent','accepted','declined','withdrawn')),accepted_at timestamptz,declined_at timestamptz,deleted_at timestamptz,created_source_host text,created_app_environment text,created_supabase_project_ref text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(professional_id,quote_number));
alter table quotes enable row level security;
create policy quotes_select_client on quotes for select to authenticated using(client_id=auth.uid());
create policy quotes_select_professional on quotes for select to authenticated using(exists(select 1 from professionals p where p.id=quotes.professional_id and p.profile_id=auth.uid()));
grant select on quotes,professionals to authenticated;grant all on profiles,professionals,quotes to service_role;
`);
for(const [id,role] of [[owner,'professional'],[other,'professional'],[client,'client'],[stranger,'client']])await db.query('insert into profiles values($1,$2,$3,false,$4)',[id,role,role,role==='professional']);
await db.query('insert into professionals values($1,$2,$3,$4,false)',[professional,owner,'Proveedor','proveedor-local']);
const run=async file=>db.exec(await readFile('docs/pro/sql/'+file,'utf8'));
await run('memberships-draft.sql');await run('pro-entitled-draft.sql');
const original={version:1,clients:[{id:'reservation-'+client,name:'Contacto intacto',email:'private@example.test',phone:'88881111',notes:'Nota privada original',archived:false}],products:[],movements:[],work:[],availability:[{start:at(8),end:at(18)}],quotes:[],quoteLinks:[],social:[]};
await db.query('select pro_save_workspace($1,$2,0)',[owner,original]);await db.query("insert into pro_memberships(user_id,status) values($1,'active')",[owner]);
// Actual Pro module SQL installs real keys, history, guards, triggers and service-only grants.
for(const file of ['catalog-storage-draft.sql','catalog-item-types-local.sql','catalog-mutations-draft.sql','catalog-pages-draft.sql','panel-storage-draft.sql','panel-queries-draft.sql','appointment-requests-local.sql','client-operations-draft.sql','invoice-drafts-local.sql','visit-preparation-local.sql','quote-choices-local.sql','appointment-reschedule-local.sql','appointment-opt-in-local.sql','appointment-schedule-local.sql'])await run(file);
// Install the real notification table/policies/check and complete token/outbox/claim migrations.
await db.exec("create function public.uuid_generate_v4() returns uuid language sql as $$select gen_random_uuid()$$;create table auth.users(id uuid primary key);create function auth.role() returns text language sql as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),current_user)$$;");
const notifications=await readFile('supabase/migrations/002_sprint2.sql','utf8');await db.exec(notifications.slice(notifications.indexOf('CREATE TABLE IF NOT EXISTS public.notifications'),notifications.indexOf('-- SAVED PROFESSIONALS')));
await db.exec(await readFile('supabase/migrations/018_notifications_delete_policy.sql','utf8'));
await db.exec(await readFile('supabase/migrations/235_avisos_resenas_y_precio.sql','utf8'));
await db.exec(await readFile('supabase/migrations/140_user_push_tokens.sql','utf8'));
await db.exec(await readFile('supabase/migrations/167_notification_push_outbox.sql','utf8'));
await db.exec(await readFile('supabase/migrations/201_push_outbox_no_avisos_viejos.sql','utf8'));
// Current once-notice trigger returns immediately for appointment and other non-campaign types.
const once=await readFile('supabase/migrations/238_correo_automatizado_coordinado.sql','utf8'),start=once.indexOf('create or replace function public.capture_once_notification_receipt()'),end=once.indexOf('\n$$;',start)+4;await db.exec(once.slice(start,end));await db.exec('create trigger trg_capture_once_notification_receipt before insert on notifications for each row execute function capture_once_notification_receipt();grant select,update,delete on notifications to authenticated;grant all on notifications to service_role;');
await run('appointment-notifications-local.sql');
const preserved=async()=>({contacts:(await db.query('select to_jsonb(c) row from pro_clients c order by id')).rows,legacy:(await db.query('select * from pro_workspace_legacy_backup')).rows,panel:(await db.query('select * from pro_panel_legacy_backup')).rows});
const before=await preserved(),priorCheck=(await db.query("select pg_get_expr(conbin,conrelid) v from pg_constraint where conrelid='notifications'::regclass and conname='notifications_type_check'")).rows[0].v;
const sql=await readFile('docs/pro/sql/appointment-reminders-local.sql','utf8');await db.exec(sql);
const extendedCheck=(await db.query("select pg_get_expr(conbin,conrelid) v from pg_constraint where conrelid='notifications'::regclass and conname='notifications_type_check'")).rows[0].v;
for(const [,type]of priorCheck.matchAll(/'([^']+)'::text/g))assert.ok(extendedCheck.includes("'"+type+"'::text"));
await db.exec("set role service_role;select set_config('request.jwt.claim.role','service_role',false);");
const preference=async(actor,input=null)=>(await db.query('select pro_appointment_reminder_preferences_record($1,$2) r',[actor,input])).rows[0].r;
const runAt=async(asOf,limit=100)=>(await db.query('select pro_appointment_reminders_run($1,$2) r',[asOf,limit])).rows[0].r;
const mutate=async(actor,input)=>(await db.query('select pro_appointment_mutate($1,$2) r',[actor,input])).rows[0].r;
const dueOf=start=>new Date(Date.parse(start)-86400000).toISOString();
const shift=(instant,ms)=>new Date(Date.parse(instant)+ms).toISOString();
const make=(hour,patch={})=>({action:'create',id:uid(),actionId:uid(),professionalId:professional,service:'PRIVATE_SERVICE',durationMinutes:60,locationKind:'customer',locationText:'PRIVATE_ADDRESS',note:'PRIVATE_NOTE',start:at(hour),preferredDay:null,preference:'',...patch});
const confirm=async(request)=>mutate(owner,{action:'confirm',id:request.id,actionId:uid(),revision:request.revision});
const notices=async()=>(await db.query("select id,user_id,type,title,message,data,read from notifications where type like 'pro_appointment_reminder_%' order by created_at,id")).rows;
const count=async(table)=>(await db.query('select count(*)::int n from '+table)).rows[0].n;
const rollback=async(fn)=>{await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}};
assert.equal(await count('pro_appointment_reminder_rollout'),0);assert.equal(await count('pro_appointment_reminder_preferences'),0);
assert.deepEqual(await preference(client),{enabled:false,revision:0,available:false});
await assert.rejects(()=>preference(client,{enabled:true,expectedRevision:0,actionId:uid()}),e=>e.code==='42501');
await assert.rejects(()=>preference(stranger,{enabled:false,expectedRevision:0,actionId:null}),e=>e.code==='22023');
await assert.rejects(()=>preference(client,{enabled:false,expectedRevision:0,actionId:uid(),userId:owner}),e=>e.code==='22023');
await db.query('select pro_appointment_preferences_record($1,$2)',[owner,{actionId:uid(),revision:0,enabled:true}]);
const request=await mutate(client,make(8)),confirmed=await confirm(request),due=dueOf(at(8));
assert.deepEqual(await runAt(due),{created:0,invalidated:0,hasMore:false});
// Technical opt-in is separate and timestamp-protected; never enables an existing account by installation.
await db.query('insert into pro_appointment_reminder_rollout(owner_id,enabled) values($1,true)',[owner]);
const rolloutSince=(await db.query('select enabled_since from pro_appointment_reminder_rollout where owner_id=$1',[owner])).rows[0].enabled_since;
await db.query("update pro_appointment_reminder_rollout set enabled_since='2000-01-01' where owner_id=$1",[owner]);assert.deepEqual((await db.query('select enabled_since from pro_appointment_reminder_rollout where owner_id=$1',[owner])).rows[0].enabled_since,rolloutSince);
assert.equal((await preference(client)).available,true);assert.equal((await preference(stranger)).available,false);
const enable={enabled:true,expectedRevision:0,actionId:uid()};assert.deepEqual(await preference(client,enable),{enabled:true,revision:1,available:true});assert.deepEqual(await preference(client,enable),{enabled:true,revision:1,available:true});
await assert.rejects(()=>preference(client,{...enable,enabled:false}),e=>e.code==='22023');await assert.rejects(()=>preference(client,{enabled:false,expectedRevision:0,actionId:uid()}),e=>e.code==='40001');
await preference(owner,{enabled:true,expectedRevision:0,actionId:uid()});
// No membership dependency for the customer or an already confirmed appointment.
await rollback(async()=>{await db.query("update pro_memberships set expires_at=now()-interval '1 day' where user_id=$1",[owner]);assert.equal((await preference(client)).available,true);assert.equal((await runAt(due)).created,2);});
for(const zone of ['UTC','America/Costa_Rica','Asia/Tokyo'])await rollback(async()=>{await db.query("select set_config('TimeZone',$1,true)",[zone]);assert.equal((await runAt(due)).created,2);});
assert.equal((await runAt(shift(due,-1))).created,0);assert.equal((await runAt(shift(due,15*60000))).created,0);
await rollback(async()=>{assert.equal((await runAt(shift(due,15*60000-1))).created,2);});
// Each eligibility timestamp is checked separately against due, using controlled fixture history.
await rollback(async()=>{await db.query('update pro_appointment_events set at=$1 where request_id=$2',[shift(due,1),request.id]);assert.equal((await runAt(shift(due,60000))).created,0);});
await rollback(async()=>{await db.query('update pro_appointment_reminder_preferences set enabled_since=$1',[shift(due,1)]);assert.equal((await runAt(shift(due,60000))).created,0);});
// An active recipient independently controls only their own reminder.
await rollback(async()=>{await preference(owner,{enabled:false,expectedRevision:1,actionId:uid()});assert.equal((await runAt(due)).created,1);assert.equal((await notices())[0].user_id,client);});
await rollback(async()=>{await db.query('update profiles set is_disabled=true where id=$1',[client]);assert.equal((await runAt(due)).created,1);assert.equal((await notices())[0].user_id,owner);});
await rollback(async()=>{await db.query('update profiles set is_disabled=true where id=$1',[owner]);assert.equal((await runAt(due)).created,0);});
await rollback(async()=>{await db.query('update professionals set is_banned=true where id=$1',[professional]);assert.equal((await runAt(due)).created,0);});
// Malformed historical identity never becomes a reminder candidate, even with the same name.
await rollback(async()=>{await db.query('update pro_appointment_requests set client_user_id=$1 where id=$2',[stranger,request.id]);assert.equal((await runAt(due)).created,0);});
const one=await runAt(due,1);assert.deepEqual(one,{created:1,invalidated:0,hasMore:true});assert.deepEqual(await runAt(due,1),{created:1,invalidated:0,hasMore:false});assert.equal((await runAt(due)).created,0);assert.equal(await count('pro_appointment_reminder_receipts'),2);
for(const row of await notices()){assert.deepEqual(Object.keys(row.data).sort(),['action','invalidated','link','push_suppressed','request_id','version']);assert.equal(row.data.invalidated,false);assert.equal(row.data.push_suppressed,true);assert.ok(!JSON.stringify(row).includes('PRIVATE_'));assert.equal(row.user_id===owner,row.type==='pro_appointment_reminder_provider');}
// Dismissal removes only its notification. Repeating the same due run never resurrects it.
const dismissed=(await notices())[0];await db.query('delete from notifications where id=$1',[dismissed.id]);assert.equal((await runAt(due)).created,0);assert.equal((await db.query('select notification_id from pro_appointment_reminder_receipts where recipient_id=$1',[dismissed.user_id])).rows[0].notification_id,null);
const historical=(await notices())[0];await db.query('update notifications set read=true where id=$1',[historical.id]);
// Pending rescheduling retains the original reminder. Accepted new timing invalidates it, preserving read/history/receipt.
const proposal={action:'propose',requestId:request.id,id:uid(),actionId:uid(),requestRevision:confirmed.revision,start:at(9),durationMinutes:60,note:'PRIVATE_CHANGE'};
const change=(await db.query('select pro_appointment_reschedule_mutate($1,$2) r',[owner,proposal])).rows[0].r;
assert.equal((await notices())[0].data.invalidated,false);
await db.query('select pro_appointment_reschedule_mutate($1,$2)',[client,{action:'accept',requestId:request.id,id:proposal.id,actionId:uid(),revision:change.revision}]);
assert.equal((await notices())[0].id,historical.id);assert.equal((await notices())[0].read,true);assert.equal((await notices())[0].data.invalidated,true);assert.equal(await count('pro_appointment_reminder_receipts'),2);
assert.ok((await db.query('select invalidated_at from pro_appointment_reminder_receipts where request_id=$1',[request.id])).rows.every(row=>row.invalidated_at));
assert.equal((await runAt(due)).created,0);assert.equal((await runAt(dueOf(at(9)))).created,2);
// Same timing but a new confirmation event is a distinct source and invalidates history without reemitting its tuple.
await db.query("insert into pro_appointment_events(request_id,actor_id,side,action,start_at,end_at,status) values($1,$2,'provider','confirm',$3,$4,'confirmed')",[request.id,owner,at(9),at(10)]);
assert.ok((await notices()).every(row=>row.data.invalidated));assert.equal((await runAt(dueOf(at(9)))).created,0);
// Cancellation and completion invalidate receipts/notices atomically. No notice row or read history is deleted.
const cancelRequest=await mutate(client,make(11)),cancelConfirmed=await confirm(cancelRequest);assert.equal((await runAt(dueOf(at(11)))).created,2);const beforeCancel=await count('notifications');await mutate(client,{action:'cancel',id:cancelRequest.id,actionId:uid(),revision:cancelConfirmed.revision,note:''});assert.equal(await count('notifications'),beforeCancel);assert.ok((await notices()).filter(row=>row.data.request_id===cancelRequest.id).every(row=>row.data.invalidated));
const completeRequest=await mutate(client,make(12)),completeConfirmed=await confirm(completeRequest);assert.equal((await runAt(dueOf(at(12)))).created,2);await db.query("update pro_work set stage='completed' where user_id=$1 and id=$2",[owner,completeConfirmed.workId]);assert.ok((await notices()).filter(row=>row.data.request_id===completeRequest.id).every(row=>row.data.invalidated));
// No immediate reminder for a late-confirmed appointment: due is already before rollout activation.
const lateStart=new Date(Math.ceil((Date.now()+12*3600000)/3600000)*3600000).toISOString(),lateEnd=shift(lateStart,3600000),lateDue=dueOf(lateStart);
await db.query('insert into pro_availability(user_id,start,"end") values($1,$2,$3)',[owner,lateStart,lateEnd]);const lateRequest=await mutate(client,make(13,{start:lateStart}));await confirm(lateRequest);
await rollback(async()=>{await db.query('update pro_appointment_events set at=$1 where request_id=$2',[shift(lateDue,-1),lateRequest.id]);await db.query('update pro_appointment_reminder_preferences set enabled_since=$1',[shift(lateDue,-1)]);assert.equal((await runAt(shift(lateDue,60000))).created,0);});
assert.equal((await runAt(new Date().toISOString())).created,0);
// Forced insertion failure rolls back the receipt and notice together; an unchanged retry succeeds.
const retryRequest=await mutate(client,make(14)),retryConfirmed=await confirm(retryRequest);await db.exec("reset role;alter table notifications add constraint isolated_reminder_failure check(type not like 'pro_appointment_reminder_%') not valid;set role service_role;");const receiptsBefore=await count('pro_appointment_reminder_receipts'),noticesBefore=await count('notifications');await assert.rejects(()=>runAt(dueOf(at(14))),e=>e.code==='23514');assert.equal(await count('pro_appointment_reminder_receipts'),receiptsBefore);assert.equal(await count('notifications'),noticesBefore);await db.exec('reset role;alter table notifications drop constraint isolated_reminder_failure;set role service_role;');assert.equal((await runAt(dueOf(at(14)))).created,2);
// Invalidating a reminder is part of the source transaction too. A failed
// notification update cannot leave the appointment cancelled with stale history.
await db.exec("reset role;alter table notifications add constraint isolated_invalidation_failure check(type not like 'pro_appointment_reminder_%' or data->>'invalidated'='false') not valid;set role service_role;");
const cancelRetry={action:'cancel',id:retryRequest.id,actionId:uid(),revision:retryConfirmed.revision,note:''};
await assert.rejects(()=>mutate(client,cancelRetry),e=>e.code==='23514');
assert.equal((await db.query('select status from pro_appointment_requests where id=$1',[retryRequest.id])).rows[0].status,'confirmed');
assert.ok((await notices()).filter(row=>row.data.request_id===retryRequest.id).every(row=>row.data.invalidated===false));
assert.ok((await db.query('select invalidated_at from pro_appointment_reminder_receipts where request_id=$1',[retryRequest.id])).rows.every(row=>row.invalidated_at===null));
await db.exec('reset role;alter table notifications drop constraint isolated_invalidation_failure;set role service_role;');
await mutate(client,cancelRetry);assert.ok((await notices()).filter(row=>row.data.request_id===retryRequest.id).every(row=>row.data.invalidated===true));
// Rollout/personal toggles do not backfill rows. Replay recovers its original saved value, never inverts a toggle.
await db.query('update pro_appointment_reminder_rollout set enabled=false where owner_id=$1',[owner]);const togglesBefore=await count('notifications');assert.equal((await preference(client,enable)).enabled,true);assert.equal((await preference(client)).available,false);await preference(client,{enabled:false,expectedRevision:1,actionId:uid()});await db.query('update pro_appointment_reminder_rollout set enabled=true where owner_id=$1',[owner]);assert.equal(await count('notifications'),togglesBefore);assert.equal((await preference(client)).enabled,false);
const reenabled=await preference(client,{enabled:true,expectedRevision:2,actionId:uid()});assert.equal(reenabled.revision,3);assert.equal(await count('notifications'),togglesBefore);
// Suppressed outbox is complete and nonclaimable; payload rejects SQL/JSON null, private extras and unsafe links.
const example=(await notices())[0];for(const data of [null,[],{...example.data,invalidated:null},{...example.data,link:null},{...example.data,push_suppressed:false},{...example.data,extra:'PRIVATE_NOTE'},{...example.data,version:null},{...example.data,action:'confirmed'}])await assert.rejects(()=>db.query('insert into notifications(user_id,type,title,message,data) values($1,$2,$3,$4,$5)',[owner,'pro_appointment_reminder_provider','Prueba','Prueba',data]),e=>e.code==='23514');
assert.ok((await db.query('select status,attempts,completed_at from notification_push_outbox')).rows.every(row=>row.status==='suppressed'&&row.attempts===0&&row.completed_at));assert.equal((await db.query("select * from claim_notification_push_outbox('isolated-reminders',100,120)")).rows.length,0);assert.equal(await count('notification_push_deliveries'),0);
for(const [clock,limit]of [[null,1],['infinity',1],[due,0],[due,501]])await assert.rejects(()=>runAt(clock,limit),e=>e.code==='22023');
await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[client]);await db.exec('set role authenticated');assert.ok((await db.query('select user_id from notifications')).rows.every(row=>row.user_id===client));await db.exec('reset role');
for(const role of ['anon','authenticated']){
 await db.exec('set role '+role);
 for(const table of ['pro_appointment_reminder_rollout','pro_appointment_reminder_preferences','pro_appointment_reminder_preference_actions','pro_appointment_reminder_receipts'])await assert.rejects(()=>count(table),e=>e.code==='42501');
 await assert.rejects(()=>preference(client),e=>e.code==='42501');await assert.rejects(()=>runAt(due),e=>e.code==='42501');await assert.rejects(()=>db.query('select * from pro_appointment_reminder_due($1)',[due]),e=>e.code==='42501');await assert.rejects(()=>db.query('select pro_appointment_reminder_invalidate($1)',[request.id]),e=>e.code==='42501');await db.exec('reset role');
}
const snapshot=await notices(),receiptSnapshot=(await db.query('select to_jsonb(r) r from pro_appointment_reminder_receipts r order by request_id,scheduled_start,recipient_id')).rows;await db.exec(sql);assert.deepEqual(await notices(),snapshot);assert.deepEqual((await db.query('select to_jsonb(r) r from pro_appointment_reminder_receipts r order by request_id,scheduled_start,recipient_id')).rows,receiptSnapshot);assert.deepEqual(await preserved(),before);assert.equal((await db.query("select count(*)::int n from pg_trigger where tgrelid='notifications'::regclass and not tgisinternal and tgname ilike '%mail%'")).rows[0].n,0);
await db.close();console.log('PASS personal reminders: real Pro/notification/outbox schemas, opt-in CAS/replay, protected rollout timestamps, 24h/15min boundaries, source identity, independent preferences, finite batches without emitted-row starvation, durable dismissal, reschedule/complete/cancel history invalidation, atomic rollback, immutable read state, payload privacy, RLS/service-only clock, suppressed nonclaimable outbox and preserved contacts/history/reinstallation. PGlite serializes connections; real concurrency remains an explicit shared-local QA check.');
