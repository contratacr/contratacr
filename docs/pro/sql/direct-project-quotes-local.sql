-- LOCAL PRO ONLY. Additive creation receipts; no backfill, delivery, invoices or debt.
begin;
create table if not exists public.pro_direct_project_quote_actions(
 actor_id uuid not null references profiles(id) on delete cascade,action_id uuid not null,input jsonb not null,result jsonb not null,primary key(actor_id,action_id)
);
create or replace function public.pro_direct_project_quote_create(p_actor uuid,p_input jsonb,p_source jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare c pro_clients;prior pro_direct_project_quote_actions;q quotes;totals jsonb;n integer;result jsonb;aid uuid;professional professionals;project projects;recipient uuid;item jsonb;field text;
begin
 if jsonb_typeof(p_input) is distinct from 'object' or (p_input-array['context','clientActionId','proClientId','projectId','clientName','clientPhone','clientCedula','clientEmail','title','items','taxMode','notes','validDays'])<>'{}'::jsonb
 or not(p_input ?& array['context','clientActionId','proClientId','clientName','clientPhone','clientCedula','clientEmail','title','items','taxMode','notes','validDays'])
 or p_input->>'context' not in ('direct','project') or jsonb_typeof(p_input->'context') is distinct from 'string'
 or jsonb_typeof(p_input->'proClientId') not in ('string','null') or jsonb_typeof(p_input->'proClientId')='string' and length(p_input->>'proClientId') not between 1 and 160
 or (p_input->>'context'='project') is distinct from (p_input ? 'projectId') then raise exception 'Invalid context' using errcode='22023';end if;
 aid:=(p_input->>'clientActionId')::uuid;
 if aid is null or p_actor is null then raise exception 'Missing actor or action' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 if not pro_appointment_enabled(p_actor) then raise exception 'Provider unavailable' using errcode='42501';end if;
 select * into professional from professionals where profile_id=p_actor and not coalesce(is_banned,false) order by id limit 1;
 if not found then raise exception 'Provider unavailable' using errcode='42501';end if;
 select * into prior from pro_direct_project_quote_actions where actor_id=p_actor and action_id=aid;
 if found then if prior.input is distinct from p_input then raise exception 'Idempotency key changed' using errcode='22023';end if;return prior.result;end if;
 if p_input->>'proClientId' is not null then
 select * into c from pro_clients where user_id=p_actor and id=p_input->>'proClientId' for update;
 if not found or c.archived then raise exception 'Active contact required' using errcode='40001';end if;
 end if;
 if p_input->>'context'='project' then
  select * into project from projects where id=(p_input->>'projectId')::uuid for share;
  if not found then raise exception 'Project unavailable' using errcode='P0002';end if;
  if project.client_id=p_actor then raise exception 'Own project' using errcode='42501';end if;
  if project.status<>'open' or not coalesce(project.allow_direct_contact,false) or project.client_id is null then raise exception 'Project unavailable' using errcode='40001';end if;
  if c.id is null or c.id<>'reservation-'||project.client_id::text or not exists(select 1 from profiles where id=project.client_id and not coalesce(is_disabled,false)) then raise exception 'Project recipient mismatch' using errcode='42501';end if;
  recipient:=project.client_id;
 end if;
 if p_input->>'context'='direct' and length(btrim(coalesce(p_input->>'clientName','')))=0 then raise exception 'Client name required' using errcode='22023';end if;
 foreach field in array array['clientName','clientPhone','clientCedula','clientEmail','title','notes'] loop
  if jsonb_typeof(p_input->field) not in ('string','null') or length(p_input->>field)>(case field when 'notes' then 3000 when 'clientEmail' then 254 when 'clientPhone' then 40 when 'clientCedula' then 40 else 160 end) then raise exception 'Invalid text' using errcode='22023';end if;
 end loop;
 if jsonb_typeof(p_input->'items') is distinct from 'array' or jsonb_array_length(p_input->'items') not between 1 and 20
 or p_input->>'taxMode' not in ('incluido','mas_iva','exento') or jsonb_typeof(p_input->'validDays') is distinct from 'number' or (p_input->>'validDays')!~'^[0-9]{1,2}$' or (p_input->>'validDays')::integer not between 1 and 90 then raise exception 'Invalid quote' using errcode='22023';end if;
 for item in select value from jsonb_array_elements(p_input->'items') loop
  if jsonb_typeof(item) is distinct from 'object' or not(item ?& array['description','quantity','unit_price']) or (item-array['description','quantity','unit_price'])<>'{}'::jsonb or jsonb_typeof(item->'description') is distinct from 'string' or length(btrim(item->>'description')) not between 1 and 500
   or jsonb_typeof(item->'quantity') is distinct from 'number' or jsonb_typeof(item->'unit_price') is distinct from 'number' then raise exception 'Invalid line' using errcode='22023';end if;
  if (item->>'quantity')::numeric<=0 or (item->>'quantity')::numeric>9999 or trunc((item->>'quantity')::numeric,2)<>(item->>'quantity')::numeric or (item->>'unit_price')::numeric<0 or (item->>'unit_price')::numeric>222222222 or trunc((item->>'unit_price')::numeric)<>(item->>'unit_price')::numeric then raise exception 'Invalid amount' using errcode='22023';end if;
 end loop;
 totals:=pro_quote_choice_totals(p_input->'items',p_input->>'taxMode');
 for attempt in 1..3 loop
  select coalesce(max(quote_number),0)+1 into n from quotes where professional_id=professional.id;
  begin
   insert into quotes(professional_id,project_id,client_id,client_name,client_phone,client_cedula,client_email,public_code,quote_number,title,items,tax_mode,subtotal,tax_amount,total,notes,valid_until,status,created_source_host,created_app_environment,created_supabase_project_ref)
   values(professional.id,project.id,recipient,p_input->>'clientName',p_input->>'clientPhone',p_input->>'clientCedula',p_input->>'clientEmail',p_source->>'public_code',n,p_input->>'title',p_input->'items',p_input->>'taxMode',(totals->>'subtotal')::integer,(totals->>'taxAmount')::integer,(totals->>'total')::integer,p_input->>'notes',(now() at time zone 'America/Costa_Rica')::date+(p_input->>'validDays')::integer,'sent',p_source->>'created_source_host',p_source->>'created_app_environment',p_source->>'created_supabase_project_ref') returning * into q;
   exit;
  exception when unique_violation then if attempt=3 then raise;end if;
  end;
 end loop;
 if c.id is not null then insert into pro_quote_links(user_id,"quoteId","clientId") values(p_actor,q.id::text,c.id);end if;
 update pro_workspace_core set revision=revision+1,updated_at=now(),panel_fields=case when 'quoteLinks'=any(panel_fields) then panel_fields else array_append(panel_fields,'quoteLinks') end where user_id=p_actor;
 result:=jsonb_build_object('quote',to_jsonb(q)||jsonb_build_object('professional_name',professional.business_name,'professional_full_name',(select full_name from profiles where id=p_actor)));
 insert into pro_direct_project_quote_actions values(p_actor,aid,p_input,result);return result;
end $$;

alter table pro_direct_project_quote_actions enable row level security;
revoke all on pro_direct_project_quote_actions from public,anon,authenticated;
grant all on pro_direct_project_quote_actions to service_role;
revoke all on function public.pro_direct_project_quote_create(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.pro_direct_project_quote_create(uuid,jsonb,jsonb) to service_role;
commit;
notify pgrst, 'reload schema';
