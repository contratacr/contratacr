-- Pro family 61/62 (rows 61 and 62 of the parity register).
-- 1) Own idea-board templates: the owner saves the layout of a page (swatches, notes, free text, arrows, drawings; photos and items
--    are NOT kept because they belong to one job) and applies it to a new page. Owner-only, service_role only, optimistic revision,
--    strict element validation by the existing pro_mood_board_elements, idempotent receipts in pro_mood_board_actions, max 50 active.
-- 2) Notification event 'selection_decided': internal notice to the professional when the customer approves a selection or asks
--    for changes (derived idempotently from the immutable selection history; key = the decision's action id).
begin;
create table if not exists public.pro_mood_board_templates(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,
 name text not null check(length(btrim(name)) between 1 and 80),
 page_format text not null check(page_format in('wide','a4')),
 background text not null check(background~'^#[0-9a-f]{6}$'),
 elements jsonb not null check(jsonb_typeof(elements)='array' and jsonb_array_length(elements)<=60 and octet_length(elements::text)<=60000),
 archived boolean not null default false,
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,id)
);
create unique index if not exists pro_mood_board_template_name on public.pro_mood_board_templates(owner_id,lower(btrim(name))) where not archived;
alter table public.pro_mood_board_templates enable row level security;
revoke all on public.pro_mood_board_templates from public,anon,authenticated;
grant select,insert,update,delete on public.pro_mood_board_templates to service_role;
create or replace function public.pro_mood_template_json(p_row public.pro_mood_board_templates) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'name',p_row.name,'pageFormat',p_row.page_format,'background',p_row.background,'elements',p_row.elements,'revision',p_row.revision,'updatedAt',p_row.updated_at)
$$;
create or replace function public.pro_mood_template_read(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(public.pro_mood_template_json(t) order by lower(t.name)) from (select * from public.pro_mood_board_templates where owner_id=p_actor and not archived order by lower(name) limit 50) t),'[]'::jsonb));
end $$;
create or replace function public.pro_mood_template_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;aid uuid;tid uuid;rev integer;keys text[];expected text[];receipt public.pro_mood_board_actions;t public.pro_mood_board_templates;
 v_name text;v_format text;v_bg text;v_elements jsonb;result jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' then raise exception 'Invalid template action' using errcode='22023';end if;
 act:=p_input->>'action';
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 expected:=case act when 'create' then array['action','actionId','background','elements','id','name','pageFormat']
  when 'rename' then array['action','actionId','id','name','revision'] when 'archive' then array['action','actionId','id','revision'] end;
 if expected is null or keys is distinct from expected or jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'id') is distinct from 'string'
  or p_input?'revision' and (jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false) or (p_input->>'revision')::numeric not between 1 and 2147483646)
  then raise exception 'Invalid template fields' using errcode='22023';end if;
 aid:=(p_input->>'actionId')::uuid;tid:=(p_input->>'id')::uuid;rev:=(p_input->>'revision')::integer;
 if act in('create','rename') then
  v_name:=public.pro_mood_board_text(p_input->'name',80);if v_name is null then raise exception 'Template name required' using errcode='22023';end if;
 end if;
 if act='create' then
  v_format:=p_input->>'pageFormat';v_bg:=p_input->>'background';
  if v_format is null or v_format not in('wide','a4') or v_bg is null or v_bg !~ '^#[0-9a-f]{6}$' then raise exception 'Invalid template page' using errcode='22023';end if;
  if jsonb_typeof(p_input->'elements') is distinct from 'array' then raise exception 'Invalid elements' using errcode='22023';end if;
  -- A template keeps only the layout: photos and items belong to one job and are never stored here.
  if exists(select 1 from jsonb_array_elements(p_input->'elements') e where e.value->>'kind' in('image','product')) then raise exception 'Templates cannot hold photos or items' using errcode='22023';end if;
  v_elements:=public.pro_mood_board_elements(p_actor,'',p_input->'elements','[]'::jsonb);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-mood-template:'||p_actor::text,0));
 select * into receipt from public.pro_mood_board_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 if act='create' then
  if (select count(*) from public.pro_mood_board_templates where owner_id=p_actor and not archived)>=50 then raise exception 'Template limit reached' using errcode='54000';end if;
  insert into public.pro_mood_board_templates(owner_id,id,name,page_format,background,elements) values(p_actor,tid,v_name,v_format,v_bg,v_elements) returning * into t;
 else
  select * into t from public.pro_mood_board_templates where owner_id=p_actor and id=tid and not archived for update;
  if not found then raise exception 'Template unavailable' using errcode='P0002';end if;
  if t.revision<>rev then raise exception 'Template changed' using errcode='40001';end if;
  if act='rename' then update public.pro_mood_board_templates set name=v_name,revision=revision+1,updated_at=now() where owner_id=p_actor and id=tid returning * into t;
  else update public.pro_mood_board_templates set archived=true,revision=revision+1,updated_at=now() where owner_id=p_actor and id=tid returning * into t;end if;
 end if;
 result:=jsonb_build_object('template',public.pro_mood_template_json(t));
 insert into public.pro_mood_board_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ===== Row 62: internal notice when the customer decides a selection =====
