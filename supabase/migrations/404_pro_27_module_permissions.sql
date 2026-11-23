-- Row 17 (2026-11-23): fine permissions by module and action for company roles.
-- A second layer UNDER the existing capabilities (pro_role_allows / custom roles): the Administrator (or the owner)
-- can DENY, per role (manager, member, read_only) or per custom role, an action (view / edit / delete / export) in a
-- module (work, lead, sales, finance, company, settings, inventory, listing, price, menu). It can only take away,
-- never grant: the base capability still has to allow the route. Enforced by the single /api/pro gate
-- (pro_team_route_authorize); the interface hides controls from the `denied` list of pro_team_workspace_resolve.
-- Actions are derived from the HTTP method (GET -> view, or export for print/export/csv/pdf paths; DELETE -> delete;
-- everything else -> edit, create and edit share the POST routes). The Administrator is never restricted.
begin;
create table if not exists public.pro_company_module_permissions(
 owner_id uuid primary key references public.profiles(id) on delete cascade,
 revision integer not null default 1 check(revision>0),
 denies jsonb not null default '{}'::jsonb check(jsonb_typeof(denies)='object'),
 updated_by uuid,
 updated_at timestamptz not null default now());
create table if not exists public.pro_company_module_permission_history(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 action_id uuid not null,
 actor_id uuid not null,
 input_hash text not null,
 before_state jsonb,
 after_state jsonb not null,
 at timestamptz not null default clock_timestamp(),
 primary key(owner_id,action_id));
alter table public.pro_company_module_permissions enable row level security;
alter table public.pro_company_module_permission_history enable row level security;
revoke all on public.pro_company_module_permissions,public.pro_company_module_permission_history from public,anon,authenticated;
grant all on public.pro_company_module_permissions,public.pro_company_module_permission_history to service_role;
drop trigger if exists pro_module_permission_history_immutable on public.pro_company_module_permission_history;
create trigger pro_module_permission_history_immutable before update or delete on public.pro_company_module_permission_history for each row execute function public.pro_team_append_only();

create or replace function public.pro_module_keys() returns text[] language sql immutable set search_path=public,pg_temp as $$
 select array['work','lead','sales','finance','company','settings','inventory','listing','price','menu']
$$;
create or replace function public.pro_module_actions() returns text[] language sql immutable set search_path=public,pg_temp as $$
 select array['view','edit','delete','export']
$$;
-- Capability (the write capability of the module) -> module key; null for team.manage / read.
create or replace function public.pro_module_of_capability(p_capability text) returns text language sql immutable set search_path=public,pg_temp as $$
 select case p_capability when 'work.write' then 'work' when 'lead.write' then 'lead' when 'sales.write' then 'sales' when 'finance.write' then 'finance'
  when 'company.write' then 'company' when 'settings.write' then 'settings' when 'inventory.write' then 'inventory' when 'listing.publish' then 'listing'
  when 'price.write' then 'price' when 'menu.write' then 'menu' else null end
$$;
create or replace function public.pro_route_action(p_method text,p_path text) returns text language sql immutable set search_path=public,pg_temp as $$
 select case when upper(coalesce(p_method,'')) in('GET','HEAD','OPTIONS') then
   case when coalesce(p_path,'') ~* '(print|export|csv|pdf)' then 'export' else 'view' end
  when upper(coalesce(p_method,''))='DELETE' then 'delete' else 'edit' end
$$;
-- Subjects whose denials apply to a member: its base role and its custom role.
create or replace function public.pro_module_subjects(p_member uuid,p_owner uuid) returns text[] language sql stable security invoker set search_path=public,pg_temp as $$
 select array_remove(array[public.pro_role_of(p_member,p_owner),(select 'custom:'||a.custom_role_id::text from public.pro_company_members m
   join public.pro_company_member_custom_roles a on a.owner_id=m.owner_id and a.member_id=m.id
   join public.pro_company_custom_roles c on c.owner_id=a.owner_id and c.id=a.custom_role_id and not c.archived
   where m.owner_id=p_owner and m.member_user_id=p_member and m.active)],null)
