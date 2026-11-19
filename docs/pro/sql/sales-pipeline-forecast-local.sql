-- LOCAL PRO ONLY. Ronda F2-B (2026-11-19), Sales pipeline (Houzz Pro parity rows 07 and 08).
--  * Stage appearance and probability (row 07): per company stage colour (fixed palette keys, never raw CSS)
--    and win probability 0-100 used for the weighted forecast. Stage creation/rename/reorder/hide/retire with
--    reassignment of existing leads stays in request-pipeline / lead-private-stages (same catalogue, untouched).
--    Writes: CAS on a per-company revision (40001), idempotent actionId receipts, immutable history.
--  * Stage spans (rows 07 and 08): a record of when each lead entered and left each stage. The existing stage
--    writers keep their tables; AFTER INSERT triggers on their history tables only append a "mark" (lead, time
--    and the explicit stage when known). pro_lead_stage_observe() turns marks into spans and closes/opens a
--    span when the effective stage (also automatic projection: shared quote, converted job...) differs from the
--    open one. Leads that existed before this module get one span "since the last recorded stage change"
--    (source backfill). Spans are never deleted; only left_at may be set once.
--  * Forecast and funnel readers: open value and weighted value per stage and currency (manual opportunities
--    with an expected revenue; lost outcomes and archived leads excluded), time in stage, funnel by stage
--    reached (spans + current stage + explicit job conversion) with conversion % for a Costa Rica period.
-- Patterns: RLS on, service_role only, security invoker. Nothing is sent; no third party is called.
begin;
create table if not exists public.pro_lead_stage_style_heads(
 owner_id uuid primary key references public.profiles(id) on delete cascade,revision integer not null check(revision between 0 and 2147483646));
create table if not exists public.pro_lead_stage_styles(
 owner_id uuid not null references public.profiles(id) on delete cascade,stage_id text not null check(length(stage_id) between 1 and 80),
 color text not null check(color in('slate','blue','cyan','teal','green','lime','amber','orange','red','pink','violet','indigo')),
 probability integer not null check(probability between 0 and 100),updated_at timestamptz not null default clock_timestamp(),primary key(owner_id,stage_id));
create table if not exists public.pro_lead_stage_style_actions(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,input jsonb not null,result jsonb not null,
 at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id));
create table if not exists public.pro_lead_stage_style_history(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,stage_id text not null,
 action text not null check(action in('style','reset')),before_value jsonb not null,after_value jsonb not null,actor_name text not null default '',
 at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id));
create table if not exists public.pro_lead_stage_marks(
 mark_id bigint generated always as identity primary key,owner_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in('manual','request')),lead_id uuid not null,action text not null check(length(action) between 1 and 40),
 stage_id text,at timestamptz not null);
create index if not exists pro_lead_stage_marks_owner on public.pro_lead_stage_marks(owner_id,mark_id);
create table if not exists public.pro_lead_stage_cursors(
 owner_id uuid primary key references public.profiles(id) on delete cascade,last_mark bigint not null default 0,observed_at timestamptz);
create table if not exists public.pro_lead_stage_spans(
 owner_id uuid not null references public.profiles(id) on delete cascade,kind text not null check(kind in('manual','request')),lead_id uuid not null,
 seq integer not null check(seq between 1 and 100000),stage_id text not null,entered_at timestamptz not null,left_at timestamptz,
 source text not null check(source in('created','moved','observed','backfill')),primary key(owner_id,kind,lead_id,seq),check(left_at is null or left_at>=entered_at));
create unique index if not exists pro_lead_stage_spans_open on public.pro_lead_stage_spans(owner_id,kind,lead_id) where left_at is null;

