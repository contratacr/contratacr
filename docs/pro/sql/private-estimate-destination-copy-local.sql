-- LOCAL Pro only. Copy saved commercial content to an explicitly reviewed destination.
-- No old function/table definition changes, publication decisions or financial writes.
-- Owner -> common old estimate-action advisory -> source/destination SHARE NOWAIT.
-- NOWAIT avoids the legacy booking work-row -> owner advisory inverse order.
begin;
create table if not exists public.pro_private_estimate_destination_copies (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  action_id uuid not null,target_estimate_id uuid not null,
  source_kind text not null check(source_kind in('draft','publication')),
  source_estimate_id uuid not null,source_snapshot jsonb not null,
  destination_snapshot jsonb not null,input jsonb not null,result jsonb not null,
  at timestamptz not null default clock_timestamp(),primary key(actor_id,action_id),
  unique(actor_id,target_estimate_id),foreign key(actor_id,target_estimate_id)
    references public.pro_private_estimates(owner_id,id)on delete cascade
);

create or replace function public.pro_private_estimate_destination_copy_source(p_actor uuid,p_source jsonb)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare document public.pro_private_estimates;reference jsonb;evidence jsonb;keys text[];
begin
  if not coalesce(public.pro_private_work_tools_enabled(p_actor),false)then raise exception 'Forbidden'using errcode='42501';end if;
  if jsonb_typeof(p_source)is distinct from'object'or jsonb_typeof(p_source->'kind')is distinct from'string'then
    raise exception 'Invalid estimate source'using errcode='22023';end if;
  select array_agg(key order by key)into keys from jsonb_object_keys(p_source)key;
  if p_source->>'kind'='draft'then
    if keys is distinct from array['estimateId','kind','revision']
      or jsonb_typeof(p_source->'estimateId')is distinct from'string'
      or jsonb_typeof(p_source->'revision')is distinct from'number'
      or not coalesce(p_source->>'revision'~'^[0-9]{1,10}$',false)
      or(p_source->>'revision')::numeric not between 1 and 2147483647 then
      raise exception 'Invalid saved source'using errcode='22023';end if;
    select * into document from public.pro_private_estimates where owner_id=p_actor and id=(p_source->>'estimateId')::uuid;
    if not found then raise exception 'Owned estimate unavailable'using errcode='42501';end if;
    if document.revision<>(p_source->>'revision')::integer then raise exception 'Saved source changed'using errcode='40001';end if;
    return jsonb_build_object('source',p_source,'estimate',public.pro_private_estimate_json(document));
  elsif p_source->>'kind'='publication'then
    if keys is distinct from array['contentHash','estimateRevision','kind','publicationId','version']
      or jsonb_typeof(p_source->'publicationId')is distinct from'string'
      or jsonb_typeof(p_source->'contentHash')is distinct from'string'
      or not coalesce(p_source->>'contentHash'~'^[a-f0-9]{64}$',false)
      or jsonb_typeof(p_source->'version')is distinct from'number'
      or jsonb_typeof(p_source->'estimateRevision')is distinct from'number'
      or not coalesce(p_source->>'version'~'^[0-9]{1,10}$',false)
      or not coalesce(p_source->>'estimateRevision'~'^[0-9]{1,10}$',false)
      or(p_source->>'version')::numeric not between 1 and 2147483647
      or(p_source->>'estimateRevision')::numeric not between 1 and 2147483647 then
      raise exception 'Invalid shared source'using errcode='22023';end if;
    evidence:=public.pro_private_estimate_publication_copy_snapshot(p_actor,(p_source->>'publicationId')::uuid);
    reference:=evidence->'publication';
    if reference->'version'is distinct from p_source->'version'
      or reference->'estimateRevision'is distinct from p_source->'estimateRevision'
      or reference->'contentHash'is distinct from p_source->'contentHash'then
      raise exception 'Shared source changed'using errcode='40001';end if;
    return jsonb_build_object('source',reference||jsonb_build_object('kind','publication'),'estimate',evidence->'snapshot');
  end if;
  raise exception 'Invalid source kind'using errcode='22023';
end $$;

