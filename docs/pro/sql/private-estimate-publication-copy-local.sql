-- LOCAL Pro only: a new private draft from an exact immutable shared version.
-- Current draft, publication decision/audience, ledger, inventory and work remain untouched.
begin;

create table if not exists public.pro_private_estimate_publication_copies (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  action_id uuid not null,
  publication_id uuid not null references public.pro_private_estimate_publications(id) on delete cascade,
  source_estimate_id uuid not null,
  source_revision integer not null check(source_revision>0),
  target_estimate_id uuid not null,
  source_snapshot jsonb not null,
  input jsonb not null,
  result jsonb not null,
  at timestamptz not null default clock_timestamp(),
  primary key(actor_id,action_id),
  unique(actor_id,target_estimate_id),
  foreign key(actor_id,target_estimate_id)
    references public.pro_private_estimates(owner_id,id) on delete cascade
);

create or replace function public.pro_private_estimate_publication_copy_snapshot(
  p_actor uuid,
  p_publication uuid
) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare
  publication public.pro_private_estimate_publications;
  historical jsonb;
  snapshot jsonb;
  projected jsonb;
  lines jsonb;
begin
  if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  select * into publication
    from public.pro_private_estimate_publications
    where owner_id=p_actor and id=p_publication;
  if not found then
    raise exception 'Owned publication unavailable' using errcode='42501';
  end if;

  -- Exact revision uses pro_private_estimate_history_revision_lookup. It does not
  -- read the current draft or require a currently active origin/client/catalogue.
  select jsonb_agg(history.after_estimate) into historical
    from public.pro_private_estimate_history history
    where history.owner_id=p_actor
      and history.estimate_id=publication.estimate_id
      and (history.after_estimate->>'revision')::integer=publication.estimate_revision;
  if jsonb_array_length(coalesce(historical,'[]'::jsonb))<>1 then
    raise exception 'Historical estimate unavailable' using errcode='40001';
  end if;
  snapshot:=historical->0;
  if snapshot->>'id' is distinct from publication.estimate_id::text
    or snapshot->>'ownerId' is distinct from p_actor::text
    or snapshot->>'clientId' is distinct from publication.client_id
    or snapshot->'revision' is distinct from to_jsonb(publication.estimate_revision)
  then
    raise exception 'Historical estimate identity changed' using errcode='40001';
  end if;

  select jsonb_agg(jsonb_build_object(
    'id',value->'id','description',value->'description','unit',value->'unit',
    'qtyMilli',value->'qtyMilli','unitPriceCents',value->'unitPriceCents',
    'discountBps',value->'discountBps','taxBps',value->'taxBps'
  )||jsonb_strip_nulls(jsonb_build_object('group',value->'group')) /* launch fix 2026-11-17: keep the line section */ order by ordinal) into lines
    from jsonb_array_elements(snapshot->'lines') with ordinality entry(value,ordinal);
  projected:=jsonb_build_object(
    'title',snapshot->'title','currency',snapshot->'currency',
    'validUntil',snapshot->'validUntil','notes',snapshot->'notes',
    'issuer',jsonb_build_object(
      'issuerName',snapshot->'issuer'->'issuerName',
      'issuerIdType',snapshot->'issuer'->'issuerIdType',
      'issuerId',snapshot->'issuer'->'issuerId',
      'issuerEmail',snapshot->'issuer'->'issuerEmail',
      'issuerPhone',snapshot->'issuer'->'issuerPhone',
      'issuerAddress',snapshot->'issuer'->'issuerAddress'
    ),
    'customer',jsonb_build_object(
      'name',snapshot->'client'->'name','tradeName',snapshot->'client'->'tradeName',
      'identification',snapshot->'client'->'identification','address',snapshot->'client'->'address'
    ),
    'lines',lines,'subtotalCents',snapshot->'subtotalCents',
    'discountCents',snapshot->'discountCents','taxCents',snapshot->'taxCents',
    'totalCents',snapshot->'totalCents'
  );
  if projected is distinct from publication.content then
    raise exception 'Historical shared content changed' using errcode='40001';
  end if;
  return jsonb_build_object(
    'publication',jsonb_build_object(
      'publicationId',publication.id,'estimateId',publication.estimate_id,
      'version',publication.version,'estimateRevision',publication.estimate_revision,
      'contentHash',publication.content_hash
    ),
    'snapshot',snapshot
  );
