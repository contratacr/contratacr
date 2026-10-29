-- Prospective choices only: do not infer or backfill permission. Terms and AI versions stay unchanged.
alter table public.privacy_choices drop constraint privacy_choices_purpose_check;
alter table public.privacy_choices add constraint privacy_choices_purpose_check check (purpose in ('terms','marketing','advertising','ai','analytics'));
create or replace function public.record_privacy_choice(p_purpose text, p_accepted boolean, p_locale text, p_channel text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_previous public.privacy_choices%rowtype;
  v_id bigint;
  v_version text := case when p_purpose in ('analytics','advertising') then '2026-10-29' else '2026-10-19' end;
begin
  if v_user is null then raise insufficient_privilege using message = 'AUTH_REQUIRED'; end if;
  perform public.enforce_session_mfa();
  if p_purpose is null or p_purpose not in ('terms','marketing','advertising','ai','analytics')
    or p_accepted is null or p_locale is null or p_locale not in ('es','en')
    or p_channel is null or p_channel not in ('web','native') then
    raise invalid_parameter_value using message = 'INVALID_CHOICE';
  end if;
  -- Serialise concurrent tabs and retries; identical choices do not create duplicates.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text || ':' || p_purpose, 0));
  select * into v_previous from public.privacy_choices
    where user_id = v_user and purpose = p_purpose order by id desc limit 1;
  if v_previous.id is not null and v_previous.version = v_version and v_previous.accepted = p_accepted then
    return v_previous.id;
  end if;
  insert into public.privacy_choices(user_id,purpose,accepted,version,privacy_version,locale,channel)
    values (v_user,p_purpose,p_accepted,v_version,v_version,p_locale,p_channel) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.record_privacy_choice(text,boolean,text,text) from public, anon;
grant execute on function public.record_privacy_choice(text,boolean,text,text) to authenticated;