create or replace function public.pro_private_estimate_destination_copy_context(
  p_actor uuid,p_client text default null,p_kind text default null,p_id text default null
)returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
  select jsonb_build_object('client',c.value->'client','clientFingerprint',c.value->'clientFingerprint','source',c.value->'source')
    from(select public.pro_private_estimate_context(p_actor,p_client,p_kind,p_id)value)c
$$;

create or replace function public.pro_private_estimate_destination_copy_options(
  p_actor uuid,p_kind text,p_query text default '',p_after text default null,p_fingerprint text default null
)returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare answer jsonb;
begin
  if not coalesce(public.pro_private_work_tools_enabled(p_actor),false)then raise exception 'Forbidden'using errcode='42501';end if;
  if p_kind is null or p_kind not in('client','work','manual')or p_query is null or length(p_query)>100
    or(p_after is null)is distinct from(p_fingerprint is null)then raise exception 'Invalid destination query'using errcode='22023';end if;
  with candidates as materialized(
    select c.id,c.name,c.id client_id,c.name client_name,md5(to_jsonb(c)::text)version,
      null::text advisory_date,false has_linked_work
      from public.pro_clients c where p_kind='client'and c.user_id=p_actor and not c.archived
    union all
    select w.id,w.service,w."clientId",c.name,md5(to_jsonb(w)::text),nullif(w.start,''),false
      from public.pro_work w join public.pro_clients c on c.user_id=w.user_id and c.id=w."clientId"
      where p_kind='work'and w.user_id=p_actor and not coalesce(w.cancelled,false)and not c.archived
    union all
    select l.id::text,l.title,l.client_id,c.name,l.revision::text,
      to_char(l.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),m.lead_id is not null
      from public.pro_lead_center_records l join public.pro_clients c on c.user_id=l.owner_id and c.id=l.client_id
      left join public.pro_manual_lead_works m on m.owner_id=l.owner_id and m.lead_id=l.id
      where p_kind='manual'and l.owner_id=p_actor and l.kind='manual'and not l.archived and not c.archived
  ),eligible as materialized(select * from candidates where p_query=''or strpos(lower(name||' '||client_name),lower(p_query))>0),
  token as(select md5(jsonb_build_object('owner',p_actor,'kind',p_kind,'query',p_query,
    'rows',coalesce(jsonb_agg(jsonb_build_array(id,name,client_id,client_name,version,advisory_date,has_linked_work)order by id),'[]'::jsonb))::text)value from eligible),
  matches as materialized(select * from eligible where p_after is null or id>p_after order by id limit 21),
  page as(select * from matches order by id limit 20)
  select jsonb_build_object('fingerprint',(select value from token),
    'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'clientId',client_id,'clientName',client_name,'date',advisory_date,'hasLinkedWork',has_linked_work)order by id)from page),'[]'::jsonb),
    'nextCursor',case when(select count(*)from matches)>20 then(select id from page order by id desc limit 1)else null end,
    'anchorValid',p_after is null or exists(select 1 from eligible where id=p_after))into answer;
  if p_after is not null and(p_fingerprint is distinct from answer->>'fingerprint'or not(answer->>'anchorValid')::boolean)then
    raise exception 'Destination choices changed'using errcode='40001';end if;
  return answer-'anchorValid';
end $$;

