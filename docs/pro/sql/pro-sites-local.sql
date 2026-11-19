-- LOCAL PRO ONLY. Round 6D (2026-11-13): website builder for professionals (row 69).
-- * One site per owner: slug (served locally at /sitio/<slug>), theme preset, DRAFT content (sections: hero,
--   services, portfolio, reviews, service area, contact form) with CAS revision and idempotent actionId.
-- * Publish freezes the draft into an immutable numbered VERSION (no UPDATE; no DELETE grant). The public reader
--   only ever returns the latest published version: draft edits are invisible until the next publish; an
--   unpublished site returns nothing. Portfolio photos must come from the owner's own ContrataCR profile.
-- * Reviews shown are the professional's PUBLISHED ContrataCR reviews (moderation_status='published'), read live,
--   reviewer reduced to first name + initial. No owner id, email or internal ids are exposed.
-- * The contact/project request form creates a customer + a lead in the existing lead center (through
--   pro_lead_origin_create, origin channel website/advertising/social), attributes it to the tracking campaign
--   (ads-tracking-local.sql) and records marketing consent ONLY when the visitor ticked it (email-marketing-local.sql).
-- * Custom domains: only stored as a pending request; the site_domain provider (Cloudflare for SaaS) is inactive.
-- Tables: RLS on, service_role only; versions/history/receipts immutable; functions security invoker.
begin;
create table if not exists public.pro_sites(
 owner_id uuid primary key references public.profiles(id) on delete cascade,
 slug text not null unique check(slug~'^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$' and slug not in('baja','preview','admin','api','sitio')),
 theme text not null default 'contratacr' check(theme in('contratacr','cielo','noche','arena')),
 draft jsonb not null check(jsonb_typeof(draft)='object' and octet_length(draft::text)<=65536),
 custom_domain text check(custom_domain is null or custom_domain~'^([a-z0-9-]{1,63}\.)+[a-z]{2,24}$'),
 revision integer not null default 1 check(revision>0),
 published_version integer check(published_version is null or published_version>0),
 published_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 check((published_version is null)=(published_at is null))
);
create table if not exists public.pro_site_versions(
 owner_id uuid not null references public.pro_sites(owner_id) on delete cascade,
 version integer not null check(version>0),slug text not null,theme text not null,
 content jsonb not null check(jsonb_typeof(content)='object' and octet_length(content::text)<=65536),
 content_hash text not null check(content_hash~'^[a-f0-9]{64}$'),
 action_id uuid not null,published_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,version)
);
create table if not exists public.pro_site_actions(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input jsonb not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id)
);
create table if not exists public.pro_site_history(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 action text not null check(action in('save','publish','unpublish','domain')),revision integer not null,version integer,
 at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id)
);
create table if not exists public.pro_site_submissions(
 owner_id uuid not null references public.profiles(id) on delete cascade,submission_id uuid not null,
 version integer not null,input_hash text not null check(input_hash~'^[a-f0-9]{64}$'),
 lead_id uuid not null,client_id text not null,campaign_id uuid,marketing_consent boolean not null,
 result jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(owner_id,submission_id)
);
create or replace function public.pro_site_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Published versions, history and receipts are immutable' using errcode='23514';end $$;
do $$declare t text;begin foreach t in array array['pro_site_versions','pro_site_actions','pro_site_history','pro_site_submissions'] loop
 execute format('drop trigger if exists %I on public.%I',t||'_immutable',t);
 execute format('create trigger %I before update on public.%I for each row execute function public.pro_site_immutable()',t||'_immutable',t);
end loop;end $$;

