-- Pro family 29 (row 68): publish a finished job as a public portfolio case, with the customer's consent on record,
-- and commercial metrics of the public profile (views -> contacts -> requests -> won jobs).
-- Photos are NOT copied here: the browser downloads the chosen job photos through the authorized private reader and sends
-- them through the existing public upload pipeline (metadata stripping, scan, ownership record). This migration only
-- records the case, the consent evidence and the withdrawal. service_role only; functions security invoker.
begin;
create table if not exists public.pro_portfolio_publications(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,
 work_id text not null,case_id text not null check(length(case_id) between 1 and 80),
 profession text not null check(length(btrim(profession)) between 1 and 80),
 title text not null check(length(btrim(title)) between 1 and 120),
 consent_kind text not null check(consent_kind in('client_written','client_verbal','no_identifiable')),
 consent_note text not null default '' check(length(consent_note)<=300),
 consent_on date not null check(consent_on between date'2000-01-01' and date'2100-12-31'),
 photo_count integer not null check(photo_count between 1 and 5),
 status text not null default 'published' check(status in('published','withdrawn')),
 published_at timestamptz not null default clock_timestamp(),withdrawn_at timestamptz,
 primary key(owner_id,id),
 check((status='withdrawn')=(withdrawn_at is not null)),
 check(consent_kind='no_identifiable' or length(btrim(consent_note))>=3),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade
);
create unique index if not exists pro_portfolio_publications_one_active on public.pro_portfolio_publications(owner_id,work_id) where status='published';
create unique index if not exists pro_portfolio_publications_case on public.pro_portfolio_publications(owner_id,case_id);
alter table public.pro_portfolio_publications enable row level security;
revoke all on public.pro_portfolio_publications from public,anon,authenticated;

-- First five photos of the flattened cases: the legacy portfolio_urls CHECK (migration 025) allows at most five.
create or replace function public.pro_portfolio_urls(p_items jsonb) returns text[]
language sql immutable security invoker set search_path=public,pg_temp as $$
 select coalesce(array_agg(q.u order by q.o,q.po),'{}') from(
  select ph.u,i.o,ph.po from jsonb_array_elements(case when jsonb_typeof(p_items)='array' then p_items else '[]'::jsonb end) with ordinality i(item,o),
   lateral jsonb_array_elements_text(case when jsonb_typeof(i.item->'photos')='array' then i.item->'photos'
    when jsonb_typeof(i.item->'url')='string' then jsonb_build_array(i.item->>'url') else '[]'::jsonb end) with ordinality ph(u,po)
  order by i.o,ph.po limit 5) q $$;

create or replace function public.pro_portfolio_read(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare pro public.professionals;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into pro from public.professionals where profile_id=p_actor;
 return jsonb_build_object(
  'professions',case when pro.id is null then '[]'::jsonb else to_jsonb(coalesce(nullif(pro.professions,'{}'),case when pro.category_id is not null then array[pro.category_id] else '{}'::text[] end)) end,
  'hasProfile',pro.id is not null,
  'works',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'client',w.client,'service',w.service,'end',w."end",
    'publicationId',(select x.id from public.pro_portfolio_publications x where x.owner_id=w.user_id and x.work_id=w.id and x.status='published')) order by w."end" desc,w.id)
   from public.pro_work w where w.user_id=p_actor and w.stage='completed' and not w.cancelled),'[]'::jsonb),
  'publications',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'workId',x.work_id,'caseId',x.case_id,'profession',x.profession,'title',x.title,
    'consentKind',x.consent_kind,'consentNote',x.consent_note,'consentOn',x.consent_on,'photoCount',x.photo_count,'status',x.status,'publishedAt',x.published_at,'withdrawnAt',x.withdrawn_at)
    order by x.published_at desc) from public.pro_portfolio_publications x where x.owner_id=p_actor),'[]'::jsonb));
end $$;

