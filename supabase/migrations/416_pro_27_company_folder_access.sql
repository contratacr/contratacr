-- ContrataCR Pro, row 31: permissions per folder of the company library for CURRENT team members.
--  * Default: only the owner. A member sees nothing of the library until the owner grants a folder ("view" or "edit");
--    a grant on a folder covers its subfolders and their files. The root (Inicio) is never open to members.
--  * Only members who are active in pro_company_members count at the moment of use ("vigentes"): deactivating a member
--    removes access immediately without touching the grants. The grant table has a foreign key to the member row.
--  * Grants and revocations are idempotent (action id per owner) and leave an append-only audit trail with the real actor.
--  * Members never get purge, bulk, tags, versions or trash of the library: those stay with the owner (routes).
-- Writers and the gate are service_role only; the routes decide owner-only for the management actions.
-- PRO_ENABLED stays false in production. Reapplicable: create if not exists / or replace.
begin;

create table if not exists public.pro_company_folder_access(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 folder_id uuid not null,
 member_user_id uuid not null,
 level text not null check(level in('view','edit')),
 granted_by uuid not null,
 granted_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,folder_id,member_user_id),
 foreign key(owner_id,folder_id) references public.pro_company_folders(owner_id,id) on delete cascade);
create index if not exists pro_company_folder_access_member on public.pro_company_folder_access(owner_id,member_user_id);
-- The member must belong to the company; the FK is added when the team table exists (it does in production since migration 307).
do $$begin
 if to_regclass('public.pro_company_members') is not null and not exists(select 1 from pg_constraint where conname='pro_company_folder_access_member_fk') then
  alter table public.pro_company_folder_access add constraint pro_company_folder_access_member_fk foreign key(owner_id,member_user_id) references public.pro_company_members(owner_id,member_user_id) on delete cascade;
 end if;
end $$;

create table if not exists public.pro_company_folder_access_actions(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,input_hash text not null check(input_hash~'^[a-f0-9]{32}$'),
 actor_id uuid not null,action text not null check(action in('grant','revoke')),folder_id uuid not null,member_user_id uuid not null,level text check(level in('view','edit')),
 at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id));
create or replace function public.pro_company_folder_access_guard() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Access audit is immutable' using errcode='23514';end $$;
drop trigger if exists pro_company_folder_access_guard on public.pro_company_folder_access_actions;
create trigger pro_company_folder_access_guard before update or delete on public.pro_company_folder_access_actions for each row when (pg_trigger_depth()=0) execute function public.pro_company_folder_access_guard();

-- Active ("vigente") member of this company.
create or replace function public.pro_company_member_active(p_owner uuid,p_member uuid) returns boolean language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare ok boolean:=false;
begin
 if p_member is null or p_member=p_owner or to_regclass('public.pro_company_members') is null then return false;end if;
 execute 'select exists(select 1 from public.pro_company_members m where m.owner_id=$1 and m.member_user_id=$2 and m.active)' using p_owner,p_member into ok;
 return coalesce(ok,false);
end $$;

-- Highest level ('edit' > 'view') the member has on the folder, through the folder itself or any ancestor; null = no access.
create or replace function public.pro_company_folder_level(p_owner uuid,p_member uuid,p_folder uuid) returns text language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare lvl text;
begin
 if p_folder is null or not public.pro_company_member_active(p_owner,p_member) then return null;end if;
 with recursive chain(id,parent_id,depth) as(
   select f.id,f.parent_id,1 from public.pro_company_folders f where f.owner_id=p_owner and f.id=p_folder
   union all select p.id,p.parent_id,c.depth+1 from public.pro_company_folders p join chain c on p.id=c.parent_id and p.owner_id=p_owner where c.depth<12)
 select case when bool_or(a.level='edit') then 'edit' when bool_or(a.level='view') then 'view' end into lvl
  from chain join public.pro_company_folder_access a on a.owner_id=p_owner and a.folder_id=chain.id and a.member_user_id=p_member;
 return lvl;
end $$;

-- Gate used by the routes: every listed folder and the folder of every listed file must reach the required level.
-- Files in the root, unknown ids and an empty request are denied.
create or replace function public.pro_company_folder_gate(p_owner uuid,p_member uuid,p_folders uuid[],p_files uuid[],p_level text) returns boolean language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare f uuid;fo uuid;lvl text;
begin
 if p_level not in('view','edit') then return false;end if;
 if coalesce(cardinality(p_folders),0)+coalesce(cardinality(p_files),0)=0 then return false;end if;
 foreach f in array coalesce(p_folders,'{}'::uuid[]) loop
  lvl:=public.pro_company_folder_level(p_owner,p_member,f);
  if lvl is null or p_level='edit' and lvl<>'edit' then return false;end if;
 end loop;
 foreach f in array coalesce(p_files,'{}'::uuid[]) loop
  select x.folder_id into fo from public.pro_company_files x where x.owner_id=p_owner and x.id=f;
  if not found or fo is null then return false;end if;
  lvl:=public.pro_company_folder_level(p_owner,p_member,fo);
  if lvl is null or p_level='edit' and lvl<>'edit' then return false;end if;
 end loop;
 return true;