end $$;

create or replace function public.pro_private_estimate_publication_copy_mutate(
  p_actor uuid,
  p_input jsonb
) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  copy_action_id uuid;
  copy_publication_id uuid;
  copy_target_id uuid;
  prior public.pro_private_estimate_publication_copies;
  evidence jsonb;
  snapshot jsonb;
  target public.pro_private_estimates;
  line jsonb;
  line_position integer:=0;
  totals jsonb;
  result jsonb;
begin
  if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if jsonb_typeof(p_input) is distinct from 'object'
    or (select array_agg(key order by key) from jsonb_object_keys(p_input) key)
      is distinct from array['action','actionId','contentHash','estimateRevision','publicationId','targetEstimateId','version']
    or p_input->>'action' is distinct from 'copy_from_publication'
    or jsonb_typeof(p_input->'actionId') is distinct from 'string'
    or jsonb_typeof(p_input->'publicationId') is distinct from 'string'
    or jsonb_typeof(p_input->'targetEstimateId') is distinct from 'string'
    or jsonb_typeof(p_input->'version') is distinct from 'number'
    or jsonb_typeof(p_input->'estimateRevision') is distinct from 'number'
    or not coalesce(p_input->>'version'~'^[0-9]{1,10}$',false)
    or not coalesce(p_input->>'estimateRevision'~'^[0-9]{1,10}$',false)
    or (p_input->>'version')::numeric not between 1 and 2147483647
    or (p_input->>'estimateRevision')::numeric not between 1 and 2147483647
    or jsonb_typeof(p_input->'contentHash') is distinct from 'string'
    or not coalesce(p_input->>'contentHash'~'^[a-f0-9]{64}$',false)
  then
    raise exception 'Invalid publication copy' using errcode='22023';
  end if;
  copy_action_id:=(p_input->>'actionId')::uuid;
  copy_publication_id:=(p_input->>'publicationId')::uuid;
  copy_target_id:=(p_input->>'targetEstimateId')::uuid;
  if copy_action_id is null or copy_publication_id is null or copy_target_id is null then
    raise exception 'Invalid copy identity' using errcode='22023';
  end if;

  -- Same owner/action order as private-estimate writers. No publication/state/
  -- source-estimate row lock: A is immutable and B must not be rewound or edited.
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
  perform pg_advisory_xact_lock(hashtextextended(
    'pro-private-estimate-action:'||p_actor::text||':'||copy_action_id::text,0
  ));
  if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  select * into prior from public.pro_private_estimate_publication_copies
    where actor_id=p_actor and action_id=copy_action_id;
  if found then
    if prior.input is distinct from p_input then
      raise exception 'Publication copy action reused' using errcode='40001';
    end if;
    if not exists(select 1 from public.pro_private_estimates
      where owner_id=p_actor and id=prior.target_estimate_id)
    then
      raise exception 'Copied estimate unavailable' using errcode='42501';
    end if;
    return prior.result;
  end if;

  -- Shared audit PK blocks the reverse collision through old private writers.
  -- The new receipt never pretends to be an old private-estimate mutation.
  if exists(select 1 from public.pro_private_estimate_actions
      where actor_id=p_actor and action_id=copy_action_id)
    or exists(select 1 from public.pro_private_estimate_history
      where owner_id=p_actor and action_id=copy_action_id)
    or exists(select 1 from public.pro_private_estimates
      where owner_id=p_actor and id=copy_target_id)
  then
    raise exception 'Copy action or target already exists' using errcode='40001';
  end if;
  evidence:=public.pro_private_estimate_publication_copy_snapshot(p_actor,copy_publication_id);
  if evidence->'publication'->'version' is distinct from p_input->'version'
    or evidence->'publication'->'estimateRevision' is distinct from p_input->'estimateRevision'
    or evidence->'publication'->>'contentHash' is distinct from p_input->>'contentHash'
    or evidence->'publication'->>'estimateId'=copy_target_id::text
  then
    raise exception 'Selected shared version changed' using errcode='40001';
  end if;
  snapshot:=evidence->'snapshot';
  if not exists(select 1 from public.pro_clients
    where user_id=p_actor and id=snapshot->>'clientId')
  then
    raise exception 'Historical customer unavailable' using errcode='40001';
  end if;
  totals:=public.pro_private_estimate_totals(snapshot->'lines');
  if totals is distinct from jsonb_build_object(
    'subtotalCents',snapshot->'subtotalCents','discountCents',snapshot->'discountCents',
    'taxCents',snapshot->'taxCents','totalCents',snapshot->'totalCents'
  ) then
    raise exception 'Historical estimate total changed' using errcode='40001';
  end if;
  insert into public.pro_private_estimates(
    owner_id,id,client_id,client_snapshot,source,issuer,title,notes,currency,valid_until,
    subtotal_cents,discount_cents,tax_cents,total_cents,revision,archived,created_at,updated_at
  ) values(
    p_actor,copy_target_id,snapshot->>'clientId',snapshot->'client',snapshot->'source',
    snapshot->'issuer',snapshot->>'title',snapshot->>'notes',snapshot->>'currency',
    (snapshot->>'validUntil')::date,(snapshot->>'subtotalCents')::bigint,
    (snapshot->>'discountCents')::bigint,(snapshot->>'taxCents')::bigint,
    (snapshot->>'totalCents')::bigint,1,false,clock_timestamp(),clock_timestamp()
  ) returning * into target;
  for line in select value from jsonb_array_elements(snapshot->'lines') loop
    line_position:=line_position+1;
    insert into public.pro_private_estimate_items
      values(p_actor,copy_target_id,(line->>'id')::uuid,line_position,line);
  end loop;
  result:=jsonb_build_object(
    'action','copy_from_publication','publication',evidence->'publication',
    'estimate',public.pro_private_estimate_json(target)
  );
  insert into public.pro_private_estimate_history(
    owner_id,estimate_id,action_id,action,before_estimate,after_estimate
  ) values(p_actor,copy_target_id,copy_action_id,'duplicate',snapshot,result->'estimate');
  insert into public.pro_private_estimate_publication_copies(
    actor_id,action_id,publication_id,source_estimate_id,source_revision,
    target_estimate_id,source_snapshot,input,result
  ) values(
    p_actor,copy_action_id,copy_publication_id,(evidence->'publication'->>'estimateId')::uuid,
    (evidence->'publication'->>'estimateRevision')::integer,copy_target_id,snapshot,p_input,result
  );
  if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  return result;
