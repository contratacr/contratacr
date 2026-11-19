-- LOCAL PRO ONLY. Round 4A (2026-11-13): real customer preview and a Finances section for the
-- linked customer. Read-only for money: no ledger, invoice, payment or estimate row is changed.
--
-- 1. show_finances: opt-in customer-view section, OFF by default like every section added after
--    the three basic ones (same compatibility rule: existing rows keep their current view).
--    Supersedes pro_client_dashboard_settings_json / _read / _mutate (client-dashboard-local.sql)
--    with the same signatures and only ADDED keys (showFinances, previewRequestId).
-- 2. pro_client_preview_actor: the owner of a job may run the customer readers of that job's
--    linked request AS that customer, so «Customer view › Preview» shows exactly what the customer
--    sees. Used only by GET readers (proCustomerReader); writes keep the caller as actor.
-- 3. pro_client_finances_client_read: quotes shared with this customer for the job, invoice
--    documents, payments received and the balance from the ONE formula (pro_work_account,
--    client-balance-local.sql). Never returns costs, margins, notes, labels or references.
begin;
alter table public.pro_client_dashboards add column if not exists show_finances boolean not null default false;

create or replace function public.pro_client_dashboard_settings_json(p_work text,p_row public.pro_client_dashboards) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('workId',p_work,'showUpdates',coalesce(p_row.show_updates,true),'showDailyLogs',coalesce(p_row.show_daily_logs,true),
 'showFiles',coalesce(p_row.show_files,true),'showAllowances',coalesce(p_row.show_allowances,false),'showSelections',coalesce(p_row.show_selections,false),'showSchedule',coalesce(p_row.show_schedule,false),'showPunchlist',coalesce(p_row.show_punchlist,false),'showContracts',coalesce(p_row.show_contracts,false),'showMoodBoards',coalesce(p_row.show_mood_boards,false),'showFinances',coalesce(p_row.show_finances,false),'welcomeText',p_row.welcome_text,'revision',coalesce(p_row.revision,0),'updatedAt',p_row.updated_at);
$$;

