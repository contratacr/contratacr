-- LOCAL PRO ONLY. Round 11 (2026-11-15), leftovers of Round 10 (Houzz Pro parity rows 16 and 62).
--  * Task attachments (row 16): the person who uploaded a task file, or the account owner, can RENAME the
--    name shown and send it to the task's TRASH / RESTORE it. The stored object, its canonical download
--    name, size and digest never change (files stay immutable); a side table keeps the shown name and the
--    trash flag with a revision (CAS 40001), idempotent receipts per actionId and immutable history.
--    pro_team_task_discussion_read lists ready files without the trashed ones; kind «trash» lists those.
--    Same per-job grant rules as the discussion (write grant required).
--  * Selections (row 62): per item, the owner can hide the PRICE and/or the LINK of its options from the
--    customer. The customer read (pro_work_selection_client_item_json) then returns null for unit/total and
--    for the link, plus priceHidden/linkHidden; the owner keeps seeing everything. CAS, receipts, history.
-- Patterns: RLS on, service_role only, security invoker, CAS 40001, idempotent actionId, immutable history.
begin;
create table if not exists public.pro_team_task_file_meta(
 owner_id uuid not null references public.profiles(id) on delete cascade,file_id uuid primary key references public.pro_team_task_files(id) on delete cascade,
 display_name text check(display_name is null or (length(btrim(display_name)) between 1 and 160 and display_name !~ '[[:cntrl:]]')),
 trashed boolean not null default false,trashed_at timestamptz,revision integer not null check(revision>0),updated_at timestamptz not null default clock_timestamp(),
 check(trashed=(trashed_at is not null)));
create table if not exists public.pro_team_task_file_meta_history(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,file_id uuid not null references public.pro_team_task_files(id) on delete cascade,
 actor_id uuid not null,action text not null check(action in('file_rename','file_trash','file_restore')),before_value jsonb not null,after_value jsonb not null,at timestamptz not null default clock_timestamp(),
 primary key(action_id,file_id));
create table if not exists public.pro_team_task_file_meta_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,input jsonb not null,result jsonb not null,at timestamptz not null default clock_timestamp(),primary key(actor_id,action_id));
create table if not exists public.pro_work_selection_item_visibility(
 owner_id uuid not null references public.profiles(id) on delete cascade,item_id uuid not null,work_id text not null,
 hide_price boolean not null default false,hide_link boolean not null default false,revision integer not null check(revision>0),updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,item_id),foreign key(owner_id,item_id) references public.pro_work_selection_items(owner_id,id) on delete cascade);
create table if not exists public.pro_work_selection_visibility_history(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,item_id uuid not null,work_id text not null,before_value jsonb not null,after_value jsonb not null,
 at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id,item_id));
create table if not exists public.pro_work_selection_visibility_actions(
 owner_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,input jsonb not null,result jsonb not null,at timestamptz not null default clock_timestamp(),primary key(owner_id,action_id));
do $$declare t text;begin
 foreach t in array array['pro_team_task_file_meta_history','pro_team_task_file_meta_actions','pro_work_selection_visibility_history','pro_work_selection_visibility_actions'] loop
  execute format('drop trigger if exists %I on public.%I',t||'_immutable',t);
  execute format('create trigger %I before update or delete on public.%I for each row when (pg_trigger_depth()=0) execute function public.pro_round10_immutable()',t||'_immutable',t);
 end loop;
 foreach t in array array['pro_team_task_file_meta','pro_team_task_file_meta_history','pro_team_task_file_meta_actions','pro_work_selection_item_visibility','pro_work_selection_visibility_history','pro_work_selection_visibility_actions'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

-- ===== Task files: shown name and trash =====
create or replace function public.pro_team_task_file_json(p_file public.pro_team_task_files) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_file.id,'taskId',p_file.task_id,'name',p_file.name,'mimeType',p_file.mime_type,'sizeBytes',p_file.size_bytes,'sha256',p_file.sha256,'ready',p_file.ready,'actorId',p_file.actor_id,'actorName',p_file.actor_name,'createdAt',p_file.created_at,
  'displayName',coalesce(m.display_name,p_file.name),'trashed',coalesce(m.trashed,false),'metaRevision',coalesce(m.revision,0))
 from (select 1) one left join public.pro_team_task_file_meta m on m.file_id=p_file.id;
