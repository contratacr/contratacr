-- LOCAL PRO ONLY. Personal 24-hour in-app reminders. No scheduler, push or email.
-- Additive and opt-in: empty rollout/preferences; no historical backfill or data deletion.
begin;
create table if not exists public.pro_appointment_reminder_rollout(
 owner_id uuid primary key references public.profiles(id) on delete cascade,
 enabled boolean not null default false,enabled_since timestamptz,
 check(enabled=(enabled_since is not null))
);
create or replace function public.pro_appointment_reminder_rollout_time() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if not new.enabled then new.enabled_since:=null;
 elsif tg_op='INSERT' then new.enabled_since:=clock_timestamp();
 elsif not old.enabled then new.enabled_since:=clock_timestamp();
 else new.enabled_since:=old.enabled_since;end if;
 return new;
end $$;
drop trigger if exists pro_appointment_reminder_rollout_time on public.pro_appointment_reminder_rollout;
create trigger pro_appointment_reminder_rollout_time before insert or update on public.pro_appointment_reminder_rollout for each row execute function public.pro_appointment_reminder_rollout_time();
create table if not exists public.pro_appointment_reminder_preferences(
 user_id uuid primary key references public.profiles(id) on delete cascade,
 enabled boolean not null default false,revision integer not null check(revision>0),
 enabled_since timestamptz,updated_at timestamptz not null default now(),
 check(enabled=(enabled_since is not null))
);
create table if not exists public.pro_appointment_reminder_preference_actions(
 user_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input jsonb not null,result jsonb not null,primary key(user_id,action_id)
);
create table if not exists public.pro_appointment_reminder_receipts(
 request_id uuid not null references public.pro_appointment_requests(id) on delete cascade,
 scheduled_start timestamptz not null,scheduled_end timestamptz not null check(scheduled_end>scheduled_start),
 lead_minutes integer not null default 1440 check(lead_minutes=1440),
 recipient_id uuid not null references public.profiles(id) on delete cascade,
 owner_id uuid not null references public.profiles(id) on delete cascade,
 source_event_position bigint not null references public.pro_appointment_events(position),
 notification_id uuid references public.notifications(id) on delete set null,
 evaluated_as_of timestamptz not null,created_at timestamptz not null default now(),
 invalidated_at timestamptz,invalidation_reason text check(invalidation_reason in ('cancelled','completed','rescheduled','source_changed')),
 primary key(request_id,scheduled_start,lead_minutes,recipient_id),
 check((invalidated_at is null)=(invalidation_reason is null))
);
create index if not exists pro_appointment_reminder_open on public.pro_appointment_reminder_receipts(request_id) where invalidated_at is null;

do $$declare prior text;begin
 select pg_get_expr(conbin,conrelid) into prior from pg_constraint where conrelid='public.notifications'::regclass and conname='notifications_type_check' and contype='c';
 if prior is null then raise exception 'Notification type contract not found';end if;
 if position('pro_appointment_reminder_provider' in prior)=0 or position('pro_appointment_reminder_client' in prior)=0 then
  alter table public.notifications drop constraint notifications_type_check;
  execute format('alter table public.notifications add constraint notifications_type_check check ((%s) or type in (''pro_appointment_reminder_provider'',''pro_appointment_reminder_client''))',prior);
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.notifications'::regclass and conname='pro_appointment_reminder_data_check') then
  alter table public.notifications add constraint pro_appointment_reminder_data_check check(
   type not in ('pro_appointment_reminder_provider','pro_appointment_reminder_client') or coalesce((
    data is not null and jsonb_typeof(data)='object' and data @> '{"version":1,"action":"reminder_24h","push_suppressed":true}'::jsonb
    and data ?& array['version','request_id','action','invalidated','link','push_suppressed']
    and (data-array['version','request_id','action','invalidated','link','push_suppressed'])='{}'::jsonb
    and jsonb_typeof(data->'request_id')='string' and (data->>'request_id')~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and jsonb_typeof(data->'invalidated')='boolean'
    and jsonb_typeof(data->'link')='string' and data->>'link'='/dashboard/profesional?tab='||case when type='pro_appointment_reminder_provider' then 'pro_agenda' else 'appointments' end||'&citaSolicitud='||(data->>'request_id')
   ),false)
  );
 end if;
end $$;

create or replace function public.pro_appointment_reminder_available(p_actor uuid) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(
  select 1 from pro_appointment_reminder_rollout x join profiles p on p.id=x.owner_id and not coalesce(p.is_disabled,false)
  join professionals professional on professional.profile_id=x.owner_id and not coalesce(professional.is_banned,false)
  where x.enabled and (x.owner_id=p_actor or exists(select 1 from pro_appointment_requests r where r.owner_id=x.owner_id and r.client_user_id=p_actor))
 );
