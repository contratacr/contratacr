-- ContrataCR Pro, row 57 (customer financing = the professional's installment plan): delinquency (mora) state and reminders.
-- PRO_ENABLED stays false in production. Nothing is sent by this migration.
--  * Mora per installment, derived from the existing plan state (pro_payment_plan_state, CR calendar day): late_light 1-7 days,
--    late_moderate 8-30, late_severe 31+; upcoming = due within the next 3 days. The optional flat late fee of the plan is reported
--    per overdue installment (a simple amount, never compounded).
--  * Reminder log (pro_payment_plan_reminders): one row per installment x revision x escalation level x channel, created once.
--    Channel app = the professional's tray (recorded). Channels email and sms are queued and handed to the reminder adapter
--    (sandbox by default, see src/lib/pro/reminders): the row only moves queued -> sandbox_sent / failed, never anything else.
--    A channel without contact data (no e-mail / no phone) is skipped and counted, not queued.
-- Read-only except for the reminder log. Owner only; service_role only.
begin;
create table if not exists public.pro_payment_plan_reminders(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,plan_id uuid not null,revision integer not null,seq integer not null,work_id text not null,
 kind text not null check(kind in('upcoming','late_light','late_moderate','late_severe')),
 channel text not null check(channel in('app','email','sms')),
 status text not null check(status in('recorded','queued','sandbox_sent','failed')),
 due_date date not null,pending_cents bigint not null check(pending_cents>0),days_overdue integer not null default 0 check(days_overdue>=0),
 created_at timestamptz not null default clock_timestamp(),sent_at timestamptz,provider_ref text check(provider_ref is null or length(provider_ref)<=120),
 primary key(owner_id,id),unique(owner_id,plan_id,revision,seq,kind,channel),
 foreign key(owner_id,plan_id) references public.pro_payment_plans(owner_id,id) on delete cascade,
 check((channel='app')=(status='recorded')),check((status in('sandbox_sent','failed'))=(sent_at is not null))
);
create index if not exists pro_payment_plan_reminders_page on public.pro_payment_plan_reminders(owner_id,created_at desc,id);

create or replace function public.pro_payment_plan_mora_level(p_days integer) returns text
language sql immutable security invoker set search_path=public,pg_temp as $$
 select case when p_days is null or p_days<=0 then null when p_days<=7 then 'late_light' when p_days<=30 then 'late_moderate' else 'late_severe' end $$;

-- Installments of the active plans (all works of the owner, or one) that are overdue or due within 3 days.
create or replace function public.pro_payment_plan_mora_rows(p_owner uuid,p_work text) returns table(
 work_id text,work_title text,client_id text,client_name text,client_email text,client_phone text,plan_id uuid,revision integer,seq integer,item_kind text,
 due_date date,days_overdue integer,pending_cents bigint,late_fee_cents bigint,kind text)
language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare p record;st jsonb;it jsonb;today date:=public.pro_payment_plan_today();due date;d integer;pend bigint;
begin
 for p in select pl.id,pl.work_id wid,pl.revision rev,w.service,w."clientId" cid,c.name cname,c.email cemail,c.phone cphone,
   coalesce((select r.late_fee_cents from public.pro_payment_plan_revisions r where r.owner_id=pl.owner_id and r.plan_id=pl.id and r.revision=pl.revision),0) fee
  from public.pro_payment_plans pl join public.pro_work w on w.user_id=pl.owner_id and w.id=pl.work_id and not w.cancelled
  left join public.pro_clients c on c.user_id=w.user_id and c.id=w."clientId"
  where pl.owner_id=p_owner and pl.status='active' and (p_work is null or pl.work_id=p_work) order by pl.created_at,pl.id limit 500 loop
  st:=public.pro_payment_plan_state(p_owner,p.id,today);
  for it in select value from jsonb_array_elements(coalesce(st->'items','[]'::jsonb)) loop
   if it->>'status'='paid' or it->>'dueDate' is null then continue;end if;
   due:=(it->>'dueDate')::date;d:=today-due;pend:=(it->>'amountCents')::bigint-(it->>'appliedCents')::bigint;
   if pend<=0 then continue;end if;
   if d>0 then kind:='';else if due>today+3 then continue;end if;end if;
   work_id:=p.wid;work_title:=p.service;client_id:=p.cid;client_name:=p.cname;client_email:=nullif(btrim(coalesce(p.cemail,'')),'');client_phone:=nullif(btrim(coalesce(p.cphone,'')),'');
   plan_id:=p.id;revision:=p.rev;seq:=(it->>'seq')::integer;item_kind:=it->>'kind';due_date:=due;days_overdue:=greatest(d,0);pending_cents:=pend;
   late_fee_cents:=case when d>0 then p.fee else 0 end;kind:=coalesce(public.pro_payment_plan_mora_level(d),'upcoming');
   return next;
  end loop;
 end loop;
end $$;

create or replace function public.pro_payment_plan_mora_read(p_actor uuid,p_query jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare wid text;rows jsonb;reminders jsonb;sm record;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_query) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_query) k where k<>'workId')
  or (p_query ? 'workId' and (jsonb_typeof(p_query->'workId') is distinct from 'string' or length(p_query->>'workId') not between 1 and 160)) then raise exception 'Invalid mora query' using errcode='22023';end if;
 wid:=p_query->>'workId';
 if wid is not null and not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then return null;end if;
 create temporary table if not exists pg_temp.pro_mora_tmp on commit drop as select * from public.pro_payment_plan_mora_rows(p_actor,wid) with no data;
 truncate pg_temp.pro_mora_tmp;insert into pg_temp.pro_mora_tmp select * from public.pro_payment_plan_mora_rows(p_actor,wid);
 select coalesce(jsonb_agg(jsonb_build_object('workId',work_id,'workTitle',work_title,'clientId',client_id,'clientName',client_name,'planId',plan_id,'revision',revision,'seq',seq,
   'itemKind',item_kind,'dueDate',due_date,'daysOverdue',days_overdue,'pendingCents',pending_cents,'lateFeeCents',late_fee_cents,'kind',kind,'hasEmail',client_email is not null,'hasPhone',client_phone is not null)
   order by days_overdue desc,due_date,work_id,seq),'[]'::jsonb) into rows from pg_temp.pro_mora_tmp;
 select count(*) filter(where kind<>'upcoming') late,coalesce(sum(pending_cents) filter(where kind<>'upcoming'),0) late_cents,coalesce(sum(late_fee_cents),0) fee,
  count(*) filter(where kind='upcoming') soon,coalesce(sum(pending_cents) filter(where kind='upcoming'),0) soon_cents,coalesce(max(days_overdue),0) worst,
  count(distinct client_id) filter(where kind<>'upcoming') clients into sm from pg_temp.pro_mora_tmp;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'workId',r.work_id,'planId',r.plan_id,'seq',r.seq,'kind',r.kind,'channel',r.channel,'status',r.status,'dueDate',r.due_date,
   'pendingCents',r.pending_cents,'daysOverdue',r.days_overdue,'createdAt',r.created_at,'sentAt',r.sent_at,'providerRef',r.provider_ref,'clientName',(select c.name from public.pro_work w join public.pro_clients c on c.user_id=w.user_id and c.id=w."clientId" where w.user_id=r.owner_id and w.id=r.work_id))
   order by r.created_at desc,r.id desc),'[]'::jsonb) into reminders
  from(select * from public.pro_payment_plan_reminders x where x.owner_id=p_actor and (wid is null or x.work_id=wid) order by x.created_at desc,x.id desc limit 50) r;
 return jsonb_build_object('today',to_char(public.pro_payment_plan_today(),'YYYY-MM-DD'),'workId',wid,
  'summary',jsonb_build_object('lateCount',sm.late,'lateCents',sm.late_cents,'lateFeeCents',sm.fee,'upcomingCount',sm.soon,'upcomingCents',sm.soon_cents,'worstDays',sm.worst,'clientCount',sm.clients,
   'worstLevel',public.pro_payment_plan_mora_level(sm.worst)),'rows',rows,'reminders',reminders);