$$;
create or replace function public.pro_team_task_discussion_read(p_actor uuid,p_grant uuid,p_task uuid,p_kind text,p_after uuid default null) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare g public.pro_team_grants;t public.pro_work_tasks;items jsonb;cursor_at timestamptz;cursor_id uuid;trash boolean:=p_kind='trash';
begin
 g:=public.pro_team_task_discussion_context(p_actor,p_grant,p_task,false);
 select * into t from public.pro_work_tasks where owner_id=g.owner_id and work_id=g.work_id and id=p_task;
 if p_kind='comments' then
  if p_after is not null then select at into cursor_at from public.pro_team_task_comments where owner_id=g.owner_id and work_id=g.work_id and task_id=p_task and id=p_after;if not found then raise exception 'Invalid comment cursor' using errcode='22023';end if;end if;
  select coalesce(jsonb_agg(public.pro_team_task_comment_json(c::public.pro_team_task_comments) order by c.at desc,c.id desc),'[]'::jsonb) into items from(select * from public.pro_team_task_comments where owner_id=g.owner_id and work_id=g.work_id and task_id=p_task and (p_after is null or (at,id)<(cursor_at,p_after)) order by at desc,id desc limit 21)c;
 elsif p_kind in('files','trash') then
  if p_after is not null then select created_at into cursor_at from public.pro_team_task_files where owner_id=g.owner_id and work_id=g.work_id and task_id=p_task and id=p_after and ready;if not found then raise exception 'Invalid file cursor' using errcode='22023';end if;end if;
  select coalesce(jsonb_agg(public.pro_team_task_file_json(f::public.pro_team_task_files) order by f.created_at desc,f.id desc),'[]'::jsonb) into items from(
   select x.* from public.pro_team_task_files x left join public.pro_team_task_file_meta m on m.file_id=x.id
   where x.owner_id=g.owner_id and x.work_id=g.work_id and x.task_id=p_task and x.ready and coalesce(m.trashed,false)=trash and (p_after is null or(x.created_at,x.id)<(cursor_at,p_after)) order by x.created_at desc,x.id desc limit 21)f;
 else raise exception 'Invalid discussion view' using errcode='22023';end if;
 if jsonb_array_length(items)>20 then cursor_id:=(items->19->>'id')::uuid;items:=items-20;end if;
 return jsonb_build_object('grant',public.pro_team_shared_grant_json(g,p_actor),'task',public.pro_team_task_json(t),'items',items,'nextCursor',cursor_id);