$$;
create or replace function public.pro_appointment_reminder_preferences_record(p_actor uuid,p_input jsonb default null) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare s pro_appointment_reminder_preferences;prior pro_appointment_reminder_preference_actions;aid uuid;available boolean;result jsonb;
begin
 if p_actor is null or not exists(select 1 from profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 available:=pro_appointment_reminder_available(p_actor);
 if p_input is not null then
  if jsonb_typeof(p_input) is distinct from 'object' or not(p_input ?& array['enabled','expectedRevision','actionId']) or (p_input-array['enabled','expectedRevision','actionId'])<>'{}'::jsonb
   or jsonb_typeof(p_input->'enabled') is distinct from 'boolean' or jsonb_typeof(p_input->'expectedRevision') is distinct from 'number' or (p_input->>'expectedRevision')!~'^[0-9]{1,9}$' then raise exception 'Invalid reminder preference' using errcode='22023';end if;
  aid:=(p_input->>'actionId')::uuid;if aid is null then raise exception 'Missing action identity' using errcode='22023';end if;
  select * into prior from pro_appointment_reminder_preference_actions where user_id=p_actor and action_id=aid;
  if found then
   if prior.input is distinct from p_input then raise exception 'Changed retry' using errcode='22023';end if;
   return prior.result||jsonb_build_object('available',available);
  end if;
 end if;
 select * into s from pro_appointment_reminder_preferences where user_id=p_actor for update;
 if p_input is not null then
  if (p_input->>'expectedRevision')::integer<>coalesce(s.revision,0) then raise exception 'Reminder preference changed' using errcode='40001';end if;
  if (p_input->>'enabled')::boolean and not available then raise exception 'Reminders are not enabled here' using errcode='42501';end if;
  insert into pro_appointment_reminder_preferences(user_id,enabled,revision,enabled_since)
  values(p_actor,(p_input->>'enabled')::boolean,coalesce(s.revision,0)+1,case when (p_input->>'enabled')::boolean then coalesce(s.enabled_since,clock_timestamp()) end)
  on conflict(user_id) do update set enabled=excluded.enabled,revision=excluded.revision,enabled_since=excluded.enabled_since,updated_at=now() returning * into s;
 end if;
 result:=jsonb_build_object('enabled',coalesce(s.enabled,false),'revision',coalesce(s.revision,0),'available',available);
 if p_input is not null then insert into pro_appointment_reminder_preference_actions values(p_actor,aid,p_input,result);end if;
 return result;
end $$;

-- Select current confirmed timing only, never a pending proposal/requested_start.
-- Exclude durable receipts before LIMIT so earlier emitted rows cannot starve others.
create or replace function public.pro_appointment_reminder_due(p_as_of timestamptz,p_request uuid default null,p_recipient uuid default null)
returns table(request_id uuid,recipient_id uuid,owner_id uuid,scheduled_start timestamptz,scheduled_end timestamptz,source_event_position bigint,due_at timestamptz)
language sql stable security invoker set search_path=public,pg_temp as $$
 select r.id,recipient.id,r.owner_id,pro_instant(w.start),pro_instant(w."end"),e.position,pro_instant(w.start)-interval '24 hours'
 from pro_appointment_requests r
 join pro_work w on w.user_id=r.owner_id and w.id=r.work_id and w."bookingClientId"=r.client_user_id::text and w."clientId"='reservation-'||r.client_user_id::text
 join professionals professional on professional.id=r.professional_id and professional.profile_id=r.owner_id and not coalesce(professional.is_banned,false)
 join profiles owner on owner.id=r.owner_id and not coalesce(owner.is_disabled,false)
 join pro_appointment_reminder_rollout rollout on rollout.owner_id=r.owner_id and rollout.enabled
 cross join lateral(values(r.owner_id),(r.client_user_id)) recipient(id)
 join profiles actor on actor.id=recipient.id and not coalesce(actor.is_disabled,false)
 join pro_appointment_reminder_preferences pref on pref.user_id=recipient.id and pref.enabled
 join lateral(select event.position,event.at from pro_appointment_events event where event.request_id=r.id and event.status='confirmed'
  and event.action in ('create','confirm','accept','reschedule') and event.start_at=pro_instant(w.start) and event.end_at=pro_instant(w."end") order by event.position desc limit 1)e on true
 where r.status='confirmed' and w.stage='scheduled' and not w.cancelled and pro_instant(w.start)>p_as_of
  and pro_instant(w.start)-interval '24 hours'<=p_as_of and p_as_of<pro_instant(w.start)-interval '24 hours'+interval '15 minutes'
  and e.at<=pro_instant(w.start)-interval '24 hours' and pref.enabled_since<=pro_instant(w.start)-interval '24 hours' and rollout.enabled_since<=pro_instant(w.start)-interval '24 hours'
  and (p_request is null or r.id=p_request) and (p_recipient is null or recipient.id=p_recipient)
  and not exists(select 1 from pro_appointment_reminder_receipts sent where sent.request_id=r.id and sent.scheduled_start=pro_instant(w.start) and sent.lead_minutes=1440 and sent.recipient_id=recipient.id);
$$;

create or replace function public.pro_appointment_reminder_invalidate(p_request uuid) returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r pro_appointment_requests;w pro_work;owner uuid;source bigint;entry pro_appointment_reminder_receipts;reason text;n integer:=0;
begin
 if not exists(select 1 from pro_appointment_reminder_receipts where request_id=p_request and invalidated_at is null) then return 0;end if;
 select owner_id into owner from pro_appointment_requests where id=p_request;if owner is null then return 0;end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text,0));
 select * into r from pro_appointment_requests where id=p_request for update;
 select * into w from pro_work where user_id=r.owner_id and id=r.work_id for update;
 select e.position into source from pro_appointment_events e where e.request_id=r.id and e.status='confirmed' and e.action in ('create','confirm','accept','reschedule') and e.start_at=pro_instant(w.start) and e.end_at=pro_instant(w."end") order by e.position desc limit 1;
 for entry in select * from pro_appointment_reminder_receipts where request_id=r.id and invalidated_at is null for update loop
  reason:=case when r.status='cancelled' or w.cancelled then 'cancelled' when r.status='completed' or w.stage='completed' then 'completed'
   when w.id is null or r.status<>'confirmed' or w.stage<>'scheduled' or w."bookingClientId" is distinct from r.client_user_id::text or w."clientId" is distinct from 'reservation-'||r.client_user_id::text then 'source_changed'
   when entry.scheduled_start is distinct from pro_instant(w.start) or entry.scheduled_end is distinct from pro_instant(w."end") then 'rescheduled'
   when source is distinct from entry.source_event_position then 'source_changed' end;
  if reason is not null then
   update pro_appointment_reminder_receipts set invalidated_at=clock_timestamp(),invalidation_reason=reason where request_id=entry.request_id and scheduled_start=entry.scheduled_start and lead_minutes=entry.lead_minutes and recipient_id=entry.recipient_id;
   -- Keep the notification's read state, original payload and history. No deletion.
   update notifications set data=jsonb_set(data,'{invalidated}','true'::jsonb) where id=entry.notification_id and user_id=entry.recipient_id and type in ('pro_appointment_reminder_provider','pro_appointment_reminder_client');
   n:=n+1;
  end if;
 end loop;
 return n;
