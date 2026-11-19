-- LOCAL PRO ONLY. Ronda F2-B (2026-11-19), Houzz Pro parity row 05 (contact import and organization).
--  * Company custom fields for customers (pro_clients): text, number, date or select (1-20 options),
--    ordered, archived/restored (never deleted; archived fields keep their values), at most 30 active.
--    One revision for the whole definition set (CAS 40001), idempotent actionId receipts, immutable history.
--  * Values per customer, validated by kind (number canonical with '.', ISO date 1900-2100, select must be
--    one of the options), plus ADDITIONAL phones and e-mails with a short label. The primary phone/e-mail stay
--    in pro_clients and keep being owned by the existing catalogue writer (pro_mutate_catalog): nothing of the
--    existing customer record, its APIs or its data changes. One revision per customer (CAS 40001).
--  * Import: a wrapper of the existing import (pro_contacts_mutate 'import', same workspace revision CAS and
--    deterministic customer ids) that writes the mapped custom fields and additional phones/e-mails of the
--    created customers in the SAME transaction; its preview also treats a row whose e-mail/phone equals an
--    additional channel of an existing customer as "already exists".
-- Patterns: RLS on, service_role only, security invoker, CAS 40001, receipts, immutable history whose trigger
-- only fires at depth 0 (account deletion cascades still work). Nothing is sent; no third party is called.
begin;
create table if not exists public.pro_contact_field_heads(
 owner_id uuid primary key references public.profiles(id) on delete cascade,revision integer not null check(revision>=0));
create table if not exists public.pro_contact_field_defs(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,
 label text not null check(length(label) between 1 and 60 and label=btrim(label) and label!~'[[:cntrl:]]'),
 kind text not null check(kind in('text','number','date','select')),
 options text[] not null default '{}' check(cardinality(options)<=20),
 position integer not null check(position between 0 and 999),archived boolean not null default false,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,id),check((kind='select')=(cardinality(options)>0)));
create table if not exists public.pro_contact_extra_heads(
 owner_id uuid not null,client_id text not null,revision integer not null check(revision>0),updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,client_id),foreign key(owner_id,client_id) references public.pro_clients(user_id,id) on delete cascade);
create table if not exists public.pro_contact_field_values(
 owner_id uuid not null,client_id text not null,field_id uuid not null,value text not null check(length(value) between 1 and 500),
 primary key(owner_id,client_id,field_id),foreign key(owner_id,client_id) references public.pro_clients(user_id,id) on delete cascade,
 foreign key(owner_id,field_id) references public.pro_contact_field_defs(owner_id,id) on delete cascade);
create table if not exists public.pro_contact_channels(
 owner_id uuid not null,client_id text not null,id uuid not null,kind text not null check(kind in('phone','email')),
 value text not null check(length(value) between 1 and 254 and value=btrim(value) and value!~'[[:cntrl:]]'),
 value_key text not null,label text not null default '' check(length(label)<=30 and label=btrim(label) and label!~'[[:cntrl:]]'),
 position integer not null check(position between 0 and 9),primary key(owner_id,client_id,id),unique(owner_id,client_id,kind,value_key),
 foreign key(owner_id,client_id) references public.pro_clients(user_id,id) on delete cascade);
create index if not exists pro_contact_channels_key on public.pro_contact_channels(owner_id,kind,value_key);
create table if not exists public.pro_contact_field_actions(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,input jsonb not null,result jsonb not null,
 at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id));
create table if not exists public.pro_contact_field_history(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,subject text not null,
 action text not null check(action in('field_save','field_archive','field_restore','field_reorder','extras_save','import')),
 before_value jsonb,after_value jsonb not null,actor_name text not null default '',at timestamptz not null default clock_timestamp(),
 primary key(owner_id,action_id,subject));
create index if not exists pro_contact_field_history_subject on public.pro_contact_field_history(owner_id,subject,at desc);

