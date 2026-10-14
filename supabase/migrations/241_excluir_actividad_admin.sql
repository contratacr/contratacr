-- Internal activity is not marketplace demand. Preserve excluded analytics
-- privately before removing them from the tables consumed by every report.
create table if not exists public.excluded_admin_analytics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source_table text not null,
  event jsonb not null,
  excluded_at timestamptz not null default now()
);
alter table public.excluded_admin_analytics enable row level security;
revoke all on public.excluded_admin_analytics from public,anon,authenticated;
grant all on public.excluded_admin_analytics to service_role;

create or replace function public.exclude_admin_analytics(p_user uuid,p_session uuid default null,p_visitor text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from profiles where id=p_user and role='admin') then return; end if;
  with removed as (delete from interaction_events where viewer_user_id=p_user returning *)
  insert into excluded_admin_analytics(user_id,source_table,event) select p_user,'interaction_events',to_jsonb(r) from removed r;
  with removed as (delete from app_usage_events where viewer_user_id=p_user
    or (p_session is not null and session_id=p_session and visitor_hash=p_visitor and viewer_user_id is null) returning *)
  insert into excluded_admin_analytics(user_id,source_table,event) select p_user,'app_usage_events',to_jsonb(r) from removed r;
  with removed as (delete from app_registration_sources where user_id=p_user returning *)
  insert into excluded_admin_analytics(user_id,source_table,event) select p_user,'app_registration_sources',to_jsonb(r) from removed r;
  with removed as (delete from growth_conversion_events where actor_hash=encode(sha256(convert_to(p_user::text,'UTF8')),'hex') returning *)
  insert into excluded_admin_analytics(user_id,source_table,event) select p_user,'growth_conversion_events',to_jsonb(r)-'payload' from removed r;
end $$;
revoke all on function public.exclude_admin_analytics(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.exclude_admin_analytics(uuid,uuid,text) to service_role;

create or replace function public.skip_admin_analytics()
returns trigger language plpgsql security definer set search_path=public as $$
declare actor uuid;
begin
  if TG_TABLE_NAME='growth_conversion_events' then
    if exists(select 1 from profiles where role='admin' and encode(sha256(convert_to(id::text,'UTF8')),'hex')=NEW.actor_hash) then return null; end if;
  else
    actor := (to_jsonb(NEW)->>case when TG_TABLE_NAME='app_registration_sources' then 'user_id' else 'viewer_user_id' end)::uuid;
    if exists(select 1 from profiles where id=actor and role='admin') then return null; end if;
  end if;
  return NEW;
end $$;
revoke all on function public.skip_admin_analytics() from public,anon,authenticated;

DO $$ declare t text; begin
  foreach t in array array['interaction_events','app_usage_events','app_registration_sources','growth_conversion_events'] loop
    execute format('drop trigger if exists skip_admin_analytics on public.%I',t);
    execute format('create trigger skip_admin_analytics before insert or update on public.%I for each row execute function public.skip_admin_analytics()',t);
  end loop;
end $$;

create or replace function public.exclude_promoted_admin_analytics()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if NEW.role='admin' and OLD.role is distinct from NEW.role then perform exclude_admin_analytics(NEW.id); end if;
  return NEW;
end $$;
revoke all on function public.exclude_promoted_admin_analytics() from public,anon,authenticated;
drop trigger if exists exclude_promoted_admin_analytics on public.profiles;
create trigger exclude_promoted_admin_analytics after update of role on public.profiles
for each row execute function public.exclude_promoted_admin_analytics();

DO $$ declare actor uuid; begin
  for actor in select id from profiles where role='admin' loop perform exclude_admin_analytics(actor); end loop;
end $$;

create or replace function public.record_app_usage(p_visitor text,p_user_id uuid,p_session uuid,p_screen uuid,p_runtime text,p_path text,p_tab text,p_first_use boolean default false)
returns void language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from profiles where id=p_user_id and role='admin') then
    perform exclude_admin_analytics(p_user_id,p_session,p_visitor);
    return;
  end if;
  if p_runtime not in ('web','android','ios','native_unknown') then raise exception 'Invalid runtime'; end if;
  insert into app_usage_events(event_key,event_type,runtime,session_id,visitor_hash,viewer_user_id,path,tab)
  values ('session:'||p_runtime||':'||p_session,'session',p_runtime,p_session,p_visitor,p_user_id,p_path,p_tab),
    ('screen:'||p_runtime||':'||p_screen,'screen',p_runtime,p_session,p_visitor,p_user_id,p_path,p_tab)
  on conflict(event_key) do nothing;
  if p_user_id is not null then
    -- Associate guest session/screens when their owner subsequently signs in.
    update app_usage_events set viewer_user_id=p_user_id
      where session_id=p_session and visitor_hash=p_visitor and viewer_user_id is null;
    insert into app_usage_events(event_key,event_type,runtime,session_id,visitor_hash,viewer_user_id,path,tab)
    values('access:'||p_runtime||':'||p_session||':'||p_user_id,'access',p_runtime,p_session,p_visitor,p_user_id,p_path,p_tab)
    on conflict(event_key) do nothing;
    perform record_registration_platform(p_user_id,p_runtime);
  end if;
  if p_first_use and p_runtime<>'web' then
    insert into app_usage_events(event_key,event_type,runtime,session_id,visitor_hash,viewer_user_id,path,tab)
    values('first:'||p_runtime||':'||p_visitor,'first_use',p_runtime,p_session,p_visitor,p_user_id,p_path,p_tab)
    on conflict(event_key) do nothing;
  end if;
end $$;

notify pgrst,'reload schema';
