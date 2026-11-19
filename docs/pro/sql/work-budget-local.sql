-- LOCAL Pro only. Owner-private CRC budget/classification, never a money or stock writer.
-- Old material/time/expense events remain authoritative. Unknown labor is not zero.
-- Lock order: own action advisory -> own work-budget advisory -> own state row.
-- No old work/source/expense locks: avoids cycles with material, booking and expense writers.
begin;

create unique index if not exists pro_work_budget_work_identity on public.pro_work(user_id,id,"clientId");
create table if not exists public.pro_work_budget_state (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  work_id text not null,client_id text not null,revision integer not null check(revision>0),
  primary key(owner_id,work_id),
  foreign key(owner_id,work_id,client_id) references public.pro_work(user_id,id,"clientId") on delete cascade
);
create table if not exists public.pro_work_budget_codes (
  owner_id uuid not null,work_id text not null,id uuid not null,
  kind text not null check(kind in('group','item')),
  code text not null check(code ~ '^[A-Z0-9][A-Z0-9._-]{0,29}$'),
  title text not null check(length(btrim(title)) between 1 and 160),parent_id uuid,
  planned_cents bigint check(planned_cents between 0 and 9000000000000),
  archived boolean not null default false,
  primary key(owner_id,work_id,id),unique(owner_id,work_id,code),
  foreign key(owner_id,work_id) references public.pro_work_budget_state(owner_id,work_id) on delete cascade,
  foreign key(owner_id,work_id,parent_id) references public.pro_work_budget_codes(owner_id,work_id,id),
  check((kind='group' and parent_id is null and planned_cents is null)
    or(kind='item' and planned_cents is not null)),check(parent_id is distinct from id)
);
create table if not exists public.pro_work_budget_assignments (
  owner_id uuid not null,work_id text not null,kind text not null check(kind in('material','time','expense')),
  source_id uuid not null,code_id uuid,
  primary key(owner_id,work_id,kind,source_id),
  foreign key(owner_id,work_id) references public.pro_work_budget_state(owner_id,work_id) on delete cascade,
  foreign key(owner_id,work_id,code_id) references public.pro_work_budget_codes(owner_id,work_id,id)
);
create table if not exists public.pro_work_budget_actions (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  action_id uuid not null,work_id text not null,revision integer not null,
  input jsonb not null,before_value jsonb,result jsonb not null,context_json jsonb,
  at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id),
  unique(owner_id,work_id,revision),
  foreign key(owner_id,work_id) references public.pro_work_budget_state(owner_id,work_id) on delete cascade
);
create index if not exists pro_work_budget_codes_page on public.pro_work_budget_codes(owner_id,work_id,id);
create index if not exists pro_work_budget_actions_page on public.pro_work_budget_actions(owner_id,work_id,revision desc);

create or replace function public.pro_work_budget_context(p_actor uuid,p_work text)
returns jsonb language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare context jsonb;
begin
  if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  select jsonb_build_object('id',w.id,'clientId',c.id,'title',w.service,
    'cancelled',w.cancelled,'clientArchived',c.archived) into context
    from public.pro_work w join public.pro_clients c on c.user_id=w.user_id and c.id=w."clientId"
    where w.user_id=p_actor and w.id=p_work;
  if context is null then raise exception 'Owned work unavailable' using errcode='42501';end if;
  if exists(select 1 from public.pro_work_budget_state s where s.owner_id=p_actor
    and s.work_id=p_work and s.client_id is distinct from context->>'clientId') then
    raise exception 'Budget customer changed' using errcode='42501';
  end if;
  return context;
end $$;

create or replace function public.pro_work_budget_code_json(p_code public.pro_work_budget_codes)
returns jsonb language sql immutable security invoker set search_path=public,pg_temp as $$
  select jsonb_build_object('id',p_code.id,'kind',p_code.kind,'code',p_code.code,
    'title',p_code.title,'parentId',p_code.parent_id,'plannedCents',p_code.planned_cents,'archived',p_code.archived)
$$;

create or replace function public.pro_work_budget_sources(p_actor uuid,p_work text)
returns table(kind text,id uuid,fingerprint text,title text,recorded_on date,amount_cents bigint,
  minutes bigint,unknown_minutes bigint,code_id uuid)
