-- LOCAL DRAFT (multivertical F3, 2026-11-16). NOT WIRED: no existing module calls these yet. Plan to replace the six
-- copies of the Pro access rule is in the session wiring notes (dir-wiring-F3F5.md).
-- * pro_entitled(actor): single SQL mirror of hasProAccess (src/lib/pro/access.ts) plus the ban check used by
--   work-changes / private-work-tools / appointment-requests. Enabled admin -> true; professional or provider with
--   an active grant whose expiry is null or a finite future instant -> true; disabled or banned -> false.
-- * Expiry uses clock_timestamp(): a grant that expires while a request waits on a row lock must be refused after the wait.
-- * pro_entitled_require(actor): raises 42501 (same error the six modules raise today).
-- * pro_membership_grant_launch_free(staff, user): launch grant (Pro free at launch). Idempotent: never touches
--   an existing grant row (active or inactive); writes pro_audit 'membership.launch_free'. It is unrelated to the
--   public directory: claims, verification and ranking never read it.
-- Depends on profiles, professionals, pro_memberships, pro_audit (memberships-draft.sql).
begin;
create or replace function public.pro_entitled(p_actor uuid) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(exists(select 1 from profiles p left join pro_memberships m on m.user_id=p.id
   where p.id=p_actor and not coalesce(p.is_disabled,false)
    and (p.role='admin' or ((p.role='professional' or coalesce(p.is_provider,false)) and m.status='active'
     and (m.expires_at is null or (isfinite(m.expires_at) and m.expires_at>clock_timestamp())))))
  and not exists(select 1 from professionals x where x.profile_id=p_actor and coalesce(x.is_banned,false)),false) $$;

create or replace function public.pro_entitled_require(p_actor uuid) returns void
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin if not public.pro_entitled(p_actor) then raise exception 'Forbidden' using errcode='42501';end if;end $$;

create or replace function public.pro_membership_grant_launch_free(p_actor uuid,p_user uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare n integer;granted boolean;
begin
 if p_actor is null or p_user is null then raise exception 'Invalid grant' using errcode='22023';end if;
 if not exists(select 1 from profiles where id=p_user and not coalesce(is_disabled,false) and (role='professional' or coalesce(is_provider,false))) then
  raise exception 'Not eligible' using errcode='22023',hint='pro_launch_not_eligible';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-membership:'||p_user::text,0));
 insert into pro_memberships(user_id,status,expires_at) values(p_user,'active',null) on conflict(user_id) do nothing;
 get diagnostics n=row_count;granted:=n>0;
 if granted then insert into pro_audit(actor,subject,action,detail) values(p_actor,p_user,'membership.launch_free',jsonb_build_object('source','launch_free'));end if;
 return jsonb_build_object('userId',p_user,'granted',granted);
end $$;

revoke all on function public.pro_entitled(uuid),public.pro_entitled_require(uuid),public.pro_membership_grant_launch_free(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pro_entitled(uuid),public.pro_entitled_require(uuid),public.pro_membership_grant_launch_free(uuid,uuid) to service_role;
commit;
