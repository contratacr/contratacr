-- LOCAL PRO ONLY. Round 6D (2026-11-13): ad / lead-capture tracking for professionals (row 70).
-- * Tracking campaigns with UTM parameters and a short code; the link points to the professional's website
--   (/sitio/<slug>?utm_…&cc=<code>) or public profile. Visits are counted per day (no personal data).
-- * Lead-source attribution: a website request with a campaign code is attributed to it (first touch, immutable)
--   and its lead in the existing lead center gets the matching origin channel (advertising / social / website).
--   The owner may attribute a manual lead to a campaign once.
-- * Cost entries per campaign are append-only; a mistake is corrected with a void entry (once per cost).
-- * The report uses ONLY real data of the account: leads (pro_lead_center_records), conversions
--   (pro_manual_lead_works with a live job) and the agreed/paid amounts of those jobs (pro_work_account), against
--   the costs the owner entered. No ad platform is called (Meta/Google adapters are documented stubs, inactive).
-- Tables: RLS on, service_role only; costs/attributions/history immutable; functions security invoker.
begin;
create table if not exists public.pro_ad_campaigns(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,
 name text not null check(length(btrim(name)) between 1 and 120),
 channel text not null check(channel in('meta','google','instagram','tiktok','whatsapp','email','print','radio','other')),
 landing text not null default 'site' check(landing in('site','profile')),
 code text not null check(code~'^[a-z0-9]{6,16}$'),
 utm_source text not null check(utm_source~'^[a-z0-9._-]{1,60}$'),utm_medium text not null check(utm_medium~'^[a-z0-9._-]{1,60}$'),
 utm_campaign text not null check(utm_campaign~'^[a-z0-9._-]{1,80}$'),utm_content text check(utm_content is null or utm_content~'^[a-z0-9._-]{1,80}$'),
 archived boolean not null default false,revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,id),unique(owner_id,code)
);
create table if not exists public.pro_ad_costs(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,campaign_id uuid not null,
 kind text not null check(kind in('cost','void')),void_of uuid,
 spent_on date not null check(spent_on between date'2000-01-01' and date'2100-12-31'),
 amount_cents bigint not null check(amount_cents between 1 and 100000000000),currency text not null default 'CRC' check(currency='CRC'),
 note text not null default '' check(length(note)<=300),created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,id),unique(owner_id,void_of),check((kind='void')=(void_of is not null)),
 foreign key(owner_id,campaign_id) references public.pro_ad_campaigns(owner_id,id) on delete cascade
);
create table if not exists public.pro_ad_visits(
 owner_id uuid not null references public.profiles(id) on delete cascade,campaign_id uuid not null,day date not null,
 visits integer not null default 0 check(visits>=0),primary key(owner_id,campaign_id,day),
 foreign key(owner_id,campaign_id) references public.pro_ad_campaigns(owner_id,id) on delete cascade
);
create table if not exists public.pro_lead_attributions(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 lead_kind text not null default 'manual' check(lead_kind='manual'),lead_id uuid not null,campaign_id uuid,
 source text not null check(source in('site_form','owner')),
 utm jsonb not null default '{}' check(jsonb_typeof(utm)='object' and octet_length(utm::text)<=1024),
 at timestamptz not null default clock_timestamp(),primary key(owner_id,lead_id),
 foreign key(owner_id,lead_kind,lead_id) references public.pro_lead_center_records(owner_id,kind,id) on delete cascade,
 foreign key(owner_id,campaign_id) references public.pro_ad_campaigns(owner_id,id) on delete cascade
);
create table if not exists public.pro_ad_actions(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input jsonb not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id)
);
create or replace function public.pro_ad_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Costs, attributions and receipts are immutable (void a cost instead)' using errcode='23514';end $$;
do $$declare t text;begin foreach t in array array['pro_ad_costs','pro_lead_attributions','pro_ad_actions'] loop
 execute format('drop trigger if exists %I on public.%I',t||'_immutable',t);
 execute format('create trigger %I before update on public.%I for each row execute function public.pro_ad_immutable()',t||'_immutable',t);
end loop;end $$;

create or replace function public.pro_ad_channel_origin(p_channel text) returns text
language sql immutable security invoker set search_path=public,pg_temp as $$
 select case when p_channel is null then 'website' when p_channel in('meta','google','print','radio') then 'advertising' when p_channel in('instagram','tiktok','whatsapp') then 'social' else 'other' end $$;
