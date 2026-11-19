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
const sql=await readFile('docs/pro/sql/request-quotes-local.sql','utf8');await db.exec(sql);
await db.query("select pro_appointment_preferences_record($1,$2)",[owner,{actionId:uid(),revision:0,enabled:true}]);
const preserved=async()=>({contacts:(await db.query('select to_jsonb(c) row from pro_clients c')).rows,legacy:(await db.query('select * from pro_workspace_legacy_backup')).rows,panel:(await db.query('select * from pro_panel_legacy_backup')).rows});const before=await preserved();
const appointment=async(hour)=>{const input={action:'create',id:uid(),actionId:uid(),professionalId:professional,service:'Servicio base',durationMinutes:60,locationKind:'agree',locationText:'',note:'Nota cliente',start:at(hour),preferredDay:null,preference:''};return(await db.query('select pro_appointment_mutate($1,$2) r',[client,input])).rows[0].r;};
const base=(source,patch={})=>({sourceRequestId:source,clientActionId:uid(),clientName:'Cliente citado',clientPhone:'',clientCedula:'',clientEmail:'',title:'Ordinaria sin extras',items:[{description:'Servicio',quantity:1,unit_price:1000}],taxMode:'mas_iva',notes:'Servicio acordado',validDays:15,...patch});
const source={public_code:'abcdefghjkmn',created_source_host:'127.0.0.1',created_app_environment:'local',created_supabase_project_ref:'local'};
const create=async(input,actor=owner,code=uid().replaceAll('-','').slice(0,12))=>(await db.query('select pro_request_quote_create($1,$2,$3) r',[actor,input,{...source,public_code:code}])).rows[0].r;
const respond=async(input,actor=client)=>(await db.query('select pro_request_quote_respond($1,$2) r',[actor,input])).rows[0].r;
const detail=async(id,actor=client)=>(await db.query('select pro_request_quote_detail($1,$2) r',[actor,id])).rows[0].r;
const response=(quote,action='accept')=>({id:quote.id,action,clientActionId:uid(),expectedUpdatedAt:quote.updated_at});
const account=async(workId)=>(await db.query('select pro_work_account($1,$2) r',[owner,workId])).rows[0].r;
await db.exec('set role service_role');
const request=await appointment(8),input=base(request.id),created=await create(input);assert.equal(created.quote.client_id,client);assert.equal(created.quote.project_id,null);assert.equal(created.quote.total,1130);assert.equal(created.quote.tax_amount,130);assert.equal(created.workId,null);assert.equal((await db.query('select "clientId" from pro_quote_links where "quoteId"=$1',[created.quote.id])).rows[0].clientId,'reservation-'+client);
assert.deepEqual(await create(input),created);await assert.rejects(()=>create({...input,title:'Changed replay'}),e=>e.code==='22023');
await assert.rejects(()=>create(base(uid())),e=>e.code==='P0002');await assert.rejects(()=>create(base(request.id),other),e=>e.code==='P0002');await assert.rejects(()=>create(base(request.id,{items:Array.from({length:21},()=>input.items[0])})),e=>e.code==='22023');
const page=async(requestId=null,actor=client,after=null)=>(await db.query('select pro_quote_choice_page($1,$2,$3) r',[actor,after,requestId])).rows[0].r;
assert.equal((await page(request.id)).items[0].kind,'ordinary');assert.equal((await page()).items[0].quoteId,created.quote.id);assert.equal(await detail(created.quote.id,stranger),null);assert.equal((await page(null,stranger)).items.length,0);
await assert.rejects(()=>respond(response(created.quote),stranger),e=>e.code==='42501');await assert.rejects(()=>respond({...response(created.quote),expectedUpdatedAt:'2000-01-01T00:00:00Z'}),e=>e.code==='40001');
const approval=response(created.quote),approved=await respond(approval);assert.equal(approved.quote.status,'accepted');assert.equal(approved.workId,null);assert.deepEqual(await respond(approval),approved);
const confirmed=(await db.query('select pro_appointment_mutate($1,$2) r',[owner,{action:'confirm',id:request.id,actionId:uid(),revision:request.revision}])).rows[0].r;
assert.equal((await db.query('select "externalQuoteId" from pro_work where user_id=$1 and id=$2',[owner,confirmed.workId])).rows[0].externalQuoteId,created.quote.id);
assert.equal((await account(confirmed.workId)).agreedCents,113000);assert.equal((await account(confirmed.workId)).balanceCents,113000);
// A duplicate acceptance cannot replace a prior accepted document; rollback retains every row.
const second=await create(base(request.id));await assert.rejects(()=>respond(response(second.quote)),e=>e.code==='23505');assert.equal((await detail(second.quote.id)).quote.status,'sent');
// Existing confirmed work receives its quote during acceptance, not during creation.
const next=await appointment(10);const scheduled=(await db.query('select pro_appointment_mutate($1,$2) r',[owner,{action:'confirm',id:next.id,actionId:uid(),revision:next.revision}])).rows[0].r;
assert.equal((await account(scheduled.workId)).agreedCents,null);
const nextInput=base(next.id),nextQuote=await create(nextInput);assert.equal((await db.query('select "externalQuoteId" from pro_work where id=$1',[scheduled.workId])).rows[0].externalQuoteId,null);const nextResponse=response(nextQuote.quote);await respond(nextResponse);assert.equal((await db.query('select "externalQuoteId" from pro_work where id=$1',[scheduled.workId])).rows[0].externalQuoteId,nextQuote.quote.id);
// The accepted document is a read fallback, not an automatic financial entry.
assert.equal((await account(scheduled.workId)).agreedCents,113000);
assert.equal((await db.query('select count(*)::int n from pro_client_entries')).rows[0].n,0);
// Even a later view/replay reads the same amount without appending ledger rows.
assert.equal((await account(scheduled.workId)).agreedCents,113000);
for(const status of ['withdrawn','declined','sent']){
 await assert.rejects(()=>db.query('update quotes set status=$1 where id=$2',[status,nextQuote.quote.id]),e=>e.code==='23514');
 assert.equal((await account(scheduled.workId)).agreedCents,113000);
}
await assert.rejects(()=>db.query('update quotes set deleted_at=now() where id=$1',[nextQuote.quote.id]),e=>e.code==='23514');
await assert.rejects(()=>db.query('update quotes set total=9999 where id=$1',[nextQuote.quote.id]),e=>e.code==='23514');
await assert.rejects(()=>db.query("update quotes set items='[]' where id=$1",[nextQuote.quote.id]),e=>e.code==='23514');
// Exact request/work/contact identity prevents a copied quote link becoming a charge.
await db.exec('begin');
await assert.rejects(()=>db.query('update pro_work set "bookingClientId"=$1 where user_id=$2 and id=$3',[stranger,owner,scheduled.workId]),e=>e.code==='23514');await db.exec('rollback');
await db.exec('begin');await db.query('update pro_request_quotes set client_user_id=$1 where quote_id=$2',[stranger,nextQuote.quote.id]);assert.equal((await account(scheduled.workId)).agreedCents,null);await db.exec('rollback');
await db.exec('begin');
await db.query(`insert into pro_work(user_id,id,client,service,stage,start,"end","clientId","externalQuoteId",cancelled,"bookingClientId") select user_id,'copied-work',client,service,stage,start,"end","clientId","externalQuoteId",cancelled,"bookingClientId" from pro_work where user_id=$1 and id=$2`,[owner,scheduled.workId]);
assert.equal((await account('copied-work')).agreedCents,null);await db.exec('rollback');
// Positive/zero manual agreements always win, including after acceptance. Real
// payments can use the accepted-document balance, with existing CAS/idempotency.
await db.exec('begin');
let financialRevision=(await db.query('select revision from pro_workspace_core where user_id=$1',[owner])).rows[0].revision;
const operation=(kind,amountCents)=>({actionId:uid(),clientId:'reservation-'+client,workId:scheduled.workId,kind,amountCents,note:'Prueba aislada'});
const manualZero=operation('agreement',0);financialRevision=(await db.query('select pro_record_client_operation($1,$2,$3) revision',[owner,manualZero,financialRevision])).rows[0].revision;
assert.equal((await account(scheduled.workId)).agreedCents,0);
financialRevision=(await db.query('select pro_record_client_operation($1,$2,$3) revision',[owner,operation('agreement',222222),financialRevision])).rows[0].revision;
assert.equal((await account(scheduled.workId)).agreedCents,222222);await db.exec('rollback');
await db.exec('begin');
financialRevision=(await db.query('select revision from pro_workspace_core where user_id=$1',[owner])).rows[0].revision;
const payment=operation('payment',1000);const paidRevision=(await db.query('select pro_record_client_operation($1,$2,$3) revision',[owner,payment,financialRevision])).rows[0].revision;
assert.equal((await account(scheduled.workId)).agreedCents,113000);assert.equal((await account(scheduled.workId)).paidCents,1000);assert.equal((await account(scheduled.workId)).balanceCents,112000);
assert.equal((await db.query('select pro_record_client_operation($1,$2,$3) revision',[owner,payment,financialRevision])).rows[0].revision,paidRevision);
assert.equal((await db.query('select count(*)::int n from pro_client_entries')).rows[0].n,1);
await db.exec('savepoint paid_quote_guard');await assert.rejects(()=>db.query('update quotes set total=9999 where id=$1',[nextQuote.quote.id]),e=>e.code==='23514');await db.exec('rollback to savepoint paid_quote_guard');
assert.equal((await account(scheduled.workId)).balanceCents,112000);await db.exec('rollback');
assert.equal((await db.query('select count(*)::int n from pro_client_entries')).rows[0].n,0);
// Lost creation/response receipts stay replayable after source cancellation, archive, and clock-relative validity changes.
await db.query('select pro_appointment_mutate($1,$2)',[client,{action:'cancel',id:next.id,actionId:uid(),revision:scheduled.revision,note:''}]);await db.query('update pro_clients set archived=true where user_id=$1',[owner]);assert.deepEqual(await create(nextInput),nextQuote);assert.equal((await respond(nextResponse)).quote.status,'accepted');await assert.rejects(()=>create(base(next.id)),e=>e.code==='40001');await db.query('update pro_clients set archived=false where user_id=$1',[owner]);
// Configured extras keep their own approval and appear once under the same cursor/request.
const extrasRequest=await appointment(12),extrasQuote=await create(base(extrasRequest.id));const extra={id:uid(),description:'Extra',quantity:1,unit_price:500};await db.query('select pro_quote_choice_mutate($1,$2)',[owner,{action:'configure',quoteId:extrasQuote.quote.id,actionId:uid(),revision:0,extras:[extra]}]);assert.equal((await detail(extrasQuote.quote.id)).configuredExtras,true);assert.equal((await page(extrasRequest.id)).items.filter(row=>row.quoteId===extrasQuote.quote.id).length,1);assert.equal((await page(extrasRequest.id)).items[0].kind,'extras');await assert.rejects(()=>respond(response(extrasQuote.quote)),e=>e.code==='40001');
// Expiry, provider status, pagination and disabled actors do not weaken ordinary/extras guards.
const finalRequest=await appointment(14),expired=await create(base(finalRequest.id));await db.query("update quotes set valid_until='2000-01-01' where id=$1",[expired.quote.id]);await assert.rejects(()=>respond(response(expired.quote)),e=>e.code==='40001');
await db.query('update professionals set is_banned=true where id=$1',[professional]);await assert.rejects(()=>create(base(finalRequest.id)),e=>e.code==='42501');await db.query('update professionals set is_banned=false where id=$1',[professional]);
for(let i=0;i<21;i++)await create(base(finalRequest.id));const first=await page(),last=await page(null,client,first.nextCursor);assert.equal(first.items.length,20);assert.ok(first.nextCursor);assert.ok(last.items.length>0);assert.equal(new Set([...first.items,...last.items].map(row=>row.quoteId)).size,first.items.length+last.items.length);
const countNew=async()=>Object.fromEntries(await Promise.all(['quotes','pro_request_quotes','pro_quote_links','pro_request_quote_actions'].map(async table=>[table,(await db.query('select count(*)::int n from '+table)).rows[0].n])));const beforeFailure=await countNew();const failedInput=base(finalRequest.id);await assert.rejects(()=>create(failedInput,owner,created.quote.public_code),e=>e.code==='23505');assert.deepEqual(await countNew(),beforeFailure);
await db.query("update pro_memberships set expires_at=now()-interval '1 day' where user_id=$1",[owner]);await assert.rejects(()=>create(base(finalRequest.id)),e=>e.code==='42501');await db.query('update pro_memberships set expires_at=null where user_id=$1',[owner]);await db.query('update pro_clients set archived=true where user_id=$1',[owner]);await assert.rejects(()=>create(base(finalRequest.id)),e=>e.code==='40001');await db.query('update pro_clients set archived=false where user_id=$1',[owner]);
assert.ok((await page(request.id)).items.every(row=>[created.quote.id,second.quote.id].includes(row.quoteId)));
await db.query('update profiles set is_disabled=true where id=$1',[client]);assert.equal(await detail(created.quote.id),null);await assert.rejects(()=>respond(response(second.quote)),e=>e.code==='42501');await db.query('update profiles set is_disabled=false where id=$1',[client]);
assert.equal((await db.query('select count(*)::int n from pro_client_entries')).rows[0].n,0);assert.deepEqual(await preserved(),before);
await db.exec('reset role');
// Existing quote RLS permits SELECT only; both mapped and unrelated direct writes remain denied.
const plain=uid();await db.query("insert into quotes(id,professional_id,client_id,public_code,title) values($1,$2,$3,$4,'Sin vínculo')",[plain,professional,client,'plain-code01']);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[client]);await db.exec('set role authenticated');assert.equal((await db.query('select id from quotes where id=$1',[plain])).rows.length,1);await assert.rejects(()=>db.query("update quotes set title='No autorizado' where id=$1",[plain]),e=>e.code==='42501');await assert.rejects(()=>db.query("update quotes set title='No autorizado' where id=$1",[created.quote.id]),e=>e.code==='42501');await assert.rejects(()=>db.query('select * from pro_request_quotes'),e=>e.code==='42501');await assert.rejects(()=>db.query('select pro_request_quote_create($1,$2,$3)',[owner,input,source]),e=>e.code==='42501');await db.exec('reset role');
for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(()=>db.query('select * from pro_request_quote_actions'),e=>e.code==='42501');await assert.rejects(()=>account(scheduled.workId),e=>e.code==='42501');await assert.rejects(()=>detail(created.quote.id),e=>e.code==='42501');await db.exec('reset role');}
await db.exec(sql);assert.deepEqual(await preserved(),before);assert.equal((await detail(created.quote.id)).quote.status,'accepted');await db.close();console.log('PASS request quotes: real Pro schemas/triggers, ordinary recipients, atomic links before/after confirmation, unchanged original contacts/history, receipts, expiry/CAS, extras guard/list dedupe, accepted uniqueness rollback, strict accepted-quote account fallback, manual zero/positive precedence, payment replay, authenticated SELECT-only compatibility and service-only grants.');
