-- LOCAL PRO ONLY. Round 10 (2026-11-15), Sales (Houzz Pro parity rows 05, 07, 08).
--  * Contacts (row 05): server preview of a mapped CSV/vCard import with validation and duplicate
--    detection against the owner's own customers (normalized e-mail / Costa Rica phone) and inside the
--    file; atomic, idempotent import through the existing catalog writer (pro_mutate_catalog, same
--    workspace revision CAS: a stale screen gets 40001); tags per customer; duplicate groups; merge of
--    two customers (the kept record receives the missing contact fields, notes and tags; the other one
--    is ARCHIVED, never deleted, and remembered as «combinado en»); export rows. Jobs, quotes and
--    invoices keep pointing to the record they were created with (nothing is re-linked).
--  * Pipeline board (row 07): Kanban read over the existing lead sources (manual opportunities and
--    ContrataCR requests) per configured stage; moving a card goes through the EXISTING stage writers
--    (pro_lead_center_mutate / pro_request_pipeline_mutate: their receipts, CAS and history). Stage
--    configuration (add/rename/reorder/hide with reassignment) already exists in request-pipeline.
--    New: won/lost outcome with reason and note per lead (CAS, receipts, immutable history).
--  * Conversion by channel / campaign (row 08): funnel per channel or campaign for a Costa Rica period
--    (received, reached meeting, reached estimate, won, lost, converted to a job) and monthly trend.
--  * Role gate: /api/pro/client-contacts writes are sales.write (customers).
-- Patterns: RLS on, service_role only, security invoker, CAS 40001, idempotent actionId receipts,
-- immutable history. Nothing is sent; no third party is called.
begin;
create table if not exists public.pro_contact_tags(
 owner_id uuid not null references public.profiles(id) on delete cascade,client_id text not null,
 tag text not null check(length(btrim(tag)) between 1 and 40 and tag=btrim(tag) and tag!~'[[:cntrl:];,]'),
 tag_key text generated always as (lower(tag)) stored,created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,client_id,tag_key),foreign key(owner_id,client_id) references public.pro_clients(user_id,id) on delete cascade);
create index if not exists pro_contact_tags_key on public.pro_contact_tags(owner_id,tag_key);
create table if not exists public.pro_contact_actions(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,input jsonb not null,result jsonb not null,
 at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id));
create table if not exists public.pro_contact_history(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,client_id text not null,
 action text not null check(action in('import','tags','merge_keep','merge_archive')),before_value jsonb,after_value jsonb not null,
 at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id,client_id));
create table if not exists public.pro_contact_merges(
 owner_id uuid not null references public.profiles(id) on delete cascade,merged_id text not null,kept_id text not null,action_id uuid not null,
 merged_name text not null,at timestamptz not null default clock_timestamp(),primary key(owner_id,merged_id),check(merged_id<>kept_id));
create table if not exists public.pro_contact_imports(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 file_name text not null check(length(file_name) between 1 and 160),format text not null check(format in('csv','vcard')),
 total integer not null check(total between 1 and 500),created integer not null check(created>=0),skipped integer not null check(skipped>=0),
 created_ids text[] not null,at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id));

-- Lead outcome (won / lost with a reason). One current row per lead (CAS); history immutable.
create table if not exists public.pro_lead_outcomes(
 owner_id uuid not null references public.profiles(id) on delete cascade,kind text not null check(kind in('manual','request')),lead_id uuid not null,
 outcome text check(outcome in('won','lost')),reason text,note text not null default '' check(length(note)<=300),
 revision integer not null check(revision>0),updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,kind,lead_id),
 check(outcome is null and reason is null or outcome='won' and reason in('price','quality','referral','speed','relationship','other') or outcome='lost' and reason in('price','timing','competitor','no_response','scope','other')));
create table if not exists public.pro_lead_outcome_history(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,kind text not null,lead_id uuid not null,
 before_value jsonb,after_value jsonb not null,actor_name text not null default '',at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id));
create table if not exists public.pro_lead_outcome_actions(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,input jsonb not null,result jsonb not null,
 at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id));

