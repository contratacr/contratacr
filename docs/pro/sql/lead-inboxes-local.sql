-- LOCAL PRO ONLY. Lead inboxes: private snooze, CSV import ledger, inbox reader and funnel.
-- Reuses the existing private writers (pro_lead_origin_create, pro_lead_private_core_mutate,
-- pro_mutate_catalog). No old function, table, trigger, payload or receipt is changed.
-- Snooze expiry is computed on read in Costa Rica time: there is no cron or backfill.
begin;
create table if not exists public.pro_lead_snoozes(
 owner_id uuid not null references profiles(id) on delete cascade,
 kind text not null check(kind in('manual','request')),
 id uuid not null,
 manual_kind text not null default 'manual' check(manual_kind='manual'),
 manual_id uuid,
 request_id uuid,
 until_date date,
 note text not null default '' check(length(note)<=500),
 active boolean not null default false,
 revision integer not null check(revision>0),
 updated_at timestamptz not null default now(),
 primary key(owner_id,kind,id),
 foreign key(owner_id,manual_kind,manual_id) references pro_lead_center_records(owner_id,kind,id) on delete cascade,
 foreign key(owner_id,request_id) references pro_appointment_requests(owner_id,id) on delete cascade,
 check(case when kind='manual' then manual_id=id and request_id is null else request_id=id and manual_id is null end),
 check(not active or until_date is not null),
 check(until_date is null or until_date between date'2000-01-01' and date'2100-12-31'));
create table if not exists public.pro_lead_snooze_history(
 owner_id uuid not null,kind text not null,id uuid not null,action_id uuid not null,
 action text not null check(action in('snooze','wake')),
 before_state jsonb not null,after_state jsonb not null,at timestamptz not null default now(),
 primary key(owner_id,action_id),
 foreign key(owner_id,kind,id) references pro_lead_snoozes(owner_id,kind,id) on delete cascade);
create index if not exists pro_lead_snooze_history_page on public.pro_lead_snooze_history(owner_id,kind,id,((after_state->>'revision')::integer) desc);
create table if not exists public.pro_lead_inbox_actions(
 owner_id uuid not null references profiles(id) on delete cascade,action_id uuid not null,
 kind text not null check(kind in('snooze','wake','import','undo_import')),
 input jsonb not null,result jsonb not null,at timestamptz not null default now(),
 primary key(owner_id,action_id));
create table if not exists public.pro_lead_imports(
 owner_id uuid not null references profiles(id) on delete cascade,id uuid not null,
 file_name text not null check(length(file_name) between 1 and 160),
 total_rows integer not null check(total_rows between 1 and 200),
 created_leads integer not null default 0,created_clients integer not null default 0,
 reused_clients integer not null default 0,skipped_duplicates integer not null default 0,
 revision integer not null default 1 check(revision>0),
 undone_at timestamptz,undo_action_id uuid,archived_on_undo integer,
 created_at timestamptz not null default now(),
 primary key(owner_id,id),
 check((undone_at is null)=(undo_action_id is null) and (undone_at is null)=(archived_on_undo is null)));
create index if not exists pro_lead_imports_page on public.pro_lead_imports(owner_id,created_at desc,id desc);
create table if not exists public.pro_lead_import_rows(
 owner_id uuid not null,import_id uuid not null,row_number integer not null check(row_number between 1 and 200),
 status text not null check(status in('created','existing_client','duplicate')),
 lead_kind text not null default 'manual' check(lead_kind='manual'),lead_id uuid,client_id text not null,
 client_created boolean not null default false,
 primary key(owner_id,import_id,row_number),
 foreign key(owner_id,import_id) references pro_lead_imports(owner_id,id) on delete cascade,
 foreign key(owner_id,lead_kind,lead_id) references pro_lead_center_records(owner_id,kind,id) on delete cascade,
 check((status='duplicate')=(lead_id is null)),check(not client_created or status='created'));

create or replace function public.pro_lead_inbox_today() returns date language sql stable security invoker set search_path=public,pg_temp as $$select (now() at time zone 'America/Costa_Rica')::date$$;
create or replace function public.pro_lead_snooze_json(p_actor uuid,p_kind text,p_id uuid) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('kind',p_kind,'id',p_id,'revision',coalesce(s.revision,0),'active',coalesce(s.active,false),
  'until',case when s.active then to_char(s.until_date,'YYYY-MM-DD') else null end,'note',case when s.active then s.note else '' end,
  'snoozed',coalesce(s.active and s.until_date>pro_lead_inbox_today(),false),'updatedAt',s.updated_at)
 from(select 1)d left join pro_lead_snoozes s on s.owner_id=p_actor and s.kind=p_kind and s.id=p_id$$;