create or replace function public.pro_contact_fields_immutable() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Immutable record' using errcode='55000';end $$;
do $$declare t text;begin
 foreach t in array array['pro_contact_field_actions','pro_contact_field_history'] loop
  execute format('drop trigger if exists %I on public.%I',t||'_immutable',t);
  execute format('create trigger %I before update or delete on public.%I for each row when (pg_trigger_depth()=0) execute function public.pro_contact_fields_immutable()',t||'_immutable',t);
 end loop;
 foreach t in array array['pro_contact_field_heads','pro_contact_field_defs','pro_contact_extra_heads','pro_contact_field_values','pro_contact_channels','pro_contact_field_actions','pro_contact_field_history'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

-- ===== Helpers =====
create or replace function public.pro_contact_field_json(d public.pro_contact_field_defs) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',d.id,'label',d.label,'kind',d.kind,'options',to_jsonb(d.options),'position',d.position,'archived',d.archived,
  'usage',(select count(*) from public.pro_contact_field_values v where v.owner_id=d.owner_id and v.field_id=d.id)) $$;
-- Canonical value for a kind, or null when invalid. '' means "no value".
create or replace function public.pro_contact_field_value(p_kind text,p_options text[],p_value text) returns text language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare v text:=btrim(coalesce(p_value,''));d date;
begin
 if v='' then return '';end if;
 if p_kind='text' then if length(v)>500 or v~'[[:cntrl:]]' then return null;end if;return v;end if;
 if p_kind='number' then if v!~'^-?[0-9]{1,12}([.,][0-9]{1,4})?$' then return null;end if;return (replace(v,',','.')::numeric)::text;end if;
 if p_kind='date' then if v!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return null;end if;
  begin d:=v::date;exception when others then return null;end;if d<date'1900-01-01' or d>date'2100-12-31' or to_char(d,'YYYY-MM-DD')<>v then return null;end if;return v;end if;
 if p_kind='select' then if v=any(p_options) then return v;end if;return null;end if;
 return null;
end $$;
create or replace function public.pro_contact_channel_key(p_kind text,p_value text) returns text language sql immutable security invoker set search_path=public,pg_temp as $$
 select case when p_kind='email' and btrim(coalesce(p_value,''))~'^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and length(btrim(p_value))<=254 then public.pro_contact_email_key(p_value)
  when p_kind='phone' and length(btrim(coalesce(p_value,'')))<=30 then public.pro_contact_phone_key(p_value) end $$;
create or replace function public.pro_contact_extras_json(p_owner uuid,p_client text) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('revision',coalesce((select revision from public.pro_contact_extra_heads where owner_id=p_owner and client_id=p_client),0),
  'values',coalesce((select jsonb_agg(jsonb_build_object('fieldId',v.field_id,'value',v.value) order by d.position,d.id) from public.pro_contact_field_values v join public.pro_contact_field_defs d on d.owner_id=v.owner_id and d.id=v.field_id where v.owner_id=p_owner and v.client_id=p_client),'[]'::jsonb),
  'channels',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'kind',c.kind,'value',c.value,'label',c.label) order by c.position) from public.pro_contact_channels c where c.owner_id=p_owner and c.client_id=p_client),'[]'::jsonb)) $$;
create or replace function public.pro_contact_fields_actor(p_owner uuid,p_member uuid) returns text language sql stable security invoker set search_path=public,pg_temp as $$
 select left(coalesce(public.pro_team_name(case when p_member is not null and public.pro_role_of(p_member,p_owner) is not null then p_member else p_owner end),''),160) $$;

