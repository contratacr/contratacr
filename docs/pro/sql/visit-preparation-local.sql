-- LOCAL PRO ONLY. Additive preparation snapshots and explicit scheduling preferences.
begin;
create table if not exists public.pro_visit_settings(
 owner_id uuid primary key references profiles(id) on delete cascade,
 revision integer not null default 0 check(revision>=0),
 buffer_minutes integer not null default 0 check(buffer_minutes between 0 and 180 and buffer_minutes%15=0),
 notice_minutes integer not null default 15 check(notice_minutes between 15 and 10080 and notice_minutes%15=0),
 questions jsonb not null default '[]' check(jsonb_typeof(questions)='array' and jsonb_array_length(questions)<=3)
);
create table if not exists public.pro_visit_preparation(
 request_id uuid primary key references pro_appointment_requests(id) on delete cascade,
 questions jsonb not null default '[]',policy_revision integer not null,
 revision integer not null default 0,answers jsonb not null default '[]',updated_at timestamptz not null default now()
);
create table if not exists public.pro_visit_preparation_events(
 request_id uuid not null references pro_appointment_requests(id) on delete cascade,revision integer not null,
 answers jsonb not null,at timestamptz not null default now(),primary key(request_id,revision)
);
create table if not exists public.pro_visit_actions(
 actor_id uuid not null references profiles(id) on delete cascade,action_id uuid not null,
 scope text not null,input jsonb not null,result jsonb not null,primary key(actor_id,action_id)
);
create or replace function public.pro_visit_snapshot() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare q jsonb;rev integer;
begin
 select revision,coalesce((select jsonb_agg(item order by n) from jsonb_array_elements(s.questions) with ordinality x(item,n) where btrim(item->>'service')='' or lower(btrim(item->>'service'))=lower(btrim(new.service))),'[]') into rev,q from pro_visit_settings s where owner_id=new.owner_id;
 insert into pro_visit_preparation(request_id,questions,policy_revision) values(new.id,coalesce(q,'[]'),coalesce(rev,0));return new;
end $$;
drop trigger if exists pro_visit_snapshot on public.pro_appointment_requests;
create trigger pro_visit_snapshot after insert on public.pro_appointment_requests for each row execute function public.pro_visit_snapshot();
create or replace function public.pro_visit_required() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.status='confirmed' and old.status<>'confirmed' and exists(select 1 from pro_visit_preparation p cross join lateral jsonb_array_elements(p.questions) q where p.request_id=new.id and coalesce((q->>'required')::boolean,false) and not exists(select 1 from jsonb_array_elements(p.answers) a where a->>'id'=q->>'id' and btrim(a->>'value')<>'')) then raise exception 'Complete required preparation answers before confirming' using errcode='23514';end if;return new;
end $$;
drop trigger if exists pro_visit_required on public.pro_appointment_requests;
create trigger pro_visit_required before update of status on public.pro_appointment_requests for each row execute function public.pro_visit_required();
create or replace function public.pro_visit_settings_record(p_actor uuid,p_input jsonb default null) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare s pro_visit_settings;prior pro_visit_actions;result jsonb;q jsonb;aid uuid;
begin
 if not exists(select 1 from profiles where id=p_actor and not coalesce(is_disabled,false)) or not pro_appointment_enabled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 select * into s from pro_visit_settings where owner_id=p_actor;
 if p_input is not null then
  if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'revision') is distinct from 'number' or (p_input->>'revision')!~'^[0-9]+$' then raise exception 'Invalid operation' using errcode='22023';end if;
  aid:=(p_input->>'actionId')::uuid;select * into prior from pro_visit_actions where actor_id=p_actor and action_id=aid;
  if found then if prior.scope<>'settings' or prior.input is distinct from p_input then raise exception 'Changed retry' using errcode='22023';end if;return prior.result;end if;
  if not(p_input ?& array['revision','bufferMinutes','noticeMinutes','questions','action','actionId']) or p_input->>'action'<>'settings' or (select count(*) from jsonb_object_keys(p_input))<>6 or jsonb_typeof(p_input->'bufferMinutes') is distinct from 'number' or jsonb_typeof(p_input->'noticeMinutes') is distinct from 'number' or (p_input->>'bufferMinutes')!~'^[0-9]+$' or (p_input->>'noticeMinutes')!~'^[0-9]+$' or jsonb_typeof(p_input->'questions') is distinct from 'array' or jsonb_array_length(p_input->'questions')>3 or (p_input->>'revision')::integer<>coalesce(s.revision,0) then raise exception 'Settings changed' using errcode='40001';end if;
  if (p_input->>'bufferMinutes')::integer not between 0 and 180 or (p_input->>'bufferMinutes')::integer%15<>0 or (p_input->>'noticeMinutes')::integer not between 15 and 10080 or (p_input->>'noticeMinutes')::integer%15<>0 then raise exception 'Invalid scheduling preference' using errcode='22023';end if;
  for q in select value from jsonb_array_elements(p_input->'questions') loop
   if not(q ?& array['id','label','service','required']) or (select count(*) from jsonb_object_keys(q))<>4 or jsonb_typeof(q->'required') is distinct from 'boolean' or jsonb_typeof(q->'label') is distinct from 'string' or jsonb_typeof(q->'service') is distinct from 'string' or jsonb_typeof(q->'id') is distinct from 'string' or length(btrim(q->>'label')) not between 1 and 160 or length(q->>'service')>160 or (q->>'id')::uuid is null then raise exception 'Invalid question' using errcode='22023';end if;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_input->'questions'))<>jsonb_array_length(p_input->'questions') then raise exception 'Duplicate question' using errcode='22023';end if;
  insert into pro_visit_settings(owner_id,revision,buffer_minutes,notice_minutes,questions) values(p_actor,coalesce(s.revision,0)+1,(p_input->>'bufferMinutes')::integer,(p_input->>'noticeMinutes')::integer,p_input->'questions') on conflict(owner_id) do update set revision=excluded.revision,buffer_minutes=excluded.buffer_minutes,notice_minutes=excluded.notice_minutes,questions=excluded.questions returning * into s;
 end if;
 result:=jsonb_build_object('revision',coalesce(s.revision,0),'bufferMinutes',coalesce(s.buffer_minutes,0),'noticeMinutes',coalesce(s.notice_minutes,15),'questions',coalesce(s.questions,'[]'));
 if p_input is not null then insert into pro_visit_actions values(p_actor,aid,'settings',p_input,result);end if;return result;
