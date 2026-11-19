-- LOCAL PRO ONLY. «Versiones y comentarios por documento» (registro de paridad, fila 30).
-- Builds on work-files-local.sql WITHOUT altering it: pro_work_files rows stay immutable,
-- uploads keep using the existing reserve/ready route, and sharing keeps using the
-- existing explicit pro_work_file_publish (one file = one delivery record).
--
-- Model
--  * A family groups files of one job (pro_work). Its id is the id of its first file (the
--    root). A file that never got a new version is an implicit family of one (v1); the row
--    in pro_work_file_families is created lazily on the first add_version.
--  * pro_work_file_versions is an append-only list v1, v2, … Each entry points at an
--    existing ready pro_work_files row. add_version attaches a freshly uploaded (or any
--    standalone ready) file of the same job; restore appends a NEW entry that points at
--    the file of an older entry (nothing is deleted or rewritten). The family keeps a
--    pointer to the current entry.
--  * Sharing is never implicit: what the customer received stays exactly the file(s) the
--    owner published explicitly. Adding or restoring a version does not publish anything;
--    the interface offers «Compartir esta versión», which calls the existing publish.
--  * Comments live per family in two threads: 'team' (private: never returned by any
--    customer reader) and 'client' (only on a family with at least one shared version; the
--    linked customer may comment on the version shared with them). Text 1..2000, edit
--    keeps immutable history, archive/restore. A file that already has its own discussion
--    cannot be attached as a version of another family (no silent thread merges).
--  * Collaborators (pro_team_grants) have no access to job files today, so the team thread
--    is owner-only in this module; author identity is stored so it can widen later.
--
-- Pattern (client-dashboard-local.sql): closed RLS + revoke, security invoker RPCs for
-- service_role only, eligibility pro_private_work_tools_enabled(p_actor) for the owner,
-- optimistic revision (40001 -> 409), idempotent receipts per actionId (same id + other
-- payload -> 22023), immutable versions/history/receipts, Costa Rica dates (dayCr).
-- Limits: 100 version entries per family, 500 comments per family (54000 -> 429).
-- Lock order (owner and customer): action advisory -> 'pro-work-files:<owner>:<work>'
-- advisory (the same key the existing reserve/publish use) -> family -> comment rows.
-- Reapplicable; only new objects.
-- Customer view setting (QA fase 2, P2-6): when the owner hides «Archivos y fotos»
-- (pro_client_dashboards.show_files=false) the customer reader and writer of THIS module (shared
-- versions + client thread) answer as unavailable (null -> 404, 42501 -> 403). The inherited file
-- listing and download of work-files-local.sql (pro_work_files_client_read / pro_work_file_download)
-- are NOT gated: there hiding the section stays a presentation preference (client-dashboard-local.sql).
begin;
create table if not exists public.pro_work_file_families(
 owner_id uuid not null references public.profiles(id) on delete cascade,work_id text not null,id uuid not null,
 current_version smallint not null check(current_version between 1 and 100),version_count smallint not null check(version_count between 2 and 100),
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,id),check(current_version<=version_count),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade,
 foreign key(owner_id,work_id,id) references public.pro_work_files(owner_id,work_id,id) on delete cascade
);
create unique index if not exists pro_work_file_family_global_id on public.pro_work_file_families(id);
create table if not exists public.pro_work_file_family_members(
 file_id uuid primary key,owner_id uuid not null,work_id text not null,family_id uuid not null,
 unique(owner_id,family_id,file_id),
 foreign key(owner_id,work_id,file_id) references public.pro_work_files(owner_id,work_id,id) on delete cascade,
 foreign key(owner_id,family_id) references public.pro_work_file_families(owner_id,id) on delete cascade
);
create table if not exists public.pro_work_file_versions(
 owner_id uuid not null,work_id text not null,family_id uuid not null,version_no smallint not null check(version_no between 1 and 100),
 file_id uuid not null,kind text not null check(kind in('original','upload','restore')),restored_from smallint check(restored_from between 1 and 99),
 note text check(note is null or length(btrim(note)) between 1 and 500),created_by uuid not null,created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,family_id,version_no),
 check((kind='restore')=(restored_from is not null)),check(restored_from is null or restored_from<version_no),
 check((kind='original')=(version_no=1)),
 foreign key(owner_id,family_id,file_id) references public.pro_work_file_family_members(owner_id,family_id,file_id) on delete cascade
);
create index if not exists pro_work_file_versions_file on public.pro_work_file_versions(owner_id,file_id);
create table if not exists public.pro_work_file_comments(
 owner_id uuid not null,work_id text not null,family_id uuid not null,id uuid not null,
 thread text not null check(thread in('team','client')),version_no smallint check(version_no between 1 and 100),
 author_kind text not null check(author_kind in('owner','client')),author_id uuid not null,author_name text not null check(length(author_name)<=160),
 body text not null check(length(btrim(body)) between 1 and 2000),
 revision integer not null default 1 check(revision>0),edited_at timestamptz,archived_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,id),check(author_kind='owner' or thread='client'),check(thread='team' or version_no is not null),
 -- The family root is a pro_work_files row (also for implicit one-file families).
 foreign key(owner_id,work_id,family_id) references public.pro_work_files(owner_id,work_id,id) on delete cascade
);
create unique index if not exists pro_work_file_comment_global_id on public.pro_work_file_comments(id);
create index if not exists pro_work_file_comment_page on public.pro_work_file_comments(owner_id,family_id,thread,created_at desc,id desc);
create table if not exists public.pro_work_file_comment_history(
 owner_id uuid not null,comment_id uuid not null,action_id uuid not null,actor_id uuid not null,
 action text not null check(action in('create','edit','archive','restore')),before_value jsonb,after_value jsonb not null,at timestamptz not null default clock_timestamp(),
 primary key(owner_id,comment_id,action_id),foreign key(owner_id,comment_id) references public.pro_work_file_comments(owner_id,id) on delete cascade
);
create index if not exists pro_work_file_comment_history_page on public.pro_work_file_comment_history(owner_id,comment_id,at desc);
create table if not exists public.pro_work_file_version_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input jsonb not null,result jsonb not null,at timestamptz not null default clock_timestamp(),primary key(actor_id,action_id)
);

