-- LOCAL PRO ONLY. Ordinary quote approval in the existing appointment journey.
-- Additive; no historical backfill, fiscal issuance, notifications or ledger entries.
-- An accepted linked document can supply the initial commercial balance on read.
begin;
create table if not exists public.pro_request_quotes(
 quote_id uuid primary key references public.quotes(id) on delete cascade,
 request_id uuid not null references public.pro_appointment_requests(id) on delete cascade,
 owner_id uuid not null references public.profiles(id) on delete cascade,
 client_user_id uuid not null references public.profiles(id) on delete cascade,
 accepted boolean not null default false,created_at timestamptz not null default now(),check(owner_id<>client_user_id)
);
create unique index if not exists pro_request_quote_accepted_once on pro_request_quotes(request_id) where accepted;
create index if not exists pro_request_quote_client_page on pro_request_quotes(client_user_id,quote_id desc);
create table if not exists public.pro_request_quote_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input jsonb not null,result jsonb not null,primary key(actor_id,action_id)
);

-- Shared by quote acceptance and appointment confirmation, in the same transaction.
create or replace function public.pro_request_quote_link_work(p_request uuid,p_quote uuid) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r pro_appointment_requests;w pro_work;q quotes;m pro_request_quotes;
begin
 select * into m from pro_request_quotes where request_id=p_request and quote_id=p_quote;
 if not found then raise exception 'Quote source unavailable' using errcode='P0002';end if;
 select * into r from pro_appointment_requests where id=p_request and owner_id=m.owner_id and client_user_id=m.client_user_id for update;
 if not found then raise exception 'Quote source changed' using errcode='40001';end if;
 if r.work_id is null then return;end if;
 select * into q from quotes where id=p_quote and client_id=r.client_user_id and professional_id=r.professional_id and status='accepted' and deleted_at is null;
 if not found then raise exception 'Accepted quote unavailable' using errcode='40001';end if;
 select * into w from pro_work where user_id=r.owner_id and id=r.work_id for update;
 if not found or r.status<>'confirmed' or w.cancelled or w.stage<>'scheduled' or w."clientId"<>'reservation-'||r.client_user_id::text or w."bookingClientId" is distinct from r.client_user_id::text then raise exception 'Work changed' using errcode='40001';end if;
 if w."externalQuoteId"=q.id::text then return;end if;
 if nullif(w."externalQuoteId",'') is not null or nullif(w."quoteId",'') is not null then raise exception 'Work already has a quote' using errcode='40001';end if;
 update pro_work set "externalQuoteId"=q.id::text where user_id=r.owner_id and id=r.work_id;
 update pro_workspace_core set revision=revision+1,updated_at=now() where user_id=r.owner_id;
end $$;

