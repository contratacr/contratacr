-- Permanent receipts survive dismissal and notification retention cleanup.
-- A receipt and its notification are committed in the same transaction.
lock table public.notifications in share row exclusive mode;

create table public.notification_once_receipts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('resena_google', 'invita_proyecto', 'completa_perfil', 'pide_resenas', 'agrega_precio')),
  status text not null check (status in ('sent', 'historical_unknown')),
  sent_at timestamptz,
  recorded_at timestamptz not null default now(),
  primary key (user_id, type),
  check ((status = 'sent' and sent_at is not null) or (status = 'historical_unknown' and sent_at is null))
);
alter table public.notification_once_receipts enable row level security;
revoke all on public.notification_once_receipts from public, anon, authenticated;
grant select, insert, update, delete on public.notification_once_receipts to service_role;

insert into public.notification_once_receipts (user_id, type, status, sent_at)
select user_id, type, 'sent', coalesce(min(created_at), now())
from public.notifications
where type in ('resena_google', 'invita_proyecto', 'completa_perfil', 'pide_resenas', 'agrega_precio')
group by user_id, type;

-- Missing old Google invitations may have been deleted. Do not interpret an
-- absent notification as proof that the account has never received one.
insert into public.notification_once_receipts (user_id, type, status, sent_at)
select id, 'resena_google', 'historical_unknown', null from public.profiles
on conflict (user_id, type) do nothing;

create function public.capture_once_notification_receipt()
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
  insert into public.notification_once_receipts (user_id, type, status, sent_at)
  values (new.user_id, new.type, 'sent', coalesce(new.created_at, now()))
  on conflict (user_id, type) do nothing;
  if not found then return null; end if;
  return new;
end;
$$;
revoke all on function public.capture_once_notification_receipt() from public, anon, authenticated;
create trigger trg_capture_once_notification_receipt
before insert on public.notifications for each row
execute function public.capture_once_notification_receipt();

-- Reserve a campaign recipient BEFORE contacting the email provider. A crash
-- or an uncertain provider result must never make the recipient retryable.
alter table public.admin_campaign_sends
  add column status text not null default 'sent' check (status in ('sending', 'sent', 'uncertain'));
notify pgrst, 'reload schema';
