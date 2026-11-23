-- Row 39 (proposal with approval per line): the professional turns the lines the customer APPROVED in a shared version into a new
-- private estimate draft (the next version to share) with one action. Built on the same immutable evidence and the same
-- receipts table as "copy from a shared version"; the shared version, its decisions and the source draft are never changed.
create or replace function public.pro_quote_line_decisions_convert(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 action_key uuid;publication_key uuid;target_key uuid;prior public.pro_private_estimate_publication_copies;evidence jsonb;snapshot jsonb;kept jsonb;totals jsonb;
 target public.pro_private_estimates;line jsonb;line_position integer:=0;result jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object'
  or (select array_agg(key order by key) from jsonb_object_keys(p_input) key) is distinct from array['action','actionId','publicationId','targetEstimateId']
  or p_input->>'action' is distinct from 'convert_approved'
  or jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'publicationId') is distinct from 'string' or jsonb_typeof(p_input->'targetEstimateId') is distinct from 'string'
 then raise exception 'Invalid conversion' using errcode='22023';end if;
 action_key:=(p_input->>'actionId')::uuid;publication_key:=(p_input->>'publicationId')::uuid;target_key:=(p_input->>'targetEstimateId')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 perform pg_advisory_xact_lock(hashtextextended('pro-private-estimate-action:'||p_actor::text||':'||action_key::text,0));
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into prior from public.pro_private_estimate_publication_copies where actor_id=p_actor and action_id=action_key;
 if found then
  if prior.input is distinct from p_input then raise exception 'Conversion action reused' using errcode='40001';end if;
  if not exists(select 1 from public.pro_private_estimates where owner_id=p_actor and id=prior.target_estimate_id) then raise exception 'Converted estimate unavailable' using errcode='42501';end if;
  return prior.result;
 end if;
 if exists(select 1 from public.pro_private_estimate_actions where actor_id=p_actor and action_id=action_key)
  or exists(select 1 from public.pro_private_estimate_history where owner_id=p_actor and action_id=action_key)
  or exists(select 1 from public.pro_private_estimates where owner_id=p_actor and id=target_key)
 then raise exception 'Conversion action or target already exists' using errcode='40001';end if;
 evidence:=public.pro_private_estimate_publication_copy_snapshot(p_actor,publication_key);
 snapshot:=evidence->'snapshot';
 select coalesce(jsonb_agg(l.value order by l.ord),'[]'::jsonb) into kept
  from jsonb_array_elements(snapshot->'lines') with ordinality l(value,ord)
  join public.pro_quote_line_decisions d on d.publication_id=publication_key and d.line_id::text=l.value->>'id' and d.decision='approved';
 if jsonb_array_length(kept)=0 then raise exception 'No approved lines to convert' using errcode='22023';end if;
 if not exists(select 1 from public.pro_clients where user_id=p_actor and id=snapshot->>'clientId') then raise exception 'Historical customer unavailable' using errcode='40001';end if;
 totals:=public.pro_private_estimate_totals(kept);
 insert into public.pro_private_estimates(owner_id,id,client_id,client_snapshot,source,issuer,title,notes,currency,valid_until,subtotal_cents,discount_cents,tax_cents,total_cents,revision,archived,created_at,updated_at)
  values(p_actor,target_key,snapshot->>'clientId',snapshot->'client',snapshot->'source',snapshot->'issuer',snapshot->>'title',snapshot->>'notes',snapshot->>'currency',(snapshot->>'validUntil')::date,
   (totals->>'subtotalCents')::bigint,(totals->>'discountCents')::bigint,(totals->>'taxCents')::bigint,(totals->>'totalCents')::bigint,1,false,clock_timestamp(),clock_timestamp())
  returning * into target;
 for line in select value from jsonb_array_elements(kept) loop
  line_position:=line_position+1;
  insert into public.pro_private_estimate_items values(p_actor,target_key,(line->>'id')::uuid,line_position,line);
 end loop;
 result:=jsonb_build_object('action','convert_approved','publication',evidence->'publication','estimate',public.pro_private_estimate_json(target),'lineCount',jsonb_array_length(kept));
 insert into public.pro_private_estimate_history(owner_id,estimate_id,action_id,action,before_estimate,after_estimate) values(p_actor,target_key,action_key,'duplicate',snapshot,result->'estimate');
 insert into public.pro_private_estimate_publication_copies(actor_id,action_id,publication_id,source_estimate_id,source_revision,target_estimate_id,source_snapshot,input,result)
  values(p_actor,action_key,publication_key,(evidence->'publication'->>'estimateId')::uuid,(evidence->'publication'->>'estimateRevision')::integer,target_key,snapshot||jsonb_build_object('lines',kept),p_input,result);
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 return result;
end $$;
revoke all on function public.pro_quote_line_decisions_convert(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pro_quote_line_decisions_convert(uuid,jsonb) to service_role;