language sql stable security invoker set search_path=public,pg_temp as $$
  with facts as (
    select 'material'::text kind,e.id,e.label title,
      (e.created_at at time zone 'America/Costa_Rica')::date recorded_on,
      (round(e.quantity*e.unit_cost,2)*100)::bigint amount_cents,
      null::bigint minutes,0::bigint unknown_minutes,
      jsonb_build_object('id',e.id,'kind','material','quantity',e.quantity,'unitCost',e.unit_cost,
        'productId',e.product_id,'label',e.label,'at',e.created_at) fact
      from public.pro_client_entries e where e.user_id=p_actor and e.work_id=p_work
        and e.kind='material' and not exists(select 1 from public.pro_client_entries r
          where r.user_id=e.user_id and r.reversal_id=e.id)
    union all
    select 'time',e.id,e.note,e.recorded_on,e.amount_cents,e.minutes::bigint,
      case when e.hourly_cost_cents is null then e.minutes else 0 end::bigint,
      jsonb_build_object('id',e.id,'kind','time','minutes',e.minutes,'rate',e.hourly_cost_cents,
        'amount',e.amount_cents,'date',e.recorded_on,'note',e.note,'at',e.created_at)
      from public.pro_work_cost_entries e where e.user_id=p_actor and e.work_id=p_work
        and e.kind='time' and not exists(select 1 from public.pro_work_cost_entries r
          where r.user_id=e.user_id and r.reversal_id=e.id)
    union all
    select 'expense',a.entry_id,e.concept,e.expense_date,e.amount_cents,null::bigint,0::bigint,
      jsonb_build_object('id',a.entry_id,'kind','expense','expenseId',e.id,'amount',e.amount_cents,
        'date',e.expense_date,'concept',e.concept,'supplier',e.supplier_name)
      from public.pro_work_expense_assignments a join public.pro_internal_expenses e
        on e.user_id=a.user_id and e.id=a.expense_id
      where a.user_id=p_actor and a.work_id=p_work
  ) select f.kind,f.id,md5(f.fact::text),f.title,f.recorded_on,f.amount_cents,f.minutes,
      f.unknown_minutes,a.code_id
    from facts f left join public.pro_work_budget_assignments a
      on a.owner_id=p_actor and a.work_id=p_work and a.kind=f.kind and a.source_id=f.id
$$;

create or replace function public.pro_work_budget_totals(
  p_planned bigint,p_actual bigint,p_minutes bigint,p_unknown bigint,p_sources bigint
) returns jsonb language sql immutable security invoker set search_path=public,pg_temp as $$
  select jsonb_build_object('plannedCents',p_planned,'actualCents',p_actual,
    'unknownMinutes',p_minutes,'unknownCount',p_unknown,'sourceCount',p_sources,
    'varianceCents',case when p_planned is null or p_unknown>0 then null else p_planned-p_actual end)
$$;

create or replace function public.pro_work_budget_frame(p_actor uuid,p_work text)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare context jsonb;rev integer;metadata text;source_hash text;answer jsonb;
begin
  context:=public.pro_work_budget_context(p_actor,p_work);
  rev:=coalesce((select revision from public.pro_work_budget_state where owner_id=p_actor and work_id=p_work),0);
  select md5(jsonb_build_object(
    'revision',rev,'workId',p_work,'clientId',context->>'clientId',
    'codes',coalesce((select jsonb_agg(public.pro_work_budget_code_json(c) order by id)
      from public.pro_work_budget_codes c where owner_id=p_actor and work_id=p_work),'[]'::jsonb),
    'assignments',coalesce((select jsonb_agg(jsonb_build_array(kind,source_id,code_id) order by kind,source_id)
      from public.pro_work_budget_assignments where owner_id=p_actor and work_id=p_work),'[]'::jsonb)
  )::text) into metadata;
  with sources as materialized(select * from public.pro_work_budget_sources(p_actor,p_work))
  select md5(jsonb_build_object('owner',p_actor,'work',p_work,
    'sources',coalesce((select jsonb_agg(jsonb_build_array(kind,id,fingerprint) order by kind,id) from sources),'[]'::jsonb))::text),
    jsonb_build_object(
      'work',context,'currency','CRC','revision',rev,'metadataFingerprint',metadata,
      'suggestedItemCode',(select lpad(n::text,3,'0')from generate_series(1,501)n where not exists(select 1 from public.pro_work_budget_codes c where c.owner_id=p_actor and c.work_id=p_work and c.code=lpad(n::text,3,'0'))order by n limit 1),
      'suggestedGroupCode',(select 'G'||lpad(n::text,3,'0')from generate_series(1,501)n where not exists(select 1 from public.pro_work_budget_codes c where c.owner_id=p_actor and c.work_id=p_work and c.code='G'||lpad(n::text,3,'0'))order by n limit 1),
      'canWrite',not(context->>'cancelled')::boolean and not(context->>'clientArchived')::boolean,
      'codeCount',(select count(*) from public.pro_work_budget_codes where owner_id=p_actor and work_id=p_work),
      'summary',public.pro_work_budget_totals(
        (select sum(planned_cents)::bigint from public.pro_work_budget_codes where owner_id=p_actor and work_id=p_work and kind='item'),
        coalesce(sum(amount_cents),0)::bigint,coalesce(sum(unknown_minutes),0)::bigint,
        count(*) filter(where amount_cents is null),count(*)),
      'unassigned',public.pro_work_budget_totals(null,
        coalesce(sum(amount_cents) filter(where code_id is null),0)::bigint,
        coalesce(sum(unknown_minutes) filter(where code_id is null),0)::bigint,
        count(*) filter(where code_id is null and amount_cents is null),count(*) filter(where code_id is null))
    ) into source_hash,answer from sources;
  return answer||jsonb_build_object('sourceFingerprint',source_hash,'fingerprint',md5(metadata||source_hash));