end $$;
create or replace function public.pro_team_task_file_manage(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;keys text[];aid uuid;g public.pro_team_grants;f public.pro_team_task_files;m public.pro_team_task_file_meta;receipt public.pro_team_task_file_meta_actions;before_json jsonb;answer jsonb;v_name text;
begin
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid file action' using errcode='22023';end if;
 act:=p_input->>'action';select array_agg(x order by x) into keys from jsonb_object_keys(p_input) x;
 if keys is distinct from (case act when 'file_rename' then array['action','actionId','fileId','grantId','name','revision','taskId'] when 'file_trash' then array['action','actionId','fileId','grantId','revision','taskId'] when 'file_restore' then array['action','actionId','fileId','grantId','revision','taskId'] end)
  or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,9}$',false) then raise exception 'Unexpected file action fields' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;g:=public.pro_team_task_discussion_context(p_actor,(p_input->>'grantId')::uuid,(p_input->>'taskId')::uuid,true);
  select * into f from public.pro_team_task_files where id=(p_input->>'fileId')::uuid and owner_id=g.owner_id and work_id=g.work_id and task_id=(p_input->>'taskId')::uuid and ready;
 exception when invalid_text_representation then raise exception 'Invalid identifiers' using errcode='22023';end;
 if f.id is null then raise exception 'File unavailable' using errcode='P0002';end if;
 if p_actor<>g.owner_id and f.actor_id<>p_actor then raise exception 'Only the owner or the uploader' using errcode='42501';end if;
 if act='file_rename' then
  if jsonb_typeof(p_input->'name') is distinct from 'string' then raise exception 'Invalid name' using errcode='22023';end if;
  v_name:=btrim(p_input->>'name');if length(v_name) not between 1 and 160 or v_name ~ '[[:cntrl:]]' then raise exception 'Invalid name' using errcode='22023';end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-task-file-meta:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_team_task_file_meta_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result||jsonb_build_object('replayed',true);end if;
 -- Fix 13: serialize per file BEFORE reading the revision, so two first writes (revision 0) give one 409.
 perform pg_advisory_xact_lock(hashtextextended('pro-task-file-meta-target:'||f.id::text,0));
 select * into m from public.pro_team_task_file_meta where file_id=f.id for update;
 if coalesce(m.revision,0)<>(p_input->>'revision')::integer then raise exception 'File changed' using errcode='40001';end if;
 if act='file_trash' and coalesce(m.trashed,false) or act='file_restore' and not coalesce(m.trashed,false) then raise exception 'Nothing to change' using errcode='22023';end if;
 before_json:=jsonb_build_object('displayName',coalesce(m.display_name,f.name),'trashed',coalesce(m.trashed,false));
 insert into public.pro_team_task_file_meta(owner_id,file_id,display_name,trashed,trashed_at,revision)
  values(g.owner_id,f.id,case when act='file_rename' then v_name end,act='file_trash',case when act='file_trash' then clock_timestamp() end,1)
  on conflict(file_id) do update set display_name=case when act='file_rename' then v_name else public.pro_team_task_file_meta.display_name end,
   trashed=case when act='file_rename' then public.pro_team_task_file_meta.trashed else act='file_trash' end,
   trashed_at=case when act='file_rename' then public.pro_team_task_file_meta.trashed_at when act='file_trash' then clock_timestamp() end,
   revision=public.pro_team_task_file_meta.revision+1,updated_at=clock_timestamp();
 answer:=jsonb_build_object('action',act,'file',public.pro_team_task_file_json(f));
 insert into public.pro_team_task_file_meta_history(owner_id,action_id,file_id,actor_id,action,before_value,after_value)
  values(g.owner_id,aid,f.id,p_actor,act,before_json,jsonb_build_object('displayName',answer->'file'->'displayName','trashed',answer->'file'->'trashed'));
 insert into public.pro_team_task_file_meta_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,answer);
 return answer;
end $$;
-- A trashed file can still be downloaded by its id (it is kept, not deleted); lists hide it.

-- ===== Selections: hide price / link from the customer per item =====
create or replace function public.pro_work_selection_visibility_json(p_owner uuid,p_item uuid) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('hidePrice',coalesce(v.hide_price,false),'hideLink',coalesce(v.hide_link,false),'revision',coalesce(v.revision,0))
 from (select 1) one left join public.pro_work_selection_item_visibility v on v.owner_id=p_owner and v.item_id=p_item $$;
create or replace function public.pro_work_selection_visibility_read(p_owner uuid,p_work text) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 then raise exception 'Invalid work' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_owner and id=p_work) then return null;end if;
 return jsonb_build_object('workId',p_work,'items',coalesce((select jsonb_agg(jsonb_build_object('itemId',i.id,'name',i.name,'areaName',a.name,'published',i.published)||public.pro_work_selection_visibility_json(p_owner,i.id) order by a.position,i.position)
  from public.pro_work_selection_items i join public.pro_work_selection_areas a on a.owner_id=i.owner_id and a.id=i.area_id where i.owner_id=p_owner and i.work_id=p_work and not i.archived and not a.archived),'[]'::jsonb));
