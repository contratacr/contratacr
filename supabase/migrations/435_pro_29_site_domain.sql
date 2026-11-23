-- Pro 29 (row 69): custom domain of the professional website, MOCK adapter only.
-- One active domain per site (a revoked one is kept as history and frees the name). Registering creates the DNS instructions
-- (CNAME to the shared target + a TXT ownership token); «check» in mock mode simulates the verification. Nothing is published
-- on a real domain and no provider is called: /sitio/<slug> stays the only route that serves the site. service_role only.
begin;
create table if not exists public.pro_site_domains(
 owner_id uuid not null references public.pro_sites(owner_id) on delete cascade,id uuid not null,
 hostname text not null check(hostname~'^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$' and length(hostname)<=253 and hostname!~'(^|\.)contratacr\.com$'),
 status text not null default 'pending' check(status in('pending','verified','revoked')),
 mode text not null default 'mock' check(mode='mock'),
 cname_target text not null check(cname_target~'^([a-z0-9-]{1,63}\.)+[a-z]{2,24}$'),
 verify_token text not null check(verify_token~'^[a-z0-9]{24,64}$'),
 verified_at timestamptz,revoked_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,id),
 check((status='verified')=(verified_at is not null) or status='revoked'),check((status='revoked')=(revoked_at is not null))
);
create unique index if not exists pro_site_domains_one_active on public.pro_site_domains(owner_id) where status<>'revoked';
create unique index if not exists pro_site_domains_host_active on public.pro_site_domains(hostname) where status<>'revoked';
alter table public.pro_site_domains enable row level security;

create or replace function public.pro_site_domain_json(d public.pro_site_domains) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',d.id,'hostname',d.hostname,'status',d.status,'mode',d.mode,'cnameTarget',d.cname_target,
  'txtName','_contratacr-verify.'||d.hostname,'txtValue','contratacr-verify='||d.verify_token,'verifiedAt',d.verified_at,'createdAt',d.created_at) $$;

create or replace function public.pro_site_domain_read(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare d public.pro_site_domains;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into d from public.pro_site_domains where owner_id=p_actor and status<>'revoked';
 return jsonb_build_object('hasSite',exists(select 1 from public.pro_sites where owner_id=p_actor),'domain',case when d.id is null then null else public.pro_site_domain_json(d) end,
  'history',coalesce((select jsonb_agg(jsonb_build_object('hostname',h.hostname,'revokedAt',h.revoked_at) order by h.revoked_at desc) from public.pro_site_domains h where h.owner_id=p_actor and h.status='revoked'),'[]'::jsonb));
end $$;

create or replace function public.pro_site_domain_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;d public.pro_site_domains;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid input' using errcode='22023';end if;
 act:=p_input->>'action';
 if act='register' then
  if not exists(select 1 from public.pro_sites where owner_id=p_actor) then raise exception 'Create the website first' using errcode='22023';end if;
  insert into public.pro_site_domains(owner_id,id,hostname,cname_target,verify_token)
  values(p_actor,gen_random_uuid(),lower(btrim(p_input->>'hostname')),lower(btrim(p_input->>'cnameTarget')),p_input->>'token') returning * into d;
  return public.pro_site_domain_json(d);
 end if;
 select * into d from public.pro_site_domains where owner_id=p_actor and status<>'revoked' for update;
 if not found then raise exception 'No active domain' using errcode='P0002';end if;
 if act='verify' then
  if d.status<>'pending' then raise exception 'Invalid transition' using errcode='40001';end if;
  update public.pro_site_domains set status='verified',verified_at=clock_timestamp(),updated_at=clock_timestamp() where owner_id=p_actor and id=d.id returning * into d;
 elsif act='revoke' then
  update public.pro_site_domains set status='revoked',revoked_at=clock_timestamp(),updated_at=clock_timestamp() where owner_id=p_actor and id=d.id returning * into d;
 else raise exception 'Invalid action' using errcode='22023';end if;
 return public.pro_site_domain_json(d);
end $$;
do $$declare f text;begin foreach f in array array['pro_site_domain_json(public.pro_site_domains)','pro_site_domain_read(uuid)','pro_site_domain_mutate(uuid,jsonb)'] loop
 execute format('revoke all on function public.%s from public,anon,authenticated',f);execute format('grant execute on function public.%s to service_role',f);end loop;end $$;
notify pgrst,'reload schema';
commit;