end $$;

create or replace function public.pro_work_budget_read(
  p_actor uuid,p_work text,p_view text default 'overview',p_status text default 'all',
  p_query text default '',p_code text default null,p_kind text default null,
  p_after text default null,p_revision integer default null,p_fingerprint text default null
) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare frame jsonb;answer jsonb;cursor_revision integer;
begin
  frame:=public.pro_work_budget_frame(p_actor,p_work);
  if p_view='overview' then return frame;end if;
  if p_view not in('codes','code','costs','cost','history') or p_status not in('all','active','archived')
    or p_query is null or length(p_query)>160
    or(p_kind is not null and(p_view in('codes','code')and p_kind not in('group','item')or p_view in('costs','cost')and p_kind not in('material','time','expense'))) then
    raise exception 'Invalid budget query' using errcode='22023';
  end if;
  if p_view='cost'then
    if p_kind is null or p_code is null then raise exception 'Cost identity required'using errcode='22023';end if;
    select jsonb_build_object('workId',p_work,'revision',frame->'revision','fingerprint',frame->'fingerprint',
      'item',(select jsonb_build_object('kind',s.kind,'id',s.id,'fingerprint',s.fingerprint,
        'title',s.title,'date',s.recorded_on,'amountCents',s.amount_cents,'minutes',s.minutes,
        'unknownMinutes',s.unknown_minutes,'codeId',s.code_id,
        'code',case when c.id is null then null else public.pro_work_budget_code_json(c)end)
      from public.pro_work_budget_sources(p_actor,p_work)s left join public.pro_work_budget_codes c
        on c.owner_id=p_actor and c.work_id=p_work and c.id=s.code_id
      where s.kind=p_kind and s.id=p_code::uuid))into answer;
    return answer;
  end if;
  if p_view='history' then
    if p_after is not null then
      select revision into cursor_revision from public.pro_work_budget_actions
        where owner_id=p_actor and work_id=p_work and action_id=p_after::uuid;
      if not found then raise exception 'History cursor unavailable' using errcode='40001';end if;
    end if;
    with matches as materialized(select * from public.pro_work_budget_actions
      where owner_id=p_actor and work_id=p_work and(p_after is null or revision<cursor_revision)
      order by revision desc limit 21),page as(select * from matches order by revision desc limit 20)
    select jsonb_build_object('workId',p_work,'items',coalesce((select jsonb_agg(jsonb_build_object(
      'actionId',action_id,'at',at,'input',input,'before',before_value,'result',result,'context',context_json) order by revision desc)from page),'[]'::jsonb),
      'nextCursor',case when(select count(*)from matches)>20 then(select action_id from page order by revision limit 1)else null end)into answer;
    return answer;
  end if;
  if(p_after is null and(p_revision is not null or p_fingerprint is not null))or(p_after is not null and(p_revision is null or p_fingerprint is null))then
    raise exception 'Incomplete page snapshot' using errcode='22023';
  end if;
  if p_after is not null and(p_revision is distinct from(frame->>'revision')::integer
    or p_fingerprint is distinct from frame->>'fingerprint')then
    raise exception 'Budget or actual costs changed' using errcode='40001';
  end if;
  if p_view in('codes','code') then
    if p_after is not null and not exists(select 1 from public.pro_work_budget_codes c
      where c.owner_id=p_actor and c.work_id=p_work and c.id=p_after::uuid
      and(p_status='all' or c.archived=(p_status='archived'))and(p_kind is null or c.kind=p_kind)
      and(p_query='' or strpos(lower(c.code||' '||c.title),lower(p_query))>0))then
      raise exception 'Code cursor unavailable'using errcode='40001';
    end if;
    with matches as materialized(select * from public.pro_work_budget_codes c where owner_id=p_actor and work_id=p_work
      and(p_status='all' or archived=(p_status='archived'))and(p_kind is null or kind=p_kind)and(p_view<>'code'or id=p_code::uuid)and(p_query='' or strpos(lower(code||' '||title),lower(p_query))>0)
      and(p_after is null or(code,id)>(select code,id from public.pro_work_budget_codes where owner_id=p_actor and work_id=p_work and id=p_after::uuid))order by code,id limit 21),
    page as(select * from matches order by code,id limit 20),
    sources as materialized(select * from public.pro_work_budget_sources(p_actor,p_work)),
    members as(select p.id target,c.id member,c.planned_cents from page p join public.pro_work_budget_codes c
      on c.owner_id=p.owner_id and c.work_id=p.work_id and c.kind='item' and(c.id=p.id or c.parent_id=p.id)),
    planned as(select target,sum(planned_cents)::bigint planned from members group by target),
    actual as(select m.target,coalesce(sum(s.amount_cents),0)::bigint actual,
      coalesce(sum(s.unknown_minutes),0)::bigint minutes,count(*)filter(where s.amount_cents is null)unknown,count(*)sources
      from members m join sources s on s.code_id=m.member group by m.target)
    select jsonb_build_object('workId',p_work,'revision',frame->'revision','fingerprint',frame->'fingerprint',
      'items',coalesce((select jsonb_agg(jsonb_build_object('code',public.pro_work_budget_code_json(p),'parent',case when parent.id is null then null else public.pro_work_budget_code_json(parent)end,
        'totals',public.pro_work_budget_totals(b.planned,coalesce(a.actual,0),coalesce(a.minutes,0),coalesce(a.unknown,0),coalesce(a.sources,0)))order by p.code,p.id)
        from page p left join public.pro_work_budget_codes parent on parent.owner_id=p.owner_id and parent.work_id=p.work_id and parent.id=p.parent_id left join planned b on b.target=p.id left join actual a on a.target=p.id),'[]'::jsonb),
      'nextCursor',case when(select count(*)from matches)>20 then(select id from page order by code desc,id desc limit 1)else null end)into answer;
    if p_view='code'then
      if jsonb_array_length(answer->'items')<>1 then raise exception 'Budget code unavailable'using errcode='P0002';end if;
      answer:=(answer-'items'-'nextCursor')||(answer->'items'->0);
    end if;
  else
    if p_code is not null and p_code<>'unassigned' and not exists(select 1 from public.pro_work_budget_codes
      where owner_id=p_actor and work_id=p_work and id=p_code::uuid)then
      raise exception 'Budget code unavailable'using errcode='40001';
    end if;
    with sources as materialized(select * from public.pro_work_budget_sources(p_actor,p_work)),
    eligible as materialized(select * from sources s where(p_kind is null or s.kind=p_kind)
      and(p_code is null or p_code='unassigned'and s.code_id is null or s.code_id::text=p_code
        or exists(select 1 from public.pro_work_budget_codes c where c.owner_id=p_actor and c.work_id=p_work and c.id=s.code_id and c.parent_id::text=p_code))
      and(p_query='' or strpos(lower(s.title),lower(p_query))>0)),
    matches as materialized(select * from eligible where p_after is null or kind||':'||id::text>p_after order by kind,id limit 21),
    page as(select * from matches order by kind,id limit 20)
    select jsonb_build_object('workId',p_work,'revision',frame->'revision','fingerprint',frame->'fingerprint',
      'items',coalesce((select jsonb_agg(jsonb_build_object('kind',page.kind,'id',page.id,'fingerprint',page.fingerprint,
        'title',page.title,'date',recorded_on,'amountCents',amount_cents,'minutes',minutes,'unknownMinutes',unknown_minutes,'codeId',code_id,'code',case when c.id is null then null else public.pro_work_budget_code_json(c)end)order by page.kind,page.id)from page left join public.pro_work_budget_codes c on c.owner_id=p_actor and c.work_id=p_work and c.id=page.code_id),'[]'::jsonb),
      'nextCursor',case when(select count(*)from matches)>20 then(select kind||':'||id::text from page order by kind desc,id desc limit 1)else null end,
      'anchorValid',p_after is null or exists(select 1 from eligible where kind||':'||id::text=p_after))into answer;
    if not(answer->>'anchorValid')::boolean then raise exception 'Cost cursor unavailable'using errcode='40001';end if;
    answer:=answer-'anchorValid';
  end if;
  return answer;
