-- ContrataCR Pro, row 54 (budget by codes): synchronise the project budget FROM an accepted quote and FROM accepted change orders.
-- PRO_ENABLED stays false in production. Nothing is sent to anyone; the customer is not notified.
--  * An accepted quote (pro_private_estimate_work_agreements) becomes budget codes: one group per quote section and one item per
--    line (codes COT-G01.., COT-001..). Planned cost = quantity x internal unit cost when the line has one; otherwise the net sale
--    amount of the line (after discount, before VAT) with 0 % markup. When there is a cost, markup is derived so that
--    cost + markup is the net sale price. VAT tariff comes from the line's tax rate.
--  * An accepted change order (pro_work_changes, status accepted) becomes one group CO<n> with one item per added line. Reductions
--    (negative lines) are netted, largest planned amount first, against the added lines of the SAME change; whatever cannot be
--    netted is reported as "unallocated reduction" and never makes a planned amount negative.
--  * Every source is applied ONCE (primary key). All code creation goes THROUGH pro_work_budget_mutate (same validation,
--    revisions and immutable history) inside ONE transaction: any failure leaves the budget untouched. Idempotent receipts per action.
--  * Lock order: own action advisory -> work-budget advisory (same key as pro_work_budget_mutate) -> source row share lock.
-- Patterns: RLS on, service_role only, security invoker, pinned search_path.
begin;

create table if not exists public.pro_work_budget_doc_syncs(
 owner_id uuid not null,work_id text not null,
 source_kind text not null check(source_kind in('estimate','change')),source_id text not null check(length(source_id) between 1 and 80),
 action_id uuid not null,applied_at timestamptz not null default clock_timestamp(),
 created_codes integer not null check(created_codes>=0),planned_cents bigint not null check(planned_cents>=0),
 unallocated_cents bigint not null default 0 check(unallocated_cents>=0),codes jsonb not null check(jsonb_typeof(codes)='array'),
 primary key(owner_id,work_id,source_kind,source_id),
 foreign key(owner_id,work_id) references public.pro_work_budget_state(owner_id,work_id) on delete cascade);
create table if not exists public.pro_work_budget_doc_actions(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,work_id text not null,
 input jsonb not null,result jsonb not null,at timestamptz not null default clock_timestamp(),
 primary key(owner_id,action_id));

create or replace function public.pro_work_budget_sync_vat(p_tax_bps numeric) returns text
language sql immutable security invoker set search_path=public,pg_temp as $$
 select case p_tax_bps when 1300 then '08' when 400 then '04' when 200 then '03' when 100 then '02' when 50 then '09' when 0 then '01' else null end
$$;