end $$;

-- Records the reminders of the current moment once (idempotent by natural key). Never sends.
create or replace function public.pro_payment_plan_reminders_prepare(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare wid text;m record;ch text;made integer:=0;app integer:=0;email integer:=0;sms integer:=0;nocontact integer:=0;n integer;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_input) k where k<>'workId')
  or (p_input ? 'workId' and (jsonb_typeof(p_input->'workId') is distinct from 'string' or length(p_input->>'workId') not between 1 and 160)) then raise exception 'Invalid reminder request' using errcode='22023';end if;
 wid:=p_input->>'workId';
 if wid is not null and not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then raise exception 'Owned work unavailable' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-plan-reminders:'||p_actor::text,0));
 for m in select * from public.pro_payment_plan_mora_rows(p_actor,wid) loop
  foreach ch in array array['app','email','sms'] loop
   if ch='email' and m.client_email is null or ch='sms' and m.client_phone is null then nocontact:=nocontact+1;continue;end if;
   insert into public.pro_payment_plan_reminders(owner_id,id,plan_id,revision,seq,work_id,kind,channel,status,due_date,pending_cents,days_overdue)
    values(p_actor,gen_random_uuid(),m.plan_id,m.revision,m.seq,m.work_id,m.kind,ch,case when ch='app' then 'recorded' else 'queued' end,m.due_date,m.pending_cents,m.days_overdue)
    on conflict(owner_id,plan_id,revision,seq,kind,channel) do nothing;
   get diagnostics n=row_count;
   if n>0 then made:=made+1;if ch='app' then app:=app+1;elsif ch='email' then email:=email+1;else sms:=sms+1;end if;end if;
  end loop;
 end loop;
 return jsonb_build_object('created',made,'app',app,'email',email,'sms',sms,'withoutContact',nocontact);