-- New event derived (idempotently, key = the decision's action id) from the immutable selection history.
alter table public.pro_notifications drop constraint if exists pro_notifications_event_check;
alter table public.pro_notifications add constraint pro_notifications_event_check check(event in('task_assigned','task_due','client_message','quote_accepted','quote_changes','invoice_paid','invoice_overdue','bid_received','daily_log_missing','payment_plan_due','selection_decided'));
create or replace function public.pro_notification_events() returns text[] language sql immutable security invoker set search_path=public,pg_temp as $$
 select array['task_assigned','task_due','client_message','quote_accepted','quote_changes','invoice_paid','invoice_overdue','bid_received','daily_log_missing','payment_plan_due','selection_decided']
$$;
-- Same derivation as migration 309 plus the customer's selection decisions.
create or replace function public.pro_notifications_sync(p_owner uuid,p_person uuid,p_today date) returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare st jsonb;who text;n integer;plan record;item jsonb;overdue jsonb:='[]'::jsonb;due_soon jsonb:='[]'::jsonb;state jsonb;svc text;
begin
 if not public.pro_notification_person_ok(p_owner,p_person) then raise exception 'Forbidden' using errcode='42501';end if;
 st:=public.pro_notification_settings_json(p_owner,p_person);who:=public.pro_notification_person_name(p_owner,p_person);
 -- Overdue payment-plan installments (after the person's grace days), from the plan's own state.
 for plan in select id,work_id from public.pro_payment_plans where owner_id=p_owner and status='active' limit 200 loop
  svc:=left(coalesce((select service from public.pro_work where user_id=p_owner and id=plan.work_id),'Plan de pagos'),200);
  for item in select value from jsonb_array_elements(coalesce(public.pro_payment_plan_state(p_owner,plan.id,p_today-(st->>'overdueGraceDays')::integer)->'items','[]'::jsonb)) loop
   if item->>'status'='overdue' then overdue:=overdue||jsonb_build_array(jsonb_build_object('key',plan.id::text||':'||coalesce(item->>'seq','')||':'||coalesce(item->>'dueDate',''),
    'title',svc,'body',coalesce(item->>'dueDate',''),
    'link',jsonb_build_object('tab','pro_agenda','cita',plan.work_id,'vistaTrabajo','costs','due',item->>'dueDate','amountCents',coalesce((item->>'amountCents')::bigint,0)-coalesce((item->>'appliedCents')::bigint,0))));end if;
  end loop;
  -- Round 11: installments not paid yet and due within the person's «due soon» days (owner only).
  if p_person=p_owner then
   state:=public.pro_payment_plan_state(p_owner,plan.id,p_today);
   for item in select value from jsonb_array_elements(coalesce(state->'items','[]'::jsonb)) loop
    if item->>'status' in('pending','partial') and item->>'dueDate' is not null and (item->>'dueDate')::date between p_today and p_today+(st->>'dueSoonDays')::integer then
     due_soon:=due_soon||jsonb_build_array(jsonb_build_object('key',plan.id::text||':'||(state->>'revision')||':'||coalesce(item->>'seq','')||':'||(item->>'dueDate'),'title',svc,'body',item->>'dueDate',
      'link',jsonb_build_object('tab','pro_agenda','cita',plan.work_id,'vistaTrabajo','costs','due',item->>'dueDate','amountCents',coalesce((item->>'amountCents')::bigint,0)-coalesce((item->>'appliedCents')::bigint,0))));
    end if;
   end loop;
  end if;
 end loop;
 with events(event,source_key,title,body,link,at) as(
  select 'task_assigned',t.id::text||':'||lower(t.assignee),left(t.title,200),left(w.service,400),jsonb_build_object('tab','pro_agenda','cita',t.work_id,'vistaTrabajo','tasks'),t.updated_at
   from public.pro_work_tasks t join public.pro_work w on w.user_id=t.owner_id and w.id=t.work_id
   where who is not null and t.owner_id=p_owner and not t.archived and t.status='open' and lower(btrim(t.assignee))=lower(who) and t.updated_at>clock_timestamp()-interval '60 days'
  union all
  select 'task_due',t.id::text||':'||t.due_date::text,left(t.title,200),left(w.service,400),jsonb_build_object('tab','pro_agenda','cita',t.work_id,'vistaTrabajo','tasks','due',t.due_date::text,'overdue',t.due_date<p_today),clock_timestamp()
   from public.pro_work_tasks t join public.pro_work w on w.user_id=t.owner_id and w.id=t.work_id
   where t.owner_id=p_owner and not t.archived and t.status='open' and t.due_date is not null and t.due_date<=p_today+(st->>'dueSoonDays')::integer and t.due_date>=p_today-30
    and (who is not null and lower(btrim(t.assignee))=lower(who) or btrim(t.assignee)='' and p_person=p_owner)
  union all
  select 'client_message',m.id::text,left(coalesce(nullif(m.author_name,''),'Cliente'),200),left(m.body,400),jsonb_build_object('tab','pro_agenda','cita',m.work_id,'vistaTrabajo','messages'),m.created_at
   from public.pro_work_messages m where m.owner_id=p_owner and m.side='client' and m.created_at>clock_timestamp()-interval '30 days'
  union all
  select case s.status when 'accepted' then 'quote_accepted' else 'quote_changes' end,p.id::text||':'||s.status||':'||s.revision,left(e.title,200),'',jsonb_build_object('tab','quotes','estimacionPrivada',p.estimate_id::text),p.created_at
   from public.pro_private_estimate_publications p join public.pro_private_estimate_publication_states s on s.publication_id=p.id join public.pro_private_estimates e on e.owner_id=p.owner_id and e.id=p.estimate_id
   where p.owner_id=p_owner and s.status in('accepted','changes_requested') and p.created_at>clock_timestamp()-interval '90 days'
  union all
  select 'invoice_paid',a.id::text,left(d.title,200),a.amount_cents::text,jsonb_build_object('tab','pro_billing','amountCents',a.amount_cents),a.created_at
   from public.pro_invoice_payment_applications a join public.pro_invoice_drafts d on d.user_id=a.user_id and d.id=a.draft_id
   where a.user_id=p_owner and a.created_at>clock_timestamp()-interval '30 days' and not exists(select 1 from public.pro_invoice_payment_voids v where v.user_id=a.user_id and v.application_id=a.id)
  union all
  select 'invoice_overdue',o->>'key',o->>'title',o->>'body',o->'link',clock_timestamp() from jsonb_array_elements(overdue) o
  union all
  select 'payment_plan_due',o->>'key',o->>'title',o->>'body',o->'link',clock_timestamp() from jsonb_array_elements(due_soon) o
  union all
  select 'selection_decided',h.action_id::text,left(coalesce(i.name,'Selección'),200),left(coalesce(w.service,''),400),
   jsonb_build_object('tab','pro_agenda','cita',h.work_id,'vistaTrabajo','selections','decision',h.action),h.at
   from public.pro_work_selection_history h join public.pro_work_selection_items i on i.owner_id=h.owner_id and i.id=h.target_id
   join public.pro_work w on w.user_id=h.owner_id and w.id=h.work_id
   where h.owner_id=p_owner and h.side='client' and h.action in('approve','request_changes') and h.at>clock_timestamp()-interval '60 days'
  union all
  select 'bid_received',r.package_id::text||':'||r.supplier_id::text,left(b.title,200),left(coalesce((select v.name from public.pro_expense_suppliers v where v.user_id=r.owner_id and v.id=r.supplier_id),''),400),jsonb_build_object('tab','pro_agenda','cita',b.work_id,'vistaTrabajo','bids'),r.recorded_at
   from public.pro_bid_responses r join public.pro_bid_packages b on b.owner_id=r.owner_id and b.id=r.package_id
   where r.owner_id=p_owner and r.recorded_at>clock_timestamp()-interval '30 days'
  union all
  select 'daily_log_missing',w.id||':'||(p_today-1)::text,left(w.service,200),left(coalesce(w.client,''),400),jsonb_build_object('tab','pro_agenda','cita',w.id,'vistaTrabajo','updates','date',(p_today-1)::text),clock_timestamp()
   from public.pro_work w where p_person=p_owner and w.user_id=p_owner and not coalesce(w.cancelled,false)
    and not exists(select 1 from public.pro_daily_logs l where l.owner_id=p_owner and l.work_id=w.id and l.log_date=p_today-1 and not l.archived)
    and(exists(select 1 from public.pro_time_entries e where e.owner_id=p_owner and e.work_id=w.id and e.status='stopped' and e.recorded_on=p_today-1)
     or exists(select 1 from public.pro_work_timers t where t.owner_id=p_owner and t.work_id=w.id and(t.started_at at time zone 'America/Costa_Rica')::date=p_today-1)
     or exists(select 1 from public.pro_work_task_history h where h.owner_id=p_owner and h.work_id=w.id and h.action='complete' and(h.at at time zone 'America/Costa_Rica')::date=p_today-1))),
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
do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_notification_events','pro_notifications_sync','pro_mood_template_read','pro_mood_template_mutate') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
commit;
notify pgrst,'reload schema';
