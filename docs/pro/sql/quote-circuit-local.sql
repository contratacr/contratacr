-- LOCAL PRO ONLY. Round 7A (2026-11-13): quote -> job -> customer -> finances as ONE circuit.
--
-- 1. Acceptance drives the job. When the owner shares a version to the customer ACCOUNT linked to a
--    job (recipient «linked»: booking or project invitation) and that customer accepts it (pro_private_
--    estimate_publication_mutate 'accept', directly or through the e-signature path), the accepted
--    version is continued into THAT job automatically, through the same immutable ledger the owner's
--    «Continue to job» uses (pro_private_estimate_work_agreements). The agreed amount, the header phase,
--    the next step, the job's quote lines for invoicing and the customer's «join the job» prompt all
--    read that one row: nothing is posted twice, no balance is forked. Exactly the owner's continuation
--    rules apply (pro_private_estimate_work_reason: same customer, job not cancelled, no other accepted
--    estimate, no legacy agreed amount or ledger entries). If a rule fails, or the owner/job is busy
--    (try-lock / NOWAIT, never a wait inside the customer's acceptance), nothing is created and the
--    owner can still continue it manually. Never blocks the acceptance itself. A version claimed by
--    e-mail + code keeps the explicit owner decision (unchanged contract). Existing accepted linked
--    versions are back-filled once with the same function.
-- 2. Contract starters: three ContrataCR starter templates (renovation, one-off service, maintenance),
--    ES/EN, besides the blank contract. Using one installs it once as an ordinary account template
--    (editable, archivable) and creates the contract with the existing writer (pro_contract_apply),
--    with its own receipt in pro_contract_actions (idempotent actionId).
-- 3. Customer reader of the quotes shared with this customer for one job (customer project page,
--    always shown: a quote is shared explicitly; the opt-in Finances section is unchanged).
-- No e-mail, notification, payment or invoice is created. Owner rights: pro_private_work_tools_enabled.
begin;

-- ---------------------------------------------------------------- 1. acceptance -> job
create or replace function public.pro_quote_circuit_target_work(p_owner uuid,p_publication uuid) returns text
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare v public.pro_private_estimate_publications;b public.pro_private_estimate_publication_recipients;wid text;
begin
 select * into v from public.pro_private_estimate_publications where id=p_publication and owner_id=p_owner;
 if not found then return null;end if;
 -- Only a version shared to the customer ACCOUNT linked to a job ties the acceptance to that job.
 -- A version claimed by e-mail + code keeps the owner's explicit «Continue to job» decision.
 select * into b from public.pro_private_estimate_publication_recipients where owner_id=p_owner and estimate_id=v.estimate_id;
 if b.proof->>'kind'='linked' then
  select r.work_id into wid from public.pro_appointment_requests r where r.owner_id=p_owner and r.id::text=b.proof->>'requestId' and r.client_user_id=b.recipient_id;
 end if;
 return wid;
end $$;

-- Returns true when the agreement was created. Never raises.
create or replace function public.pro_quote_circuit_auto_continue(p_publication uuid) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v public.pro_private_estimate_publications;wid text;evidence jsonb;w public.pro_work;
begin
 select * into v from public.pro_private_estimate_publications where id=p_publication;
 if not found then return false;end if;
 if exists(select 1 from public.pro_private_estimate_work_agreements where publication_id=v.id) then return false;end if;
 if (select status from public.pro_private_estimate_publication_states where publication_id=v.id) is distinct from 'accepted' then return false;end if;
 begin
  wid:=public.pro_quote_circuit_target_work(v.owner_id,v.id);
  if wid is null or exists(select 1 from public.pro_private_estimate_work_agreements where owner_id=v.owner_id and work_id=wid) then return false;end if;
  -- Owner mutex of every job/finance writer: never wait for it inside the customer's acceptance.
  if not pg_try_advisory_xact_lock(hashtextextended(v.owner_id::text,0)) then return false;end if;
  evidence:=public.pro_private_estimate_work_source(v.owner_id,v.id);
  if public.pro_private_estimate_work_reason(v.owner_id,wid,v.client_id,(evidence->'accepted'->>'actorId')::uuid,v.id) is not null then return false;end if;
  select * into w from public.pro_work where user_id=v.owner_id and id=wid for update nowait;
  if not found or w."clientId" is distinct from v.client_id or coalesce(w.cancelled,false) then return false;end if;
  insert into public.pro_private_estimate_work_agreements(owner_id,work_id,publication_id,estimate_id,version,estimate_revision,client_id,title,currency,total_cents,content_hash,accepted_action_id,accepted_actor_id,accepted_at,source_snapshot,work_snapshot)
  values(v.owner_id,w.id,v.id,(evidence->>'estimateId')::uuid,(evidence->>'version')::integer,(evidence->>'estimateRevision')::integer,v.client_id,evidence->>'title',evidence->>'currency',(evidence->>'totalCents')::bigint,evidence->>'contentHash',
   (evidence->'accepted'->>'actionId')::uuid,(evidence->'accepted'->>'actorId')::uuid,(evidence->'accepted'->>'at')::timestamptz,evidence->'sourceSnapshot',public.pro_private_estimate_work_json(w));
  return true;
 exception when others then return false;
 end;
end $$;

create or replace function public.pro_quote_circuit_on_accept() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.input->>'action'='accept' then perform public.pro_quote_circuit_auto_continue(new.publication_id);end if;
 return new;
end $$;
drop trigger if exists pro_quote_circuit_on_accept on public.pro_private_estimate_publication_actions;
create trigger pro_quote_circuit_on_accept after insert on public.pro_private_estimate_publication_actions for each row execute function public.pro_quote_circuit_on_accept();

-- One-time back-fill of versions accepted before this module (same rules; idempotent).
do $$declare p uuid;begin
 for p in select v.id from public.pro_private_estimate_publications v join public.pro_private_estimate_publication_states s on s.publication_id=v.id
  where s.status='accepted' and not exists(select 1 from public.pro_private_estimate_work_agreements a where a.publication_id=v.id) order by v.created_at loop
  perform public.pro_quote_circuit_auto_continue(p);
 end loop;
end $$;

-- ---------------------------------------------------------------- 2. contract starters
-- ContrataCR's own wording. Tokens come from pro_contract_field_keys(); values are filled in the preview.
create or replace function public.pro_contract_starters() returns jsonb
language sql immutable security invoker set search_path=public,pg_temp as $$ select $json${
 "renovation":{
  "es":{"title":"Contrato de remodelación","description":"Obra con etapas, anticipo y cambios por escrito.","depositPercent":30,"clauses":[
   {"title":"Partes","body":"{{empresa.nombre}} (la empresa) y {{cliente.nombre}} (el cliente) acuerdan este contrato para el proyecto {{proyecto.nombre}}."},
   {"title":"Alcance","body":"La empresa realizará los trabajos descritos en la cotización {{cotizacion.codigo}}. Lo que no esté en esa cotización no forma parte del contrato."},
   {"title":"Precio y anticipo","body":"El precio total es {{cotizacion.total}}. El cliente pagará un anticipo del {{anticipo.porcentaje}} ({{anticipo.monto}}) antes del inicio y el saldo según el avance acordado."},
   {"title":"Cambios","body":"Todo cambio de alcance, materiales o plazo se acordará por escrito antes de ejecutarse, con su efecto en precio y cronograma."},
   {"title":"Plazos y acceso","body":"Las fechas del cronograma son estimadas. El cliente dará acceso al sitio en los horarios acordados; los atrasos por falta de acceso, clima o materiales no imputables a la empresa ampliarán el plazo."},
   {"title":"Garantía","body":"La empresa corregirá sin costo los defectos de mano de obra que se reporten por escrito durante los seis meses siguientes a la entrega."},
   {"title":"Terminación","body":"Cualquiera de las partes puede terminar el contrato por incumplimiento grave, avisando por escrito. El cliente pagará los trabajos ejecutados hasta esa fecha."}]},
  "en":{"title":"Renovation agreement","description":"Staged work with a deposit and written changes.","depositPercent":30,"clauses":[
   {"title":"Parties","body":"{{empresa.nombre}} (the company) and {{cliente.nombre}} (the customer) enter into this agreement for the project {{proyecto.nombre}}."},
   {"title":"Scope","body":"The company will carry out the work described in quote {{cotizacion.codigo}}. Anything not in that quote is not part of this agreement."},
   {"title":"Price and deposit","body":"The total price is {{cotizacion.total}}. The customer will pay a deposit of {{anticipo.porcentaje}} ({{anticipo.monto}}) before work starts and the balance according to the agreed progress."},
   {"title":"Changes","body":"Any change to scope, materials or timing will be agreed in writing before it is carried out, with its effect on price and schedule."},
   {"title":"Timing and access","body":"Schedule dates are estimates. The customer will provide site access at the agreed times; delays caused by lack of access, weather or materials outside the company's control extend the timeline."},
   {"title":"Warranty","body":"The company will fix, at no cost, workmanship defects reported in writing within six months after handover."},
   {"title":"Termination","body":"Either party may end this agreement for a serious breach by giving written notice. The customer will pay for the work done up to that date."}]}},
 "service":{
  "es":{"title":"Contrato de servicio puntual","description":"Un servicio con precio cerrado y pago al terminar.","depositPercent":null,"clauses":[
   {"title":"Servicio","body":"{{empresa.nombre}} prestará a {{cliente.nombre}} el servicio {{proyecto.nombre}} según la cotización {{cotizacion.codigo}}."},
   {"title":"Precio","body":"El precio cerrado es {{cotizacion.total}}, que el cliente pagará al terminar el servicio, salvo que se acuerde otra forma por escrito."},
   {"title":"Fecha y visita","body":"La fecha se coordina con el cliente. Si la visita no puede realizarse por causas del cliente, se reprogramará de común acuerdo."},
   {"title":"Garantía","body":"La empresa atenderá sin costo los reclamos sobre el servicio que se presenten por escrito durante los 30 días siguientes."}]},
  "en":{"title":"One-off service agreement","description":"A single service with a fixed price, paid on completion.","depositPercent":null,"clauses":[
   {"title":"Service","body":"{{empresa.nombre}} will provide {{cliente.nombre}} with the service {{proyecto.nombre}} as described in quote {{cotizacion.codigo}}."},
   {"title":"Price","body":"The fixed price is {{cotizacion.total}}, payable by the customer when the service is completed, unless another arrangement is agreed in writing."},
   {"title":"Date and visit","body":"The date is arranged with the customer. If the visit cannot take place for reasons on the customer's side, it will be rescheduled by mutual agreement."},
   {"title":"Warranty","body":"The company will handle, at no cost, claims about the service made in writing within the following 30 days."}]}},
 "maintenance":{
  "es":{"title":"Contrato de mantenimiento","description":"Visitas periódicas con alcance y precio acordados.","depositPercent":null,"clauses":[
   {"title":"Objeto","body":"{{empresa.nombre}} dará a {{cliente.nombre}} el mantenimiento {{proyecto.nombre}} con la frecuencia y el alcance de la cotización {{cotizacion.codigo}}."},
   {"title":"Precio y pagos","body":"El precio acordado es {{cotizacion.total}} y se paga según el calendario de pagos acordado con el cliente."},
   {"title":"Repuestos y extras","body":"Los repuestos, materiales o trabajos fuera del alcance se cotizarán aparte y solo se realizarán con la aprobación del cliente."},
   {"title":"Vigencia","body":"Este contrato rige desde el {{fecha.hoy}}. Cualquiera de las partes puede terminarlo avisando por escrito con 30 días de anticipación."}]},
  "en":{"title":"Maintenance agreement","description":"Regular visits with an agreed scope and price.","depositPercent":null,"clauses":[
   {"title":"Purpose","body":"{{empresa.nombre}} will provide {{cliente.nombre}} with the maintenance {{proyecto.nombre}} at the frequency and scope of quote {{cotizacion.codigo}}."},
   {"title":"Price and payments","body":"The agreed price is {{cotizacion.total}}, paid according to the payment schedule agreed with the customer."},
   {"title":"Parts and extras","body":"Parts, materials or work outside the scope will be quoted separately and only carried out with the customer's approval."},
   {"title":"Term","body":"This agreement applies from {{fecha.hoy}}. Either party may end it with 30 days' written notice."}]}}
}$json$::jsonb $$;

-- Deterministic RFC 4122 v4-shaped identifier (the API validates UUIDs strictly).
create or replace function public.pro_quote_circuit_uuid(p_seed text) returns uuid
language sql immutable security invoker set search_path=public,pg_temp as $$
 select (substr(m,1,12)||'4'||substr(m,14,3)||'8'||substr(m,18,15))::uuid from (select md5(p_seed) m) x $$;

create or replace function public.pro_contract_starter_create(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;receipt public.pro_contract_actions;starter jsonb;lang text;key text;tid uuid;t public.pro_contract_templates;clauses jsonb;e jsonb;result jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or p_input->>'action' is distinct from 'starter_create' then raise exception 'Invalid contract action' using errcode='22023';end if;
 perform public.pro_contract_expect(p_input,array['action','actionId','workId','id','starter','language','estimateId']);
 aid:=public.pro_contract_uuid(p_input->'actionId');
 if jsonb_typeof(p_input->'starter') is distinct from 'string' or jsonb_typeof(p_input->'language') is distinct from 'string' or p_input->>'language' not in('es','en') then raise exception 'Invalid starter' using errcode='22023';end if;
 key:=p_input->>'starter';lang:=p_input->>'language';starter:=public.pro_contract_starters()->key->lang;
 if starter is null then raise exception 'Invalid starter' using errcode='22023';end if;
 -- Same lock order and receipt table as pro_contracts_mutate.
 perform pg_advisory_xact_lock(hashtextextended('pro-contract-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_contract_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-contracts:'||p_actor::text,0));
 tid:=public.pro_quote_circuit_uuid('pro-contract-starter:'||p_actor::text||':'||key||':'||lang);
 select * into t from public.pro_contract_templates where owner_id=p_actor and id=tid for update;
 if found and t.archived then raise exception 'Restore the starter template first' using errcode='22023',hint='pro_contract_starter_archived';end if;
 if not found then
  if (select count(*) from public.pro_contract_templates where owner_id=p_actor)>=200 then raise exception 'Too many templates' using errcode='22023';end if;
  clauses:='[]'::jsonb;
  for e in select value from jsonb_array_elements(starter->'clauses') loop clauses:=clauses||public.pro_contract_clause_item(gen_random_uuid(),e->>'title',e->>'body',null);end loop;
  insert into public.pro_contract_templates(owner_id,id,title,description,deposit_percent,clauses) values(p_actor,tid,starter->>'title',starter->>'description',(starter->>'depositPercent')::numeric,clauses) returning * into t;
  perform public.pro_contract_history_add(p_actor,p_actor,public.pro_quote_circuit_uuid('pro-contract-starter-install:'||aid::text),'template',t.id,null,'starter_install',null,public.pro_contract_template_json(t,true));
 end if;
 result:=public.pro_contract_apply(p_actor,jsonb_build_object('action','contract_create','actionId',aid,'workId',p_input->'workId','id',p_input->'id','templateId',tid,'title',null,'language',lang,'estimateId',p_input->'estimateId','depositPercent',null),aid);
 insert into public.pro_contract_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- 3. customer: quotes shared for this job
drop function if exists public.pro_private_estimate_publication_project_client(uuid,uuid);
create or replace function public.pro_client_project_quotes_read(p_actor uuid,p_request uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r public.pro_appointment_requests;w public.pro_work;items jsonb;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into r from public.pro_appointment_requests where id=p_request and client_user_id=p_actor and status in('confirmed','completed') and work_id is not null;
 if not found then return jsonb_build_object('items','[]'::jsonb);end if;
 select * into w from public.pro_work where user_id=r.owner_id and id=r.work_id;
 if not found then return jsonb_build_object('items','[]'::jsonb);end if;
 select coalesce(jsonb_agg(jsonb_build_object('publicationId',x.id,'title',x.title,'version',x.version,'status',x.status,'totalCents',x.total,'currency',x.currency,'sharedAt',x.created_at) order by x.created_at desc,x.id),'[]'::jsonb) into items from (
  select distinct on(v.estimate_id) v.id,v.content->>'title' title,v.version,s.status,(v.content->>'totalCents')::bigint total,v.content->>'currency' currency,v.created_at
  from public.pro_private_estimate_publications v join public.pro_private_estimate_publication_states s on s.publication_id=v.id
  where v.owner_id=r.owner_id and s.recipient_id=p_actor and s.status in('shared','changes_requested','accepted','declined')
   and(exists(select 1 from public.pro_project_estimate_rows(r.owner_id,w) e where e.estimate_id=v.estimate_id and e.relation='project')
    or exists(select 1 from public.pro_private_estimate_publication_recipients b where b.owner_id=v.owner_id and b.estimate_id=v.estimate_id and b.proof->>'kind'='linked' and b.proof->>'requestId'=r.id::text))
  order by v.estimate_id,v.version desc limit 50) x;
 return jsonb_build_object('items',items);
end $$;

do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in('pro_quote_circuit_uuid','pro_quote_circuit_target_work','pro_quote_circuit_auto_continue','pro_quote_circuit_on_accept','pro_contract_starters','pro_contract_starter_create','pro_client_project_quotes_read') loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  if f::text not like 'pro_quote_circuit_on_accept(%' then execute format('grant execute on function %s to service_role',f);end if;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