end $$;

-- Queue for the adapter: queued e-mail / SMS with what the message needs. Owner only.
create or replace function public.pro_payment_plan_reminders_queue(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'channel',r.channel,'kind',r.kind,'dueDate',r.due_date,'pendingCents',r.pending_cents,'daysOverdue',r.days_overdue,
   'workTitle',w.service,'clientName',c.name,'to',case when r.channel='email' then nullif(btrim(coalesce(c.email,'')),'') else nullif(btrim(coalesce(c.phone,'')),'') end) order by r.created_at,r.id)
  from(select * from public.pro_payment_plan_reminders x where x.owner_id=p_actor and x.status='queued' order by x.created_at,x.id limit 100) r
  join public.pro_work w on w.user_id=r.owner_id and w.id=r.work_id left join public.pro_clients c on c.user_id=w.user_id and c.id=w."clientId"),'[]'::jsonb);
end $$;

create or replace function public.pro_payment_plan_reminders_mark(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare rid uuid;n integer;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or (select array_agg(k order by k) from jsonb_object_keys(p_input) k) is distinct from array['id','providerRef','status']
  or jsonb_typeof(p_input->'id') is distinct from 'string' or p_input->>'status' not in('sandbox_sent','failed')
  or jsonb_typeof(p_input->'providerRef') not in('string','null') then raise exception 'Invalid reminder result' using errcode='22023';end if;
 rid:=(p_input->>'id')::uuid;
 update public.pro_payment_plan_reminders set status=p_input->>'status',sent_at=clock_timestamp(),provider_ref=left(p_input->>'providerRef',120)
  where owner_id=p_actor and id=rid and status='queued' and channel in('email','sms');
 get diagnostics n=row_count;
 if n=0 then raise exception 'Reminder not queued' using errcode='40001';end if;
 return jsonb_build_object('id',rid,'status',p_input->>'status');
end $$;

create or replace function public.pro_payment_plan_reminder_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' then
  if not exists(select 1 from public.profiles where id=old.owner_id) or not exists(select 1 from public.pro_payment_plans where owner_id=old.owner_id and id=old.plan_id) then return old;end if;
  raise exception 'Reminders are kept' using errcode='23514';
 end if;
 if old.status<>'queued' or new.status not in('sandbox_sent','failed') or (new.owner_id,new.id,new.plan_id,new.revision,new.seq,new.work_id,new.kind,new.channel,new.due_date,new.pending_cents,new.days_overdue,new.created_at)
  is distinct from (old.owner_id,old.id,old.plan_id,old.revision,old.seq,old.work_id,old.kind,old.channel,old.due_date,old.pending_cents,old.days_overdue,old.created_at) then
  raise exception 'Reminders only move from queued to sent or failed' using errcode='23514';end if;
 return new;
end $$;
drop trigger if exists pro_payment_plan_reminder_guard on public.pro_payment_plan_reminders;
create trigger pro_payment_plan_reminder_guard before update or delete on public.pro_payment_plan_reminders for each row execute function public.pro_payment_plan_reminder_guard();

alter table public.pro_payment_plan_reminders enable row level security;
revoke all on public.pro_payment_plan_reminders from public,anon,authenticated;
grant all on public.pro_payment_plan_reminders to service_role;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'pro_payment_plan_mora_%' or p.proname like 'pro_payment_plan_reminder%') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
notify pgrst,'reload schema';