create or replace function public.pro_round10_immutable() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Immutable record' using errcode='55000';end $$;
do $$declare t text;begin
 foreach t in array array['pro_contact_actions','pro_contact_history','pro_contact_merges','pro_contact_imports','pro_lead_outcome_history','pro_lead_outcome_actions'] loop
  execute format('drop trigger if exists %I on public.%I',t||'_immutable',t);
  execute format('create trigger %I before update or delete on public.%I for each row when (pg_trigger_depth()=0) execute function public.pro_round10_immutable()',t||'_immutable',t);
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);
 end loop;
 foreach t in array array['pro_contact_tags','pro_lead_outcomes'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

create or replace function public.pro_contact_owner(p_owner uuid) returns void language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin if p_owner is null or not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then raise exception 'Forbidden' using errcode='42501';end if;end $$;
create or replace function public.pro_contact_email_key(p text) returns text language sql immutable security invoker set search_path=public,pg_temp as $$
 select nullif(lower(btrim(coalesce(p,''))),'') $$;
create or replace function public.pro_contact_phone_key(p text) returns text language sql immutable security invoker set search_path=public,pg_temp as $$
 select nullif(public.pro_lead_import_phone_key(p),'') $$;
-- Fix 13 (performance): the import preview looks up existing customers by e-mail/phone key per row.
create index if not exists pro_clients_contact_email_key on public.pro_clients(user_id,public.pro_contact_email_key(email));
create index if not exists pro_clients_contact_phone_key on public.pro_clients(user_id,public.pro_contact_phone_key(phone));
create or replace function public.pro_contact_tags_of(p_owner uuid,p_client text) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(tag order by tag_key),'[]'::jsonb) from public.pro_contact_tags where owner_id=p_owner and client_id=p_client $$;
-- Normalized tag list (≤ 10, 1–40 characters, no control/«;»/«,», case-insensitive unique) or null when invalid.
create or replace function public.pro_contact_tag_list(p jsonb) returns text[] language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare v text;out text[]:='{}';keys text[]:='{}';
begin
 if p is null or p='null'::jsonb then return out;end if;
 if jsonb_typeof(p)<>'array' or jsonb_array_length(p)>10 then return null;end if;
 for v in select btrim(x) from jsonb_array_elements_text(p) x loop
  if length(v) not between 1 and 40 or v~'[[:cntrl:];,]' then return null;end if;
  if not lower(v)=any(keys) then out:=out||v;keys:=keys||lower(v);end if;
 end loop;return out;
exception when others then return null;end $$;

-- Preview of a mapped import (rows already mapped to ContrataCR fields by the screen).
create or replace function public.pro_contacts_preview(p_owner uuid,p_rows jsonb) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r jsonb;i integer:=-1;answer jsonb:='[]';seen_e text[]:='{}';seen_p text[]:='{}';issues text[];v_name text;v_email text;v_phone text;v_ident text;ek text;pk text;tags text[];
 m_id text;m_name text;m_by text;status text;n_new integer:=0;n_dup integer:=0;n_file integer:=0;n_bad integer:=0;f text;
