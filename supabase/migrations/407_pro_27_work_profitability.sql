-- Row 23: estimated vs real profitability per job. One read that joins the agreed amount (without VAT when known), real costs, purchase-order
-- commitments, approved changes, the budget forecast (estimate at completion) and allowances still to choose, and derives margin, projection at
-- close and alerts. Owner-configurable minimum margin per job (CAS by revision, idempotent by actionId). Read only for the rest: nothing is posted.
create table if not exists public.pro_work_profit_settings(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 work_id text not null,
 min_margin_bp integer not null check(min_margin_bp between 0 and 10000),
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now(),
 primary key(owner_id,work_id),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade
);
create table if not exists public.pro_work_profit_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,
 action_id uuid not null,
 input jsonb not null,
 result jsonb not null,
 at timestamptz not null default now(),
 primary key(actor_id,action_id)
);
alter table public.pro_work_profit_settings enable row level security;
alter table public.pro_work_profit_actions enable row level security;
revoke all on public.pro_work_profit_settings,public.pro_work_profit_actions from public,anon,authenticated;

create or replace function public.pro_work_profitability_read(p_actor uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare fin jsonb;fc jsonb;tot jsonb;s public.pro_work_profit_settings;agreed bigint;basis text;cost bigint;committed bigint;eac bigint;planned bigint;
 approved bigint;approved_count integer;proposed bigint;proposed_count integer;pending_allow bigint;proj_cost bigint;margin_now bigint;margin_proj bigint;margin_bp integer;est_margin bigint;
 min_bp integer;unknown_n bigint;uncosted bigint;over_n bigint;alerts jsonb:='[]'::jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 then raise exception 'Invalid profitability query' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then return null;end if;
 fin:=public.pro_work_overview_read(p_actor,p_work,'finance');
 if fin is null then return null;end if;
 fc:=public.pro_cost_code_forecast_read(p_actor,p_work);tot:=coalesce(fc->'totals','{}'::jsonb);
 select * into s from public.pro_work_profit_settings where owner_id=p_actor and work_id=p_work;
 min_bp:=coalesce(s.min_margin_bp,1000);
 agreed:=coalesce((fin->>'agreedNetCents')::bigint,(fin->>'agreedCents')::bigint);
 basis:=case when fin->>'agreedNetCents' is not null then 'without_tax' when fin->>'agreedCents' is not null then 'as_agreed' else 'none' end;
 cost:=coalesce((fin->>'costCents')::bigint,0);committed:=coalesce((fin->>'committedCents')::bigint,0);
 eac:=coalesce((tot->>'eacCents')::bigint,0);planned:=coalesce((tot->>'costCents')::bigint,0);unknown_n:=coalesce((tot->>'unknownCount')::bigint,0);
 over_n:=coalesce((tot->>'overCount')::bigint,0);uncosted:=coalesce((fin->>'uncostedCount')::bigint,0);
 select coalesce(sum(delta_cents) filter(where status='accepted'),0),count(*) filter(where status='accepted'),
   coalesce(sum(delta_cents) filter(where status='proposed'),0),count(*) filter(where status='proposed')
  into approved,approved_count,proposed,proposed_count from public.pro_work_changes where owner_id=p_actor and work_id=p_work;
 select coalesce(sum(planned_cents),0) into pending_allow from public.pro_work_allowances where owner_id=p_actor and work_id=p_work and not archived and status in('open','reopened');
 proj_cost:=greatest(cost+committed,eac)+pending_allow;
 if agreed is not null then
  margin_now:=agreed-cost-committed;margin_proj:=agreed-proj_cost;est_margin:=case when planned>0 then agreed-planned end;
  margin_bp:=case when agreed>0 then round(margin_proj::numeric*10000/agreed)::integer end;
  if margin_proj<0 then alerts:=alerts||jsonb_build_array(jsonb_build_object('code','loss','severity','high'));
  elsif margin_bp is not null and margin_bp<min_bp then alerts:=alerts||jsonb_build_array(jsonb_build_object('code','low_margin','severity','medium'));end if;
 else alerts:=alerts||jsonb_build_array(jsonb_build_object('code','no_agreed','severity','info'));end if;
 if planned>0 and proj_cost>planned then alerts:=alerts||jsonb_build_array(jsonb_build_object('code','cost_over_estimate','severity','medium'));end if;
 if over_n>0 then alerts:=alerts||jsonb_build_array(jsonb_build_object('code','over_lines','severity','medium','count',over_n));end if;
 if unknown_n>0 or uncosted>0 then alerts:=alerts||jsonb_build_array(jsonb_build_object('code','incomplete','severity','info'));end if;
 return jsonb_build_object('workId',p_work,'currency','CRC','basis',basis,'agreedCents',agreed,
  'approvedChangesCents',approved,'approvedChangesCount',approved_count,'proposedChangesCents',proposed,'proposedChangesCount',proposed_count,
  'estimatedCostCents',planned,'estimatedMarginCents',est_margin,
  'actualCostCents',cost,'committedCents',committed,'pendingAllowancesCents',pending_allow,'budgetEacCents',eac,
  'projectedCostCents',proj_cost,'currentMarginCents',margin_now,'projectedMarginCents',margin_proj,'projectedMarginBp',margin_bp,
  'consumedBp',case when proj_cost>0 then round(least(cost::numeric*10000/proj_cost,100000))::integer end,
  'minMarginBp',min_bp,'settingsRevision',coalesce(s.revision,0),'alerts',alerts);
end $$;

create or replace function public.pro_work_profit_target_set(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare keys text[];wid text;aid uuid;rev integer;bp integer;receipt public.pro_work_profit_actions;cur public.pro_work_profit_settings;result jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid target' using errcode='22023';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if keys is distinct from array['action','actionId','minMarginBp','revision','workId'] or p_input->>'action' is distinct from 'set_target'
  or jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'workId') is distinct from 'string'
  or jsonb_typeof(p_input->'revision') is distinct from 'number' or jsonb_typeof(p_input->'minMarginBp') is distinct from 'number'
  or not coalesce(p_input->>'revision'~'^[0-9]{1,10}$',false) or not coalesce(p_input->>'minMarginBp'~'^[0-9]{1,5}$',false)
 then raise exception 'Invalid target fields' using errcode='22023';end if;
 wid:=p_input->>'workId';aid:=(p_input->>'actionId')::uuid;rev:=(p_input->>'revision')::integer;bp:=(p_input->>'minMarginBp')::integer;
 if length(wid) not between 1 and 160 or bp>10000 or (p_input->>'revision')::numeric>2147483646 then raise exception 'Invalid target values' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-profit-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_work_profit_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-profit:'||p_actor::text||':'||wid,0));
 select * into cur from public.pro_work_profit_settings where owner_id=p_actor and work_id=wid for update;
 if coalesce(cur.revision,0)<>rev then raise exception 'Target changed' using errcode='40001';end if;
 if found then update public.pro_work_profit_settings set min_margin_bp=bp,revision=revision+1,updated_at=now() where owner_id=p_actor and work_id=wid returning * into cur;
 else insert into public.pro_work_profit_settings(owner_id,work_id,min_margin_bp) values(p_actor,wid,bp) returning * into cur;end if;
 result:=jsonb_build_object('workId',wid,'minMarginBp',cur.min_margin_bp,'settingsRevision',cur.revision);
 insert into public.pro_work_profit_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;
revoke all on function public.pro_work_profitability_read(uuid,text),public.pro_work_profit_target_set(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pro_work_profitability_read(uuid,text),public.pro_work_profit_target_set(uuid,jsonb) to service_role;
notify pgrst, 'reload schema';
