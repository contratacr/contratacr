-- Row 75: send the positive difference of a defined allowance ("monto previsto") to a DRAFT estimate of the same job as a surcharge line.
-- Reuses the private estimate editor tables and totals; the estimate keeps its own revision (CAS) and immutable history.
-- Idempotent by actionId. One live surcharge per allowance: it can be sent again only if the line was removed from the estimate.
create table if not exists public.pro_work_allowance_surcharges(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 allowance_id uuid not null,
 work_id text not null,
 estimate_id uuid not null,
 line_id uuid not null,
 amount_cents bigint not null check(amount_cents between 1 and 10000000000),
 tax_bps integer not null check(tax_bps between 0 and 10000),
 action_id uuid not null,
 sent_at timestamptz not null default now(),
 primary key(owner_id,allowance_id),
 unique(owner_id,estimate_id,line_id),
 foreign key(owner_id,estimate_id) references public.pro_private_estimates(owner_id,id) on delete cascade
);
create table if not exists public.pro_work_allowance_surcharge_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,
 action_id uuid not null,
 input jsonb not null,
 result jsonb not null,
 at timestamptz not null default now(),
 primary key(actor_id,action_id)
);
alter table public.pro_work_allowance_surcharges enable row level security;
alter table public.pro_work_allowance_surcharge_actions enable row level security;
revoke all on public.pro_work_allowance_surcharges,public.pro_work_allowance_surcharge_actions from public,anon,authenticated;

create or replace function public.pro_work_allowance_surcharges_read(p_actor uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare estimates jsonb;links jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 then raise exception 'Invalid query' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then return null;end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'revision',e.revision,'totalCents',e.total_cents,
   'lineCount',(select count(*) from public.pro_private_estimate_items i where i.owner_id=e.owner_id and i.estimate_id=e.id)) order by e.created_at desc,e.id),'[]'::jsonb) into estimates
  from public.pro_private_estimates e where e.owner_id=p_actor and not e.archived and e.currency='CRC' and e.source->>'kind'='work' and e.source->>'id'=p_work;
 select coalesce(jsonb_agg(jsonb_build_object('allowanceId',s.allowance_id,'estimateId',s.estimate_id,'estimateTitle',e.title,'lineId',s.line_id,'amountCents',s.amount_cents,
   'taxBps',s.tax_bps,'sentAt',s.sent_at,'present',exists(select 1 from public.pro_private_estimate_items i where i.owner_id=s.owner_id and i.estimate_id=s.estimate_id and i.id=s.line_id)
    and not e.archived) order by s.sent_at desc),'[]'::jsonb) into links
  from public.pro_work_allowance_surcharges s join public.pro_private_estimates e on e.owner_id=s.owner_id and e.id=s.estimate_id
  where s.owner_id=p_actor and s.work_id=p_work;
 return jsonb_build_object('workId',p_work,'estimates',estimates,'links',links);
end $$;

