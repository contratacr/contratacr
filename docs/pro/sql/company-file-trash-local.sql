-- LOCAL PRO ONLY. Round 9 (2026-11-15): recursive trash and restore for the company library, like the
-- job files organizer. «Enviar a la papelera» takes a folder with ALL its contents (subfolders and files)
-- out of the library in one step; «Restaurar» brings back exactly what that step took (items archived
-- before stay archived). Nothing is deleted: files, bytes and versions are untouched; only the existing
-- archived flag (with the next revision) changes. «Se puede restaurar hasta» = trash day + 30 days
-- (America/Costa_Rica); no automatic purge. If the parent folder is no longer available the folder is
-- restored at the library root. Idempotent actionId receipts, CAS 40001 on the folder revision,
-- immutable trash records. RLS + service_role-only; security invoker.
begin;
create table if not exists public.pro_company_trash(
 owner_id uuid not null references public.profiles(id) on delete cascade,id uuid not null,folder_id uuid not null,folder_name text not null,parent_id uuid,
 folders uuid[] not null,files uuid[] not null,trashed_at timestamptz not null default clock_timestamp(),restore_until date not null,
 restored_at timestamptz,restored_to_root boolean,
 primary key(owner_id,id),foreign key(owner_id,folder_id) references public.pro_company_folders(owner_id,id));
create index if not exists pro_company_trash_open on public.pro_company_trash(owner_id,trashed_at desc) where restored_at is null;
create table if not exists public.pro_company_trash_actions(
 owner_id uuid not null,action_id uuid not null,input_hash text not null,result jsonb not null,at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id));

create or replace function public.pro_company_trash_json(t public.pro_company_trash) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',t.id,'folderId',t.folder_id,'name',t.folder_name,'folders',cardinality(t.folders),'files',cardinality(t.files),
  'trashedAt',t.trashed_at,'restoreUntil',to_char(t.restore_until,'YYYY-MM-DD'),'restoredAt',t.restored_at,'restoredToRoot',t.restored_to_root)
$$;
create or replace function public.pro_company_trash_read(p_actor uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(public.pro_company_trash_json(t) order by t.trashed_at desc,t.id) from (select * from public.pro_company_trash where owner_id=p_actor and restored_at is null order by trashed_at desc,id limit 100) t),'[]'::jsonb));
end $$;