begin
 perform public.pro_contact_owner(p_owner);
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 500 then raise exception 'Invalid contact rows' using errcode='22023';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  i:=i+1;issues:='{}';
  if jsonb_typeof(r) is distinct from 'object' or (r-array['name','email','phone','identification','tradeName','group','address','notes','tags'])<>'{}'::jsonb then raise exception 'Invalid contact row' using errcode='22023';end if;
  foreach f in array array['name','email','phone','identification','tradeName','group','address','notes'] loop
   if r ? f and jsonb_typeof(r->f) is distinct from 'string' then raise exception 'Invalid contact field' using errcode='22023';end if;end loop;
  v_name:=btrim(coalesce(r->>'name',''));v_email:=btrim(coalesce(r->>'email',''));v_phone:=btrim(coalesce(r->>'phone',''));v_ident:=regexp_replace(coalesce(r->>'identification',''),'[^0-9]','','g');
  if v_name='' then issues:=issues||'name_required'::text;elsif length(v_name)>160 or v_name~'[[:cntrl:]]' then issues:=issues||'name_invalid'::text;end if;
  if v_email<>'' and(length(v_email)>254 or v_email!~'^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then issues:=issues||'email_invalid'::text;end if;
  if length(v_phone)>30 then issues:=issues||'phone_invalid'::text;end if;
  if length(v_ident)>12 then issues:=issues||'identification_invalid'::text;end if;
  if length(btrim(coalesce(r->>'tradeName','')))>160 or length(btrim(coalesce(r->>'group','')))>80 or length(btrim(coalesce(r->>'address','')))>500 or length(btrim(coalesce(r->>'notes','')))>2000 then issues:=issues||'too_long'::text;end if;
  tags:=public.pro_contact_tag_list(r->'tags');if tags is null then issues:=issues||'tags_invalid'::text;tags:='{}';end if;
  ek:=public.pro_contact_email_key(v_email);pk:=public.pro_contact_phone_key(v_phone);m_id:=null;m_name:=null;m_by:=null;
  if cardinality(issues)>0 then status:='invalid';n_bad:=n_bad+1;
  else
   select c.id,c.name,case when ek is not null and public.pro_contact_email_key(c.email)=ek then 'email' else 'phone' end into m_id,m_name,m_by from public.pro_clients c
    where c.user_id=p_owner and(ek is not null and public.pro_contact_email_key(c.email)=ek or pk is not null and public.pro_contact_phone_key(c.phone)=pk) order by c.archived,c.position limit 1;
   if m_id is not null then status:='duplicate';n_dup:=n_dup+1;
   elsif ek=any(seen_e) or pk=any(seen_p) then status:='duplicate_in_file';n_file:=n_file+1;
   else status:='new';n_new:=n_new+1;if ek is not null then seen_e:=seen_e||ek;end if;if pk is not null then seen_p:=seen_p||pk;end if;end if;
  end if;
  answer:=answer||jsonb_build_array(jsonb_build_object('index',i,'status',status,'issues',to_jsonb(issues),
   'row',jsonb_build_object('name',v_name,'email',v_email,'phone',v_phone,'identification',v_ident,'tradeName',btrim(coalesce(r->>'tradeName','')),'group',btrim(coalesce(r->>'group','')),'address',btrim(coalesce(r->>'address','')),'notes',btrim(coalesce(r->>'notes','')),'tags',to_jsonb(tags)),
   'match',case when m_id is null then null else jsonb_build_object('id',m_id,'name',m_name,'by',m_by) end));
 end loop;
 return jsonb_build_object('rows',answer,'counts',jsonb_build_object('total',i+1,'new',n_new,'duplicate',n_dup,'duplicateInFile',n_file,'invalid',n_bad));
end $$;

create or replace function public.pro_contacts_read(p_owner uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 perform public.pro_contact_owner(p_owner);
 return jsonb_build_object(
  'revision',coalesce((select revision from public.pro_workspace_core where user_id=p_owner),0),
  'tags',coalesce((select jsonb_object_agg(client_id,tags) from(select client_id,jsonb_agg(tag order by tag_key) tags from public.pro_contact_tags where owner_id=p_owner group by client_id)x),'{}'::jsonb),
  'tagCounts',coalesce((select jsonb_agg(jsonb_build_object('tag',tag,'count',n) order by lower(tag)) from(select min(tag) tag,count(*) n from public.pro_contact_tags t join public.pro_clients c on c.user_id=t.owner_id and c.id=t.client_id and not c.archived where t.owner_id=p_owner group by t.tag_key)x),'[]'::jsonb),
  'merges',coalesce((select jsonb_agg(jsonb_build_object('mergedId',merged_id,'keptId',kept_id,'mergedName',merged_name,'at',at) order by at desc) from(select * from public.pro_contact_merges where owner_id=p_owner order by at desc limit 100)x),'[]'::jsonb),
  'imports',coalesce((select jsonb_agg(jsonb_build_object('id',action_id,'fileName',file_name,'format',format,'total',total,'created',created,'skipped',skipped,'at',at) order by at desc) from(select * from public.pro_contact_imports where owner_id=p_owner order by at desc limit 10)x),'[]'::jsonb),
  'duplicates',public.pro_contacts_duplicates(p_owner));
end $$;

-- Rows that point to a customer (every foreign key to pro_clients except tags, plus jobs). A customer
-- with records is never archived by a merge: it must be the one that is kept.
create or replace function public.pro_contact_references(p_owner uuid,p_client text) returns integer language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare f record;n integer:=0;hit boolean;
begin
 select count(*) into n from public.pro_work where user_id=p_owner and "clientId"=p_client;
 for f in select c.conrelid::regclass rel,(select attname from pg_attribute where attrelid=c.conrelid and attnum=c.conkey[1]) owner_col,(select attname from pg_attribute where attrelid=c.conrelid and attnum=c.conkey[2]) client_col
  from pg_constraint c where c.contype='f' and c.confrelid='public.pro_clients'::regclass and c.conrelid<>'public.pro_contact_tags'::regclass and cardinality(c.conkey)=2 loop
  execute format('select exists(select 1 from %s where %I=$1 and %I=$2)',f.rel,f.owner_col,f.client_col) into hit using p_owner,p_client;
  if hit then n:=n+1;end if;
 end loop;
 return n;
end $$;

-- Groups of active customers sharing a normalized e-mail or phone (≤ 50 groups).
create or replace function public.pro_contacts_duplicates(p_owner uuid) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 with keyed as(select id,name,email,phone,position,public.pro_contact_email_key(email) ek,public.pro_contact_phone_key(phone) pk from public.pro_clients where user_id=p_owner and not archived),
 groups as(select 'email' by,ek k from keyed where ek is not null group by ek having count(*)>1 union all select 'phone',pk from keyed where pk is not null group by pk having count(*)>1)
 select coalesce(jsonb_agg(jsonb_build_object('by',g.by,'key',g.k,'clients',(select jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'email',x.email,'phone',x.phone,'records',public.pro_contact_references(p_owner,x.id)) order by x.position) from keyed x where case g.by when 'email' then x.ek=g.k else x.pk=g.k end)) order by g.by,g.k),'[]'::jsonb)
 from(select * from groups order by by,k limit 50) g $$;