create or replace function public.pro_ad_campaign_json(k public.pro_ad_campaigns) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',k.id,'name',k.name,'channel',k.channel,'landing',k.landing,'code',k.code,'utm',jsonb_strip_nulls(jsonb_build_object('source',k.utm_source,'medium',k.utm_medium,'campaign',k.utm_campaign,'content',k.utm_content)),'archived',k.archived,'revision',k.revision,'createdAt',k.created_at) $$;
create or replace function public.pro_ad_cr_day(p_at timestamptz) returns date
language sql stable security invoker set search_path=public,pg_temp as $$ select (p_at at time zone 'America/Costa_Rica')::date $$;

-- Report from real data only. Conversion = an explicit, still valid lead→job link (same rule as the lead funnel).
create or replace function public.pro_ad_report(p_actor uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare rows jsonb;totals jsonb;
begin
 perform public.pro_mkt_owner(p_actor);
 if p_from is null or p_to is null or p_from>p_to or p_to-p_from>3660 then raise exception 'Invalid period' using errcode='22023';end if;
 with leads as materialized(
  select a.campaign_id,r.id lead_id,m.work_id_text work_id
  from public.pro_lead_attributions a join public.pro_lead_center_records r on r.owner_id=a.owner_id and r.kind='manual' and r.id=a.lead_id
  left join public.pro_manual_lead_works m on m.owner_id=a.owner_id and m.lead_id=a.lead_id
   and exists(select 1 from public.pro_work w where w.user_id=m.owner_id and w.id=m.work_id_text and w."clientId"=m.source_client_id and not w.cancelled)
  where a.owner_id=p_actor and public.pro_ad_cr_day(r.created_at) between p_from and p_to),
 money as(select l.*,(public.pro_work_account(p_actor,l.work_id)->>'agreedCents')::bigint agreed,(public.pro_work_account(p_actor,l.work_id)->>'paidCents')::bigint paid from leads l),
 keys as(select id campaign_id from public.pro_ad_campaigns where owner_id=p_actor union select null::uuid),
 per as(select k.campaign_id,
  coalesce((select sum(visits) from public.pro_ad_visits v where v.owner_id=p_actor and v.campaign_id=k.campaign_id and v.day between p_from and p_to),0)::bigint visits,
  (select count(*) from money m where m.campaign_id is not distinct from k.campaign_id)::bigint leads,
  (select count(*) from money m where m.campaign_id is not distinct from k.campaign_id and m.work_id is not null)::bigint converted,
  coalesce((select sum(agreed) from money m where m.campaign_id is not distinct from k.campaign_id and m.work_id is not null),0)::bigint agreed,
  coalesce((select sum(paid) from money m where m.campaign_id is not distinct from k.campaign_id and m.work_id is not null),0)::bigint paid,
  coalesce((select sum(case when c.kind='cost' then c.amount_cents else -c.amount_cents end) from public.pro_ad_costs c where c.owner_id=p_actor and c.campaign_id=k.campaign_id
    and (case when c.kind='cost' then c.spent_on else (select o.spent_on from public.pro_ad_costs o where o.owner_id=c.owner_id and o.id=c.void_of) end) between p_from and p_to),0)::bigint cost
  from keys k)
 select coalesce(jsonb_agg(jsonb_build_object('campaignId',p.campaign_id,'name',k.name,'channel',k.channel,'archived',coalesce(k.archived,false),'visits',p.visits,'leads',p.leads,'converted',p.converted,'agreedCents',p.agreed,'paidCents',p.paid,'costCents',p.cost,
   'costPerLeadCents',case when p.leads>0 and p.cost>0 then round(p.cost::numeric/p.leads)::bigint end,
   'roiBps',case when p.cost>0 then round((p.agreed-p.cost)::numeric*10000/p.cost)::bigint end) order by k.created_at nulls last),'[]'),
  jsonb_build_object('visits',sum(p.visits),'leads',sum(p.leads),'converted',sum(p.converted),'agreedCents',sum(p.agreed),'paidCents',sum(p.paid),'costCents',sum(p.cost),
   'costPerLeadCents',case when sum(p.leads)>0 and sum(p.cost)>0 then round(sum(p.cost)/sum(p.leads))::bigint end,'roiBps',case when sum(p.cost)>0 then round((sum(p.agreed)-sum(p.cost))*10000/sum(p.cost))::bigint end)
 into rows,totals from per p left join public.pro_ad_campaigns k on k.owner_id=p_actor and k.id=p.campaign_id
 where p.campaign_id is not null or p.leads>0;
 return jsonb_build_object('from',to_char(p_from,'YYYY-MM-DD'),'to',to_char(p_to,'YYYY-MM-DD'),'rows',rows,'totals',totals);
end $$;
create or replace function public.pro_ad_read(p_actor uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 perform public.pro_mkt_owner(p_actor);
 return jsonb_build_object(
  'campaigns',coalesce((select jsonb_agg(public.pro_ad_campaign_json(k) order by k.created_at) from public.pro_ad_campaigns k where k.owner_id=p_actor),'[]'),
  'costs',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'campaignId',c.campaign_id,'kind',c.kind,'voidOf',c.void_of,'spentOn',to_char(c.spent_on,'YYYY-MM-DD'),'amountCents',c.amount_cents,'note',c.note,'createdAt',c.created_at,
    'voided',exists(select 1 from public.pro_ad_costs v where v.owner_id=c.owner_id and v.void_of=c.id)) order by c.created_at desc) from (select * from public.pro_ad_costs where owner_id=p_actor order by created_at desc limit 200) c),'[]'),
  'unattributed',coalesce((select jsonb_agg(jsonb_build_object('leadId',r.id,'title',r.title,'createdAt',r.created_at) order by r.created_at desc) from (select * from public.pro_lead_center_records r where r.owner_id=p_actor and r.kind='manual' and not r.archived
    and not exists(select 1 from public.pro_lead_attributions a where a.owner_id=r.owner_id and a.lead_id=r.id) order by r.created_at desc limit 50) r),'[]'),
  'site',(select jsonb_build_object('slug',s.slug,'published',s.published_version is not null) from public.pro_sites s where s.owner_id=p_actor),
  'profileSlug',(select slug from public.professionals where profile_id=p_actor),
  'report',public.pro_ad_report(p_actor,p_from,p_to));