end $$;

create or replace function public.pro_work_budget_mutate(p_actor uuid,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  act text;aid uuid;wid text;cid uuid;pid uuid;keys text[];rev integer;current_rev integer;
  context jsonb;prior public.pro_work_budget_actions;code_row public.pro_work_budget_codes;
  before_json jsonb;assignment_json jsonb;history_context jsonb;source_row record;result_json jsonb;frame jsonb;
begin
  if not coalesce(public.pro_private_work_tools_enabled(p_actor),false)then
    raise exception 'Forbidden'using errcode='42501';
  end if;
  if jsonb_typeof(p_input)is distinct from'object' or jsonb_typeof(p_input->'action')is distinct from'string'
    or jsonb_typeof(p_input->'actionId')is distinct from'string' or jsonb_typeof(p_input->'workId')is distinct from'string'
    or jsonb_typeof(p_input->'clientId')is distinct from'string'
    or jsonb_typeof(p_input->'revision')is distinct from'number'
    or not coalesce(p_input->>'revision'~'^[0-9]{1,10}$',false)
    or(p_input->>'revision')::numeric not between 0 and 2147483646 then
    raise exception 'Invalid budget mutation'using errcode='22023';
  end if;
  act:=p_input->>'action';aid:=(p_input->>'actionId')::uuid;wid:=p_input->>'workId';rev:=(p_input->>'revision')::integer;
  keys:=array['action','actionId','clientId','workId','revision']||case act
    when'save_group'then array['id','code','title']when'save_item'then array['id','code','title','parentId','plannedCents']
    when'archive'then array['id']when'restore'then array['id']when'assign'then array['source','codeId']else null end;
  if keys is null or not(p_input?&keys)or(p_input-keys)<>'{}'::jsonb or length(wid)not between 1 and 160 or aid is null then
    raise exception 'Invalid budget fields'using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('pro-work-budget-action:'||p_actor::text||':'||aid::text,0));
  perform pg_advisory_xact_lock(hashtextextended('pro-work-budget:'||p_actor::text||':'||wid,0));
  context:=public.pro_work_budget_context(p_actor,wid);
  if context->>'clientId'is distinct from p_input->>'clientId'then raise exception 'Work customer changed'using errcode='40001';end if;
  select * into prior from public.pro_work_budget_actions where owner_id=p_actor and action_id=aid;
  if found then
    if prior.input is distinct from p_input then raise exception 'Budget action reused'using errcode='40001';end if;
    return prior.result;
  end if;
  if(context->>'cancelled')::boolean or(context->>'clientArchived')::boolean then
    raise exception 'Restore work or customer before changing budget'using errcode='40001';
  end if;
  select revision into current_rev from public.pro_work_budget_state where owner_id=p_actor and work_id=wid for update;
  if coalesce(current_rev,0)<>rev then raise exception 'Budget changed'using errcode='40001';end if;
  if current_rev is null then
    insert into public.pro_work_budget_state values(p_actor,wid,context->>'clientId',1);
  else update public.pro_work_budget_state set revision=revision+1 where owner_id=p_actor and work_id=wid;end if;
  if act='assign' then
    if jsonb_typeof(p_input->'source')is distinct from'object'
      or(select array_agg(key order by key)from jsonb_object_keys(p_input->'source')key)is distinct from array['fingerprint','id','kind']
      or jsonb_typeof(p_input->'source'->'id')is distinct from'string'
      or jsonb_typeof(p_input->'source'->'kind')is distinct from'string'
      or jsonb_typeof(p_input->'source'->'fingerprint')is distinct from'string'
      or not coalesce(p_input->'source'->>'fingerprint'~'^[a-f0-9]{32}$',false)
      or coalesce(p_input->'source'->>'kind','')not in('material','time','expense')
      or jsonb_typeof(p_input->'codeId')not in('null','string')then
      raise exception 'Invalid cost assignment'using errcode='22023';
    end if;
    cid:=(p_input->>'codeId')::uuid;
    if cid is not null and not exists(select 1 from public.pro_work_budget_codes c
      where c.owner_id=p_actor and c.work_id=wid and c.id=cid and c.kind='item'and not c.archived
      and(c.parent_id is null or exists(select 1 from public.pro_work_budget_codes p
        where p.owner_id=p_actor and p.work_id=wid and p.id=c.parent_id and p.kind='group'and not p.archived)))then
      raise exception 'Choose an active budget item'using errcode='40001';
    end if;
    -- One SPI statement validates current active identity/facts after all own locks.
    -- Later legacy edits are legitimate and reflected by fresh derived reads.
    select * into source_row from public.pro_work_budget_sources(p_actor,wid)
      where kind=p_input->'source'->>'kind'and id=(p_input->'source'->>'id')::uuid;
    if not found or source_row.fingerprint is distinct from p_input->'source'->>'fingerprint'then
      raise exception 'Actual cost changed'using errcode='40001';
    end if;
    select jsonb_build_object('kind',kind,'id',source_id,'codeId',code_id)into before_json
      from public.pro_work_budget_assignments where owner_id=p_actor and work_id=wid
      and kind=source_row.kind and source_id=source_row.id;
    before_json:=coalesce(before_json,jsonb_build_object('kind',source_row.kind,'id',source_row.id,'codeId',null));
    history_context:=jsonb_build_object(
      'source',jsonb_build_object('kind',source_row.kind,'id',source_row.id,'title',source_row.title,
        'date',source_row.recorded_on,'amountCents',source_row.amount_cents,'minutes',source_row.minutes),
      'fromCode',(select public.pro_work_budget_code_json(c)from public.pro_work_budget_codes c where c.owner_id=p_actor and c.work_id=wid and c.id=source_row.code_id),
      'toCode',(select public.pro_work_budget_code_json(c)from public.pro_work_budget_codes c where c.owner_id=p_actor and c.work_id=wid and c.id=cid)
    );
    insert into public.pro_work_budget_assignments values(p_actor,wid,source_row.kind,source_row.id,cid)
      on conflict(owner_id,work_id,kind,source_id)do update set code_id=excluded.code_id;
    assignment_json:=jsonb_build_object('kind',source_row.kind,'id',source_row.id,'codeId',cid);
  else
    if jsonb_typeof(p_input->'id')is distinct from'string'then raise exception 'Invalid code identity'using errcode='22023';end if;
    cid:=(p_input->>'id')::uuid;
    select * into code_row from public.pro_work_budget_codes where owner_id=p_actor and work_id=wid and id=cid;
    if found then before_json:=public.pro_work_budget_code_json(code_row);end if;
    if act in('save_group','save_item')then
      if jsonb_typeof(p_input->'code')is distinct from'string'or not coalesce(p_input->>'code'~'^[A-Z0-9][A-Z0-9._-]{0,29}$',false)
        or jsonb_typeof(p_input->'title')is distinct from'string'or length(btrim(p_input->>'title'))not between 1 and 160
        or p_input->>'title'~'[[:cntrl:]]'then raise exception 'Invalid code content'using errcode='22023';end if;
      if code_row.id is not null and(code_row.archived or code_row.kind<>case when act='save_group'then'group'else'item'end)then
        raise exception 'Restore code or retain its kind'using errcode='40001';
      end if;
      if code_row.id is null and(select count(*)from public.pro_work_budget_codes where owner_id=p_actor and work_id=wid)>=500 then
        raise exception 'Budget code capacity reached'using errcode='54000';
      end if;
      if act='save_item'then
        if jsonb_typeof(p_input->'parentId')not in('null','string')or jsonb_typeof(p_input->'plannedCents')is distinct from'number'
          or not coalesce(p_input->>'plannedCents'~'^[0-9]{1,13}$',false)
          or(p_input->>'plannedCents')::numeric not between 0 and 9000000000000 then
          raise exception 'Invalid planned amount'using errcode='22023';end if;
        pid:=(p_input->>'parentId')::uuid;
        if pid is not null and not exists(select 1 from public.pro_work_budget_codes where owner_id=p_actor and work_id=wid
          and id=pid and kind='group'and not archived)then raise exception 'Choose active parent group'using errcode='40001';end if;
      end if;
      insert into public.pro_work_budget_codes(owner_id,work_id,id,kind,code,title,parent_id,planned_cents)
        values(p_actor,wid,cid,case when act='save_group'then'group'else'item'end,p_input->>'code',btrim(p_input->>'title'),pid,(p_input->>'plannedCents')::bigint)
        on conflict(owner_id,work_id,id)do update set code=excluded.code,title=excluded.title,parent_id=excluded.parent_id,planned_cents=excluded.planned_cents
        returning * into code_row;
    else
      if code_row.id is null or code_row.archived=(act='archive')then raise exception 'Code status changed'using errcode='40001';end if;
      if act='archive'and code_row.kind='group'and exists(select 1 from public.pro_work_budget_codes
        where owner_id=p_actor and work_id=wid and parent_id=cid and not archived)then
        raise exception 'Archive active children first'using errcode='40001';end if;
      if act='restore'and code_row.parent_id is not null and not exists(select 1 from public.pro_work_budget_codes
        where owner_id=p_actor and work_id=wid and id=code_row.parent_id and not archived)then
        raise exception 'Restore parent group first'using errcode='40001';end if;
      update public.pro_work_budget_codes set archived=(act='archive')where owner_id=p_actor and work_id=wid and id=cid returning * into code_row;
    end if;
  end if;
  frame:=public.pro_work_budget_frame(p_actor,wid);
  result_json:=jsonb_build_object('action',act,'workId',wid,'revision',rev+1,'metadataFingerprint',frame->'metadataFingerprint',
    'code',case when act='assign'then null else public.pro_work_budget_code_json(code_row)end,'assignment',assignment_json);
  insert into public.pro_work_budget_actions(owner_id,action_id,work_id,revision,input,before_value,result,context_json)
    values(p_actor,aid,wid,rev+1,p_input,before_json,result_json,history_context);
  context:=public.pro_work_budget_context(p_actor,wid);
  if(context->>'cancelled')::boolean or(context->>'clientArchived')::boolean then
    raise exception 'Work or customer changed'using errcode='40001';end if;
  return result_json;
