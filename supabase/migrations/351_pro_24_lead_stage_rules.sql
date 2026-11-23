-- ContrataCR Pro, database part 24 (row 07): rules per pipeline stage.
-- A company can ask for a follow-up N days after a lead ENTERS a stage ("rule"). The rules are stored with optimistic
-- concurrency (revision), idempotent receipts and immutable history, like the stage colours/probabilities. The reader
-- lists, from the existing stage spans (entered_at), the open leads that have been in a stage with a rule for at least
-- N days. Nothing is sent and nothing is changed on the leads: it is a work list. PRO_ENABLED stays false in production.
begin;
create table if not exists public.pro_lead_stage_rule_heads(
 owner_id uuid primary key references public.profiles(id) on delete cascade,revision integer not null check(revision between 0 and 2147483646));
create table if not exists public.pro_lead_stage_rules(
 owner_id uuid not null references public.profiles(id) on delete cascade,stage_id text not null check(length(stage_id) between 1 and 80),
 follow_up_days integer not null check(follow_up_days between 1 and 90),updated_at timestamptz not null default clock_timestamp(),primary key(owner_id,stage_id));
create table if not exists public.pro_lead_stage_rule_actions(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,input jsonb not null,result jsonb not null,
 at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id));
create table if not exists public.pro_lead_stage_rule_history(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,stage_id text not null,
 action text not null check(action in('set','clear')),before_value jsonb,after_value jsonb,actor_name text not null default '',
 at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id));