create or replace function public.pro_client_dashboard_read(p_actor uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare settings public.pro_client_dashboards;hist jsonb;recipient_name text;recipient_request uuid;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 then raise exception 'Invalid dashboard query' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then return null;end if;
 select * into settings from public.pro_client_dashboards where owner_id=p_actor and work_id=p_work;
 -- Same deterministic recipient as before; its request is the one the preview reads as the customer.
 select ar.client_name,ar.id into recipient_name,recipient_request from public.pro_appointment_requests ar join public.profiles c on c.id=ar.client_user_id
  where ar.owner_id=p_actor and ar.work_id=p_work and ar.status in('confirmed','completed') and not coalesce(c.is_disabled,false)
  order by ar.updated_at desc,ar.id desc limit 1;
 select coalesce(jsonb_agg(x.content order by x.revision desc),'[]'::jsonb) into hist from (
  select (h.after_settings->>'revision')::integer as revision,jsonb_build_object('actionId',h.action_id,'at',h.at,'before',h.before_settings,'after',h.after_settings) as content
  from public.pro_client_dashboard_history h where h.owner_id=p_actor and h.work_id=p_work order by (h.after_settings->>'revision')::integer desc limit 20
 ) x;
 return jsonb_build_object('settings',public.pro_client_dashboard_settings_json(p_work,settings),'history',hist,'recipientName',recipient_name,'previewRequestId',recipient_request);
end $$;

create or replace function public.pro_client_dashboard_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare wid text;aid uuid;rev integer;keys text[];receipt public.pro_client_dashboard_actions;settings public.pro_client_dashboards;before_json jsonb;after_json jsonb;result jsonb;welcome text;allowances boolean;selections boolean;schedule boolean;punchlist boolean;contracts boolean;moodboards boolean;finances boolean;base_keys text[];
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid dashboard' using errcode='22023';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 -- showAllowances and showSelections are optional so older clients keep working; when absent the stored value is kept.
 select array_agg(k order by k) into base_keys from unnest(keys) k where k not in('showAllowances','showSelections','showSchedule','showContracts','showPunchlist','showMoodBoards','showFinances');
 if base_keys is distinct from array['actionId','revision','showDailyLogs','showFiles','showUpdates','welcomeText','workId']
 or (p_input?'showAllowances' and jsonb_typeof(p_input->'showAllowances') is distinct from 'boolean')
 or (p_input?'showSelections' and jsonb_typeof(p_input->'showSelections') is distinct from 'boolean')
 or (p_input?'showSchedule' and jsonb_typeof(p_input->'showSchedule') is distinct from 'boolean')
 or (p_input?'showPunchlist' and jsonb_typeof(p_input->'showPunchlist') is distinct from 'boolean')
 or (p_input?'showContracts' and jsonb_typeof(p_input->'showContracts') is distinct from 'boolean')
 or (p_input?'showMoodBoards' and jsonb_typeof(p_input->'showMoodBoards') is distinct from 'boolean')
 or (p_input?'showFinances' and jsonb_typeof(p_input->'showFinances') is distinct from 'boolean')
 or jsonb_typeof(p_input->'workId') is distinct from 'string' or jsonb_typeof(p_input->'actionId') is distinct from 'string'
 or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false)
 or jsonb_typeof(p_input->'showUpdates') is distinct from 'boolean' or jsonb_typeof(p_input->'showDailyLogs') is distinct from 'boolean'
 or jsonb_typeof(p_input->'showFiles') is distinct from 'boolean' or jsonb_typeof(p_input->'welcomeText') not in('string','null') then raise exception 'Invalid dashboard fields' using errcode='22023';end if;
 if (p_input->>'revision')::numeric>2147483646 then raise exception 'Invalid revision' using errcode='22023';end if;
 wid:=p_input->>'workId';aid:=(p_input->>'actionId')::uuid;rev:=(p_input->>'revision')::integer;
 if length(wid) not between 1 and 160 then raise exception 'Invalid dashboard identity' using errcode='22023';end if;
 welcome:=nullif(btrim(coalesce(p_input->>'welcomeText','')),'');
 if welcome is not null and length(welcome)>1000 then raise exception 'Invalid welcome text' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-client-dashboard-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_client_dashboard_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-client-dashboard:'||p_actor::text||':'||wid,0));
 perform 1 from public.pro_work where user_id=p_actor and id=wid for update;
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 select * into settings from public.pro_client_dashboards where owner_id=p_actor and work_id=wid for update;
 if not found then
  if rev<>0 then raise exception 'Dashboard changed' using errcode='40001';end if;
  before_json:=null;allowances:=coalesce((p_input->>'showAllowances')::boolean,false);selections:=coalesce((p_input->>'showSelections')::boolean,false);
  schedule:=coalesce((p_input->>'showSchedule')::boolean,false);punchlist:=coalesce((p_input->>'showPunchlist')::boolean,false);contracts:=coalesce((p_input->>'showContracts')::boolean,false);moodboards:=coalesce((p_input->>'showMoodBoards')::boolean,false);finances:=coalesce((p_input->>'showFinances')::boolean,false);
  insert into public.pro_client_dashboards(owner_id,work_id,show_updates,show_daily_logs,show_files,show_allowances,show_selections,show_schedule,show_contracts,show_punchlist,show_mood_boards,show_finances,welcome_text)
   values(p_actor,wid,(p_input->>'showUpdates')::boolean,(p_input->>'showDailyLogs')::boolean,(p_input->>'showFiles')::boolean,allowances,selections,schedule,contracts,punchlist,moodboards,finances,welcome) returning * into settings;
 else
  if rev<>settings.revision then raise exception 'Dashboard changed' using errcode='40001';end if;
  before_json:=public.pro_client_dashboard_settings_json(wid,settings);allowances:=coalesce((p_input->>'showAllowances')::boolean,settings.show_allowances);selections:=coalesce((p_input->>'showSelections')::boolean,settings.show_selections);
  schedule:=coalesce((p_input->>'showSchedule')::boolean,settings.show_schedule);punchlist:=coalesce((p_input->>'showPunchlist')::boolean,settings.show_punchlist);contracts:=coalesce((p_input->>'showContracts')::boolean,settings.show_contracts);moodboards:=coalesce((p_input->>'showMoodBoards')::boolean,settings.show_mood_boards);finances:=coalesce((p_input->>'showFinances')::boolean,settings.show_finances);
  if settings.show_allowances=allowances and settings.show_selections=selections and settings.show_schedule=schedule and settings.show_punchlist=punchlist and settings.show_contracts=contracts and settings.show_mood_boards=moodboards and settings.show_finances=finances and settings.show_updates=(p_input->>'showUpdates')::boolean and settings.show_daily_logs=(p_input->>'showDailyLogs')::boolean
   and settings.show_files=(p_input->>'showFiles')::boolean and settings.welcome_text is not distinct from welcome then raise exception 'No dashboard changes' using errcode='22023';end if;
  update public.pro_client_dashboards set show_updates=(p_input->>'showUpdates')::boolean,show_daily_logs=(p_input->>'showDailyLogs')::boolean,
   show_files=(p_input->>'showFiles')::boolean,show_allowances=allowances,show_selections=selections,show_schedule=schedule,show_contracts=contracts,show_punchlist=punchlist,show_mood_boards=moodboards,show_finances=finances,welcome_text=welcome,revision=revision+1,updated_at=now() where owner_id=p_actor and work_id=wid returning * into settings;
 end if;
 after_json:=public.pro_client_dashboard_settings_json(wid,settings);result:=jsonb_build_object('settings',after_json);
 insert into public.pro_client_dashboard_history(owner_id,work_id,action_id,before_settings,after_settings) values(p_actor,wid,aid,before_json,after_json);
 insert into public.pro_client_dashboard_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;