-- ===== Reads =====
create or replace function public.pro_contact_fields_read(p_owner uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 perform public.pro_contact_owner(p_owner);
 return jsonb_build_object('revision',coalesce((select revision from public.pro_contact_field_heads where owner_id=p_owner),0),'capacity',30,
  'fields',coalesce((select jsonb_agg(public.pro_contact_field_json(d) order by d.archived,d.position,d.id) from public.pro_contact_field_defs d where d.owner_id=p_owner),'[]'::jsonb));
end $$;
create or replace function public.pro_contact_extras_read(p_owner uuid,p_client text) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 perform public.pro_contact_owner(p_owner);
 if p_client is null or length(p_client)>160 or not exists(select 1 from public.pro_clients where user_id=p_owner and id=p_client) then raise exception 'Customer unavailable' using errcode='P0002';end if;
 return jsonb_build_object('clientId',p_client)||public.pro_contact_extras_json(p_owner,p_client)||jsonb_build_object(
  'history',coalesce((select jsonb_agg(jsonb_build_object('actionId',h.action_id,'action',h.action,'actorName',h.actor_name,'at',h.at,'before',h.before_value,'after',h.after_value) order by h.at desc)
   from(select * from public.pro_contact_field_history where owner_id=p_owner and subject=p_client order by at desc limit 20) h),'[]'::jsonb));
end $$;
-- Export companion: active fields and the extras of every customer that has any (bounded like the export).
create or replace function public.pro_contact_extras_export(p_owner uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 perform public.pro_contact_owner(p_owner);
 return jsonb_build_object('fields',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'label',d.label,'kind',d.kind) order by d.position,d.id) from public.pro_contact_field_defs d where d.owner_id=p_owner and not d.archived),'[]'::jsonb),
  'items',coalesce((select jsonb_object_agg(x.client_id,public.pro_contact_extras_json(p_owner,x.client_id)) from(
   select client_id from public.pro_contact_field_values where owner_id=p_owner union select client_id from public.pro_contact_channels where owner_id=p_owner limit 5000) x),'{}'::jsonb));
end $$;

