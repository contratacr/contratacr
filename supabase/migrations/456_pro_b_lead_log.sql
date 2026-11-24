-- ContrataCR Pro, leads area (2026-11-23): private notes, call log entries and tags of a lead.
-- A lead is either a manual opportunity (pro_lead_center_records kind 'manual') or a ContrataCR appointment request
-- (pro_appointment_requests); both are anchored with real foreign keys so deleting the lead removes its log.
-- Nothing is sent to the customer. Every write is idempotent by actionId; edit/remove are guarded by the entry revision (409).
begin;

create table if not exists public.pro_lead_log(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 id uuid not null,
 action_id uuid not null,
 input jsonb not null,
 kind text not null check(kind in('manual','request')),
 manual_kind text not null default 'manual' check(manual_kind='manual'),
 lead_id uuid not null,
 manual_id uuid,
 request_id uuid,
 entry text not null check(entry in('note','call')),
 outcome text check(outcome in('good_discussion','no_answer','call_later','not_interested')),
 body text not null default '' check(length(body)<=2000),
 revision integer not null default 1 check(revision>0),
 removed boolean not null default false,
 last_action uuid not null,
 last_input jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,id),unique(owner_id,action_id),
 foreign key(owner_id,manual_kind,manual_id) references public.pro_lead_center_records(owner_id,kind,id) on delete cascade,
 foreign key(owner_id,request_id) references public.pro_appointment_requests(owner_id,id) on delete cascade,
 check(case when kind='manual' then manual_id=lead_id and request_id is null else request_id=lead_id and manual_id is null end),
 check((entry='call')=(outcome is not null)),
 check(entry='call' or length(btrim(body))>0));
create index if not exists pro_lead_log_by_lead on public.pro_lead_log(owner_id,lead_id,created_at desc,id desc);

create table if not exists public.pro_lead_tags(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in('manual','request')),
 manual_kind text not null default 'manual' check(manual_kind='manual'),
 lead_id uuid not null,
 manual_id uuid,
 request_id uuid,
 tag_key text not null check(length(tag_key) between 1 and 40),
 tag text not null check(length(btrim(tag)) between 1 and 40),
 created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,lead_id,tag_key),
 foreign key(owner_id,manual_kind,manual_id) references public.pro_lead_center_records(owner_id,kind,id) on delete cascade,
 foreign key(owner_id,request_id) references public.pro_appointment_requests(owner_id,id) on delete cascade,
 check(case when kind='manual' then manual_id=lead_id and request_id is null else request_id=lead_id and manual_id is null end));

alter table public.pro_lead_log enable row level security;
alter table public.pro_lead_tags enable row level security;
revoke all on public.pro_lead_log from public,anon,authenticated;
revoke all on public.pro_lead_tags from public,anon,authenticated;
grant select,insert,update,delete on public.pro_lead_log to service_role;
grant select,insert,update,delete on public.pro_lead_tags to service_role;

create or replace function public.pro_lead_log_json(p public.pro_lead_log) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p.id,'entry',p.entry,'outcome',p.outcome,'body',p.body,'revision',p.revision,'createdAt',p.created_at,'updatedAt',p.updated_at)
$$;

create or replace function public.pro_lead_log_check(p_owner uuid,p_kind text,p_lead uuid) returns void
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if p_kind='manual' then
  if not exists(select 1 from public.pro_lead_center_records where owner_id=p_owner and kind='manual' and id=p_lead) then raise exception 'Opportunity unavailable' using errcode='P0002';end if;
 elsif p_kind='request' then
  if not exists(select 1 from public.pro_appointment_requests where owner_id=p_owner and id=p_lead) then raise exception 'Opportunity unavailable' using errcode='P0002';end if;
 else raise exception 'Invalid lead log fields' using errcode='22023';end if;
end $$;

