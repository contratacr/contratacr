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
if(process.argv.slice(2).join(' ')!=='--run-local')throw Error('Explicit --run-local required; install the reviewed local commercial work change SQL separately first.');
const env=parseEnv(await readFile(new URL('../../.env.test',import.meta.url),'utf8'));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,'http://127.0.0.1:54321');
const dbURL=new URL(env.SUPABASE_DB_URL);
assert.equal(dbURL.hostname,'127.0.0.1');assert.equal(dbURL.port,'54322');assert.equal(dbURL.pathname,'/postgres');
assert.ok(['postgres:','postgresql:'].includes(dbURL.protocol));
async function find(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isFile()&&e.name==='psql')return p;if(e.isDirectory()){const result=await find(p);if(result)return result;}}}
const binary=await find(join(homedir(),'.supabase/cache/stack/slim-services/postgres'));assert.ok(binary,'Native psql required');
const sessions=[];
function session(){
 const child=spawn(binary,['-X','-qAt','--set=ON_ERROR_STOP=1'],{env:{...process.env,PGHOST:'127.0.0.1',PGPORT:'54322',PGDATABASE:'postgres',PGUSER:decodeURIComponent(dbURL.username),PGPASSWORD:decodeURIComponent(dbURL.password),PGAPPNAME:'pro-work-change-concurrency-'+randomUUID()},stdio:['pipe','pipe','pipe']});
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
async function account(){const {data,error}=await api.auth.admin.createUser({email:'work-change-concurrency-'+randomUUID()+'@contratacr.test',password:'Disposable!'+randomUUID()+'a1',email_confirm:true,user_metadata:{role:'professional',is_provider:true,full_name:'Local work change concurrency',onboarding_completed:true}});if(error)throw Error('Local fixture creation failed');ids.push(data.user.id);return data.user.id;}
const json=async(sql)=>JSON.parse(await control.exec(sql));
const preservedTables=['quotes','pro_appointment_requests','pro_appointment_events','pro_appointment_actions','pro_appointment_reschedules','pro_appointment_reschedule_actions','pro_work','pro_clients','pro_quote_links','pro_workspace_core','pro_client_entries','notifications','notification_push_outbox','notification_push_deliveries','pro_request_quotes','pro_request_quote_actions','profiles','professionals','pro_appointment_notice_rollout','pro_appointment_notice_receipts','pro_work_changes','pro_work_change_actions'];
async function fingerprints(){const result={};for(const table of preservedTables)result[table]=await json(`select json_build_object('count',count(*),'hash',md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text,'[]'))) from ${table} r;`);return result;}
const preservedBefore=await fingerprints();
const write=(actor,body)=>`select pro_work_changes_mutate(${q(actor)},${q(JSON.stringify(body))}::jsonb);`;
async function state(owner,client){return json(`select json_build_object('changes',coalesce((select json_agg(to_jsonb(r) order by position) from pro_work_changes r where owner_id=${q(owner)}),'[]'),'receipts',coalesce((select json_agg(to_jsonb(r) order by actor_id,id) from pro_work_change_actions r where owner_id=${q(owner)}),'[]'),'entries',coalesce((select json_agg(to_jsonb(r) order by position) from pro_client_entries r where user_id=${q(owner)}),'[]'),'core',(select to_jsonb(r) from pro_workspace_core r where user_id=${q(owner)}),'client',${q(client)});`);}
async function waitForAdvisories(count){let waiting=0;for(let i=0;i<200&&waiting<count;i++)waiting=Number(await control.exec("select count(*) from pg_stat_activity where application_name like 'pro-work-change-concurrency-%' and wait_event='advisory' and query like 'select pro_work_changes_mutate%';"));assert.equal(waiting,count,'Expected concurrent changes waiting on one owner');}
try{
 for(const s of sessions)await s.exec("set statement_timeout='12s';set lock_timeout='8s';");
 assert.equal(await control.exec("select to_regprocedure('public.pro_work_changes_mutate(uuid,jsonb)') is not null;"),'t','Existing commercial change SQL must already be installed');
 const owner=await account(),client=await account(),work=randomUUID(),request=randomUUID(),professional=randomUUID(),contact='reservation-'+client;
 await control.exec(`begin;
 update profiles set role='professional',is_provider=true,is_disabled=false where id=${q(owner)};
 insert into pro_memberships(user_id,status) values(${q(owner)},'active');
 insert into professionals(id,profile_id,category_id,business_name,slug,whatsapp,provincia_id,canton_id,verification_status,is_available,is_banned) values(${q(professional)},${q(owner)},'desarrollo_web','Local commercial concurrency',${q('change-concurrency-'+owner)},'','al','al-at','pending',true,false);
 insert into pro_workspace_core(user_id,document,revision) values(${q(owner)},'{"version":1,"social":[]}',1);
 insert into pro_clients(user_id,id,name,email,phone,notes,archived) values(${q(owner)},${q(contact)},'Local customer','','','Private contact unchanged',false);
 insert into pro_work(user_id,id,client,service,stage,start,"end","clientId",cancelled,"bookingClientId") values(${q(owner)},${q(work)},'Local customer','Local completed work','completed','2026-11-08T09:00:00-06:00','2026-11-08T10:00:00-06:00',${q(contact)},false,${q(client)});
 insert into pro_appointment_requests(id,professional_id,owner_id,client_user_id,client_name,professional_name,professional_slug,service,duration_minutes,location_kind,status,work_id) values(${q(request)},${q(professional)},${q(owner)},${q(client)},'Local customer','Local provider',${q('change-concurrency-'+owner)},'Local completed work',60,'agree','completed',${q(work)});
 commit;`);
 const agreementId=randomUUID(),paymentId=randomUUID();
 await control.exec(`select pro_record_client_operation(${q(owner)},${q(JSON.stringify({actionId:agreementId,clientId:contact,workId:work,kind:'agreement',amountCents:100000}))}::jsonb,1);select pro_record_client_operation(${q(owner)},${q(JSON.stringify({actionId:paymentId,clientId:contact,workId:work,kind:'payment',amountCents:1000,note:'Original fixture payment'}))}::jsonb,2);`);
 const paymentBefore=(await state(owner,client)).entries.find(row=>row.id===paymentId);
 await a.exec('set role service_role;');await b.exec('set role service_role;');
 const proposal=base=>({action:'propose',id:randomUUID(),actionId:randomUUID(),workId:work,baseCents:base,reason:'Additional fixture work',lines:[{description:'Additional outlet',amountCents:2000}]}),first=proposal(100000);
 await c.exec(`begin;select pg_advisory_xact_lock(hashtextextended(${q(owner)},0));`);const same=[a.exec(write(owner,first)),b.exec(write(owner,first))];await waitForAdvisories(2);await c.exec('commit;');const firstResults=(await Promise.all(same)).map(JSON.parse);assert.deepEqual(firstResults[0],firstResults[1]);assert.deepEqual(firstResults[0],{id:first.id,revision:1,status:'proposed'});let current=await state(owner,client);assert.equal(current.changes.length,1);assert.equal(current.receipts.length,1);assert.equal(current.entries.filter(row=>row.kind==='agreement').length,1);
 console.log('PASS same proposal on two connections: one change and one receipt, agreement unchanged');
 const accept={action:'accept',id:first.id,actionId:randomUUID(),revision:1};await c.exec(`begin;select pg_advisory_xact_lock(hashtextextended(${q(owner)},0));`);const sameAccept=[a.exec(write(client,accept)),b.exec(write(client,accept))];await waitForAdvisories(2);await c.exec('commit;');const accepted=(await Promise.all(sameAccept)).map(JSON.parse);assert.deepEqual(accepted[0],accepted[1]);assert.equal(accepted[0].status,'accepted');current=await state(owner,client);assert.equal(current.receipts.length,2);assert.equal(current.entries.filter(row=>row.kind==='agreement').length,2);assert.equal(current.entries.find(row=>row.id===accept.actionId).amount_cents,102000);assert.deepEqual(current.entries.find(row=>row.id===paymentId),paymentBefore);
 console.log('PASS same acceptance on two connections: one additional agreement, original payment preserved');
 const second=proposal(102000);await a.exec(write(owner,second));const left={action:'accept',id:second.id,actionId:randomUUID(),revision:1},right={...left,actionId:randomUUID()};
 await c.exec(`begin;select pg_advisory_xact_lock(hashtextextended(${q(owner)},0));`);const competing=[a.exec(write(client,left)),b.exec(write(client,right))],settled=Promise.allSettled(competing);await waitForAdvisories(2);await c.exec('commit;');const outcomes=await settled;assert.equal(outcomes.filter(row=>row.status==='fulfilled').length,1);assert.equal(outcomes.filter(row=>row.status==='rejected').length,1);current=await state(owner,client);assert.equal(current.receipts.length,4);assert.equal(current.entries.filter(row=>row.kind==='agreement').length,3);assert.equal(current.changes.find(row=>row.id===second.id).status,'accepted');
 console.log('PASS distinct acceptance actions at one CAS: one winner, no second agreement');
 const replay=session(),rollback=session();for(const s of [replay,rollback])await s.exec("set statement_timeout='12s';set lock_timeout='8s';set role service_role;");
 const latestAgreement={actionId:randomUUID(),clientId:contact,workId:work,kind:'agreement',amountCents:110000};
 await control.exec(`select pro_record_client_operation(${q(owner)},${q(JSON.stringify(latestAgreement))}::jsonb,(select revision from pro_workspace_core where user_id=${q(owner)}));`);const beforeReplay=await state(owner,client);assert.deepEqual(JSON.parse(await replay.exec(write(owner,first))),firstResults[0]);assert.deepEqual(JSON.parse(await replay.exec(write(client,accept))),accepted[0]);assert.deepEqual(await state(owner,client),beforeReplay);assert.equal((await json(`select pro_work_account(${q(owner)},${q(work)});`)).agreedCents,110000);
 console.log('PASS old proposal/acceptance replay after terminal state and newer agreement: no overwrite');
 const third=proposal(110000);await replay.exec(write(owner,third));const external={action:'record_acceptance',id:third.id,actionId:randomUUID(),revision:1,note:'Fixture customer authorized by phone today.'},beforeRollback=await state(owner,client);await rollback.exec('begin;'+write(owner,external));await rollback.exec('rollback;');assert.deepEqual(await state(owner,client),beforeRollback);assert.equal(JSON.parse(await rollback.exec(write(owner,external))).status,'accepted');current=await state(owner,client);assert.equal(current.receipts.length,6);assert.equal(current.entries.filter(row=>row.kind==='agreement').length,5);assert.equal(current.entries.find(row=>row.id===external.actionId).amount_cents,112000);assert.equal(current.changes.find(row=>row.id===third.id).recorded_by,'provider');assert.deepEqual(current.entries.find(row=>row.id===paymentId),paymentBefore);
 console.log('PASS external-approval rollback: change, agreement, core revision and receipt roll back atomically');
 await control.exec(`update profiles set is_disabled=true where id=${q(owner)};`);const disabled=session();await disabled.exec("set statement_timeout='12s';set lock_timeout='8s';set role service_role;");const beforeDisabled=await state(owner,client);await assert.rejects(()=>disabled.exec(write(owner,first)),error=>String(error).includes('Forbidden'));assert.deepEqual(await state(owner,client),beforeDisabled);await control.exec(`update profiles set is_disabled=false where id=${q(owner)};`);
 console.log('PASS disabled actor denied before historical replay; no financial writes');
}finally{
 try{
  for(const s of sessions.filter(s=>s!==control))await s.close();
  for(const id of ids.reverse()){const result=await api.auth.admin.deleteUser(id);if(result.error)throw Error('Local fixture cleanup failed');}
  const after=await fingerprints(),report='/tmp/pro-work-change-concurrency-preservation.json';await writeFile(report,JSON.stringify({before:preservedBefore,after}));await chmod(report,0o600);assert.deepEqual(after,preservedBefore,'Existing rows changed during disposable commercial-change tests');
 }finally{await control.close();}
}
console.log('PASS real PostgreSQL work change concurrency: disposable fixtures cleaned and 22 table fingerprints unchanged; no installation or external delivery.');
