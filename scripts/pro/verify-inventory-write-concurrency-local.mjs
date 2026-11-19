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
if(process.argv.slice(2).join(' ')!=='--run-local')throw Error('Explicit --run-local required; install the reviewed local inventory SQL separately first.');
const env=parseEnv(await readFile(new URL('../../.env.test',import.meta.url),'utf8'));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,'http://127.0.0.1:54321');
const dbURL=new URL(env.SUPABASE_DB_URL);
assert.equal(dbURL.hostname,'127.0.0.1');assert.equal(dbURL.port,'54322');assert.equal(dbURL.pathname,'/postgres');
assert.ok(['postgres:','postgresql:'].includes(dbURL.protocol));
async function find(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isFile()&&e.name==='psql')return p;if(e.isDirectory()){const result=await find(p);if(result)return result;}}}
const binary=await find(join(homedir(),'.supabase/cache/stack/slim-services/postgres'));assert.ok(binary,'Native psql required');
const sessions=[];
function session(){
 const child=spawn(binary,['-X','-qAt','--set=ON_ERROR_STOP=1'],{env:{...process.env,PGHOST:'127.0.0.1',PGPORT:'54322',PGDATABASE:'postgres',PGUSER:decodeURIComponent(dbURL.username),PGPASSWORD:decodeURIComponent(dbURL.password),PGAPPNAME:'pro-inventory-write-concurrency-'+randomUUID()},stdio:['pipe','pipe','pipe']});
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
async function account(){const {data,error}=await api.auth.admin.createUser({email:'inventory-write-concurrency-'+randomUUID()+'@contratacr.test',password:'Disposable!'+randomUUID()+'a1',email_confirm:true,user_metadata:{role:'professional',is_provider:true,full_name:'Local inventory write fixture',onboarding_completed:true}});if(error)throw Error('Local fixture creation failed');ids.push(data.user.id);return data.user.id;}
const input=(row,revision,mode='create',movements=[])=>({kind:'products',revision,rows:[row],movements,importing:false,inventoryActionId:randomUUID(),inventoryWriteMode:mode});
const row=()=>({id:randomUUID(),sku:'AUTO-'+randomUUID(),name:'Material concurrente',stock:3,minimum:1,cost:10,price:20,archived:false,itemType:'product'});
const movement=(productId,delta)=>({id:randomUUID(),productId,delta,reason:'Local concurrent movement',at:new Date().toISOString()});
const write=(owner,body)=>`select pro_inventory_write_record(${q(owner)},${q(JSON.stringify(body))}::jsonb);`;
const json=async(sql)=>JSON.parse(await control.exec(sql));
async function waitForAdvisories(count){let waiting=0;for(let i=0;i<200&&waiting<count;i++)waiting=Number(await control.exec("select count(*) from pg_stat_activity where application_name like 'pro-inventory-write-concurrency-%' and wait_event='advisory' and query like 'select pro_inventory_write_record%';"));assert.equal(waiting,count,'Expected concurrent inventory writes waiting on the same owner');}
const preservedTables=['quotes','pro_appointment_requests','pro_appointment_events','pro_appointment_actions','pro_appointment_reschedules','pro_appointment_reschedule_actions','pro_work','pro_clients','pro_quote_links','pro_workspace_core','pro_client_entries','notifications','notification_push_outbox','notification_push_deliveries','pro_request_quotes','pro_request_quote_actions','profiles','professionals','pro_appointment_notice_rollout','pro_appointment_notice_receipts','pro_products','pro_movements','pro_inventory_write_actions'];
async function fingerprints(){const result={};for(const table of preservedTables)result[table]=await json(`select json_build_object('count',count(*),'hash',md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text,'[]'))) from ${table} r;`);return result;}
const preservedBefore=await fingerprints();
async function state(owner){return json(`select json_build_object('revision',(select revision from pro_workspace_core where user_id=${q(owner)}),'products',coalesce((select json_agg(to_jsonb(r) order by id) from pro_products r where user_id=${q(owner)}),'[]'),'movements',coalesce((select json_agg(to_jsonb(r) order by id) from pro_movements r where user_id=${q(owner)}),'[]'),'receipts',coalesce((select json_agg(to_jsonb(r) order by action_id) from pro_inventory_write_actions r where actor_id=${q(owner)}),'[]'));`);}
try{
 for(const s of sessions)await s.exec("set statement_timeout='12s';set lock_timeout='8s';");
 assert.equal(await control.exec("select to_regprocedure('public.pro_inventory_write_record(uuid,jsonb)') is not null;"),'t','Reviewed inventory SQL must already be installed');
 const owner=await account(),other=await account();
 await control.exec(`insert into pro_workspace_core(user_id,document,revision) values(${q(owner)},'{"version":1,"social":[]}',1),(${q(other)},'{"version":1,"social":[]}',1);`);
 await a.exec('set role service_role;');await b.exec('set role service_role;');
 const product=row(),first=input(product,1);
 await c.exec(`begin;select pg_advisory_xact_lock(hashtextextended(${q(owner)},0));`);const same=[a.exec(write(owner,first)),b.exec(write(owner,first))];await waitForAdvisories(2);await c.exec('commit;');const results=(await Promise.all(same)).map(JSON.parse);assert.deepEqual(results[0],results[1]);assert.equal(results[0].revision,2);let current=await state(owner);assert.equal(current.revision,2);assert.equal(current.products.length,1);assert.equal(current.receipts.length,1);
 console.log('PASS concurrent identical creates: one product/SKU, one receipt and one revision');
 const outgoing=movement(product.id,-1),stock=input({...product,stock:2},2,'movement',[outgoing]);
 await c.exec(`begin;select pg_advisory_xact_lock(hashtextextended(${q(owner)},0));`);const sameStock=[a.exec(write(owner,stock)),b.exec(write(owner,stock))];await waitForAdvisories(2);await c.exec('commit;');const stockResults=(await Promise.all(sameStock)).map(JSON.parse);assert.deepEqual(stockResults[0],stockResults[1]);assert.equal(stockResults[0].revision,3);current=await state(owner);assert.equal(current.products[0].stock,2);assert.equal(current.movements.length,1);assert.equal(current.receipts.length,2);assert.equal(current.movements[0].at,outgoing.at);
 console.log('PASS concurrent identical movements: stock decremented once and one immutable history row');
 // Different actions based on the same stock/revision must never both succeed.
 const second=input({...product,stock:4},3,'movement',[movement(product.id,2)]),third=input({...product,stock:1.5},3,'movement',[movement(product.id,-0.5)]);
 await c.exec(`begin;select pg_advisory_xact_lock(hashtextextended(${q(owner)},0));`);const different=[a.exec(write(owner,second)),b.exec(write(owner,third))],settled=Promise.allSettled(different);await waitForAdvisories(2);await c.exec('commit;');const outcomes=await settled;assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(outcomes.filter(r=>r.status==='rejected').length,1);current=await state(owner);assert.equal(current.revision,4);assert.equal(current.movements.length,2);assert.equal(current.receipts.length,3);
 console.log('PASS concurrent distinct stock actions: one winner and one stale-CAS rejection');
 const next=session(),rollback=session();for(const s of [next,rollback])await s.exec("set statement_timeout='12s';set lock_timeout='8s';set role service_role;");
 const canonical={...product,stock:current.products[0].stock,name:'Later authorized edit',archived:true};
 await c.exec(`begin;select pg_advisory_xact_lock(hashtextextended(${q(owner)},0));select pro_mutate_catalog(${q(owner)},'products',${q(JSON.stringify([canonical]))}::jsonb,4);`);const replay=next.exec(write(owner,stock));await waitForAdvisories(1);await c.exec('commit;');assert.deepEqual(JSON.parse(await replay),stockResults[0]);current=await state(owner);assert.equal(current.revision,5);assert.equal(current.products[0].stock,canonical.stock);assert.equal(current.products[0].name,canonical.name);assert.equal(current.products[0].archived,true);assert.equal(current.movements.length,2);assert.equal(current.receipts.length,3);
 console.log('PASS historical movement replay after concurrent metadata/archive: current stock/history preserved');
 const rolling=input(row(),5),before=await state(owner);await rollback.exec('begin;'+write(owner,rolling));await rollback.exec('rollback;');assert.deepEqual(await state(owner),before);assert.equal(JSON.parse(await rollback.exec(write(owner,rolling))).revision,6);current=await state(owner);assert.equal(current.products.length,2);assert.equal(current.receipts.length,4);
 console.log('PASS rollback: no retained product/receipt and the exact retry succeeds');
 const separate={...first,rows:[row()]};const otherAck=JSON.parse(await next.exec(write(other,separate)));assert.equal(otherAck.revision,2);assert.notEqual(otherAck.id,results[0].id);assert.equal((await state(other)).receipts.length,1);
 console.log('PASS action namespace isolation across disposable owners');
}finally{
 try{
  for(const s of sessions.filter(s=>s!==control))await s.close();
  for(const id of ids.reverse()){const result=await api.auth.admin.deleteUser(id);if(result.error)throw Error('Local fixture cleanup failed');}
  const after=await fingerprints(),report='/tmp/pro-inventory-write-concurrency-preservation.json';await writeFile(report,JSON.stringify({before:preservedBefore,after}));await chmod(report,0o600);assert.deepEqual(after,preservedBefore,'Existing rows changed during isolated-fixture concurrency tests');
 }finally{await control.close();}
}
console.log('PASS real PostgreSQL inventory concurrency: only disposable fixtures, cleaned with 23 table fingerprints unchanged; no installation or external delivery.');