end $$;
create or replace function public.pro_appointment_reminder_source_changed() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare request uuid;
begin
 if tg_table_name='pro_appointment_requests' then request:=new.id;
 elsif tg_table_name='pro_appointment_events' then request:=new.request_id;
 else select id into request from pro_appointment_requests where owner_id=new.user_id and work_id=new.id;end if;
 if request is not null then perform pro_appointment_reminder_invalidate(request);end if;
 return new;
end $$;
drop trigger if exists pro_appointment_reminder_request_changed on public.pro_appointment_requests;
create trigger pro_appointment_reminder_request_changed after update on public.pro_appointment_requests for each row execute function public.pro_appointment_reminder_source_changed();
drop trigger if exists pro_appointment_reminder_work_changed on public.pro_work;
create trigger pro_appointment_reminder_work_changed after update on public.pro_work for each row execute function public.pro_appointment_reminder_source_changed();
drop trigger if exists pro_appointment_reminder_event_changed on public.pro_appointment_events;
create trigger pro_appointment_reminder_event_changed after insert on public.pro_appointment_events for each row execute function public.pro_appointment_reminder_source_changed();

create or replace function public.pro_appointment_reminders_run(p_as_of timestamptz default now(),p_limit integer default 100) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare candidate record;current_source record;batch jsonb;lock_owner uuid;lock_profile uuid;lock_professional uuid;notice uuid;notice_type text;created integer:=0;invalidated integer:=0;
begin
 if p_as_of is null or not isfinite(p_as_of) or p_limit is null or p_limit<1 or p_limit>500 then raise exception 'Invalid reminder run' using errcode='22023';end if;
 select coalesce(jsonb_agg(to_jsonb(d) order by d.due_at,d.request_id,d.recipient_id),'[]'::jsonb) into batch from (
  select * from pro_appointment_reminder_due(p_as_of) order by due_at,request_id,recipient_id limit p_limit
 )d;
 -- Moderation updates these rows without owner advisory locks. Lock identities
 -- first, before owner/appointment locks, then revalidate the candidate below.
 for lock_profile in select id from (
  select (value->>'owner_id')::uuid id from jsonb_array_elements(batch)
  union select (value->>'recipient_id')::uuid id from jsonb_array_elements(batch)
 )identities order by id loop
  perform 1 from profiles where id=lock_profile for share;
 end loop;
 for lock_professional in select distinct r.professional_id from pro_appointment_requests r
  join jsonb_array_elements(batch)b on (b.value->>'request_id')::uuid=r.id order by r.professional_id loop
  perform 1 from professionals where id=lock_professional for share;
 end loop;
 -- Acquire all owner locks first in a stable order. A recipient may also be an
 -- owner: never take their advisory lock after retaining a preference row lock.
 for lock_owner in select distinct (value->>'owner_id')::uuid from jsonb_array_elements(batch) order by 1 loop
  perform pg_advisory_xact_lock(hashtextextended(lock_owner::text,0));
 end loop;
 for candidate in select * from jsonb_to_recordset(batch) as x(request_id uuid,recipient_id uuid,owner_id uuid) loop
  -- Same ordering as appointment writers: owner advisory before request/work.
  perform 1 from pro_appointment_requests where id=candidate.request_id for update skip locked;
  if not found then continue;end if;
  perform 1 from pro_work where user_id=candidate.owner_id and id=(select work_id from pro_appointment_requests where id=candidate.request_id) for update skip locked;
  if not found then continue;end if;
  perform 1 from pro_appointment_reminder_rollout where owner_id=candidate.owner_id for share;
  perform 1 from pro_appointment_reminder_preferences where user_id=candidate.recipient_id for share;
  invalidated:=invalidated+pro_appointment_reminder_invalidate(candidate.request_id);
  select * into current_source from pro_appointment_reminder_due(p_as_of,candidate.request_id,candidate.recipient_id);
  if not found then continue;end if;
  insert into pro_appointment_reminder_receipts(request_id,scheduled_start,scheduled_end,recipient_id,owner_id,source_event_position,evaluated_as_of)
  values(current_source.request_id,current_source.scheduled_start,current_source.scheduled_end,current_source.recipient_id,current_source.owner_id,current_source.source_event_position,p_as_of) on conflict do nothing;
  if not found then continue;end if;
  notice_type:=case when current_source.recipient_id=current_source.owner_id then 'pro_appointment_reminder_provider' else 'pro_appointment_reminder_client' end;
  insert into notifications(user_id,type,title,message,data,read) values(current_source.recipient_id,notice_type,'Recordatorio de cita','Consulte la fecha y hora actuales de su cita.',jsonb_build_object('version',1,'request_id',current_source.request_id,'action','reminder_24h','invalidated',false,'link','/dashboard/profesional?tab='||case when current_source.recipient_id=current_source.owner_id then 'pro_agenda' else 'appointments' end||'&citaSolicitud='||current_source.request_id::text,'push_suppressed',true),false) returning id into notice;
  if notice is null then raise exception 'Reminder notice not inserted' using errcode='23514';end if;
  update pro_appointment_reminder_receipts set notification_id=notice where request_id=current_source.request_id and scheduled_start=current_source.scheduled_start and lead_minutes=1440 and recipient_id=current_source.recipient_id;
  created:=created+1;
 end loop;
 return jsonb_build_object('created',created,'invalidated',invalidated,'hasMore',exists(select 1 from pro_appointment_reminder_due(p_as_of)));
end $$;

do $$declare name text;begin foreach name in array array['pro_appointment_reminder_rollout','pro_appointment_reminder_preferences','pro_appointment_reminder_preference_actions','pro_appointment_reminder_receipts'] loop
 execute format('alter table public.%I enable row level security',name);
 execute format('revoke all on public.%I from public,anon,authenticated',name);
 execute format('grant all on public.%I to service_role',name);
end loop;end $$;
revoke all on function pro_appointment_reminder_rollout_time(),pro_appointment_reminder_available(uuid),pro_appointment_reminder_preferences_record(uuid,jsonb),pro_appointment_reminder_due(timestamptz,uuid,uuid),pro_appointment_reminder_invalidate(uuid),pro_appointment_reminder_source_changed(),pro_appointment_reminders_run(timestamptz,integer) from public,anon,authenticated;
grant execute on function pro_appointment_reminder_rollout_time(),pro_appointment_reminder_available(uuid),pro_appointment_reminder_preferences_record(uuid,jsonb),pro_appointment_reminder_due(timestamptz,uuid,uuid),pro_appointment_reminder_invalidate(uuid),pro_appointment_reminder_source_changed(),pro_appointment_reminders_run(timestamptz,integer) to service_role;
notify pgrst,'reload schema';
commit;
