-- LOCAL PRO ONLY. Round 9 (2026-11-15): in-app notification center with per-person preferences and a
-- reminder schedule (family 24). A notification belongs to the owner's company and to ONE person (the
-- owner, or a company member working in the company through the signed role gate). Events are derived
-- idempotently from existing records (one row per person, event and source key; never duplicated):
--  task_assigned (open task whose «Responsable» is this person), task_due (open task due within the
--  person's reminder window or overdue; unassigned tasks go to the owner), client_message (customer
--  message in a job thread), quote_accepted / quote_changes (customer answer to a shared quote),
--  invoice_paid (payment applied to an invoice draft, not voided), invoice_overdue (payment plan
--  installment overdue after the grace days), bid_received (vendor bid response).
-- Email is ONLY a mock draft stored with delivery='draft_not_sent': nothing is ever sent, no push.
-- Patterns: RLS on, service_role-only, CAS 40001 on preferences, idempotent actionId receipts,
-- immutable history/receipts/drafts, America/Costa_Rica dates.
begin;
create table if not exists public.pro_notification_settings(
 owner_id uuid not null references public.profiles(id) on delete cascade,person_id uuid not null references public.profiles(id) on delete cascade,
 prefs jsonb not null default '{}'::jsonb check(jsonb_typeof(prefs)='object'),
 due_soon_days integer not null default 2 check(due_soon_days between 0 and 14),
 overdue_grace_days integer not null default 0 check(overdue_grace_days between 0 and 30),
 revision integer not null default 1 check(revision>0),updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,person_id));
create table if not exists public.pro_notification_settings_history(
 owner_id uuid not null,person_id uuid not null,action_id uuid not null,before_row jsonb,after_row jsonb not null,at timestamptz not null default clock_timestamp(),
 primary key(owner_id,person_id,action_id));
create table if not exists public.pro_notifications(
 owner_id uuid not null references public.profiles(id) on delete cascade,person_id uuid not null references public.profiles(id) on delete cascade,
 id uuid not null default gen_random_uuid(),event text not null check(event in('task_assigned','task_due','client_message','quote_accepted','quote_changes','invoice_paid','invoice_overdue','bid_received')),
 source_key text not null check(length(source_key) between 1 and 300),
 title text not null check(length(title) between 1 and 200),body text not null default '' check(length(body)<=400),
 link jsonb not null default '{}'::jsonb check(jsonb_typeof(link)='object'),
 created_at timestamptz not null default clock_timestamp(),read_at timestamptz,
 primary key(owner_id,person_id,id),unique(owner_id,person_id,event,source_key));
create index if not exists pro_notifications_page on public.pro_notifications(owner_id,person_id,created_at desc,id desc);
create index if not exists pro_notifications_unread on public.pro_notifications(owner_id,person_id) where read_at is null;
-- Email channel = mock draft only (never sent).
create table if not exists public.pro_notification_email_drafts(
 owner_id uuid not null,person_id uuid not null,notification_id uuid not null,subject text not null,body text not null,
 delivery text not null default 'draft_not_sent' check(delivery='draft_not_sent'),created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,person_id,notification_id),foreign key(owner_id,person_id,notification_id) references public.pro_notifications(owner_id,person_id,id) on delete cascade);
create table if not exists public.pro_notification_actions(
 owner_id uuid not null,person_id uuid not null,action_id uuid not null,input_hash text not null,result jsonb not null,at timestamptz not null default clock_timestamp(),
 primary key(owner_id,person_id,action_id));

create or replace function public.pro_notification_events() returns text[] language sql immutable security invoker set search_path=public,pg_temp as $$
 select array['task_assigned','task_due','client_message','quote_accepted','quote_changes','invoice_paid','invoice_overdue','bid_received']
