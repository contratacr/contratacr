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
if(process.argv.slice(2).join(' ')!=='--run-local')throw Error('Explicit --run-local required; install the reviewed local customer SQL separately first.');
const env=parseEnv(await readFile(new URL('../../.env.test',import.meta.url),'utf8'));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,'http://127.0.0.1:54321');
const dbURL=new URL(env.SUPABASE_DB_URL);
assert.equal(dbURL.hostname,'127.0.0.1');assert.equal(dbURL.port,'54322');assert.equal(dbURL.pathname,'/postgres');
assert.ok(['postgres:','postgresql:'].includes(dbURL.protocol));
async function find(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isFile()&&e.name==='psql')return p;if(e.isDirectory()){const result=await find(p);if(result)return result;}}}
const binary=await find(join(homedir(),'.supabase/cache/stack/slim-services/postgres'));assert.ok(binary,'Native psql required');
const sessions=[];
function session(){
 const child=spawn(binary,['-X','-qAt','--set=ON_ERROR_STOP=1'],{env:{...process.env,PGHOST:'127.0.0.1',PGPORT:'54322',PGDATABASE:'postgres',PGUSER:decodeURIComponent(dbURL.username),PGPASSWORD:decodeURIComponent(dbURL.password),PGAPPNAME:'pro-client-write-concurrency-'+randomUUID()},stdio:['pipe','pipe','pipe']});
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
async function account(){const {data,error}=await api.auth.admin.createUser({email:'client-write-concurrency-'+randomUUID()+'@contratacr.test',password:'Disposable!'+randomUUID()+'a1',email_confirm:true,user_metadata:{role:'professional',is_provider:true,full_name:'Local customer write fixture',onboarding_completed:true}});if(error)throw Error('Local fixture creation failed');ids.push(data.user.id);return data.user.id;}
const input=(row,revision,mode='create')=>({kind:'clients',revision,rows:[row],movements:[],importing:false,clientActionId:randomUUID(),clientWriteMode:mode});
const row=()=>({id:randomUUID(),name:'Cliente concurrente sin cédula',email:'',phone:'',notes:'Only a disposable fixture',archived:false});
const write=(owner,body)=>`select pro_client_write_record(${q(owner)},${q(JSON.stringify(body))}::jsonb);`;
const json=async(sql)=>JSON.parse(await control.exec(sql));
async function waitForAdvisories(count){let waiting=0;for(let i=0;i<200&&waiting<count;i++)waiting=Number(await control.exec("select count(*) from pg_stat_activity where application_name like 'pro-client-write-concurrency-%' and wait_event='advisory' and query like 'select pro_client_write_record%';"));assert.equal(waiting,count,'Expected concurrent customer writes waiting on the same owner');}
const preservedTables=['quotes','pro_appointment_requests','pro_appointment_events','pro_appointment_actions','pro_appointment_reschedules','pro_appointment_reschedule_actions','pro_work','pro_clients','pro_quote_links','pro_workspace_core','pro_client_entries','notifications','notification_push_outbox','notification_push_deliveries','pro_request_quotes','pro_request_quote_actions','profiles','professionals','pro_appointment_notice_rollout','pro_appointment_notice_receipts'];
async function fingerprints(){const result={};for(const table of preservedTables)result[table]=await json(`select json_build_object('count',count(*),'hash',md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text,'[]'))) from ${table} r;`);return result;}
const preservedBefore=await fingerprints();
async function state(owner){return json(`select json_build_object('revision',(select revision from pro_workspace_core where user_id=${q(owner)}),'clients',coalesce((select json_agg(to_jsonb(r) order by id) from pro_clients r where user_id=${q(owner)}),'[]'),'receipts',coalesce((select json_agg(to_jsonb(r) order by action_id) from pro_client_write_actions r where actor_id=${q(owner)}),'[]'));`);}
try{
 for(const s of sessions)await s.exec("set statement_timeout='12s';set lock_timeout='8s';");
 assert.equal(await control.exec("select to_regprocedure('public.pro_client_write_record(uuid,jsonb)') is not null;"),'t','Reviewed customer SQL must already be installed');
 const owner=await account(),other=await account();
 await control.exec(`insert into pro_workspace_core(user_id,document,revision) values(${q(owner)},'{"version":1,"social":[]}',1),(${q(other)},'{"version":1,"social":[]}',1);`);
 await a.exec('set role service_role;');await b.exec('set role service_role;');
 // Identical attempts blocked at the real advisory produce one revision/row/receipt.
 const first=input(row(),1);
 await c.exec(`begin;select pg_advisory_xact_lock(hashtextextended(${q(owner)},0));`);
 const same=[a.exec(write(owner,first)),b.exec(write(owner,first))];await waitForAdvisories(2);await c.exec('commit;');
 const results=(await Promise.all(same)).map(JSON.parse);assert.deepEqual(results[0],results[1]);assert.equal(results[0].revision,2);let current=await state(owner);assert.equal(current.revision,2);assert.equal(current.clients.length,1);assert.equal(current.receipts.length,1);
 console.log('PASS concurrent identical requests: one customer, one receipt and one revision');
 // Two different actions with the same expected revision cannot both write.
 const second=input(row(),2),third=input(row(),2);await c.exec(`begin;select pg_advisory_xact_lock(hashtextextended(${q(owner)},0));`);
 const different=[a.exec(write(owner,second)),b.exec(write(owner,third))];const settled=Promise.allSettled(different);await waitForAdvisories(2);await c.exec('commit;');const outcomes=await settled;assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(outcomes.filter(r=>r.status==='rejected').length,1);current=await state(owner);assert.equal(current.revision,3);assert.equal(current.clients.length,2);assert.equal(current.receipts.length,2);
 console.log('PASS concurrent distinct actions: one winner and one stale-CAS rejection');
 // psql ON_ERROR_STOP ends the losing connection. Open fresh connections for later cases.
 const next=session(),rollback=session();for(const s of [next,rollback])await s.exec("set statement_timeout='12s';set lock_timeout='8s';set role service_role;");
 // A committed legacy edit changes the canonical row. Historical replay waits then
 // returns the old ACK without rewriting that later row.
 const later={...first.rows[0],name:'Later authorized edit',archived:true};
 await c.exec(`begin;select pg_advisory_xact_lock(hashtextextended(${q(owner)},0));select pro_mutate_catalog(${q(owner)},'clients',${q(JSON.stringify([later]))}::jsonb,3);`);
 const replay=next.exec(write(owner,first));await waitForAdvisories(1);await c.exec('commit;');assert.deepEqual(JSON.parse(await replay),results[0]);current=await state(owner);assert.equal(current.revision,4);assert.equal(current.clients.find(r=>r.id===later.id).name,later.name);assert.equal(current.clients.find(r=>r.id===later.id).archived,true);assert.equal(current.receipts.length,2);
 console.log('PASS historical replay after concurrent legacy edit: old ACK and current customer preserved');
 // Rollback of the RPC rolls receipt and row back together; an exact retry then succeeds.
 const rolling=input(row(),4),before=await state(owner);await rollback.exec('begin;'+write(owner,rolling));await rollback.exec('rollback;');assert.deepEqual(await state(owner),before);const retry=JSON.parse(await rollback.exec(write(owner,rolling)));assert.equal(retry.revision,5);current=await state(owner);assert.equal(current.clients.length,3);assert.equal(current.receipts.length,3);
 console.log('PASS transactional rollback: no retained customer or receipt; exact retry succeeds');
 // Same action key belongs to one actor only. The second owner gets its own ACK.
 const separate={...first,rows:[row()]};const otherAck=JSON.parse(await next.exec(write(other,separate)));assert.equal(otherAck.revision,2);assert.notEqual(otherAck.id,results[0].id);assert.equal((await state(other)).receipts.length,1);
 console.log('PASS action namespace isolation between two disposable owners');
}finally{
 try{
  for(const s of sessions.filter(s=>s!==control))await s.close();
  for(const id of ids.reverse()){const result=await api.auth.admin.deleteUser(id);if(result.error)throw Error('Local fixture cleanup failed');}
  const after=await fingerprints();
  const report='/tmp/pro-client-write-concurrency-preservation.json';await writeFile(report,JSON.stringify({before:preservedBefore,after}));await chmod(report,0o600);
  assert.deepEqual(after,preservedBefore,'Existing rows changed during isolated-fixture concurrency tests');
 }finally{await control.close();}
}
console.log('PASS real PostgreSQL customer-write concurrency. Only disposable fixture accounts were created and cleaned; no installation, notification or external delivery.');