-- ===================================================================== helpers
create or replace function public.pro_wfv_uuid(p_value jsonb) returns uuid
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
begin
 if jsonb_typeof(p_value) is distinct from 'string' or not (p_value#>>'{}')~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then raise exception 'Invalid identifier' using errcode='22023';end if;
 return lower(p_value#>>'{}')::uuid;
end $$;
-- Trimmed multi-line text without control characters; null/empty -> null (22023 when required).
create or replace function public.pro_wfv_text(p_value jsonb,p_max integer,p_required boolean) returns text
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare t text;
begin
 if p_value is null or jsonb_typeof(p_value)='null' then if p_required then raise exception 'Missing text' using errcode='22023';end if;return null;end if;
 if jsonb_typeof(p_value)<>'string' then raise exception 'Invalid text' using errcode='22023';end if;
 t:=btrim(p_value#>>'{}',E' \t\r\n');
 if t='' then if p_required then raise exception 'Missing text' using errcode='22023';end if;return null;end if;
 if length(t)>p_max or t~'[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' then raise exception 'Invalid text' using errcode='22023';end if;
 return t;
end $$;
create or replace function public.pro_wfv_int(p_value jsonb,p_min integer,p_max integer) returns integer
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
begin
 if jsonb_typeof(p_value) is distinct from 'number' or not (p_value#>>'{}')~'^[0-9]{1,10}$' or (p_value#>>'{}')::numeric not between p_min and p_max then raise exception 'Invalid number' using errcode='22023';end if;
 return (p_value#>>'{}')::integer;
end $$;
create or replace function public.pro_wfv_keys(p_input jsonb) returns text[]
language sql immutable security invoker set search_path=public,pg_temp as $$
 select coalesce(array_agg(k order by k),'{}') from jsonb_object_keys(case when jsonb_typeof(p_input)='object' then p_input else '{}'::jsonb end) k;
$$;
create or replace function public.pro_wfv_day(p_at timestamptz) returns text
language sql stable security invoker set search_path=public,pg_temp as $$ select to_char(p_at at time zone 'America/Costa_Rica','YYYY-MM-DD'); $$;
-- Family root of a ready file of this owner/job: its family id, or the file itself (implicit v1).
create or replace function public.pro_wfv_root(p_owner uuid,p_work text,p_file uuid) returns uuid
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(m.family_id,f.id) from public.pro_work_files f left join public.pro_work_file_family_members m on m.file_id=f.id and m.owner_id=f.owner_id
 where f.owner_id=p_owner and f.work_id=p_work and f.id=p_file and f.ready;
$$;
create or replace function public.pro_wfv_comment_json(p_row public.pro_work_file_comments) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_row.id,'familyId',p_row.family_id,'thread',p_row.thread,'versionNo',p_row.version_no,
  'authorKind',p_row.author_kind,'authorName',p_row.author_name,'body',p_row.body,'revision',p_row.revision,
  'edited',p_row.edited_at is not null,'editedAt',p_row.edited_at,'archived',p_row.archived_at is not null,'archivedAt',p_row.archived_at,
  'createdAt',p_row.created_at,'dayCr',public.pro_wfv_day(p_row.created_at));
$$;
-- Versions of a family, newest first. Implicit families return a single synthetic v1.
create or replace function public.pro_wfv_versions_json(p_owner uuid,p_work text,p_root uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce((select jsonb_agg(jsonb_build_object('versionNo',v.version_no,'fileId',v.file_id,'kind',v.kind,'restoredFrom',v.restored_from,'note',v.note,
   'createdAt',v.created_at,'dayCr',public.pro_wfv_day(v.created_at),'shared',f.revision=2,'file',public.pro_work_file_json(f)) order by v.version_no desc)
  from public.pro_work_file_versions v join public.pro_work_files f on f.id=v.file_id and f.owner_id=v.owner_id
  where v.owner_id=p_owner and v.work_id=p_work and v.family_id=p_root),
  (select jsonb_build_array(jsonb_build_object('versionNo',1,'fileId',f.id,'kind','original','restoredFrom',null,'note',null,
   'createdAt',f.created_at,'dayCr',public.pro_wfv_day(f.created_at),'shared',f.revision=2,'file',public.pro_work_file_json(f)))
  from public.pro_work_files f where f.owner_id=p_owner and f.work_id=p_work and f.id=p_root and f.ready),'[]'::jsonb);
$$;
create or replace function public.pro_wfv_state(p_owner uuid,p_work text,p_root uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare fam public.pro_work_file_families;cur uuid;counts jsonb;recipient uuid;recipient_name text;can_share boolean;
begin
 select * into fam from public.pro_work_file_families where owner_id=p_owner and id=p_root;
 if found then select file_id into cur from public.pro_work_file_versions where owner_id=p_owner and family_id=p_root and version_no=fam.current_version;
 else cur:=p_root;end if;
 select jsonb_build_object('team',count(*) filter(where thread='team' and archived_at is null),'client',count(*) filter(where thread='client' and archived_at is null),
  'teamArchived',count(*) filter(where thread='team' and archived_at is not null),'clientArchived',count(*) filter(where thread='client' and archived_at is not null))
  into counts from public.pro_work_file_comments where owner_id=p_owner and family_id=p_root;
 -- Same recipient rule as pro_work_files_read: «Compartir esta versión» uses the existing publish.
 select r.client_user_id,r.client_name into recipient,recipient_name from public.pro_appointment_requests r
  join public.pro_work w on w.user_id=r.owner_id and w.id=r.work_id join public.profiles c on c.id=r.client_user_id
  where r.owner_id=p_owner and r.work_id=p_work and r.status in('confirmed','completed') and not coalesce(w.cancelled,false) and not coalesce(c.is_disabled,false)
  order by r.updated_at desc,r.id desc limit 1;
 can_share:=found;
 return jsonb_build_object('familyId',p_root,'workId',p_work,'revision',coalesce(fam.revision,0),'currentVersionNo',coalesce(fam.current_version,1),'currentFileId',cur,
  'versionCount',coalesce(fam.version_count,1),'versions',public.pro_wfv_versions_json(p_owner,p_work,p_root),'counts',counts,
  'canShare',can_share,'recipientId',recipient,'recipientName',recipient_name);
end $$;

-- ===================================================================== owner reads
-- p_comment -> one comment with its edit history; p_thread -> a comment page (20, newest
-- first, cursor = comment id); otherwise -> the family state (versions + counts).
create or replace function public.pro_work_file_versions_read(p_actor uuid,p_work text,p_file uuid,p_thread text default null,p_archived boolean default false,p_after uuid default null,p_comment uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare root uuid;c public.pro_work_file_comments;hist jsonb;items jsonb;cursor_at timestamptz;next_id uuid;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 or p_file is null or p_archived is null or (p_thread is not null and p_thread not in('team','client'))
 or (p_comment is not null and (p_thread is not null or p_after is not null)) or (p_after is not null and p_thread is null) then raise exception 'Invalid version query' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then return null;end if;
 root:=public.pro_wfv_root(p_actor,p_work,p_file);
 if root is null then return null;end if;
 if p_comment is not null then
  select * into c from public.pro_work_file_comments where owner_id=p_actor and family_id=root and id=p_comment;
  if not found then return null;end if;
  select coalesce(jsonb_agg(x.content order by x.at desc),'[]'::jsonb) into hist from (
   select h.at,jsonb_build_object('actionId',h.action_id,'action',h.action,'at',h.at,'dayCr',public.pro_wfv_day(h.at),'before',h.before_value,'after',h.after_value) content
   from public.pro_work_file_comment_history h where h.owner_id=p_actor and h.comment_id=p_comment order by h.at desc limit 50) x;
  return jsonb_build_object('comment',public.pro_wfv_comment_json(c),'history',hist);
 end if;
 if p_thread is null then return public.pro_wfv_state(p_actor,p_work,root);end if;
 if p_after is not null then
  select created_at into cursor_at from public.pro_work_file_comments where owner_id=p_actor and family_id=root and thread=p_thread and id=p_after;
  if not found then raise exception 'Invalid comment cursor' using errcode='22023';end if;
 end if;
 select coalesce(jsonb_agg(public.pro_wfv_comment_json(x::public.pro_work_file_comments) order by x.created_at desc,x.id desc),'[]'::jsonb) into items from (
  select * from public.pro_work_file_comments where owner_id=p_actor and family_id=root and thread=p_thread and (archived_at is not null)=p_archived
  and (p_after is null or (created_at,id)<(cursor_at,p_after)) order by created_at desc,id desc limit 21) x;
 if jsonb_array_length(items)>20 then next_id:=(items->19->>'id')::uuid;items:=items-20;end if;
 return jsonb_build_object('familyId',root,'thread',p_thread,'archived',p_archived,'items',items,'nextCursor',next_id);
end $$;
-- Badges for one page of the Archivos list (≤20 ids). Files not in a family are omitted (implicit v1).
create or replace function public.pro_work_file_versions_index(p_actor uuid,p_work text,p_files uuid[]) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare items jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 or p_files is null or cardinality(p_files)>20 or array_position(p_files,null) is not null then raise exception 'Invalid version index' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then return null;end if;
 select coalesce(jsonb_agg(jsonb_build_object('fileId',f.id,'familyId',coalesce(m.family_id,f.id),
   'versionNo',coalesce((select max(v.version_no) from public.pro_work_file_versions v where v.owner_id=p_actor and v.family_id=m.family_id and v.file_id=f.id),1),
   'versionCount',coalesce(fam.version_count,1),'currentVersionNo',coalesce(fam.current_version,1),
   'current',fam.id is null or exists(select 1 from public.pro_work_file_versions v where v.owner_id=p_actor and v.family_id=fam.id and v.version_no=fam.current_version and v.file_id=f.id),
   'teamComments',(select count(*) from public.pro_work_file_comments c where c.owner_id=p_actor and c.family_id=coalesce(m.family_id,f.id) and c.thread='team' and c.archived_at is null),
   'clientComments',(select count(*) from public.pro_work_file_comments c where c.owner_id=p_actor and c.family_id=coalesce(m.family_id,f.id) and c.thread='client' and c.archived_at is null))
  order by f.id),'[]'::jsonb) into items
 from public.pro_work_files f left join public.pro_work_file_family_members m on m.file_id=f.id and m.owner_id=f.owner_id
 left join public.pro_work_file_families fam on fam.owner_id=p_actor and fam.id=m.family_id
 where f.owner_id=p_actor and f.work_id=p_work and f.id=any(p_files) and f.ready
 and (m.family_id is not null or exists(select 1 from public.pro_work_file_comments c where c.owner_id=p_actor and c.family_id=f.id));
 return jsonb_build_object('workId',p_work,'items',items);
end $$;

-- ===================================================================== owner mutations
create or replace function public.pro_work_file_versions_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;keys text[];wid text;aid uuid;receipt public.pro_work_file_version_actions;result jsonb;root uuid;fid uuid;nfid uuid;
 fam public.pro_work_file_families;base public.pro_work_files;nf public.pro_work_files;rev integer;vno integer;v_note text;target public.pro_work_file_versions;
 c public.pro_work_file_comments;cid uuid;v_body text;v_thread text;before_json jsonb;author text;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' then raise exception 'Invalid version action' using errcode='22023';end if;
 act:=p_input->>'action';keys:=public.pro_wfv_keys(p_input);
 if keys is distinct from (case act
  when 'add_version' then array['action','actionId','fileId','newFileId','note','revision','workId']
  when 'restore' then array['action','actionId','fileId','note','revision','versionNo','workId']
  when 'comment_create' then array['action','actionId','body','commentId','fileId','thread','versionNo','workId']
  when 'comment_edit' then array['action','actionId','body','commentId','revision','workId']
  when 'comment_archive' then array['action','actionId','commentId','revision','workId']
  when 'comment_restore' then array['action','actionId','commentId','revision','workId'] end) then raise exception 'Invalid version fields' using errcode='22023';end if;
 if jsonb_typeof(p_input->'workId') is distinct from 'string' or length(p_input->>'workId') not between 1 and 160 then raise exception 'Invalid job' using errcode='22023';end if;
 wid:=p_input->>'workId';aid:=public.pro_wfv_uuid(p_input->'actionId');
 if p_input?'revision' then rev:=public.pro_wfv_int(p_input->'revision',0,2147483646);end if;
 if p_input?'note' then v_note:=public.pro_wfv_text(p_input->'note',500,false);end if;
 if p_input?'body' then v_body:=public.pro_wfv_text(p_input->'body',2000,true);end if;
 if p_input?'fileId' then fid:=public.pro_wfv_uuid(p_input->'fileId');end if;
 if p_input?'newFileId' then nfid:=public.pro_wfv_uuid(p_input->'newFileId');end if;
 if p_input?'commentId' then cid:=public.pro_wfv_uuid(p_input->'commentId');end if;
 if act='restore' then vno:=public.pro_wfv_int(p_input->'versionNo',1,100);end if;
 if act='comment_create' then
  if jsonb_typeof(p_input->'thread') is distinct from 'string' or p_input->>'thread' not in('team','client') then raise exception 'Invalid thread' using errcode='22023';end if;
  v_thread:=p_input->>'thread';
  if jsonb_typeof(p_input->'versionNo')<>'null' then vno:=public.pro_wfv_int(p_input->'versionNo',1,100);end if;
  if v_thread='client' and vno is null then raise exception 'Customer comments refer to a shared version' using errcode='22023';end if;
 end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-wfv-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_work_file_version_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-files:'||p_actor::text||':'||wid,0));

 if act in('add_version','restore','comment_create') then
  root:=public.pro_wfv_root(p_actor,wid,fid);
  if root is null then raise exception 'File unavailable' using errcode='42501';end if;
  select * into fam from public.pro_work_file_families where owner_id=p_actor and id=root for update;
  if coalesce(fam.revision,0)<>coalesce(rev,coalesce(fam.revision,0)) then raise exception 'Versions changed' using errcode='40001';end if;
 end if;

 if act='add_version' then
  if nfid=fid or nfid=root then raise exception 'Same file' using errcode='22023';end if;
  select * into nf from public.pro_work_files where owner_id=p_actor and work_id=wid and id=nfid for share;
  if not found then raise exception 'File unavailable' using errcode='42501';end if;
  if not nf.ready then raise exception 'Upload is not ready' using errcode='22023';end if;
  if exists(select 1 from public.pro_work_file_family_members where file_id=nfid) or exists(select 1 from public.pro_work_file_families where owner_id=p_actor and id=nfid) then raise exception 'File already belongs to a version list' using errcode='22023';end if;
  if exists(select 1 from public.pro_work_file_comments where owner_id=p_actor and family_id=nfid) then raise exception 'File has its own discussion' using errcode='22023';end if;
  if fam.id is null then
   select * into base from public.pro_work_files where owner_id=p_actor and work_id=wid and id=root;
   insert into public.pro_work_file_families(owner_id,work_id,id,current_version,version_count) values(p_actor,wid,root,2,2) returning * into fam;
   insert into public.pro_work_file_family_members(file_id,owner_id,work_id,family_id) values(root,p_actor,wid,root),(nfid,p_actor,wid,root);
   insert into public.pro_work_file_versions(owner_id,work_id,family_id,version_no,file_id,kind,note,created_by,created_at) values(p_actor,wid,root,1,root,'original',null,p_actor,base.created_at);
   insert into public.pro_work_file_versions(owner_id,work_id,family_id,version_no,file_id,kind,note,created_by) values(p_actor,wid,root,2,nfid,'upload',v_note,p_actor);
  else
   if fam.version_count>=100 then raise exception 'Version limit reached' using errcode='54000';end if;
   insert into public.pro_work_file_family_members(file_id,owner_id,work_id,family_id) values(nfid,p_actor,wid,root);
   insert into public.pro_work_file_versions(owner_id,work_id,family_id,version_no,file_id,kind,note,created_by) values(p_actor,wid,root,fam.version_count+1,nfid,'upload',v_note,p_actor);
   update public.pro_work_file_families set version_count=version_count+1,current_version=version_count+1,revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor and id=root;
  end if;
  result:=jsonb_build_object('family',public.pro_wfv_state(p_actor,wid,root));
 elsif act='restore' then
  if fam.id is null then raise exception 'Nothing to restore' using errcode='22023';end if;
  select * into target from public.pro_work_file_versions where owner_id=p_actor and family_id=root and version_no=vno;
  if not found then raise exception 'Version unavailable' using errcode='22023';end if;
  if vno=fam.current_version then raise exception 'Version is already current' using errcode='22023';end if;
  if fam.version_count>=100 then raise exception 'Version limit reached' using errcode='54000';end if;
  insert into public.pro_work_file_versions(owner_id,work_id,family_id,version_no,file_id,kind,restored_from,note,created_by) values(p_actor,wid,root,fam.version_count+1,target.file_id,'restore',vno,v_note,p_actor);
  update public.pro_work_file_families set version_count=version_count+1,current_version=version_count+1,revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor and id=root;
  result:=jsonb_build_object('family',public.pro_wfv_state(p_actor,wid,root));
 elsif act='comment_create' then
  if exists(select 1 from public.pro_work_file_comments where id=cid) then raise exception 'Comment identity reused' using errcode='22023';end if;
  if vno is not null and vno>coalesce(fam.version_count,1) then raise exception 'Version unavailable' using errcode='22023';end if;
  if v_thread='client' and not exists(
   select 1 from public.pro_work_files f where f.owner_id=p_actor and f.revision=2 and f.id=case when fam.id is null then root else (select v.file_id from public.pro_work_file_versions v where v.owner_id=p_actor and v.family_id=root and v.version_no=vno) end)
  then raise exception 'Customer thread needs a shared version' using errcode='22023';end if;
  if (select count(*) from public.pro_work_file_comments where owner_id=p_actor and family_id=root)>=500 then raise exception 'Comment limit reached' using errcode='54000';end if;
  select coalesce(left(btrim(full_name),160),'') into author from public.profiles where id=p_actor;
  insert into public.pro_work_file_comments(owner_id,work_id,family_id,id,thread,version_no,author_kind,author_id,author_name,body)
   values(p_actor,wid,root,cid,v_thread,vno,'owner',p_actor,coalesce(author,''),v_body) returning * into c;
  insert into public.pro_work_file_comment_history(owner_id,comment_id,action_id,actor_id,action,before_value,after_value) values(p_actor,cid,aid,p_actor,'create',null,public.pro_wfv_comment_json(c));
  result:=jsonb_build_object('comment',public.pro_wfv_comment_json(c));
 else
  select * into c from public.pro_work_file_comments where owner_id=p_actor and work_id=wid and id=cid for update;
  if not found then raise exception 'Comment unavailable' using errcode='42501';end if;
  if c.revision<>rev then raise exception 'Comment changed' using errcode='40001';end if;
  before_json:=public.pro_wfv_comment_json(c);
  if act='comment_edit' then
   -- The owner edits only their own text; customer comments can only be archived.
   if c.author_kind<>'owner' or c.author_id<>p_actor then raise exception 'Only the author can edit' using errcode='42501';end if;
   if c.archived_at is not null then raise exception 'Archived comment' using errcode='22023';end if;
   if c.body=v_body then raise exception 'No comment changes' using errcode='22023';end if;
   update public.pro_work_file_comments set body=v_body,edited_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor and id=cid returning * into c;
  elsif act='comment_archive' then
   if c.archived_at is not null then raise exception 'Already archived' using errcode='22023';end if;
   update public.pro_work_file_comments set archived_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor and id=cid returning * into c;
  else
   if c.archived_at is null then raise exception 'Not archived' using errcode='22023';end if;
   update public.pro_work_file_comments set archived_at=null,revision=revision+1,updated_at=clock_timestamp() where owner_id=p_actor and id=cid returning * into c;
  end if;
  insert into public.pro_work_file_comment_history(owner_id,comment_id,action_id,actor_id,action,before_value,after_value)
   values(p_actor,cid,aid,p_actor,case act when 'comment_edit' then 'edit' when 'comment_archive' then 'archive' else 'restore' end,before_json,public.pro_wfv_comment_json(c));
  result:=jsonb_build_object('comment',public.pro_wfv_comment_json(c));
 end if;
 insert into public.pro_work_file_version_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- Presentation setting of the customer view; no row = visible (same default as the dashboard).
create or replace function public.pro_wfv_client_files_visible(p_owner uuid,p_work text) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce((select d.show_files from public.pro_client_dashboards d where d.owner_id=p_owner and d.work_id=p_work),true) $$;

-- ===================================================================== customer side
-- The linked customer of p_request sees, for a file shared with them: its version label,
-- the versions shared with them in that family (never private ones) and the 'client'
-- thread (owner replies + their own comments; archived ones are hidden).
create or replace function public.pro_work_file_client_discussion_read(p_actor uuid,p_request uuid,p_file uuid,p_after uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare owner uuid;wid text;req_status text;pro_name text;f public.pro_work_files;root uuid;shared jsonb;items jsonb;cursor_at timestamptz;next_id uuid;my_version integer;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_request is null or p_file is null then raise exception 'Invalid discussion query' using errcode='22023';end if;
 select owner_id,work_id,status,professional_name into owner,wid,req_status,pro_name from public.pro_appointment_requests where id=p_request and client_user_id=p_actor and work_id is not null;
 if not found then return null;end if;
 if not public.pro_wfv_client_files_visible(owner,wid) then return null;end if;
 select * into f from public.pro_work_files where id=p_file and owner_id=owner and work_id=wid and ready and revision=2 and client_user_id=p_actor;
 if not found then return null;end if;
 root:=public.pro_wfv_root(owner,wid,p_file);
 select coalesce(jsonb_agg(jsonb_build_object('versionNo',x.version_no,'fileId',x.id,'name',x.name,'publishedAt',x.published_at,'dayCr',public.pro_wfv_day(x.published_at)) order by x.version_no desc),'[]'::jsonb) into shared from (
  select distinct on (sf.id) sf.id,sf.name,sf.published_at,coalesce(v.version_no,1) version_no from public.pro_work_files sf
  left join public.pro_work_file_versions v on v.owner_id=owner and v.family_id=root and v.file_id=sf.id
  where sf.owner_id=owner and sf.work_id=wid and sf.ready and sf.revision=2 and sf.client_user_id=p_actor and coalesce(v.family_id,sf.id)=root
  order by sf.id,v.version_no desc nulls last) x;
 select coalesce(max(v.version_no),1) into my_version from public.pro_work_file_versions v where v.owner_id=owner and v.family_id=root and v.file_id=p_file;
 if p_after is not null then
  select created_at into cursor_at from public.pro_work_file_comments where owner_id=owner and family_id=root and thread='client' and id=p_after and archived_at is null and (author_kind='owner' or author_id=p_actor);
  if not found then raise exception 'Invalid comment cursor' using errcode='22023';end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'versionNo',c.version_no,'mine',c.author_kind='client' and c.author_id=p_actor,
   'authorName',case when c.author_kind='owner' then coalesce(pro_name,'') else c.author_name end,'fromTeam',c.author_kind='owner',
   'body',c.body,'revision',c.revision,'edited',c.edited_at is not null,'createdAt',c.created_at,'dayCr',public.pro_wfv_day(c.created_at)) order by c.created_at desc,c.id desc),'[]'::jsonb) into items from (
  select * from public.pro_work_file_comments where owner_id=owner and family_id=root and thread='client' and archived_at is null and (author_kind='owner' or author_id=p_actor)
  and (p_after is null or (created_at,id)<(cursor_at,p_after)) order by created_at desc,id desc limit 21) c;
 if jsonb_array_length(items)>20 then next_id:=(items->19->>'id')::uuid;items:=items-20;end if;
 return jsonb_build_object('fileId',p_file,'versionNo',my_version,'sharedVersions',shared,'items',items,'nextCursor',next_id,'canComment',req_status in('confirmed','completed'));
end $$;
create or replace function public.pro_work_file_client_comments_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;keys text[];aid uuid;rid uuid;fid uuid;cid uuid;rev integer;v_body text;receipt public.pro_work_file_version_actions;r public.pro_appointment_requests;f public.pro_work_files;
 root uuid;vno integer;c public.pro_work_file_comments;before_json jsonb;result jsonb;out_json jsonb;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' then raise exception 'Invalid comment action' using errcode='22023';end if;
 act:=p_input->>'action';keys:=public.pro_wfv_keys(p_input);
 if keys is distinct from (case act
  when 'create' then array['action','actionId','body','commentId','fileId','requestId']
  when 'edit' then array['action','actionId','body','commentId','requestId','revision']
  when 'archive' then array['action','actionId','commentId','requestId','revision'] end) then raise exception 'Invalid comment fields' using errcode='22023';end if;
 aid:=public.pro_wfv_uuid(p_input->'actionId');rid:=public.pro_wfv_uuid(p_input->'requestId');cid:=public.pro_wfv_uuid(p_input->'commentId');
 if p_input?'fileId' then fid:=public.pro_wfv_uuid(p_input->'fileId');end if;
 if p_input?'revision' then rev:=public.pro_wfv_int(p_input->'revision',1,2147483646);end if;
 if p_input?'body' then v_body:=public.pro_wfv_text(p_input->'body',2000,true);end if;
 select * into r from public.pro_appointment_requests where id=rid and client_user_id=p_actor and work_id is not null;
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-wfv-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_work_file_version_actions where actor_id=p_actor and action_id=aid;
 if found then
  if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;
  return receipt.result;
 end if;
 if r.status not in('confirmed','completed') then raise exception 'Customer unavailable' using errcode='42501';end if;
 if not public.pro_wfv_client_files_visible(r.owner_id,r.work_id) then raise exception 'Files hidden in the customer view' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-files:'||r.owner_id::text||':'||r.work_id,0));
 if act='create' then
  select * into f from public.pro_work_files where id=fid and owner_id=r.owner_id and work_id=r.work_id and ready and revision=2 and client_user_id=p_actor;
  if not found then raise exception 'Forbidden' using errcode='42501';end if;
  if exists(select 1 from public.pro_work_file_comments where id=cid) then raise exception 'Comment identity reused' using errcode='22023';end if;
  root:=public.pro_wfv_root(r.owner_id,r.work_id,fid);
  select coalesce(max(v.version_no),1) into vno from public.pro_work_file_versions v where v.owner_id=r.owner_id and v.family_id=root and v.file_id=fid;
  if (select count(*) from public.pro_work_file_comments where owner_id=r.owner_id and family_id=root)>=500 then raise exception 'Comment limit reached' using errcode='54000';end if;
  insert into public.pro_work_file_comments(owner_id,work_id,family_id,id,thread,version_no,author_kind,author_id,author_name,body)
   values(r.owner_id,r.work_id,root,cid,'client',vno,'client',p_actor,left(r.client_name,160),v_body) returning * into c;
  before_json:=null;
 else
  select * into c from public.pro_work_file_comments where owner_id=r.owner_id and work_id=r.work_id and id=cid and author_kind='client' and author_id=p_actor for update;
  if not found or c.archived_at is not null then raise exception 'Forbidden' using errcode='42501';end if;
  if c.revision<>rev then raise exception 'Comment changed' using errcode='40001';end if;
  before_json:=public.pro_wfv_comment_json(c);
  if act='edit' then
   if c.body=v_body then raise exception 'No comment changes' using errcode='22023';end if;
   update public.pro_work_file_comments set body=v_body,edited_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp() where owner_id=c.owner_id and id=cid returning * into c;
  else
   update public.pro_work_file_comments set archived_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp() where owner_id=c.owner_id and id=cid returning * into c;
  end if;
 end if;
 insert into public.pro_work_file_comment_history(owner_id,comment_id,action_id,actor_id,action,before_value,after_value)
  values(c.owner_id,cid,aid,p_actor,case act when 'create' then 'create' when 'edit' then 'edit' else 'archive' end,before_json,public.pro_wfv_comment_json(c));
 out_json:=jsonb_build_object('id',c.id,'versionNo',c.version_no,'mine',true,'authorName',c.author_name,'fromTeam',false,'body',c.body,'revision',c.revision,
  'edited',c.edited_at is not null,'archived',c.archived_at is not null,'createdAt',c.created_at,'dayCr',public.pro_wfv_day(c.created_at));
 result:=jsonb_build_object('comment',out_json);
 insert into public.pro_work_file_version_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

-- ===================================================================== immutability
create or replace function public.pro_wfv_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'File versions, history and receipts are immutable' using errcode='23514';end $$;
create or replace function public.pro_wfv_family_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.owner_id<>old.owner_id or new.work_id<>old.work_id or new.id<>old.id or new.created_at<>old.created_at
 or new.version_count<old.version_count or new.revision<=old.revision then raise exception 'Invalid family transition' using errcode='23514';end if;
 return new;
end $$;
create or replace function public.pro_wfv_comment_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if (to_jsonb(new)-array['body','revision','edited_at','archived_at','updated_at']) is distinct from (to_jsonb(old)-array['body','revision','edited_at','archived_at','updated_at'])
 or new.revision<>old.revision+1 then raise exception 'Comment identity is immutable' using errcode='23514';end if;
 return new;
end $$;
drop trigger if exists pro_wfv_versions_immutable on public.pro_work_file_versions;
create trigger pro_wfv_versions_immutable before update on public.pro_work_file_versions for each row execute function public.pro_wfv_immutable();
drop trigger if exists pro_wfv_members_immutable on public.pro_work_file_family_members;
create trigger pro_wfv_members_immutable before update on public.pro_work_file_family_members for each row execute function public.pro_wfv_immutable();
drop trigger if exists pro_wfv_comment_history_immutable on public.pro_work_file_comment_history;
create trigger pro_wfv_comment_history_immutable before update on public.pro_work_file_comment_history for each row execute function public.pro_wfv_immutable();
drop trigger if exists pro_wfv_actions_immutable on public.pro_work_file_version_actions;
create trigger pro_wfv_actions_immutable before update on public.pro_work_file_version_actions for each row execute function public.pro_wfv_immutable();
drop trigger if exists pro_wfv_family_guard on public.pro_work_file_families;
create trigger pro_wfv_family_guard before update on public.pro_work_file_families for each row execute function public.pro_wfv_family_guard();
drop trigger if exists pro_wfv_comment_guard on public.pro_work_file_comments;
create trigger pro_wfv_comment_guard before update on public.pro_work_file_comments for each row execute function public.pro_wfv_comment_guard();

alter table public.pro_work_file_families enable row level security;
alter table public.pro_work_file_family_members enable row level security;
alter table public.pro_work_file_versions enable row level security;
alter table public.pro_work_file_comments enable row level security;
alter table public.pro_work_file_comment_history enable row level security;
alter table public.pro_work_file_version_actions enable row level security;
revoke all on public.pro_work_file_families,public.pro_work_file_family_members,public.pro_work_file_versions,public.pro_work_file_comments,public.pro_work_file_comment_history,public.pro_work_file_version_actions from public,anon,authenticated;
grant select,insert,update,delete on public.pro_work_file_families,public.pro_work_file_family_members,public.pro_work_file_versions,public.pro_work_file_comments,public.pro_work_file_comment_history,public.pro_work_file_version_actions to service_role;
revoke all on function public.pro_wfv_uuid(jsonb),public.pro_wfv_text(jsonb,integer,boolean),public.pro_wfv_int(jsonb,integer,integer),public.pro_wfv_keys(jsonb),public.pro_wfv_day(timestamptz),
 public.pro_wfv_root(uuid,text,uuid),public.pro_wfv_comment_json(public.pro_work_file_comments),public.pro_wfv_versions_json(uuid,text,uuid),public.pro_wfv_state(uuid,text,uuid),
 public.pro_work_file_versions_read(uuid,text,uuid,text,boolean,uuid,uuid),public.pro_work_file_versions_index(uuid,text,uuid[]),public.pro_work_file_versions_mutate(uuid,jsonb),
 public.pro_work_file_client_discussion_read(uuid,uuid,uuid,uuid),public.pro_work_file_client_comments_mutate(uuid,jsonb),public.pro_wfv_client_files_visible(uuid,text),
 public.pro_wfv_immutable(),public.pro_wfv_family_guard(),public.pro_wfv_comment_guard() from public,anon,authenticated;
grant execute on function public.pro_wfv_uuid(jsonb),public.pro_wfv_text(jsonb,integer,boolean),public.pro_wfv_int(jsonb,integer,integer),public.pro_wfv_keys(jsonb),public.pro_wfv_day(timestamptz),
 public.pro_wfv_root(uuid,text,uuid),public.pro_wfv_comment_json(public.pro_work_file_comments),public.pro_wfv_versions_json(uuid,text,uuid),public.pro_wfv_state(uuid,text,uuid),
 public.pro_work_file_versions_read(uuid,text,uuid,text,boolean,uuid,uuid),public.pro_work_file_versions_index(uuid,text,uuid[]),public.pro_work_file_versions_mutate(uuid,jsonb),
 public.pro_work_file_client_discussion_read(uuid,uuid,uuid,uuid),public.pro_work_file_client_comments_mutate(uuid,jsonb),public.pro_wfv_client_files_visible(uuid,text) to service_role;
commit;