end $$;
create or replace function public.pro_work_selection_visibility_mutate(p_owner uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare keys text[];aid uuid;wid text;receipt public.pro_work_selection_visibility_actions;ref jsonb;item public.pro_work_selection_items;v public.pro_work_selection_item_visibility;before_json jsonb;n integer:=0;answer jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_owner),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select array_agg(x order by x) into keys from jsonb_object_keys(p_input) x;
 if jsonb_typeof(p_input) is distinct from 'object' or keys is distinct from array['action','actionId','items','workId'] or p_input->>'action'<>'visibility_set' or jsonb_typeof(p_input->'workId') is distinct from 'string'
  or jsonb_typeof(p_input->'items') is distinct from 'array' or jsonb_array_length(p_input->'items') not between 1 and 100 then raise exception 'Invalid visibility action' using errcode='22023';end if;
 begin aid:=(p_input->>'actionId')::uuid;exception when others then raise exception 'Invalid action id' using errcode='22023';end;
 wid:=p_input->>'workId';if not exists(select 1 from public.pro_work where user_id=p_owner and id=wid) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-selection-visibility:'||p_owner::text||':'||aid::text,0));
 select * into receipt from public.pro_work_selection_visibility_actions where owner_id=p_owner and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action id reused' using errcode='22023';end if;return receipt.result||jsonb_build_object('replayed',true);end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-selection:'||p_owner::text||':'||wid,0));
 for ref in select value from jsonb_array_elements(p_input->'items') loop
  select array_agg(x order by x) into keys from jsonb_object_keys(ref) x;
  if keys is distinct from array['hideLink','hidePrice','itemId','revision'] or jsonb_typeof(ref->'hidePrice') is distinct from 'boolean' or jsonb_typeof(ref->'hideLink') is distinct from 'boolean'
   or jsonb_typeof(ref->'revision') is distinct from 'number' or not coalesce(ref->>'revision'~'^[0-9]{1,9}$',false) then raise exception 'Invalid visibility item' using errcode='22023';end if;
  begin select * into item from public.pro_work_selection_items where owner_id=p_owner and work_id=wid and id=(ref->>'itemId')::uuid and not archived;exception when others then raise exception 'Invalid item' using errcode='22023';end;
  if item.id is null then raise exception 'Item unavailable' using errcode='P0002';end if;
  select * into v from public.pro_work_selection_item_visibility where owner_id=p_owner and item_id=item.id for update;
  if coalesce(v.revision,0)<>(ref->>'revision')::integer then raise exception 'Visibility changed' using errcode='40001';end if;
  before_json:=public.pro_work_selection_visibility_json(p_owner,item.id);
  insert into public.pro_work_selection_item_visibility(owner_id,item_id,work_id,hide_price,hide_link,revision) values(p_owner,item.id,wid,(ref->>'hidePrice')::boolean,(ref->>'hideLink')::boolean,1)
   on conflict(owner_id,item_id) do update set hide_price=excluded.hide_price,hide_link=excluded.hide_link,revision=public.pro_work_selection_item_visibility.revision+1,updated_at=clock_timestamp();
  insert into public.pro_work_selection_visibility_history(owner_id,action_id,item_id,work_id,before_value,after_value) values(p_owner,aid,item.id,wid,before_json,public.pro_work_selection_visibility_json(p_owner,item.id));
  n:=n+1;item:=null;
 end loop;
 answer:=jsonb_build_object('action','visibility_set','updated',n);
 insert into public.pro_work_selection_visibility_actions(owner_id,action_id,input,result) values(p_owner,aid,p_input,answer);
 return answer;
end $$;
-- Supersedes selection-catalog-local.sql: the customer copy honours «hide price» and «hide link».
create or replace function public.pro_work_selection_client_item_json(p_row public.pro_work_selection_items) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'areaId',p_row.area_id,'name',p_row.name,'dueDate',p_row.due_date,'state',public.pro_work_selection_state(p_row),
  'approvedOptionId',p_row.approved_option_id,'approvedAt',p_row.approved_at,'clientComment',p_row.client_comment,'recommendedOptionId',p_row.recommended_option_id,'revision',p_row.revision,
  'priceHidden',coalesce(v.hide_price,false),'linkHidden',coalesce(v.hide_link,false),
  'options',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'brand',o.brand,'url',case when coalesce(v.hide_link,false) then null else o.url end,'quantity',o.quantity,
   'unitCents',case when coalesce(v.hide_price,false) then null else o.unit_cents end,'totalCents',case when coalesce(v.hide_price,false) then null else o.total_cents end,
   'clientNotes',o.client_notes,'hasImage',o.image_file_id is not null or exists(select 1 from public.pro_work_selection_option_sources s where s.owner_id=o.owner_id and s.option_id=o.id and s.image_path is not null)) order by o.position) from public.pro_work_selection_options o where o.owner_id=p_row.owner_id and o.item_id=p_row.id and not o.archived),'[]'::jsonb))
 from (select 1) one left join public.pro_work_selection_item_visibility v on v.owner_id=p_row.owner_id and v.item_id=p_row.id;
$$;
do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in(
  'pro_team_task_file_json','pro_team_task_discussion_read','pro_team_task_file_manage','pro_work_selection_visibility_json','pro_work_selection_visibility_read','pro_work_selection_visibility_mutate','pro_work_selection_client_item_json') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
commit;
notify pgrst,'reload schema';
