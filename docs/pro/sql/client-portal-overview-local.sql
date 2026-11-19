-- LOCAL PRO ONLY. Round 12 (2026-11-15): customer portal (Houzz Pro parity rows 33, 22, 24, 28-31) and
-- Round 11 leftovers.
--  * Project overview for the linked customer (row 33): one read that summarises what the customer of a
--    job can already see, built ONLY from the existing customer readers (same audience and visibility
--    switches: quotes, contracts, selections, extras/changes, payment plan, finances, schedule, messages,
--    files). Approvals waiting for the customer, money (when «Finanzas» is on), next installment (when
--    «Plan de pagos» is on), schedule (when «Cronograma» is on), unread messages and latest files (when
--    «Archivos» is on). Nothing new is disclosed: a hidden section stays null.
--  * Customer bell reminders for the professional's payment plan (row 57 leftover): in-app notifications
--    (main `notifications` table, own type `pro_payment_plan_client`, push suppressed, never email/SMS)
--    for an installment due within 3 days or overdue, only for a linked customer whose plan section is
--    visible. Idempotent through a receipt per plan revision/installment/due date/action/recipient.
--    ContrataCR never finances anything: this is the professional's own plan, no interest, no third party.
--  * Printable selections sheet (Round 11 leftover): respects «hide price» per item (the link was never
--    printed). Hidden prices are not printed nor added to the approved total.
-- Patterns: RLS on, service_role only, security invoker, immutable receipts, CR dates (America/Costa_Rica).
begin;

