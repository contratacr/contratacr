-- All optional reminder types share the same account cooldown.
-- Keep permanent receipts and match email campaigns by account after email changes.
begin;
create or replace function public.capture_once_notification_receipt()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.type not in ('resena_google', 'invita_proyecto', 'completa_perfil', 'pide_resenas', 'agrega_precio') then
    return new;
  end if;
  -- Lock the account to serialize different reminder types too.
  perform 1 from public.profiles where id = new.user_id and is_disabled = false for update;
  if not found then return null; end if;
  if exists (
    select 1 from public.notification_once_receipts
    where user_id = new.user_id and status = 'sent' and sent_at > now() - interval '24 hours'
  ) then return null; end if;
  if exists (
    select 1 from public.admin_campaign_sends s join public.profiles p on p.id = new.user_id
    where (s.profile_id = new.user_id or lower(p.email) = lower(s.email)) and s.enviado_en > now() - interval '24 hours'
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