-- ===== Validation of an extras payload (values object + channels array) for one customer =====
-- Returns {values:{fieldId:canonical}, channels:[{kind,value,key,label}]} or raises 22023 with a hint.
create or replace function public.pro_contact_extras_normalize(p_owner uuid,p_client text,p_values jsonb,p_channels jsonb) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare k text;v jsonb;d public.pro_contact_field_defs;canon text;out_values jsonb:='{}';out_channels jsonb:='[]';c jsonb;ck text;keys text[]:='{}';primary_email text;primary_phone text;lbl text;
begin
 if jsonb_typeof(p_values) is distinct from 'object' or jsonb_typeof(p_channels) is distinct from 'array' or jsonb_array_length(p_channels)>10 then raise exception 'Invalid customer extras' using errcode='22023';end if;
 for k,v in select * from jsonb_each(p_values) loop
  begin select * into d from public.pro_contact_field_defs where owner_id=p_owner and id=k::uuid;exception when others then raise exception 'Invalid field' using errcode='22023';end;
  if d.id is null then raise exception 'Field unavailable' using errcode='40001';end if;
  if d.archived then raise exception 'Archived field' using errcode='40001';end if;
  if jsonb_typeof(v) not in('string','null') then raise exception 'Invalid field value' using errcode='22023';end if;
  canon:=public.pro_contact_field_value(d.kind,d.options,v#>>'{}');
  if canon is null then raise exception 'Invalid field value' using errcode='22023',hint='pro_contact_field_value:'||d.id;end if;
  out_values:=out_values||jsonb_build_object(k,canon);
 end loop;
 select public.pro_contact_email_key(email),public.pro_contact_phone_key(phone) into primary_email,primary_phone from public.pro_clients where user_id=p_owner and id=p_client;
 for c in select value from jsonb_array_elements(p_channels) loop
  if jsonb_typeof(c) is distinct from 'object' or (select array_agg(x order by x) from jsonb_object_keys(c) x) is distinct from array['kind','label','value'] or c->>'kind' not in('phone','email')
   or jsonb_typeof(c->'value') is distinct from 'string' or jsonb_typeof(c->'label') is distinct from 'string' then raise exception 'Invalid channel' using errcode='22023';end if;
  ck:=public.pro_contact_channel_key(c->>'kind',c->>'value');lbl:=btrim(c->>'label');
  if ck is null or length(lbl)>30 or lbl~'[[:cntrl:]]' then raise exception 'Invalid channel' using errcode='22023',hint='pro_contact_channel_invalid';end if;
  if (c->>'kind')||':'||ck=any(keys) or c->>'kind'='email' and ck=primary_email or c->>'kind'='phone' and ck=primary_phone then raise exception 'Repeated channel' using errcode='22023',hint='pro_contact_channel_repeated';end if;
  keys:=keys||((c->>'kind')||':'||ck);
  out_channels:=out_channels||jsonb_build_array(jsonb_build_object('kind',c->>'kind','value',btrim(c->>'value'),'key',ck,'label',lbl));
 end loop;
 return jsonb_build_object('values',out_values,'channels',out_channels);
end $$;
-- Write normalized extras for one customer: the named values, and the full list of additional channels.
create or replace function public.pro_contact_extras_write(p_owner uuid,p_client text,p_norm jsonb,p_aid uuid) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare k text;v text;c jsonb;i integer:=0;
begin
 -- Only the fields named in the payload change ('' clears one); other values, and archived fields, stay.
 delete from public.pro_contact_field_values x where x.owner_id=p_owner and x.client_id=p_client and x.field_id::text in(select jsonb_object_keys(p_norm->'values'));
 for k,v in select * from jsonb_each_text(p_norm->'values') loop
  if v<>'' then insert into public.pro_contact_field_values(owner_id,client_id,field_id,value) values(p_owner,p_client,k::uuid,v);end if;end loop;
 delete from public.pro_contact_channels where owner_id=p_owner and client_id=p_client;
 for c in select value from jsonb_array_elements(p_norm->'channels') loop
  insert into public.pro_contact_channels(owner_id,client_id,id,kind,value,value_key,label,position) values(p_owner,p_client,public.pro_lead_import_uuid('pro-contact-channel:'||p_aid::text||':'||p_client||':'||i),c->>'kind',c->>'value',c->>'key',c->>'label',i);
  i:=i+1;end loop;
 insert into public.pro_contact_extra_heads(owner_id,client_id,revision) values(p_owner,p_client,1)
  on conflict(owner_id,client_id) do update set revision=public.pro_contact_extra_heads.revision+1,updated_at=clock_timestamp();
end $$;

-- ===== Mutations: definitions and one customer's extras =====
create or replace function public.pro_contact_fields_mutate(p_owner uuid,p_input jsonb,p_member uuid default null) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;keys text[];aid uuid;receipt public.pro_contact_field_actions;rev integer;d public.pro_contact_field_defs;fid uuid;lbl text;opts text[];o text;answer jsonb;before_json jsonb;after_json jsonb;
 cid text;norm jsonb;ids uuid[];n integer;actor text;
begin
 perform public.pro_contact_owner(p_owner);
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' or jsonb_typeof(p_input->'actionId') is distinct from 'string' then raise exception 'Invalid field action' using errcode='22023';end if;
 act:=p_input->>'action';select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if keys is distinct from (case act when 'field_save' then array['action','actionId','id','kind','label','options','revision'] when 'field_archive' then array['action','actionId','id','revision'] when 'field_restore' then array['action','actionId','id','revision']
   when 'field_reorder' then array['action','actionId','ids','revision'] when 'extras_save' then array['action','actionId','channels','clientId','revision','values'] end) then raise exception 'Unexpected field action' using errcode='22023';end if;
 if jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce(p_input->>'revision'~'^[0-9]{1,10}$',false) or(p_input->>'revision')::numeric>2147483646 then raise exception 'Invalid revision' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid action id' using errcode='22023';end;
 perform pg_advisory_xact_lock(hashtextextended('pro-contact-fields:'||p_owner::text,0));
 select * into receipt from public.pro_contact_field_actions where owner_id=p_owner and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result||jsonb_build_object('replayed',true);end if;
 actor:=public.pro_contact_fields_actor(p_owner,p_member);
 if act='extras_save' then
  if jsonb_typeof(p_input->'clientId') is distinct from 'string' or not exists(select 1 from public.pro_clients where user_id=p_owner and id=p_input->>'clientId') then raise exception 'Customer unavailable' using errcode='P0002';end if;
  cid:=p_input->>'clientId';
  perform 1 from public.pro_contact_extra_heads where owner_id=p_owner and client_id=cid for update;
  if coalesce((select revision from public.pro_contact_extra_heads where owner_id=p_owner and client_id=cid),0)<>(p_input->>'revision')::integer then raise exception 'Customer details changed' using errcode='40001';end if;
  norm:=public.pro_contact_extras_normalize(p_owner,cid,p_input->'values',p_input->'channels');
  before_json:=public.pro_contact_extras_json(p_owner,cid);perform public.pro_contact_extras_write(p_owner,cid,norm,aid);after_json:=public.pro_contact_extras_json(p_owner,cid);
  insert into public.pro_contact_field_history(owner_id,action_id,subject,action,before_value,after_value,actor_name) values(p_owner,aid,cid,'extras_save',before_json,after_json,actor);
  answer:=jsonb_build_object('action',act,'clientId',cid)||after_json;
  insert into public.pro_contact_field_actions(owner_id,action_id,input,result) values(p_owner,aid,p_input,answer);
  return answer;
 end if;
 rev:=coalesce((select revision from public.pro_contact_field_heads where owner_id=p_owner),0);
 if rev<>(p_input->>'revision')::integer then raise exception 'Fields changed' using errcode='40001';end if;
 before_json:=public.pro_contact_fields_read(p_owner)->'fields';
 if act='field_save' then
  begin fid:=(p_input->>'id')::uuid;exception when others then raise exception 'Invalid field id' using errcode='22023';end;
  if fid is null or jsonb_typeof(p_input->'label') is distinct from 'string' or jsonb_typeof(p_input->'options') is distinct from 'array' or p_input->>'kind' not in('text','number','date','select') then raise exception 'Invalid field' using errcode='22023';end if;
  lbl:=btrim(p_input->>'label');if length(lbl) not between 1 and 60 or lbl~'[[:cntrl:]]' then raise exception 'Invalid field label' using errcode='22023';end if;
  opts:='{}';
  for o in select btrim(x) from jsonb_array_elements_text(p_input->'options') x loop
   if length(o) not between 1 and 60 or o~'[[:cntrl:]]' or lower(o)=any(array(select lower(y) from unnest(opts) y)) then raise exception 'Invalid option' using errcode='22023';end if;opts:=opts||o;end loop;
  if (p_input->>'kind'='select')<>(cardinality(opts)>0) or cardinality(opts)>20 then raise exception 'Invalid options' using errcode='22023';end if;
  if exists(select 1 from public.pro_contact_field_defs where owner_id=p_owner and lower(label)=lower(lbl) and id<>fid and not archived) then raise exception 'Repeated field' using errcode='23505';end if;
  select * into d from public.pro_contact_field_defs where owner_id=p_owner and id=fid;
  if d.id is null then
   if (select count(*) from public.pro_contact_field_defs where owner_id=p_owner and not archived)>=30 then raise exception 'Field capacity reached' using errcode='22023',hint='pro_contact_field_capacity';end if;
   insert into public.pro_contact_field_defs(owner_id,id,label,kind,options,position) values(p_owner,fid,lbl,p_input->>'kind',opts,coalesce((select max(position)+1 from public.pro_contact_field_defs where owner_id=p_owner),0));
  else
   if d.archived then raise exception 'Archived field' using errcode='40001';end if;
   if d.kind<>p_input->>'kind' and exists(select 1 from public.pro_contact_field_values where owner_id=p_owner and field_id=fid) then raise exception 'Field kind in use' using errcode='22023',hint='pro_contact_field_kind_in_use';end if;
   if exists(select 1 from public.pro_contact_field_values where owner_id=p_owner and field_id=fid and p_input->>'kind'='select' and not value=any(opts)) then raise exception 'Option in use' using errcode='22023',hint='pro_contact_field_option_in_use';end if;
   update public.pro_contact_field_defs set label=lbl,kind=p_input->>'kind',options=opts,updated_at=clock_timestamp() where owner_id=p_owner and id=fid;
  end if;
 elsif act in('field_archive','field_restore') then
  begin fid:=(p_input->>'id')::uuid;exception when others then raise exception 'Invalid field id' using errcode='22023';end;
  select * into d from public.pro_contact_field_defs where owner_id=p_owner and id=fid;if d.id is null then raise exception 'Field unavailable' using errcode='P0002';end if;
  if d.archived=(act='field_archive') then raise exception 'Field changed' using errcode='40001';end if;
  if act='field_restore' then
   if (select count(*) from public.pro_contact_field_defs where owner_id=p_owner and not archived)>=30 then raise exception 'Field capacity reached' using errcode='22023',hint='pro_contact_field_capacity';end if;
   if exists(select 1 from public.pro_contact_field_defs where owner_id=p_owner and lower(label)=lower(d.label) and id<>fid and not archived) then raise exception 'Repeated field' using errcode='23505';end if;
  end if;
  update public.pro_contact_field_defs set archived=(act='field_archive'),updated_at=clock_timestamp() where owner_id=p_owner and id=fid;
 else
  if jsonb_typeof(p_input->'ids') is distinct from 'array' then raise exception 'Invalid order' using errcode='22023';end if;
  begin select array_agg(x::uuid order by n0) into ids from jsonb_array_elements_text(p_input->'ids') with ordinality y(x,n0);exception when others then raise exception 'Invalid order' using errcode='22023';end;
  if ids is null or cardinality(ids)<>(select count(distinct z) from unnest(ids) z) or (select array_agg(id order by id) from public.pro_contact_field_defs where owner_id=p_owner and not archived) is distinct from (select array_agg(z order by z) from unnest(ids) z) then raise exception 'Fields changed' using errcode='40001';end if;
  n:=0;foreach fid in array ids loop update public.pro_contact_field_defs set position=n,updated_at=clock_timestamp() where owner_id=p_owner and id=fid;n:=n+1;end loop;
  update public.pro_contact_field_defs d2 set position=n+x.rn from(select id,(row_number() over(order by position,id))::integer rn from public.pro_contact_field_defs where owner_id=p_owner and archived) x where d2.owner_id=p_owner and d2.id=x.id;
 end if;
 insert into public.pro_contact_field_heads(owner_id,revision) values(p_owner,1) on conflict(owner_id) do update set revision=public.pro_contact_field_heads.revision+1;
 after_json:=public.pro_contact_fields_read(p_owner);
 insert into public.pro_contact_field_history(owner_id,action_id,subject,action,before_value,after_value,actor_name) values(p_owner,aid,'fields',act,before_json,after_json->'fields',actor);
 answer:=jsonb_build_object('action',act)||after_json;
 insert into public.pro_contact_field_actions(owner_id,action_id,input,result) values(p_owner,aid,p_input,answer);
 return answer;
end $$;

-- ===== Import with custom fields and additional channels =====
-- p_extras: array aligned with p_rows; each {fields:{fieldId:value}, phones:[text], emails:[text]} (≤ 3 each).
create or replace function public.pro_contact_extras_rows(p_owner uuid,p_rows jsonb,p_extras jsonb) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare e jsonb;i integer:=-1;issues jsonb:='[]';row_issues text[];norm jsonb;chan jsonb;x text;k text;v jsonb;d public.pro_contact_field_defs;canon text;keys text[];
begin
 if jsonb_typeof(p_extras) is distinct from 'array' or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_extras)<>jsonb_array_length(p_rows) then raise exception 'Invalid import extras' using errcode='22023';end if;
 for e in select value from jsonb_array_elements(p_extras) loop
  i:=i+1;row_issues:='{}';norm:='{}';chan:='[]';keys:='{}';
  if jsonb_typeof(e) is distinct from 'object' or (select array_agg(y order by y) from jsonb_object_keys(e) y) is distinct from array['emails','fields','phones'] or jsonb_typeof(e->'fields') is distinct from 'object'
   or jsonb_typeof(e->'phones') is distinct from 'array' or jsonb_typeof(e->'emails') is distinct from 'array' or jsonb_array_length(e->'phones')>3 or jsonb_array_length(e->'emails')>3 then raise exception 'Invalid import extras' using errcode='22023';end if;
  for k,v in select * from jsonb_each(e->'fields') loop
   d:=null;begin select * into d from public.pro_contact_field_defs where owner_id=p_owner and id=k::uuid and not archived;exception when others then raise exception 'Invalid field' using errcode='22023';end;
   if d.id is null then raise exception 'Fields changed' using errcode='40001';end if;
   if jsonb_typeof(v) is distinct from 'string' then raise exception 'Invalid import extras' using errcode='22023';end if;
   canon:=public.pro_contact_field_value(d.kind,d.options,v#>>'{}');
   if canon is null then row_issues:=row_issues||('custom_invalid:'||d.label);elsif canon<>'' then norm:=norm||jsonb_build_object(k,canon);end if;
  end loop;
  for k in select 'phone' union all select 'email' loop
   for x in select btrim(y) from jsonb_array_elements_text(e->(k||'s')) y loop
    if x='' then continue;end if;
    if public.pro_contact_channel_key(k,x) is null then row_issues:=row_issues||(k||'_extra_invalid');
    elsif not (k||':'||public.pro_contact_channel_key(k,x))=any(keys) and not(k='email' and public.pro_contact_channel_key(k,x)=public.pro_contact_email_key(p_rows->i->>'email')) and not(k='phone' and public.pro_contact_channel_key(k,x)=public.pro_contact_phone_key(p_rows->i->>'phone')) then
     keys:=keys||(k||':'||public.pro_contact_channel_key(k,x));chan:=chan||jsonb_build_array(jsonb_build_object('kind',k,'value',x,'label',''));end if;
   end loop;
  end loop;
  issues:=issues||jsonb_build_array(jsonb_build_object('issues',to_jsonb(row_issues),'values',norm,'channels',chan));
 end loop;
 return issues;
end $$;
-- Same shape as pro_contacts_preview; additionally: extras issues make a row invalid, and a row whose e-mail or
-- phone equals an ADDITIONAL channel of an existing customer "already exists".
create or replace function public.pro_contact_extras_preview(p_owner uuid,p_rows jsonb,p_extras jsonb) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare base jsonb;ex jsonb;r jsonb;out_rows jsonb:='[]';m record;n_new integer:=0;n_dup integer:=0;n_file integer:=0;n_bad integer:=0;st text;iss jsonb;mt jsonb;
begin
 perform public.pro_contact_owner(p_owner);
 base:=public.pro_contacts_preview(p_owner,p_rows);ex:=public.pro_contact_extras_rows(p_owner,p_rows,p_extras);
 for r in select value from jsonb_array_elements(base->'rows') loop
  st:=r->>'status';iss:=r->'issues';mt:=r->'match';
  if st='new' then
   select c.id,c.name,ch.kind into m from public.pro_contact_channels ch join public.pro_clients c on c.user_id=ch.owner_id and c.id=ch.client_id
    where ch.owner_id=p_owner and(ch.kind='email' and ch.value_key=public.pro_contact_email_key(r->'row'->>'email') or ch.kind='phone' and ch.value_key=public.pro_contact_phone_key(r->'row'->>'phone')) order by c.archived,c.position limit 1;
   if m.id is not null then st:='duplicate';mt:=jsonb_build_object('id',m.id,'name',m.name,'by',m.kind);end if;
  end if;
  if st in('new','duplicate','duplicate_in_file') and jsonb_array_length(ex->(r->>'index')::integer->'issues')>0 then st:='invalid';mt:=null;end if;
  iss:=iss||(ex->(r->>'index')::integer->'issues');
  if st='new' then n_new:=n_new+1;elsif st='duplicate' then n_dup:=n_dup+1;elsif st='duplicate_in_file' then n_file:=n_file+1;else n_bad:=n_bad+1;end if;
  out_rows:=out_rows||jsonb_build_array(jsonb_build_object('index',r->'index','status',st,'issues',iss,'row',r->'row','match',mt));
 end loop;
 return jsonb_build_object('rows',out_rows,'counts',jsonb_build_object('total',jsonb_array_length(out_rows),'new',n_new,'duplicate',n_dup,'duplicateInFile',n_file,'invalid',n_bad));
end $$;
create or replace function public.pro_contact_extras_import(p_owner uuid,p_input jsonb,p_member uuid default null) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare keys text[];aid uuid;receipt public.pro_contact_field_actions;pv jsonb;ex jsonb;base jsonb;e jsonb;r jsonb;kept jsonb:='[]';map integer[]:='{}';inner_result jsonb;j integer:=-1;cid text;written integer:=0;answer jsonb;actor text;
begin
 perform public.pro_contact_owner(p_owner);
 if jsonb_typeof(p_input) is distinct from 'object' or p_input->>'action' is distinct from 'import' then raise exception 'Invalid import' using errcode='22023';end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;
 if keys is distinct from array['action','actionId','extras','fileName','format','revision','rows'] then raise exception 'Unexpected import fields' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid action id' using errcode='22023';end;
 perform pg_advisory_xact_lock(hashtextextended('pro-contact-fields:'||p_owner::text,0));
 select * into receipt from public.pro_contact_field_actions where owner_id=p_owner and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result||jsonb_build_object('replayed',true);end if;
 pv:=public.pro_contact_extras_preview(p_owner,p_input->'rows',p_input->'extras');ex:=public.pro_contact_extras_rows(p_owner,p_input->'rows',p_input->'extras');base:=public.pro_contacts_preview(p_owner,p_input->'rows');
 -- Rows this preview changed (duplicate by an additional channel, invalid extras) never reach the existing import.
 for r in select value from jsonb_array_elements(pv->'rows') loop
  if r->>'status'=base->'rows'->(r->>'index')::integer->>'status' then kept:=kept||jsonb_build_array(p_input->'rows'->(r->>'index')::integer);map:=map||(r->>'index')::integer;end if;
 end loop;
 if jsonb_array_length(kept)=0 then
  if coalesce((select revision from public.pro_workspace_core where user_id=p_owner),0)<>(p_input->>'revision')::integer then raise exception 'Customers changed' using errcode='40001';end if;
  inner_result:=jsonb_build_object('action','import','revision',(p_input->>'revision')::integer,'created',0,'createdIds','[]'::jsonb);
 else
  inner_result:=public.pro_contacts_mutate(p_owner,jsonb_build_object('action','import','actionId',aid,'revision',p_input->'revision','fileName',p_input->'fileName','format',p_input->'format','rows',kept));
  actor:=public.pro_contact_fields_actor(p_owner,p_member);
  for j in 0..jsonb_array_length(kept)-1 loop
   cid:=public.pro_lead_import_uuid('pro-contacts:'||aid::text||':'||j)::text;e:=ex->map[j+1];
   if (inner_result->'createdIds') ? cid and(e->'values'<>'{}'::jsonb or jsonb_array_length(e->'channels')>0) then
    perform public.pro_contact_extras_write(p_owner,cid,jsonb_build_object('values',e->'values','channels',(select coalesce(jsonb_agg(c||jsonb_build_object('key',public.pro_contact_channel_key(c->>'kind',c->>'value'))),'[]'::jsonb) from jsonb_array_elements(e->'channels') c)),aid);
    insert into public.pro_contact_field_history(owner_id,action_id,subject,action,before_value,after_value,actor_name) values(p_owner,aid,cid,'import',null,public.pro_contact_extras_json(p_owner,cid),actor);
    written:=written+1;
   end if;
  end loop;
 end if;
 answer:=inner_result-'replayed'||jsonb_build_object('withExtras',written,'counts',pv->'counts');
 insert into public.pro_contact_field_actions(owner_id,action_id,input,result) values(p_owner,aid,p_input,answer);
 return answer;
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in(
  'pro_contact_fields_immutable','pro_contact_field_json','pro_contact_field_value','pro_contact_channel_key','pro_contact_extras_json','pro_contact_fields_actor','pro_contact_fields_read','pro_contact_extras_read','pro_contact_extras_export',
  'pro_contact_extras_normalize','pro_contact_extras_write','pro_contact_fields_mutate','pro_contact_extras_rows','pro_contact_extras_preview','pro_contact_extras_import') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
commit;
notify pgrst,'reload schema';