create or replace function public.pro_lead_log_read(p_owner uuid,p_kind text,p_lead uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 perform public.pro_request_pipeline_owner(p_owner);
 perform public.pro_lead_log_check(p_owner,p_kind,p_lead);
 return jsonb_build_object('kind',p_kind,'leadId',p_lead,
  'items',coalesce((select jsonb_agg(public.pro_lead_log_json(l) order by l.created_at desc,l.id desc) from public.pro_lead_log l where l.owner_id=p_owner and l.lead_id=p_lead and not l.removed),'[]'::jsonb),
  'tags',coalesce((select jsonb_agg(t.tag order by t.tag_key) from public.pro_lead_tags t where t.owner_id=p_owner and t.lead_id=p_lead),'[]'::jsonb));
end $$;

create or replace function public.pro_lead_log_mutate(p_owner uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;keys text[];aid uuid;lid uuid;eid uuid;k text;rev integer;ent text;oc text;bd text;tg text;tk text;rw public.pro_lead_log;cnt integer;
begin
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid lead log action' using errcode='22023';end if;
 perform public.pro_request_pipeline_owner(p_owner);
 act:=p_input->>'action';select array_agg(x order by x) into keys from jsonb_object_keys(p_input) x;
 begin
  k:=p_input->>'kind';lid:=(p_input->>'leadId')::uuid;
  if act='add' then
   if keys is distinct from array['action','actionId','body','entry','id','kind','leadId','outcome'] then raise exception 'Unexpected lead log fields' using errcode='22023';end if;
   aid:=(p_input->>'actionId')::uuid;eid:=(p_input->>'id')::uuid;ent:=p_input->>'entry';
   if ent not in('note','call') or jsonb_typeof(p_input->'body') is distinct from 'string' then raise exception 'Invalid lead log fields' using errcode='22023';end if;
   if ent='call' then
    if jsonb_typeof(p_input->'outcome') is distinct from 'string' or p_input->>'outcome' not in('good_discussion','no_answer','call_later','not_interested') then raise exception 'Invalid lead log fields' using errcode='22023';end if;
    oc:=p_input->>'outcome';
   elsif jsonb_typeof(p_input->'outcome') is distinct from 'null' then raise exception 'Invalid lead log fields' using errcode='22023';end if;
   bd:=btrim(p_input->>'body');
  elsif act in('edit','remove') then
   if act='edit' and keys is distinct from array['action','actionId','body','id','kind','leadId','revision'] then raise exception 'Unexpected lead log fields' using errcode='22023';end if;
   if act='remove' and keys is distinct from array['action','actionId','id','kind','leadId','revision'] then raise exception 'Unexpected lead log fields' using errcode='22023';end if;
   if jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce(p_input->>'revision'~'^[0-9]{1,9}$',false) then raise exception 'Invalid lead log fields' using errcode='22023';end if;
   aid:=(p_input->>'actionId')::uuid;eid:=(p_input->>'id')::uuid;rev:=(p_input->>'revision')::integer;
   if act='edit' then
    if jsonb_typeof(p_input->'body') is distinct from 'string' then raise exception 'Invalid lead log fields' using errcode='22023';end if;
    bd:=btrim(p_input->>'body');
   end if;
  elsif act in('tag_add','tag_remove') then
   if keys is distinct from array['action','kind','leadId','tag'] or jsonb_typeof(p_input->'tag') is distinct from 'string' then raise exception 'Unexpected lead log fields' using errcode='22023';end if;
   tg:=regexp_replace(btrim(p_input->>'tag'),'\s+',' ','g');tk:=lower(tg);
   if char_length(tg) not between 1 and 40 or tg~'[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' then raise exception 'Invalid lead log fields' using errcode='22023';end if;
  else raise exception 'Invalid lead log action' using errcode='22023';end if;
 exception when sqlstate '22023' then raise;
 when others then raise exception 'Invalid lead log fields' using errcode='22023';end;
 if k not in('manual','request') then raise exception 'Invalid lead log fields' using errcode='22023';end if;
 if act in('add','edit') and (char_length(bd)>2000 or p_input->>'body'~'[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]') then raise exception 'Invalid lead log fields' using errcode='22023';end if;
 if act='add' and ent='note' and bd='' then raise exception 'Invalid lead log fields' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-lead-log:'||p_owner::text||':'||lid::text,0));
 perform public.pro_lead_log_check(p_owner,k,lid);
 if act='tag_add' then
  if not exists(select 1 from public.pro_lead_tags where owner_id=p_owner and lead_id=lid and tag_key=tk) then
   select count(*) into cnt from public.pro_lead_tags where owner_id=p_owner and lead_id=lid;
   if cnt>=20 then raise exception 'Too many tags' using errcode='54000';end if;
   insert into public.pro_lead_tags(owner_id,kind,lead_id,manual_id,request_id,tag_key,tag) values(p_owner,k,lid,case when k='manual' then lid end,case when k='request' then lid end,tk,tg);
  end if;
  return public.pro_lead_log_read(p_owner,k,lid);
 elsif act='tag_remove' then
  delete from public.pro_lead_tags where owner_id=p_owner and lead_id=lid and tag_key=tk;
  return public.pro_lead_log_read(p_owner,k,lid);
 elsif act='add' then
  select * into rw from public.pro_lead_log where owner_id=p_owner and action_id=aid;
  if found then
   if rw.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;
   return public.pro_lead_log_read(p_owner,k,lid);
  end if;
  select count(*) into cnt from public.pro_lead_log where owner_id=p_owner and lead_id=lid and not removed;
  if cnt>=200 then raise exception 'Too many entries' using errcode='54000';end if;
  insert into public.pro_lead_log(owner_id,id,action_id,input,kind,lead_id,manual_id,request_id,entry,outcome,body,last_action,last_input)
   values(p_owner,eid,aid,p_input,k,lid,case when k='manual' then lid end,case when k='request' then lid end,ent,oc,bd,aid,p_input);
  return public.pro_lead_log_read(p_owner,k,lid);
 end if;
 select * into rw from public.pro_lead_log where owner_id=p_owner and lead_id=lid and id=eid;
 if not found then raise exception 'Entry unavailable' using errcode='P0002';end if;
 if rw.last_action=aid and rw.last_input=p_input then return public.pro_lead_log_read(p_owner,k,lid);end if;
 if rw.removed or rw.revision<>rev then raise exception 'Entry changed' using errcode='40001';end if;
 if act='edit' then
  if rw.entry='note' and bd='' then raise exception 'Invalid lead log fields' using errcode='22023';end if;
  update public.pro_lead_log set body=bd,revision=revision+1,updated_at=clock_timestamp(),last_action=aid,last_input=p_input where owner_id=p_owner and id=eid;
 else
  update public.pro_lead_log set removed=true,revision=revision+1,updated_at=clock_timestamp(),last_action=aid,last_input=p_input where owner_id=p_owner and id=eid;
 end if;
 return public.pro_lead_log_read(p_owner,k,lid);
end $$;

do $$ declare f record;
begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_lead_log_json','pro_lead_log_check','pro_lead_log_read','pro_lead_log_mutate') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
notify pgrst,'reload schema';