end $$;
create or replace function public.pro_visit_preparation_record(p_actor uuid,p_id uuid,p_input jsonb default null) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r pro_appointment_requests;p pro_visit_preparation;owner uuid;prior pro_visit_actions;result jsonb;a jsonb;aid uuid;
begin
 if not exists(select 1 from profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 select owner_id into owner from pro_appointment_requests where id=p_id and p_actor in(owner_id,client_user_id);if not found then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text,0));select * into r from pro_appointment_requests where id=p_id for update;
 select * into p from pro_visit_preparation where request_id=p_id for update;
 if p_input is not null then
  if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'revision') is distinct from 'number' or (p_input->>'revision')!~'^[0-9]+$' then raise exception 'Invalid operation' using errcode='22023';end if;
  aid:=(p_input->>'actionId')::uuid;select * into prior from pro_visit_actions where actor_id=p_actor and action_id=aid;
  if found then if prior.scope<>p_id::text or prior.input is distinct from p_input then raise exception 'Changed retry' using errcode='22023';end if;return prior.result;end if;
  if p_actor<>r.client_user_id or r.status not in('requested','proposed') then raise exception 'Preparation is read only' using errcode='42501';end if;
  if not(p_input ?& array['action','requestId','actionId','revision','answers']) or p_input->>'action'<>'answers' or (p_input->>'requestId')::uuid<>p_id or (select count(*) from jsonb_object_keys(p_input))<>5 or jsonb_typeof(p_input->'answers') is distinct from 'array' or jsonb_array_length(p_input->'answers')>3 then raise exception 'Invalid answers' using errcode='22023';end if;
  if (p_input->>'revision')::integer<>coalesce(p.revision,0) then raise exception 'Preparation changed' using errcode='40001';end if;
  for a in select value from jsonb_array_elements(p_input->'answers') loop
   if (select count(*) from jsonb_object_keys(a))<>2 or not(a ?& array['id','value']) or jsonb_typeof(a->'id') is distinct from 'string' or jsonb_typeof(a->'value') is distinct from 'string' or length(a->>'value')>500 or not exists(select 1 from jsonb_array_elements(coalesce(p.questions,'[]')) q where q->>'id'=a->>'id') then raise exception 'Invalid answer' using errcode='22023';end if;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_input->'answers'))<>jsonb_array_length(p_input->'answers') then raise exception 'Duplicate answer' using errcode='22023';end if;
  insert into pro_visit_preparation(request_id,questions,policy_revision,revision,answers) values(p_id,'[]',0,1,p_input->'answers') on conflict(request_id) do update set revision=pro_visit_preparation.revision+1,answers=excluded.answers,updated_at=now() returning * into p;
  insert into pro_visit_preparation_events values(p_id,p.revision,p.answers,now());
  update pro_appointment_requests set revision=revision+1,updated_at=now() where id=p_id returning * into r;
 end if;
 result:=jsonb_build_object('requestId',p_id,'requestRevision',r.revision,'revision',coalesce(p.revision,0),'questions',coalesce(p.questions,'[]'),'answers',coalesce(p.answers,'[]'),'editable',p_actor=r.client_user_id and r.status in('requested','proposed'),'side',case when p_actor=r.owner_id then 'provider' else 'client' end,'history',coalesce((select jsonb_agg(jsonb_build_object('revision',e.revision,'at',e.at,'answers',e.answers) order by e.revision desc) from (select * from pro_visit_preparation_events where request_id=p_id order by revision desc limit 20)e),'[]'));
 if p_input is not null then insert into pro_visit_actions values(p_actor,aid,p_id::text,p_input,result);end if;return result;