-- ===== Customer project overview =====
create or replace function public.pro_client_project_overview(p_actor uuid,p_request uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r public.pro_appointment_requests;w public.pro_work;settings public.pro_client_dashboards;today date:=(now() at time zone 'America/Costa_Rica')::date;
 quotes jsonb;contracts jsonb;selections jsonb;changes jsonb;plan jsonb;finances jsonb;schedule jsonb;files jsonb;approvals jsonb:='[]'::jsonb;
 next_item jsonb;overdue_n integer:=0;overdue_c bigint:=0;installments jsonb;money jsonb;sched jsonb;msgs jsonb;recent jsonb;next_ms jsonb;total_n bigint:=0;done_n bigint:=0;last_msg public.pro_work_messages;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_request is null then raise exception 'Invalid overview query' using errcode='22023';end if;
 select * into r from public.pro_appointment_requests where id=p_request and client_user_id=p_actor and work_id is not null;
 if not found then return null;end if;
 select * into w from public.pro_work where user_id=r.owner_id and id=r.work_id;
 if not found or r.status not in('confirmed','completed') then return jsonb_build_object('visible',false);end if;
 select * into settings from public.pro_client_dashboards where owner_id=r.owner_id and work_id=r.work_id;
 -- Approvals waiting for this customer (each from its own customer reader).
 quotes:=coalesce(public.pro_client_project_quotes_read(p_actor,p_request)->'items','[]'::jsonb);
 approvals:=approvals||coalesce((select jsonb_agg(jsonb_build_object('kind','quote','id',q->>'publicationId','title',q->>'title','amountCents',q->'totalCents','currency',q->>'currency','date',q->>'sharedAt') order by q->>'sharedAt')
  from jsonb_array_elements(quotes) q where q->>'status'='shared'),'[]'::jsonb);
 contracts:=public.pro_contracts_client_read(p_actor,p_request);
 if coalesce((contracts->>'visible')::boolean,false) then
  approvals:=approvals||coalesce((select jsonb_agg(jsonb_build_object('kind','contract','id',c->>'id','title',coalesce(c->'content'->>'title',c->>'code'),'code',c->>'code','date',c->>'sharedAt'))
   from jsonb_array_elements(contracts->'contracts') c where coalesce((c->>'canRespond')::boolean,false)),'[]'::jsonb);
 end if;
 selections:=public.pro_work_selections_client_read(p_actor,p_request);
 if coalesce((selections->>'visible')::boolean,false) then
  approvals:=approvals||coalesce((select jsonb_agg(jsonb_build_object('kind','selection','id',i->>'id','title',i->>'name','area',a->>'name','date',i->>'dueDate','overdue',(i->>'dueDate') is not null and (i->>'dueDate')::date<today) order by i->>'dueDate' nulls last)
   from jsonb_array_elements(selections->'areas') a cross join lateral jsonb_array_elements(a->'items') i where i->>'state'='pending_client'),'[]'::jsonb);
 end if;
 changes:=public.pro_work_changes_page(p_actor,'',p_request,null);
 if changes is not null and changes->>'side'='client' then
  approvals:=approvals||coalesce((select jsonb_agg(jsonb_build_object('kind','change','id',c->>'id','title',c->>'reason','amountCents',c->'deltaCents','date',c->>'createdAt'))
   from jsonb_array_elements(changes->'items') c where c->>'status'='proposed' and not coalesce((c->>'stale')::boolean,false)),'[]'::jsonb);
 end if;
 plan:=public.pro_payment_plan_client_read(p_actor,p_request);
 if coalesce((plan->>'visible')::boolean,false) and jsonb_typeof(plan->'plan')='object' then
  if coalesce((plan->'plan'->>'canAccept')::boolean,false) then
   approvals:=approvals||jsonb_build_array(jsonb_build_object('kind','payment_plan','id',plan->'plan'->>'planId','title',null,'amountCents',plan->'plan'->'totalCents','date',plan->'plan'->>'revisionCreatedAt'));
  end if;
  select i into next_item from jsonb_array_elements(plan->'plan'->'items') i where i->>'status' in('pending','partial','overdue') and i->>'dueDate' is not null order by (i->>'dueDate')::date,(i->>'seq')::integer limit 1;
  select count(*),coalesce(sum((i->>'amountCents')::bigint-(i->>'appliedCents')::bigint),0) into overdue_n,overdue_c from jsonb_array_elements(plan->'plan'->'items') i where i->>'status'='overdue';
  installments:=jsonb_build_object('remainingCents',plan->'plan'->'remainingCents','overdueCount',overdue_n,'overdueCents',overdue_c,
   'next',case when next_item is null then null else jsonb_build_object('dueDate',next_item->>'dueDate','amountCents',(next_item->>'amountCents')::bigint-(next_item->>'appliedCents')::bigint,'status',next_item->>'status') end);
 end if;
 finances:=public.pro_client_finances_client_read(p_actor,p_request);
 if coalesce((finances->>'visible')::boolean,false) then
  money:=jsonb_build_object('agreedCents',finances->'summary'->'agreedCents','paidCents',finances->'summary'->'paidCents','balanceCents',finances->'summary'->'balanceCents','invoicedCents',finances->'summary'->'invoicedCents');
 end if;
 schedule:=public.pro_work_schedule_client_read(p_actor,p_request);
 if coalesce((schedule->>'visible')::boolean,false) then
  select m into next_ms from jsonb_array_elements(schedule->'milestones') m where (m->>'date')::date>=today order by (m->>'date')::date limit 1;
  select coalesce(sum((p->>'total')::bigint),0),coalesce(sum((p->>'done')::bigint),0) into total_n,done_n from jsonb_array_elements(schedule->'phases') p;
  total_n:=total_n+coalesce((schedule->'general'->>'total')::bigint,0);done_n:=done_n+coalesce((schedule->'general'->>'done')::bigint,0);
  sched:=jsonb_build_object('nextMilestone',next_ms,'total',total_n,'done',done_n,
   'plannedEnd',(select max(x) from (select p->>'plannedEnd' x from jsonb_array_elements(schedule->'phases') p union all select schedule->'general'->>'plannedEnd') y));
 end if;
 if public.pro_work_message_side(p_actor,p_request)='client' then
  select * into last_msg from public.pro_work_messages where request_id=p_request order by created_at desc,id desc limit 1;
  msgs:=jsonb_build_object('unread',public.pro_work_message_unread(p_request,'client'),
   'last',case when last_msg.id is null then null else jsonb_build_object('side',last_msg.side,'body',left(last_msg.body,140),'createdAt',last_msg.created_at) end);
 end if;
 if coalesce(settings.show_files,true) then
  files:=public.pro_work_files_client_read(p_actor,p_request,null);
  select coalesce(jsonb_agg(jsonb_build_object('id',f->>'id','name',f->>'name','mimeType',f->>'mimeType','publishedAt',f->>'publishedAt')),'[]'::jsonb) into recent
   from (select f from jsonb_array_elements(coalesce(files->'items','[]'::jsonb)) f limit 3) x;
  recent:=jsonb_build_object('items',recent,'more',jsonb_array_length(coalesce(files->'items','[]'::jsonb))>3);
 end if;
 return jsonb_build_object('visible',true,'requestId',p_request,'today',to_char(today,'YYYY-MM-DD'),'workTitle',w.service,
  'professionalName',coalesce((select nullif(btrim(business_name),'') from public.professionals where profile_id=r.owner_id limit 1),public.pro_team_name(r.owner_id)),
  'stage',case when coalesce(w.cancelled,false) then 'cancelled' when w.stage='completed' or r.status='completed' then 'completed' else coalesce(w.stage,'new') end,
  'nextVisit',case when r.origin<>'project_invite' and not coalesce(w.cancelled,false) and w.stage='scheduled' and pro_instant(w.start)>now() then pro_appointment_time(pro_instant(w.start)) end,
  'approvals',approvals,'finances',money,'installments',installments,'schedule',sched,'messages',msgs,'files',recent);
end $$;

-- ===== Printable selections sheet: respect «hide price» =====
create or replace function public.pro_work_selection_print_read(p_owner uuid,p_work text) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare w public.pro_work;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into w from public.pro_work where user_id=p_owner and id=p_work;if not found then return null;end if;
 return jsonb_build_object('workId',w.id,'service',w.service,'client',coalesce(w.client,''),'today',public.pro_work_selection_today(),
  'areas',coalesce((select jsonb_agg(jsonb_build_object('name',a.name,'items',x.items) order by a.position) from public.pro_work_selection_areas a
   join lateral(select jsonb_agg(jsonb_build_object('name',i.name,'state',public.pro_work_selection_state(i),'dueDate',i.due_date,'approvedAt',i.approved_at,'tracking',public.pro_work_selection_tracking_json(p_owner,i.id)->>'status',
     'priceHidden',coalesce(v.hide_price,false),
     'option',(select jsonb_build_object('name',o.name,'brand',o.brand,'quantity',o.quantity,'unitCents',case when coalesce(v.hide_price,false) then null else o.unit_cents end,'totalCents',case when coalesce(v.hide_price,false) then null else o.total_cents end,'approved',o.id=i.approved_option_id) from public.pro_work_selection_options o where o.owner_id=i.owner_id and o.id=coalesce(i.approved_option_id,i.recommended_option_id)),
     'optionCount',(select count(*) from public.pro_work_selection_options o where o.owner_id=i.owner_id and o.item_id=i.id and not o.archived)) order by i.position) items
    from public.pro_work_selection_items i left join public.pro_work_selection_item_visibility v on v.owner_id=i.owner_id and v.item_id=i.id
    where i.owner_id=a.owner_id and i.area_id=a.id and not i.archived) x on x.items is not null
   where a.owner_id=p_owner and a.work_id=p_work and not a.archived),'[]'::jsonb));
end $$;

-- ===== Customer bell: payment plan installments due soon / overdue =====
do $$declare prior text;begin
 select pg_get_expr(conbin,conrelid) into prior from pg_constraint where conrelid='public.notifications'::regclass and conname='notifications_type_check' and contype='c';
 if prior is null then raise exception 'Notification type contract not found';end if;
 if position('pro_payment_plan_client' in prior)=0 then
  alter table public.notifications drop constraint notifications_type_check;
  execute format('alter table public.notifications add constraint notifications_type_check check ((%s) or type in (''pro_payment_plan_client''))',prior);
 end if;
end $$;
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='public.notifications'::regclass and conname='pro_payment_plan_client_notification_data_check') then
  alter table public.notifications add constraint pro_payment_plan_client_notification_data_check check(
   type<>'pro_payment_plan_client' or coalesce((
    data is not null and jsonb_typeof(data)='object' and data @> '{"version":1,"push_suppressed":true}'::jsonb
    and data ?& array['version','request_id','action','due_date','link','push_suppressed']
    and (data-array['version','request_id','action','due_date','link','push_suppressed'])='{}'::jsonb
    and jsonb_typeof(data->'request_id')='string' and (data->>'request_id')~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and jsonb_typeof(data->'action')='string' and data->>'action' in('installment_due_soon','installment_overdue')
    and jsonb_typeof(data->'due_date')='string' and (data->>'due_date')~'^\d{4}-\d{2}-\d{2}$'
    and jsonb_typeof(data->'link')='string' and data->>'link'='/dashboard/profesional?tab=appointments&citaSolicitud='||(data->>'request_id')
   ),false));
 end if;