-- Pure plan of the codes a source would create. Never writes. reason is set when the source cannot be synchronised.
create or replace function public.pro_work_budget_sync_plan(p_actor uuid,p_work text,p_kind text,p_id text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare a public.pro_private_estimate_work_agreements;ch public.pro_work_changes;l jsonb;gname text;lastg text;gn integer:=0;n integer:=0;
 groups jsonb:='[]'::jsonb;items jsonb:='[]'::jsonb;qty numeric;base numeric;net numeric;cost numeric;planned numeric;mk integer;title text;
 amt numeric;rem numeric:=0;take numeric;pos integer;o record;total numeric:=0;gtitle text;
begin
 if p_kind='estimate' then
  select * into a from public.pro_private_estimate_work_agreements where owner_id=p_actor and work_id=p_work and publication_id::text=p_id;
  if not found then return jsonb_build_object('reason','unavailable');end if;
  if a.currency<>'CRC' then return jsonb_build_object('kind','estimate','id',p_id,'title',a.title,'at',a.accepted_at,'reason','currency');end if;
  for l in select value from jsonb_array_elements(a.source_snapshot->'lines') loop
   n:=n+1;gname:=nullif(btrim(coalesce(l->>'group','')),'');
   if gname is not null and gname is distinct from lastg then
    gn:=gn+1;groups:=groups||jsonb_build_object('key','g'||gn,'code','COT-G'||lpad(gn::text,2,'0'),'title',left(regexp_replace(gname,'[[:cntrl:]]',' ','g'),160));
   end if;
   lastg:=gname;
   qty:=(l->>'qtyMilli')::numeric;base:=round(qty*(l->>'unitPriceCents')::numeric/1000);net:=base-round(base*(l->>'discountBps')::numeric/10000);
   if l ? 'unitCostCents' and jsonb_typeof(l->'unitCostCents')='number' then cost:=round(qty*(l->>'unitCostCents')::numeric/1000);planned:=cost;
    mk:=case when cost>0 and net>cost then least(100000,round((net-cost)*10000/cost))::integer else 0 end;
   else planned:=net;mk:=0;end if;
   title:=left(btrim(regexp_replace(coalesce(l->>'description',''),'[[:cntrl:]]',' ','g')),160);
   if title='' then title:='COT-'||lpad(n::text,3,'0');end if;
   items:=items||jsonb_build_object('key','i'||n,'code','COT-'||lpad(n::text,3,'0'),'title',title,'groupKey',case when gname is null then null else 'g'||gn end,
    'plannedCents',planned::bigint,'markupBp',mk,'vatCode',public.pro_work_budget_sync_vat((l->>'taxBps')::numeric));
  end loop;
  return jsonb_build_object('kind','estimate','id',p_id,'title',a.title,'at',a.accepted_at,'reason',null,'groups',groups,'items',items,'unallocatedCents',0,
   'plannedCents',coalesce((select sum((i->>'plannedCents')::bigint) from jsonb_array_elements(items) i),0),'saleCents',a.total_cents);
 elsif p_kind='change' then
  select * into ch from public.pro_work_changes where owner_id=p_actor and work_id=p_work and id::text=p_id and status='accepted';
  if not found then return jsonb_build_object('reason','unavailable');end if;
  gtitle:=left('CO'||ch.position||' - '||regexp_replace(ch.reason,'[[:cntrl:]]',' ','g'),160);
  for l in select value from jsonb_array_elements(ch.lines) loop
   n:=n+1;amt:=(l->>'amountCents')::numeric;
   if l ? 'qtyMilli' then planned:=round((l->>'qtyMilli')::numeric*(l->>'unitCostCents')::numeric/1000);else planned:=abs(amt);end if;
   if amt<0 then rem:=rem+planned;continue;end if;
   title:=left(btrim(regexp_replace(coalesce(l->>'description',''),'[[:cntrl:]]',' ','g')),160);if title='' then title:='CO'||ch.position||'-'||lpad(n::text,2,'0');end if;
   items:=items||jsonb_build_object('key','i'||n,'code','CO'||ch.position||'-'||lpad(n::text,2,'0'),'title',title,'groupKey','g1','plannedCents',planned::bigint,
    'markupBp',coalesce((l->>'markupBps')::integer,0),'vatCode',null);
  end loop;
  -- Net the reductions against the added lines of this change, largest first.
  for o in select ord,(v->>'plannedCents')::numeric p from jsonb_array_elements(items) with ordinality e(v,ord) order by (v->>'plannedCents')::numeric desc,ord loop
   exit when rem<=0;
   take:=least(o.p,rem);rem:=rem-take;pos:=o.ord-1;
   items:=jsonb_set(items,array[pos::text,'plannedCents'],to_jsonb((o.p-take)::bigint));
  end loop;
  if jsonb_array_length(items)>0 then groups:=jsonb_build_array(jsonb_build_object('key','g1','code','CO'||ch.position,'title',gtitle));end if;
  return jsonb_build_object('kind','change','id',p_id,'title',gtitle,'at',ch.updated_at,'reason',null,'groups',groups,'items',items,'unallocatedCents',rem::bigint,
   'plannedCents',coalesce((select sum((i->>'plannedCents')::bigint) from jsonb_array_elements(items) i),0),'saleCents',ch.delta_cents);
 end if;
 raise exception 'Invalid source kind' using errcode='22023';
end $$;

create or replace function public.pro_work_budget_sync_read(p_actor uuid,p_work text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare ctx jsonb;sources jsonb:='[]'::jsonb;plan jsonb;sync public.pro_work_budget_doc_syncs;r record;brev integer;
begin
 if p_work is null or length(p_work) not between 1 and 160 then raise exception 'Invalid sync query' using errcode='22023';end if;
 ctx:=public.pro_work_budget_context(p_actor,p_work);
 select revision into brev from public.pro_work_budget_state where owner_id=p_actor and work_id=p_work;
 for r in select 'estimate' k,g.publication_id::text id,0::bigint ord from public.pro_private_estimate_work_agreements g where g.owner_id=p_actor and g.work_id=p_work
  union all select 'change',c.id::text,c.position from public.pro_work_changes c where c.owner_id=p_actor and c.work_id=p_work and c.status='accepted' order by 3 loop
  plan:=public.pro_work_budget_sync_plan(p_actor,p_work,r.k,r.id);
  select * into sync from public.pro_work_budget_doc_syncs where owner_id=p_actor and work_id=p_work and source_kind=r.k and source_id=r.id;
  sources:=sources||jsonb_build_object('kind',r.k,'id',r.id,'title',plan->'title','at',plan->'at','reason',plan->'reason',
   'groupCount',jsonb_array_length(coalesce(plan->'groups','[]'::jsonb)),'itemCount',jsonb_array_length(coalesce(plan->'items','[]'::jsonb)),
   'plannedCents',coalesce((plan->>'plannedCents')::bigint,0),'saleCents',coalesce((plan->>'saleCents')::bigint,0),
   'unallocatedCents',coalesce((plan->>'unallocatedCents')::bigint,0),'applied',sync.source_id is not null,
   'appliedAt',sync.applied_at,'createdCodes',sync.created_codes);
 end loop;
 return jsonb_build_object('work',jsonb_build_object('id',p_work,'clientId',ctx->>'clientId','title',ctx->>'title'),'currency','CRC',
  'canWrite',not((ctx->>'cancelled')::boolean or (ctx->>'clientArchived')::boolean),'budgetRevision',coalesce(brev,0),'sources',sources);
end $$;

create or replace function public.pro_work_budget_sync_apply(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;wid text;kind text;sid text;rev integer;ctx jsonb;receipt public.pro_work_budget_doc_actions;plan jsonb;brev integer;
 e jsonb;ids jsonb:='{}'::jsonb;cid uuid;codes jsonb:='[]'::jsonb;created integer:=0;result jsonb;total integer;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' or p_input->>'action'<>'apply'
  or jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'workId') is distinct from 'string'
  or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce(p_input->>'revision' ~ '^[0-9]{1,10}$',false) or (p_input->>'revision')::numeric>2147483646
  or jsonb_typeof(p_input->'sourceKind') is distinct from 'string' or p_input->>'sourceKind' not in('estimate','change')
  or jsonb_typeof(p_input->'sourceId') is distinct from 'string' or length(p_input->>'sourceId') not between 1 and 80
  or not(p_input ?& array['action','actionId','workId','revision','sourceKind','sourceId']) or (p_input-array['action','actionId','workId','revision','sourceKind','sourceId'])<>'{}'::jsonb
  or length(p_input->>'workId') not between 1 and 160 then raise exception 'Invalid budget sync' using errcode='22023';end if;
 aid:=(p_input->>'actionId')::uuid;wid:=p_input->>'workId';kind:=p_input->>'sourceKind';sid:=p_input->>'sourceId';rev:=(p_input->>'revision')::integer;
 perform pg_advisory_xact_lock(hashtextextended('pro-budget-doc-sync-action:'||p_actor::text||':'||aid::text,0));
 perform pg_advisory_xact_lock(hashtextextended('pro-work-budget:'||p_actor::text||':'||wid,0));
 ctx:=public.pro_work_budget_context(p_actor,wid);
 select * into receipt from public.pro_work_budget_doc_actions where owner_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Budget sync action reused' using errcode='40001';end if;
  return receipt.result;
 end if;
 if (ctx->>'cancelled')::boolean or (ctx->>'clientArchived')::boolean then raise exception 'Restore work or customer before changing budget' using errcode='40001';end if;
 -- Share-lock the source so it cannot move while the budget is written.
 if kind='estimate' then perform 1 from public.pro_private_estimate_work_agreements where owner_id=p_actor and work_id=wid and publication_id::text=sid for share;
 else perform 1 from public.pro_work_changes where owner_id=p_actor and work_id=wid and id::text=sid and status='accepted' for share;end if;
 select revision into brev from public.pro_work_budget_state where owner_id=p_actor and work_id=wid for update;
 if coalesce(brev,0)<>rev then raise exception 'Budget changed' using errcode='40001';end if;
 plan:=public.pro_work_budget_sync_plan(p_actor,wid,kind,sid);
 if plan->>'reason'='unavailable' then raise exception 'Source unavailable' using errcode='40001';end if;
 if plan->>'reason'='currency' then raise exception 'Only colon budgets can be synchronised' using errcode='22023';end if;
 if brev is null then insert into public.pro_work_budget_state values(p_actor,wid,ctx->>'clientId',1);brev:=1;end if;
 if exists(select 1 from public.pro_work_budget_doc_syncs where owner_id=p_actor and work_id=wid and source_kind=kind and source_id=sid) then
  raise exception 'Source already applied' using errcode='40001';end if;
 total:=jsonb_array_length(plan->'groups')+jsonb_array_length(plan->'items');
 if (select count(*) from public.pro_work_budget_codes where owner_id=p_actor and work_id=wid)+total>500 then raise exception 'Budget code capacity reached' using errcode='54000';end if;
 if exists(select 1 from public.pro_work_budget_codes c where c.owner_id=p_actor and c.work_id=wid and c.code in(
   select x->>'code' from jsonb_array_elements((plan->'groups')||(plan->'items')) x)) then raise exception 'Budget code already in use' using errcode='40001';end if;
 for e in select value from jsonb_array_elements(plan->'groups') loop
  cid:=public.pro_cost_code_uuid('docsync-code:'||aid::text||':'||(e->>'key'));
  perform public.pro_work_budget_mutate(p_actor,jsonb_build_object('action','save_group','actionId',public.pro_cost_code_uuid('docsync-action:'||aid::text||':'||(e->>'key')),
   'workId',wid,'clientId',ctx->>'clientId','revision',brev,'id',cid,'code',e->>'code','title',e->>'title'));
  brev:=brev+1;ids:=ids||jsonb_build_object(e->>'key',cid);created:=created+1;codes:=codes||jsonb_build_object('code',e->>'code','codeId',cid,'plannedCents',0);
 end loop;
 for e in select value from jsonb_array_elements(plan->'items') loop
  cid:=public.pro_cost_code_uuid('docsync-code:'||aid::text||':'||(e->>'key'));
  perform public.pro_work_budget_mutate(p_actor,jsonb_build_object('action','save_item','actionId',public.pro_cost_code_uuid('docsync-action:'||aid::text||':'||(e->>'key')),
   'workId',wid,'clientId',ctx->>'clientId','revision',brev,'id',cid,'code',e->>'code','title',e->>'title',
   'parentId',case when e->>'groupKey' is not null then ids->(e->>'groupKey') else 'null'::jsonb end,'plannedCents',(e->>'plannedCents')::bigint));
  brev:=brev+1;created:=created+1;
  insert into public.pro_work_budget_line_settings(owner_id,work_id,code_id,markup_bp,vat_code) values(p_actor,wid,cid,(e->>'markupBp')::integer,e->>'vatCode')
   on conflict(owner_id,work_id,code_id) do update set markup_bp=excluded.markup_bp,vat_code=excluded.vat_code;
  codes:=codes||jsonb_build_object('code',e->>'code','codeId',cid,'plannedCents',(e->>'plannedCents')::bigint);
 end loop;
 insert into public.pro_work_budget_doc_syncs(owner_id,work_id,source_kind,source_id,action_id,created_codes,planned_cents,unallocated_cents,codes)
  values(p_actor,wid,kind,sid,aid,created,coalesce((plan->>'plannedCents')::bigint,0),coalesce((plan->>'unallocatedCents')::bigint,0),codes);
 result:=jsonb_build_object('action','apply','workId',wid,'sourceKind',kind,'sourceId',sid,'revision',brev,'created',created,
  'plannedCents',coalesce((plan->>'plannedCents')::bigint,0),'unallocatedCents',coalesce((plan->>'unallocatedCents')::bigint,0));
 insert into public.pro_work_budget_doc_actions(owner_id,action_id,work_id,input,result) values(p_actor,aid,wid,p_input,result);
 ctx:=public.pro_work_budget_context(p_actor,wid);
 if (ctx->>'cancelled')::boolean or (ctx->>'clientArchived')::boolean then raise exception 'Work or customer changed' using errcode='40001';end if;
 return result;
end $$;

create or replace function public.pro_work_budget_doc_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' and (not exists(select 1 from public.profiles where id=old.owner_id) or not exists(select 1 from public.pro_work_budget_state where owner_id=old.owner_id and work_id=old.work_id)) then return old;end if;
 raise exception 'Immutable budget synchronisation record' using errcode='23514';
end $$;
drop trigger if exists pro_work_budget_doc_syncs_immutable on public.pro_work_budget_doc_syncs;
create trigger pro_work_budget_doc_syncs_immutable before update or delete on public.pro_work_budget_doc_syncs for each row execute function public.pro_work_budget_doc_immutable();
drop trigger if exists pro_work_budget_doc_actions_immutable on public.pro_work_budget_doc_actions;
create trigger pro_work_budget_doc_actions_immutable before update or delete on public.pro_work_budget_doc_actions for each row execute function public.pro_work_budget_doc_immutable();

do $$declare t text;f record;begin
 foreach t in array array['pro_work_budget_doc_syncs','pro_work_budget_doc_actions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname like 'pro_work_budget_sync_%' or n.nspname='public' and p.proname='pro_work_budget_doc_immutable' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
notify pgrst,'reload schema';