create or replace function public.pro_lead_snooze_read(p_actor uuid,p_kind text,p_id uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$declare items jsonb;begin
 perform pro_lead_origin_owner(p_actor);perform pro_lead_origin_item(p_actor,p_kind,p_id);
 select coalesce(jsonb_agg(jsonb_build_object('actionId',h.action_id,'action',h.action,'at',h.at,'before',h.before_state,'after',h.after_state) order by (h.after_state->>'revision')::integer desc),'[]') into items
 from(select * from pro_lead_snooze_history where owner_id=p_actor and kind=p_kind and id=p_id order by (after_state->>'revision')::integer desc limit 20)h;
 return jsonb_build_object('snooze',pro_lead_snooze_json(p_actor,p_kind,p_id),'history',items);end $$;
create or replace function public.pro_lead_inbox_action_read(p_actor uuid,p_action uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$declare r pro_lead_inbox_actions;begin
 perform pro_lead_origin_owner(p_actor);select * into r from pro_lead_inbox_actions where owner_id=p_actor and action_id=p_action;
 if not found then return jsonb_build_object('receipt',null);end if;return jsonb_build_object('receipt',jsonb_build_object('kind',r.kind,'input',r.input,'result',r.result));end $$;

-- Snooze/wake: one optimistic revision per lead; archived leads must be restored first.
create or replace function public.pro_lead_inbox_mutate(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;act text;k text;lid uuid;rev integer;prior pro_lead_inbox_actions;s pro_lead_snoozes;had boolean;item jsonb;archived boolean;until_value date;note_value text;before_json jsonb;after_json jsonb;answer jsonb;today date:=pro_lead_inbox_today();begin
 perform pro_lead_origin_owner(p_actor);
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' or jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'kind') is distinct from 'string' or jsonb_typeof(p_input->'id') is distinct from 'string' or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce(p_input->>'revision'~'^[0-9]{1,10}$',false) or (p_input->>'revision')::numeric not between 0 and 2147483646 then raise exception 'Invalid snooze action' using errcode='22023';end if;
 act:=p_input->>'action';k:=p_input->>'kind';aid:=(p_input->>'actionId')::uuid;lid:=(p_input->>'id')::uuid;rev:=(p_input->>'revision')::integer;
 if act not in('snooze','wake') or k not in('manual','request') or (select array_agg(key order by key collate "C") from jsonb_object_keys(p_input)key) is distinct from (case act when 'snooze' then array['action','actionId','id','kind','note','revision','until'] else array['action','actionId','id','kind','revision'] end) then raise exception 'Invalid snooze fields' using errcode='22023';end if;
 if act='snooze' then
  if jsonb_typeof(p_input->'until') is distinct from 'string' or not(p_input->>'until'~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$') or jsonb_typeof(p_input->'note') is distinct from 'string' then raise exception 'Invalid snooze date' using errcode='22023';end if;
  begin until_value:=(p_input->>'until')::date;exception when others then raise exception 'Invalid snooze date' using errcode='22023';end;
  note_value:=btrim(p_input->>'note');if length(note_value)>500 or regexp_replace(note_value,E'[\\n\\r\\t]','','g')~'[[:cntrl:]]' then raise exception 'Invalid snooze note' using errcode='22023';end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));perform pg_advisory_xact_lock(hashtextextended('pro-lead-inbox-action:'||p_actor::text||':'||aid::text,0));perform pg_advisory_xact_lock(hashtextextended('pro-lead-snooze:'||p_actor::text||':'||k||':'||lid::text,0));perform pro_lead_origin_owner(p_actor);
 select * into prior from pro_lead_inbox_actions where owner_id=p_actor and action_id=aid;
 if found then if prior.input is distinct from p_input then raise exception 'Snooze action reused' using errcode='22023';end if;perform pro_lead_origin_item(p_actor,k,lid);return prior.result;end if;
 item:=pro_lead_origin_item(p_actor,k,lid);
 archived:=case when k='manual' then (item->'manual'->>'archived')::boolean else (item->'preference'->>'archived')::boolean end;
 select * into s from pro_lead_snoozes where owner_id=p_actor and kind=k and id=lid for update;had:=found;
 if coalesce(s.revision,0)<>rev then raise exception 'Snooze changed' using errcode='40001';end if;
 before_json:=pro_lead_snooze_json(p_actor,k,lid);
 if act='snooze' then
  if archived then raise exception 'Restore before snoozing' using errcode='40001';end if;
  if until_value<=today or until_value>today+366 then raise exception 'Snooze date must be after today and within a year' using errcode='22023';end if;
  if rev>=2147483646 then raise exception 'Snooze revision exhausted' using errcode='40001';end if;
  insert into pro_lead_snoozes(owner_id,kind,id,manual_id,request_id,until_date,note,active,revision) values(p_actor,k,lid,case when k='manual' then lid end,case when k='request' then lid end,until_value,note_value,true,rev+1)
  on conflict(owner_id,kind,id) do update set until_date=excluded.until_date,note=excluded.note,active=true,revision=excluded.revision,updated_at=now();
 else
  if not had or not s.active then raise exception 'Lead is not snoozed' using errcode='40001';end if;
  update pro_lead_snoozes set active=false,revision=revision+1,updated_at=now() where owner_id=p_actor and kind=k and id=lid;
 end if;
 after_json:=pro_lead_snooze_json(p_actor,k,lid);
 insert into pro_lead_snooze_history(owner_id,kind,id,action_id,action,before_state,after_state) values(p_actor,k,lid,aid,act,before_json,after_json);
 answer:=jsonb_build_object('action',act,'snooze',after_json,'before',before_json);
 insert into pro_lead_inbox_actions(owner_id,action_id,kind,input,result) values(p_actor,aid,act,p_input,answer);return answer;end $$;

-- Deterministic RFC 4122 version-4 shaped identity for each child of one import action.
create or replace function public.pro_lead_import_uuid(p_seed text) returns uuid language sql immutable security invoker set search_path=public,pg_temp as $$
 select (substr(h,1,12)||'4'||substr(h,14,3)||substr('89ab',(get_byte(decode(substr(h,17,2),'hex'),0)%4)+1,1)||substr(h,18,15))::uuid from(select md5(p_seed)h)x$$;
-- Phone comparison key: digits only; Costa Rica country prefix 506 is dropped from 11 digits.
create or replace function public.pro_lead_import_phone_key(p text) returns text language sql immutable security invoker set search_path=public,pg_temp as $$
 select case when length(d)=11 and left(d,3)='506' then right(d,8) when length(d) between 8 and 15 then d else '' end from(select regexp_replace(coalesce(p,''),'[^0-9]','','g')d)x$$;
-- Row analysis only compares with this owner's own customers and requests.
create or replace function public.pro_lead_import_analyze(p_actor uuid,p_rows jsonb) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r jsonb;n integer:=0;result jsonb:='[]';errs text[];name_v text;email_v text;phone_v text;service_v text;type_v text;channel_v text;address_v text;desc_v text;ekey text;pkey text;seen_e text[]:='{}';seen_p text[]:='{}';c pro_clients;matched boolean;status_v text;channel_id text;channel_rev integer;begin
 perform pro_lead_origin_owner(p_actor);
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 200 then raise exception 'Invalid import rows' using errcode='22023';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  n:=n+1;
  if jsonb_typeof(r) is distinct from 'object' or (select array_agg(key order by key collate "C") from jsonb_object_keys(r)key) is distinct from array['address','channel','description','email','name','phone','projectType','service'] or exists(select 1 from jsonb_each(r)e where jsonb_typeof(e.value)<>'string') then raise exception 'Invalid import row' using errcode='22023';end if;
  errs:='{}';name_v:=btrim(r->>'name');email_v:=lower(btrim(r->>'email'));phone_v:=btrim(r->>'phone');service_v:=btrim(r->>'service');type_v:=btrim(r->>'projectType');channel_v:=btrim(r->>'channel');address_v:=btrim(r->>'address');desc_v:=btrim(r->>'description');
  if name_v='' then errs:=errs||'name_required'::text;elsif length(name_v)>160 then errs:=errs||'name_too_long'::text;end if;
  if service_v='' then errs:=errs||'service_required'::text;elsif length(service_v)>160 then errs:=errs||'service_too_long'::text;end if;
  if email_v='' and phone_v='' then errs:=errs||'contact_required'::text;end if;
  if email_v<>'' and(length(email_v)>254 or email_v!~'^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')then errs:=errs||'email_invalid'::text;end if;
  if phone_v<>'' and(length(phone_v)>30 or phone_v!~'^[+0-9 ().-]+$' or length(regexp_replace(phone_v,'[^0-9]','','g'))not between 8 and 15)then errs:=errs||'phone_invalid'::text;end if;
  if length(type_v)>80 then errs:=errs||'project_type_too_long'::text;end if;
  if length(address_v)>500 then errs:=errs||'address_too_long'::text;end if;
  if length(desc_v)>2000 then errs:=errs||'description_too_long'::text;end if;
  if (name_v||email_v||phone_v||service_v||type_v||channel_v||address_v)~'[[:cntrl:]]' or regexp_replace(desc_v,E'[\\n\\r\\t]','','g')~'[[:cntrl:]]' then errs:=errs||'invalid_characters'::text;end if;
  ekey:=case when email_v<>'' and not('email_invalid'=any(errs)) then email_v else '' end;pkey:=case when phone_v<>'' and not('phone_invalid'=any(errs)) then pro_lead_import_phone_key(phone_v) else '' end;
  if ekey<>'' and ekey=any(seen_e) or pkey<>'' and pkey=any(seen_p) then errs:=errs||'duplicate_in_file'::text;end if;
  if ekey<>'' then seen_e:=seen_e||ekey;end if;if pkey<>'' then seen_p:=seen_p||pkey;end if;
  channel_id:=null;channel_rev:=null;
  if channel_v<>'' then select x.id,x.revision into channel_id,channel_rev from pro_lead_origin_catalog(p_actor)x where not x.archived and lower(channel_v)=any(pro_lead_origin_name_aliases(x.id,x.name,x.custom_name)) order by x.builtin desc,x.id limit 1;if channel_id is null then errs:=errs||'channel_unknown'::text;end if;end if;
  matched:=false;
  if ekey<>'' or pkey<>'' then
   select * into c from pro_clients pc where pc.user_id=p_actor and(ekey<>'' and lower(btrim(pc.email))=ekey or pkey<>'' and pro_lead_import_phone_key(pc.phone)=pkey) order by(ekey<>'' and lower(btrim(pc.email))=ekey) desc,pc.archived,pc.position limit 1;matched:=found;
  end if;
  status_v:='new';
  if matched then
   status_v:='existing_client';if c.archived then errs:=errs||'client_archived'::text;end if;
   if service_v<>'' and(exists(select 1 from pro_lead_center_records l where l.owner_id=p_actor and l.kind='manual' and l.client_id=c.id and not l.archived and lower(btrim(l.title))=lower(service_v))
    or exists(select 1 from pro_appointment_requests q left join pro_lead_center_records pref on pref.owner_id=p_actor and pref.kind='request' and pref.id=q.id where q.owner_id=p_actor and c.id='reservation-'||q.client_user_id::text and not coalesce(pref.archived,false) and lower(btrim(q.service))=lower(service_v))) then status_v:='duplicate';end if;
  end if;
  if cardinality(errs)>0 then status_v:='error';end if;
  result:=result||jsonb_build_array(jsonb_build_object('row',n,'status',status_v,'errors',to_jsonb(errs),'name',left(name_v,160),'service',left(service_v,160),
   'client',case when matched then jsonb_build_object('id',c.id,'name',c.name,'archived',c.archived) else null end,
   'channel',case when channel_id is null then null else jsonb_build_object('id',channel_id,'revision',channel_rev) end));
 end loop;return result;end $$;
create or replace function public.pro_lead_import_summary(p_analysis jsonb) returns jsonb language sql immutable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('total',count(*),'new',count(*) filter(where a->>'status'='new'),'existingClient',count(*) filter(where a->>'status'='existing_client'),'duplicate',count(*) filter(where a->>'status'='duplicate'),'error',count(*) filter(where a->>'status'='error')) from jsonb_array_elements(p_analysis)a$$;
create or replace function public.pro_lead_import_preview(p_actor uuid,p_rows jsonb) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$declare analysis jsonb;begin
 analysis:=pro_lead_import_analyze(p_actor,p_rows);return jsonb_build_object('rows',analysis,'summary',pro_lead_import_summary(analysis));end $$;
create or replace function public.pro_lead_import_json(p_actor uuid,p_id uuid) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',i.id,'fileName',i.file_name,'totalRows',i.total_rows,'createdLeads',i.created_leads,'createdClients',i.created_clients,'reusedClients',i.reused_clients,'skippedDuplicates',i.skipped_duplicates,'revision',i.revision,'createdAt',i.created_at,'undoneAt',i.undone_at,'archivedOnUndo',i.archived_on_undo,
  'activeLeads',(select count(*) from pro_lead_import_rows x join pro_lead_center_records l on l.owner_id=x.owner_id and l.kind='manual' and l.id=x.lead_id where x.owner_id=i.owner_id and x.import_id=i.id and not l.archived))
 from pro_lead_imports i where i.owner_id=p_actor and i.id=p_id$$;
create or replace function public.pro_lead_imports_read(p_actor uuid,p_after uuid default null) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$declare anchor timestamptz;items jsonb;next_id uuid;begin
 perform pro_lead_origin_owner(p_actor);
 if p_after is not null then select created_at into anchor from pro_lead_imports where owner_id=p_actor and id=p_after;if not found then raise exception 'Import history changed' using errcode='40001';end if;end if;
 select coalesce(jsonb_agg(pro_lead_import_json(p_actor,x.id) order by x.created_at desc,x.id desc),'[]') into items from(select id,created_at from pro_lead_imports where owner_id=p_actor and(p_after is null or(created_at,id)<(anchor,p_after)) order by created_at desc,id desc limit 21)x;
 if jsonb_array_length(items)>20 then next_id:=(items->19->>'id')::uuid;items:=items-20;end if;
 return jsonb_build_object('items',items,'nextCursor',next_id,'total',(select count(*) from pro_lead_imports where owner_id=p_actor));end $$;

-- Atomic CSV import and safe undo. Undo archives (never deletes) the leads that this import
-- created and that are still active and untouched; customers created by the import are kept.
create or replace function public.pro_lead_import_mutate(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;act text;prior pro_lead_inbox_actions;analysis jsonb;a jsonb;rows_v jsonb;row_v jsonb;v integer;new_clients jsonb:='[]';cid text;lid uuid;cat integer;created integer:=0;made integer:=0;reused integer:=0;skipped integer:=0;answer jsonb;imp pro_lead_imports;fname text;iid uuid;rev integer;archived_count integer:=0;rec pro_lead_center_records;ir pro_lead_import_rows;n text;begin
 perform pro_lead_origin_owner(p_actor);
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' or jsonb_typeof(p_input->'actionId') is distinct from 'string' then raise exception 'Invalid import action' using errcode='22023';end if;
 act:=p_input->>'action';aid:=(p_input->>'actionId')::uuid;
 if act not in('import','undo_import') or (select array_agg(key order by key collate "C") from jsonb_object_keys(p_input)key) is distinct from (case act when 'import' then array['action','actionId','fileName','rows'] else array['action','actionId','importId','revision'] end) then raise exception 'Invalid import fields' using errcode='22023';end if;
 if act='import' then
  if jsonb_typeof(p_input->'fileName') is distinct from 'string' then raise exception 'Invalid file name' using errcode='22023';end if;fname:=btrim(p_input->>'fileName');
  if length(fname) not between 1 and 160 or fname~'[[:cntrl:]]' then raise exception 'Invalid file name' using errcode='22023';end if;
  rows_v:=p_input->'rows';if jsonb_typeof(rows_v) is distinct from 'array' or jsonb_array_length(rows_v) not between 1 and 200 then raise exception 'Invalid import rows' using errcode='22023';end if;
 else
  if jsonb_typeof(p_input->'importId') is distinct from 'string' or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce(p_input->>'revision'~'^[0-9]{1,10}$',false) or (p_input->>'revision')::numeric not between 1 and 2147483646 then raise exception 'Invalid undo' using errcode='22023';end if;
  iid:=(p_input->>'importId')::uuid;rev:=(p_input->>'revision')::integer;
 end if;
 -- Owner lock first, as every private lead/customer writer; then catalogue locks.
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));perform pg_advisory_xact_lock(hashtextextended('pro-lead-inbox-action:'||p_actor::text||':'||aid::text,0));perform pg_advisory_xact_lock(hashtextextended('pro-request-pipeline-catalog:'||p_actor::text,0));perform pg_advisory_xact_lock(hashtextextended('pro-lead-origin-catalog:'||p_actor::text,0));perform pro_lead_origin_owner(p_actor);
 select * into prior from pro_lead_inbox_actions where owner_id=p_actor and action_id=aid;
 if found then if prior.input is distinct from p_input then raise exception 'Import action reused' using errcode='22023';end if;return prior.result;end if;
 if act='import' then
  if exists(select 1 from pro_lead_imports where owner_id=p_actor and id=aid) then raise exception 'Import identity used' using errcode='40001';end if;
  analysis:=pro_lead_import_analyze(p_actor,rows_v);
  if exists(select 1 from jsonb_array_elements(analysis)x,jsonb_array_elements_text(x->'errors')e where e not in('channel_unknown','client_archived')) then raise exception 'Import has invalid rows' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements(analysis)x where x->>'status'='error') then raise exception 'Import data changed; review the preview' using errcode='40001';end if;
  for a in select value from jsonb_array_elements(analysis) loop
   if a->>'status'='new' then n:=a->>'row';row_v:=rows_v->((a->>'row')::integer-1);
    new_clients:=new_clients||jsonb_build_array(jsonb_build_object('id',pro_lead_import_uuid(aid::text||':client:'||n)::text,'name',btrim(row_v->>'name'),'email',lower(btrim(row_v->>'email')),'phone',btrim(row_v->>'phone'),'notes','','archived',false));
   end if;
  end loop;
  if jsonb_array_length(new_clients)>0 then select revision into v from pro_workspace_core where user_id=p_actor for update;perform pro_mutate_catalog(p_actor,'clients',new_clients,coalesce(v,0),'[]'::jsonb,true);made:=jsonb_array_length(new_clients);end if;
  insert into pro_lead_imports(owner_id,id,file_name,total_rows) values(p_actor,aid,fname,jsonb_array_length(rows_v));
  cat:=(pro_lead_origin_stage_catalog(p_actor)->>'revision')::integer;
  for a in select value from jsonb_array_elements(analysis) loop
   n:=a->>'row';row_v:=rows_v->((a->>'row')::integer-1);
   cid:=case when a->>'status'='new' then pro_lead_import_uuid(aid::text||':client:'||n)::text else a->'client'->>'id' end;
   if a->>'status' in('new','existing_client') then
    lid:=pro_lead_import_uuid(aid::text||':lead:'||n);
    perform pro_lead_origin_create(p_actor,jsonb_build_object('action','create_lead','actionId',pro_lead_import_uuid(aid::text||':parent:'||n),
     'lead',jsonb_build_object('action','create','actionId',pro_lead_import_uuid(aid::text||':core:'||n),'kind','manual','id',lid,'revision',0,'catalogRevision',cat,'clientId',cid,'title',btrim(row_v->>'service'),'description',btrim(row_v->>'description'),'address',btrim(row_v->>'address'),'sourceLabel','',
      'forecast',jsonb_build_object('projectType',btrim(row_v->>'projectType'),'expectedStart',null,'currency','CRC','revenueCents',null,'budgetCents',null,'profitCents',null),'stageMode','automatic','stageId',null),
     'channel',coalesce(a->'channel','null'::jsonb)));
    insert into pro_lead_import_rows(owner_id,import_id,row_number,status,lead_id,client_id,client_created) values(p_actor,aid,n::integer,case when a->>'status'='new' then 'created' else 'existing_client' end,lid,cid,a->>'status'='new');
    created:=created+1;if a->>'status'='existing_client' then reused:=reused+1;end if;
   else
    insert into pro_lead_import_rows(owner_id,import_id,row_number,status,lead_id,client_id) values(p_actor,aid,n::integer,'duplicate',null,cid);skipped:=skipped+1;
   end if;
  end loop;
  update pro_lead_imports set created_leads=created,created_clients=made,reused_clients=reused,skipped_duplicates=skipped where owner_id=p_actor and id=aid;
  perform pro_lead_origin_owner(p_actor);
  answer:=jsonb_build_object('action','import','import',pro_lead_import_json(p_actor,aid),'summary',pro_lead_import_summary(analysis));
 else
  select * into imp from pro_lead_imports where owner_id=p_actor and id=iid for update;
  if not found then raise exception 'Import unavailable' using errcode='P0002';end if;
  if imp.revision<>rev or imp.undone_at is not null then raise exception 'Import changed' using errcode='40001';end if;
  for ir in select * from pro_lead_import_rows where owner_id=p_actor and import_id=iid and lead_id is not null order by row_number loop
   select * into rec from pro_lead_center_records where owner_id=p_actor and kind='manual' and id=ir.lead_id for update;
   -- Only untouched leads are archived: same core revision as created (1), no work/quote link,
   -- follow-up, snooze or channel change after the import. Converted or edited leads are kept.
   if found and not rec.archived and rec.revision=1
    and not exists(select 1 from pro_manual_lead_works w where w.owner_id=p_actor and w.lead_kind='manual' and w.lead_id=ir.lead_id)
    and not exists(select 1 from pro_manual_lead_quotes w where w.owner_id=p_actor and w.lead_kind='manual' and w.lead_id=ir.lead_id)
    and not exists(select 1 from pro_lead_followups w where w.owner_id=p_actor and w.lead_kind='manual' and w.lead_id=ir.lead_id)
    and not exists(select 1 from pro_lead_snoozes w where w.owner_id=p_actor and w.kind='manual' and w.id=ir.lead_id)
    and not exists(select 1 from pro_lead_origin_history w where w.owner_id=p_actor and w.kind='manual' and w.id=ir.lead_id and w.action_id<>pro_lead_import_uuid(iid::text||':parent:'||ir.row_number)) then
    perform pro_lead_private_core_mutate(p_actor,jsonb_build_object('action','archive','actionId',pro_lead_import_uuid(aid::text||':archive:'||ir.row_number),'kind','manual','id',ir.lead_id,'revision',rec.revision));archived_count:=archived_count+1;
   end if;
  end loop;
  update pro_lead_imports set undone_at=now(),undo_action_id=aid,archived_on_undo=archived_count,revision=revision+1 where owner_id=p_actor and id=iid;
  answer:=jsonb_build_object('action','undo_import','import',pro_lead_import_json(p_actor,iid),'archived',archived_count);
 end if;
 insert into pro_lead_inbox_actions(owner_id,action_id,kind,input,result) values(p_actor,aid,act,p_input,answer);return answer;end $$;