end $$;

create or replace function public.pro_private_estimate_publication_copy_read(
  p_actor uuid,
  p_action uuid
) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare
  receipt public.pro_private_estimate_publication_copies;
begin
  if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  select * into receipt from public.pro_private_estimate_publication_copies
    where actor_id=p_actor and action_id=p_action;
  if not found then return jsonb_build_object('receipt',null);end if;
  if not exists(select 1 from public.pro_private_estimates
    where owner_id=p_actor and id=receipt.target_estimate_id)
  then
    raise exception 'Copied estimate unavailable' using errcode='42501';
  end if;
  return jsonb_build_object('receipt',jsonb_build_object(
    'input',receipt.input,'result',receipt.result
  ));
end $$;

create or replace function public.pro_private_estimate_publication_copy_immutable()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if tg_op='DELETE' and not exists(select 1 from public.profiles where id=old.actor_id) then
    return old;
  end if;
  raise exception 'Immutable publication copy provenance' using errcode='23514';
end $$;

drop trigger if exists pro_private_estimate_publication_copy_immutable
  on public.pro_private_estimate_publication_copies;
create trigger pro_private_estimate_publication_copy_immutable
  before update or delete on public.pro_private_estimate_publication_copies
  for each row execute function public.pro_private_estimate_publication_copy_immutable();

alter table public.pro_private_estimate_publication_copies enable row level security;
revoke all on public.pro_private_estimate_publication_copies from public,anon,authenticated;
grant all on public.pro_private_estimate_publication_copies to service_role;
revoke all on function public.pro_private_estimate_publication_copy_snapshot(uuid,uuid),
  public.pro_private_estimate_publication_copy_mutate(uuid,jsonb),
  public.pro_private_estimate_publication_copy_read(uuid,uuid),
  public.pro_private_estimate_publication_copy_immutable() from public,anon,authenticated;
grant execute on function public.pro_private_estimate_publication_copy_snapshot(uuid,uuid),
  public.pro_private_estimate_publication_copy_mutate(uuid,jsonb),
  public.pro_private_estimate_publication_copy_read(uuid,uuid),
  public.pro_private_estimate_publication_copy_immutable() to service_role;
commit;
notify pgrst, 'reload schema';