create or replace function public.pro_contacts_export(p_owner uuid,p_tag text default null,p_group text default null,p_archived boolean default false) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 perform public.pro_contact_owner(p_owner);
 if length(coalesce(p_tag,''))>40 or length(coalesce(p_group,''))>80 then raise exception 'Invalid export filter' using errcode='22023';end if;
 -- Fix 13: bounded export (first 5000 customers in list order).
 return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'email',c.email,'phone',c.phone,'identification',coalesce(c.identification,''),'tradeName',coalesce(c."tradeName",''),'group',coalesce(c."group",''),'address',coalesce(c.address,''),'notes',c.notes,'archived',c.archived,'tags',public.pro_contact_tags_of(p_owner,c.id),
   'mergedInto',(select m.kept_id from public.pro_contact_merges m where m.owner_id=p_owner and m.merged_id=c.id)) order by c.position)
  from (select x.* from public.pro_clients x where x.user_id=p_owner and(p_archived or not x.archived)
   and(nullif(btrim(coalesce(p_tag,'')),'') is null or exists(select 1 from public.pro_contact_tags t where t.owner_id=p_owner and t.client_id=x.id and t.tag_key=lower(btrim(p_tag))))
   and(nullif(btrim(coalesce(p_group,'')),'') is null or lower(btrim(coalesce(x."group",'')))=lower(btrim(p_group))) order by x.position limit 5000) c),'[]'::jsonb);
end $$;