$$;
create or replace function public.pro_notification_person_ok(p_owner uuid,p_person uuid) returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(public.pro_private_work_tools_enabled(p_owner),false) and p_person is not null and public.pro_role_of(p_person,p_owner) is not null
$$;
create or replace function public.pro_notification_settings_json(p_owner uuid,p_person uuid) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('revision',coalesce(s.revision,0),'dueSoonDays',coalesce(s.due_soon_days,2),'overdueGraceDays',coalesce(s.overdue_grace_days,0),
  'prefs',(select jsonb_object_agg(e,jsonb_build_object('inApp',coalesce((s.prefs->e->>'inApp')::boolean,true),'email',coalesce((s.prefs->e->>'email')::boolean,false))) from unnest(public.pro_notification_events()) e))
 from (select 1) one left join public.pro_notification_settings s on s.owner_id=p_owner and s.person_id=p_person
$$;
create or replace function public.pro_notification_enabled(p_settings jsonb,p_event text,p_channel text) returns boolean language sql immutable security invoker set search_path=public,pg_temp as $$
 select coalesce((p_settings->'prefs'->p_event->>p_channel)::boolean,p_channel='inApp')
$$;
create or replace function public.pro_notification_person_name(p_owner uuid,p_person uuid) returns text language sql stable security invoker set search_path=public,pg_temp as $$
 select case when p_person=p_owner then (select nullif(btrim(full_name),'') from public.profiles where id=p_owner)
  else (select nullif(btrim(member_name),'') from public.pro_company_members where owner_id=p_owner and member_user_id=p_person and active limit 1) end
$$;