end $$;
-- Applies to new automatic requests/acceptance. Defaults retain the earlier behavior.
create or replace function public.pro_appointment_slot_free(p_owner uuid,p_start timestamptz,p_duration integer) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(p_start>now()+make_interval(mins=>coalesce(s.notice_minutes,15)) and p_start<now()+interval '90 days'
 and p_duration between 15 and 480 and p_duration%15=0
 and extract(second from p_start)=0 and extract(minute from p_start)::integer%15=0
 and exists(select 1 from pro_availability a where a.user_id=p_owner and pro_instant(a.start)<=p_start and pro_instant(a."end")>=p_start+make_interval(mins=>p_duration))
 and not exists(select 1 from pro_work w where w.user_id=p_owner and not w.cancelled and pro_instant(w.start)<p_start+make_interval(mins=>p_duration+coalesce(s.buffer_minutes,0)) and pro_instant(w."end")>p_start-make_interval(mins=>coalesce(s.buffer_minutes,0))),false)
 from (select 1) anchor left join pro_visit_settings s on s.owner_id=p_owner;
$$;
create or replace function public.pro_visit_work_buffer() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare gap integer;notice integer;prior pro_work;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
 -- BEFORE INSERT runs for an upsert too. Metadata updates must not revalidate old appointments.
 if tg_op='INSERT' then
  select * into prior from pro_work where user_id=new.user_id and id=new.id;
  if found and new.start is not distinct from prior.start and new."end" is not distinct from prior."end" and new.cancelled is not distinct from prior.cancelled then return new;end if;
 end if;
 if tg_op='UPDATE' and new.start is not distinct from old.start and new."end" is not distinct from old."end" and new.cancelled is not distinct from old.cancelled then return new;end if;
 if new.cancelled or pro_instant(new.start)<=now() then return new;end if;
 select buffer_minutes,notice_minutes into gap,notice from pro_visit_settings where owner_id=new.user_id;
 if coalesce(gap,0)>0 and exists(select 1 from pro_work w where w.user_id=new.user_id and w.id<>new.id and not w.cancelled and pro_instant(w.start)<pro_instant(new."end")+make_interval(mins=>gap) and pro_instant(w."end")>pro_instant(new.start)-make_interval(mins=>gap)) then raise exception 'Leave the configured time between visits' using errcode='23514';end if;
 if new."bookingClientId" is not null and coalesce(notice,15)>15 and pro_instant(new.start)<=now()+make_interval(mins=>notice) then raise exception 'Respect the configured advance notice' using errcode='23514';end if;
 return new;
end $$;
drop trigger if exists pro_visit_work_buffer on public.pro_work;
create trigger pro_visit_work_buffer before insert or update on public.pro_work for each row execute function public.pro_visit_work_buffer();
alter table pro_visit_settings enable row level security;
alter table pro_visit_preparation enable row level security;
alter table pro_visit_preparation_events enable row level security;
alter table pro_visit_actions enable row level security;
revoke all on pro_visit_settings,pro_visit_preparation,pro_visit_preparation_events,pro_visit_actions from anon,authenticated;
grant all on pro_visit_settings,pro_visit_preparation,pro_visit_preparation_events,pro_visit_actions to service_role;
revoke all on function pro_visit_snapshot(),pro_visit_required(),pro_visit_work_buffer(),pro_visit_settings_record(uuid,jsonb),pro_visit_preparation_record(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function pro_visit_settings_record(uuid,jsonb),pro_visit_preparation_record(uuid,uuid,jsonb) to service_role;
commit;