-- ---------------------------------------------------------------- profile data the editor may reuse
-- plpgsql (not sql) so the body is resolved at call time: the offline PGlite check has no profile/review columns.
create or replace function public.pro_site_photos(p_owner uuid) returns text[]
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin return (
 with p as(select * from public.professionals where profile_id=p_owner),
 urls as(
  select unnest(coalesce(p.portfolio_urls,'{}')) u from p
  union all select i->>'url' from p,jsonb_array_elements(case when jsonb_typeof(p.portfolio_items)='array' then p.portfolio_items else '[]' end) i where jsonb_typeof(i)='object'
  union all select case when jsonb_typeof(ph)='string' then ph#>>'{}' else ph->>'url' end from p,jsonb_array_elements(case when jsonb_typeof(p.portfolio_items)='array' then p.portfolio_items else '[]' end) i,
   jsonb_array_elements(case when jsonb_typeof(i)='object' and jsonb_typeof(i->'photos')='array' then i->'photos' else '[]' end) ph
  union all select s->>'imageUrl' from p,jsonb_array_elements(case when jsonb_typeof(p.services)='array' then p.services else '[]' end) s where jsonb_typeof(s)='object')
 select coalesce(array_agg(distinct u) filter(where u~'^https://[^\s"<>]+$' and length(u) between 12 and 1000),'{}') from urls
);end $$;
create or replace function public.pro_site_profile(p_owner uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin return (
 select jsonb_build_object('businessName',coalesce(nullif(btrim(p.business_name),''),f.full_name),'profileSlug',p.slug,'bio',left(coalesce(p.bio,''),600),
  'services',coalesce((select jsonb_agg(jsonb_build_object('name',left(s->>'name',120),'description',left(coalesce(s->>'description',''),400))) from jsonb_array_elements(case when jsonb_typeof(p.services)='array' then p.services else '[]' end) s where jsonb_typeof(s)='object' and coalesce(btrim(s->>'name'),'')<>''),'[]'),
  'photos',to_jsonb(public.pro_site_photos(p_owner)),
  'area',jsonb_build_object('provincia',(select name from public.provincias where id=p.provincia_id),'canton',(select name from public.cantones where id=p.canton_id)),
  'rating',jsonb_build_object('average',p.rating_avg,'count',p.review_count))
 from public.profiles f left join public.professionals p on p.profile_id=f.id where f.id=p_owner
);end $$;
create or replace function public.pro_site_reviews(p_owner uuid,p_max integer) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin return (
 select coalesce(jsonb_agg(jsonb_build_object('rating',r.rating,'comment',left(r.comment,600),'name',r.who,'date',to_char(r.created_at at time zone 'America/Costa_Rica','YYYY-MM-DD')) order by r.created_at desc),'[]')
 from (select v.rating,v.comment,v.created_at,
   btrim(split_part(btrim(coalesce(nullif(v.client_name_snapshot,''),c.full_name,'Cliente')),' ',1)||coalesce(' '||nullif(left(split_part(btrim(coalesce(nullif(v.client_name_snapshot,''),c.full_name,'')),' ',2),1),'')||'.','')) who
  from public.reviews v join public.professionals p on p.id=v.professional_id left join public.profiles c on c.id=v.client_id
  where p.profile_id=p_owner and v.moderation_status='published' and length(btrim(v.comment))>0 order by v.created_at desc limit greatest(least(coalesce(p_max,6),12),0)) r
);end $$;

-- Draft shape checked here (the route validates every field with zod first).
create or replace function public.pro_site_content_ok(p_content jsonb) returns boolean
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare s jsonb;
begin
 if jsonb_typeof(p_content)<>'object' or jsonb_typeof(p_content->'sections')<>'array' or jsonb_array_length(p_content->'sections') not between 1 and 12
  or coalesce(length(p_content->>'title'),0) not between 1 and 70 or coalesce(length(p_content->>'description'),0) not between 1 and 170 then return false;end if;
 for s in select * from jsonb_array_elements(p_content->'sections') loop
  if jsonb_typeof(s)<>'object' or s->>'type' not in('hero','services','portfolio','reviews','area','contact') or jsonb_typeof(s->'enabled')<>'boolean' then return false;end if;
 end loop;
 return (select count(distinct x->>'type')=count(*) from jsonb_array_elements(p_content->'sections') x);
end $$;
create or replace function public.pro_site_section(p_content jsonb,p_type text) returns jsonb
language sql immutable security invoker set search_path=public,pg_temp as $$
 select x from jsonb_array_elements(p_content->'sections') x where x->>'type'=p_type and (x->>'enabled')::boolean limit 1 $$;
/** What a visitor (or the owner's preview) receives. Only names a visitor may see: no owner id, email or ids. */
create or replace function public.pro_site_resolve(p_owner uuid,p_slug text,p_theme text,p_content jsonb,p_version integer,p_published timestamptz) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('slug',p_slug,'theme',p_theme,'version',p_version,'publishedAt',p_published,'content',p_content,
  'business',(public.pro_site_profile(p_owner)->>'businessName'),'profileSlug',(public.pro_site_profile(p_owner)->>'profileSlug'),
  'rating',public.pro_site_profile(p_owner)->'rating',
  'reviews',case when public.pro_site_section(p_content,'reviews') is null then '[]'::jsonb else public.pro_site_reviews(p_owner,coalesce((public.pro_site_section(p_content,'reviews')->>'max')::int,6)) end,
  'campaigns',coalesce((select jsonb_agg(k.code) from public.pro_ad_campaigns k where k.owner_id=p_owner and not k.archived and k.landing='site'),'[]')) $$;

-- ---------------------------------------------------------------- owner read / mutate
create or replace function public.pro_site_read(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare s public.pro_sites;
begin
 perform public.pro_mkt_owner(p_actor);
 select * into s from public.pro_sites where owner_id=p_actor;
 return jsonb_build_object('site',case when s.owner_id is null then null else jsonb_build_object('slug',s.slug,'theme',s.theme,'draft',s.draft,'customDomain',s.custom_domain,'revision',s.revision,'publishedVersion',s.published_version,'publishedAt',s.published_at,'updatedAt',s.updated_at,
   'draftChanged',s.published_version is null or s.draft is distinct from (select v.content from public.pro_site_versions v where v.owner_id=p_actor and v.version=s.published_version) or s.theme is distinct from (select v.theme from public.pro_site_versions v where v.owner_id=p_actor and v.version=s.published_version)) end,
  'versions',coalesce((select jsonb_agg(jsonb_build_object('version',v.version,'slug',v.slug,'theme',v.theme,'publishedAt',v.published_at,'contentHash',v.content_hash) order by v.version desc) from public.pro_site_versions v where v.owner_id=p_actor),'[]'),
  'profile',public.pro_site_profile(p_actor),
  'submissions',(select count(*) from public.pro_site_submissions where owner_id=p_actor),
  'preview',case when s.owner_id is null then null else public.pro_site_resolve(p_actor,s.slug,s.theme,s.draft,null,null) end);
end $$;
create or replace function public.pro_site_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text:=p_input->>'action';aid uuid;receipt public.pro_site_actions;s public.pro_sites;rev integer;ver integer;result jsonb;photo text;allowed text[];
begin
 perform public.pro_mkt_owner(p_actor);
 if jsonb_typeof(p_input)<>'object' or act not in('save','publish','unpublish','domain') or jsonb_typeof(p_input->'revision')<>'number' then raise exception 'Invalid site action' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid action id' using errcode='22023';end;
 if aid is null then raise exception 'Missing action id' using errcode='22023';end if;
 rev:=(p_input->>'revision')::integer;
 perform pg_advisory_xact_lock(hashtextextended('pro-site:'||p_actor::text,0));
 select * into receipt from public.pro_site_actions where owner_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result;end if;
 select * into s from public.pro_sites where owner_id=p_actor for update;
 if coalesce(s.revision,0)<>rev then raise exception 'Site changed' using errcode='40001';end if;
 if act='save' then
  if not public.pro_site_content_ok(p_input->'content') then raise exception 'Invalid site content' using errcode='22023';end if;
  if not found then insert into public.pro_sites(owner_id,slug,theme,draft) values(p_actor,p_input->>'slug',coalesce(p_input->>'theme','contratacr'),p_input->'content') returning * into s;
  else update public.pro_sites set slug=p_input->>'slug',theme=coalesce(p_input->>'theme','contratacr'),draft=p_input->'content',revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor returning * into s;end if;
 else
  if not found then raise exception 'Save the site first' using errcode='P0002';end if;
  if act='publish' then
   allowed:=public.pro_site_photos(p_actor);
   for photo in select jsonb_array_elements_text(coalesce(public.pro_site_section(s.draft,'portfolio')->'photos','[]')) loop
    if not photo=any(allowed) then raise exception 'Portfolio photos must come from your ContrataCR profile' using errcode='22023',hint='pro_site_foreign_photo';end if;
   end loop;
   ver:=coalesce((select max(version) from public.pro_site_versions where owner_id=p_actor),0)+1;
   insert into public.pro_site_versions(owner_id,version,slug,theme,content,content_hash,action_id) values(p_actor,ver,s.slug,s.theme,s.draft,encode(sha256(convert_to(s.draft::text,'UTF8')),'hex'),aid);
   update public.pro_sites set published_version=ver,published_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor returning * into s;
  elsif act='unpublish' then
   if s.published_version is null then raise exception 'Not published' using errcode='40001';end if;
   update public.pro_sites set published_version=null,published_at=null,revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor returning * into s;
  else
   update public.pro_sites set custom_domain=nullif(lower(btrim(coalesce(p_input->>'customDomain',''))),''),revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor returning * into s;
  end if;
 end if;
 insert into public.pro_site_history(owner_id,action_id,action,revision,version) values(p_actor,aid,act,s.revision,ver);
 result:=jsonb_build_object('action',act,'revision',s.revision,'slug',s.slug,'publishedVersion',s.published_version,'version',ver);
 insert into public.pro_site_actions(owner_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ---------------------------------------------------------------- public (slug only)
create or replace function public.pro_site_public(p_slug text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare s public.pro_sites;v public.pro_site_versions;
begin
 select * into s from public.pro_sites where slug=p_slug and published_version is not null;
 if not found or not coalesce(public.pro_private_work_tools_enabled(s.owner_id),false) then return null;end if;
 select * into v from public.pro_site_versions where owner_id=s.owner_id and version=s.published_version;
 return public.pro_site_resolve(s.owner_id,v.slug,v.theme,v.content,v.version,v.published_at);
end $$;
create or replace function public.pro_site_published_slugs() returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('slug',s.slug,'publishedAt',s.published_at) order by s.slug),'[]') from public.pro_sites s where s.published_version is not null and coalesce(public.pro_private_work_tools_enabled(s.owner_id),false) $$;
create or replace function public.pro_site_visit(p_slug text,p_code text) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare s public.pro_sites;k public.pro_ad_campaigns;
begin
 select * into s from public.pro_sites where slug=p_slug and published_version is not null;if not found then return false;end if;
 select * into k from public.pro_ad_campaigns where owner_id=s.owner_id and code=p_code and not archived;if not found then return false;end if;
 insert into public.pro_ad_visits(owner_id,campaign_id,day,visits) values(s.owner_id,k.id,public.pro_ad_cr_day(now()),1)
 on conflict(owner_id,campaign_id,day) do update set visits=pro_ad_visits.visits+1;
 return true;
end $$;
-- The request form: customer + lead (lead center) + attribution + optional marketing consent, exactly once per submissionId.
create or replace function public.pro_site_submit(p_slug text,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare s public.pro_sites;v public.pro_site_versions;prior public.pro_site_submissions;sub uuid;h text;cid text;lid uuid:=gen_random_uuid();k public.pro_ad_campaigns;
 origin text;channel jsonb;crev integer;title text;answer jsonb;consent boolean;email text;name text;phone text;mail text;
begin
 if jsonb_typeof(p_input)<>'object' then raise exception 'Invalid request' using errcode='22023';end if;
 begin sub:=(p_input->>'submissionId')::uuid;exception when others then raise exception 'Invalid request' using errcode='22023';end;
 name:=btrim(coalesce(p_input->>'name',''));email:=lower(btrim(coalesce(p_input->>'email','')));phone:=btrim(coalesce(p_input->>'phone',''));consent:=coalesce((p_input->>'marketingConsent')::boolean,false);
 mail:=email;
 if sub is null or length(name) not between 2 and 120 or email!~'^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(email)>254 or length(phone)>30 or length(coalesce(p_input->>'message','')) not between 5 and 2000
  or length(coalesce(p_input->>'service',''))>120 or (consent and coalesce(length(p_input->>'consentText'),0) not between 20 and 1000) then raise exception 'Invalid request' using errcode='22023';end if;
 select * into s from public.pro_sites where slug=p_slug and published_version is not null;
 if not found or not coalesce(public.pro_private_work_tools_enabled(s.owner_id),false) then raise exception 'Site unavailable' using errcode='P0002';end if;
 select * into v from public.pro_site_versions where owner_id=s.owner_id and version=s.published_version;
 if public.pro_site_section(v.content,'contact') is null then raise exception 'This site has no request form' using errcode='P0002';end if;
 -- confirmBase/language only shape the confirmation email; they are not part of the visitor's request identity.
 h:=encode(sha256(convert_to((p_input-'utm'-'confirmBase'-'language')::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(s.owner_id::text,0));
 select * into prior from public.pro_site_submissions where owner_id=s.owner_id and submission_id=sub;
 if found then if prior.input_hash<>h then raise exception 'Submission id reused' using errcode='22023';end if;return prior.result;end if;
 -- Security review 2026-11-13: abuse caps of the public form, in the database (the route's per-IP limit trusts proxy
 -- headers and lives in memory). Per site owner: 200 requests a day; per e-mail address: 5 a day. 54000 → 429.
 if (select count(*) from public.pro_site_submissions ss where ss.owner_id=s.owner_id and ss.created_at>clock_timestamp()-interval '1 day')>=200
  or (select count(*) from public.pro_site_submissions ss join public.pro_clients pc on pc.user_id=ss.owner_id and pc.id=ss.client_id
      where ss.owner_id=s.owner_id and ss.created_at>clock_timestamp()-interval '1 day' and pc.email=mail)>=5 then
  raise exception 'Too many requests from this site form' using errcode='54000',hint='pro_site_submit_cap';end if;
 -- An address that unsubscribed may still send a request: it is accepted, but consent is NOT granted again (the
 -- answer is the same, so the form does not reveal who unsubscribed).
 if consent and exists(select 1 from public.pro_mkt_suppressions where owner_id=s.owner_id and email_hash=public.pro_mkt_email_hash(mail)) then consent:=false;end if;
 if p_input->>'code' is not null then select * into k from public.pro_ad_campaigns where owner_id=s.owner_id and code=p_input->>'code' and not archived;end if;
 -- customer (contact) of the owner
 cid:='sitio-'||sub::text;
 insert into public.pro_workspace_core(user_id,document,revision) values(s.owner_id,'{"version":1,"social":[]}',1) on conflict do nothing;
 insert into public.pro_clients(user_id,id,name,email,phone,notes,archived) values(s.owner_id,cid,name,email,phone,'Solicitud desde su sitio web',false);
 update public.pro_workspace_core set revision=revision+1,updated_at=now() where user_id=s.owner_id;
 -- lead in the existing lead center, with its origin channel
 origin:=public.pro_ad_channel_origin(k.channel);channel:=public.pro_lead_origin_channel_json(s.owner_id,origin);
 crev:=(public.pro_lead_origin_stage_catalog(s.owner_id)->>'revision')::integer;
 title:=left('Sitio web: '||coalesce(nullif(btrim(p_input->>'service'),''),name),160);
 perform public.pro_lead_origin_create(s.owner_id,jsonb_build_object('action','create_lead','actionId',public.pro_site_derived(sub,'origin'),
  'lead',jsonb_build_object('action','create','kind','manual','actionId',public.pro_site_derived(sub,'lead'),'id',lid,'revision',0,'catalogRevision',crev,'clientId',cid,'title',title,
   'description',left(btrim(p_input->>'message')||case when phone<>'' then E'\nTel.: '||phone else '' end||E'\nCorreo: '||email,2000),'address',left(coalesce(p_input->>'area',''),500),
   'sourceLabel',left('Sitio web'||coalesce(' · '||k.name,''),80),'forecast',jsonb_build_object('projectType',left(coalesce(p_input->>'service',''),80),'expectedStart',null,'currency','CRC','revenueCents',null,'budgetCents',null,'profitCents',null),'stageMode','automatic','stageId',null),
  'channel',case when channel is null or coalesce((channel->>'archived')::boolean,false) then 'null'::jsonb else jsonb_build_object('id',origin,'revision',(channel->>'revision')::integer) end));
 insert into public.pro_lead_attributions(owner_id,lead_id,campaign_id,source,utm) values(s.owner_id,lid,k.id,'site_form',
  coalesce((select jsonb_object_agg(key,left(value#>>'{}',80)) from jsonb_each(case when jsonb_typeof(p_input->'utm')='object' then p_input->'utm' else '{}' end) where key in('source','medium','campaign','content','term') and jsonb_typeof(value)='string'),'{}'));
 -- Post-security fixes (Ley 8968, double opt-in): the tick only creates a PENDING contact and a confirmation email
 -- (mock: never sent); consent exists only after the recipient confirms from that email (pro_mkt_confirm).
 if consent then perform public.pro_mkt_request_confirmation(s.owner_id,email,name,p_input->>'consentText',jsonb_build_object('submissionId',sub,'siteVersion',v.version,'slug',s.slug),cid,lid,
  p_input->>'confirmBase',case when p_input->>'language'='en' then 'en' else 'es' end);end if;
 answer:=jsonb_build_object('ok',true,'business',public.pro_mkt_business(s.owner_id));
 insert into public.pro_site_submissions(owner_id,submission_id,version,input_hash,lead_id,client_id,campaign_id,marketing_consent,result) values(s.owner_id,sub,v.version,h,lid,cid,k.id,consent,answer);
 return answer;
end $$;
create or replace function public.pro_site_derived(p_base uuid,p_label text) returns uuid
language sql immutable security invoker set search_path=public,pg_temp as $$
 select (substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-'||'8'||substr(h,18,3)||'-'||substr(h,21,12))::uuid from (select md5('ccr-site:'||p_base::text||':'||p_label) h) x $$;

do $$declare n text;begin foreach n in array array['pro_sites','pro_site_versions','pro_site_actions','pro_site_history','pro_site_submissions'] loop
 execute format('alter table public.%I enable row level security',n);execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);execute format('grant select,insert,update on public.%I to service_role',n);
end loop;end $$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'pro\_site\_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  if f::text not like 'pro_site_immutable(%' then execute format('grant execute on function %s to service_role',f);end if;
 end loop;end $$;
notify pgrst,'reload schema';
commit;
