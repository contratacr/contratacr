-- ContrataCR Pro, rows 42/44 (invoice from quote/job/milestone and progress billing): delivery and lifecycle of a billing document.
-- PRO_ENABLED stays false in production. NO fiscal issuance: the electronic invoice (row 58) is a separate step through its own adapter.
--  * The owner "sends" an invoice draft to the customer of the job: it becomes visible with its due date, and the first time the linked
--    customer opens the finances of the job the draft is marked as viewed. Optional e-mail goes through the sandbox reminder adapter
--    (the route passes only the result); nothing is sent for real by this migration.
--  * Lifecycle status derived live, never stored: draft, sent, viewed, partial, paid, overdue, void.
--    paid = balance <= 0 (balance = total - payments - applied credit notes, pro_credit_draft_balance); partial = something settled;
--    overdue = balance > 0 and due date before today (America/Costa_Rica). Due date = planned date + credit days (credit sale),
--    the planned date for a cash sale, or the creation day when no preparation exists.
--  * Events are append-only (send, resend, recall, view, email_sandbox_sent, email_failed). A recall hides the invoice again, nothing is deleted.
begin;
create table if not exists public.pro_invoice_deliveries(
 user_id uuid not null references public.profiles(id) on delete cascade,draft_id uuid not null,
 status text not null check(status in('sent','recalled')),sent_at timestamptz not null,viewed_at timestamptz,
 revision integer not null default 1 check(revision>0),updated_at timestamptz not null default clock_timestamp(),
 primary key(user_id,draft_id),foreign key(user_id,draft_id) references public.pro_invoice_drafts(user_id,id) on delete cascade);
create table if not exists public.pro_invoice_delivery_events(
 user_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,draft_id uuid not null,
 action text not null check(action in('send','resend','recall','view','email_sandbox_sent','email_failed')),
 at timestamptz not null default clock_timestamp(),provider_ref text check(provider_ref is null or length(provider_ref)<=120),
 primary key(user_id,id),foreign key(user_id,draft_id) references public.pro_invoice_drafts(user_id,id) on delete cascade);
create index if not exists pro_invoice_delivery_events_draft on public.pro_invoice_delivery_events(user_id,draft_id,at desc);
create table if not exists public.pro_invoice_delivery_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,input jsonb not null,result jsonb not null,
 at timestamptz not null default clock_timestamp(),primary key(actor_id,action_id));

create or replace function public.pro_invoice_due_date(p_owner uuid,p_draft uuid) returns date
language sql stable security invoker set search_path=public,pg_temp as $$
 select case when p.draft_id is null then (d.created_at at time zone 'America/Costa_Rica')::date
  when p.sale_condition='credit' then p.planned_date+p.credit_days else coalesce(p.planned_date,(d.created_at at time zone 'America/Costa_Rica')::date) end
 from public.pro_invoice_drafts d left join public.pro_invoice_preparation p on p.user_id=d.user_id and p.draft_id=d.id where d.user_id=p_owner and d.id=p_draft $$;

