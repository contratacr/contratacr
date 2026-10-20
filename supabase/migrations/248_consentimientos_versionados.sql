-- No historical consents are inferred or backfilled. This is a prospective ledger.
begin;
create table public.privacy_choices (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('terms','marketing','advertising','ai')),
  accepted boolean not null,
  version text not null,
  privacy_version text not null,
  locale text not null check (locale in ('es','en')),
  channel text not null check (channel in ('web','native','email_signup')),
  recorded_at timestamptz not null default clock_timestamp()
);
create index privacy_choices_latest on public.privacy_choices(user_id,purpose,id desc);
alter table public.privacy_choices enable row level security;
revoke all on public.privacy_choices from anon, authenticated;
grant select on public.privacy_choices to authenticated;
grant all on public.privacy_choices to service_role;
grant usage, select on sequence public.privacy_choices_id_seq to service_role;
create policy privacy_choices_read_own on public.privacy_choices for select to authenticated
  using (user_id = (select auth.uid()) and (select public.session_mfa_satisfied()));

create or replace function public.record_privacy_choice(p_purpose text, p_accepted boolean, p_locale text, p_channel text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_previous public.privacy_choices%rowtype;
  v_id bigint;
  v_version constant text := '2026-10-19';
begin
  if v_user is null then raise insufficient_privilege using message = 'AUTH_REQUIRED'; end if;
  perform public.enforce_session_mfa();
  if p_purpose is null or p_purpose not in ('terms','marketing','advertising','ai')
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

-- Only an explicit checkbox captured during a NEW email signup is recognised.
-- An old metadata field, later update, API lookup or prior use never implies consent.
create or replace function public.capture_signup_legal_acceptance()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v jsonb := new.raw_user_meta_data->'legal_acceptance';
begin
  if v->>'version' = '2026-10-19' and v->>'accepted' = 'true' and v->>'locale' in ('es','en') then
    insert into public.privacy_choices(user_id,purpose,accepted,version,privacy_version,locale,channel)
      values(new.id,'terms',true,'2026-10-19','2026-10-19',v->>'locale','email_signup');
  end if;
  return new;
end;
$$;
revoke all on function public.capture_signup_legal_acceptance() from public, anon, authenticated;
create trigger capture_signup_legal_acceptance after insert on auth.users
  for each row execute function public.capture_signup_legal_acceptance();
commit;