end $$;

create or replace function public.pro_work_budget_action_read(p_actor uuid,p_action uuid)
returns jsonb language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare receipt public.pro_work_budget_actions;
begin
  if not coalesce(public.pro_private_work_tools_enabled(p_actor),false)then raise exception 'Forbidden'using errcode='42501';end if;
  select * into receipt from public.pro_work_budget_actions where owner_id=p_actor and action_id=p_action;
  if not found then return jsonb_build_object('receipt',null);end if;
  perform public.pro_work_budget_context(p_actor,receipt.work_id);
  return jsonb_build_object('receipt',jsonb_build_object('input',receipt.input,'result',receipt.result));
end $$;

create or replace function public.pro_work_budget_immutable()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if tg_op='DELETE'and not exists(select 1 from public.profiles where id=old.owner_id)then return old;end if;
  raise exception 'Immutable budget audit'using errcode='23514';
end $$;
create or replace function public.pro_work_budget_work_guard()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if exists(select 1 from public.pro_work_budget_state where owner_id=old.user_id and work_id=old.id)then
    if tg_op='DELETE'then
      if not exists(select 1 from public.profiles where id=old.user_id)then return old;end if;
      raise exception 'Work has budget history'using errcode='23514';
    end if;
    if(new.user_id,new.id,new."clientId")is distinct from(old.user_id,old.id,old."clientId")then
      raise exception 'Budget work identity is immutable'using errcode='23514';end if;
  end if;
  if tg_op='DELETE'then return old;else return new;end if;
end $$;
drop trigger if exists pro_work_budget_immutable on public.pro_work_budget_actions;
create trigger pro_work_budget_immutable before update or delete on public.pro_work_budget_actions
  for each row execute function public.pro_work_budget_immutable();
drop trigger if exists pro_work_budget_work_guard on public.pro_work;
create trigger pro_work_budget_work_guard before update or delete on public.pro_work
  for each row execute function public.pro_work_budget_work_guard();
do $$declare t text;f record;begin
  foreach t in array array['pro_work_budget_state','pro_work_budget_codes','pro_work_budget_assignments','pro_work_budget_actions']loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'and p.proname like'pro_work_budget_%'loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
commit;
notify pgrst,'reload schema';
