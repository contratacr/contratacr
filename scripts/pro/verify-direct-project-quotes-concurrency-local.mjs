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
 const child=spawn(binary,['-X','-qAt','--set=ON_ERROR_STOP=1'],{env:{...process.env,PGHOST:'127.0.0.1',PGPORT:'54322',PGDATABASE:'postgres',PGUSER:decodeURIComponent(dbURL.username),PGPASSWORD:decodeURIComponent(dbURL.password),PGAPPNAME:'pro-quote-concurrency-'+randomUUID()},stdio:['pipe','pipe','pipe']});
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
const json=async(sql)=>JSON.parse(await control.exec(sql));
async function account(){const id=randomUUID(),email='quote-concurrency-'+id+'@contratacr.test';const {data,error}=await api.auth.admin.createUser({email,password:'Disposable!'+randomUUID()+'a1',email_confirm:true,user_metadata:{role:'professional',is_provider:true,full_name:'Local concurrency fixture',onboarding_completed:true}});if(error)throw Error('Local fixture account creation failed');ids.push(data.user.id);await api.from('profiles').update({role:'professional',is_provider:true,is_disabled:false,onboarding_completed:true}).eq('id',data.user.id).throwOnError();return data.user.id;}
let professional,owner,client,project;
const body=(patch={})=>({context:'direct',clientActionId:randomUUID(),proClientId:null,clientName:'Local quote concurrency',clientPhone:null,clientCedula:null,clientEmail:null,title:'Local test quote',items:[{description:'Service',quantity:1,unit_price:1000}],taxMode:'exento',notes:null,validDays:15,...patch});
const rpc=(input)=>`select pro_direct_project_quote_create(${q(owner)},${q(JSON.stringify(input))}::jsonb,${q(JSON.stringify({public_code:randomUUID()}))}::jsonb);`;
async function waitBlocked(expected,event='advisory'){
 let count=0;for(let i=0;i<200&&count<expected;i++)count=Number(await control.exec(`select count(*) from pg_stat_activity where application_name like 'pro-quote-concurrency-%' and wait_event=${q(event)} and query like 'select pro_direct_project_quote_create%';`));
 assert.equal(count,expected,'Expected simultaneous PostgreSQL lock waits');
}
async function counts(){return json(`select json_build_object('quotes',(select count(*) from quotes where professional_id=${q(professional)}),'links',(select count(*) from pro_quote_links where user_id=${q(owner)}),'receipts',(select count(*) from pro_direct_project_quote_actions where actor_id=${q(owner)}));`);}
try{
 for(const s of sessions)await s.exec("set statement_timeout='12s';set lock_timeout='8s';");
 assert.equal(await control.exec("select to_regprocedure('public.pro_direct_project_quote_create(uuid,jsonb,jsonb)') is not null;"),'t','Install additive local SQL separately first');
 owner=await account();client=await account();professional=randomUUID();project=randomUUID();
 await control.exec(`begin;
 insert into pro_memberships(user_id,status) values(${q(owner)},'active');
 insert into pro_workspace_core(user_id,document,revision) values(${q(owner)},'{}',1);
 insert into professionals(id,profile_id,category_id,business_name,slug,whatsapp,provincia_id,canton_id,verification_status,is_available,is_banned) values(${q(professional)},${q(owner)},'desarrollo_web','Local quote fixture',${q('quote-concurrency-'+professional)},'','al','al-at','pending',true,false);
 insert into pro_clients(user_id,id,name,email,phone,notes,archived) values(${q(owner)},${q('reservation-'+client)},'Local client','','','',false);
 insert into projects(id,client_id,title,description,category_id,provincia_id,canton_id,status,allow_direct_contact,allow_phone_contact) values(${q(project)},${q(client)},'Local concurrency project','Disposable local fixture','desarrollo_web','al','al-at','open',true,false);
 commit;`);
 const input=body({proClientId:'reservation-'+client});
 await c.exec(`begin;select pg_advisory_xact_lock(hashtextextended(${q(owner)},0));`);
 const same=[a.exec(rpc(input)),b.exec(rpc(input))];await waitBlocked(2);await c.exec('commit;');const [one,two]=(await Promise.all(same)).map(JSON.parse);
 assert.deepEqual(one,two);assert.deepEqual(await counts(),{quotes:1,links:1,receipts:1});
 console.log('PASS same action in two waiting PostgreSQL sessions creates one quote/link/receipt');
 await c.exec(`begin;select pg_advisory_xact_lock(hashtextextended(${q(owner)},0));`);
 const distinct=[a.exec(rpc(body())),b.exec(rpc(body()))];await waitBlocked(2);await c.exec('commit;');const distinctRows=(await Promise.all(distinct)).map(x=>JSON.parse(x).quote);
 assert.equal(new Set(distinctRows.map(row=>row.quote_number)).size,2);assert.deepEqual(distinctRows.map(row=>row.quote_number).sort((x,y)=>x-y),[2,3]);assert.deepEqual(await counts(),{quotes:3,links:1,receipts:3});
 console.log('PASS distinct concurrent actions receive distinct sequential numbers');
 // Conventional path does not use owner advisory: an uncommitted next-number
 // insert collides with the RPC after its max() read, forcing the unique retry.
 await c.exec(`begin;insert into quotes(professional_id,public_code,quote_number,title,items,tax_mode,status) values(${q(professional)},${q(randomUUID())},4,'Conventional fixture','[]','exento','sent');`);
 const collision=a.exec(rpc(body()));await waitBlocked(1,'transactionid');await c.exec('commit;');const retried=JSON.parse(await collision);
 assert.equal(retried.quote.quote_number,5);assert.deepEqual(await counts(),{quotes:5,links:1,receipts:4});
 console.log('PASS conventional insert race retries unique number without duplicating action');
 const before=await counts();await a.exec('begin;'+rpc(body({proClientId:'reservation-'+client})));await a.exec('rollback;');assert.deepEqual(await counts(),before);
 console.log('PASS rollback removes quote, link and action receipt atomically');
 const projectInput=body({context:'project',projectId:project,proClientId:'reservation-'+client});
 const created=JSON.parse(await a.exec(rpc(projectInput)));assert.equal(created.quote.client_id,client);
 await control.exec(`update projects set status='completed' where id=${q(project)};update pro_clients set archived=true where user_id=${q(owner)};`);
 assert.deepEqual(JSON.parse(await a.exec(rpc(projectInput))),created);assert.equal((await counts()).quotes,6);
 console.log('PASS exact replay survives project closure and contact archive after commit');
 // Authorization is checked after acquiring the owner lock, including replays.
 await c.exec(`begin;select pg_advisory_xact_lock(hashtextextended(${q(owner)},0));update profiles set is_disabled=true where id=${q(owner)};`);
 const denied=a.exec(rpc(projectInput));const rejected=assert.rejects(denied,/Provider unavailable/);await waitBlocked(1);await c.exec('commit;');await rejected;assert.equal((await counts()).quotes,6);
 console.log('PASS profile disabled before owner-lock acquisition denies historical replay');
 const audit=await json(`select json_build_object('notifications',(select count(*) from notifications where user_id in (${ids.map(q).join(',')})),'outbox',(select count(*) from notification_push_outbox where user_id in (${ids.map(q).join(',')})),'deliveries',(select count(*) from notification_push_deliveries d join notification_push_outbox o on o.id=d.outbox_id where o.user_id in (${ids.map(q).join(',')})),'tokens',(select count(*) from user_push_tokens where user_id in (${ids.map(q).join(',')})));`);
 assert.deepEqual(audit,{notifications:0,outbox:0,deliveries:0,tokens:0});console.log('PASS zero notifications, outbox, transport deliveries and push tokens');
}finally{
 await Promise.all(sessions.map(s=>s.close()));
 for(const id of ids){const {error}=await api.auth.admin.deleteUser(id);if(error)throw Error('Own fixture cleanup failed: '+id);}
 for(const [table,column,values] of [['profiles','id',ids],['notifications','user_id',ids],['notification_push_outbox','user_id',ids],['pro_direct_project_quote_actions','actor_id',ids],['quotes','professional_id',professional?[professional]:[]],['projects','id',project?[project]:[]]]){
  if(!values.length)continue;const {data,error}=await api.from(table).select(column).in(column,values);assert.equal(error,null,'Cleanup verification unavailable');assert.equal(data.length,0,'Residual own fixture '+table);
 }
 console.log('PASS all PostgreSQL sessions closed and own fixtures removed');
}
