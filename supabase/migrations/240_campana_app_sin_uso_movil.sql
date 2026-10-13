-- Exclude all known mobile usage, including evidence predating usage tracking.
-- Native devices remain evidence even after logout/deactivation. Anonymous
-- app activity cannot identify an email until the account signs in.
begin;
create index if not exists app_usage_mobile_account on public.app_usage_events(viewer_user_id)
  where runtime in ('android','ios','native_unknown') and viewer_user_id is not null;
create or replace function public.get_mobile_usage_accounts()
returns table(user_id uuid) language sql stable security definer set search_path=public,pg_temp as $$
  select viewer_user_id from app_usage_events where runtime in ('android','ios','native_unknown') and viewer_user_id is not null
  union select user_id from user_push_tokens where platform in ('android','ios')
  union select viewer_user_id from interaction_events where metadata->>'platform'='native' and viewer_user_id is not null
  union select user_id from app_registration_sources where runtime in ('android','ios','native_unknown');
$$;
create or replace function public.has_used_mobile_app(p_user_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from app_usage_events where viewer_user_id=p_user_id and runtime in ('android','ios','native_unknown'))
    or exists(select 1 from user_push_tokens where user_id=p_user_id and platform in ('android','ios'))
    or exists(select 1 from interaction_events where viewer_user_id=p_user_id and metadata->>'platform'='native')
    or exists(select 1 from app_registration_sources where user_id=p_user_id and runtime in ('android','ios','native_unknown'));
$$;
revoke all on function public.get_mobile_usage_accounts() from public,anon,authenticated;
revoke all on function public.has_used_mobile_app(uuid) from public,anon,authenticated;
grant execute on function public.get_mobile_usage_accounts() to service_role;
grant execute on function public.has_used_mobile_app(uuid) to service_role;

create or replace function public.claim_outreach_email(p_campaign text, p_email text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare used integer; held integer; account_id uuid; recipient text := lower(trim(p_email));
begin
  perform pg_advisory_xact_lock(hashtextextended('outreach-daily', 0));
  select id into account_id from public.profiles where lower(email) = recipient and is_disabled = false limit 1 for update;
  if account_id is null then return false; end if;
  if p_campaign='descargar-app-2026' and public.has_used_mobile_app(account_id) then return false; end if;
  if exists (select 1 from public.email_bajas where lower(correo) = recipient) then return false; end if;
  if exists (select 1 from public.admin_campaign_sends where (lower(email) = recipient or profile_id = account_id)
    and (campana = p_campaign or rebote_en is not null or status <> 'sent'
      or enviado_en > now() - interval '14 days')) then return false; end if;
  -- Notifications and promotional emails also avoid the same account-day.
  if exists (select 1 from public.notification_once_receipts r join public.profiles p on p.id = r.user_id
    where lower(p.email) = recipient and r.sent_at > now() - interval '24 hours') then return false; end if;
  select coalesce(sum(enviados),0) into used from public.email_cuota_diaria
    where dia = (now() at time zone 'UTC')::date;
  select count(*) into held from public.admin_campaign_sends
    where status <> 'sent' and enviado_en >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  if used + held >= 250 then return false; end if;
  insert into public.admin_campaign_sends(campana,email,status,profile_id) values(p_campaign,recipient,'sending',account_id)
    on conflict do nothing;
  return found;
end;
$$;
revoke all on function public.claim_outreach_email(text,text) from public, anon, authenticated;
grant execute on function public.claim_outreach_email(text,text) to service_role;
notify pgrst,'reload schema';
commit;