-- Inbox reader: same page/context/stage envelope as pro_lead_commercial_read, plus snooze
-- state per row, server counters for every inbox (same main filters) and the service facet.
create or replace function public.pro_lead_inbox_sources(p_actor uuid,p_query text) returns table(kind text,id uuid,created_at timestamptz,effective_stage text,fingerprint text,archived boolean,channel_id text,origin_revision integer,private_client_archived boolean,service_label text,snoozed boolean,snooze_revision integer,created_day date) language plpgsql stable security invoker set search_path=public,pg_temp as $$declare today date:=pro_lead_inbox_today();begin
 perform pro_lead_origin_owner(p_actor);
 return query with raw as materialized(select s.*,false archived from pro_lead_commercial_sources(p_actor,false,p_query)s union all select s.*,true from pro_lead_commercial_sources(p_actor,true,p_query)s)
 select r.kind,r.id,r.created_at,r.effective_stage,r.fingerprint,r.archived,a.channel_id,coalesce(a.revision,0),
  case when r.kind='request' then exists(select 1 from pro_clients c join pro_appointment_requests x on x.owner_id=c.user_id and c.id='reservation-'||x.client_user_id::text where x.owner_id=p_actor and x.id=r.id and c.archived) else false end,
  case when r.kind='manual' then coalesce(nullif(btrim(l.project_type),''),btrim(l.title)) else btrim(q.service) end,
  coalesce(z.active and z.until_date>today,false),coalesce(z.revision,0),(r.created_at at time zone 'America/Costa_Rica')::date
 from raw r left join pro_lead_origin_assignments a on a.owner_id=p_actor and a.kind=r.kind and a.id=r.id
 left join pro_lead_center_records l on r.kind='manual' and l.owner_id=p_actor and l.kind='manual' and l.id=r.id
 left join pro_appointment_requests q on r.kind='request' and q.owner_id=p_actor and q.id=r.id
 left join pro_lead_snoozes z on z.owner_id=p_actor and z.kind=r.kind and z.id=r.id;end $$;