-- The caller itself when it is the request's customer; the request's customer when the caller is
-- the owner of the request's job with Pro tools; otherwise null (the reader then decides as before).
create or replace function public.pro_client_preview_actor(p_actor uuid,p_request uuid) returns uuid
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r public.pro_appointment_requests;
begin
 if p_actor is null or p_request is null then return null;end if;
 select * into r from public.pro_appointment_requests where id=p_request;
 if not found then return null;end if;
 if r.client_user_id=p_actor then return p_actor;end if;
 if r.owner_id=p_actor and r.work_id is not null and r.client_user_id is not null
  and exists(select 1 from public.pro_work w where w.user_id=p_actor and w.id=r.work_id)
  and coalesce(public.pro_private_work_tools_enabled(p_actor),false) then return r.client_user_id;end if;
 return null;
end $$;

create or replace function public.pro_client_finances_client_read(p_actor uuid,p_request uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare owner uuid;wid text;req_status text;enabled boolean;w public.pro_work;account jsonb;quotes jsonb;invoices jsonb;payments jsonb;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 select owner_id,work_id,status into owner,wid,req_status from public.pro_appointment_requests where id=p_request and client_user_id=p_actor and work_id is not null;
 if not found then return null;end if;
 select coalesce(show_finances,false) into enabled from public.pro_client_dashboards where owner_id=owner and work_id=wid;
 if req_status not in('confirmed','completed') or not coalesce(enabled,false) then return jsonb_build_object('visible',false);end if;
 select * into w from public.pro_work where user_id=owner and id=wid;
 if not found then return jsonb_build_object('visible',false);end if;
 account:=public.pro_work_account(owner,wid);
 -- Quotes: the latest live publication of each estimate of this project that THIS customer received.
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'version',x.version,'status',x.status,'totalCents',x.total,'currency',x.currency,'sharedAt',x.created_at) order by x.created_at desc),'[]'::jsonb) into quotes from (
  select distinct on (v.estimate_id) v.id,v.content->>'title' title,v.version,s.status,(v.content->>'totalCents')::bigint total,v.content->>'currency' currency,v.created_at
  from public.pro_project_estimate_rows(owner,w) e
  join public.pro_private_estimate_publications v on v.owner_id=owner and v.estimate_id=e.estimate_id
  join public.pro_private_estimate_publication_states s on s.publication_id=v.id
  where e.relation='project' and s.recipient_id=p_actor and s.status in('shared','changes_requested','accepted','declined')
  order by v.estimate_id,v.version desc) x;
 -- Invoice documents of this job (internal, not electronic invoices): title, date and total only.
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'createdAt',d.created_at,'totalCents',d.total_cents) order by d.created_at desc,d.id),'[]'::jsonb) into invoices
  from public.pro_invoice_drafts d left join public.pro_invoice_draft_management m on m.user_id=d.user_id and m.draft_id=d.id
  where d.user_id=owner and d.work_id=wid and not coalesce(m.archived,false);
 -- Payments received on the job ledger (the same rows the balance counts); a voided payment is marked.
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'amountCents',e.amount_cents,'receivedOn',meta->'receivedOn','method',meta->'method','voided',voided,'recordedAt',e.created_at) order by e.created_at desc,e.id),'[]'::jsonb) into payments from (
  select e.*,public.pro_invoice_payment_metadata(owner,e.id) meta,exists(select 1 from public.pro_client_entries v where v.user_id=e.user_id and v.reversal_id=e.id and v.kind='payment_void') voided
  from public.pro_client_entries e where e.user_id=owner and e.work_id=wid and e.kind='payment') e;
 return jsonb_build_object('visible',true,'workTitle',w.service,
  'summary',jsonb_build_object('agreedCents',account->'agreedCents','paidCents',account->'paidCents','creditNotesCents',account->'creditNotesCents',
   'balanceCents',account->'customerBalanceCents','creditCents',greatest(-(account->>'balanceCents')::bigint,0),
   'invoicedCents',coalesce((select sum((i->>'totalCents')::bigint) from jsonb_array_elements(invoices) i),0)),
  'quotes',quotes,'invoices',invoices,'payments',payments);
end $$;

revoke all on function public.pro_client_dashboard_settings_json(text,public.pro_client_dashboards),public.pro_client_dashboard_read(uuid,text),public.pro_client_dashboard_mutate(uuid,jsonb),public.pro_client_preview_actor(uuid,uuid),public.pro_client_finances_client_read(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pro_client_dashboard_settings_json(text,public.pro_client_dashboards),public.pro_client_dashboard_read(uuid,text),public.pro_client_dashboard_mutate(uuid,jsonb),public.pro_client_preview_actor(uuid,uuid),public.pro_client_finances_client_read(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