create or replace function public.pro_private_estimate_destination_copy_mutate(p_actor uuid,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  aid uuid;target_id uuid;prior public.pro_private_estimate_destination_copies;
  evidence jsonb;snapshot jsonb;destination jsonb;context jsonb;answer jsonb;line jsonb;pos integer:=0;
  document public.pro_private_estimates;totals jsonb;
begin
  if not coalesce(public.pro_private_work_tools_enabled(p_actor),false)then raise exception 'Forbidden'using errcode='42501';end if;
  if jsonb_typeof(p_input)is distinct from'object'
    or(select array_agg(key order by key)from jsonb_object_keys(p_input)key)is distinct from array['action','actionId','destination','source','targetEstimateId']
    or p_input->>'action'is distinct from'copy_to_destination'
    or jsonb_typeof(p_input->'actionId')is distinct from'string'
    or jsonb_typeof(p_input->'targetEstimateId')is distinct from'string'
    or jsonb_typeof(p_input->'destination')is distinct from'object'then
    raise exception 'Invalid destination copy'using errcode='22023';end if;
  aid:=(p_input->>'actionId')::uuid;target_id:=(p_input->>'targetEstimateId')::uuid;destination:=p_input->'destination';
  if aid is null or target_id is null
    or(select array_agg(key order by key)from jsonb_object_keys(destination)key)is distinct from array['clientFingerprint','clientId','source']
    or jsonb_typeof(destination->'clientId')is distinct from'string'or length(destination->>'clientId')not between 1 and 160
    or jsonb_typeof(destination->'clientFingerprint')is distinct from'string'
    or not coalesce(destination->>'clientFingerprint'~'^[a-f0-9]{32}$',false)
    or jsonb_typeof(destination->'source')not in('null','object')then
    raise exception 'Invalid destination snapshot'using errcode='22023';end if;
  if destination->'source'<>'null'::jsonb then
    if destination->'source'->>'kind'='manual'then
      if(select array_agg(key order by key)from jsonb_object_keys(destination->'source')key)is distinct from array['id','kind','revision']
        or jsonb_typeof(destination->'source'->'revision')is distinct from'number'
        or not coalesce(destination->'source'->>'revision'~'^[0-9]{1,10}$',false)
        or(destination->'source'->>'revision')::numeric not between 1 and 2147483647 then raise exception 'Invalid opportunity destination'using errcode='22023';end if;
    elsif destination->'source'->>'kind'='work'then
      if(select array_agg(key order by key)from jsonb_object_keys(destination->'source')key)is distinct from array['fingerprint','id','kind']
        or jsonb_typeof(destination->'source'->'fingerprint')is distinct from'string'
        or not coalesce(destination->'source'->>'fingerprint'~'^[a-f0-9]{32}$',false)then raise exception 'Invalid work destination'using errcode='22023';end if;
    else raise exception 'Invalid destination origin'using errcode='22023';end if;
    if jsonb_typeof(destination->'source'->'id')is distinct from'string'or length(destination->'source'->>'id')not between 1 and 160 then
      raise exception 'Invalid destination identity'using errcode='22023';end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
  perform pg_advisory_xact_lock(hashtextextended('pro-private-estimate-action:'||p_actor::text||':'||aid::text,0));
  if not coalesce(public.pro_private_work_tools_enabled(p_actor),false)then raise exception 'Forbidden'using errcode='42501';end if;
  select * into prior from public.pro_private_estimate_destination_copies c where c.actor_id=p_actor and c.action_id=aid;
  if found then
    if prior.input is distinct from p_input then raise exception 'Destination copy action reused'using errcode='40001';end if;
    if not exists(select 1 from public.pro_private_estimates where owner_id=p_actor and id=prior.target_estimate_id)then
      raise exception 'Owned copy unavailable'using errcode='42501';end if;
    return prior.result;
  end if;
  if exists(select 1 from public.pro_private_estimate_actions where actor_id=p_actor and action_id=aid)
    or exists(select 1 from public.pro_private_estimate_history where owner_id=p_actor and action_id=aid)
    or exists(select 1 from public.pro_private_estimates where owner_id=p_actor and id=target_id)then
    raise exception 'Copy action or target already exists'using errcode='40001';end if;
  if p_input->'source'->>'kind'='draft'then
    perform 1 from public.pro_private_estimates where owner_id=p_actor and id=(p_input->'source'->>'estimateId')::uuid for share nowait;
  end if;
  evidence:=public.pro_private_estimate_destination_copy_source(p_actor,p_input->'source');snapshot:=evidence->'estimate';
  if snapshot->>'id'=target_id::text then raise exception 'Copy needs a new document'using errcode='40001';end if;
  if destination->'source'->>'kind'='manual'then
    perform 1 from public.pro_lead_center_records where owner_id=p_actor and kind='manual'and id=(destination->'source'->>'id')::uuid for share nowait;
  elsif destination->'source'->>'kind'='work'then
    perform 1 from public.pro_work where user_id=p_actor and id=destination->'source'->>'id'for share nowait;
  end if;
  perform 1 from public.pro_clients where user_id=p_actor and id=destination->>'clientId'for share nowait;
  context:=public.pro_private_estimate_destination_copy_context(p_actor,destination->>'clientId',destination->'source'->>'kind',destination->'source'->>'id');
  if context->'client'->>'id'is distinct from destination->>'clientId'
    or context->'clientFingerprint'is distinct from destination->'clientFingerprint'
    or context->'source'is distinct from destination->'source'then
    raise exception 'Reviewed destination changed'using errcode='40001';end if;
  totals:=public.pro_private_estimate_totals(snapshot->'lines');
  if totals is distinct from jsonb_build_object('subtotalCents',snapshot->'subtotalCents',
    'discountCents',snapshot->'discountCents','taxCents',snapshot->'taxCents','totalCents',snapshot->'totalCents')then
    raise exception 'Saved source totals changed'using errcode='40001';end if;
  insert into public.pro_private_estimates(owner_id,id,client_id,client_snapshot,source,issuer,title,notes,currency,valid_until,
    subtotal_cents,discount_cents,tax_cents,total_cents,revision,archived,created_at,updated_at)
    values(p_actor,target_id,destination->>'clientId',context->'client',context->'source',snapshot->'issuer',
      snapshot->>'title',snapshot->>'notes',snapshot->>'currency',(snapshot->>'validUntil')::date,
      (snapshot->>'subtotalCents')::bigint,(snapshot->>'discountCents')::bigint,(snapshot->>'taxCents')::bigint,
      (snapshot->>'totalCents')::bigint,1,false,clock_timestamp(),clock_timestamp())returning * into document;
  for line in select value from jsonb_array_elements(snapshot->'lines')loop
    pos:=pos+1;insert into public.pro_private_estimate_items values(p_actor,target_id,(line->>'id')::uuid,pos,line);
  end loop;
  answer:=jsonb_build_object('action','copy_to_destination','source',evidence->'source','estimate',public.pro_private_estimate_json(document));
  insert into public.pro_private_estimate_history(owner_id,estimate_id,action_id,action,before_estimate,after_estimate)
    values(p_actor,target_id,aid,'duplicate',snapshot,answer->'estimate');
  insert into public.pro_private_estimate_destination_copies(actor_id,action_id,target_estimate_id,source_kind,source_estimate_id,source_snapshot,destination_snapshot,input,result)
    values(p_actor,aid,target_id,p_input->'source'->>'kind',(snapshot->>'id')::uuid,snapshot,context,p_input,answer);
  if not coalesce(public.pro_private_work_tools_enabled(p_actor),false)then raise exception 'Forbidden'using errcode='42501';end if;
  return answer;
exception when lock_not_available then
  raise exception 'Source or destination is busy; review and retry'using errcode='40001';
end $$;

create or replace function public.pro_private_estimate_destination_copy_read(p_actor uuid,p_action uuid)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare receipt public.pro_private_estimate_destination_copies;
begin
  if not coalesce(public.pro_private_work_tools_enabled(p_actor),false)then raise exception 'Forbidden'using errcode='42501';end if;
  select * into receipt from public.pro_private_estimate_destination_copies where actor_id=p_actor and action_id=p_action;
  if not found then return jsonb_build_object('receipt',null);end if;
  if not exists(select 1 from public.pro_private_estimates where owner_id=p_actor and id=receipt.target_estimate_id)then
    raise exception 'Owned copy unavailable'using errcode='42501';end if;
  return jsonb_build_object('receipt',jsonb_build_object('input',receipt.input,'result',receipt.result));
end $$;

create or replace function public.pro_private_estimate_destination_copy_immutable()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if tg_op='DELETE'and not exists(select 1 from public.profiles where id=old.actor_id)then return old;end if;
  raise exception 'Immutable destination copy provenance'using errcode='23514';
end $$;
drop trigger if exists pro_private_estimate_destination_copy_immutable on public.pro_private_estimate_destination_copies;
create trigger pro_private_estimate_destination_copy_immutable before update or delete on public.pro_private_estimate_destination_copies
  for each row execute function public.pro_private_estimate_destination_copy_immutable();
alter table public.pro_private_estimate_destination_copies enable row level security;
revoke all on public.pro_private_estimate_destination_copies from public,anon,authenticated;
grant all on public.pro_private_estimate_destination_copies to service_role;
do $$declare f record;begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'and p.proname like'pro_private_estimate_destination_copy_%'loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
commit;
notify pgrst,'reload schema';