end $$;
create table if not exists public.pro_client_installment_notices(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 plan_id uuid not null,plan_revision integer not null check(plan_revision>0),seq integer not null check(seq>=0),due_date date not null,
 action text not null check(action in('installment_due_soon','installment_overdue')),
 recipient_id uuid not null references public.profiles(id) on delete cascade,
 request_id uuid not null references public.pro_appointment_requests(id) on delete cascade,
 notification_id uuid references public.notifications(id) on delete set null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(plan_id,plan_revision,seq,due_date,action,recipient_id));
alter table public.pro_client_installment_notices enable row level security;
revoke all on public.pro_client_installment_notices from public,anon,authenticated;
grant all on public.pro_client_installment_notices to service_role;
-- Receipts are immutable once linked; a dismissed (deleted) notification does not reissue the reminder.
create or replace function public.pro_client_installment_notice_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' then raise exception 'Installment notice receipts are immutable' using errcode='23514';end if;
 if (to_jsonb(new)-'notification_id') is distinct from (to_jsonb(old)-'notification_id') or (old.notification_id is not null and new.notification_id is not null and new.notification_id<>old.notification_id) then
  raise exception 'Installment notice receipts are immutable' using errcode='23514';end if;
 return new;
end $$;
drop trigger if exists pro_client_installment_notice_immutable on public.pro_client_installment_notices;
create trigger pro_client_installment_notice_immutable before update or delete on public.pro_client_installment_notices for each row
 when (pg_trigger_depth()=0) execute function public.pro_client_installment_notice_immutable();

