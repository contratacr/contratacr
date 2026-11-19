// Real PostgreSQL concurrency verifier. Run only after the additive local SQL is installed.
// No migrations, scheduler, external delivery, or existing-account changes.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {parseEnv} from 'node:util';
import {createClient} from '@supabase/supabase-js';
if(process.argv.slice(2).join(' ')!=='--run-local')throw Error('Explicit --run-local required; install local SQL separately first.');
const env=parseEnv(await readFile(new URL('../../.env.test',import.meta.url),'utf8'));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,'http://127.0.0.1:54321');
const dbURL=new URL(env.SUPABASE_DB_URL);
assert.equal(dbURL.hostname,'127.0.0.1');assert.equal(dbURL.port,'54322');assert.equal(dbURL.pathname,'/postgres');
assert.ok(['postgres:','postgresql:'].includes(dbURL.protocol));
async function find(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isFile()&&e.name==='psql')return p;if(e.isDirectory()){const result=await find(p);if(result)return result;}}}
const binary=await find(join(homedir(),'.supabase/cache/stack/slim-services/postgres'));assert.ok(binary,'Native psql required');
const sessions=[];
function session(){
 const child=spawn(binary,['-X','-qAt','--set=ON_ERROR_STOP=1'],{env:{...process.env,PGHOST:'127.0.0.1',PGPORT:'54322',PGDATABASE:'postgres',PGUSER:decodeURIComponent(dbURL.username),PGPASSWORD:decodeURIComponent(dbURL.password),PGAPPNAME:'pro-reminder-concurrency-'+randomUUID()},stdio:['pipe','pipe','pipe']});
 let active=null,buffer='',failure='';
 const closed=new Promise(resolve=>child.once('close',resolve));
 child.stdout.on('data',chunk=>{buffer+=chunk;const marker=active?.marker;if(marker&&buffer.includes(marker)){const answer=buffer.slice(0,buffer.indexOf(marker)).trim();buffer=buffer.slice(buffer.indexOf(marker)+marker.length).trimStart();clearTimeout(active.timer);const resolve=active.resolve;active=null;resolve(answer);}});
 child.stderr.on('data',chunk=>{failure+=chunk;});
 child.on('exit',code=>{if(active){clearTimeout(active.timer);active.reject(Error('Local SQL session ended ('+code+'): '+failure.slice(-600)));active=null;}});
 const result={exec(sql){assert.equal(active,null,'Commands must serialize within a connection');return new Promise((resolve,reject)=>{const marker='DONE_'+randomUUID();active={marker,resolve,reject,timer:setTimeout(()=>{child.kill();reject(Error('Local SQL command timed out'));},20000)};child.stdin.write(sql+'\n\\echo '+marker+'\n');});},async close(){if(child.exitCode===null&&!child.killed)child.stdin.end('ROLLBACK;\n\\q\n');await closed;}};sessions.push(result);return result;
}
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const api=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options)=>{assert.equal(new URL(url).origin,env.NEXT_PUBLIC_SUPABASE_URL);return fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});}}});
const professionals=new Map();
const ids=[],requests=[],control=session(),a=session(),b=session(),c=session();
const json=async(sql)=>JSON.parse(await control.exec(sql));
async function account(){const id=randomUUID(),email='reminder-concurrency-'+id+'@contratacr.test';const {data,error}=await api.auth.admin.createUser({email,password:'Disposable!'+randomUUID()+'a1',email_confirm:true,user_metadata:{role:'professional',is_provider:true,full_name:'Local concurrency fixture',onboarding_completed:true}});if(error)throw Error('Local fixture account creation failed');ids.push(data.user.id);await api.from('profiles').update({role:'professional',is_provider:true,is_disabled:false,onboarding_completed:true}).eq('id',data.user.id).throwOnError();return data.user.id;}
const clock=new Date(Date.now()+7*86400000).toISOString(),start=new Date(Date.parse(clock)+86400000).toISOString(),end=new Date(Date.parse(start)+3600000).toISOString();
const run=`select pro_appointment_reminders_run(${q(clock)}::timestamptz,100);`;
async function assertOnlyOwnDue(){const rows=await json(`select coalesce(json_agg(request_id),'[]') from pro_appointment_reminder_due(${q(clock)}::timestamptz);`);assert.ok(rows.every(id=>requests.includes(id)),'Foreign due appointment detected: refusing global runner');}
async function make(owner,client){const id=randomUUID(),professional=professionals.get(owner)??randomUUID();requests.push(id);professionals.set(owner,professional);await control.exec(`begin;
 insert into pro_workspace_core(user_id,document,revision) values(${q(owner)},'{}',1) on conflict do nothing;
 insert into professionals(id,profile_id,category_id,business_name,slug,whatsapp,provincia_id,canton_id,verification_status,is_available,is_banned) values(${q(professional)},${q(owner)},'desarrollo_web','Local concurrency fixture',${q('reminder-concurrency-'+professional)},'','al','al-at','pending',true,false) on conflict(id) do nothing;
 insert into pro_clients(user_id,id,name,email,phone,notes,archived) values(${q(owner)},${q('reservation-'+client)},'Local concurrency customer','','','',false) on conflict do nothing;
 insert into pro_work(user_id,id,client,service,stage,start,"end","clientId",cancelled,"bookingClientId") values(${q(owner)},${q(id)},'Local customer','Local fixture','scheduled',${q(start)},${q(end)},${q('reservation-'+client)},false,${q(client)});
 insert into pro_appointment_requests(id,professional_id,owner_id,client_user_id,client_name,professional_name,service,duration_minutes,location_kind,requested_start,status,work_id) values(${q(id)},${q(professional)},${q(owner)},${q(client)},'Local customer','Local provider','Local fixture',60,'agree',${q(start)},'confirmed',${q(id)});
 insert into pro_appointment_events(request_id,actor_id,side,action,start_at,end_at,status) values(${q(id)},${q(owner)},'provider','confirm',${q(start)},${q(end)},'confirmed');
 insert into pro_appointment_reminder_rollout(owner_id,enabled) values(${q(owner)},true) on conflict(owner_id) do nothing;
 commit;`);return id;}
