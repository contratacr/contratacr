-- Delete the signed-in account atomically.
--
-- Removing the public profile first lets its owned records cascade in a
-- controlled order. Removing auth.users directly through the Admin API can fail
-- while those cascades and audit triggers are still attached. Both deletes run
-- in the same transaction, so a failure never leaves a partially deleted user.
create or replace function public.delete_my_account()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid := auth.uid();
begin
  if target_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  delete from public.profiles
  where id = target_user_id;

  delete from auth.users
  where id = target_user_id;

  if not found then
    raise exception 'Authenticated user not found' using errcode = 'P0002';
  end if;

  return true;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

notify pgrst, 'reload schema';
