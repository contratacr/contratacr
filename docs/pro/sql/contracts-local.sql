-- LOCAL PRO ONLY. Contratos por proyecto (row 40 of the parity register).
-- Account-level contract templates and a reusable clause library; per job (pro_work)
-- contracts built from a template or from scratch, optionally linked to one accepted
-- or draft estimate of the same project, numbered CTR-0001 per account.
--
-- Legal scope: this is an AUTHENTICATED ACCEPTANCE RECORD, not a certified electronic
-- signature (row 41 stays E). Nothing here sends e-mail, notifications or documents.
--
-- Merge fields: clause titles/bodies and the contract title may contain {{group.key}}
-- tokens from a closed list (pro_contract_field_keys). Unknown tokens are rejected on
-- save. The preview resolves them live; sharing is refused while a used field has no
-- value, and freezes the resolved text into an immutable version (content + SHA-256 of
-- content::text, the canonical jsonb text output).
--
-- States: draft -> shared -> accepted | declined; shared|declined -> draft (withdraw);
-- any -> voided (with reason). Clauses are edited only in draft. Contracts are never
-- deleted: numbers are gapless per account (a counter row in the same transaction).
-- They can only disappear if the job itself is deleted (cascade); numbers are not reused.
--
-- Customer side: the linked customer of the job (confirmed/completed appointment request,
-- same rule as the customer view) sees shared versions only while the opt-in section
-- show_contracts of pro_client_dashboards is on (default false), and can accept (typed
-- name, exact version + hash) or decline (reason). Dates are America/Costa_Rica.
--
-- Lock order: action advisory -> account contracts advisory -> counter row -> object row.
begin;
alter table public.pro_client_dashboards add column if not exists show_contracts boolean not null default false;

create table if not exists public.pro_contract_library_clauses(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,
 title text not null check(length(btrim(title)) between 1 and 160),
 body text not null check(length(btrim(body)) between 1 and 4000),
 archived boolean not null default false,
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id)
);
create unique index if not exists pro_contract_library_clause_global on public.pro_contract_library_clauses(id);
create index if not exists pro_contract_library_clause_page on public.pro_contract_library_clauses(owner_id,archived,lower(title),id);
create table if not exists public.pro_contract_templates(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,
 title text not null check(length(btrim(title)) between 1 and 160),
 description text check(description is null or length(btrim(description)) between 1 and 500),
 deposit_percent numeric(5,2) check(deposit_percent is null or deposit_percent>0 and deposit_percent<=100),
 clauses jsonb not null default '[]'::jsonb check(jsonb_typeof(clauses)='array' and jsonb_array_length(clauses)<=80),
 archived boolean not null default false,
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id)
);
create unique index if not exists pro_contract_template_global on public.pro_contract_templates(id);
create index if not exists pro_contract_template_page on public.pro_contract_templates(owner_id,archived,lower(title),id);
create table if not exists public.pro_contract_counters(
 owner_id uuid primary key references public.profiles(id) on delete cascade,
 last_number integer not null default 0 check(last_number between 0 and 999999)
);
create table if not exists public.pro_contracts(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,work_id text not null,
 number integer not null check(number between 1 and 999999),
 title text not null check(length(btrim(title)) between 1 and 160),
 language text not null check(language in('es','en')),
 template_id uuid,estimate_id uuid,
 deposit_percent numeric(5,2) check(deposit_percent is null or deposit_percent>0 and deposit_percent<=100),
 clauses jsonb not null default '[]'::jsonb check(jsonb_typeof(clauses)='array' and jsonb_array_length(clauses)<=80),
 status text not null default 'draft' check(status in('draft','shared','accepted','declined','voided')),
 latest_version integer check(latest_version is null or latest_version>0),
 void_reason text check(void_reason is null or length(btrim(void_reason)) between 1 and 300),voided_at timestamptz,
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id),unique(owner_id,number),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade,
 foreign key(owner_id,estimate_id) references public.pro_private_estimates(owner_id,id) on delete set null(estimate_id),
 check((status='voided')=(voided_at is not null) and (status='voided')=(void_reason is not null)),
 check(status not in('shared','accepted','declined') or latest_version is not null)
);
create unique index if not exists pro_contract_global on public.pro_contracts(id);
create index if not exists pro_contract_page on public.pro_contracts(owner_id,work_id,number desc);
-- Immutable snapshot per share. recipient_id is the linked customer at share time.
create table if not exists public.pro_contract_versions(
 owner_id uuid not null,contract_id uuid not null,version integer not null check(version>0),id uuid not null unique,
 recipient_id uuid not null references public.profiles(id) on delete cascade,recipient_name text not null check(length(recipient_name) between 1 and 160),
 content jsonb not null check(jsonb_typeof(content)='object'),content_hash text not null check(content_hash~'^[a-f0-9]{64}$'),
 shared_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,contract_id,version),foreign key(owner_id,contract_id) references public.pro_contracts(owner_id,id) on delete cascade
);
-- One customer response per version (accept or decline), never edited.
create table if not exists public.pro_contract_responses(
 version_id uuid primary key references public.pro_contract_versions(id) on delete cascade,
 owner_id uuid not null,contract_id uuid not null,version integer not null,
 actor_id uuid not null references public.profiles(id) on delete cascade,
 action text not null check(action in('accept','decline')),
 typed_name text check(typed_name is null or length(btrim(typed_name)) between 2 and 160),
 reason text check(reason is null or length(btrim(reason)) between 1 and 500),
 content_hash text not null check(content_hash~'^[a-f0-9]{64}$'),
 at timestamptz not null default clock_timestamp(),
 check((action='accept')=(typed_name is not null) and (action='decline')=(reason is not null)),
 foreign key(owner_id,contract_id,version) references public.pro_contract_versions(owner_id,contract_id,version) on delete cascade
);
create table if not exists public.pro_contract_history(
 owner_id uuid not null,action_id uuid not null,actor_id uuid not null,
 object_kind text not null check(object_kind in('library_clause','template','contract')),object_id uuid not null,work_id text,
 action text not null check(length(action) between 1 and 40),before_value jsonb,after_value jsonb not null,at timestamptz not null default clock_timestamp(),
 primary key(owner_id,action_id)
);
create index if not exists pro_contract_history_page on public.pro_contract_history(owner_id,object_kind,object_id,at desc);
create table if not exists public.pro_contract_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input jsonb not null,result jsonb not null,at timestamptz not null default clock_timestamp(),primary key(actor_id,action_id)
);

-- ---------------------------------------------------------------- helpers
create or replace function public.pro_contract_today() returns date
language sql stable security invoker set search_path=public,pg_temp as $$ select (now() at time zone 'America/Costa_Rica')::date $$;
create or replace function public.pro_contract_code(p_number integer) returns text
language sql immutable security invoker set search_path=public,pg_temp as $$ select 'CTR-'||lpad(p_number::text,4,'0') $$;
create or replace function public.pro_contract_field_keys() returns text[]
language sql immutable security invoker set search_path=public,pg_temp as $$
 select array['cliente.nombre','cliente.identificacion','proyecto.nombre','proyecto.direccion','empresa.nombre','empresa.identificacion',
  'cotizacion.codigo','cotizacion.total','contrato.codigo','fecha.hoy','anticipo.porcentaje','anticipo.monto',
  -- Ronda F2-B: aliases and contact data (appended: existing order is unchanged).
  'cliente.telefono','cliente.correo','trabajo.direccion','monto.total'] $$;