do $$declare t text;begin
 foreach t in array array['pro_lead_stage_rule_heads','pro_lead_stage_rules','pro_lead_stage_rule_actions','pro_lead_stage_rule_history'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on table public.%I from public,anon,authenticated',t);execute format('grant all on table public.%I to service_role',t);
 end loop;
 foreach t in array array['pro_lead_stage_rule_actions','pro_lead_stage_rule_history'] loop
  execute format('drop trigger if exists %I on public.%I',t||'_immutable',t);
  execute format('create trigger %I before update or delete on public.%I for each row when (pg_trigger_depth()=0) execute function public.pro_lead_stage_immutable()',t||'_immutable',t);
 end loop;
end $$;

create or replace function public.pro_lead_stage_rules_read(p_owner uuid) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare today date;rules jsonb;due jsonb;
begin
 perform public.pro_lead_origin_owner(p_owner);
 perform public.pro_lead_stage_observe(p_owner);
 today:=public.pro_lead_inbox_today();
 select coalesce(jsonb_agg(jsonb_build_object('stageId',stage_id,'followUpDays',follow_up_days) order by stage_id),'[]'::jsonb) into rules from public.pro_lead_stage_rules where owner_id=p_owner;
 select coalesce(jsonb_agg(x.item order by x.due_on,x.entered_at),'[]'::jsonb) into due from(
  select (s.entered_at at time zone 'America/Costa_Rica')::date+r.follow_up_days as due_on,s.entered_at,
   jsonb_build_object('kind',s.kind,'id',s.lead_id,'stageId',s.stage_id,'title',coalesce(nullif(src.service_label,''),''),'enteredAt',s.entered_at,'dueOn',((s.entered_at at time zone 'America/Costa_Rica')::date+r.follow_up_days),
    'daysIn',greatest(0,today-(s.entered_at at time zone 'America/Costa_Rica')::date),'followUpDays',r.follow_up_days) item
  from public.pro_lead_stage_spans s
  join public.pro_lead_stage_rules r on r.owner_id=s.owner_id and r.stage_id=s.stage_id
  join public.pro_lead_inbox_sources(p_owner,'') src on src.kind=s.kind and src.id=s.lead_id and not src.archived and not src.snoozed
  left join public.pro_lead_outcomes o on o.owner_id=s.owner_id and o.kind=s.kind and o.lead_id=s.lead_id
  where s.owner_id=p_owner and s.left_at is null and o.outcome is null
   and (s.entered_at at time zone 'America/Costa_Rica')::date+r.follow_up_days<=today
  order by 1,2 limit 100) x;
 return jsonb_build_object('revision',coalesce((select revision from public.pro_lead_stage_rule_heads where owner_id=p_owner),0),'rules',rules,'due',due);
end $$;

create or replace function public.pro_lead_stage_rules_mutate(p_owner uuid,p_input jsonb,p_member uuid default null) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;keys text[];aid uuid;receipt public.pro_lead_stage_rule_actions;cur integer;sid text;before_days integer;answer jsonb;days integer;
begin
 perform public.pro_lead_origin_owner(p_owner);
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid stage rule' using errcode='22023';end if;
 act:=p_input->>'action';select array_agg(x order by x) into keys from jsonb_object_keys(p_input) x;
 if keys is distinct from(case act when 'set' then array['action','actionId','days','revision','stageId'] when 'clear' then array['action','actionId','revision','stageId'] end)
  or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce(p_input->>'revision'~'^[0-9]{1,10}$',false) or(p_input->>'revision')::numeric>2147483645
  or jsonb_typeof(p_input->'stageId') is distinct from 'string' then raise exception 'Unexpected stage rule fields' using errcode='22023';end if;
 if act='set' and(jsonb_typeof(p_input->'days') is distinct from 'number' or not coalesce(p_input->>'days'~'^[0-9]{1,2}$',false) or (p_input->>'days')::integer not between 1 and 90) then raise exception 'Invalid follow-up days' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid identity' using errcode='22023';end;
 perform pg_advisory_xact_lock(hashtextextended('pro-lead-stage-rules:'||p_owner::text,0));
 select * into receipt from public.pro_lead_stage_rule_actions where owner_id=p_owner and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result||jsonb_build_object('replayed',true);end if;
 cur:=coalesce((select revision from public.pro_lead_stage_rule_heads where owner_id=p_owner),0);
 if cur<>(p_input->>'revision')::integer then raise exception 'Stage rules changed' using errcode='40001';end if;
 sid:=p_input->>'stageId';
 if not exists(select 1 from jsonb_array_elements(public.pro_lead_stage_settings(p_owner)->'stages') x where x->>'id'=sid) then raise exception 'Stage unavailable' using errcode='P0002';end if;
 select follow_up_days into before_days from public.pro_lead_stage_rules where owner_id=p_owner and stage_id=sid;
 if act='set' then
  days:=(p_input->>'days')::integer;
  insert into public.pro_lead_stage_rules(owner_id,stage_id,follow_up_days) values(p_owner,sid,days) on conflict(owner_id,stage_id) do update set follow_up_days=excluded.follow_up_days,updated_at=clock_timestamp();
 else delete from public.pro_lead_stage_rules where owner_id=p_owner and stage_id=sid;end if;
 insert into public.pro_lead_stage_rule_heads(owner_id,revision) values(p_owner,cur+1) on conflict(owner_id) do update set revision=excluded.revision;
 answer:=jsonb_build_object('action',act,'revision',cur+1,'stageId',sid,'followUpDays',case when act='set' then days else null end);
 insert into public.pro_lead_stage_rule_history(owner_id,action_id,stage_id,action,before_value,after_value,actor_name)
 values(p_owner,aid,sid,act,case when before_days is null then null else jsonb_build_object('followUpDays',before_days) end,jsonb_build_object('followUpDays',case when act='set' then days else null end),
  left(coalesce(public.pro_team_name(case when p_member is not null and public.pro_role_of(p_member,p_owner) is not null then p_member else p_owner end),''),160));
 insert into public.pro_lead_stage_rule_actions(owner_id,action_id,input,result) values(p_owner,aid,p_input,answer);
 return answer;
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_lead_stage_rules_read','pro_lead_stage_rules_mutate') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
notify pgrst,'reload schema';
commit;