create or replace function public.pro_lead_inbox_read(p_actor uuid,p_box text default 'active',p_stage text default null,p_query text default '',p_service text default null,p_channel text default null,p_from date default null,p_to date default null,p_after text default null,p_snapshot text default null) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare catalog jsonb;answer jsonb;actual_token text;cursor_valid boolean;service_key text:=lower(btrim(coalesce(p_service,'')));begin
 perform pro_lead_origin_owner(p_actor);catalog:=pro_lead_origin_stage_catalog(p_actor);
 if p_box is null or p_box not in('active','snoozed','archived') or p_query is null or length(p_query)>100 or length(coalesce(p_service,''))>160 or p_stage is not null and not exists(select 1 from jsonb_array_elements(catalog->'stages')s where s->>'id'=p_stage) or p_after is not null and p_after!~'^(manual|request):[a-f0-9-]{36}$' or (p_after is null)<>(p_snapshot is null) or p_from is not null and p_from not between date'1900-01-01' and date'2100-12-31' or p_to is not null and p_to not between date'1900-01-01' and date'2100-12-31' or p_from>p_to then raise exception 'Invalid inbox query' using errcode='22023';end if;
 if p_channel is not null and p_channel<>'unspecified' and pro_lead_origin_channel_json(p_actor,p_channel) is null then raise exception 'Invalid attribution filter' using errcode='22023';end if;
 with base as materialized(select * from pro_lead_inbox_sources(p_actor,p_query)),
 filtered as materialized(select b.*,case when b.archived then 'archived' when b.snoozed then 'snoozed' else 'active' end box from base b where(service_key='' or lower(b.service_label)=service_key) and(p_channel is null or p_channel='unspecified' and b.channel_id is null or b.channel_id=p_channel) and(p_from is null or b.created_day>=p_from) and(p_to is null or b.created_day<=p_to)),
 sources as materialized(select * from filtered where box=p_box),
 metadata as(select md5(p_actor::text||p_box||coalesce(p_stage,'all')||p_query||service_key||coalesce(p_channel,'all')||coalesce(p_from::text,'')||coalesce(p_to::text,'')||pro_lead_inbox_today()::text||catalog::text||(select coalesce(jsonb_agg(to_jsonb(c) order by c.id)::text,'[]') from pro_lead_origin_catalog(p_actor)c)||coalesce(string_agg(jsonb_build_array(kind,id,created_at,effective_stage,fingerprint,channel_id,origin_revision,private_client_archived,snooze_revision)::text,',' order by created_at desc,kind,id desc),''))token from sources),
 anchor as(select * from sources where kind=split_part(p_after,':',1) and id=split_part(p_after,':',2)::uuid and(p_stage is null or effective_stage=p_stage)),
 selected as materialized(select * from sources where(p_stage is null or effective_stage=p_stage) and(p_after is null or created_at<(select created_at from anchor) or created_at=(select created_at from anchor) and(kind>(select kind from anchor) or kind=(select kind from anchor) and id<(select id from anchor))) order by created_at desc,kind,id desc limit 21),
 page as(select coalesce(jsonb_agg(pro_lead_origin_item(p_actor,kind,id) order by created_at desc,kind,id desc),'[]'::jsonb)items,
  coalesce(jsonb_agg(pro_lead_commercial_progress(p_actor,kind,id) order by created_at desc,kind,id desc),'[]'::jsonb)stages,
  coalesce(jsonb_agg(pro_lead_origin_get(p_actor,kind,id) order by created_at desc,kind,id desc),'[]'::jsonb)context,
  coalesce(jsonb_agg(pro_lead_snooze_json(p_actor,kind,id) order by created_at desc,kind,id desc),'[]'::jsonb)snoozes
  from(select * from selected order by created_at desc,kind,id desc limit 20)v),
 counts as(select jsonb_agg(jsonb_build_object('stageId',s->>'id','count',(select count(*) from sources where effective_stage=s->>'id')) order by(s->>'position')::integer)items from jsonb_array_elements(catalog->'stages')s),
 inbox as(select jsonb_build_object('active',(select count(*) from filtered where box='active'),'snoozed',(select count(*) from filtered where box='snoozed'),'archived',(select count(*) from filtered where box='archived'),'imports',(select count(*) from pro_lead_imports where owner_id=p_actor),
  'stages',(select jsonb_agg(jsonb_build_object('stageId',s->>'id','count',(select count(*) from filtered f where f.box='active' and f.effective_stage=s->>'id')) order by(s->>'position')::integer) from jsonb_array_elements(catalog->'stages')s))v),
 services as(select coalesce(jsonb_agg(label order by lower(label),label),'[]'::jsonb)v from(select min(service_label)label from base where service_label<>'' group by lower(service_label) order by lower(min(service_label)) limit 100)x)
 select jsonb_build_object('page',jsonb_build_object('catalog',catalog,'items',page.items,'counts',counts.items,'nextCursor',case when(select count(*) from selected)>20 then(select kind||':'||id::text from selected order by created_at desc,kind,id desc offset 19 limit 1)else null end,'snapshotToken',metadata.token),
  'stages',page.stages,'context',page.context,'snoozes',page.snoozes,'inboxes',inbox.v,'services',services.v),metadata.token,(p_after is null or exists(select 1 from anchor))
 into answer,actual_token,cursor_valid from page cross join counts cross join metadata cross join inbox cross join services;
 if p_after is not null and(p_snapshot is null or p_snapshot<>actual_token or not cursor_valid) then raise exception 'Leads changed; refresh before continuing' using errcode='40001';end if;return answer;end $$;