-- Exact key set (no optional keys): raises 22023 otherwise.
create or replace function public.pro_contract_expect(p_input jsonb,p_keys text[]) returns void
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
begin
 if (select array_agg(k order by k) from jsonb_object_keys(p_input) k) is distinct from (select array_agg(k order by k) from unnest(p_keys) k) then
  raise exception 'Invalid contract fields' using errcode='22023';end if;
end $$;
create or replace function public.pro_contract_uuid(p_value jsonb,p_nullable boolean default false) returns uuid
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
begin
 if p_value is null or jsonb_typeof(p_value)='null' then if p_nullable then return null;end if;raise exception 'Invalid id' using errcode='22023';end if;
 if jsonb_typeof(p_value)<>'string' or not (p_value#>>'{}')~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then raise exception 'Invalid id' using errcode='22023';end if;
 return (p_value#>>'{}')::uuid;
end $$;
create or replace function public.pro_contract_int(p_value jsonb,p_min integer,p_max integer) returns integer
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
begin
 if p_value is null or jsonb_typeof(p_value)<>'number' or not (p_value#>>'{}')~'^[0-9]{1,10}$' or (p_value#>>'{}')::bigint not between p_min and p_max then
  raise exception 'Invalid number' using errcode='22023';end if;
 return (p_value#>>'{}')::integer;
end $$;
-- Text: JSON string trimmed to 1..max (empty -> null). Multi-line keeps \n and \t only.
create or replace function public.pro_contract_text(p_value jsonb,p_max integer,p_required boolean,p_multiline boolean default false) returns text
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare t text;
begin
 if p_value is null or jsonb_typeof(p_value)='null' then if p_required then raise exception 'Missing text' using errcode='22023';end if;return null;end if;
 if jsonb_typeof(p_value)<>'string' then raise exception 'Invalid text' using errcode='22023';end if;
 t:=btrim(replace(p_value#>>'{}',E'\r\n',E'\n'),E' \n\t');
 if t='' then if p_required then raise exception 'Missing text' using errcode='22023';end if;return null;end if;
 if length(t)>p_max then raise exception 'Text too long' using errcode='22023';end if;
 if (p_multiline and translate(t,E'\n\t','')~'[[:cntrl:]]') or (not p_multiline and t~'[[:cntrl:]]') then raise exception 'Invalid text' using errcode='22023';end if;
 return t;
end $$;
create or replace function public.pro_contract_percent(p_value jsonb) returns numeric
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare n numeric;
begin
 if p_value is null or jsonb_typeof(p_value)='null' then return null;end if;
 if jsonb_typeof(p_value)<>'number' then raise exception 'Invalid percent' using errcode='22023';end if;
 n:=(p_value#>>'{}')::numeric;
 if n<=0 or n>100 or n<>round(n,2) then raise exception 'Invalid percent' using errcode='22023';end if;
 return n;
end $$;
-- Every {{...}} token must be a known field. Single braces are plain text.
create or replace function public.pro_contract_check_tokens(p_text text) returns void
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare m text[];
begin
 for m in select regexp_matches(coalesce(p_text,''),'\{\{([^{}]*)\}\}','g') loop
  if not btrim(m[1])=any(public.pro_contract_field_keys()) then raise exception 'Unknown merge field' using errcode='22023';end if;
 end loop;
end $$;
create or replace function public.pro_contract_used_keys(p_texts text[]) returns text[]
language sql immutable security invoker set search_path=public,pg_temp as $$
 select coalesce(array_agg(distinct k order by k),'{}') from (select btrim(m[1]) k from unnest(p_texts) t,regexp_matches(coalesce(t,''),'\{\{([^{}]*)\}\}','g') m) x
 where k=any(public.pro_contract_field_keys()) $$;
create or replace function public.pro_contract_resolve(p_text text,p_fields jsonb) returns text
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare k text;t text:=p_text;v text;
begin
 foreach k in array public.pro_contract_field_keys() loop
  v:=p_fields->>k;
  if v is not null then t:=regexp_replace(t,'\{\{\s*'||replace(k,'.','\.')||'\s*\}\}',replace(v,'\','\\'),'g');end if;
 end loop;
 return t;
end $$;
-- ₡1.250.000,50 (cents dropped when zero), same grouping as the app; USD as US$.
create or replace function public.pro_contract_money(p_cents bigint,p_currency text) returns text
language sql immutable security invoker set search_path=public,pg_temp as $$
 select case when p_currency='USD' then 'US$' else '₡' end
  ||regexp_replace((abs(p_cents)/100)::text,'(\d)(?=(\d{3})+$)','\1.','g')
  ||case when abs(p_cents)%100=0 then '' else ','||lpad((abs(p_cents)%100)::text,2,'0') end $$;
create or replace function public.pro_contract_day_text(p_day date,p_language text) returns text
language sql immutable security invoker set search_path=public,pg_temp as $$
 select case when p_language='en' then
  (array['January','February','March','April','May','June','July','August','September','October','November','December'])[extract(month from p_day)::int]||' '||extract(day from p_day)::int||', '||extract(year from p_day)::int
 else extract(day from p_day)::int||' de '||(array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month from p_day)::int]||' de '||extract(year from p_day)::int end $$;
create or replace function public.pro_contract_percent_text(p_value numeric,p_language text) returns text
language sql immutable security invoker set search_path=public,pg_temp as $$
 select case when p_value is null then null when p_language='en' then trim_scale(p_value)::text||'%' else replace(trim_scale(p_value)::text,'.',',')||' %' end $$;
-- Linked customer of the job (same rule as the customer view editor).
create or replace function public.pro_contract_recipient(p_owner uuid,p_work text,out recipient_id uuid,out recipient_name text)
language sql stable security invoker set search_path=public,pg_temp as $$
 select ar.client_user_id,left(coalesce(nullif(btrim(ar.client_name),''),nullif(btrim(c.full_name),''),'—'),160)
 from public.pro_appointment_requests ar join public.profiles c on c.id=ar.client_user_id
 where ar.owner_id=p_owner and ar.work_id=p_work and ar.status in('confirmed','completed') and not coalesce(c.is_disabled,false)
 order by ar.updated_at desc,ar.id desc limit 1 $$;
-- Estimate of THIS project (pro_project_estimate_rows relation 'project') with its link status.
-- accepted: some publication accepted (its frozen content is used). draft: never shared or the
-- latest publication was withdrawn/superseded. shared (Round 7A): the latest version is waiting for the
-- customer (its frozen content is used). Anything else (declined) is not linkable.
create or replace function public.pro_contract_estimate(p_owner uuid,p_work public.pro_work,p_estimate uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare d public.pro_private_estimates;acc record;pend jsonb;last_status text;
begin
 if p_estimate is null then return null;end if;
 if not exists(select 1 from public.pro_project_estimate_rows(p_owner,p_work) r where r.estimate_id=p_estimate and r.relation='project') then return null;end if;
 select * into d from public.pro_private_estimates where owner_id=p_owner and id=p_estimate and not archived;
 if not found then return null;end if;
 select v.content into acc from public.pro_private_estimate_publications v join public.pro_private_estimate_publication_states s on s.publication_id=v.id
  where v.owner_id=p_owner and v.estimate_id=d.id and s.status='accepted' order by v.version desc limit 1;
 if found then
  return jsonb_build_object('id',d.id,'code',upper(left(d.id::text,8)),'title',coalesce(acc.content->>'title',d.title),'status','accepted',
   'currency',coalesce(acc.content->>'currency',d.currency),'totalCents',coalesce((acc.content->>'totalCents')::bigint,d.total_cents));
 end if;
 select s.status into last_status from public.pro_private_estimate_publications v join public.pro_private_estimate_publication_states s on s.publication_id=v.id
  where v.owner_id=p_owner and v.estimate_id=d.id order by v.version desc limit 1;
 -- Round 7A: a version shared and still waiting for the customer is linkable too; its frozen content is used.
 select v.content into pend from public.pro_private_estimate_publications v join public.pro_private_estimate_publication_states s on s.publication_id=v.id
  where v.owner_id=p_owner and v.estimate_id=d.id and s.status in('awaiting_claim','shared','changes_requested') order by v.version desc limit 1;
 return jsonb_build_object('id',d.id,'code',upper(left(d.id::text,8)),'title',coalesce(pend->>'title',d.title),
  'status',case when last_status is null or last_status in('withdrawn','superseded') then 'draft' when last_status in('awaiting_claim','shared','changes_requested') then 'shared' else 'other' end,
  'currency',coalesce(pend->>'currency',d.currency),'totalCents',coalesce((pend->>'totalCents')::bigint,d.total_cents));
end $$;
-- Values of every merge field for one contract (null = no data).
create or replace function public.pro_contract_fields(p_row public.pro_contracts,p_today date) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare w public.pro_work;c public.pro_clients;iss public.pro_invoice_issuer_settings;loc text;company text;est jsonb;total bigint;
begin
 select * into w from public.pro_work where user_id=p_row.owner_id and id=p_row.work_id;
 select * into c from public.pro_clients where user_id=p_row.owner_id and id=w."clientId";
 select * into iss from public.pro_invoice_issuer_settings where user_id=p_row.owner_id;
 select nullif(btrim(r.location_text),'') into loc from public.pro_appointment_requests r
  where r.owner_id=p_row.owner_id and r.work_id=w.id and r.status in('confirmed','completed') and length(btrim(r.location_text))>0 order by r.updated_at desc,r.id desc limit 1;
 company:=coalesce(nullif(btrim(iss.issuer_name),''),(select nullif(btrim(p.business_name),'') from public.professionals p where p.profile_id=p_row.owner_id),
  (select nullif(btrim(p.full_name),'') from public.profiles p where p.id=p_row.owner_id));
 est:=public.pro_contract_estimate(p_row.owner_id,w,p_row.estimate_id);
 if est is not null and est->>'status' not in('accepted','draft','shared') then est:=null;end if;
 total:=(est->>'totalCents')::bigint;
 return jsonb_build_object(
  'cliente.nombre',coalesce(nullif(btrim(c.name),''),nullif(btrim(w.client),'')),
  'cliente.identificacion',nullif(btrim(c.identification),''),
  'proyecto.nombre',nullif(btrim(w.service),''),
  'proyecto.direccion',coalesce(loc,nullif(btrim(c.address),'')),
  'empresa.nombre',company,
  'empresa.identificacion',nullif(btrim(iss.issuer_id),''),
  'cotizacion.codigo',est->>'code',
  'cotizacion.total',case when est is not null then public.pro_contract_money(total,est->>'currency') end,
  'contrato.codigo',public.pro_contract_code(p_row.number),
  'fecha.hoy',public.pro_contract_day_text(p_today,p_row.language),
  'anticipo.porcentaje',public.pro_contract_percent_text(p_row.deposit_percent,p_row.language),
  'anticipo.monto',case when est is not null and p_row.deposit_percent is not null then public.pro_contract_money(round(total*p_row.deposit_percent/100)::bigint,est->>'currency') end,
  'cliente.telefono',nullif(btrim(c.phone),''),
  'cliente.correo',nullif(btrim(c.email),''),
  'trabajo.direccion',coalesce(loc,nullif(btrim(c.address),'')),
  'monto.total',case when est is not null then public.pro_contract_money(total,est->>'currency') end);
end $$;
create or replace function public.pro_contract_library_clause_json(p_row public.pro_contract_library_clauses) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'title',p_row.title,'body',p_row.body,'archived',p_row.archived,'revision',p_row.revision,'createdAt',p_row.created_at,'updatedAt',p_row.updated_at) $$;
-- Ronda F2-B: library clause versions. Every create/update already writes an immutable history row with the
-- exact before/after text; the versions are read from it (no second copy). A clause whose history lacks the create
-- (older data) starts from the "before" of its first update; one without any history is version 1 = current text.
create or replace function public.pro_contract_library_clause_states(p_owner uuid,p_clause uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare lc public.pro_contract_library_clauses;h record;states jsonb:='[]'::jsonb;last jsonb;n integer:=0;
begin
 select * into lc from public.pro_contract_library_clauses where owner_id=p_owner and id=p_clause;
 if not found then return null;end if;
 for h in select x.action,x.before_value,x.after_value,x.at from public.pro_contract_history x
  where x.owner_id=p_owner and x.object_kind='library_clause' and x.object_id=p_clause and x.action in('library_clause_create','library_clause_update') order by x.at,x.action_id loop
  if n=0 and h.action='library_clause_update' and h.before_value is not null then
   n:=1;last:=jsonb_build_object('title',h.before_value->>'title','body',h.before_value->>'body');
   states:=states||jsonb_build_object('version',1,'title',last->>'title','body',last->>'body','at',lc.created_at);
  end if;
  if last is null or last is distinct from jsonb_build_object('title',h.after_value->>'title','body',h.after_value->>'body') then
   n:=n+1;last:=jsonb_build_object('title',h.after_value->>'title','body',h.after_value->>'body');
   states:=states||jsonb_build_object('version',n,'title',last->>'title','body',last->>'body','at',h.at);
  end if;
 end loop;
 if last is distinct from jsonb_build_object('title',lc.title,'body',lc.body) then
  n:=n+1;states:=states||jsonb_build_object('version',n,'title',lc.title,'body',lc.body,'at',case when n=1 then lc.created_at else lc.updated_at end);
 end if;
 return states;
end $$;
create or replace function public.pro_contract_library_clause_versions(p_actor uuid,p_clause uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare lc public.pro_contract_library_clauses;states jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into lc from public.pro_contract_library_clauses where owner_id=p_actor and id=p_clause;
 if not found then raise exception 'Clause unavailable' using errcode='P0002';end if;
 states:=public.pro_contract_library_clause_states(p_actor,p_clause);
 return jsonb_build_object('clause',public.pro_contract_library_clause_json(lc)||jsonb_build_object('version',jsonb_array_length(states)),
  'versions',coalesce((select jsonb_agg(s||jsonb_build_object('current',(s->>'version')::integer=jsonb_array_length(states)) order by (s->>'version')::integer desc)
   from jsonb_array_elements(states) s where (s->>'version')::integer>jsonb_array_length(states)-100),'[]'::jsonb),
  'versionCount',jsonb_array_length(states));
end $$;
create or replace function public.pro_contract_template_json(p_row public.pro_contract_templates,p_full boolean) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'title',p_row.title,'description',p_row.description,'depositPercent',p_row.deposit_percent,
  'clauseCount',jsonb_array_length(p_row.clauses),'archived',p_row.archived,'revision',p_row.revision,'createdAt',p_row.created_at,'updatedAt',p_row.updated_at)
  ||case when p_full then jsonb_build_object('clauses',p_row.clauses) else '{}'::jsonb end $$;
create or replace function public.pro_contract_response_json(p_owner uuid,p_contract uuid,p_version integer) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('action',r.action,'typedName',r.typed_name,'reason',r.reason,'contentHash',r.content_hash,'at',r.at,
  'atCostaRica',to_char(r.at at time zone 'America/Costa_Rica','YYYY-MM-DD HH24:MI'))
 from public.pro_contract_responses r where r.owner_id=p_owner and r.contract_id=p_contract and r.version=p_version $$;
create or replace function public.pro_contract_json(p_row public.pro_contracts,p_full boolean) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'workId',p_row.work_id,'number',p_row.number,'code',public.pro_contract_code(p_row.number),'title',p_row.title,
  'language',p_row.language,'templateId',p_row.template_id,'estimateId',p_row.estimate_id,'depositPercent',p_row.deposit_percent,'status',p_row.status,
  'latestVersion',p_row.latest_version,'clauseCount',jsonb_array_length(p_row.clauses),'voidReason',p_row.void_reason,'voidedAt',p_row.voided_at,
  'sharedAt',(select v.shared_at from public.pro_contract_versions v where v.owner_id=p_row.owner_id and v.contract_id=p_row.id and v.version=p_row.latest_version),
  'response',case when p_row.latest_version is not null then public.pro_contract_response_json(p_row.owner_id,p_row.id,p_row.latest_version) end,
  'revision',p_row.revision,'createdAt',p_row.created_at,'updatedAt',p_row.updated_at)
  ||case when p_full then jsonb_build_object('clauses',p_row.clauses) else '{}'::jsonb end $$;
create or replace function public.pro_contract_version_json(p_row public.pro_contract_versions) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'version',p_row.version,'recipientName',p_row.recipient_name,'contentHash',p_row.content_hash,'sharedAt',p_row.shared_at,
  'content',p_row.content,'response',public.pro_contract_response_json(p_row.owner_id,p_row.contract_id,p_row.version)) $$;
-- Live preview: resolved title/clauses, field values and the used fields without data.
create or replace function public.pro_contract_preview(p_row public.pro_contracts,p_today date) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare f jsonb;texts text[];used text[];
begin
 f:=public.pro_contract_fields(p_row,p_today);
 select array[p_row.title]||coalesce(array_agg(x.t),'{}') into texts from (select e->>'title' t from jsonb_array_elements(p_row.clauses) e union all select e->>'body' from jsonb_array_elements(p_row.clauses) e) x;
 used:=public.pro_contract_used_keys(texts);
 return jsonb_build_object('title',public.pro_contract_resolve(p_row.title,f),
  'clauses',coalesce((select jsonb_agg(jsonb_build_object('id',e->>'id','title',public.pro_contract_resolve(e->>'title',f),'body',public.pro_contract_resolve(e->>'body',f)) order by o)
   from jsonb_array_elements(p_row.clauses) with ordinality a(e,o)),'[]'::jsonb),
  'fields',f,'usedFields',to_jsonb(used),
  'missingFields',to_jsonb(coalesce((select array_agg(k order by k) from unnest(used) k where f->>k is null),'{}'::text[])));
end $$;
-- Clause list editing shared by templates and contracts. Items: {id,title,body,sourceClauseId}.
create or replace function public.pro_contract_clause_item(p_id uuid,p_title text,p_body text,p_source uuid) returns jsonb
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
begin
 perform public.pro_contract_check_tokens(p_title);perform public.pro_contract_check_tokens(p_body);
 return jsonb_build_object('id',p_id,'title',p_title,'body',p_body,'sourceClauseId',p_source);
end $$;
create or replace function public.pro_contract_list_insert(p_list jsonb,p_item jsonb,p_position integer) returns jsonb
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare n integer:=jsonb_array_length(p_list);out_list jsonb:='[]'::jsonb;i integer;
begin
 if p_position<1 or p_position>n+1 then raise exception 'Invalid position' using errcode='22023';end if;
 if n>=80 then raise exception 'Too many clauses' using errcode='22023';end if;
 for i in 0..n loop
  if i+1=p_position then out_list:=out_list||jsonb_build_array(p_item);end if;
  if i<n then out_list:=out_list||jsonb_build_array(p_list->i);end if;
 end loop;
 if (select sum(length(e->>'title')+length(e->>'body')) from jsonb_array_elements(out_list) e)>120000 then raise exception 'Clauses too long' using errcode='22023';end if;
 return out_list;
end $$;
create or replace function public.pro_contract_list_without(p_list jsonb,p_clause uuid) returns jsonb
language sql immutable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(e order by o),'[]'::jsonb) from jsonb_array_elements(p_list) with ordinality a(e,o) where e->>'id'<>p_clause::text $$;
create or replace function public.pro_contract_list_position(p_list jsonb,p_clause uuid) returns integer
language sql immutable security invoker set search_path=public,pg_temp as $$
 select o::integer from jsonb_array_elements(p_list) with ordinality a(e,o) where e->>'id'=p_clause::text $$;
-- clause_put / clause_remove / clause_move / clause_insert_library on a list. Returns the new list.
create or replace function public.pro_contract_list_edit(p_owner uuid,p_list jsonb,p_input jsonb) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';cid uuid;pos integer;cur integer;lib public.pro_contract_library_clauses;old jsonb;n jsonb;
begin
 cid:=public.pro_contract_uuid(p_input->'clauseId');cur:=public.pro_contract_list_position(p_list,cid);
 if act='clause_put' then
  pos:=public.pro_contract_int(p_input->'position',1,81);
  if cur is not null then old:=p_list->(cur-1);end if;
  n:=public.pro_contract_clause_item(cid,public.pro_contract_text(p_input->'title',160,true),public.pro_contract_text(p_input->'body',4000,true,true),
   case when old is not null then nullif(old->>'sourceClauseId','')::uuid end);
  if old is not null and old=n and cur=pos then raise exception 'No clause changes' using errcode='22023';end if;
  return public.pro_contract_list_insert(public.pro_contract_list_without(p_list,cid),n,pos);
 elsif act='clause_remove' then
  if cur is null then raise exception 'Clause not found' using errcode='P0002';end if;
  return public.pro_contract_list_without(p_list,cid);
 elsif act='clause_move' then
  if cur is null then raise exception 'Clause not found' using errcode='P0002';end if;
  pos:=public.pro_contract_int(p_input->'position',1,80);
  if pos=cur then raise exception 'No clause changes' using errcode='22023';end if;
  return public.pro_contract_list_insert(public.pro_contract_list_without(p_list,cid),p_list->(cur-1),pos);
 elsif act='clause_insert_library' then
  if cur is not null then raise exception 'Clause already exists' using errcode='23505';end if;
  pos:=public.pro_contract_int(p_input->'position',1,81);
  select * into lib from public.pro_contract_library_clauses where owner_id=p_owner and id=public.pro_contract_uuid(p_input->'libraryClauseId') and not archived;
  if not found then raise exception 'Library clause not available' using errcode='22023';end if;
  return public.pro_contract_list_insert(p_list,public.pro_contract_clause_item(cid,lib.title,lib.body,lib.id),pos);
 end if;
 raise exception 'Invalid clause action' using errcode='22023';
end $$;
create or replace function public.pro_contract_list_keys(p_action text) returns text[]
language sql immutable security invoker set search_path=public,pg_temp as $$
 select case p_action
  when 'clause_put' then array['action','actionId','scope','id','revision','clauseId','position','title','body']
  when 'clause_remove' then array['action','actionId','scope','id','revision','clauseId']
  when 'clause_move' then array['action','actionId','scope','id','revision','clauseId','position']
  when 'clause_insert_library' then array['action','actionId','scope','id','revision','libraryClauseId','clauseId','position'] end $$;

-- ---------------------------------------------------------------- reads (owner)
create or replace function public.pro_contract_library_read(p_actor uuid,p_archived boolean default false) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare clauses jsonb;templates jsonb;counts jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_archived is null then raise exception 'Invalid library query' using errcode='22023';end if;
 select coalesce(jsonb_agg(public.pro_contract_library_clause_json(x)||jsonb_build_object('version',jsonb_array_length(public.pro_contract_library_clause_states(p_actor,x.id))) order by lower(x.title),x.id),'[]'::jsonb) into clauses
  from (select * from public.pro_contract_library_clauses where owner_id=p_actor and archived=p_archived order by lower(title),id limit 201) x;
 select coalesce(jsonb_agg(public.pro_contract_template_json(x,false) order by lower(x.title),x.id),'[]'::jsonb) into templates
  from (select * from public.pro_contract_templates where owner_id=p_actor and archived=p_archived order by lower(title),id limit 201) x;
 select jsonb_build_object('clauses',(select count(*) from public.pro_contract_library_clauses where owner_id=p_actor and not archived),
  'archivedClauses',(select count(*) from public.pro_contract_library_clauses where owner_id=p_actor and archived),
  'templates',(select count(*) from public.pro_contract_templates where owner_id=p_actor and not archived),
  'archivedTemplates',(select count(*) from public.pro_contract_templates where owner_id=p_actor and archived)) into counts;
 return jsonb_build_object('archived',p_archived,'clauses',clauses-200,'templates',templates-200,
  'moreClauses',jsonb_array_length(clauses)>200,'moreTemplates',jsonb_array_length(templates)>200,'counts',counts,'fields',to_jsonb(public.pro_contract_field_keys()));
end $$;
create or replace function public.pro_contract_template_read(p_actor uuid,p_template uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare t public.pro_contract_templates;hist jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_template is null then raise exception 'Invalid template query' using errcode='22023';end if;
 select * into t from public.pro_contract_templates where owner_id=p_actor and id=p_template;
 if not found then return null;end if;
 select coalesce(jsonb_agg(jsonb_build_object('actionId',h.action_id,'action',h.action,'at',h.at) order by h.at desc),'[]'::jsonb) into hist
  from (select * from public.pro_contract_history where owner_id=p_actor and object_kind='template' and object_id=t.id order by at desc limit 30) h;
 return jsonb_build_object('template',public.pro_contract_template_json(t,true),'history',hist);
end $$;
create or replace function public.pro_contracts_read(p_actor uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare w public.pro_work;items jsonb;ests jsonb;tpls jsonb;visible boolean;rcp record;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 then raise exception 'Invalid contract query' using errcode='22023';end if;
 select * into w from public.pro_work where user_id=p_actor and id=p_work;
 if not found then return null;end if;
 select coalesce(jsonb_agg(public.pro_contract_json(c,false) order by c.number desc),'[]'::jsonb) into items
  from (select * from public.pro_contracts where owner_id=p_actor and work_id=p_work order by number desc limit 200) c;
 select coalesce(jsonb_agg(e order by e->>'status',e->>'title'),'[]'::jsonb) into ests
  from (select public.pro_contract_estimate(p_actor,w,r.estimate_id) e from public.pro_project_estimate_rows(p_actor,w) r where r.relation='project') x
  where e->>'status' in('accepted','draft','shared');
 select coalesce(jsonb_agg(public.pro_contract_template_json(t,false) order by lower(t.title),t.id),'[]'::jsonb) into tpls
  from (select * from public.pro_contract_templates where owner_id=p_actor and not archived order by lower(title),id limit 200) t;
 select coalesce(d.show_contracts,false) into visible from public.pro_client_dashboards d where d.owner_id=p_actor and d.work_id=p_work;
 select * into rcp from public.pro_contract_recipient(p_actor,p_work);
 return jsonb_build_object('workId',w.id,'projectName',w.service,'items',items,'estimates',ests,'templates',tpls,
  'clientVisible',coalesce(visible,false),'recipientName',rcp.recipient_name,'fields',to_jsonb(public.pro_contract_field_keys()));
end $$;
create or replace function public.pro_contract_read(p_actor uuid,p_work text,p_contract uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare c public.pro_contracts;w public.pro_work;versions jsonb;hist jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 or p_contract is null then raise exception 'Invalid contract query' using errcode='22023';end if;
 select * into c from public.pro_contracts where owner_id=p_actor and work_id=p_work and id=p_contract;
 if not found then return null;end if;
 select * into w from public.pro_work where user_id=p_actor and id=p_work;
 select coalesce(jsonb_agg(public.pro_contract_version_json(v) order by v.version desc),'[]'::jsonb) into versions
  from public.pro_contract_versions v where v.owner_id=p_actor and v.contract_id=c.id;
 select coalesce(jsonb_agg(jsonb_build_object('actionId',h.action_id,'action',h.action,'at',h.at,'byCustomer',h.actor_id<>p_actor) order by h.at desc),'[]'::jsonb) into hist
  from (select * from public.pro_contract_history where owner_id=p_actor and object_kind='contract' and object_id=c.id order by at desc limit 30) h;
 return jsonb_build_object('contract',public.pro_contract_json(c,true),'estimate',public.pro_contract_estimate(p_actor,w,c.estimate_id),
  'preview',public.pro_contract_preview(c,public.pro_contract_today()),'versions',versions,'history',hist);
end $$;

-- ---------------------------------------------------------------- reads (customer)
create or replace function public.pro_contracts_client_read(p_actor uuid,p_request uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r public.pro_appointment_requests;visible boolean;items jsonb;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_request is null then raise exception 'Invalid contract query' using errcode='22023';end if;
 select * into r from public.pro_appointment_requests where id=p_request and client_user_id=p_actor and work_id is not null;
 if not found then return null;end if;
 select coalesce(d.show_contracts,false) into visible from public.pro_client_dashboards d where d.owner_id=r.owner_id and d.work_id=r.work_id;
 if not coalesce(visible,false) or r.status not in('confirmed','completed') then return jsonb_build_object('visible',false);end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'code',public.pro_contract_code(c.number),'status',c.status,'canRespond',c.status='shared',
   'voidReason',case when c.status='voided' then c.void_reason end,'version',v.version,'contentHash',v.content_hash,'sharedAt',v.shared_at,'content',v.content,
   'response',public.pro_contract_response_json(c.owner_id,c.id,v.version)) order by c.number desc),'[]'::jsonb) into items
  from public.pro_contracts c join public.pro_contract_versions v on v.owner_id=c.owner_id and v.contract_id=c.id and v.version=c.latest_version
  where c.owner_id=r.owner_id and c.work_id=r.work_id and c.status<>'draft' and v.recipient_id=p_actor;
 return jsonb_build_object('visible',true,'contracts',items);
end $$;

-- ---------------------------------------------------------------- writes (owner)
create or replace function public.pro_contract_history_add(p_owner uuid,p_actor uuid,p_action_id uuid,p_kind text,p_object uuid,p_work text,p_action text,p_before jsonb,p_after jsonb) returns void
language sql security invoker set search_path=public,pg_temp as $$
 insert into public.pro_contract_history(owner_id,action_id,actor_id,object_kind,object_id,work_id,action,before_value,after_value) values(p_owner,p_action_id,p_actor,p_kind,p_object,p_work,p_action,p_before,p_after) $$;
create or replace function public.pro_contract_library_apply(p_actor uuid,p_input jsonb,p_aid uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
#variable_conflict use_variable
declare act text:=p_input->>'action';oid uuid;rev integer;lc public.pro_contract_library_clauses;t public.pro_contract_templates;before jsonb;
 title text;body text;descr text;pct numeric;list jsonb:='[]'::jsonb;lib_ids jsonb;e jsonb;
begin
 if act like 'library_clause_%' then
  if act='library_clause_create' then
   perform public.pro_contract_expect(p_input,array['action','actionId','id','title','body']);
   oid:=public.pro_contract_uuid(p_input->'id');title:=public.pro_contract_text(p_input->'title',160,true);body:=public.pro_contract_text(p_input->'body',4000,true,true);
   perform public.pro_contract_check_tokens(title);perform public.pro_contract_check_tokens(body);
   if exists(select 1 from public.pro_contract_library_clauses where id=oid) then raise exception 'Clause exists' using errcode='23505';end if;
   if (select count(*) from public.pro_contract_library_clauses where owner_id=p_actor)>=500 then raise exception 'Too many clauses' using errcode='22023';end if;
   insert into public.pro_contract_library_clauses(owner_id,id,title,body) values(p_actor,oid,title,body) returning * into lc;
  else
   if act='library_clause_update' then perform public.pro_contract_expect(p_input,array['action','actionId','id','revision','title','body']);
   elsif act in('library_clause_archive','library_clause_restore') then perform public.pro_contract_expect(p_input,array['action','actionId','id','revision']);
   else raise exception 'Invalid action' using errcode='22023';end if;
   oid:=public.pro_contract_uuid(p_input->'id');rev:=public.pro_contract_int(p_input->'revision',1,2147483646);
   select * into lc from public.pro_contract_library_clauses where owner_id=p_actor and id=oid for update;
   if not found then raise exception 'Clause not found' using errcode='P0002';end if;
   if lc.revision<>rev then raise exception 'Clause changed' using errcode='40001';end if;
   before:=public.pro_contract_library_clause_json(lc);
   if act='library_clause_update' then
    if lc.archived then raise exception 'Restore the clause first' using errcode='22023';end if;
    title:=public.pro_contract_text(p_input->'title',160,true);body:=public.pro_contract_text(p_input->'body',4000,true,true);
    perform public.pro_contract_check_tokens(title);perform public.pro_contract_check_tokens(body);
    if lc.title=title and lc.body=body then raise exception 'No clause changes' using errcode='22023';end if;
    update public.pro_contract_library_clauses set title=title,body=body,revision=revision+1,updated_at=now() where owner_id=p_actor and id=oid returning * into lc;
   else
    if lc.archived=(act='library_clause_archive') then raise exception 'No clause changes' using errcode='22023';end if;
    update public.pro_contract_library_clauses set archived=(act='library_clause_archive'),revision=revision+1,updated_at=now() where owner_id=p_actor and id=oid returning * into lc;
   end if;
  end if;
  perform public.pro_contract_history_add(p_actor,p_actor,p_aid,'library_clause',lc.id,null,act,before,public.pro_contract_library_clause_json(lc));
  return jsonb_build_object('clause',public.pro_contract_library_clause_json(lc));
 end if;
 -- Templates.
 if act='template_create' then
  perform public.pro_contract_expect(p_input,array['action','actionId','id','title','description','depositPercent','libraryClauseIds']);
  oid:=public.pro_contract_uuid(p_input->'id');title:=public.pro_contract_text(p_input->'title',160,true);descr:=public.pro_contract_text(p_input->'description',500,false,true);
  pct:=public.pro_contract_percent(p_input->'depositPercent');lib_ids:=p_input->'libraryClauseIds';
  if jsonb_typeof(lib_ids)<>'array' or jsonb_array_length(lib_ids)>80 then raise exception 'Invalid clauses' using errcode='22023';end if;
  if (select count(distinct x) from jsonb_array_elements_text(lib_ids) x)<>jsonb_array_length(lib_ids) then raise exception 'Repeated clause' using errcode='22023';end if;
  perform public.pro_contract_check_tokens(title);
  if exists(select 1 from public.pro_contract_templates where id=oid) then raise exception 'Template exists' using errcode='23505';end if;
  if (select count(*) from public.pro_contract_templates where owner_id=p_actor)>=200 then raise exception 'Too many templates' using errcode='22023';end if;
  for e in select value from jsonb_array_elements(lib_ids) loop
   select * into lc from public.pro_contract_library_clauses where owner_id=p_actor and id=public.pro_contract_uuid(e) and not archived;
   if not found then raise exception 'Library clause not available' using errcode='22023';end if;
   list:=public.pro_contract_list_insert(list,public.pro_contract_clause_item(gen_random_uuid(),lc.title,lc.body,lc.id),jsonb_array_length(list)+1);
  end loop;
  insert into public.pro_contract_templates(owner_id,id,title,description,deposit_percent,clauses) values(p_actor,oid,title,descr,pct,list) returning * into t;
 else
  if act='template_update' then perform public.pro_contract_expect(p_input,array['action','actionId','id','revision','title','description','depositPercent']);
  elsif act in('template_archive','template_restore') then perform public.pro_contract_expect(p_input,array['action','actionId','id','revision']);
  elsif act in('clause_put','clause_remove','clause_move','clause_insert_library') then perform public.pro_contract_expect(p_input,public.pro_contract_list_keys(act));
  else raise exception 'Invalid action' using errcode='22023';end if;
  oid:=public.pro_contract_uuid(p_input->'id');rev:=public.pro_contract_int(p_input->'revision',1,2147483646);
  select * into t from public.pro_contract_templates where owner_id=p_actor and id=oid for update;
  if not found then raise exception 'Template not found' using errcode='P0002';end if;
  if t.revision<>rev then raise exception 'Template changed' using errcode='40001';end if;
  before:=public.pro_contract_template_json(t,true);
  if act in('template_archive','template_restore') then
   if t.archived=(act='template_archive') then raise exception 'No template changes' using errcode='22023';end if;
   update public.pro_contract_templates set archived=(act='template_archive'),revision=revision+1,updated_at=now() where owner_id=p_actor and id=oid returning * into t;
  else
   if t.archived then raise exception 'Restore the template first' using errcode='22023';end if;
   if act='template_update' then
    title:=public.pro_contract_text(p_input->'title',160,true);descr:=public.pro_contract_text(p_input->'description',500,false,true);pct:=public.pro_contract_percent(p_input->'depositPercent');
    perform public.pro_contract_check_tokens(title);
    if t.title=title and t.description is not distinct from descr and t.deposit_percent is not distinct from pct then raise exception 'No template changes' using errcode='22023';end if;
    update public.pro_contract_templates set title=title,description=descr,deposit_percent=pct,revision=revision+1,updated_at=now() where owner_id=p_actor and id=oid returning * into t;
   else
    update public.pro_contract_templates set clauses=public.pro_contract_list_edit(p_actor,t.clauses,p_input),revision=revision+1,updated_at=now() where owner_id=p_actor and id=oid returning * into t;
   end if;
  end if;
 end if;
 perform public.pro_contract_history_add(p_actor,p_actor,p_aid,'template',t.id,null,act,before,public.pro_contract_template_json(t,true));
 return jsonb_build_object('template',public.pro_contract_template_json(t,true));
end $$;
create or replace function public.pro_contract_apply(p_actor uuid,p_input jsonb,p_aid uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
#variable_conflict use_variable
declare act text:=p_input->>'action';oid uuid;rev integer;c public.pro_contracts;w public.pro_work;t public.pro_contract_templates;before jsonb;wid text;
 title text;lang text;est uuid;pct numeric;tpl uuid;num integer;est_json jsonb;prev jsonb;rcp record;content jsonb;ver public.pro_contract_versions;today date;reason text;
begin
 if act='contract_create' then
  perform public.pro_contract_expect(p_input,array['action','actionId','workId','id','templateId','title','language','estimateId','depositPercent']);
  if jsonb_typeof(p_input->'workId')<>'string' or length(p_input->>'workId') not between 1 and 160 then raise exception 'Invalid job' using errcode='22023';end if;
  wid:=p_input->>'workId';oid:=public.pro_contract_uuid(p_input->'id');tpl:=public.pro_contract_uuid(p_input->'templateId',true);
  title:=public.pro_contract_text(p_input->'title',160,false);est:=public.pro_contract_uuid(p_input->'estimateId',true);
  if jsonb_typeof(p_input->'language')<>'string' or p_input->>'language' not in('es','en') then raise exception 'Invalid language' using errcode='22023';end if;
  lang:=p_input->>'language';
  select * into w from public.pro_work where user_id=p_actor and id=wid for update;
  if not found then raise exception 'Forbidden' using errcode='42501';end if;
  if tpl is not null then
   select * into t from public.pro_contract_templates where owner_id=p_actor and id=tpl and not archived;
   if not found then raise exception 'Template not available' using errcode='22023';end if;
  end if;
  pct:=case when jsonb_typeof(p_input->'depositPercent')='null' and tpl is not null then t.deposit_percent else public.pro_contract_percent(p_input->'depositPercent') end;
  title:=coalesce(title,t.title,case when lang='en' then 'Service agreement' else 'Contrato de servicios' end);
  perform public.pro_contract_check_tokens(title);
  if est is not null and coalesce(public.pro_contract_estimate(p_actor,w,est)->>'status','') not in('accepted','draft','shared') then raise exception 'Estimate not linkable' using errcode='22023';end if;
  if exists(select 1 from public.pro_contracts where id=oid) then raise exception 'Contract exists' using errcode='23505';end if;
  insert into public.pro_contract_counters(owner_id,last_number) values(p_actor,1) on conflict(owner_id) do update set last_number=public.pro_contract_counters.last_number+1 returning last_number into num;
  -- Template clauses get fresh ids so the contract and the template evolve independently.
  insert into public.pro_contracts(owner_id,id,work_id,number,title,language,template_id,estimate_id,deposit_percent,clauses)
   values(p_actor,oid,wid,num,title,lang,tpl,est,pct,coalesce((select jsonb_agg(e||jsonb_build_object('id',gen_random_uuid()) order by o) from jsonb_array_elements(t.clauses) with ordinality a(e,o)),'[]'::jsonb))
   returning * into c;
 else
  if act='contract_update' then perform public.pro_contract_expect(p_input,array['action','actionId','id','revision','title','language','estimateId','depositPercent']);
  elsif act in('share','withdraw') then perform public.pro_contract_expect(p_input,array['action','actionId','id','revision']);
  elsif act='void' then perform public.pro_contract_expect(p_input,array['action','actionId','id','revision','reason']);
  elsif act in('clause_put','clause_remove','clause_move','clause_insert_library') then perform public.pro_contract_expect(p_input,public.pro_contract_list_keys(act));
  else raise exception 'Invalid action' using errcode='22023';end if;
  oid:=public.pro_contract_uuid(p_input->'id');rev:=public.pro_contract_int(p_input->'revision',1,2147483646);
  select * into c from public.pro_contracts where owner_id=p_actor and id=oid for update;
  if not found then raise exception 'Contract not found' using errcode='P0002';end if;
  select * into w from public.pro_work where user_id=p_actor and id=c.work_id for update;
  if c.revision<>rev then raise exception 'Contract changed' using errcode='40001';end if;
  before:=public.pro_contract_json(c,true);
  if act in('contract_update','clause_put','clause_remove','clause_move','clause_insert_library','share') and c.status<>'draft' then raise exception 'Only drafts can change' using errcode='22023';end if;
  if act='contract_update' then
   title:=public.pro_contract_text(p_input->'title',160,true);est:=public.pro_contract_uuid(p_input->'estimateId',true);pct:=public.pro_contract_percent(p_input->'depositPercent');
   if jsonb_typeof(p_input->'language')<>'string' or p_input->>'language' not in('es','en') then raise exception 'Invalid language' using errcode='22023';end if;
   lang:=p_input->>'language';perform public.pro_contract_check_tokens(title);
   if est is not null and est is distinct from c.estimate_id and coalesce(public.pro_contract_estimate(p_actor,w,est)->>'status','') not in('accepted','draft','shared') then raise exception 'Estimate not linkable' using errcode='22023';end if;
   if c.title=title and c.language=lang and c.estimate_id is not distinct from est and c.deposit_percent is not distinct from pct then raise exception 'No contract changes' using errcode='22023';end if;
   update public.pro_contracts set title=title,language=lang,estimate_id=est,deposit_percent=pct,revision=revision+1,updated_at=now() where owner_id=p_actor and id=oid returning * into c;
  elsif act in('clause_put','clause_remove','clause_move','clause_insert_library') then
   update public.pro_contracts set clauses=public.pro_contract_list_edit(p_actor,c.clauses,p_input),revision=revision+1,updated_at=now() where owner_id=p_actor and id=oid returning * into c;
  elsif act='share' then
   if jsonb_array_length(c.clauses)=0 then raise exception 'Add at least one clause' using errcode='22023';end if;
   if c.estimate_id is not null and coalesce(public.pro_contract_estimate(p_actor,w,c.estimate_id)->>'status','') not in('accepted','draft','shared') then raise exception 'Estimate not linkable' using errcode='22023';end if;
   select * into rcp from public.pro_contract_recipient(p_actor,c.work_id);
   if rcp.recipient_id is null then raise exception 'No linked customer' using errcode='22023';end if;
   today:=public.pro_contract_today();prev:=public.pro_contract_preview(c,today);
   if jsonb_array_length(prev->'missingFields')>0 then raise exception 'Merge fields without data' using errcode='22023';end if;
   est_json:=public.pro_contract_estimate(p_actor,w,c.estimate_id);
   content:=jsonb_build_object('code',public.pro_contract_code(c.number),'title',prev->'title','language',c.language,'sharedOn',today,
    'company',jsonb_build_object('name',prev->'fields'->'empresa.nombre','identification',prev->'fields'->'empresa.identificacion'),
    'client',jsonb_build_object('name',prev->'fields'->'cliente.nombre','identification',prev->'fields'->'cliente.identificacion'),
    'project',jsonb_build_object('name',prev->'fields'->'proyecto.nombre','address',prev->'fields'->'proyecto.direccion'),
    'estimate',case when est_json is not null then est_json-'id' end,
    'depositPercent',c.deposit_percent,
    'clauses',(select jsonb_agg(jsonb_build_object('position',o,'title',e->>'title','body',e->>'body') order by o) from jsonb_array_elements(prev->'clauses') with ordinality a(e,o)));
   insert into public.pro_contract_versions(owner_id,contract_id,version,id,recipient_id,recipient_name,content,content_hash)
    values(p_actor,c.id,coalesce(c.latest_version,0)+1,gen_random_uuid(),rcp.recipient_id,rcp.recipient_name,content,encode(sha256(convert_to(content::text,'UTF8')),'hex')) returning * into ver;
   update public.pro_contracts set status='shared',latest_version=ver.version,revision=revision+1,updated_at=now() where owner_id=p_actor and id=oid returning * into c;
  elsif act='withdraw' then
   if c.status not in('shared','declined') then raise exception 'Only shared or declined contracts return to draft' using errcode='22023';end if;
   update public.pro_contracts set status='draft',revision=revision+1,updated_at=now() where owner_id=p_actor and id=oid returning * into c;
  elsif act='void' then
   reason:=public.pro_contract_text(p_input->'reason',300,true);
   if c.status='voided' then raise exception 'Already voided' using errcode='22023';end if;
   update public.pro_contracts set status='voided',void_reason=reason,voided_at=clock_timestamp(),revision=revision+1,updated_at=now() where owner_id=p_actor and id=oid returning * into c;
  end if;
 end if;
 perform public.pro_contract_history_add(p_actor,p_actor,p_aid,'contract',c.id,c.work_id,act,before,public.pro_contract_json(c,true));
 return jsonb_build_object('contract',public.pro_contract_json(c,true))||case when act='share' then jsonb_build_object('version',public.pro_contract_version_json(ver)) else '{}'::jsonb end;
end $$;
create or replace function public.pro_contracts_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;aid uuid;receipt public.pro_contract_actions;result jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' then raise exception 'Invalid contract action' using errcode='22023';end if;
 act:=p_input->>'action';aid:=public.pro_contract_uuid(p_input->'actionId');
 if act in('clause_put','clause_remove','clause_move','clause_insert_library') and (jsonb_typeof(p_input->'scope') is distinct from 'string' or p_input->>'scope' not in('template','contract')) then
  raise exception 'Invalid scope' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-contract-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_contract_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-contracts:'||p_actor::text,0));
 if act like 'library_clause_%' or act like 'template_%' or (act like 'clause_%' and p_input->>'scope'='template') then result:=public.pro_contract_library_apply(p_actor,p_input,aid);
 elsif act in('contract_create','contract_update','share','withdraw','void') or (act like 'clause_%' and p_input->>'scope'='contract') then result:=public.pro_contract_apply(p_actor,p_input,aid);
 else raise exception 'Invalid contract action' using errcode='22023';end if;
 insert into public.pro_contract_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- writes (customer)
create or replace function public.pro_contracts_client_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;aid uuid;receipt public.pro_contract_actions;r public.pro_appointment_requests;c public.pro_contracts;v public.pro_contract_versions;
 visible boolean;ver integer;hash text;typed text;reason text;before jsonb;result jsonb;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' then raise exception 'Invalid response' using errcode='22023';end if;
 act:=p_input->>'action';
 if act='accept' then perform public.pro_contract_expect(p_input,array['action','actionId','requestId','contractId','version','contentHash','typedName']);
 elsif act='decline' then perform public.pro_contract_expect(p_input,array['action','actionId','requestId','contractId','version','contentHash','reason']);
 else raise exception 'Invalid response' using errcode='22023';end if;
 aid:=public.pro_contract_uuid(p_input->'actionId');ver:=public.pro_contract_int(p_input->'version',1,999999);
 if jsonb_typeof(p_input->'contentHash') is distinct from 'string' or not (p_input->>'contentHash')~'^[a-f0-9]{64}$' then raise exception 'Invalid hash' using errcode='22023';end if;
 hash:=p_input->>'contentHash';
 if act='accept' then typed:=public.pro_contract_text(p_input->'typedName',160,true);if length(typed)<2 then raise exception 'Invalid name' using errcode='22023';end if;
 else reason:=public.pro_contract_text(p_input->'reason',500,true,true);end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-contract-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_contract_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 select * into r from public.pro_appointment_requests where id=public.pro_contract_uuid(p_input->'requestId') and client_user_id=p_actor and work_id is not null and status in('confirmed','completed');
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 select coalesce(d.show_contracts,false) into visible from public.pro_client_dashboards d where d.owner_id=r.owner_id and d.work_id=r.work_id;
 if not coalesce(visible,false) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-contracts:'||r.owner_id::text,0));
 select * into c from public.pro_contracts where owner_id=r.owner_id and work_id=r.work_id and id=public.pro_contract_uuid(p_input->'contractId') for update;
 if not found or c.latest_version is null then raise exception 'Forbidden' using errcode='42501';end if;
 select * into v from public.pro_contract_versions where owner_id=c.owner_id and contract_id=c.id and version=c.latest_version;
 if v.recipient_id<>p_actor then raise exception 'Forbidden' using errcode='42501';end if;
 if c.status='draft' then raise exception 'Forbidden' using errcode='42501';end if;
 -- The customer must answer exactly the version (and text) currently shared.
 if c.status<>'shared' or v.version<>ver or v.content_hash<>hash then raise exception 'Contract changed' using errcode='40001';end if;
 before:=public.pro_contract_json(c,false);
 insert into public.pro_contract_responses(version_id,owner_id,contract_id,version,actor_id,action,typed_name,reason,content_hash) values(v.id,c.owner_id,c.id,v.version,p_actor,act,typed,reason,v.content_hash);
 update public.pro_contracts set status=case when act='accept' then 'accepted' else 'declined' end,revision=revision+1,updated_at=now() where owner_id=c.owner_id and id=c.id returning * into c;
 perform public.pro_contract_history_add(c.owner_id,p_actor,aid,'contract',c.id,c.work_id,act,before,public.pro_contract_json(c,false));
 result:=jsonb_build_object('contract',jsonb_build_object('id',c.id,'code',public.pro_contract_code(c.number),'status',c.status,'canRespond',false,'voidReason',null,
  'version',v.version,'contentHash',v.content_hash,'sharedAt',v.shared_at,'content',v.content,'response',public.pro_contract_response_json(c.owner_id,c.id,v.version)));
 insert into public.pro_contract_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- immutability and access
create or replace function public.pro_contract_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Contract versions, responses, history and receipts are immutable' using errcode='23514';end $$;
drop trigger if exists pro_contract_version_immutable on public.pro_contract_versions;
create trigger pro_contract_version_immutable before update on public.pro_contract_versions for each row execute function public.pro_contract_immutable();
drop trigger if exists pro_contract_response_immutable on public.pro_contract_responses;
create trigger pro_contract_response_immutable before update on public.pro_contract_responses for each row execute function public.pro_contract_immutable();
drop trigger if exists pro_contract_history_immutable on public.pro_contract_history;
create trigger pro_contract_history_immutable before update on public.pro_contract_history for each row execute function public.pro_contract_immutable();
drop trigger if exists pro_contract_action_immutable on public.pro_contract_actions;
create trigger pro_contract_action_immutable before update on public.pro_contract_actions for each row execute function public.pro_contract_immutable();

alter table public.pro_contract_library_clauses enable row level security;
alter table public.pro_contract_templates enable row level security;
alter table public.pro_contract_counters enable row level security;
alter table public.pro_contracts enable row level security;
alter table public.pro_contract_versions enable row level security;
alter table public.pro_contract_responses enable row level security;
alter table public.pro_contract_history enable row level security;
alter table public.pro_contract_actions enable row level security;
revoke all on public.pro_contract_library_clauses,public.pro_contract_templates,public.pro_contract_counters,public.pro_contracts,public.pro_contract_versions,
 public.pro_contract_responses,public.pro_contract_history,public.pro_contract_actions from public,anon,authenticated;
grant select,insert,update,delete on public.pro_contract_library_clauses,public.pro_contract_templates,public.pro_contract_counters,public.pro_contracts,public.pro_contract_versions,
 public.pro_contract_responses,public.pro_contract_history,public.pro_contract_actions to service_role;
do $$
declare f regprocedure;
begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and (p.proname like 'pro\_contract\_%' or p.proname like 'pro\_contracts\_%') loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  if f::text not like 'pro_contract_immutable(%' then execute format('grant execute on function %s to service_role',f);end if;
 end loop;
end $$;
commit;