-- Derive the person's notifications from existing records (idempotent; no duplicates; no deletes).
create or replace function public.pro_notifications_sync(p_owner uuid,p_person uuid,p_today date) returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare st jsonb;who text;n integer;plan record;item jsonb;overdue jsonb:='[]'::jsonb;
begin
 if not public.pro_notification_person_ok(p_owner,p_person) then raise exception 'Forbidden' using errcode='42501';end if;
 st:=public.pro_notification_settings_json(p_owner,p_person);who:=public.pro_notification_person_name(p_owner,p_person);
 -- Overdue payment-plan installments (after the person's grace days), from the plan's own state.
 for plan in select id,work_id from public.pro_payment_plans where owner_id=p_owner and status='active' limit 200 loop
  for item in select value from jsonb_array_elements(coalesce(public.pro_payment_plan_state(p_owner,plan.id,p_today-(st->>'overdueGraceDays')::integer)->'items','[]'::jsonb)) loop
   if item->>'status'='overdue' then overdue:=overdue||jsonb_build_array(jsonb_build_object('key',plan.id::text||':'||coalesce(item->>'seq','')||':'||coalesce(item->>'dueDate',''),
    'title',left(coalesce((select service from public.pro_work where user_id=p_owner and id=plan.work_id),'Plan de pagos'),200),'body',coalesce(item->>'dueDate',''),
    'link',jsonb_build_object('tab','pro_agenda','cita',plan.work_id,'vistaTrabajo','costs','due',item->>'dueDate','amountCents',coalesce((item->>'amountCents')::bigint,0)-coalesce((item->>'appliedCents')::bigint,0))));end if;
  end loop;
 end loop;
 -- One statement, no temporary tables; only enabled in-app events become notifications; email drafts
 -- only where the person chose email (never sent).
 with events(event,source_key,title,body,link,at) as(
  -- Tasks assigned to this person (by its name as «Responsable»).
  select 'task_assigned',t.id::text||':'||lower(t.assignee),left(t.title,200),left(w.service,400),jsonb_build_object('tab','pro_agenda','cita',t.work_id,'vistaTrabajo','tasks'),t.updated_at
   from public.pro_work_tasks t join public.pro_work w on w.user_id=t.owner_id and w.id=t.work_id
   where who is not null and t.owner_id=p_owner and not t.archived and t.status='open' and lower(btrim(t.assignee))=lower(who) and t.updated_at>clock_timestamp()-interval '60 days'
  union all
  -- Due soon / overdue tasks of this person (unassigned tasks: the owner).
  select 'task_due',t.id::text||':'||t.due_date::text,left(t.title,200),left(w.service,400),jsonb_build_object('tab','pro_agenda','cita',t.work_id,'vistaTrabajo','tasks','due',t.due_date::text,'overdue',t.due_date<p_today),clock_timestamp()
   from public.pro_work_tasks t join public.pro_work w on w.user_id=t.owner_id and w.id=t.work_id
   where t.owner_id=p_owner and not t.archived and t.status='open' and t.due_date is not null and t.due_date<=p_today+(st->>'dueSoonDays')::integer and t.due_date>=p_today-30
    and (who is not null and lower(btrim(t.assignee))=lower(who) or btrim(t.assignee)='' and p_person=p_owner)
  union all
  -- Customer messages in job threads (last 30 days).
  select 'client_message',m.id::text,left(coalesce(nullif(m.author_name,''),'Cliente'),200),left(m.body,400),jsonb_build_object('tab','pro_agenda','cita',m.work_id,'vistaTrabajo','messages'),m.created_at
   from public.pro_work_messages m where m.owner_id=p_owner and m.side='client' and m.created_at>clock_timestamp()-interval '30 days'
  union all
  -- Customer answers to shared quotes.
  select case s.status when 'accepted' then 'quote_accepted' else 'quote_changes' end,p.id::text||':'||s.status||':'||s.revision,left(e.title,200),'',jsonb_build_object('tab','quotes','estimacionPrivada',p.estimate_id::text),p.created_at
   from public.pro_private_estimate_publications p join public.pro_private_estimate_publication_states s on s.publication_id=p.id join public.pro_private_estimates e on e.owner_id=p.owner_id and e.id=p.estimate_id
   where p.owner_id=p_owner and s.status in('accepted','changes_requested') and p.created_at>clock_timestamp()-interval '90 days'
  union all
  -- Payments applied to invoice drafts (not voided).
  select 'invoice_paid',a.id::text,left(d.title,200),a.amount_cents::text,jsonb_build_object('tab','pro_billing','amountCents',a.amount_cents),a.created_at
   from public.pro_invoice_payment_applications a join public.pro_invoice_drafts d on d.user_id=a.user_id and d.id=a.draft_id
   where a.user_id=p_owner and a.created_at>clock_timestamp()-interval '30 days' and not exists(select 1 from public.pro_invoice_payment_voids v where v.user_id=a.user_id and v.application_id=a.id)
  union all
  select 'invoice_overdue',o->>'key',o->>'title',o->>'body',o->'link',clock_timestamp() from jsonb_array_elements(overdue) o
  union all
  -- Vendor bid responses.
  select 'bid_received',r.package_id::text||':'||r.supplier_id::text,left(b.title,200),left(coalesce((select v.name from public.pro_expense_suppliers v where v.user_id=r.owner_id and v.id=r.supplier_id),''),400),jsonb_build_object('tab','pro_agenda','cita',b.work_id,'vistaTrabajo','bids'),r.recorded_at
   from public.pro_bid_responses r join public.pro_bid_packages b on b.owner_id=r.owner_id and b.id=r.package_id
   where r.owner_id=p_owner and r.recorded_at>clock_timestamp()-interval '30 days'),
 ins as(insert into public.pro_notifications(owner_id,person_id,event,source_key,title,body,link,created_at)
  select distinct on(e.event,e.source_key) p_owner,p_person,e.event,e.source_key,e.title,e.body,e.link,least(coalesce(e.at,clock_timestamp()),clock_timestamp())
  from events e where public.pro_notification_enabled(st,e.event,'inApp')
  on conflict(owner_id,person_id,event,source_key) do nothing returning *),
 drafts as(insert into public.pro_notification_email_drafts(owner_id,person_id,notification_id,subject,body)
  select i.owner_id,i.person_id,i.id,left('ContrataCR Pro: '||i.title,200),i.title||case when i.body<>'' then E'\n'||i.body else '' end
  from ins i where public.pro_notification_enabled(st,i.event,'email') returning 1)
 select count(*) into n from ins;
 return n;
end $$;

create or replace function public.pro_notification_json(n public.pro_notifications) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',n.id,'event',n.event,'title',n.title,'body',n.body,'link',n.link,'createdAt',n.created_at,'read',n.read_at is not null,
  'emailDraft',exists(select 1 from public.pro_notification_email_drafts d where d.owner_id=n.owner_id and d.person_id=n.person_id and d.notification_id=n.id))