create or replace function public.pro_portfolio_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare keys text[];act text;pro public.professionals;pub public.pro_portfolio_publications;w public.pro_work;pid uuid;
 photos jsonb;urls text[];case_json jsonb;items jsonb;profs text[];v_profession text;v_title text;v_kind text;v_note text;v_on date;n integer;removed jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid input' using errcode='22023';end if;
 act:=p_input->>'action';select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if jsonb_typeof(p_input->'id') is distinct from 'string' or not coalesce((p_input->>'id')~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',false) then raise exception 'Invalid id' using errcode='22023';end if;
 pid:=(p_input->>'id')::uuid;
 select * into pro from public.professionals where profile_id=p_actor for update;
 if pro.id is null then raise exception 'No public profile' using errcode='22023',hint='pro_portfolio_no_profile';end if;
 if act='publish' then
  if keys is distinct from array['action','consentKind','consentNote','consentOn','description','id','photos','profession','recipient','title','workId'] then raise exception 'Invalid fields' using errcode='22023';end if;
  select * into pub from public.pro_portfolio_publications where owner_id=p_actor and id=pid;
  if found then return jsonb_build_object('id',pub.id,'caseId',pub.case_id,'status',pub.status,'replayed',true);end if;
  select * into w from public.pro_work where user_id=p_actor and id=p_input->>'workId';
  if w.id is null then raise exception 'Job not found' using errcode='P0002';end if;
  if w.stage<>'completed' or w.cancelled then raise exception 'Only a finished job can be published' using errcode='22023',hint='pro_portfolio_not_finished';end if;
  if exists(select 1 from public.pro_portfolio_publications where owner_id=p_actor and work_id=w.id and status='published') then raise exception 'Already published' using errcode='23505';end if;
  v_profession:=btrim(coalesce(p_input->>'profession',''));
  profs:=coalesce(nullif(pro.professions,'{}'),case when pro.category_id is not null then array[pro.category_id] else '{}'::text[] end);
  if not v_profession=any(profs) then raise exception 'Profession is not one of yours' using errcode='22023',hint='pro_portfolio_profession';end if;
  v_title:=btrim(coalesce(p_input->>'title',''));if length(v_title) not between 1 and 120 then raise exception 'Invalid title' using errcode='22023';end if;
  if jsonb_typeof(p_input->'description') is distinct from 'string' or length(p_input->>'description')>600 or jsonb_typeof(p_input->'recipient') is distinct from 'string' or length(p_input->>'recipient')>120 then raise exception 'Invalid text' using errcode='22023';end if;
  v_kind:=p_input->>'consentKind';if v_kind is null or v_kind not in('client_written','client_verbal','no_identifiable') then raise exception 'Consent required' using errcode='22023',hint='pro_portfolio_consent';end if;
  v_note:=btrim(coalesce(p_input->>'consentNote',''));if length(v_note)>300 or v_kind<>'no_identifiable' and length(v_note)<3 then raise exception 'Consent note required' using errcode='22023',hint='pro_portfolio_consent';end if;
  if jsonb_typeof(p_input->'consentOn') is distinct from 'string' or not coalesce((p_input->>'consentOn')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$',false) then raise exception 'Invalid consent date' using errcode='22023';end if;
  v_on:=(p_input->>'consentOn')::date;if v_on>current_date+1 then raise exception 'Invalid consent date' using errcode='22023';end if;
  photos:=p_input->'photos';
  if jsonb_typeof(photos)<>'array' or jsonb_array_length(photos) not between 1 and 5 or exists(select 1 from jsonb_array_elements(photos) e where jsonb_typeof(e)<>'string' or (e#>>'{}')!~'^https://[^[:space:]]{1,500}$') then raise exception 'Invalid photos' using errcode='22023',hint='pro_portfolio_photos';end if;
  items:=case when jsonb_typeof(pro.portfolio_items)='array' then pro.portfolio_items else '[]'::jsonb end;
  select count(*) into n from jsonb_array_elements(items) i where i->>'profession'=v_profession;
  if n>=10 then raise exception 'Too many cases' using errcode='22023',hint='pro_portfolio_limit';end if;
  case_json:=jsonb_build_object('id','pro-'||pid::text,'profession',v_profession,'title',v_title,'description',btrim(p_input->>'description'),'recipient',btrim(p_input->>'recipient'),
   'date',to_char(w."end"::date,'YYYY-MM'),'photos',photos);
  items:=items||jsonb_build_array(case_json);
  update public.professionals set portfolio_items=items,portfolio_urls=public.pro_portfolio_urls(items) where id=pro.id;
  insert into public.pro_portfolio_publications(owner_id,id,work_id,case_id,profession,title,consent_kind,consent_note,consent_on,photo_count)
   values(p_actor,pid,w.id,'pro-'||pid::text,v_profession,v_title,v_kind,v_note,v_on,jsonb_array_length(photos));
  return jsonb_build_object('id',pid,'caseId','pro-'||pid::text,'status','published','replayed',false);
 elsif act='withdraw' then
  if keys is distinct from array['action','id'] then raise exception 'Invalid fields' using errcode='22023';end if;
  select * into pub from public.pro_portfolio_publications where owner_id=p_actor and id=pid for update;
  if pub.id is null then raise exception 'Not found' using errcode='P0002';end if;
  if pub.status='withdrawn' then return jsonb_build_object('id',pub.id,'status','withdrawn','removedPhotos','[]'::jsonb,'replayed',true);end if;
  items:=case when jsonb_typeof(pro.portfolio_items)='array' then pro.portfolio_items else '[]'::jsonb end;
  select coalesce(jsonb_agg(ph),'[]'::jsonb) into removed from jsonb_array_elements(items) i,jsonb_array_elements(case when jsonb_typeof(i->'photos')='array' then i->'photos' else '[]'::jsonb end) ph where i->>'id'=pub.case_id;
  select coalesce(jsonb_agg(i order by o),'[]'::jsonb) into items from jsonb_array_elements(items) with ordinality t(i,o) where i->>'id' is distinct from pub.case_id;
  update public.professionals set portfolio_items=items,portfolio_urls=public.pro_portfolio_urls(items) where id=pro.id;
  update public.pro_portfolio_publications set status='withdrawn',withdrawn_at=clock_timestamp() where owner_id=p_actor and id=pid;
  return jsonb_build_object('id',pid,'status','withdrawn','removedPhotos',removed,'replayed',false);
 end if;
 raise exception 'Invalid action' using errcode='22023';
end $$;

-- Commercial metrics of the public profile for the period: views and contacts come from the profile's interaction events
-- (own visits excluded by the existing capture), requests from the lead center, won jobs from jobs created from them.
create or replace function public.pro_profile_metrics_read(p_actor uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare pid uuid;v jsonb;l jsonb;series jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_from is null or p_to is null or p_from>p_to or p_to-p_from>730 then raise exception 'Invalid period' using errcode='22023';end if;
 select id into pid from public.professionals where profile_id=p_actor;
 if pid is null then return jsonb_build_object('hasProfile',false,'from',to_char(p_from,'YYYY-MM-DD'),'to',to_char(p_to,'YYYY-MM-DD'));end if;
 select jsonb_build_object('views',count(*) filter(where event_type='profile_view'),'visitors',count(distinct visitor_hash) filter(where event_type='profile_view'),
   'whatsapp',count(*) filter(where event_type='whatsapp_click'),'phone',count(*) filter(where event_type='phone_click'),'email',count(*) filter(where event_type='email_click'),
   'favorites',count(*) filter(where event_type='favorite_add'),'shares',count(*) filter(where event_type='profile_share'))
  into v from public.interaction_events e where e.professional_id=pid and (e.created_at at time zone 'America/Costa_Rica')::date between p_from and p_to;
 with leads as(
  select r.kind,r.id,(select m.work_id_text from public.pro_manual_lead_works m where m.owner_id=r.owner_id and m.lead_id=r.id and r.kind='manual'
     and exists(select 1 from public.pro_work w where w.user_id=m.owner_id and w.id=m.work_id_text and not w.cancelled)) manual_work,
   (select q.work_id from public.pro_appointment_requests q where q.owner_id=r.owner_id and q.id=r.request_id and r.kind='request'
     and q.work_id is not null and exists(select 1 from public.pro_work w where w.user_id=q.owner_id and w.id=q.work_id and not w.cancelled)) request_work
  from public.pro_lead_center_records r where r.owner_id=p_actor and not r.archived and (r.created_at at time zone 'America/Costa_Rica')::date between p_from and p_to),
 won as(select coalesce(manual_work,request_work) work_id from leads where coalesce(manual_work,request_work) is not null)
 select jsonb_build_object('requests',(select count(*) from leads),'won',(select count(*) from won),
  'agreedCents',coalesce((select sum((public.pro_work_account(p_actor,work_id)->>'agreedCents')::bigint) from won),0)) into l;
 select coalesce(jsonb_agg(jsonb_build_object('day',to_char(d.day,'YYYY-MM-DD'),
   'views',(select count(*) from public.interaction_events e where e.professional_id=pid and e.event_type='profile_view' and (e.created_at at time zone 'America/Costa_Rica')::date=d.day),
   'requests',(select count(*) from public.pro_lead_center_records r where r.owner_id=p_actor and not r.archived and (r.created_at at time zone 'America/Costa_Rica')::date=d.day)) order by d.day),'[]'::jsonb)
  into series from generate_series(p_from,least(p_to,p_from+89),interval '1 day') g(day0),lateral(select g.day0::date day) d;
 return jsonb_build_object('hasProfile',true,'from',to_char(p_from,'YYYY-MM-DD'),'to',to_char(p_to,'YYYY-MM-DD'),'profile',v,'leads',l,'series',series);
end $$;

revoke all on function public.pro_portfolio_urls(jsonb),public.pro_portfolio_read(uuid),public.pro_portfolio_mutate(uuid,jsonb),public.pro_profile_metrics_read(uuid,date,date) from public,anon,authenticated;
grant execute on function public.pro_portfolio_urls(jsonb),public.pro_portfolio_read(uuid),public.pro_portfolio_mutate(uuid,jsonb),public.pro_profile_metrics_read(uuid,date,date) to service_role;
commit;
notify pgrst,'reload schema';