end $$;
create or replace function public.pro_ad_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';aid uuid;receipt public.pro_ad_actions;result jsonb;rid uuid;rev integer;k public.pro_ad_campaigns;cost public.pro_ad_costs;slugged text;src text;med text;
begin
 perform public.pro_mkt_owner(p_actor);
 if jsonb_typeof(p_input)<>'object' or act not in('campaign_save','campaign_archive','cost_add','cost_void','attribute') then raise exception 'Invalid tracking action' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;rid:=(p_input->>'id')::uuid;exception when others then raise exception 'Invalid ids' using errcode='22023';end;
 if aid is null then raise exception 'Missing action id' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-ads:'||p_actor::text,0));
 select * into receipt from public.pro_ad_actions where owner_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result;end if;
 rev:=case when jsonb_typeof(p_input->'revision')='number' then (p_input->>'revision')::integer else null end;
 if act in('campaign_save','campaign_archive') then
  select * into k from public.pro_ad_campaigns where owner_id=p_actor and id=rid for update;
  if coalesce(k.revision,0)<>rev then raise exception 'Campaign changed' using errcode='40001';end if;
  if act='campaign_archive' then
   if not found then raise exception 'Campaign unavailable' using errcode='P0002';end if;
   update public.pro_ad_campaigns set archived=not archived,revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor and id=rid returning * into k;
  else
   slugged:=left(trim(both '-' from regexp_replace(lower(translate(btrim(p_input->>'name'),'áéíóúüñÁÉÍÓÚÜÑ','aeiouunAEIOUUN')),'[^a-z0-9]+','-','g')),80);
   src:=coalesce(nullif(lower(btrim(p_input->>'utmSource')),''),case p_input->>'channel' when 'meta' then 'facebook' when 'google' then 'google' when 'instagram' then 'instagram' when 'tiktok' then 'tiktok' when 'whatsapp' then 'whatsapp' when 'email' then 'email' when 'print' then 'impreso' when 'radio' then 'radio' else 'otro' end);
   med:=coalesce(nullif(lower(btrim(p_input->>'utmMedium')),''),case p_input->>'channel' when 'meta' then 'cpc' when 'google' then 'cpc' when 'email' then 'email' when 'print' then 'offline' when 'radio' then 'offline' else 'social' end);
   if not found then
    insert into public.pro_ad_campaigns(owner_id,id,name,channel,landing,code,utm_source,utm_medium,utm_campaign,utm_content)
    values(p_actor,rid,btrim(p_input->>'name'),p_input->>'channel',coalesce(p_input->>'landing','site'),substr(md5(p_actor::text||rid::text),1,8),src,med,coalesce(nullif(lower(btrim(p_input->>'utmCampaign')),''),nullif(slugged,''),'campana'),nullif(lower(btrim(coalesce(p_input->>'utmContent',''))),''))
    returning * into k;
   else
    update public.pro_ad_campaigns set name=btrim(p_input->>'name'),channel=p_input->>'channel',landing=coalesce(p_input->>'landing','site'),utm_source=src,utm_medium=med,
     utm_campaign=coalesce(nullif(lower(btrim(p_input->>'utmCampaign')),''),nullif(slugged,''),'campana'),utm_content=nullif(lower(btrim(coalesce(p_input->>'utmContent',''))),''),revision=revision+1,updated_at=clock_timestamp()
    where owner_id=p_actor and id=rid returning * into k;
   end if;
  end if;
  result:=jsonb_build_object('action',act,'campaign',public.pro_ad_campaign_json(k));
 elsif act='cost_add' then
  if not exists(select 1 from public.pro_ad_campaigns where owner_id=p_actor and id=(p_input->>'campaignId')::uuid) then raise exception 'Campaign unavailable' using errcode='P0002';end if;
  insert into public.pro_ad_costs(owner_id,id,campaign_id,kind,spent_on,amount_cents,note) values(p_actor,rid,(p_input->>'campaignId')::uuid,'cost',(p_input->>'spentOn')::date,(p_input->>'amountCents')::bigint,left(coalesce(p_input->>'note',''),300)) returning * into cost;
  result:=jsonb_build_object('action',act,'costId',cost.id);
 elsif act='cost_void' then
  select * into cost from public.pro_ad_costs where owner_id=p_actor and id=(p_input->>'costId')::uuid and kind='cost';
  if not found then raise exception 'Cost unavailable' using errcode='P0002';end if;
  if exists(select 1 from public.pro_ad_costs where owner_id=p_actor and void_of=cost.id) then raise exception 'Already voided' using errcode='40001';end if;
  insert into public.pro_ad_costs(owner_id,id,campaign_id,kind,void_of,spent_on,amount_cents,note) values(p_actor,rid,cost.campaign_id,'void',cost.id,current_date,cost.amount_cents,left(coalesce(p_input->>'note',''),300));
  result:=jsonb_build_object('action',act,'costId',rid);
 else
  if not exists(select 1 from public.pro_lead_center_records where owner_id=p_actor and kind='manual' and id=(p_input->>'leadId')::uuid) then raise exception 'Lead unavailable' using errcode='P0002';end if;
  if not exists(select 1 from public.pro_ad_campaigns where owner_id=p_actor and id=(p_input->>'campaignId')::uuid) then raise exception 'Campaign unavailable' using errcode='P0002';end if;
  if exists(select 1 from public.pro_lead_attributions where owner_id=p_actor and lead_id=(p_input->>'leadId')::uuid) then raise exception 'Lead already attributed' using errcode='40001';end if;
  insert into public.pro_lead_attributions(owner_id,lead_id,campaign_id,source) values(p_actor,(p_input->>'leadId')::uuid,(p_input->>'campaignId')::uuid,'owner');
  result:=jsonb_build_object('action',act,'leadId',p_input->>'leadId','campaignId',p_input->>'campaignId');
 end if;
 insert into public.pro_ad_actions(owner_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

do $$declare n text;begin foreach n in array array['pro_ad_campaigns','pro_ad_costs','pro_ad_visits','pro_lead_attributions','pro_ad_actions'] loop
 execute format('alter table public.%I enable row level security',n);execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);execute format('grant select,insert,update on public.%I to service_role',n);
end loop;end $$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'pro\_ad\_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  if f::text not like 'pro_ad_immutable(%' then execute format('grant execute on function %s to service_role',f);end if;
 end loop;end $$;
notify pgrst,'reload schema';
commit;
