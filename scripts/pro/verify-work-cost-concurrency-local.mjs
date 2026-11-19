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
if(process.argv.slice(2).join(' ')!=='--run-local')throw Error('Explicit --run-local required; install the reviewed local job cost SQL separately first.');
const env=parseEnv(await readFile(new URL('../../.env.test',import.meta.url),'utf8'));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,'http://127.0.0.1:54321');
const dbURL=new URL(env.SUPABASE_DB_URL);
assert.equal(dbURL.hostname,'127.0.0.1');assert.equal(dbURL.port,'54322');assert.equal(dbURL.pathname,'/postgres');
assert.ok(['postgres:','postgresql:'].includes(dbURL.protocol));
async function find(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isFile()&&e.name==='psql')return p;if(e.isDirectory()){const result=await find(p);if(result)return result;}}}
const binary=await find(join(homedir(),'.supabase/cache/stack/slim-services/postgres'));assert.ok(binary,'Native psql required');
const sessions=[];
function session(){
 const child=spawn(binary,['-X','-qAt','--set=ON_ERROR_STOP=1'],{env:{...process.env,PGHOST:'127.0.0.1',PGPORT:'54322',PGDATABASE:'postgres',PGUSER:decodeURIComponent(dbURL.username),PGPASSWORD:decodeURIComponent(dbURL.password),PGAPPNAME:'pro-work-cost-concurrency-'+randomUUID()},stdio:['pipe','pipe','pipe']});
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
async function account(){const {data,error}=await api.auth.admin.createUser({email:'work-cost-concurrency-'+randomUUID()+'@contratacr.test',password:'Disposable!'+randomUUID()+'a1',email_confirm:true,user_metadata:{role:'professional',is_provider:true,full_name:'Local job cost concurrency',onboarding_completed:true}});if(error)throw Error('Local fixture creation failed');ids.push(data.user.id);return data.user.id;}
const json=async(sql)=>JSON.parse(await control.exec(sql));
const preservedTables=['quotes','pro_appointment_requests','pro_appointment_events','pro_appointment_actions','pro_appointment_reschedules','pro_appointment_reschedule_actions','pro_work','pro_clients','pro_quote_links','pro_workspace_core','pro_client_entries','notifications','notification_push_outbox','notification_push_deliveries','pro_request_quotes','pro_request_quote_actions','profiles','professionals','pro_appointment_notice_rollout','pro_appointment_notice_receipts','pro_products','pro_movements','pro_work_cost_state','pro_work_cost_entries','pro_work_cost_requests','pro_work_expense_assignments','pro_expense_state','pro_expense_suppliers','pro_internal_expenses','pro_expense_payments','pro_expense_requests'];
async function fingerprints(){const result={};for(const table of preservedTables)result[table]=await json(`select json_build_object('count',count(*),'hash',md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text,'[]'))) from ${table} r;`);return result;}
const preservedBefore=await fingerprints();
const write=(owner,input)=>`select pro_work_costs_mutate(${q(owner)},${q(JSON.stringify(input))}::jsonb);`;
async function state(owner){return json(`select json_build_object('costs',coalesce((select json_agg(to_jsonb(r) order by position) from pro_work_cost_entries r where user_id=${q(owner)}),'[]'),'receipts',coalesce((select json_agg(to_jsonb(r) order by request_id) from pro_work_cost_requests r where user_id=${q(owner)}),'[]'),'assignments',coalesce((select json_agg(to_jsonb(r) order by expense_id) from pro_work_expense_assignments r where user_id=${q(owner)}),'[]'),'expenses',coalesce((select json_agg(to_jsonb(r) order by id) from pro_internal_expenses r where user_id=${q(owner)}),'[]'),'expenseReceipts',coalesce((select json_agg(to_jsonb(r) order by action_id) from pro_expense_requests r where user_id=${q(owner)}),'[]'),'expenseRevision',coalesce((select revision from pro_expense_state where user_id=${q(owner)}),0),'revision',coalesce((select revision from pro_work_cost_state where user_id=${q(owner)}),0),'financial',coalesce((select json_agg(to_jsonb(r) order by position) from pro_client_entries r where user_id=${q(owner)}),'[]'),'core',(select to_jsonb(r) from pro_workspace_core r where user_id=${q(owner)}));`);}
async function waitForAdvisories(count){let waiting=0;for(let i=0;i<200&&waiting<count;i++)waiting=Number(await control.exec("select count(*) from pg_stat_activity where application_name like 'pro-work-cost-concurrency-%' and wait_event='advisory' and query like 'select pro_work_costs_mutate%';"));assert.equal(waiting,count,'Concurrent job-cost writes must wait on the owner lock');}
try{
 for(const s of sessions)await s.exec("set statement_timeout='12s';set lock_timeout='8s';");
 assert.equal(await control.exec("select to_regprocedure('public.pro_work_costs_mutate(uuid,jsonb)') is not null;"),'t','Existing SQL must already be installed');
 const owner=await account(),work=randomUUID(),contact='cost-contact-'+randomUUID(),supplier=randomUUID();
 await control.exec(`begin;update profiles set role='professional',is_provider=true,is_disabled=false where id=${q(owner)};insert into pro_memberships(user_id,status) values(${q(owner)},'active');insert into pro_workspace_core(user_id,document,revision) values(${q(owner)},'{"version":1,"social":[]}',1);insert into pro_clients(user_id,id,name,email,phone,notes,archived) values(${q(owner)},${q(contact)},'Private job-cost customer','','','Preserved contact',false);insert into pro_work(user_id,id,client,service,stage,start,"end","clientId",cancelled) values(${q(owner)},${q(work)},'Private job-cost customer','Local completed service','completed','2026-01-01T09:00:00-06:00','2026-01-01T10:30:00-06:00',${q(contact)},false);commit;`);
 const financial=(kind,amountCents)=>({actionId:randomUUID(),clientId:contact,workId:work,kind,amountCents});
 await control.exec(`select pro_record_client_operation(${q(owner)},${q(JSON.stringify(financial('agreement',100000)))}::jsonb,1);select pro_record_client_operation(${q(owner)},${q(JSON.stringify(financial('payment',1000)))}::jsonb,2);select pro_expenses_save(${q(owner)},${q(JSON.stringify({action:'supplier',actionId:randomUUID(),revision:0,id:supplier,name:'Private cost supplier',identification:'',email:'',phone:'',archived:false}))}::jsonb);`);
 const originalFinancial=(await state(owner)).financial;
 await a.exec('set role service_role;');await b.exec('set role service_role;');
 const input=(action,revision,extra)=>({action,clientId:contact,workId:work,requestId:randomUUID(),revision,...extra});
 async function same(body){await c.exec(`begin;select pg_advisory_xact_lock(hashtextextended(${q('work-costs:'+owner)},0));`);const jobs=[a.exec(write(owner,body)),b.exec(write(owner,body))];await waitForAdvisories(2);await c.exec('commit;');const results=(await Promise.all(jobs)).map(JSON.parse);assert.deepEqual(results[0],results[1]);assert.equal(results[0].id,body.requestId);assert.equal(results[0].revision,body.revision+1);return results[0];}
 const add=input('add_time',0,{date:'2026-01-01',minutes:90,hourlyCostCents:10000,note:'One actual service'});await same(add);let current=await state(owner);assert.equal(current.costs.length,1);assert.equal(current.costs[0].minutes,90);assert.equal(current.costs[0].amount_cents,15000);assert.equal(current.receipts.length,1);
 console.log('PASS concurrent same add_time: one 90-minute entry, one receipt and exact 15000-cent cost');
 const edit=input('edit_time',1,{entryId:add.requestId,reason:'Correct actual duration',date:'2026-01-01',minutes:120,hourlyCostCents:9000,note:'Corrected time'});await same(edit);current=await state(owner);assert.equal(current.costs.length,3);assert.equal(current.costs.filter(row=>row.reversal_id===add.requestId).length,1);assert.equal(current.costs.find(row=>row.id===edit.requestId).amount_cents,18000);
 console.log('PASS concurrent same edit_time: one new time entry and one audited reversal');
 const voidTime=input('void_time',2,{entryId:edit.requestId,reason:'Incorrect time allocation'});await same(voidTime);current=await state(owner);assert.equal(current.costs.length,4);assert.equal(current.costs.filter(row=>row.reversal_id===edit.requestId).length,1);
 console.log('PASS concurrent same void_time: one reversal and preserved prior history');
 const expenseId=randomUUID(),create=input('create_expense',3,{expenseId,supplierId:supplier,date:'2026-01-01',concept:'Local transport',amountCents:2500,expenseRevision:1});assert.equal((await same(create)).expenseRevision,2);current=await state(owner);assert.equal(current.expenses.length,1);assert.equal(current.assignments.length,1);assert.equal(current.costs.filter(row=>row.id===create.requestId).length,1);assert.equal(current.expenseReceipts.filter(row=>row.action_id===create.requestId).length,1);
 console.log('PASS concurrent create_expense: one expense, assignment, cost entry and transactional expense receipt');
 const unlink=input('unlink_expense',4,{entryId:create.requestId,reason:'Move allocation out of job'});await same(unlink);current=await state(owner);assert.equal(current.expenses.length,1);assert.equal(current.assignments.length,0);
 const link=input('link_expense',5,{expenseId,expenseRevision:2});await same(link);current=await state(owner);assert.equal(current.expenses.length,1);assert.equal(current.assignments.length,1);assert.equal(current.receipts.length,6);
 console.log('PASS concurrent unlink/link existing expense: audited history, one current assignment and no recreated expense');
 const left=input('add_time',6,{date:'2026-01-01',minutes:30,hourlyCostCents:0,note:'CAS left'}),right={...left,requestId:randomUUID(),note:'CAS right'};
 await c.exec(`begin;select pg_advisory_xact_lock(hashtextextended(${q('work-costs:'+owner)},0));`);const results=Promise.allSettled([a.exec(write(owner,left)),b.exec(write(owner,right))]);await waitForAdvisories(2);await c.exec('commit;');const settled=await results;assert.equal(settled.filter(row=>row.status==='fulfilled').length,1);assert.equal(settled.filter(row=>row.status==='rejected').length,1);current=await state(owner);assert.equal(current.receipts.length,7);assert.equal(current.revision,7);
 console.log('PASS distinct requests at the same CAS: exactly one winner');
 const replay=session(),rollback=session();for(const s of [replay,rollback])await s.exec("set statement_timeout='12s';set lock_timeout='8s';set role service_role;");
 await control.exec(`select pro_expenses_save(${q(owner)},${q(JSON.stringify({action:'expense',actionId:randomUUID(),revision:2,id:expenseId,supplierId:supplier,date:'2026-01-02',dueDate:null,currency:'CRC',concept:'Later legitimate metadata',amountCents:3000}))}::jsonb);`);
 const beforeReplay=await state(owner);for(const body of [add,edit,voidTime,create,unlink,link])assert.equal(JSON.parse(await replay.exec(write(owner,body))).id,body.requestId);assert.deepEqual(await state(owner),beforeReplay);
 console.log('PASS historical replay after reversal/relink and newer expense metadata: no extra cost or overwrite');
 const rollbackExpense=input('create_expense',7,{expenseId:randomUUID(),supplierId:supplier,date:'2026-01-01',concept:'Rollback transport',amountCents:4000,expenseRevision:3}),beforeRollback=await state(owner);
 await rollback.exec('begin;'+write(owner,rollbackExpense));await rollback.exec('rollback;');assert.deepEqual(await state(owner),beforeRollback);assert.equal(JSON.parse(await rollback.exec(write(owner,rollbackExpense))).expenseRevision,4);current=await state(owner);assert.equal(current.expenses.length,2);assert.equal(current.assignments.length,2);assert.equal(current.receipts.length,8);assert.deepEqual(current.financial,originalFinancial);
 console.log('PASS rollback atomically removes expense, cost, assignment, revisions and both receipts; exact retry succeeds');
 await control.exec(`update profiles set is_disabled=true where id=${q(owner)};`);const denied=session();await denied.exec("set statement_timeout='12s';set lock_timeout='8s';set role service_role;");const beforeDenied=await state(owner);await assert.rejects(()=>denied.exec(write(owner,add)),error=>String(error).includes('Invalid operation'));assert.deepEqual(await state(owner),beforeDenied);await control.exec(`update profiles set is_disabled=false where id=${q(owner)};`);
 console.log('PASS disabled actor denied before replay; original agreement and payment remain byte-for-byte intact');
}finally{
 try{
  for(const s of sessions.filter(s=>s!==control))await s.close();
  for(const id of ids.reverse()){const result=await api.auth.admin.deleteUser(id);if(result.error)throw Error('Local fixture cleanup failed');}
  const after=await fingerprints();await writeFile('/tmp/pro-work-cost-concurrency-preservation.json',JSON.stringify({before:preservedBefore,after}));await chmod('/tmp/pro-work-cost-concurrency-preservation.json',0o600);assert.deepEqual(after,preservedBefore,'Existing rows changed during disposable job-cost tests');
 }finally{await control.close();}
}
console.log('PASS real PostgreSQL job-cost concurrency; disposable fixtures cleaned and '+preservedTables.length+' table fingerprints unchanged; no installation or external delivery.');