end $$;

-- Owner view of one folder: current members and their grant (direct or inherited from an ancestor).
create or replace function public.pro_company_folder_access_read(p_actor uuid,p_folder uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare fname text;members jsonb:='[]'::jsonb;
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select name into fname from public.pro_company_folders where owner_id=p_actor and id=p_folder;
 if not found then return null;end if;
 if to_regclass('public.pro_company_members') is not null then
  execute $q$select coalesce(jsonb_agg(jsonb_build_object('userId',m.member_user_id,'name',coalesce(nullif(m.member_name,''),nullif(m.member_email,''),'Integrante'),'role',m.role,
    'level',(select a.level from public.pro_company_folder_access a where a.owner_id=m.owner_id and a.folder_id=$2 and a.member_user_id=m.member_user_id),
    'effective',public.pro_company_folder_level(m.owner_id,m.member_user_id,$2)) order by lower(m.member_name),m.member_user_id),'[]'::jsonb)
   from public.pro_company_members m where m.owner_id=$1 and m.active$q$ using p_actor,p_folder into members;
 end if;
 return jsonb_build_object('folder',jsonb_build_object('id',p_folder,'name',fname),'members',members);
end $$;

-- What a member can open: the folders where the grant starts (not the ones inherited), with their level.
create or replace function public.pro_company_folder_access_mine(p_owner uuid,p_member uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not public.pro_company_member_active(p_owner,p_member) then return jsonb_build_object('folders','[]'::jsonb);end if;
 return jsonb_build_object('folders',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'level',a.level,'archived',f.archived) order by lower(f.name),f.id)
  from public.pro_company_folder_access a join public.pro_company_folders f on f.owner_id=a.owner_id and f.id=a.folder_id
  where a.owner_id=p_owner and a.member_user_id=p_member and not f.archived),'[]'::jsonb));
end $$;

create or replace function public.pro_company_folder_access_mutate(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare keys text[];want text[];act text;aid uuid;fid uuid;mid uuid;lvl text;hash text:=md5(p_input::text);prior public.pro_company_folder_access_actions;n integer;
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid access' using errcode='22023';end if;
 select array_agg(k order by k) into keys from jsonb_object_keys(p_input) k;act:=p_input->>'action';
 if act='grant' then want:=array['action','actionId','folderId','level','memberUserId'];elsif act='revoke' then want:=array['action','actionId','folderId','memberUserId'];end if;
 if want is null or keys is distinct from want then raise exception 'Invalid access' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;fid:=(p_input->>'folderId')::uuid;mid:=(p_input->>'memberUserId')::uuid;exception when others then raise exception 'Invalid access' using errcode='22023';end;
 lvl:=p_input->>'level';if act='grant' and (lvl is null or lvl not in('view','edit')) then raise exception 'Invalid access' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-folder-access:'||p_actor::text,0));
 select * into prior from public.pro_company_folder_access_actions where owner_id=p_actor and action_id=aid;
 if found then if prior.input_hash<>hash then raise exception 'Action id reused' using errcode='22023';end if;return jsonb_build_object('replayed',true,'access',public.pro_company_folder_access_read(p_actor,fid));end if;
 if not exists(select 1 from public.pro_company_folders where owner_id=p_actor and id=fid) then raise exception 'Folder not found' using errcode='42501';end if;
 if not public.pro_company_member_active(p_actor,mid) then raise exception 'Member not active' using errcode='42501';end if;
 if act='grant' then
  select count(*) into n from public.pro_company_folder_access where owner_id=p_actor and folder_id=fid and member_user_id<>mid;
  if n>=50 then raise exception 'Access limit reached' using errcode='54000';end if;
  insert into public.pro_company_folder_access(owner_id,folder_id,member_user_id,level,granted_by) values(p_actor,fid,mid,lvl,p_actor)
   on conflict(owner_id,folder_id,member_user_id) do update set level=excluded.level,updated_at=clock_timestamp();
 else
  delete from public.pro_company_folder_access where owner_id=p_actor and folder_id=fid and member_user_id=mid;
 end if;
 insert into public.pro_company_folder_access_actions(owner_id,action_id,input_hash,actor_id,action,folder_id,member_user_id,level) values(p_actor,aid,hash,p_actor,act,fid,mid,case when act='grant' then lvl end);
 return jsonb_build_object('replayed',false,'access',public.pro_company_folder_access_read(p_actor,fid));
end $$;

do $$declare t text;f record;begin
 foreach t in array array['pro_company_folder_access','pro_company_folder_access_actions'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_company_folder_access_guard','pro_company_member_active','pro_company_folder_level','pro_company_folder_gate','pro_company_folder_access_read','pro_company_folder_access_mine','pro_company_folder_access_mutate') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end $$;
commit;
notify pgrst,'reload schema';
