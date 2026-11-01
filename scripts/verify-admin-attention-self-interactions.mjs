import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const db=new PGlite();
const admin='00000000-0000-4000-8000-000000000001', user='00000000-0000-4000-8000-000000000002', other='00000000-0000-4000-8000-000000000003', pro='10000000-0000-4000-8000-000000000001';
try {
await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create table profiles(id uuid primary key,role text,is_disabled boolean default false,cedula text,client_identity_status text,client_identity_verified_at timestamptz);
create table professionals(id uuid primary key,profile_id uuid,verification_status text,verification_reason text,verification_updated_at timestamptz,created_at timestamptz default now());
create table notifications(id uuid default gen_random_uuid(),user_id uuid,type text constraint notifications_type_check check(type in ('verification','support_reply')),title text,message text,data jsonb,created_at timestamptz default now());
alter table notifications enable row level security; grant select on notifications,profiles to authenticated; grant usage on schema auth to authenticated;
create policy own on notifications for select to authenticated using(user_id=auth.uid());
create table support_tickets(id uuid primary key,status text,topic text,professional_id uuid);
create table support_ticket_messages(id uuid primary key,ticket_id uuid,sender_role text);
create table reports(id uuid primary key,status text);
create table category_suggestions(id text primary key,status text);
create table account_deletion_requests(id uuid primary key,status text,attempts int default 0);
create table interaction_events(id uuid default gen_random_uuid(),professional_id uuid,viewer_user_id uuid,event_type text);
insert into profiles(id,role) values('${admin}','admin'),('${user}','professional'),('${other}','client');
insert into professionals(id,profile_id) values('${pro}','${user}');
insert into interaction_events(professional_id,viewer_user_id,event_type) values('${pro}','${user}','whatsapp_click'),('${pro}','${other}','whatsapp_click'),('${pro}','${user}','identity_verified');`);
const migration=fs.readFileSync(new URL('../supabase/migrations/257_avisos_admin_y_excluir_autocontactos.sql',import.meta.url),'utf8');
await db.exec(migration); await db.exec(migration);
assert.equal((await db.query('select count(*)::int n from notifications')).rows[0].n,0,'no backlog on migration');
assert.equal((await db.query('select count(*)::int n from excluded_self_interactions')).rows[0].n,1);
for(const type of ['profile_view','whatsapp_click','phone_click','email_click','profile_share','external_link_click','availability_view','contact_gate_shown']) {
 await db.query('insert into interaction_events(professional_id,viewer_user_id,event_type) values($1,$2,$4),($1,$3,$4)',[pro,user,other,type]);
 assert.equal((await db.query('select count(*)::int n from interaction_events where event_type=$1 and viewer_user_id=$2',[type,user])).rows[0].n,0);
}
await db.query("insert into interaction_events(professional_id,viewer_user_id,event_type) values($1,null,'profile_view'),($1,$2,'project_lead_phone')",[pro,user]);
assert.equal((await db.query("select count(*)::int n from interaction_events where event_type='project_lead_phone'")).rows[0].n,1,'contacting another project with own professional id is legitimate');
let total=0;
async function count(n){total+=n;assert.equal((await db.query('select count(*)::int n from notifications')).rows[0].n,total);}
await db.exec("insert into support_tickets values('20000000-0000-4000-8000-000000000001','open','verification_documents',null)"); await count(1);
await db.exec("insert into support_ticket_messages values('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','user')");await count(0);
await db.exec("insert into support_ticket_messages values('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','admin')");await count(0);
await db.exec("insert into support_ticket_messages values('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','user')");await count(1);
await db.exec("insert into reports values(gen_random_uuid(),'open'); insert into category_suggestions values('suggestion','pending'); update category_suggestions set status='pending'");await count(2);
await db.exec("insert into account_deletion_requests values('40000000-0000-4000-8000-000000000001','pending',0); update account_deletion_requests set status='processing'; update account_deletion_requests set status='failed',attempts=1; update account_deletion_requests set attempts=1");await count(2);
await db.query("update professionals set verification_status='pending',verification_reason='Identificación no encontrada.',verification_updated_at=now() where id=$1",[pro]);await count(1);
await db.query("update support_tickets set professional_id=$1",[pro]);
await db.query("update professionals set verification_status='under_appeal' where id=$1",[pro]);await count(0);
await db.query("update professionals set verification_status='verified' where id=$1",[pro]);await count(0);
await db.query("update profiles set cedula='123456789',client_identity_status='pending' where id=$1",[other]);await count(1);
assert.equal((await db.query('select count(*)::int n from notifications where user_id<>$1',[admin])).rows[0].n,0);
assert.equal((await db.query("select count(*)::int n from notifications where message <> 'Hay un elemento nuevo por atender en el panel administrativo.'")).rows[0].n,0);
await db.query("select set_config('test.uid',$1,false)",[admin]);await db.exec('set role authenticated');
assert.equal((await db.query('select count(*)::int n from notifications')).rows[0].n,total);
await assert.rejects(db.query("select notify_admin_attention('forged','forged','/admin')"));
await assert.rejects(db.query('select * from excluded_self_interactions'));
await db.exec('reset role');await db.query("update profiles set role='client' where id=$1",[admin]);await db.exec('set role authenticated');
assert.equal((await db.query('select count(*)::int n from notifications')).rows[0].n,0,'revoked admin cannot see historical alerts');
await db.exec('reset role');await db.exec("insert into category_suggestions values('no-admin','pending')");await count(0);
// Execute the actual ownership helper, including failed lookups and operational events.
const source=fs.readFileSync(new URL('../src/lib/analytics/self-interaction.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const exp={};new Function('exports',compiled)(exp);
const mock={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{profile_id:user}})})})})};
assert.equal(await exp.isSelfInteraction(mock,pro,user,'phone_click'),true);
assert.equal(await exp.isSelfInteraction(mock,pro,other,'phone_click'),false);
assert.equal(await exp.isSelfInteraction(mock,pro,user,'project_lead_phone'),false);
assert.equal(await exp.isSelfInteraction(mock,pro,null,'phone_click'),false);
const workerSource=fs.readFileSync(new URL('../src/lib/push/worker.ts',import.meta.url),'utf8');
const workerJS=ts.transpileModule(workerSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let liveRole='admin',disabled=false,roleFailure=false,tokenReads=0;
const workerDb={from:table=>{
 if(table==='profiles') return {select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:liveRole,is_disabled:disabled},error:roleFailure?new Error('read failed'):null})})})};
 tokenReads++; return {select:()=>({eq:()=>({eq:()=>({eq:async()=>({data:[{id:'device',token:'fake-test-token-only'}]})})})})};
}};
const worker={};new Function('exports','require',workerJS+';exports.testRepository=defaultRepository;')(worker,name=>{
 if(name==='node:crypto') return {randomUUID:()=> 'test-worker'};
 if(name.endsWith('/supabase/admin')) return {createAdminClient:()=>workerDb};
 if(name.endsWith('/push/retry')) return {isPushDeliveryEnabled:()=>true};
 return {};
});
const repository=worker.testRepository();
assert.equal((await repository.activeFcmTokens(admin,true)).length,1);
liveRole='client';assert.equal((await repository.activeFcmTokens(admin,true)).length,0);
liveRole='admin';disabled=true;assert.equal((await repository.activeFcmTokens(admin,true)).length,0);
disabled=false;roleFailure=true;await assert.rejects(repository.activeFcmTokens(admin,true));
assert.equal(tokenReads,1,'revoked/disabled/error never reads tokens');
let adminOnlyFlag=false,finished=false;
await worker.processClaimedPushJob({id:'job',user_id:admin,data:{admin_attention:true}},'worker',{
 activeFcmTokens:async(id,adminOnly)=>{assert.equal(id,admin);adminOnlyFlag=adminOnly;return [];},
 deliveredTokenIds:async()=>new Set(),finish:async()=>{finished=true;},
},async()=>{throw new Error('must not send');});
assert.equal(adminOnlyFlag,true);assert.equal(finished,true);
console.log('PASS: all admin queues, first-message dedup, user replies, no admin replies/backlog, live role RLS, private generic text, self history archive, self vs others/guests, operational events retained, actual ownership helper.');
} finally {await db.close();}