$$;
-- Read (syncs first): page of notifications, unread count, settings.
create or replace function public.pro_notifications_read(p_owner uuid,p_person uuid,p_filter text,p_after jsonb,p_today date) returns jsonb
language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare rows_json jsonb;unread integer;after_at timestamptz;after_id uuid;has_more boolean;
begin
 if p_filter not in('unread','all') or p_today is null then raise exception 'Invalid notification query' using errcode='22023';end if;
 if p_after is not null then
  if jsonb_typeof(p_after)<>'object' or not coalesce(p_after->>'id','')~'^[0-9a-f-]{36}$' then raise exception 'Invalid cursor' using errcode='22023';end if;
  after_at:=(p_after->>'at')::timestamptz;after_id:=(p_after->>'id')::uuid;
 end if;
 perform public.pro_notifications_sync(p_owner,p_person,p_today);
 select count(*) into unread from public.pro_notifications where owner_id=p_owner and person_id=p_person and read_at is null;
 select coalesce(jsonb_agg(public.pro_notification_json(n) order by n.created_at desc,n.id desc),'[]'::jsonb),count(*)>30 into rows_json,has_more from (
  select * from public.pro_notifications where owner_id=p_owner and person_id=p_person and (p_filter='all' or read_at is null)
   and (after_at is null or (created_at,id)<(after_at,after_id)) order by created_at desc,id desc limit 31) n;
 if has_more then select jsonb_agg(x) into rows_json from (select x from jsonb_array_elements(rows_json) with ordinality t(x,i) where i<=30 order by i) z;end if;
 return jsonb_build_object('items',rows_json,'unread',unread,'hasMore',has_more,
  'next',case when has_more then jsonb_build_object('at',rows_json->29->>'createdAt','id',rows_json->29->>'id') end,
  'settings',public.pro_notification_settings_json(p_owner,p_person));
end $$;
-- Unread count only (header badge) — also syncs so the badge is current.
create or replace function public.pro_notifications_unread(p_owner uuid,p_person uuid,p_today date) returns integer
language plpgsql volatile security invoker set search_path=public,pg_temp as $$
begin perform public.pro_notifications_sync(p_owner,p_person,p_today);
 return (select count(*) from public.pro_notifications where owner_id=p_owner and person_id=p_person and read_at is null);end $$;

