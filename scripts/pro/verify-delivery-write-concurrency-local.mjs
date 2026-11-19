// Real PostgreSQL concurrency verifier. Run only after the additive local SQL is installed.
// No migrations, scheduler, external delivery, or existing-account changes.
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {parseEnv} from 'node:util';
import {createClient} from '@supabase/supabase-js';
if(process.argv.slice(2).join(' ')!=='--run-local')throw Error('Explicit --run-local required; install the reviewed local work report SQL separately first.');
const env=parseEnv(await readFile(new URL('../../.env.test',import.meta.url),'utf8'));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,'http://127.0.0.1:54321');
const dbURL=new URL(env.SUPABASE_DB_URL);
assert.equal(dbURL.hostname,'127.0.0.1');assert.equal(dbURL.port,'54322');assert.equal(dbURL.pathname,'/postgres');
assert.ok(['postgres:','postgresql:'].includes(dbURL.protocol));
async function find(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isFile()&&e.name==='psql')return p;if(e.isDirectory()){const result=await find(p);if(result)return result;}}}
const binary=await find(join(homedir(),'.supabase/cache/stack/slim-services/postgres'));assert.ok(binary,'Native psql required');
const sessions=[];
function session(){
 const child=spawn(binary,['-X','-qAt','--set=ON_ERROR_STOP=1'],{env:{...process.env,PGHOST:'127.0.0.1',PGPORT:'54322',PGDATABASE:'postgres',PGUSER:decodeURIComponent(dbURL.username),PGPASSWORD:decodeURIComponent(dbURL.password),PGAPPNAME:'pro-delivery-write-concurrency-'+randomUUID()},stdio:['pipe','pipe','pipe']});
 let active=null,buffer='',failure='';
 const closed=new Promise(resolve=>child.once('close',resolve));
 child.stdout.on('data',chunk=>{buffer+=chunk;const marker=active?.marker;if(marker&&buffer.includes(marker)){const answer=buffer.slice(0,buffer.indexOf(marker)).trim();buffer=buffer.slice(buffer.indexOf(marker)+marker.length).trimStart();clearTimeout(active.timer);const resolve=active.resolve;active=null;resolve(answer);}});
 child.stderr.on('data',chunk=>{failure+=chunk;});
 child.on('exit',code=>{if(active){clearTimeout(active.timer);active.reject(Error('Local SQL session ended ('+code+'): '+failure.slice(-600)));active=null;}});
 const result={exec(sql){assert.equal(active,null,'Commands must serialize within a connection');return new Promise((resolve,reject)=>{const marker='DONE_'+randomUUID();active={marker,resolve,reject,timer:setTimeout(()=>{child.kill();reject(Error('Local SQL command timed out'));},20000)};child.stdin.write(sql+'\n\\echo '+marker+'\n');});},async close(){if(child.exitCode===null&&!child.killed)child.stdin.end('ROLLBACK;\n\\q\n');await closed;}};sessions.push(result);return result;
}
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const api=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options)=>{assert.equal(new URL(url).origin,env.NEXT_PUBLIC_SUPABASE_URL);return fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});}}});
const ids=[],control=session(),a=session(),b=session(),c=session();
async function account(){const {data,error}=await api.auth.admin.createUser({email:'delivery-write-concurrency-'+randomUUID()+'@contratacr.test',password:'Disposable!'+randomUUID()+'a1',email_confirm:true,user_metadata:{role:'professional',is_provider:true,full_name:'Local report concurrency fixture',onboarding_completed:true}});if(error)throw Error('Local fixture creation failed');ids.push(data.user.id);return data.user.id;}
const json=async(sql)=>JSON.parse(await control.exec(sql));
const preservedTables=['quotes','pro_appointment_requests','pro_appointment_events','pro_appointment_actions','pro_appointment_reschedules','pro_appointment_reschedule_actions','pro_work','pro_clients','pro_quote_links','pro_workspace_core','pro_client_entries','notifications','notification_push_outbox','notification_push_deliveries','pro_request_quotes','pro_request_quote_actions','profiles','professionals','pro_appointment_notice_rollout','pro_appointment_notice_receipts','pro_work_delivery_drafts','pro_work_delivery_photos','pro_work_delivery_versions','pro_work_delivery_actions'];
async function fingerprints(){const result={};for(const table of preservedTables)result[table]=await json(`select json_build_object('count',count(*),'hash',md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text,'[]'))) from ${table} r;`);return result;}
const preservedBefore=await fingerprints();
const write=(owner,body)=>`select pro_work_delivery_mutate(${q(owner)},${q(JSON.stringify(body))}::jsonb);`;
async function state(owner){return json(`select json_build_object('drafts',coalesce((select json_agg(to_jsonb(r) order by work_id) from pro_work_delivery_drafts r where owner_id=${q(owner)}),'[]'),'versions',coalesce((select json_agg(to_jsonb(r) order by work_id,version) from pro_work_delivery_versions r where owner_id=${q(owner)}),'[]'),'receipts',coalesce((select json_agg(to_jsonb(r) order by action_id) from pro_work_delivery_actions r where actor_id=${q(owner)}),'[]'));`);}
async function waitForAdvisories(count){let waiting=0;for(let i=0;i<200&&waiting<count;i++)waiting=Number(await control.exec("select count(*) from pg_stat_activity where application_name like 'pro-delivery-write-concurrency-%' and wait_event='advisory' and query like 'select pro_work_delivery_mutate%';"));assert.equal(waiting,count,'Expected concurrent report writes waiting on one owner');}
try{
 for(const s of sessions)await s.exec("set statement_timeout='12s';set lock_timeout='8s';");
 assert.equal(await control.exec("select to_regprocedure('public.pro_work_delivery_mutate(uuid,jsonb)') is not null;"),'t','Existing work report SQL must already be installed');
 const owner=await account(),client=await account(),work=randomUUID(),request=randomUUID(),professional=randomUUID(),contact='reservation-'+client;
 await control.exec(`begin;
 update profiles set role='professional',is_provider=true,is_disabled=false where id=${q(owner)};
 insert into pro_memberships(user_id,status) values(${q(owner)},'active');
 insert into professionals(id,profile_id,category_id,business_name,slug,whatsapp,provincia_id,canton_id,verification_status,is_available,is_banned) values(${q(professional)},${q(owner)},'desarrollo_web','Local report concurrency',${q('delivery-concurrency-'+owner)},'','al','al-at','pending',true,false);
 insert into pro_workspace_core(user_id,document,revision) values(${q(owner)},'{"version":1,"social":[]}',1);
 insert into pro_clients(user_id,id,name,email,phone,notes,archived) values(${q(owner)},${q(contact)},'Local report customer','','','Preserve private contact',false);
 insert into pro_work(user_id,id,client,service,stage,start,"end","clientId",cancelled,"bookingClientId") values(${q(owner)},${q(work)},'Local customer','Local completed report','completed','2026-11-08T09:00:00-06:00','2026-11-08T10:00:00-06:00',${q(contact)},false,${q(client)});
 insert into pro_appointment_requests(id,professional_id,owner_id,client_user_id,client_name,professional_name,professional_slug,service,duration_minutes,location_kind,status,work_id) values(${q(request)},${q(professional)},${q(owner)},${q(client)},'Local customer','Local provider',${q('delivery-concurrency-'+owner)},'Local completed report',60,'agree','completed',${q(work)});
 commit;`);
 await a.exec('set role service_role;');await b.exec('set role service_role;');
 const content={summary:'Completed fixture installation',checklist:[{label:'Local inspection complete',done:true}],recommendations:'Keep shared history',photoIds:[]},internalNote='Private note never published';
 const save={action:'save',workId:work,actionId:randomUUID(),revision:0,content,internalNote};assert.equal(JSON.parse(await a.exec(write(owner,save))).revision,1);
 const publish={action:'publish',workId:work,actionId:randomUUID(),revision:1};
 await c.exec(`begin;select pg_advisory_xact_lock(hashtextextended(${q(owner)},0));`);
 const same=[a.exec(write(owner,publish)),b.exec(write(owner,publish))];await waitForAdvisories(2);await c.exec('commit;');const results=(await Promise.all(same)).map(JSON.parse);assert.deepEqual(results[0],results[1]);assert.equal(results[0].revision,2);let current=await state(owner);assert.equal(current.versions.length,1);assert.equal(current.versions[0].version,1);assert.equal(current.receipts.length,2);assert.equal(current.drafts[0].internal_note,internalNote);assert.equal(Object.hasOwn(current.versions[0].content,'internalNote'),false);
 console.log('PASS same publish action in two connections: one immutable version, one publish receipt');
 const second={...publish,actionId:randomUUID(),revision:2},third={...publish,actionId:randomUUID(),revision:2};
 await c.exec(`begin;select pg_advisory_xact_lock(hashtextextended(${q(owner)},0));`);const distinct=[a.exec(write(owner,second)),b.exec(write(owner,third))],settled=Promise.allSettled(distinct);await waitForAdvisories(2);await c.exec('commit;');const outcomes=await settled;assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(outcomes.filter(r=>r.status==='rejected').length,1);current=await state(owner);assert.equal(current.versions.length,2);assert.equal(current.receipts.length,3);assert.equal(current.drafts[0].revision,3);
 console.log('PASS different publish actions at one CAS: one winner, one stale rejection');
 const replay=session(),rollback=session();for(const s of [replay,rollback])await s.exec("set statement_timeout='12s';set lock_timeout='8s';set role service_role;");
 const later={...publish,actionId:randomUUID(),revision:3};assert.equal(JSON.parse(await replay.exec(write(owner,later))).revision,4);const beforeReplay=await state(owner);assert.deepEqual(JSON.parse(await replay.exec(write(owner,publish))),results[0]);assert.deepEqual(await state(owner),beforeReplay);assert.equal(beforeReplay.versions.length,3);assert.deepEqual(beforeReplay.versions[0].content,beforeReplay.versions[2].content);
 console.log('PASS historical action after newer deliberate same-content publications: no extra version');
 const rolling={...publish,actionId:randomUUID(),revision:4},beforeRollback=await state(owner);await rollback.exec('begin;'+write(owner,rolling));await rollback.exec('rollback;');assert.deepEqual(await state(owner),beforeRollback);assert.equal(JSON.parse(await rollback.exec(write(owner,rolling))).revision,5);current=await state(owner);assert.equal(current.versions.length,4);assert.equal(current.receipts.length,5);
 console.log('PASS rollback: version, receipt and revision roll back together; exact retry succeeds');
 // Revocation committed before a replay must be checked ahead of the receipt lookup.
 await control.exec(`update profiles set is_disabled=true where id=${q(owner)};`);const disabled=session();await disabled.exec("set statement_timeout='12s';set lock_timeout='8s';set role service_role;");const beforeRevoked=await state(owner);await assert.rejects(()=>disabled.exec(write(owner,publish)),error=>String(error).includes('Forbidden'));assert.deepEqual(await state(owner),beforeRevoked);await control.exec(`update profiles set is_disabled=false where id=${q(owner)};`);
 console.log('PASS disabled actor denied before receipt replay; no version or private state changed');
}finally{
 try{
  for(const s of sessions.filter(s=>s!==control))await s.close();
  for(const id of ids.reverse()){const result=await api.auth.admin.deleteUser(id);if(result.error)throw Error('Local fixture cleanup failed');}
  const after=await fingerprints(),report='/tmp/pro-delivery-write-concurrency-preservation.json';await writeFile(report,JSON.stringify({before:preservedBefore,after}));await chmod(report,0o600);assert.deepEqual(after,preservedBefore,'Existing rows changed during disposable report concurrency tests');
 }finally{await control.close();}
}
console.log('PASS real PostgreSQL work report concurrency: disposable fixtures cleaned, 24 table fingerprints unchanged, no SQL installation, photo upload or external delivery.');