create or replace function public.pro_client_installment_reminders_run(p_owner uuid,p_today date default null,p_recipient uuid default null) returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare today date:=coalesce(p_today,(now() at time zone 'America/Costa_Rica')::date);plan record;req record;state jsonb;item jsonb;act text;due date;n integer:=0;nid uuid;
begin
 if p_owner is null or not exists(select 1 from public.profiles where id=p_owner and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 for plan in select id,work_id from public.pro_payment_plans where owner_id=p_owner and status='active' order by id limit 200 loop
  for req in select r.id,r.client_user_id from public.pro_appointment_requests r
    join public.pro_client_dashboards d on d.owner_id=r.owner_id and d.work_id=r.work_id and coalesce(d.show_payment_plan,false)
    join public.profiles p on p.id=r.client_user_id and not coalesce(p.is_disabled,false)
    where r.owner_id=p_owner and r.work_id=plan.work_id and r.client_user_id is not null and r.client_user_id<>p_owner and r.status in('confirmed','completed')
     and (p_recipient is null or r.client_user_id=p_recipient) loop
   state:=public.pro_payment_plan_state(p_owner,plan.id,today);
   for item in select value from jsonb_array_elements(coalesce(state->'items','[]'::jsonb)) loop
    due:=(item->>'dueDate')::date;
    act:=case when item->>'status'='overdue' then 'installment_overdue'
     when item->>'status' in('pending','partial') and due between today and today+3 then 'installment_due_soon' end;
    if act is null or due is null then continue;end if;
    insert into public.pro_client_installment_notices(owner_id,plan_id,plan_revision,seq,due_date,action,recipient_id,request_id)
     values(p_owner,plan.id,(state->>'revision')::integer,(item->>'seq')::integer,due,act,req.client_user_id,req.id) on conflict do nothing;
    if not found then continue;end if;
    insert into public.notifications(user_id,type,title,message,data,read) values(req.client_user_id,'pro_payment_plan_client',
     case act when 'installment_overdue' then 'Cuota vencida' else 'Cuota próxima a vencer' end,
     case act when 'installment_overdue' then 'Una cuota de su plan de pagos está vencida. Revísela en su proyecto.' else 'Una cuota de su plan de pagos vence pronto. Revísela en su proyecto.' end,
     jsonb_build_object('version',1,'request_id',req.id,'action',act,'due_date',to_char(due,'YYYY-MM-DD'),'link','/dashboard/profesional?tab=appointments&citaSolicitud='||req.id::text,'push_suppressed',true),false)
     returning id into nid;
    update public.pro_client_installment_notices set notification_id=nid where plan_id=plan.id and plan_revision=(state->>'revision')::integer and seq=(item->>'seq')::integer and due_date=due and action=act and recipient_id=req.client_user_id;
    n:=n+1;
   end loop;
  end loop;
 end loop;
 return n;
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in(
  'pro_client_project_overview','pro_work_selection_print_read','pro_client_installment_notice_immutable','pro_client_installment_reminders_run') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
notify pgrst,'reload schema';
commit;