const count=async(id)=>Number(await control.exec(`select count(*) from pro_appointment_reminder_receipts where request_id=${q(id)};`));
try{
 for(const s of sessions)await s.exec("set statement_timeout='12s';set lock_timeout='8s';");
 assert.equal(await control.exec("select to_regprocedure('public.pro_appointment_reminders_run(timestamp with time zone,integer)') is not null;"),'t','Install local reminder SQL first');
 const owner=await account(),client=await account();
 const first=await make(owner,client);
 for(const id of ids)await control.exec(`select pro_appointment_reminder_preferences_record(${q(id)},${q(JSON.stringify({enabled:true,expectedRevision:0,actionId:randomUUID()}))}::jsonb);`);
 await assertOnlyOwnDue();
 // Both connections snapshot the same due set while the owner lock is held.
 await c.exec(`begin;select pg_advisory_xact_lock(hashtextextended(${q(owner)},0));`);
 const runs=[a.exec(run),b.exec(run)];
 let waiting=0;for(let i=0;i<200&&waiting<2;i++)waiting=Number(await control.exec("select count(*) from pg_stat_activity where application_name like 'pro-reminder-concurrency-%' and wait_event='advisory' and query like 'select pro_appointment_reminders_run%';"));assert.equal(waiting,2,'Both runners must be waiting concurrently');
 await c.exec('commit;');const results=(await Promise.all(runs)).map(JSON.parse);
 assert.equal(results.reduce((n,r)=>n+r.created,0),2);assert.equal(await count(first),2);
 assert.equal(Number(await control.exec(`select count(*) from notifications where data->>'request_id'=${q(first)} and type like 'pro_appointment_reminder_%';`)),2);
 console.log('PASS concurrent runners: one receipt and notification per recipient');
 // Rollback cannot retain either receipt or notice.
 const second=await make(owner,client);await assertOnlyOwnDue();await a.exec('begin;'+run);await a.exec('rollback;');assert.equal(await count(second),0);
 console.log('PASS runner rollback preserves atomicity');
 // OFF is uncommitted when the runner starts. It must re-read after the row lock.
 await c.exec(`begin;select pro_appointment_reminder_preferences_record(${q(client)},${q(JSON.stringify({enabled:false,expectedRevision:1,actionId:randomUUID()}))}::jsonb);`);
 const racing=a.exec(run);await c.exec('commit;');await racing;
 assert.equal(await count(second),1);assert.equal(Number(await control.exec(`select count(*) from pro_appointment_reminder_receipts where request_id=${q(second)} and recipient_id=${q(client)};`)),0);
 console.log('PASS committed opt-out wins over pending reminder');
 // A direct work UPDATE holds its row while waiting for owner advisory. The runner
 // owns that advisory: it must skip the row rather than wait and form a deadlock.
 const third=await make(owner,client);await assertOnlyOwnDue();
 await c.exec(`begin;select pg_advisory_xact_lock(hashtextextended(${q(owner)},0));`);
 const cancel=b.exec(`begin;update pro_work set cancelled=true where user_id=${q(owner)} and id=${q(third)};commit;`);
 // Observe actual server wait, not a timing sleep. Connection b is the only test UPDATE.
 let blocked=false;for(let i=0;i<200&&!blocked;i++)blocked=await control.exec("select exists(select 1 from pg_stat_activity where application_name like 'pro-reminder-concurrency-%' and wait_event='advisory' and query like '%update pro_work set cancelled=true%');")==='t';
 assert.ok(blocked,'Cancellation must hold the work row before runner');await c.exec(run);await c.exec('commit;');await cancel;assert.equal(await count(third),0);
 console.log('PASS work-row/advisory inversion does not deadlock or notify cancelled work');
 // Disabling a profile commits while the runner waits for its shared profile lock.
 const fourth=await make(owner,client);await assertOnlyOwnDue();
 await c.exec(`begin;update profiles set is_disabled=true where id=${q(owner)};`);
 const disabling=a.exec(run);
 let profileWait=false;for(let i=0;i<200&&!profileWait;i++)profileWait=await control.exec("select exists(select 1 from pg_stat_activity where application_name like 'pro-reminder-concurrency-%' and wait_event_type='Lock' and query like 'select pro_appointment_reminders_run%');")==='t';
 assert.ok(profileWait,'Runner must wait on changed profile');await c.exec('commit;');await disabling;assert.equal(await count(fourth),0);
 console.log('PASS profile disable is revalidated before notification');
 // Two professionals are each other's customer. Opposite roles must not invert
 // advisory/profile/preference ordering across differently sized runner batches.
 await control.exec(`update profiles set is_disabled=false where id=${q(owner)};select pro_appointment_reminder_preferences_record(${q(client)},${q(JSON.stringify({enabled:true,expectedRevision:2,actionId:randomUUID()}))}::jsonb);`);
 await assertOnlyOwnDue();await control.exec(run); // consume only earlier own cases
 const crossA=await make(owner,client),crossB=await make(client,owner);await assertOnlyOwnDue();
 await c.exec('begin;'+[owner,client].sort().map(id=>`select pg_advisory_xact_lock(hashtextextended(${q(id)},0));`).join(''));
 const crossRuns=[a.exec(run.replace(',100)',',1)')),b.exec(run.replace(',100)',',2)'))];
 let crossWaiting=0;for(let i=0;i<200&&crossWaiting<2;i++)crossWaiting=Number(await control.exec("select count(*) from pg_stat_activity where application_name like 'pro-reminder-concurrency-%' and wait_event='advisory' and query like 'select pro_appointment_reminders_run%';"));
 assert.equal(crossWaiting,2);await c.exec('commit;');await Promise.all(crossRuns);await control.exec(run);
 assert.equal(await count(crossA),2);assert.equal(await count(crossB),2);
 console.log('PASS reciprocal owner/customer runners (limits 1 and 2) finish without deadlock or duplicates');
 // Accept a reprogramming in one transaction while the runner has snapshotted
 // the old schedule and waits for the owner lock. Never fabricate a new event.
 const moving=await make(owner,client),proposal=randomUUID();
 const newStart=new Date(Math.ceil((Date.parse(start)+86400000)/900000)*900000).toISOString(),newEnd=new Date(Date.parse(newStart)+3600000).toISOString();
 await control.exec(`insert into pro_memberships(user_id,status) values(${q(owner)},'active') on conflict(user_id) do nothing;insert into pro_availability(user_id,start,"end") values(${q(owner)},${q(newStart)},${q(newEnd)});`);
 const propose={action:'propose',requestId:moving,id:proposal,actionId:randomUUID(),requestRevision:0,start:newStart,durationMinutes:60,note:''};
 await control.exec(`select pro_appointment_reschedule_mutate(${q(owner)},${q(JSON.stringify(propose))}::jsonb);`);
 const accept={action:'accept',requestId:moving,id:proposal,actionId:randomUUID(),revision:1};
 await c.exec(`begin;select pro_appointment_reschedule_mutate(${q(client)},${q(JSON.stringify(accept))}::jsonb);`);
 await assertOnlyOwnDue();const rescheduling=a.exec(run);
 let rescheduleWait=false;for(let i=0;i<200&&!rescheduleWait;i++)rescheduleWait=await control.exec("select exists(select 1 from pg_stat_activity where application_name like 'pro-reminder-concurrency-%' and wait_event='advisory' and query like 'select pro_appointment_reminders_run%');")==='t';
 assert.ok(rescheduleWait,'Runner must snapshot old schedule and wait for accepting transaction');await c.exec('commit;');await rescheduling;
 assert.equal(await count(moving),0);assert.equal(await control.exec(`select pro_instant(start)=${q(newStart)}::timestamptz from pro_work where user_id=${q(owner)} and id=${q(moving)};`),'t');
 console.log('PASS accepted reschedule invalidates old due snapshot before notification');
 const audit=await json(`select json_build_object('pending',(select count(*) from notification_push_outbox where user_id in (${ids.map(q).join(',')}) and (status<>'suppressed' or attempts<>0)),'tokens',(select count(*) from user_push_tokens where user_id in (${ids.map(q).join(',')})),'deliveries',(select count(*) from notification_push_deliveries d join notification_push_outbox o on o.id=d.outbox_id where o.user_id in (${ids.map(q).join(',')})));`);assert.deepEqual(audit,{pending:0,tokens:0,deliveries:0});
 console.log('PASS local only: pending/attempted outbox=0, tokens=0, deliveries=0');
}finally{
 // Release all concurrent transactions before deleting only accounts created here.
 await Promise.all(sessions.map(s=>s.close()));
 for(const id of ids){const {error}=await api.auth.admin.deleteUser(id);if(error)throw Error('Disposable account cleanup failed; fixture id '+id);}
 if(ids.length){for(const [table,column,values] of [['profiles','id',ids],['notifications','user_id',ids],['notification_push_outbox','user_id',ids],['pro_appointment_requests','id',requests],['pro_appointment_reminder_receipts','request_id',requests]]){if(!values.length)continue;const {data,error}=await api.from(table).select(column).in(column,values);assert.equal(error,null,'Cleanup verification unavailable');assert.equal(data.length,0,'Residual own fixtures in '+table);}console.log('PASS own fixture cleanup; all PostgreSQL sessions closed');}
}
