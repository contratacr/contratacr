-- Pro 29 (row 70): ad campaign builder with SANDBOX publishing and SIMULATED metrics.
-- A build is the owner's plan for a Meta or Google ad: segment (province/canton, service), budget, dates, creative and the
-- tracking campaign (UTM + code) its link uses. Nothing here calls an ad platform or spends money: «publicada en sandbox»
-- stores a fictitious platform reference given by the mock adapter. Simulated daily metrics live in their OWN table, flagged
-- simulated, and never touch pro_ad_costs / pro_ad_visits / pro_ad_report (those keep real data only). service_role only.
begin;
create table if not exists public.pro_ad_builds(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,
 name text not null check(length(btrim(name)) between 1 and 120),
 platform text not null check(platform in('meta','google')),
 objective text not null check(objective in('leads','traffic','calls')),
 province text not null default '' check(length(province)<=40),
 canton text not null default '' check(length(canton)<=60),
 service text not null default '' check(length(service)<=120),
 daily_budget_cents bigint not null check(daily_budget_cents between 100 and 100000000000),
 total_budget_cents bigint not null check(total_budget_cents between 100 and 100000000000),
 start_on date not null check(start_on between date'2000-01-01' and date'2100-12-31'),
 end_on date not null check(end_on between date'2000-01-01' and date'2100-12-31'),
 headline text not null default '' check(length(headline)<=90),
 body text not null default '' check(length(body)<=500),
 image_url text check(image_url is null or (image_url~'^https://' and length(image_url)<=500)),
 tracking_campaign_id uuid,
 status text not null default 'draft' check(status in('draft','review','sandbox_published','paused','ended')),
 platform_ref text check(platform_ref is null or platform_ref~'^sbx_[a-z]+_[a-z0-9]{6,40}$'),
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,id),
 check(end_on>=start_on),check(daily_budget_cents<=total_budget_cents),
 check((status in('sandbox_published','paused','ended'))=(platform_ref is not null)),
 foreign key(owner_id,tracking_campaign_id) references public.pro_ad_campaigns(owner_id,id) on delete set null(tracking_campaign_id)
);
create table if not exists public.pro_ad_sim_metrics(
 owner_id uuid not null,build_id uuid not null,day date not null,
 impressions integer not null check(impressions between 0 and 100000000),clicks integer not null check(clicks between 0 and 100000000),
 spend_cents bigint not null check(spend_cents between 0 and 100000000000),
 simulated boolean not null default true check(simulated),
 primary key(owner_id,build_id,day),check(clicks<=impressions),
 foreign key(owner_id,build_id) references public.pro_ad_builds(owner_id,id) on delete cascade
);
alter table public.pro_ad_builds enable row level security;
alter table public.pro_ad_sim_metrics enable row level security;

create or replace function public.pro_adb_json(b public.pro_ad_builds) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',b.id,'name',b.name,'platform',b.platform,'objective',b.objective,'province',b.province,'canton',b.canton,'service',b.service,
  'dailyBudgetCents',b.daily_budget_cents,'totalBudgetCents',b.total_budget_cents,'startOn',to_char(b.start_on,'YYYY-MM-DD'),'endOn',to_char(b.end_on,'YYYY-MM-DD'),
  'headline',b.headline,'body',b.body,'imageUrl',b.image_url,'trackingCampaignId',b.tracking_campaign_id,'status',b.status,'platformRef',b.platform_ref,
  'revision',b.revision,'updatedAt',b.updated_at) $$;

create or replace function public.pro_adb_read(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_object(
  'builds',coalesce((select jsonb_agg(public.pro_adb_json(b)||jsonb_build_object('simulated',jsonb_build_object(
     'impressions',coalesce((select sum(m.impressions) from public.pro_ad_sim_metrics m where m.owner_id=b.owner_id and m.build_id=b.id),0),
     'clicks',coalesce((select sum(m.clicks) from public.pro_ad_sim_metrics m where m.owner_id=b.owner_id and m.build_id=b.id),0),
     'spendCents',coalesce((select sum(m.spend_cents) from public.pro_ad_sim_metrics m where m.owner_id=b.owner_id and m.build_id=b.id),0),
     'days',(select count(*) from public.pro_ad_sim_metrics m where m.owner_id=b.owner_id and m.build_id=b.id))) order by b.created_at desc)
    from public.pro_ad_builds b where b.owner_id=p_actor),'[]'::jsonb),
  'campaigns',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'code',c.code) order by c.created_at) from public.pro_ad_campaigns c where c.owner_id=p_actor and not c.archived),'[]'::jsonb));
end $$;

