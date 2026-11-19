-- LOCAL PRO ONLY. Opt-in internal appointment notices; never email or push delivery.
-- Empty rollout on installation. No historical events are scanned or backfilled.
begin;

-- Preserve every existing notification type; extend only this local installation.
do $$declare prior text;begin
 select pg_get_expr(conbin,conrelid) into prior from pg_constraint where conrelid='public.notifications'::regclass and conname='notifications_type_check' and contype='c';
 if prior is null then raise exception 'Notification type contract not found';end if;
 if position('pro_appointment_provider' in prior)=0 or position('pro_appointment_client' in prior)=0 then
  alter table public.notifications drop constraint notifications_type_check;
  execute format('alter table public.notifications add constraint notifications_type_check check ((%s) or type in (''pro_appointment_provider'',''pro_appointment_client''))',prior);
 end if;
end $$;

do $$begin
 if not exists(select 1 from pg_constraint where conrelid='public.notifications'::regclass and conname='pro_appointment_notification_data_check') then
  alter table public.notifications add constraint pro_appointment_notification_data_check check(
   type not in ('pro_appointment_provider','pro_appointment_client') or coalesce((
    data is not null and jsonb_typeof(data)='object' and data @> '{"version":1,"push_suppressed":true}'::jsonb
    and data ?& array['version','request_id','action','link','push_suppressed']
    and (data-array['version','request_id','action','link','push_suppressed'])='{}'::jsonb
    and jsonb_typeof(data->'request_id')='string' and (data->>'request_id')~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and jsonb_typeof(data->'action')='string' and data->>'action' in ('requested','proposed','confirmed','declined','cancelled','completed','reschedule_proposed','reschedule_accepted','reschedule_declined','reschedule_withdrawn')
    and jsonb_typeof(data->'link')='string' and data->>'link'='/dashboard/profesional?tab='||case when type='pro_appointment_provider' then 'pro_agenda' else 'appointments' end||'&citaSolicitud='||(data->>'request_id')
   ),false)
  );
 end if;
end $$;
create table if not exists public.pro_appointment_notice_rollout(
 owner_id uuid primary key references public.profiles(id) on delete cascade,
 enabled boolean not null default false
);
create table if not exists public.pro_appointment_notice_receipts(
 source_kind text not null check(source_kind in ('appointment_event','reschedule_action')),
 source_key text not null check(length(source_key) between 1 and 100),
 recipient_id uuid not null references public.profiles(id) on delete cascade,
 request_id uuid not null references public.pro_appointment_requests(id) on delete cascade,
 notification_id uuid references public.notifications(id) on delete set null,
 created_at timestamptz not null default now(),primary key(source_kind,source_key,recipient_id)
);