$$;
create or replace function public.pro_module_denied(p_member uuid,p_owner uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare d jsonb;s text;m text;a text;out jsonb:='{}'::jsonb;subj text[];
begin
 if p_member is null or p_owner is null or p_member=p_owner or public.pro_role_of(p_member,p_owner)='admin' then return '{}'::jsonb;end if;
 select denies into d from public.pro_company_module_permissions where owner_id=p_owner;
 if d is null then return '{}'::jsonb;end if;
 subj:=public.pro_module_subjects(p_member,p_owner);
 foreach s in array coalesce(subj,'{}') loop
  if d ? s then
   for m in select jsonb_object_keys(d->s) loop
    for a in select jsonb_array_elements_text(d->s->m) loop
     if not (coalesce(out->m,'[]'::jsonb) @> to_jsonb(a)) then out:=jsonb_set(out,array[m],coalesce(out->m,'[]'::jsonb)||to_jsonb(a),true);end if;
    end loop;
   end loop;
  end if;
 end loop;
 return out;
end $$;
create or replace function public.pro_module_action_allowed(p_member uuid,p_owner uuid,p_module text,p_action text) returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select p_module is null or not coalesce(public.pro_module_denied(p_member,p_owner)->p_module @> to_jsonb(p_action),false)
$$;

create or replace function public.pro_module_permissions_read(p_actor uuid,p_owner uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare row_ public.pro_company_module_permissions;
begin
 if public.pro_role_of(p_actor,p_owner) is null then raise exception 'Forbidden' using errcode='42501';end if;
 select * into row_ from public.pro_company_module_permissions where owner_id=p_owner;
 return jsonb_build_object('revision',coalesce(row_.revision,0),'canManage',public.pro_role_of(p_actor,p_owner)='admin',
  'modules',to_jsonb(public.pro_module_keys()),'actions',to_jsonb(public.pro_module_actions()),
  'subjects',jsonb_build_array(jsonb_build_object('key','manager','kind','role','name','manager'),jsonb_build_object('key','member','kind','role','name','member'),jsonb_build_object('key','read_only','kind','role','name','read_only'))
   ||coalesce((select jsonb_agg(jsonb_build_object('key','custom:'||c.id::text,'kind','custom','name',c.name) order by lower(c.name)) from public.pro_company_custom_roles c where c.owner_id=p_owner and not c.archived),'[]'::jsonb),
  'denies',coalesce(row_.denies,'{}'::jsonb));
end $$;

create or replace function public.pro_module_permissions_mutate(p_actor uuid,p_owner uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;hash text:=md5(coalesce(p_input::text,''));cur public.pro_company_module_permissions;h public.pro_company_module_permission_history;
 den jsonb;norm jsonb:='{}'::jsonb;s text;m text;a text;acts jsonb;rev integer;valid_subjects text[];
begin
 perform public.pro_role_require(p_actor,p_owner,'team.manage');
 if jsonb_typeof(p_input) is distinct from 'object' or p_input->>'action' is distinct from 'save' or jsonb_typeof(p_input->'denies') is distinct from 'object' or jsonb_typeof(p_input->'revision') is distinct from 'number' then raise exception 'Invalid permissions' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid action id' using errcode='22023';end;
 perform pg_advisory_xact_lock(hashtextextended('pro-module-perms:'||p_owner::text,0));
 select * into h from public.pro_company_module_permission_history where owner_id=p_owner and action_id=aid;
 if found then if h.input_hash<>hash then raise exception 'Action id reused' using errcode='22023';end if;
  return jsonb_build_object('revision',(h.after_state->>'revision')::integer,'denies',h.after_state->'denies','replayed',true);end if;
 select * into cur from public.pro_company_module_permissions where owner_id=p_owner for update;
 rev:=coalesce(cur.revision,0);
 if (p_input->>'revision')::integer<>rev then raise exception 'Permissions changed' using errcode='40001';end if;
 valid_subjects:=array['manager','member','read_only']||coalesce((select array_agg('custom:'||c.id::text) from public.pro_company_custom_roles c where c.owner_id=p_owner and not c.archived),'{}');
 den:=p_input->'denies';
 for s in select jsonb_object_keys(den) loop
  if not s=any(valid_subjects) or jsonb_typeof(den->s) is distinct from 'object' then raise exception 'Unknown role' using errcode='22023';end if;
  for m in select jsonb_object_keys(den->s) loop
   if not m=any(public.pro_module_keys()) or jsonb_typeof(den->s->m) is distinct from 'array' then raise exception 'Unknown module' using errcode='22023';end if;
   acts:='[]'::jsonb;
   for a in select jsonb_array_elements_text(den->s->m) loop
    if not a=any(public.pro_module_actions()) then raise exception 'Unknown action' using errcode='22023';end if;
    if m='work' and a='view' then raise exception 'Jobs cannot be hidden' using errcode='22023';end if;
    if not acts @> to_jsonb(a) then acts:=acts||to_jsonb(a);end if;
   end loop;
   if jsonb_array_length(acts)>0 then norm:=jsonb_set(norm,array[s],coalesce(norm->s,'{}'::jsonb)||jsonb_build_object(m,acts),true);end if;
  end loop;
 end loop;
 if cur.owner_id is null then insert into public.pro_company_module_permissions(owner_id,revision,denies,updated_by) values(p_owner,1,norm,p_actor);rev:=1;
 else update public.pro_company_module_permissions set revision=revision+1,denies=norm,updated_by=p_actor,updated_at=now() where owner_id=p_owner returning revision into rev;end if;
 insert into public.pro_company_module_permission_history(owner_id,action_id,actor_id,input_hash,before_state,after_state)
  values(p_owner,aid,p_actor,hash,case when cur.owner_id is null then null else jsonb_build_object('revision',cur.revision,'denies',cur.denies) end,jsonb_build_object('revision',rev,'denies',norm));
 return jsonb_build_object('revision',rev,'denies',norm,'replayed',false);
end $$;

-- Workspace resolve: same answer as before plus `denied` (module -> actions) for the interface.
create or replace function public.pro_team_workspace_resolve(p_member uuid,p_owner uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r text;caps text[];
begin
 if p_member is null or p_owner is null or p_member=p_owner then return null;end if;
 r:=public.pro_role_of(p_member,p_owner);
 if r is null or not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then return null;end if;
 caps:=public.pro_ops_custom_caps(p_member,p_owner);
 return jsonb_build_object('ownerId',p_owner,'ownerName',coalesce((select nullif(btrim(business_name),'') from public.professionals where profile_id=p_owner),public.pro_team_name(p_owner)),
  'role',r,'capabilities',(select jsonb_agg(c) from unnest(public.pro_ops_capabilities()) c where public.pro_role_allows(r,c) and (caps is null or c=any(caps))),
  'denied',public.pro_module_denied(p_member,p_owner));
end $$;

-- The single gate: base role + custom role (pro_role_require), edition module, and now the module/action matrix.
create or replace function public.pro_team_route_authorize(p_member uuid,p_owner uuid,p_method text,p_path text) returns jsonb
language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare ws jsonb;cap text;mod text;perm_mod text;act text;
begin
 if p_path is null or length(p_path)>200 or p_path !~ '^/api/pro(/|$)' then raise exception 'Invalid route' using errcode='22023';end if;
 ws:=public.pro_team_workspace_resolve(p_member,p_owner);
 if ws is null then return jsonb_build_object('allowed',false,'reason','not_member');end if;
 cap:=public.pro_role_route_capability(p_method,p_path);
 begin perform public.pro_role_require(p_member,p_owner,cap);
 exception when insufficient_privilege then return jsonb_build_object('allowed',false,'reason','role','role',ws->>'role','capability',cap);end;
 mod:=public.pro_route_module(p_path);
 if mod is not null and not public.pro_has_module(p_owner,mod) then
  return jsonb_build_object('allowed',false,'reason','module_disabled','role',ws->>'role','capability',cap,'module',mod);end if;
 perm_mod:=public.pro_module_of_capability(public.pro_role_route_capability('POST',p_path));
 act:=public.pro_route_action(p_method,p_path);
 if perm_mod is not null and not public.pro_module_action_allowed(p_member,p_owner,perm_mod,act) then
  return jsonb_build_object('allowed',false,'reason','module_action','role',ws->>'role','capability',cap,'module',perm_mod,'action',act);end if;
 if cap<>'read' then
  insert into public.pro_company_team_activity(owner_id,member_user_id,member_name,role,capability,method,path)
  values(p_owner,p_member,public.pro_team_name(p_member),ws->>'role',cap,upper(p_method),left(p_path,200));
 end if;
 return jsonb_build_object('allowed',true,'role',ws->>'role','capability',cap);
end $$;

do $$ declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in(
  'pro_module_keys','pro_module_actions','pro_module_of_capability','pro_route_action','pro_module_subjects','pro_module_denied','pro_module_action_allowed',
  'pro_module_permissions_read','pro_module_permissions_mutate','pro_team_workspace_resolve','pro_team_route_authorize') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
notify pgrst,'reload schema';