create or replace function public.pro_contacts_mutate(p_owner uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;aid uuid;keys text[];receipt public.pro_contact_actions;answer jsonb;preview jsonb;r jsonb;rows_json jsonb:='[]';ids text[]:='{}';cid text;v integer;tags text[];t text;
 keep public.pro_clients;dup public.pro_clients;kept jsonb;merged jsonb;before_tags jsonb;
begin
 perform public.pro_contact_owner(p_owner);
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' or jsonb_typeof(p_input->'actionId') is distinct from 'string' then raise exception 'Invalid contact action' using errcode='22023';end if;
 act:=p_input->>'action';select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if keys is distinct from (case act when 'import' then array['action','actionId','fileName','format','revision','rows'] when 'tags' then array['action','actionId','clientId','tags'] when 'merge' then array['action','actionId','keepId','mergeId','revision'] end) then raise exception 'Unexpected contact fields' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid action id' using errcode='22023';end;
 if act in('import','merge') and(jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce(p_input->>'revision'~'^[0-9]{1,10}$',false) or(p_input->>'revision')::numeric>2147483646) then raise exception 'Invalid revision' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-contacts:'||p_owner::text,0));
 select * into receipt from public.pro_contact_actions where owner_id=p_owner and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result||jsonb_build_object('replayed',true);end if;
 if act='import' then
  if jsonb_typeof(p_input->'fileName') is distinct from 'string' or length(btrim(p_input->>'fileName')) not between 1 and 160 or p_input->>'format' not in('csv','vcard') then raise exception 'Invalid import file' using errcode='22023';end if;
  preview:=public.pro_contacts_preview(p_owner,p_input->'rows');
  for r in select value from jsonb_array_elements(preview->'rows') loop
   if r->>'status'='new' then
    cid:=public.pro_lead_import_uuid('pro-contacts:'||aid::text||':'||(r->>'index'))::text;ids:=ids||cid;
    rows_json:=rows_json||jsonb_build_array(jsonb_build_object('id',cid,'name',r->'row'->>'name','email',r->'row'->>'email','phone',r->'row'->>'phone','notes',r->'row'->>'notes','archived',false,
     'identification',nullif(r->'row'->>'identification',''),'tradeName',nullif(r->'row'->>'tradeName',''),'group',nullif(r->'row'->>'group',''),'address',nullif(r->'row'->>'address','')));
   end if;
  end loop;
  if cardinality(ids)>0 then v:=public.pro_mutate_catalog(p_owner,'clients',rows_json,(p_input->>'revision')::integer,'[]'::jsonb,true);
  else v:=coalesce((select revision from public.pro_workspace_core where user_id=p_owner),0);if v<>(p_input->>'revision')::integer then raise exception 'Customers changed' using errcode='40001';end if;end if;
  for r in select value from jsonb_array_elements(preview->'rows') where value->>'status'='new' loop
   cid:=public.pro_lead_import_uuid('pro-contacts:'||aid::text||':'||(r->>'index'))::text;
   insert into public.pro_contact_tags(owner_id,client_id,tag) select p_owner,cid,x from jsonb_array_elements_text(r->'row'->'tags') x on conflict do nothing;
   insert into public.pro_contact_history(owner_id,action_id,client_id,action,before_value,after_value) values(p_owner,aid,cid,'import',null,r->'row');
  end loop;
  insert into public.pro_contact_imports(owner_id,action_id,file_name,format,total,created,skipped,created_ids) values(p_owner,aid,btrim(p_input->>'fileName'),p_input->>'format',(preview->'counts'->>'total')::integer,cardinality(ids),(preview->'counts'->>'total')::integer-cardinality(ids),ids);
  answer:=jsonb_build_object('action','import','revision',v,'created',cardinality(ids),'createdIds',to_jsonb(ids),'counts',preview->'counts');
 elsif act='tags' then
  if jsonb_typeof(p_input->'clientId') is distinct from 'string' or not exists(select 1 from public.pro_clients where user_id=p_owner and id=p_input->>'clientId') then raise exception 'Customer unavailable' using errcode='P0002';end if;
  tags:=public.pro_contact_tag_list(p_input->'tags');if tags is null then raise exception 'Invalid tags' using errcode='22023';end if;
  cid:=p_input->>'clientId';before_tags:=public.pro_contact_tags_of(p_owner,cid);
  delete from public.pro_contact_tags where owner_id=p_owner and client_id=cid;
  foreach t in array tags loop insert into public.pro_contact_tags(owner_id,client_id,tag) values(p_owner,cid,t);end loop;
  insert into public.pro_contact_history(owner_id,action_id,client_id,action,before_value,after_value) values(p_owner,aid,cid,'tags',before_tags,public.pro_contact_tags_of(p_owner,cid));
  answer:=jsonb_build_object('action','tags','clientId',cid,'tags',public.pro_contact_tags_of(p_owner,cid));
 else
  if jsonb_typeof(p_input->'keepId') is distinct from 'string' or jsonb_typeof(p_input->'mergeId') is distinct from 'string' or p_input->>'keepId'=p_input->>'mergeId' then raise exception 'Choose two customers' using errcode='22023';end if;
  select * into keep from public.pro_clients where user_id=p_owner and id=p_input->>'keepId';select * into dup from public.pro_clients where user_id=p_owner and id=p_input->>'mergeId';
  if keep.id is null or dup.id is null then raise exception 'Customer unavailable' using errcode='P0002';end if;
  if keep.archived or dup.archived or exists(select 1 from public.pro_contact_merges where owner_id=p_owner and merged_id in(keep.id,dup.id)) then raise exception 'Customers changed' using errcode='40001';end if;
  -- Jobs, quotes, invoices, leads… keep their customer: a record with any of them is never archived.
  if public.pro_contact_references(p_owner,dup.id)>0 then raise exception 'Customer to archive has records' using errcode='22023',hint='pro_contact_merge_records';end if;
  kept:=to_jsonb(keep)-'position'-'user_id';merged:=to_jsonb(dup)-'position'-'user_id';
  kept:=kept||jsonb_build_object(
   'email',case when btrim(keep.email)='' then dup.email else keep.email end,'phone',case when btrim(keep.phone)='' then dup.phone else keep.phone end,
   'identification',coalesce(nullif(keep.identification,''),nullif(dup.identification,'')),'tradeName',coalesce(nullif(keep."tradeName",''),nullif(dup."tradeName",'')),
   'group',coalesce(nullif(keep."group",''),nullif(dup."group",'')),'address',coalesce(nullif(keep.address,''),nullif(dup.address,'')),
   'notes',left(case when btrim(dup.notes)='' or position(btrim(dup.notes) in keep.notes)>0 then keep.notes when btrim(keep.notes)='' then dup.notes else keep.notes||E'\n'||dup.notes end,2000));
  v:=public.pro_mutate_catalog(p_owner,'clients',jsonb_build_array(kept,merged||jsonb_build_object('archived',true)),(p_input->>'revision')::integer,'[]'::jsonb,false);
  before_tags:=public.pro_contact_tags_of(p_owner,keep.id);
  insert into public.pro_contact_tags(owner_id,client_id,tag) select p_owner,keep.id,tag from public.pro_contact_tags where owner_id=p_owner and client_id=dup.id
   and(select count(*) from public.pro_contact_tags where owner_id=p_owner and client_id=keep.id)<10 on conflict do nothing;
  insert into public.pro_contact_merges(owner_id,merged_id,kept_id,action_id,merged_name) values(p_owner,dup.id,keep.id,aid,dup.name);
  insert into public.pro_contact_history(owner_id,action_id,client_id,action,before_value,after_value) values
   (p_owner,aid,keep.id,'merge_keep',to_jsonb(keep)-'position'||jsonb_build_object('tags',before_tags),kept||jsonb_build_object('tags',public.pro_contact_tags_of(p_owner,keep.id),'mergedFrom',dup.id)),
   (p_owner,aid,dup.id,'merge_archive',to_jsonb(dup)-'position',merged||jsonb_build_object('archived',true,'mergedInto',keep.id));
  answer:=jsonb_build_object('action','merge','revision',v,'keepId',keep.id,'mergeId',dup.id);
 end if;
 insert into public.pro_contact_actions(owner_id,action_id,input,result) values(p_owner,aid,p_input,answer);
 return answer;
end $$;

-- ===== Pipeline board and outcomes =====
create or replace function public.pro_lead_outcome_json(p_owner uuid,p_kind text,p_id uuid) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('outcome',o.outcome,'reason',o.reason,'note',coalesce(o.note,''),'revision',coalesce(o.revision,0),'updatedAt',o.updated_at)
 from(select 1) one left join public.pro_lead_outcomes o on o.owner_id=p_owner and o.kind=p_kind and o.lead_id=p_id $$;

create or replace function public.pro_lead_board_read(p_owner uuid,p_query text default '',p_channel text default null,p_hide_lost boolean default false) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare catalog jsonb;answer jsonb;
begin
 perform public.pro_lead_origin_owner(p_owner);catalog:=public.pro_lead_origin_stage_catalog(p_owner);
 if p_query is null or length(p_query)>100 or length(coalesce(p_channel,''))>40 then raise exception 'Invalid board query' using errcode='22023';end if;
 with src as materialized(select s.* from public.pro_lead_inbox_sources(p_owner,p_query) s where not s.archived and not s.snoozed and(p_channel is null or p_channel='unspecified' and s.channel_id is null or s.channel_id=p_channel)),
 cards as materialized(select s.kind,s.id,s.created_at,s.effective_stage,s.channel_id,s.created_day,o.outcome,o.reason,
   case when s.kind='manual' then l.title else q.service end title,case when s.kind='manual' then c.name else q.client_name end client_name,
   case when s.kind='manual' then l.revision else coalesce(ps.revision,0) end revision,case when s.kind='manual' then l.stage_mode else coalesce(ps.mode,'automatic') end stage_mode,
   case when s.kind='manual' then l.currency end currency,case when s.kind='manual' then l.revenue_cents end revenue_cents,coalesce(o.revision,0) outcome_revision,
   row_number() over(partition by s.effective_stage order by s.created_at desc,s.kind,s.id desc) rn
  from src s left join public.pro_lead_center_records l on s.kind='manual' and l.owner_id=p_owner and l.kind='manual' and l.id=s.id left join public.pro_clients c on c.user_id=p_owner and c.id=l.client_id
   left join public.pro_appointment_requests q on s.kind='request' and q.owner_id=p_owner and q.id=s.id left join public.pro_request_pipeline_states ps on s.kind='request' and ps.owner_id=p_owner and ps.request_id=s.id
   left join public.pro_lead_outcomes o on o.owner_id=p_owner and o.kind=s.kind and o.lead_id=s.id
  where not(p_hide_lost and coalesce(o.outcome,'')='lost'))
 select jsonb_build_object('catalog',catalog,'columns',coalesce(jsonb_agg(jsonb_build_object('stageId',st->>'id','count',(select count(*) from cards x where x.effective_stage=st->>'id'),
   'items',coalesce((select jsonb_agg(jsonb_build_object('kind',x.kind,'id',x.id,'title',coalesce(x.title,''),'clientName',coalesce(x.client_name,''),'createdDay',x.created_day,'channelId',x.channel_id,'revision',x.revision,'stageMode',x.stage_mode,
     'currency',x.currency,'revenueCents',x.revenue_cents,'outcome',x.outcome,'reason',x.reason,'outcomeRevision',x.outcome_revision) order by x.rn) from cards x where x.effective_stage=st->>'id' and x.rn<=50),'[]'::jsonb)) order by(st->>'position')::integer),'[]'::jsonb),
   'lost',(select count(*) from cards where outcome='lost'))
 into answer from jsonb_array_elements(catalog->'stages') st where not coalesce((st->>'hidden')::boolean,false);
 return answer;
end $$;

-- Move a card: delegates to the existing stage writer of its source (same receipts, CAS and history).
-- Fix 13: p_member = the company member acting in the owner's company (history names that person).
drop function if exists public.pro_lead_board_mutate(uuid,jsonb);
create or replace function public.pro_lead_board_mutate(p_owner uuid,p_input jsonb,p_member uuid default null) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;keys text[];aid uuid;k text;lid uuid;receipt public.pro_lead_outcome_actions;cur public.pro_lead_outcomes;before_json jsonb;answer jsonb;v_outcome text;v_reason text;v_note text;inner_result jsonb;
begin
 perform public.pro_lead_origin_owner(p_owner);
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid board action' using errcode='22023';end if;
 act:=p_input->>'action';select array_agg(x order by x) into keys from jsonb_object_keys(p_input) x;
 if keys is distinct from (case act when 'move' then array['action','actionId','catalogRevision','id','kind','revision','stageId'] when 'outcome' then array['action','actionId','id','kind','note','outcome','reason','revision'] end)
  or p_input->>'kind' not in('manual','request') or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce(p_input->>'revision'~'^[0-9]{1,10}$',false) or(p_input->>'revision')::numeric>2147483646 then raise exception 'Unexpected board fields' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;lid:=(p_input->>'id')::uuid;exception when others then raise exception 'Invalid identity' using errcode='22023';end;
 k:=p_input->>'kind';
 if k='manual' and not exists(select 1 from public.pro_lead_center_records where owner_id=p_owner and kind='manual' and id=lid) or k='request' and not exists(select 1 from public.pro_appointment_requests where owner_id=p_owner and id=lid) then raise exception 'Lead unavailable' using errcode='P0002';end if;
 if act='move' then
  if jsonb_typeof(p_input->'stageId') is distinct from 'string' then raise exception 'Invalid stage' using errcode='22023';end if;
  if k='manual' then inner_result:=public.pro_lead_center_mutate(p_owner,jsonb_build_object('action','set_stage','actionId',aid,'kind','manual','id',lid,'revision',(p_input->>'revision')::integer,'catalogRevision',p_input->'catalogRevision','stageId',p_input->>'stageId'));
  else inner_result:=public.pro_request_pipeline_mutate(p_owner,jsonb_build_object('action','set_stage','actionId',aid,'catalogRevision',p_input->'catalogRevision','requestId',lid,'revision',(p_input->>'revision')::integer,'stageId',p_input->>'stageId'));end if;
  return jsonb_build_object('action','move','kind',k,'id',lid,'stageId',p_input->>'stageId','revision',case when k='manual' then(inner_result->'item'->'manual'->>'revision')::integer else(inner_result->'state'->>'revision')::integer end);
 end if;
 if jsonb_typeof(p_input->'outcome') not in('string','null') or jsonb_typeof(p_input->'reason') not in('string','null') or jsonb_typeof(p_input->'note') is distinct from 'string' or length(p_input->>'note')>300 then raise exception 'Invalid outcome' using errcode='22023';end if;
 v_outcome:=p_input->>'outcome';v_reason:=p_input->>'reason';v_note:=btrim(p_input->>'note');
 if v_outcome is null and(v_reason is not null or v_note<>'') or v_outcome='won' and v_reason not in('price','quality','referral','speed','relationship','other') or v_outcome='lost' and v_reason not in('price','timing','competitor','no_response','scope','other') or v_outcome not in('won','lost') then raise exception 'Invalid outcome reason' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-lead-outcome:'||p_owner::text||':'||aid::text,0));
 select * into receipt from public.pro_lead_outcome_actions where owner_id=p_owner and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result||jsonb_build_object('replayed',true);end if;
 -- Fix 13: serialize per lead BEFORE reading the revision, so two first writes (revision 0) give one 409.
 perform pg_advisory_xact_lock(hashtextextended('pro-lead-outcome-target:'||p_owner::text||':'||k||':'||lid::text,0));
 select * into cur from public.pro_lead_outcomes where owner_id=p_owner and kind=k and lead_id=lid for update;
 if coalesce(cur.revision,0)<>(p_input->>'revision')::integer then raise exception 'Outcome changed' using errcode='40001';end if;
 before_json:=public.pro_lead_outcome_json(p_owner,k,lid);
 insert into public.pro_lead_outcomes(owner_id,kind,lead_id,outcome,reason,note,revision) values(p_owner,k,lid,v_outcome,v_reason,v_note,1)
  on conflict(owner_id,kind,lead_id) do update set outcome=excluded.outcome,reason=excluded.reason,note=excluded.note,revision=public.pro_lead_outcomes.revision+1,updated_at=clock_timestamp();
 answer:=jsonb_build_object('action','outcome','kind',k,'id',lid,'value',public.pro_lead_outcome_json(p_owner,k,lid));
 insert into public.pro_lead_outcome_history(owner_id,action_id,kind,lead_id,before_value,after_value,actor_name) values(p_owner,aid,k,lid,before_json,answer->'value',left(coalesce(public.pro_team_name(case when p_member is not null and public.pro_role_of(p_member,p_owner) is not null then p_member else p_owner end),''),160));
 insert into public.pro_lead_outcome_actions(owner_id,action_id,input,result) values(p_owner,aid,p_input,answer);
 return answer;
end $$;

-- ===== Conversion by channel / campaign for a Costa Rica period =====
create or replace function public.pro_lead_conversion_report(p_owner uuid,p_from date,p_to date,p_group text default 'channel') returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare catalog jsonb;meeting_pos integer;estimate_pos integer;answer jsonb;
begin
 perform public.pro_lead_origin_owner(p_owner);
 if p_from is null or p_to is null or p_from>p_to or p_to-p_from>3660 or p_from<date'1900-01-01' or p_to>date'2100-12-31' or p_group not in('channel','campaign') then raise exception 'Invalid conversion report' using errcode='22023';end if;
 catalog:=public.pro_lead_origin_stage_catalog(p_owner);
 select(s->>'position')::integer into meeting_pos from jsonb_array_elements(catalog->'stages') s where s->>'id'='meeting_scheduled';
 select(s->>'position')::integer into estimate_pos from jsonb_array_elements(catalog->'stages') s where s->>'id'='estimate_sent';
 with base as materialized(
  select b.kind,b.id,b.created_day,b.channel_id,b.archived,(select(s->>'position')::integer from jsonb_array_elements(catalog->'stages') s where s->>'id'=b.effective_stage) pos,b.effective_stage,
   case when b.kind='manual' then exists(select 1 from public.pro_manual_lead_works m join public.pro_work w on w.user_id=m.owner_id and w.id=m.work_id_text and w."clientId"=m.source_client_id and w."bookingClientId" is null where m.owner_id=p_owner and m.lead_kind='manual' and m.lead_id=b.id)
    else exists(select 1 from public.pro_appointment_requests q join public.pro_work w on w.user_id=p_owner and w.id=q.work_id where q.owner_id=p_owner and q.id=b.id and not w.cancelled) end converted,
   o.outcome,a.campaign_id
  from public.pro_lead_inbox_sources(p_owner,'') b left join public.pro_lead_outcomes o on o.owner_id=p_owner and o.kind=b.kind and o.lead_id=b.id
   left join public.pro_lead_attributions a on b.kind='manual' and a.owner_id=p_owner and a.lead_id=b.id
  where b.created_day between p_from and p_to),
 keyed as(select x.*,case when p_group='channel' then coalesce(x.channel_id,'unspecified') else coalesce(x.campaign_id::text,'none') end gkey from base x),
 grouped as(select gkey,count(*) received,count(*) filter(where pos>=meeting_pos or converted) meeting,count(*) filter(where pos>=estimate_pos or converted) estimate,
   count(*) filter(where effective_stage='won' or outcome='won' or converted) won,count(*) filter(where outcome='lost') lost,count(*) filter(where converted) converted from keyed group by gkey),
 months as(select to_char(date_trunc('month',created_day),'YYYY-MM') mon,count(*) received,count(*) filter(where converted) converted from base group by 1)
 select jsonb_build_object('from',to_char(p_from,'YYYY-MM-DD'),'to',to_char(p_to,'YYYY-MM-DD'),'group',p_group,
  'rows',coalesce((select jsonb_agg(jsonb_build_object('key',g.gkey,
    'name',case when p_group='channel' then(select c.name from public.pro_lead_origin_catalog(p_owner) c where c.id=g.gkey) else(select ac.name from public.pro_ad_campaigns ac where ac.owner_id=p_owner and ac.id::text=g.gkey) end,
    'campaignChannel',case when p_group='campaign' then(select ac.channel from public.pro_ad_campaigns ac where ac.owner_id=p_owner and ac.id::text=g.gkey) end,
    'received',g.received,'meeting',g.meeting,'estimate',g.estimate,'won',g.won,'lost',g.lost,'converted',g.converted,
    'conversionRate',case when g.received=0 then null else round(g.converted*100.0/g.received,1) end) order by g.received desc,g.gkey) from grouped g),'[]'::jsonb),
  'totals',(select jsonb_build_object('received',count(*),'meeting',count(*) filter(where pos>=meeting_pos or converted),'estimate',count(*) filter(where pos>=estimate_pos or converted),'won',count(*) filter(where effective_stage='won' or outcome='won' or converted),'lost',count(*) filter(where outcome='lost'),'converted',count(*) filter(where converted)) from base),
  'months',coalesce((select jsonb_agg(jsonb_build_object('month',mon,'received',received,'converted',converted) order by mon) from months),'[]'::jsonb))
 into answer;
 return answer;
end $$;

-- ===== Role gate: same module table as notification-branding-capabilities-local.sql + client-contacts =====
create or replace function public.pro_role_route_capability(p_method text,p_path text) returns text
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare seg text:=split_part(regexp_replace(coalesce(p_path,''),'^/api/pro/?',''),'/',1);
begin
 if upper(coalesce(p_method,'')) in('GET','HEAD','OPTIONS') then return 'read';end if;
 -- Round 8: one's own overview arrangement is a personal preference, not a change to company data.
 if seg='overview-layout' then return 'read';end if;
 -- Round 9: the notification center (marking read, own preferences and reminder schedule) is personal.
 if seg='notifications' then return 'read';end if;
 -- Round 9: company branding of printed documents is a company setting (Administrator only).
 if seg='document-branding' then return 'settings.write';end if;
 -- Round 10: customer import, tags and merges are customer records (same capability as quotes/contracts).
 if seg='client-contacts' then return 'sales.write';end if;
 if seg in('team','team-roles','subcontractors') then return 'team.manage';end if;
 if seg ~ '^(integrations|connectors|oauth|site|site-public|marketing|marketing-confirm|ads-tracking|social|social-content|promotions|invoice-document-settings|invoice-issuer|accounting|accounting-export|einvoice|einvoice-file)$' then return 'settings.write';end if;
 if seg ~ '^(invoice-|payment-|pay$|client-operations|client-balance|client-statement|client-finances|credits-retainers|work-billing|work-budget|work-costs|expenses|expense-receipts|purchase-order|online-payments)' then return 'finance.write';end if;
 if seg ~ '^(lead-|request-pipeline|request-followups|manual-lead-)' then return 'lead.write';end if;
 if seg ~ '^(private-estimate|quote|quotes|contract|esign|appointment-|reservations|bids|bid-portal-links|work-changes|selections|allowances|project-quote-context|visit-preparation|work-client-invitations|client-dashboard|client-pending|client-fiscal|request-quotes|direct-project|workspace|projects|work-header|identity-lookup)' then return 'sales.write';end if;
 if seg ~ '^(catalog|company-|service-packages|discount-presets|task-templates|schedule-templates|ai|ai-meetings)' then return 'company.write';end if;
 return 'work.write';
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in(
  'pro_round10_immutable','pro_contact_owner','pro_contact_email_key','pro_contact_phone_key','pro_contact_tags_of','pro_contact_tag_list','pro_contacts_preview','pro_contacts_read','pro_contacts_duplicates','pro_contact_references','pro_contacts_export','pro_contacts_mutate',
  'pro_lead_outcome_json','pro_lead_board_read','pro_lead_board_mutate','pro_lead_conversion_report','pro_role_route_capability') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
commit;
notify pgrst,'reload schema';