-- One writer for every transition. Edits only in draft (revision CAS); the platform reference comes from the mock adapter.
create or replace function public.pro_adb_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;b public.pro_ad_builds;rev integer;bid uuid;r jsonb;spent bigint;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid input' using errcode='22023';end if;
 act:=p_input->>'action';
 if jsonb_typeof(p_input->'id') is distinct from 'string' or not (p_input->>'id')~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Invalid id' using errcode='22023';end if;
 bid:=(p_input->>'id')::uuid;
 if jsonb_typeof(p_input->'revision') is distinct from 'number' or not (p_input->>'revision')~'^[0-9]{1,9}$' then raise exception 'Invalid revision' using errcode='22023';end if;
 rev:=(p_input->>'revision')::integer;
 if act='save' then
  if rev=0 then
   insert into public.pro_ad_builds(owner_id,id,name,platform,objective,province,canton,service,daily_budget_cents,total_budget_cents,start_on,end_on,headline,body,image_url,tracking_campaign_id)
   values(p_actor,bid,btrim(p_input->>'name'),p_input->>'platform',p_input->>'objective',coalesce(p_input->>'province',''),coalesce(p_input->>'canton',''),coalesce(p_input->>'service',''),
    (p_input->>'dailyBudgetCents')::bigint,(p_input->>'totalBudgetCents')::bigint,(p_input->>'startOn')::date,(p_input->>'endOn')::date,coalesce(p_input->>'headline',''),coalesce(p_input->>'body',''),
    nullif(p_input->>'imageUrl',''),nullif(p_input->>'trackingCampaignId','')::uuid) returning * into b;
   return public.pro_adb_json(b);
  end if;
  update public.pro_ad_builds set name=btrim(p_input->>'name'),platform=p_input->>'platform',objective=p_input->>'objective',province=coalesce(p_input->>'province',''),canton=coalesce(p_input->>'canton',''),
   service=coalesce(p_input->>'service',''),daily_budget_cents=(p_input->>'dailyBudgetCents')::bigint,total_budget_cents=(p_input->>'totalBudgetCents')::bigint,start_on=(p_input->>'startOn')::date,
   end_on=(p_input->>'endOn')::date,headline=coalesce(p_input->>'headline',''),body=coalesce(p_input->>'body',''),image_url=nullif(p_input->>'imageUrl',''),tracking_campaign_id=nullif(p_input->>'trackingCampaignId','')::uuid,
   revision=revision+1,updated_at=clock_timestamp()
   where owner_id=p_actor and id=bid and revision=rev and status='draft' returning * into b;
  if not found then raise exception 'Stale or locked build' using errcode='40001';end if;
  return public.pro_adb_json(b);
 end if;
 select * into b from public.pro_ad_builds where owner_id=p_actor and id=bid for update;
 if not found then raise exception 'Build not found' using errcode='P0002';end if;
 if b.revision<>rev then raise exception 'Stale build' using errcode='40001';end if;
 if act='submit' then
  if b.status<>'draft' then raise exception 'Invalid transition' using errcode='40001';end if;
  if length(btrim(b.headline))=0 or length(btrim(b.body))=0 or b.tracking_campaign_id is null then raise exception 'Incomplete creative' using errcode='22023';end if;
  update public.pro_ad_builds set status='review',revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor and id=bid returning * into b;
 elsif act='back_to_draft' then
  if b.status<>'review' then raise exception 'Invalid transition' using errcode='40001';end if;
  update public.pro_ad_builds set status='draft',revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor and id=bid returning * into b;
 elsif act='publish_sandbox' then
  if b.status<>'review' then raise exception 'Invalid transition' using errcode='40001';end if;
  if jsonb_typeof(p_input->'platformRef') is distinct from 'string' or not (p_input->>'platformRef')~'^sbx_[a-z]+_[a-z0-9]{6,40}$' then raise exception 'Invalid platform reference' using errcode='22023';end if;
  update public.pro_ad_builds set status='sandbox_published',platform_ref=p_input->>'platformRef',revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor and id=bid returning * into b;
 elsif act='pause' then
  if b.status<>'sandbox_published' then raise exception 'Invalid transition' using errcode='40001';end if;
  update public.pro_ad_builds set status='paused',revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor and id=bid returning * into b;
 elsif act='resume' then
  if b.status<>'paused' then raise exception 'Invalid transition' using errcode='40001';end if;
  update public.pro_ad_builds set status='sandbox_published',revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor and id=bid returning * into b;
 elsif act='end' then
  if b.status not in('sandbox_published','paused') then raise exception 'Invalid transition' using errcode='40001';end if;
  update public.pro_ad_builds set status='ended',revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor and id=bid returning * into b;
 elsif act='simulate' then
  if b.status not in('sandbox_published','paused','ended') then raise exception 'Invalid transition' using errcode='40001';end if;
  if jsonb_typeof(p_input->'rows') is distinct from 'array' or jsonb_array_length(p_input->'rows') not between 1 and 370 then raise exception 'Invalid rows' using errcode='22023';end if;
  for r in select value from jsonb_array_elements(p_input->'rows') loop
   if (r->>'day')::date not between b.start_on and b.end_on or (r->>'spendCents')::bigint>b.daily_budget_cents then raise exception 'Row out of plan' using errcode='22023';end if;
   insert into public.pro_ad_sim_metrics(owner_id,build_id,day,impressions,clicks,spend_cents)
   values(p_actor,bid,(r->>'day')::date,(r->>'impressions')::integer,(r->>'clicks')::integer,(r->>'spendCents')::bigint)
   on conflict(owner_id,build_id,day) do update set impressions=excluded.impressions,clicks=excluded.clicks,spend_cents=excluded.spend_cents;
  end loop;
  select coalesce(sum(spend_cents),0) into spent from public.pro_ad_sim_metrics where owner_id=p_actor and build_id=bid;
  if spent>b.total_budget_cents then raise exception 'Total budget exceeded' using errcode='22023';end if;
 else raise exception 'Invalid action' using errcode='22023';end if;
 return public.pro_adb_json(b);
end $$;
do $$declare f text;begin foreach f in array array['pro_adb_json(public.pro_ad_builds)','pro_adb_read(uuid)','pro_adb_mutate(uuid,jsonb)'] loop
 execute format('revoke all on function public.%s from public,anon,authenticated',f);execute format('grant execute on function public.%s to service_role',f);end loop;end $$;
notify pgrst,'reload schema';
commit;
