// Isolated in-memory PostgreSQL only: no network, shared database, fixture reset or delivery.
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
await db.exec('create table projects(id uuid primary key,client_id uuid references profiles(id),title text,status text,allow_direct_contact boolean)');
const sql=await readFile('docs/pro/sql/direct-project-quotes-local.sql','utf8');await db.exec(sql);await db.exec(sql);
const project=uid();await db.query("insert into projects values($1,$2,'Local project','open',true)",[project,client]);
const input=(patch={})=>({context:'direct',clientActionId:uid(),proClientId:null,clientName:'Local client',clientPhone:null,clientCedula:null,clientEmail:null,title:'Local quote',items:[{description:'Service',quantity:2,unit_price:1000}],taxMode:'mas_iva',notes:null,validDays:15,...patch});
const create=async(body,actor=owner)=>(await db.query('select pro_direct_project_quote_create($1,$2,$3) r',[actor,body,{public_code:uid()}])).rows[0].r;
const counts=async()=>(await db.query("select (select count(*) from quotes)::int quotes,(select count(*) from pro_quote_links)::int links,(select count(*) from pro_direct_project_quote_actions)::int receipts")).rows[0];
const preserved=(await db.query('select * from pro_clients order by id')).rows;
const direct=input(),first=await create(direct);assert.equal(first.quote.client_id,null);assert.equal(first.quote.project_id,null);assert.equal(first.quote.total,2260);assert.deepEqual(await create(direct),first);assert.deepEqual(await counts(),{quotes:1,links:0,receipts:1});
await assert.rejects(()=>create({...direct,title:'Changed'}),e=>e.code==='22023');
const linked=input({proClientId:'reservation-'+client}),saved=await create(linked);assert.equal(saved.quote.client_id,null);assert.deepEqual(await counts(),{quotes:2,links:1,receipts:2});
const projectInput=input({context:'project',projectId:project,proClientId:'reservation-'+client}),projectSaved=await create(projectInput);assert.equal(projectSaved.quote.client_id,client);assert.equal(projectSaved.quote.project_id,project);
await db.query("update projects set status='completed' where id=$1",[project]);await db.query('update pro_clients set archived=true where user_id=$1',[owner]);assert.deepEqual(await create(projectInput),projectSaved);assert.deepEqual(await create(linked),saved);
await assert.rejects(()=>create({...projectInput,clientActionId:uid()}),e=>e.code==='40001');
await db.query('update pro_clients set archived=false where user_id=$1',[owner]);await db.query("update projects set status='open' where id=$1",[project]);
await assert.rejects(()=>create(input({context:'project',projectId:project,proClientId:null})),e=>e.code==='42501');
await assert.rejects(()=>create(input({proClientId:'foreign-contact'})),e=>e.code==='40001');await assert.rejects(()=>create(input(),stranger),e=>e.code==='42501');
await db.query('update profiles set is_disabled=true where id=$1',[owner]);await assert.rejects(()=>create(direct),e=>e.code==='42501');await db.query('update profiles set is_disabled=false where id=$1',[owner]);
await db.query("update pro_memberships set status='inactive' where user_id=$1",[owner]);await assert.rejects(()=>create(direct),e=>e.code==='42501');await db.query("update pro_memberships set status='active' where user_id=$1",[owner]);
const before=await counts();await db.exec('begin');await create(input({proClientId:'reservation-'+client}));await db.exec('rollback');assert.deepEqual(await counts(),before);
// Force failure after quote insert, proving atomic link + quote + receipt rollback.
await db.exec("create function reject_test_link() returns trigger language plpgsql as $$begin raise exception 'forced fixture failure';end$$;create trigger test_link_failure before insert on pro_quote_links for each row execute function reject_test_link();");await assert.rejects(()=>create(input({proClientId:'reservation-'+client})));assert.deepEqual(await counts(),before);await db.exec('drop trigger test_link_failure on pro_quote_links;drop function reject_test_link()');
for(const malformed of [{extra:1},{items:[]},{items:[{description:'Bad',quantity:1,unit_price:-1}]},{context:'direct',projectId:project},{validDays:null},{clientName:null}])await assert.rejects(()=>create(input(malformed)));
for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(()=>create(input()));await assert.rejects(()=>db.query('select * from pro_direct_project_quote_actions'));await db.exec('reset role');}
assert.deepEqual((await db.query('select * from pro_clients order by id')).rows,preserved);await db.exec(sql);assert.deepEqual(await create(direct),first);assert.deepEqual(await counts(),before);
await db.close();console.log('PASS isolated direct/project quotes: actor authorization on replay, manual recipient without inference, causal project recipient, atomic quote/link/receipt, identical replay, changed-input rejection, mutable origin recovery, rollback, grants, reinstall and preserved contacts. Real multi-connection concurrency remains separate.');