create or replace function public.pro_invoice_lifecycle(p_owner uuid,p_draft uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare d public.pro_invoice_drafts;v public.pro_invoice_deliveries;bal bigint;due date;today date:=(now() at time zone 'America/Costa_Rica')::date;st text;
begin
 select * into d from public.pro_invoice_drafts where user_id=p_owner and id=p_draft;
 if not found then return null;end if;
 select * into v from public.pro_invoice_deliveries where user_id=p_owner and draft_id=p_draft;
 bal:=public.pro_credit_draft_balance(p_owner,p_draft);due:=public.pro_invoice_due_date(p_owner,p_draft);
 st:=case when public.pro_credit_draft_archived(p_owner,p_draft) then 'void'
  when d.total_cents>0 and bal<=0 then 'paid'
  when v.status is distinct from 'sent' then 'draft'
  when bal>0 and due<today then 'overdue'
  when bal<d.total_cents then 'partial'
  when v.viewed_at is not null then 'viewed' else 'sent' end;
 return jsonb_build_object('draftId',p_draft,'status',st,'totalCents',d.total_cents,'balanceCents',greatest(bal,0),'dueDate',to_char(due,'YYYY-MM-DD'),
  'daysOverdue',case when st='overdue' then today-due else 0 end,'delivered',coalesce(v.status='sent',false),'sentAt',v.sent_at,'viewedAt',v.viewed_at);
end $$;

create or replace function public.pro_invoice_delivery_read(p_actor uuid,p_draft uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare d public.pro_invoice_drafts;c public.pro_clients;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into d from public.pro_invoice_drafts where user_id=p_actor and id=p_draft;
 if not found then return null;end if;
 select * into c from public.pro_clients where user_id=p_actor and id=d.client_id;
 return public.pro_invoice_lifecycle(p_actor,p_draft)||jsonb_build_object('title',d.title,'workId',d.work_id,'hasWork',d.work_id is not null,
  'recipientEmail',nullif(btrim(coalesce(c.email,'')),''),'clientName',c.name,
  'events',coalesce((select jsonb_agg(jsonb_build_object('action',e.action,'at',e.at,'providerRef',e.provider_ref) order by e.at desc,e.id desc)
    from(select * from public.pro_invoice_delivery_events x where x.user_id=p_actor and x.draft_id=p_draft order by x.at desc,x.id desc limit 30) e),'[]'::jsonb));
end $$;

create or replace function public.pro_invoice_delivery_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;aid uuid;did uuid;prior public.pro_invoice_delivery_actions;d public.pro_invoice_drafts;v public.pro_invoice_deliveries;w public.pro_work;c public.pro_clients;
 email text;ref text;result jsonb;keys text[];first_send boolean;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' then raise exception 'Invalid delivery' using errcode='22023';end if;
 act:=p_input->>'action';
 keys:=case act when 'send' then array['action','actionId','draftId','email','emailRef'] when 'recall' then array['action','actionId','draftId'] else null end;
 if keys is null or not(p_input ?& keys) or (p_input-keys)<>'{}'::jsonb or jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'draftId') is distinct from 'string' then
  raise exception 'Invalid delivery fields' using errcode='22023';end if;
 aid:=(p_input->>'actionId')::uuid;did:=(p_input->>'draftId')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 select * into prior from public.pro_invoice_delivery_actions where actor_id=p_actor and action_id=aid;
 if found then if prior.input is distinct from p_input then raise exception 'Delivery action reused' using errcode='40001';end if;return prior.result;end if;
 select * into d from public.pro_invoice_drafts where user_id=p_actor and id=did for update;
 if not found then raise exception 'Invoice unavailable' using errcode='42501';end if;
 if public.pro_credit_draft_archived(p_actor,did) then raise exception 'Restore the invoice first' using errcode='40001';end if;
 select * into v from public.pro_invoice_deliveries where user_id=p_actor and draft_id=did for update;
 if act='send' then
  if d.work_id is null then raise exception 'Only invoices of a job can be shown to the customer' using errcode='22023';end if;
  if d.total_cents<=0 then raise exception 'Nothing to send' using errcode='22023';end if;
  select * into w from public.pro_work where user_id=p_actor and id=d.work_id;
  if not found or w.cancelled then raise exception 'Restore the job first' using errcode='40001';end if;
  if jsonb_typeof(p_input->'email') is distinct from 'boolean' or jsonb_typeof(p_input->'emailRef') not in('string','null') then raise exception 'Invalid delivery fields' using errcode='22023';end if;
  ref:=left(p_input->>'emailRef',120);
  first_send:=v.draft_id is null or v.status<>'sent';
  if v.draft_id is null then insert into public.pro_invoice_deliveries(user_id,draft_id,status,sent_at) values(p_actor,did,'sent',clock_timestamp());
  elsif v.status<>'sent' then update public.pro_invoice_deliveries set status='sent',sent_at=clock_timestamp(),viewed_at=null,revision=revision+1,updated_at=clock_timestamp() where user_id=p_actor and draft_id=did;
  else update public.pro_invoice_deliveries set revision=revision+1,updated_at=clock_timestamp() where user_id=p_actor and draft_id=did;end if;
  insert into public.pro_invoice_delivery_events(user_id,id,draft_id,action) values(p_actor,gen_random_uuid(),did,case when first_send then 'send' else 'resend' end);
  if (p_input->>'email')::boolean then insert into public.pro_invoice_delivery_events(user_id,id,draft_id,action,provider_ref) values(p_actor,gen_random_uuid(),did,case when ref is null then 'email_failed' else 'email_sandbox_sent' end,ref);end if;
 else
  if v.draft_id is null or v.status<>'sent' then raise exception 'Invoice was not sent' using errcode='40001';end if;
  update public.pro_invoice_deliveries set status='recalled',revision=revision+1,updated_at=clock_timestamp() where user_id=p_actor and draft_id=did;
  insert into public.pro_invoice_delivery_events(user_id,id,draft_id,action) values(p_actor,gen_random_uuid(),did,'recall');
 end if;
 result:=public.pro_invoice_lifecycle(p_actor,did);
 insert into public.pro_invoice_delivery_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- Customer side: invoices the owner sent for this job (never drafts), with due date and status. p_record marks the first opening (not for the owner's preview).
create or replace function public.pro_invoice_delivery_client_read(p_actor uuid,p_request uuid,p_record boolean) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare owner uuid;wid text;req_status text;enabled boolean;r record;items jsonb:='[]'::jsonb;life jsonb;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 select owner_id,work_id,status into owner,wid,req_status from public.pro_appointment_requests where id=p_request and client_user_id=p_actor and work_id is not null;
 if not found then return null;end if;
 select coalesce(show_finances,false) into enabled from public.pro_client_dashboards where owner_id=owner and work_id=wid;
 if req_status not in('confirmed','completed') or not coalesce(enabled,false) then return jsonb_build_object('visible',false);end if;
 for r in select v.draft_id,v.sent_at,v.viewed_at,d.title from public.pro_invoice_deliveries v join public.pro_invoice_drafts d on d.user_id=v.user_id and d.id=v.draft_id
  where v.user_id=owner and v.status='sent' and d.work_id=wid and not public.pro_credit_draft_archived(owner,v.draft_id) order by v.sent_at desc,v.draft_id limit 200 loop
  if p_record and r.viewed_at is null then
   update public.pro_invoice_deliveries set viewed_at=clock_timestamp(),updated_at=clock_timestamp() where user_id=owner and draft_id=r.draft_id and viewed_at is null;
   insert into public.pro_invoice_delivery_events(user_id,id,draft_id,action) values(owner,gen_random_uuid(),r.draft_id,'view');
  end if;
  life:=public.pro_invoice_lifecycle(owner,r.draft_id);
  items:=items||jsonb_build_object('id',r.draft_id,'title',r.title,'status',life->>'status','totalCents',(life->>'totalCents')::bigint,'balanceCents',(life->>'balanceCents')::bigint,
   'dueDate',life->>'dueDate','daysOverdue',(life->>'daysOverdue')::integer,'sentAt',r.sent_at);
 end loop;
 return jsonb_build_object('visible',true,'invoices',items);
end $$;

create or replace function public.pro_invoice_delivery_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' and (not exists(select 1 from public.profiles where id=old.user_id) or not exists(select 1 from public.pro_invoice_drafts where user_id=old.user_id and id=old.draft_id)) then return old;end if;
 raise exception 'Immutable delivery record' using errcode='23514';
end $$;
drop trigger if exists pro_invoice_delivery_events_immutable on public.pro_invoice_delivery_events;
create trigger pro_invoice_delivery_events_immutable before update or delete on public.pro_invoice_delivery_events for each row execute function public.pro_invoice_delivery_immutable();

do $$declare t text;f record;begin
 foreach t in array array['pro_invoice_deliveries','pro_invoice_delivery_events','pro_invoice_delivery_actions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'pro_invoice_delivery_%' or p.proname in('pro_invoice_lifecycle','pro_invoice_due_date')) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
notify pgrst,'reload schema';
