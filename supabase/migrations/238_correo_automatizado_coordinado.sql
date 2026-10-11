begin;
alter table public.admin_campaign_sends add column profile_id uuid references public.profiles(id) on delete set null;
update public.admin_campaign_sends s set profile_id = p.id from public.profiles p where lower(p.email) = lower(s.email);
create unique index admin_campaign_profile_once on public.admin_campaign_sends(campana,profile_id) where profile_id is not null;
-- Serialize manual/automatic campaigns, across types and daily bulk capacity.
create function public.claim_outreach_email(p_campaign text, p_email text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare used integer; held integer; account_id uuid; recipient text := lower(trim(p_email));
begin
  perform pg_advisory_xact_lock(hashtextextended('outreach-daily', 0));
  select id into account_id from public.profiles where lower(email) = recipient and is_disabled = false limit 1 for update;
  if account_id is null then return false; end if;
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
create or replace function public.capture_once_notification_receipt()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.type not in ('resena_google', 'invita_proyecto', 'completa_perfil', 'pide_resenas', 'agrega_precio') then
    return new;
  end if;
  -- Lock the account to serialize different reminder types too.
  perform 1 from public.profiles where id = new.user_id and is_disabled = false for update;
  if not found then return null; end if;
  if new.type in ('resena_google', 'pide_resenas', 'agrega_precio') and exists (
    select 1 from public.notification_once_receipts
    where user_id = new.user_id and status = 'sent' and sent_at > now() - interval '24 hours'
  ) then return null; end if;
  if exists (
    select 1 from public.admin_campaign_sends s join public.profiles p on lower(p.email) = lower(s.email)
    where p.id = new.user_id and s.enviado_en > now() - interval '24 hours'
  ) then return null; end if;
  insert into public.notification_once_receipts (user_id, type, status, sent_at)
  values (new.user_id, new.type, 'sent', coalesce(new.created_at, now()))
  on conflict (user_id, type) do nothing;
  if not found then return null; end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
commit;