-- Funnel for one Costa Rica period. Conversion is only an explicit, still valid work link:
-- manual -> pro_manual_lead_works with its private work; request -> its non-cancelled work.
create or replace function public.pro_lead_inbox_funnel(p_actor uuid,p_from date,p_to date) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$declare catalog jsonb;answer jsonb;begin
 perform pro_lead_origin_owner(p_actor);catalog:=pro_lead_origin_stage_catalog(p_actor);
 if p_from is null or p_to is null or p_from not between date'1900-01-01' and date'2100-12-31' or p_to not between date'1900-01-01' and date'2100-12-31' or p_from>p_to or p_to-p_from>3660 then raise exception 'Invalid funnel period' using errcode='22023';end if;
 with base as materialized(select b.*,case when b.kind='manual' then exists(select 1 from pro_manual_lead_works m join pro_work w on w.user_id=m.owner_id and w.id=m.work_id_text and w."clientId"=m.source_client_id and w."bookingClientId" is null where m.owner_id=p_actor and m.lead_kind='manual' and m.lead_id=b.id)
   else exists(select 1 from pro_appointment_requests q join pro_work w on w.user_id=p_actor and w.id=q.work_id where q.owner_id=p_actor and q.id=b.id and not w.cancelled) end converted
  from pro_lead_inbox_sources(p_actor,'')b where b.created_day between p_from and p_to)
 select jsonb_build_object('from',to_char(p_from,'YYYY-MM-DD'),'to',to_char(p_to,'YYYY-MM-DD'),'catalog',catalog,'received',count(*),'manual',count(*) filter(where kind='manual'),'request',count(*) filter(where kind='request'),
  'open',count(*) filter(where not archived),'snoozed',count(*) filter(where not archived and snoozed),'archived',count(*) filter(where archived),'converted',count(*) filter(where converted),
  'conversionRate',case when count(*)=0 then null else round(count(*) filter(where converted)*100.0/count(*),1) end,
  'stages',(select jsonb_agg(jsonb_build_object('stageId',s->>'id','count',(select count(*) from base x where not x.archived and x.effective_stage=s->>'id')) order by(s->>'position')::integer) from jsonb_array_elements(catalog->'stages')s))
 into answer from base;return answer;end $$;

create or replace function public.pro_lead_inbox_immutable() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$begin raise exception 'Immutable lead inbox history/receipt' using errcode='23514';end $$;
do $$declare t text;f record;begin
 foreach t in array array['pro_lead_snoozes','pro_lead_snooze_history','pro_lead_inbox_actions','pro_lead_imports','pro_lead_import_rows'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;
 foreach t in array array['pro_lead_snooze_history','pro_lead_inbox_actions','pro_lead_import_rows'] loop execute format('drop trigger if exists pro_lead_inbox_immutable on public.%I',t);execute format('create trigger pro_lead_inbox_immutable before update on public.%I for each row execute function pro_lead_inbox_immutable()',t);end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and(p.proname like 'pro_lead_inbox_%' or p.proname like 'pro_lead_snooze_%' or p.proname like 'pro_lead_import_%' or p.proname='pro_lead_imports_read') loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;end $$;
commit;
notify pgrst,'reload schema';