do $$declare t text;begin
 foreach t in array array['pro_lead_stage_style_heads','pro_lead_stage_styles','pro_lead_stage_style_actions','pro_lead_stage_style_history','pro_lead_stage_marks','pro_lead_stage_cursors','pro_lead_stage_spans'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on table public.%I from public,anon,authenticated',t);execute format('grant all on table public.%I to service_role',t);
 end loop;
end $$;

-- Receipts, history and marks are immutable; a span may only be closed once (left_at null -> value).
create or replace function public.pro_lead_stage_immutable() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_table_name='pro_lead_stage_spans' and tg_op='UPDATE' then
  if to_jsonb(old)->'left_at'='null'::jsonb and to_jsonb(new)->'left_at'<>'null'::jsonb and(to_jsonb(new)-'left_at')=(to_jsonb(old)-'left_at') then return new;end if;
 end if;
 raise exception 'Immutable record' using errcode='23514';
end $$;
do $$declare t text;begin
 foreach t in array array['pro_lead_stage_style_actions','pro_lead_stage_style_history','pro_lead_stage_marks','pro_lead_stage_spans'] loop
  execute format('drop trigger if exists %I on public.%I',t||'_immutable',t);
  execute format('create trigger %I before update or delete on public.%I for each row when (pg_trigger_depth()=0) execute function public.pro_lead_stage_immutable()',t||'_immutable',t);
 end loop;
end $$;

-- ===== Marks from the existing stage writers (append only; never breaks the writer) =====
create or replace function public.pro_lead_stage_mark_center() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.kind='manual' and new.action in('create','set_stage','return_auto','reassign_stage','restore') then
  begin
   insert into public.pro_lead_stage_marks(owner_id,kind,lead_id,action,stage_id,at)
   values(new.owner_id,'manual',new.id,new.action,case when new.after_item->'manual'->>'stageMode'='manual' then new.after_item->'manual'->>'stageId' end,new.at);
  exception when others then null;
  end;
 end if;
 return null;
end $$;
create or replace function public.pro_lead_stage_mark_request() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 begin
  insert into public.pro_lead_stage_marks(owner_id,kind,lead_id,action,stage_id,at)
  values(new.owner_id,'request',new.request_id,new.action,case when new.after_state->>'mode'='manual' then new.after_state->>'stageId' end,new.at);
 exception when others then null;
 end;
 return null;
end $$;
drop trigger if exists pro_lead_stage_mark_center on public.pro_lead_center_history;
create trigger pro_lead_stage_mark_center after insert on public.pro_lead_center_history for each row execute function public.pro_lead_stage_mark_center();
drop trigger if exists pro_lead_stage_mark_request on public.pro_request_pipeline_history;
create trigger pro_lead_stage_mark_request after insert on public.pro_request_pipeline_history for each row execute function public.pro_lead_stage_mark_request();

-- ===== Stage settings (catalogue + colour/probability, defaults when not customized) =====
create or replace function public.pro_lead_stage_default_color(p_stage text) returns text language sql immutable security invoker set search_path=public,pg_temp as $$
 select case p_stage when 'new' then 'blue' when 'followed_up' then 'cyan' when 'connected' then 'teal' when 'meeting_scheduled' then 'violet' when 'estimate_sent' then 'amber' when 'won' then 'green' else 'slate' end $$;
create or replace function public.pro_lead_stage_default_probability(p_stage text) returns integer language sql immutable security invoker set search_path=public,pg_temp as $$
 select case p_stage when 'new' then 10 when 'followed_up' then 20 when 'connected' then 30 when 'meeting_scheduled' then 50 when 'estimate_sent' then 70 when 'won' then 100 else 40 end $$;
create or replace function public.pro_lead_stage_settings(p_owner uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare catalog jsonb;begin
 perform public.pro_lead_origin_owner(p_owner);catalog:=public.pro_lead_origin_stage_catalog(p_owner);
 return jsonb_build_object('revision',coalesce((select revision from public.pro_lead_stage_style_heads where owner_id=p_owner),0),'catalogRevision',(catalog->>'revision')::integer,
  'stages',coalesce((select jsonb_agg(jsonb_build_object('id',st->>'id','builtin',(st->>'builtin')::boolean,'name',st->'name','position',(st->>'position')::integer,'hidden',coalesce((st->>'hidden')::boolean,false),
    'color',coalesce(s.color,public.pro_lead_stage_default_color(st->>'id')),'probability',coalesce(s.probability,public.pro_lead_stage_default_probability(st->>'id')),'customized',s.stage_id is not null) order by(st->>'position')::integer)
   from jsonb_array_elements(catalog->'stages') st left join public.pro_lead_stage_styles s on s.owner_id=p_owner and s.stage_id=st->>'id'),'[]'::jsonb));
end $$;

create or replace function public.pro_lead_stage_style_mutate(p_owner uuid,p_input jsonb,p_member uuid default null) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;keys text[];aid uuid;receipt public.pro_lead_stage_style_actions;cur integer;sid text;before_json jsonb;after_json jsonb;answer jsonb;settings jsonb;
begin
 perform public.pro_lead_origin_owner(p_owner);
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid stage settings' using errcode='22023';end if;
 act:=p_input->>'action';select array_agg(x order by x) into keys from jsonb_object_keys(p_input) x;
 if keys is distinct from(case act when 'style' then array['action','actionId','color','probability','revision','stageId'] when 'reset' then array['action','actionId','revision','stageId'] end)
  or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce(p_input->>'revision'~'^[0-9]{1,10}$',false) or(p_input->>'revision')::numeric>2147483645
  or jsonb_typeof(p_input->'stageId') is distinct from 'string' then raise exception 'Unexpected stage settings fields' using errcode='22023';end if;
 if act='style' and(jsonb_typeof(p_input->'color') is distinct from 'string' or p_input->>'color' not in('slate','blue','cyan','teal','green','lime','amber','orange','red','pink','violet','indigo')
  or jsonb_typeof(p_input->'probability') is distinct from 'number' or not coalesce(p_input->>'probability'~'^[0-9]{1,3}$',false) or(p_input->>'probability')::integer>100) then raise exception 'Invalid colour or probability' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid identity' using errcode='22023';end;
 perform pg_advisory_xact_lock(hashtextextended('pro-lead-stage-style:'||p_owner::text,0));
 select * into receipt from public.pro_lead_stage_style_actions where owner_id=p_owner and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result||jsonb_build_object('replayed',true);end if;
 cur:=coalesce((select revision from public.pro_lead_stage_style_heads where owner_id=p_owner),0);
 if cur<>(p_input->>'revision')::integer then raise exception 'Stage settings changed' using errcode='40001';end if;
 sid:=p_input->>'stageId';settings:=public.pro_lead_stage_settings(p_owner);
 select x into before_json from jsonb_array_elements(settings->'stages') x where x->>'id'=sid;
 if before_json is null then raise exception 'Stage unavailable' using errcode='P0002';end if;
 if act='style' then
  insert into public.pro_lead_stage_styles(owner_id,stage_id,color,probability) values(p_owner,sid,p_input->>'color',(p_input->>'probability')::integer)
  on conflict(owner_id,stage_id) do update set color=excluded.color,probability=excluded.probability,updated_at=clock_timestamp();
 else delete from public.pro_lead_stage_styles where owner_id=p_owner and stage_id=sid;end if;
 insert into public.pro_lead_stage_style_heads(owner_id,revision) values(p_owner,cur+1) on conflict(owner_id) do update set revision=excluded.revision;
 settings:=public.pro_lead_stage_settings(p_owner);select x into after_json from jsonb_array_elements(settings->'stages') x where x->>'id'=sid;
 answer:=jsonb_build_object('action',act,'revision',cur+1,'stage',after_json);
 insert into public.pro_lead_stage_style_history(owner_id,action_id,stage_id,action,before_value,after_value,actor_name)
 values(p_owner,aid,sid,act,before_json,after_json,left(coalesce(public.pro_team_name(case when p_member is not null and public.pro_role_of(p_member,p_owner) is not null then p_member else p_owner end),''),160));
 insert into public.pro_lead_stage_style_actions(owner_id,action_id,input,result) values(p_owner,aid,p_input,answer);
 return answer;
end $$;

-- ===== Observation: marks + effective stage -> spans =====
create or replace function public.pro_lead_stage_observe(p_owner uuid) returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare cursor_from bigint;cursor_to bigint;lead record;m record;open_span public.pro_lead_stage_spans;changes integer:=0;create_id bigint;create_stage text;last_auto timestamptz;since timestamptz;next_seq integer;
begin
 perform public.pro_lead_origin_owner(p_owner);
 perform pg_advisory_xact_lock(hashtextextended('pro-lead-stage-observe:'||p_owner::text,0));
 insert into public.pro_lead_stage_cursors(owner_id) values(p_owner) on conflict do nothing;
 select last_mark into cursor_from from public.pro_lead_stage_cursors where owner_id=p_owner for update;
 select coalesce(max(mark_id),cursor_from) into cursor_to from public.pro_lead_stage_marks where owner_id=p_owner and mark_id>cursor_from;
 for lead in select s.kind,s.id,s.created_at,s.effective_stage from public.pro_lead_inbox_sources(p_owner,'') s loop
  select * into open_span from public.pro_lead_stage_spans where owner_id=p_owner and kind=lead.kind and lead_id=lead.id and left_at is null;
  if open_span.lead_id is null then
   select mk.mark_id,mk.stage_id into create_id,create_stage from public.pro_lead_stage_marks mk where mk.owner_id=p_owner and mk.kind=lead.kind and mk.lead_id=lead.id and mk.action='create' and mk.mark_id>cursor_from and mk.mark_id<=cursor_to order by mk.mark_id limit 1;
   next_seq:=coalesce((select max(seq) from public.pro_lead_stage_spans where owner_id=p_owner and kind=lead.kind and lead_id=lead.id),0)+1;
   if create_id is not null then
    insert into public.pro_lead_stage_spans(owner_id,kind,lead_id,seq,stage_id,entered_at,source) values(p_owner,lead.kind,lead.id,next_seq,coalesce(create_stage,'new'),lead.created_at,'created') returning * into open_span;
   else
    -- First observation of a lead that existed before (or a ContrataCR request): one span since the last recorded stage change.
    since:=greatest(lead.created_at,coalesce((select max(h.at) from public.pro_lead_center_history h where h.owner_id=p_owner and h.kind=lead.kind and h.id=lead.id and h.action in('set_stage','return_auto','reassign_stage')),lead.created_at),
     coalesce((select max(h.at) from public.pro_request_pipeline_history h where lead.kind='request' and h.owner_id=p_owner and h.request_id=lead.id),lead.created_at));
    insert into public.pro_lead_stage_spans(owner_id,kind,lead_id,seq,stage_id,entered_at,source) values(p_owner,lead.kind,lead.id,next_seq,lead.effective_stage,least(since,now()),case when lead.created_at>=coalesce((select min(at) from public.pro_lead_stage_marks where owner_id=p_owner),now()) then 'created' else 'backfill' end);
    changes:=changes+1;continue;
   end if;
   changes:=changes+1;
  end if;
  last_auto:=null;
  for m in select * from public.pro_lead_stage_marks where owner_id=p_owner and kind=lead.kind and lead_id=lead.id and mark_id>cursor_from and mark_id<=cursor_to and(create_id is null or mark_id>create_id) order by mark_id loop
   if m.stage_id is null then last_auto:=greatest(m.at,open_span.entered_at);continue;end if;
   last_auto:=null;
   if m.stage_id<>open_span.stage_id then
    update public.pro_lead_stage_spans set left_at=greatest(m.at,open_span.entered_at) where owner_id=p_owner and kind=lead.kind and lead_id=lead.id and seq=open_span.seq;
    insert into public.pro_lead_stage_spans(owner_id,kind,lead_id,seq,stage_id,entered_at,source) values(p_owner,lead.kind,lead.id,open_span.seq+1,m.stage_id,greatest(m.at,open_span.entered_at),'moved') returning * into open_span;
    changes:=changes+1;
   end if;
  end loop;
  create_id:=null;create_stage:=null;
  if lead.effective_stage<>open_span.stage_id then
   since:=greatest(coalesce(last_auto,now()),open_span.entered_at);
   update public.pro_lead_stage_spans set left_at=since where owner_id=p_owner and kind=lead.kind and lead_id=lead.id and seq=open_span.seq;
   insert into public.pro_lead_stage_spans(owner_id,kind,lead_id,seq,stage_id,entered_at,source) values(p_owner,lead.kind,lead.id,open_span.seq+1,lead.effective_stage,since,case when last_auto is null then 'observed' else 'moved' end);
   changes:=changes+1;
  end if;
 end loop;
 update public.pro_lead_stage_cursors set last_mark=cursor_to,observed_at=now() where owner_id=p_owner;
 return changes;
end $$;

-- ===== Readers (they observe first, so they are volatile) =====
create or replace function public.pro_lead_pipeline_converted(p_owner uuid,p_kind text,p_id uuid) returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select case when p_kind='manual' then exists(select 1 from public.pro_manual_lead_works m join public.pro_work w on w.user_id=m.owner_id and w.id=m.work_id_text and w."clientId"=m.source_client_id and w."bookingClientId" is null where m.owner_id=p_owner and m.lead_kind='manual' and m.lead_id=p_id)
  else exists(select 1 from public.pro_appointment_requests q join public.pro_work w on w.user_id=p_owner and w.id=q.work_id where q.owner_id=p_owner and q.id=p_id and not w.cancelled) end $$;

create or replace function public.pro_lead_pipeline_read(p_owner uuid,p_query jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v text;keys text[];settings jsonb;answer jsonb;p_from date;p_to date;p_channel text;k text;lid uuid;
begin
 perform public.pro_lead_origin_owner(p_owner);
 if jsonb_typeof(p_query) is distinct from 'object' then raise exception 'Invalid pipeline query' using errcode='22023';end if;
 v:=p_query->>'view';select array_agg(x order by x) into keys from jsonb_object_keys(p_query) x;
 if keys is distinct from(case v when 'settings' then array['view'] when 'forecast' then array['view'] when 'lead' then array['id','kind','view'] when 'funnel' then array['channel','from','to','view'] end) then raise exception 'Unexpected pipeline query' using errcode='22023';end if;
 settings:=public.pro_lead_stage_settings(p_owner);
 if v='settings' then return settings;end if;
 perform public.pro_lead_stage_observe(p_owner);
 if v='lead' then
  k:=p_query->>'kind';begin lid:=(p_query->>'id')::uuid;exception when others then raise exception 'Invalid identity' using errcode='22023';end;
  if k not in('manual','request') then raise exception 'Invalid lead source' using errcode='22023';end if;
  if not exists(select 1 from public.pro_lead_inbox_sources(p_owner,'') s where s.kind=k and s.id=lid) then raise exception 'Lead unavailable' using errcode='P0002';end if;
  return jsonb_build_object('kind',k,'id',lid,'spans',coalesce((select jsonb_agg(jsonb_build_object('seq',s.seq,'stageId',s.stage_id,'enteredAt',s.entered_at,'leftAt',s.left_at,
    'hours',round((extract(epoch from coalesce(s.left_at,now())-s.entered_at)/3600.0)::numeric,1),'source',s.source) order by s.seq) from public.pro_lead_stage_spans s where s.owner_id=p_owner and s.kind=k and s.lead_id=lid),'[]'::jsonb));
 end if;
 if v='forecast' then
  with st as(select x->>'id' id,(x->>'position')::integer pos,(x->>'probability')::integer prob,coalesce((x->>'hidden')::boolean,false) hidden from jsonb_array_elements(settings->'stages') x),
  src as materialized(select s.kind,s.id,s.effective_stage,l.currency,l.revenue_cents,o.outcome,sp.entered_at
   from public.pro_lead_inbox_sources(p_owner,'') s left join public.pro_lead_center_records l on s.kind='manual' and l.owner_id=p_owner and l.kind='manual' and l.id=s.id
   left join public.pro_lead_outcomes o on o.owner_id=p_owner and o.kind=s.kind and o.lead_id=s.id
   left join public.pro_lead_stage_spans sp on sp.owner_id=p_owner and sp.kind=s.kind and sp.lead_id=s.id and sp.left_at is null
   where not s.archived and coalesce(o.outcome,'')<>'lost'),
  money as(select src.effective_stage,src.currency,sum(src.revenue_cents) total,sum(round(src.revenue_cents*st.prob/100.0)) weighted,count(*) n from src join st on st.id=src.effective_stage where src.revenue_cents is not null and src.currency is not null group by 1,2)
  select jsonb_build_object('revision',settings->'revision',
   'stages',coalesce((select jsonb_agg(jsonb_build_object('stageId',st.id,'probability',st.prob,'count',(select count(*) from src where src.effective_stage=st.id),
     'withValue',coalesce((select sum(n) from money where money.effective_stage=st.id),0),
     'avgHours',(select round(avg(extract(epoch from now()-src.entered_at)/3600.0)::numeric,1) from src where src.effective_stage=st.id and src.entered_at is not null),
     'values',coalesce((select jsonb_agg(jsonb_build_object('currency',money.currency,'totalCents',money.total,'weightedCents',money.weighted) order by money.currency) from money where money.effective_stage=st.id),'[]'::jsonb)) order by st.pos) from st where not st.hidden),'[]'::jsonb),
   'totals',coalesce((select jsonb_agg(jsonb_build_object('currency',c.currency,'openCents',c.open_total,'weightedCents',c.open_weighted,'wonCents',c.won_total) order by c.currency)
     from(select currency,coalesce(sum(total) filter(where effective_stage<>'won'),0) open_total,coalesce(sum(weighted) filter(where effective_stage<>'won'),0) open_weighted,coalesce(sum(total) filter(where effective_stage='won'),0) won_total from money group by currency) c),'[]'::jsonb),
   'withoutValue',(select count(*) from src where src.revenue_cents is null or src.currency is null))
  into answer;
  return answer;
 end if;
 -- funnel
 if jsonb_typeof(p_query->'from') is distinct from 'string' or jsonb_typeof(p_query->'to') is distinct from 'string' or jsonb_typeof(p_query->'channel') not in('string','null') or length(coalesce(p_query->>'channel',''))>40 then raise exception 'Invalid funnel query' using errcode='22023';end if;
 begin p_from:=(p_query->>'from')::date;p_to:=(p_query->>'to')::date;exception when others then raise exception 'Invalid funnel period' using errcode='22023';end;
 if p_from>p_to or p_to-p_from>3660 or p_from<date'1900-01-01' or p_to>date'2100-12-31' then raise exception 'Invalid funnel period' using errcode='22023';end if;
 p_channel:=p_query->>'channel';
 with st as(select x->>'id' id,(x->>'position')::integer pos,coalesce((x->>'hidden')::boolean,false) hidden from jsonb_array_elements(settings->'stages') x),
 base as materialized(select s.kind,s.id,s.effective_stage,o.outcome,public.pro_lead_pipeline_converted(p_owner,s.kind,s.id) converted,(select pos from st where st.id=s.effective_stage) cur_pos
  from public.pro_lead_inbox_sources(p_owner,'') s left join public.pro_lead_outcomes o on o.owner_id=p_owner and o.kind=s.kind and o.lead_id=s.id
  where s.created_day between p_from and p_to and(p_channel is null or p_channel='unspecified' and s.channel_id is null or s.channel_id=p_channel)),
 reached as(select b.kind,b.id,greatest(coalesce(b.cur_pos,0),coalesce((select max(st.pos) from public.pro_lead_stage_spans sp join st on st.id=sp.stage_id where sp.owner_id=p_owner and sp.kind=b.kind and sp.lead_id=b.id),0),
   case when b.converted then(select pos from st where st.id='won') else 0 end) maxpos from base b),
 dur as(select sp.stage_id,extract(epoch from coalesce(sp.left_at,now())-sp.entered_at)/3600.0 hours,sp.left_at is null open from public.pro_lead_stage_spans sp join base b on b.kind=sp.kind and b.id=sp.lead_id where sp.owner_id=p_owner),
 stage_rows as(select st.id,st.pos,(select count(*) from reached r where r.maxpos>=st.pos) reached,(select count(*) from base where base.effective_stage=st.id) current,
   (select round(avg(hours)::numeric,1) from dur where dur.stage_id=st.id) avg_hours,(select round((percentile_cont(0.5) within group(order by hours))::numeric,1) from dur where dur.stage_id=st.id) median_hours,
   (select count(*) from dur where dur.stage_id=st.id and not dur.open) completed from st where not st.hidden),
 rows2 as(select r.*,lag(r.reached) over(order by r.pos) prev from stage_rows r)
 select jsonb_build_object('from',to_char(p_from,'YYYY-MM-DD'),'to',to_char(p_to,'YYYY-MM-DD'),'channel',p_channel,
  'received',(select count(*) from base),'won',(select count(*) from base where effective_stage='won' or outcome='won' or converted),'lost',(select count(*) from base where outcome='lost'),'converted',(select count(*) from base where converted),
  'observedSince',(select min(entered_at) from public.pro_lead_stage_spans where owner_id=p_owner and source<>'backfill'),
  'backfilled',(select count(*) from public.pro_lead_stage_spans sp join base b on b.kind=sp.kind and b.id=sp.lead_id where sp.owner_id=p_owner and sp.source='backfill'),
  'stages',coalesce((select jsonb_agg(jsonb_build_object('stageId',r.id,'reached',r.reached,'current',r.current,'avgHours',r.avg_hours,'medianHours',r.median_hours,'completedSpans',r.completed,
    'fromStart',case when(select count(*) from base)=0 then null else round(r.reached*100.0/(select count(*) from base),1) end,
    'fromPrevious',case when r.prev is null or r.prev=0 then null else round(r.reached*100.0/r.prev,1) end) order by r.pos) from rows2 r),'[]'::jsonb))
 into answer;
 return answer;
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in(
  'pro_lead_stage_immutable','pro_lead_stage_mark_center','pro_lead_stage_mark_request','pro_lead_stage_default_color','pro_lead_stage_default_probability','pro_lead_stage_settings',
  'pro_lead_stage_style_mutate','pro_lead_stage_observe','pro_lead_pipeline_converted','pro_lead_pipeline_read') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
commit;
notify pgrst,'reload schema';