create or replace function public.pro_company_trash_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;act text;hash text;prior public.pro_company_trash_actions;folder public.pro_company_folders;t public.pro_company_trash;sub uuid[];fls uuid[];answer jsonb;to_root boolean:=false;tid uuid;
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input)<>'object' or not coalesce(p_input->>'actionId','')~'^[0-9a-f-]{36}$' then raise exception 'Invalid input' using errcode='22023';end if;
 aid:=(p_input->>'actionId')::uuid;act:=p_input->>'action';hash:=encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('pro_company_files:'||p_actor::text,0));
 select * into prior from public.pro_company_trash_actions where owner_id=p_actor and action_id=aid;
 if found then if prior.input_hash<>hash then raise exception 'Action id reused' using errcode='22023';end if;return prior.result||jsonb_build_object('replayed',true);end if;
 if act='trash' then
  if (select array_agg(k order by k) from jsonb_object_keys(p_input) k)<>array['action','actionId','folderId','revision'] or not coalesce(p_input->>'folderId','')~'^[0-9a-f-]{36}$' or jsonb_typeof(p_input->'revision')<>'number' then raise exception 'Invalid trash input' using errcode='22023';end if;
  select * into folder from public.pro_company_folders where owner_id=p_actor and id=(p_input->>'folderId')::uuid for update;
  if not found then raise exception 'Folder unavailable' using errcode='42501';end if;
  if folder.archived or folder.revision<>(p_input->>'revision')::integer then raise exception 'Folder changed' using errcode='40001';end if;
  -- The whole subtree (depth ≤ 5 by the existing tree rule), only items still active.
  with recursive tree(id,depth) as(select folder.id,0 union all select f.id,tree.depth+1 from public.pro_company_folders f join tree on f.parent_id=tree.id where f.owner_id=p_actor and tree.depth<10)
  select array_agg(f.id) into sub from public.pro_company_folders f where f.owner_id=p_actor and f.id in(select id from tree) and not f.archived;
  select coalesce(array_agg(x.id),'{}') into fls from public.pro_company_files x where x.owner_id=p_actor and x.folder_id=any(sub) and not x.archived and x.ready;
  update public.pro_company_files set archived=true,revision=revision+1 where owner_id=p_actor and id=any(fls);
  update public.pro_company_folders set archived=true,revision=revision+1 where owner_id=p_actor and id=any(sub);
  tid:=gen_random_uuid();
  insert into public.pro_company_trash(owner_id,id,folder_id,folder_name,parent_id,folders,files,restore_until)
   values(p_actor,tid,folder.id,folder.name,folder.parent_id,sub,fls,(clock_timestamp() at time zone 'America/Costa_Rica')::date+30) returning * into t;
 elsif act='restore' then
  if (select array_agg(k order by k) from jsonb_object_keys(p_input) k)<>array['action','actionId','trashId'] or not coalesce(p_input->>'trashId','')~'^[0-9a-f-]{36}$' then raise exception 'Invalid restore input' using errcode='22023';end if;
  select * into t from public.pro_company_trash where owner_id=p_actor and id=(p_input->>'trashId')::uuid for update;
  if not found then raise exception 'Trash entry unavailable' using errcode='42501';end if;
  if t.restored_at is not null then raise exception 'Already restored' using errcode='40001';end if;
  -- Parent gone or archived → back at the root (never into an archived folder).
  to_root:=t.parent_id is not null and not exists(select 1 from public.pro_company_folders where owner_id=p_actor and id=t.parent_id and not archived);
  update public.pro_company_folders set archived=false,revision=revision+1,parent_id=case when id=t.folder_id and to_root then null else parent_id end where owner_id=p_actor and id=any(t.folders) and archived;
  update public.pro_company_files set archived=false,revision=revision+1 where owner_id=p_actor and id=any(t.files) and archived;
  update public.pro_company_trash set restored_at=clock_timestamp(),restored_to_root=to_root where owner_id=p_actor and id=t.id returning * into t;
 else raise exception 'Invalid action' using errcode='22023';end if;
 answer:=jsonb_build_object('action',act,'trash',public.pro_company_trash_json(t));
 insert into public.pro_company_trash_actions(owner_id,action_id,input_hash,result) values(p_actor,aid,hash,answer);
 return answer;
end $$;
-- Trash records: only the one-time restore stamp may change; receipts never change.
create or replace function public.pro_company_trash_guard() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' then raise exception 'Trash records are kept' using errcode='23514';end if;
 if tg_table_name='pro_company_trash_actions' then raise exception 'Trash receipts are immutable' using errcode='23514';end if;
 if (to_jsonb(old)->>'restored_at') is not null or (to_jsonb(new)-array['restored_at','restored_to_root']) is distinct from (to_jsonb(old)-array['restored_at','restored_to_root']) then raise exception 'Trash record immutable' using errcode='23514';end if;
 return new;
end $$;
do $$declare t text;f record;begin
 foreach t in array array['pro_company_trash','pro_company_trash_actions'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select,insert,update,delete on public.%I to service_role',t);
  execute format('drop trigger if exists pro_company_trash_guard on public.%I',t);execute format('create trigger pro_company_trash_guard before update or delete on public.%I for each row when (pg_trigger_depth()=0) execute function public.pro_company_trash_guard()',t);end loop;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('pro_company_trash_json','pro_company_trash_read','pro_company_trash_mutate','pro_company_trash_guard') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
commit;
notify pgrst,'reload schema';