create or replace function public.pro_work_allowance_surcharge_send(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare keys text[];wid text;aid uuid;rid uuid;eid uuid;lid uuid;rev integer;erev integer;tax integer;receipt public.pro_work_allowance_surcharge_actions;
 a public.pro_work_allowances;e public.pro_private_estimates;diff bigint;lines jsonb;totals jsonb;line jsonb;prior public.pro_work_allowance_surcharges;result jsonb;before_json jsonb;n integer;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid surcharge' using errcode='22023';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if keys is distinct from array['action','actionId','estimateId','estimateRevision','id','lineId','revision','taxBps','workId'] or p_input->>'action' is distinct from 'send_to_estimate'
  or jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'workId') is distinct from 'string' or jsonb_typeof(p_input->'id') is distinct from 'string'
  or jsonb_typeof(p_input->'estimateId') is distinct from 'string' or jsonb_typeof(p_input->'lineId') is distinct from 'string'
  or jsonb_typeof(p_input->'revision') is distinct from 'number' or jsonb_typeof(p_input->'estimateRevision') is distinct from 'number' or jsonb_typeof(p_input->'taxBps') is distinct from 'number'
  or not coalesce(p_input->>'revision'~'^[0-9]{1,10}$',false) or not coalesce(p_input->>'estimateRevision'~'^[0-9]{1,10}$',false) or not coalesce(p_input->>'taxBps'~'^[0-9]{1,5}$',false)
 then raise exception 'Invalid surcharge fields' using errcode='22023';end if;
 wid:=p_input->>'workId';aid:=(p_input->>'actionId')::uuid;rid:=(p_input->>'id')::uuid;eid:=(p_input->>'estimateId')::uuid;lid:=(p_input->>'lineId')::uuid;
 if length(wid) not between 1 and 160 or (p_input->>'revision')::numeric not between 1 and 2147483646 or (p_input->>'estimateRevision')::numeric not between 1 and 2147483646 or (p_input->>'taxBps')::integer>10000 then raise exception 'Invalid surcharge values' using errcode='22023';end if;
 rev:=(p_input->>'revision')::integer;erev:=(p_input->>'estimateRevision')::integer;tax:=(p_input->>'taxBps')::integer;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-allowance-surcharge-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_work_allowance_surcharge_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 perform pg_advisory_xact_lock(hashtextextended('pro-work-allowance:'||p_actor::text||':'||wid,0));
 select * into a from public.pro_work_allowances where owner_id=p_actor and id=rid and work_id=wid for update;
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 if a.revision<>rev then raise exception 'Allowance changed' using errcode='40001';end if;
 if a.archived or a.status<>'decided' or a.actual_cents<=a.planned_cents then raise exception 'Nothing to send' using errcode='22023';end if;
 diff:=a.actual_cents-a.planned_cents;
 select * into e from public.pro_private_estimates where owner_id=p_actor and id=eid for update;
 if not found then raise exception 'Estimate unavailable' using errcode='42501';end if;
 if e.revision<>erev or e.archived then raise exception 'Estimate changed' using errcode='40001';end if;
 if e.currency<>'CRC' or e.source->>'kind' is distinct from 'work' or e.source->>'id' is distinct from wid then raise exception 'Estimate does not belong to this job' using errcode='22023';end if;
 select * into prior from public.pro_work_allowance_surcharges where owner_id=p_actor and allowance_id=rid;
 if found then
  if exists(select 1 from public.pro_private_estimate_items i where i.owner_id=p_actor and i.estimate_id=prior.estimate_id and i.id=prior.line_id) then raise exception 'Surcharge already sent' using errcode='23505';end if;
  delete from public.pro_work_allowance_surcharges where owner_id=p_actor and allowance_id=rid;
 end if;
 if exists(select 1 from public.pro_private_estimate_items where owner_id=p_actor and id=lid) then raise exception 'Line id already used' using errcode='23505';end if;
 select count(*) into n from public.pro_private_estimate_items where owner_id=p_actor and estimate_id=eid;
 if n>=100 then raise exception 'Estimate line limit' using errcode='54000';end if;
 before_json:=public.pro_private_estimate_json(e);
 line:=jsonb_build_object('catalogProductId',null,'description','Recargo por monto previsto: '||a.name,'discountBps',0,'id',lid,'qtyMilli',1000,'taxBps',tax,'unit','u','unitPriceCents',diff);
 insert into public.pro_private_estimate_items(owner_id,estimate_id,id,position,content)
  values(p_actor,eid,lid,coalesce((select max(position) from public.pro_private_estimate_items where owner_id=p_actor and estimate_id=eid),0)+1,line);
 select jsonb_agg(content order by position) into lines from public.pro_private_estimate_items where owner_id=p_actor and estimate_id=eid;
 totals:=public.pro_private_estimate_totals(lines);
 update public.pro_private_estimates set subtotal_cents=(totals->>'subtotalCents')::bigint,discount_cents=(totals->>'discountCents')::bigint,tax_cents=(totals->>'taxCents')::bigint,
  total_cents=(totals->>'totalCents')::bigint,revision=revision+1,updated_at=now() where owner_id=p_actor and id=eid returning * into e;
 insert into public.pro_private_estimate_history(owner_id,estimate_id,action_id,action,before_estimate,after_estimate)
  values(p_actor,eid,aid,'save',before_json,public.pro_private_estimate_json(e));
 insert into public.pro_work_allowance_surcharges(owner_id,allowance_id,work_id,estimate_id,line_id,amount_cents,tax_bps,action_id) values(p_actor,rid,wid,eid,lid,diff,tax,aid);
 result:=jsonb_build_object('allowanceId',rid,'estimateId',eid,'estimateRevision',e.revision,'lineId',lid,'amountCents',diff,'taxBps',tax,'estimateTotalCents',e.total_cents);
 insert into public.pro_work_allowance_surcharge_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 return result;
end $$;
revoke all on function public.pro_work_allowance_surcharges_read(uuid,text),public.pro_work_allowance_surcharge_send(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pro_work_allowance_surcharges_read(uuid,text),public.pro_work_allowance_surcharge_send(uuid,jsonb) to service_role;
notify pgrst, 'reload schema';