create or replace function public.pro_request_quote_sync() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare m pro_request_quotes;r pro_appointment_requests;
begin
 select * into m from pro_request_quotes where quote_id=new.id;
 if not found then return new;end if;
 -- Quote writes already use protected service-role APIs; authenticated has SELECT policies only.
 if current_setting('role',true) in ('anon','authenticated') then raise exception 'Use protected quote API' using errcode='42501';end if;
 select * into r from pro_appointment_requests where id=m.request_id;
 if new.client_id is distinct from m.client_user_id or new.professional_id is distinct from r.professional_id or new.project_id is not null then raise exception 'Quote source is immutable' using errcode='23514';end if;
 -- Preserve the accepted document used as the commercial agreement. Changes
 -- belong in the existing work-change workflow, never by rewriting its source.
 if m.accepted and (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then raise exception 'Accepted request quote is immutable' using errcode='23514';end if;
 if new.status='accepted' and old.status is distinct from new.status then
  perform pg_advisory_xact_lock(hashtextextended(m.owner_id::text,0));
  select * into r from pro_appointment_requests where id=m.request_id for update;
  if r.status not in ('requested','proposed','confirmed') then raise exception 'Request is closed' using errcode='40001';end if;
  update pro_request_quotes set accepted=true where quote_id=new.id;
  perform pro_request_quote_link_work(m.request_id,new.id);
 end if;
 return new;
end $$;
drop trigger if exists pro_request_quote_sync on public.quotes;
create trigger pro_request_quote_sync after update on public.quotes for each row execute function public.pro_request_quote_sync();
create or replace function public.pro_request_quote_confirm_work() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare selected_quote uuid;
begin
 if new.work_id is null or new.work_id is not distinct from old.work_id then return new;end if;
 select quote_id into selected_quote from pro_request_quotes where request_id=new.id and accepted;
 if selected_quote is not null then
  if current_setting('role',true) in ('anon','authenticated') then raise exception 'Use protected appointment API' using errcode='42501';end if;
  perform pro_request_quote_link_work(new.id,selected_quote);
 end if;
 return new;
end $$;
drop trigger if exists pro_request_quote_confirm_work on public.pro_appointment_requests;
create trigger pro_request_quote_confirm_work after update of work_id on public.pro_appointment_requests for each row execute function public.pro_request_quote_confirm_work();

create or replace function public.pro_request_quote_create(p_actor uuid,p_input jsonb,p_source jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r pro_appointment_requests;c pro_clients;prior pro_request_quote_actions;q quotes;totals jsonb;n integer;result jsonb;source uuid;aid uuid;
begin
 source:=(p_input->>'sourceRequestId')::uuid;aid:=(p_input->>'clientActionId')::uuid;
 if source is null or aid is null or not exists(select 1 from profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 select * into prior from pro_request_quote_actions where actor_id=p_actor and action_id=aid;
 if found then if prior.input is distinct from p_input then raise exception 'Idempotency key changed' using errcode='22023';end if;return prior.result;end if;
 select * into r from pro_appointment_requests where id=source and owner_id=p_actor for update;
 if not found then raise exception 'Source unavailable' using errcode='P0002';end if;
 if not pro_appointment_enabled(p_actor) then raise exception 'Provider unavailable' using errcode='42501';end if;
 if r.status not in ('requested','proposed','confirmed') then raise exception 'Source closed' using errcode='40001';end if;
 if not exists(select 1 from profiles where id=r.client_user_id and not coalesce(is_disabled,false)) then raise exception 'Client unavailable' using errcode='42501';end if;
 select * into c from pro_clients where user_id=p_actor and id='reservation-'||r.client_user_id::text for update;
 if not found or c.archived then raise exception 'Prepare an active source contact first' using errcode='40001';end if;
 if jsonb_typeof(p_input->'items') is distinct from 'array' or jsonb_array_length(p_input->'items')<1 or jsonb_array_length(p_input->'items')>20 or p_input->>'taxMode' not in ('incluido','mas_iva','exento') or (p_input->>'validDays')::integer not between 1 and 90 then raise exception 'Invalid quote' using errcode='22023';end if;
 totals:=pro_quote_choice_totals(p_input->'items',p_input->>'taxMode');
 for attempt in 1..3 loop
  select coalesce(max(quote_number),0)+1 into n from quotes where professional_id=r.professional_id;
  begin
   insert into quotes(professional_id,client_id,client_name,client_phone,client_cedula,client_email,public_code,quote_number,title,items,tax_mode,subtotal,tax_amount,total,notes,valid_until,status,created_source_host,created_app_environment,created_supabase_project_ref)
   values(r.professional_id,r.client_user_id,coalesce(p_input->>'clientName',r.client_name),p_input->>'clientPhone',p_input->>'clientCedula',p_input->>'clientEmail',p_source->>'public_code',n,p_input->>'title',p_input->'items',p_input->>'taxMode',(totals->>'subtotal')::integer,(totals->>'taxAmount')::integer,(totals->>'total')::integer,p_input->>'notes',(now() at time zone 'America/Costa_Rica')::date+(p_input->>'validDays')::integer,'sent',p_source->>'created_source_host',p_source->>'created_app_environment',p_source->>'created_supabase_project_ref') returning * into q;
   exit;
  exception when unique_violation then if attempt=3 then raise;end if;
  end;
 end loop;
 insert into pro_request_quotes(quote_id,request_id,owner_id,client_user_id) values(q.id,r.id,r.owner_id,r.client_user_id);
 insert into pro_quote_links(user_id,"quoteId","clientId") values(p_actor,q.id::text,c.id);
 update pro_workspace_core set revision=revision+1,updated_at=now(),panel_fields=case when 'quoteLinks'=any(panel_fields) then panel_fields else array_append(panel_fields,'quoteLinks') end where user_id=p_actor;
 result:=jsonb_build_object('quote',to_jsonb(q),'sourceRequestId',r.id,'workId',r.work_id);
 insert into pro_request_quote_actions values(p_actor,aid,p_input,result);return result;
end $$;

create or replace function public.pro_request_quote_respond(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare m pro_request_quotes;prior pro_request_quote_actions;q quotes;result jsonb;act text;aid uuid;
begin
 act:=p_input->>'action';aid:=(p_input->>'clientActionId')::uuid;
 if aid is null or act not in ('accept','decline') then raise exception 'Invalid response' using errcode='22023';end if;
 if not exists(select 1 from profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into m from pro_request_quotes where quote_id=(p_input->>'id')::uuid and client_user_id=p_actor;
 if not found then raise exception 'Quote unavailable' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(m.owner_id::text,0));
 select * into prior from pro_request_quote_actions where actor_id=p_actor and action_id=aid;
 if found then if prior.input is distinct from p_input then raise exception 'Idempotency key changed' using errcode='22023';end if;return prior.result;end if;
 perform 1 from pro_appointment_requests where id=m.request_id for update;
 select * into q from quotes where id=m.quote_id and client_id=p_actor and deleted_at is null for update;
 if not found then raise exception 'Quote unavailable' using errcode='P0002';end if;
 if q.status<>'sent' or q.updated_at is distinct from (p_input->>'expectedUpdatedAt')::timestamptz or q.valid_until<(now() at time zone 'America/Costa_Rica')::date then raise exception 'Quote changed or expired' using errcode='40001';end if;
 if exists(select 1 from pro_quote_choices where quote_id=q.id) then raise exception 'Use extras approval' using errcode='40001';end if;
 if act='accept' and not pro_appointment_enabled(m.owner_id) then raise exception 'Provider unavailable' using errcode='42501';end if;
 update quotes set status=case when act='accept' then 'accepted' else 'declined' end,accepted_at=case when act='accept' then now() else null end,declined_at=case when act='decline' then now() else null end,updated_at=now() where id=q.id returning * into q;
 result:=jsonb_build_object('quote',to_jsonb(q),'sourceRequestId',m.request_id,'workId',(select work_id from pro_appointment_requests where id=m.request_id));
 insert into pro_request_quote_actions values(p_actor,aid,p_input,result);return result;
end $$;

create or replace function public.pro_request_quote_detail(p_actor uuid,p_quote uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('quote',to_jsonb(q),'sourceRequestId',m.request_id,'workId',r.work_id,'configuredExtras',exists(select 1 from pro_quote_choices where quote_id=q.id))
 from pro_request_quotes m join pro_appointment_requests r on r.id=m.request_id and r.owner_id=m.owner_id and r.client_user_id=m.client_user_id join quotes q on q.id=m.quote_id and q.professional_id=r.professional_id and q.client_id=m.client_user_id
 where q.id=p_quote and q.deleted_at is null and p_actor in(m.owner_id,m.client_user_id) and exists(select 1 from profiles where id=p_actor and not coalesce(is_disabled,false));
$$;

-- One cursor and one list: extras keep their previous visibility; ordinary sources are exact request mappings.
create or replace function public.pro_quote_choice_page(p_actor uuid,p_after uuid default null,p_request uuid default null) returns jsonb language plpgsql stable set search_path=public,pg_temp as $$
declare result jsonb;next_key uuid;a pro_appointment_requests;begin
 if not exists(select 1 from profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_request is not null then select * into a from pro_appointment_requests where id=p_request and p_actor in(owner_id,client_user_id);if not found then raise exception 'Forbidden' using errcode='42501';end if;end if;
 select coalesce(jsonb_agg(row order by id desc),'[]') into result from(
  select id,jsonb_build_object('quoteId',id,'title',title,'status',status,'version',version,'total',total,'professionalName',professional_name,'kind',kind) row from(
   select q.id,coalesce(q.title,'Cotización') title,case when q.status in ('withdrawn','declined') then q.status when c.status='open' and q.valid_until<(now() at time zone 'America/Costa_Rica')::date then 'expired' else c.status end status,c.version,q.total,coalesce(p.business_name,'Profesional') professional_name,'extras'::text kind
   from pro_quote_choices c join quotes q on q.id=c.quote_id join professionals p on p.id=q.professional_id
   where q.deleted_at is null and (p_after is null or q.id<p_after) and (
    (p_request is null and c.client_id=p_actor) or
    (p_request is not null and c.owner_id=a.owner_id and c.client_id=a.client_user_id and (
     not exists(select 1 from pro_request_quotes mapped where mapped.quote_id=q.id) and exists(select 1 from pro_quote_links l join pro_work w on w.user_id=l.user_id and w."clientId"=l."clientId" where l.user_id=a.owner_id and l."quoteId"=q.id::text and w.id=a.work_id and w."bookingClientId"=a.client_user_id::text)
     or exists(select 1 from pro_request_quotes m where m.quote_id=q.id and m.request_id=p_request and m.owner_id=a.owner_id and m.client_user_id=a.client_user_id)
    ))
   )
   union all
   select q.id,coalesce(q.title,'Cotización'),case when q.status='sent' and q.valid_until<(now() at time zone 'America/Costa_Rica')::date then 'expired' when q.status='sent' then 'open' else q.status end,0,q.total,coalesce(p.business_name,'Profesional'),'ordinary'::text
   from pro_request_quotes m join pro_appointment_requests r on r.id=m.request_id and r.owner_id=m.owner_id and r.client_user_id=m.client_user_id join quotes q on q.id=m.quote_id and q.client_id=m.client_user_id and q.professional_id=r.professional_id join professionals p on p.id=q.professional_id
   where q.deleted_at is null and not exists(select 1 from pro_quote_choices where quote_id=q.id) and (p_after is null or q.id<p_after) and ((p_request is null and m.client_user_id=p_actor) or (p_request=m.request_id and p_actor in(m.owner_id,m.client_user_id)))
  ) combined order by id desc limit 21
 ) bounded;
 if jsonb_array_length(result)>20 then next_key:=(result->19->>'quoteId')::uuid;end if;
 return jsonb_build_object('items',(select coalesce(jsonb_agg(v order by n),'[]') from jsonb_array_elements(result) with ordinality x(v,n) where n<=20),'nextCursor',next_key);
end $$;

alter table pro_request_quotes enable row level security;
alter table pro_request_quote_actions enable row level security;
revoke all on pro_request_quotes,pro_request_quote_actions from public,anon,authenticated;
grant all on pro_request_quotes,pro_request_quote_actions to service_role;
revoke all on function pro_request_quote_link_work(uuid,uuid),pro_request_quote_sync(),pro_request_quote_confirm_work(),pro_request_quote_create(uuid,jsonb,jsonb),pro_request_quote_respond(uuid,jsonb),pro_request_quote_detail(uuid,uuid),pro_quote_choice_page(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function pro_request_quote_link_work(uuid,uuid),pro_request_quote_sync(),pro_request_quote_confirm_work(),pro_request_quote_create(uuid,jsonb,jsonb),pro_request_quote_respond(uuid,jsonb),pro_request_quote_detail(uuid,uuid),pro_quote_choice_page(uuid,uuid,uuid) to service_role;

-- An accepted request quote supplies the initial commercial agreement only when
-- no manual agreement exists. Existing ledger entries, including zero, prevail.
create or replace function public.pro_work_account(p_user uuid,p_work text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 with account_values as (
 select w.*,
 coalesce(
  (select amount_cents from pro_client_entries where user_id=p_user and work_id=w.id and kind='agreement' order by position desc limit 1),
  -- Quotes are CRC documents with integer-colon totals. Derive cents exactly;
  -- this is a reading of the accepted document, never a charge or ledger entry.
  (select q.total::bigint*100
   from pro_request_quotes m
   join pro_appointment_requests r on r.id=m.request_id and r.owner_id=m.owner_id and r.client_user_id=m.client_user_id
   join quotes q on q.id=m.quote_id and q.client_id=m.client_user_id and q.professional_id=r.professional_id
   join professionals p on p.id=q.professional_id and p.profile_id=m.owner_id
   where m.owner_id=p_user and m.accepted and q.status='accepted' and q.deleted_at is null
    and r.work_id=w.id and w."externalQuoteId"=q.id::text and nullif(w."quoteId",'') is null
    and w."clientId"='reservation-'||r.client_user_id::text and w."bookingClientId"=r.client_user_id::text)
 ) as agreed,
 (select coalesce(sum(case when kind='payment' then amount_cents when kind='payment_void' then -amount_cents else 0 end),0) from pro_client_entries where user_id=p_user and work_id=w.id) as paid,
 (select count(*) from pro_client_entries e where e.user_id=p_user and e.work_id=w.id and e.kind='material' and not exists(select 1 from pro_client_entries r where r.user_id=e.user_id and r.reversal_id=e.id)) as materials,
 (select coalesce(sum(case when kind='material' then round(quantity*unit_cost,2) when kind='material_return' then -round(quantity*unit_cost,2) else 0 end),0) from pro_client_entries where user_id=p_user and work_id=w.id) as material_cost
 from pro_work w where w.user_id=p_user and w.id=p_work
 ) select jsonb_build_object('id',id,'service',service,'stage',stage,'cancelled',cancelled,'start',start,'quoteId',"quoteId",'externalQuoteId',"externalQuoteId",'agreedCents',agreed,'paidCents',paid,'balanceCents',coalesce(agreed,0)-paid,'materialCount',materials,'materialCost',material_cost) from account_values;
$$;
revoke all on function public.pro_work_account(uuid,text) from public,anon,authenticated;
grant execute on function public.pro_work_account(uuid,text) to service_role;
commit;