create or replace function public.pro_notifications_mutate(p_owner uuid,p_person uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;act text;hash text;prior public.pro_notification_actions;answer jsonb;cur public.pro_notification_settings;before_json jsonb;ids uuid[];changed integer:=0;p jsonb;e text;
begin
 if not public.pro_notification_person_ok(p_owner,p_person) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input)<>'object' or not coalesce(p_input->>'actionId','')~'^[0-9a-f-]{36}$' then raise exception 'Invalid input' using errcode='22023';end if;
 aid:=(p_input->>'actionId')::uuid;act:=p_input->>'action';hash:=encode(sha256(convert_to((p_input-'actionId')::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('pro_notifications:'||p_owner::text||':'||p_person::text,0));
 select * into prior from public.pro_notification_actions where owner_id=p_owner and person_id=p_person and action_id=aid;
 if found then if prior.input_hash<>hash then raise exception 'Action id reused' using errcode='40001';end if;return prior.result||jsonb_build_object('replayed',true);end if;
 if act in('read','unread') then
  if jsonb_typeof(p_input->'ids')<>'array' or jsonb_array_length(p_input->'ids') not between 1 and 100 then raise exception 'Invalid ids' using errcode='22023';end if;
  select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_input->'ids');
  update public.pro_notifications set read_at=case when act='read' then coalesce(read_at,clock_timestamp()) else null end
   where owner_id=p_owner and person_id=p_person and id=any(ids) and (read_at is null)=(act='read');
  get diagnostics changed=row_count;
 elsif act='read_all' then
  update public.pro_notifications set read_at=clock_timestamp() where owner_id=p_owner and person_id=p_person and read_at is null;get diagnostics changed=row_count;
 elsif act='settings' then
  if not coalesce(p_input->>'revision','')~'^[0-9]+$' or jsonb_typeof(p_input->'prefs')<>'object' or not coalesce(p_input->>'dueSoonDays','')~'^[0-9]+$' or not coalesce(p_input->>'overdueGraceDays','')~'^[0-9]+$' then raise exception 'Invalid settings' using errcode='22023';end if;
  for e in select jsonb_object_keys(p_input->'prefs') loop
   if not e=any(public.pro_notification_events()) or jsonb_typeof(p_input->'prefs'->e->'inApp')<>'boolean' or jsonb_typeof(p_input->'prefs'->e->'email')<>'boolean' or (select count(*) from jsonb_object_keys(p_input->'prefs'->e))<>2 then raise exception 'Invalid preference' using errcode='22023';end if;
  end loop;
  if (p_input->>'dueSoonDays')::integer not between 0 and 14 or (p_input->>'overdueGraceDays')::integer not between 0 and 30 then raise exception 'Invalid schedule' using errcode='22023';end if;
  select * into cur from public.pro_notification_settings where owner_id=p_owner and person_id=p_person for update;
  if coalesce(cur.revision,0)<>(p_input->>'revision')::integer then raise exception 'Settings changed' using errcode='40001';end if;
  before_json:=case when cur.owner_id is null then null else public.pro_notification_settings_json(p_owner,p_person) end;
  insert into public.pro_notification_settings(owner_id,person_id,prefs,due_soon_days,overdue_grace_days,revision,updated_at)
   values(p_owner,p_person,p_input->'prefs',(p_input->>'dueSoonDays')::integer,(p_input->>'overdueGraceDays')::integer,1,clock_timestamp())
   on conflict(owner_id,person_id) do update set prefs=excluded.prefs,due_soon_days=excluded.due_soon_days,overdue_grace_days=excluded.overdue_grace_days,revision=public.pro_notification_settings.revision+1,updated_at=clock_timestamp();
  insert into public.pro_notification_settings_history(owner_id,person_id,action_id,before_row,after_row) values(p_owner,p_person,aid,before_json,public.pro_notification_settings_json(p_owner,p_person));
  changed:=1;
 else raise exception 'Invalid action' using errcode='22023';end if;
 answer:=jsonb_build_object('action',act,'changed',changed,'unread',(select count(*) from public.pro_notifications where owner_id=p_owner and person_id=p_person and read_at is null),'settings',public.pro_notification_settings_json(p_owner,p_person));
 insert into public.pro_notification_actions(owner_id,person_id,action_id,input_hash,result) values(p_owner,p_person,aid,hash,answer);
 return answer;
end $$;

create or replace function public.pro_notification_immutable() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Notification history, receipts and email drafts are immutable' using errcode='23514';end $$;
do $$declare t text;f record;begin
 foreach t in array array['pro_notification_settings','pro_notification_settings_history','pro_notifications','pro_notification_email_drafts','pro_notification_actions'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select,insert,update,delete on public.%I to service_role',t);end loop;
 foreach t in array array['pro_notification_settings_history','pro_notification_email_drafts','pro_notification_actions'] loop
  execute format('drop trigger if exists pro_notification_immutable on public.%I',t);execute format('create trigger pro_notification_immutable before update or delete on public.%I for each row when (pg_trigger_depth()=0) execute function public.pro_notification_immutable()',t);end loop;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_notification_events','pro_notification_person_ok','pro_notification_settings_json','pro_notification_enabled','pro_notification_person_name','pro_notifications_sync','pro_notification_json','pro_notifications_read','pro_notifications_unread','pro_notifications_mutate','pro_notification_immutable') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
commit;
notify pgrst,'reload schema';
