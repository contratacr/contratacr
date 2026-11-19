-- LOCAL ONLY (launch without Pro, 2026-11-18): NEUTRAL business roles of a claimed directory place. Directory-owned:
-- installs and runs on a database WITHOUT any pro_* module. Depends on nothing (plain functions); the directory
-- modules that authorize owner tools (moderation: review replies; place tools: reservations/events/«Pedir»; questions:
-- business answers; menus: menu editor and price publishing; listings: agent assignment) call these two helpers
-- instead of calling the Pro team helpers (pro_role_of / pro_role_allows) themselves.
-- Model:
-- * The OWNER and every active MANAGER of a claimed place (dir_place_managers) act as themselves: p_actor = their own
--   account, p_member = null. That needs no role at all; the claim is the permission (free, no edition).
-- * A Pro COMPANY MEMBER working in the owner's Pro workspace is p_member (p_actor = the owner). Only when the Pro
--   team module is installed (pro_role_of present) can such a member have a role; without Pro every member is refused
--   (role null), so a directory-only database never trusts a member identity.
-- * dir_business_allows: the Pro matrix stays authoritative when installed (pro_role_allows); without it the same
--   directory capabilities apply: admin/manager everything (publishing prices, public answers/replies, events),
--   member read + work.write + menu.write (drafts, never publishes a price), read_only read.
-- Functions security invoker, pinned search_path, executable only by service_role. Idempotent (create or replace).
begin;

create or replace function public.dir_business_role_of(p_member uuid,p_owner uuid) returns text
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r text;
begin
 if p_member is null or p_owner is null then return null;end if;
 if p_member=p_owner then return 'admin';end if;
 if to_regprocedure('public.pro_role_of(uuid,uuid)') is null then return null;end if;
 execute 'select public.pro_role_of($1,$2)' into r using p_member,p_owner;
 return r;
end $$;

create or replace function public.dir_business_allows(p_role text,p_capability text) returns boolean
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare allowed boolean;
begin
 if p_role is null or p_capability is null then return false;end if;
 if to_regprocedure('public.pro_role_allows(text,text)') is not null then
  execute 'select public.pro_role_allows($1,$2)' into allowed using p_role,p_capability;
  return coalesce(allowed,false);
 end if;
 return case p_role
  when 'admin' then p_capability in('read','work.write','listing.publish','price.write','menu.write')
  when 'manager' then p_capability in('read','work.write','listing.publish','price.write','menu.write')
  when 'member' then p_capability in('read','work.write','menu.write')
  when 'read_only' then p_capability='read'
  else false end;
end $$;

do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('dir_business_role_of','dir_business_allows') loop
  execute format('revoke all on function %s from public,anon,authenticated',f);
  execute format('grant execute on function %s to service_role',f);
 end loop;end $$;
notify pgrst,'reload schema';
commit;