create or replace function public.pro_insert_appointment_notice(p_request uuid,p_actor uuid,p_source_kind text,p_source_key text,p_action text) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r pro_appointment_requests;recipient uuid;notice_type text;notice_id uuid;
begin
 select * into r from pro_appointment_requests where id=p_request;
 if not found then raise exception 'Appointment notice source unavailable' using errcode='P0002';end if;
 if not exists(select 1 from pro_appointment_notice_rollout where owner_id=r.owner_id and enabled) then return;end if;
 if p_actor is null or p_actor not in (r.owner_id,r.client_user_id) then raise exception 'Invalid appointment notice actor' using errcode='42501';end if;
 if p_source_kind is null or p_action is null or p_source_kind not in ('appointment_event','reschedule_action') or p_source_key is null or length(p_source_key) not between 1 and 100 or p_action not in ('requested','proposed','confirmed','declined','cancelled','completed','reschedule_proposed','reschedule_accepted','reschedule_declined','reschedule_withdrawn') then raise exception 'Invalid appointment notice' using errcode='22023';end if;
 if p_source_kind='appointment_event' then
  if not exists(select 1 from pro_appointment_events e where e.request_id=p_request and e.actor_id=p_actor and e.position::text=p_source_key and p_action=case e.action when 'create' then case when e.status='confirmed' then 'confirmed' else 'requested' end when 'propose' then 'proposed' when 'confirm' then 'confirmed' when 'accept' then 'confirmed' when 'decline' then 'declined' when 'cancel' then 'cancelled' when 'complete' then 'completed' when 'completed' then 'completed' end) then raise exception 'Appointment notice event mismatch' using errcode='23514';end if;
 else
  if not exists(select 1 from pro_appointment_reschedule_actions a where a.request_id=p_request and a.actor_id=p_actor and a.actor_id::text||':'||a.action_id::text=p_source_key and p_action=case a.input->>'action' when 'propose' then 'reschedule_proposed' when 'accept' then 'reschedule_accepted' when 'decline' then 'reschedule_declined' when 'withdraw' then 'reschedule_withdrawn' end) then raise exception 'Appointment notice receipt mismatch' using errcode='23514';end if;
 end if;
 recipient:=case when p_actor=r.owner_id then r.client_user_id else r.owner_id end;
 if recipient=p_actor then raise exception 'Appointment notice must have a counterparty' using errcode='23514';end if;
 -- Disabled/deleted counterparties receive no new notices; this never blocks cancellation.
 if not exists(select 1 from profiles where id=recipient and not coalesce(is_disabled,false)) then return;end if;
 notice_type:=case when recipient=r.owner_id then 'pro_appointment_provider' else 'pro_appointment_client' end;
 -- Receipt survives dismissal. Reserve before insertion; any failure rolls back source + receipt + notice.
 insert into pro_appointment_notice_receipts(source_kind,source_key,recipient_id,request_id) values(p_source_kind,p_source_key,recipient,p_request) on conflict do nothing;
 if not found then return;end if;
 insert into notifications(user_id,type,title,message,data,read) values(recipient,notice_type,'Actualización de cita','Abre la cita para revisar la actualización.',jsonb_build_object('version',1,'request_id',p_request,'action',p_action,'link','/dashboard/profesional?tab='||case when recipient=r.owner_id then 'pro_agenda' else 'appointments' end||'&citaSolicitud='||p_request::text,'push_suppressed',true),false) returning id into notice_id;
 if notice_id is null then raise exception 'Appointment notice was not inserted' using errcode='23514';end if;
 update pro_appointment_notice_receipts set notification_id=notice_id where source_kind=p_source_kind and source_key=p_source_key and recipient_id=recipient;
end $$;

create or replace function public.pro_appointment_event_notice() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare normalized text;
begin
 normalized:=case new.action when 'create' then case when new.status='confirmed' then 'confirmed' else 'requested' end when 'propose' then 'proposed' when 'confirm' then 'confirmed' when 'accept' then 'confirmed' when 'decline' then 'declined' when 'cancel' then 'cancelled' when 'complete' then 'completed' when 'completed' then 'completed' end;
 -- Accepted rescheduling is notified from its durable action receipt, once only.
 if normalized is not null then perform pro_insert_appointment_notice(new.request_id,new.actor_id,'appointment_event',new.position::text,normalized);end if;
 return new;
end $$;
create or replace function public.pro_appointment_reschedule_notice() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare normalized text;
begin
 normalized:=case new.input->>'action' when 'propose' then 'reschedule_proposed' when 'accept' then 'reschedule_accepted' when 'decline' then 'reschedule_declined' when 'withdraw' then 'reschedule_withdrawn' end;
 if normalized is null then raise exception 'Invalid reschedule receipt' using errcode='22023';end if;
 perform pro_insert_appointment_notice(new.request_id,new.actor_id,'reschedule_action',new.actor_id::text||':'||new.action_id::text,normalized);
 return new;
end $$;
drop trigger if exists pro_appointment_event_notice on public.pro_appointment_events;
create trigger pro_appointment_event_notice after insert on public.pro_appointment_events for each row execute function public.pro_appointment_event_notice();
drop trigger if exists pro_appointment_reschedule_notice on public.pro_appointment_reschedule_actions;
create trigger pro_appointment_reschedule_notice after insert on public.pro_appointment_reschedule_actions for each row execute function public.pro_appointment_reschedule_notice();

alter table pro_appointment_notice_rollout enable row level security;
alter table pro_appointment_notice_receipts enable row level security;
revoke all on pro_appointment_notice_rollout,pro_appointment_notice_receipts from public,anon,authenticated;
grant all on pro_appointment_notice_rollout,pro_appointment_notice_receipts to service_role;
revoke all on function pro_insert_appointment_notice(uuid,uuid,text,text,text),pro_appointment_event_notice(),pro_appointment_reschedule_notice() from public,anon,authenticated;
grant execute on function pro_insert_appointment_notice(uuid,uuid,text,text,text),pro_appointment_event_notice(),pro_appointment_reschedule_notice() to service_role;
notify pgrst,'reload schema';
commit;
