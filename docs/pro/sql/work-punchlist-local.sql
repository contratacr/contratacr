-- LOCAL PRO ONLY. Punch list (family 15): closing items are ordinary job tasks
-- (pro_work_tasks) carrying a 1:1 punch marker with an optional job photo
-- (pro_work_files, JPEG) and an optional "photo required to complete" rule.
-- Every task change goes through the existing pro_work_tasks_mutate writer, so
-- task history, receipts and CAS stay the single source of truth. The customer
-- sees the list only when pro_client_dashboards.show_punchlist is on (off by
-- default): title, status, due date and photo; never notes, assignee or history.
begin;
create table if not exists public.pro_work_punch_items(
 owner_id uuid not null,work_id text not null,task_id uuid not null,photo_file_id uuid,photo_required boolean not null default false,
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(owner_id,work_id,task_id),
 foreign key(owner_id,work_id,task_id) references public.pro_work_tasks(owner_id,work_id,id) on delete cascade,
 foreign key(owner_id,work_id,photo_file_id) references public.pro_work_files(owner_id,work_id,id) on delete set null (photo_file_id)
);
create table if not exists public.pro_work_punch_history(
 owner_id uuid not null,work_id text not null,task_id uuid not null,action_id uuid not null,
 action text not null check(action in('create','update','complete','reopen','archive','mark')),
 before_item jsonb,after_item jsonb not null,at timestamptz not null default now(),primary key(owner_id,action_id),
 foreign key(owner_id,work_id,task_id) references public.pro_work_punch_items(owner_id,work_id,task_id) on delete cascade
);
create table if not exists public.pro_work_punch_actions(
 actor_id uuid not null references public.profiles(id) on delete cascade,action_id uuid not null,
 input jsonb not null,result jsonb not null,at timestamptz not null default now(),primary key(actor_id,action_id)
);
create or replace function public.pro_work_punch_immutable() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Punch list history and receipts are immutable' using errcode='23514';end $$;
drop trigger if exists pro_work_punch_history_immutable on public.pro_work_punch_history;
create trigger pro_work_punch_history_immutable before update on public.pro_work_punch_history for each row execute function public.pro_work_punch_immutable();
drop trigger if exists pro_work_punch_actions_immutable on public.pro_work_punch_actions;
create trigger pro_work_punch_actions_immutable before update on public.pro_work_punch_actions for each row execute function public.pro_work_punch_immutable();

-- QA 2026-11-11: punch items are ordinary tasks, so they can also be completed from
-- the task list, the task center or a team member. The "photo required" rule is
-- enforced on the task row itself, for every writer, not only in this module.
create or replace function public.pro_work_punch_photo_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.pro_work_punch_items p where p.owner_id=new.owner_id and p.work_id=new.work_id and p.task_id=new.id and p.photo_required
   and not exists(select 1 from public.pro_work_files f where f.owner_id=p.owner_id and f.work_id=p.work_id and f.id=p.photo_file_id and f.ready and f.mime_type='image/jpeg'))
 then raise exception 'Photo required before completing' using errcode='22023';end if;
 return new;
end $$;
drop trigger if exists pro_work_punch_photo_guard on public.pro_work_tasks;
create trigger pro_work_punch_photo_guard before update of status on public.pro_work_tasks for each row when(new.status='done' and old.status is distinct from 'done') execute function public.pro_work_punch_photo_guard();

create or replace function public.pro_work_punch_json(p_owner uuid,p_work text,p_task uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('taskId',t.id,'workId',t.work_id,'title',t.title,'details',t.details,'assignee',t.assignee,
  'dueDate',case when t.due_date is null then null else to_char(t.due_date,'YYYY-MM-DD') end,'status',t.status,'archived',t.archived,'taskRevision',t.revision,
  'revision',p.revision,'photoRequired',p.photo_required,'photoFileId',f.id,'photoName',f.name,'createdAt',p.created_at,'updatedAt',greatest(p.updated_at,t.updated_at))
 from public.pro_work_punch_items p join public.pro_work_tasks t on t.owner_id=p.owner_id and t.work_id=p.work_id and t.id=p.task_id
 left join public.pro_work_files f on f.owner_id=p.owner_id and f.work_id=p.work_id and f.id=p.photo_file_id and f.ready and f.mime_type='image/jpeg'
 where p.owner_id=p_owner and p.work_id=p_work and p.task_id=p_task;
$$;

create or replace function public.pro_work_punchlist_read(p_actor uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare items jsonb;candidates jsonb;total integer;done integer;show boolean;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 then raise exception 'Invalid punch list query' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then return null;end if;
 select coalesce(jsonb_agg(public.pro_work_punch_json(p_actor,p_work,x.task_id) order by x.due_date nulls last,x.created_at,x.task_id),'[]'::jsonb),count(*),count(*) filter(where x.status='done') into items,total,done
  from (select p.task_id,p.created_at,t.due_date,t.status from public.pro_work_punch_items p join public.pro_work_tasks t on t.owner_id=p.owner_id and t.work_id=p.work_id and t.id=p.task_id
   where p.owner_id=p_actor and p.work_id=p_work and not t.archived order by t.due_date nulls last,p.created_at,p.task_id limit 500) x;
 -- Open tasks that can be moved to the punch list (first 50 by title).
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'title',t.title) order by t.title,t.id),'[]'::jsonb) into candidates from (
  select t.id,t.title from public.pro_work_tasks t where t.owner_id=p_actor and t.work_id=p_work and not t.archived and t.status='open'
   and not exists(select 1 from public.pro_work_punch_items p where p.owner_id=t.owner_id and p.work_id=t.work_id and p.task_id=t.id) order by t.title,t.id limit 50) t;
 select coalesce(show_punchlist,false) into show from public.pro_client_dashboards where owner_id=p_actor and work_id=p_work;
 return jsonb_build_object('workId',p_work,'items',items,'counts',jsonb_build_object('total',coalesce(total,0),'done',coalesce(done,0)),'candidates',candidates,'showPunchlist',coalesce(show,false));
end $$;

create or replace function public.pro_work_punchlist_mutate(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;wid text;tid uuid;aid uuid;task_action uuid;keys text[];expected text[];receipt public.pro_work_punch_actions;item public.pro_work_punch_items;task public.pro_work_tasks;
 photo uuid;required boolean;before_json jsonb;after_json jsonb;result jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'action') is distinct from 'string' then raise exception 'Invalid punch item' using errcode='22023';end if;
 act:=p_input->>'action';
 expected:=case act
  when 'create' then array['action','actionId','assignee','details','dueDate','photoFileId','photoRequired','taskId','title','workId']
  when 'update' then array['action','actionId','assignee','details','dueDate','photoFileId','photoRequired','revision','taskId','taskRevision','title','workId']
  when 'complete' then array['action','actionId','taskId','taskRevision','workId'] when 'reopen' then array['action','actionId','taskId','taskRevision','workId']
  when 'archive' then array['action','actionId','taskId','taskRevision','workId'] when 'mark' then array['action','actionId','taskId','workId'] end;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if expected is null or keys is distinct from expected or jsonb_typeof(p_input->'workId') is distinct from 'string' or jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'taskId') is distinct from 'string'
 then raise exception 'Invalid punch item fields' using errcode='22023';end if;
 if act in('update','complete','reopen','archive') and (jsonb_typeof(p_input->'taskRevision') is distinct from 'number' or not coalesce((p_input->>'taskRevision')~'^[0-9]{1,10}$',false) or (p_input->>'taskRevision')::numeric not between 1 and 2147483646) then raise exception 'Invalid revision' using errcode='22023';end if;
 if act='update' and (jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false) or (p_input->>'revision')::numeric not between 1 and 2147483646) then raise exception 'Invalid revision' using errcode='22023';end if;
 if act in('create','update') then
  if jsonb_typeof(p_input->'photoFileId') not in('string','null') or jsonb_typeof(p_input->'photoRequired') is distinct from 'boolean' then raise exception 'Invalid punch photo' using errcode='22023';end if;
  photo:=(p_input->>'photoFileId')::uuid;required:=(p_input->>'photoRequired')::boolean;
 end if;
 wid:=p_input->>'workId';tid:=(p_input->>'taskId')::uuid;aid:=(p_input->>'actionId')::uuid;
 if length(wid) not between 1 and 160 then raise exception 'Invalid punch scope' using errcode='22023';end if;
 -- Deterministic identity for the inner task write: a retry replays both receipts.
 task_action:=overlay(overlay(md5('pro-punch:'||aid::text) placing '4' from 13) placing '8' from 17)::uuid;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-punch-action:'||p_actor::text||':'||aid::text,0));
 select * into receipt from public.pro_work_punch_actions where actor_id=p_actor and action_id=aid;
 if found then if receipt.input is distinct from p_input then raise exception 'Action identity reused with different payload' using errcode='22023';end if;return receipt.result;end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-tasks:'||p_actor::text||':'||wid,0));
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then raise exception 'Forbidden' using errcode='42501';end if;
 if photo is not null and not exists(select 1 from public.pro_work_files where owner_id=p_actor and work_id=wid and id=photo and ready and mime_type='image/jpeg') then raise exception 'Photo unavailable' using errcode='22023';end if;
 if act='create' then
  if (select count(*) from public.pro_work_punch_items where owner_id=p_actor and work_id=wid)>=500 then raise exception 'Punch list limit reached' using errcode='54000';end if;
  perform public.pro_work_tasks_mutate(p_actor,jsonb_build_object('action','create','workId',wid,'taskId',tid,'actionId',task_action,'revision',0,'title',p_input->'title','details',p_input->'details','dueDate',p_input->'dueDate','assignee',p_input->'assignee'));
  insert into public.pro_work_punch_items(owner_id,work_id,task_id,photo_file_id,photo_required) values(p_actor,wid,tid,photo,required) returning * into item;
 elsif act='mark' then
  select * into task from public.pro_work_tasks where owner_id=p_actor and work_id=wid and id=tid for update;
  if not found then raise exception 'Forbidden' using errcode='42501';end if;
  if task.archived then raise exception 'Restore task first' using errcode='22023';end if;
  if exists(select 1 from public.pro_work_punch_items where owner_id=p_actor and work_id=wid and task_id=tid) then raise exception 'Already in punch list' using errcode='40001';end if;
  if (select count(*) from public.pro_work_punch_items where owner_id=p_actor and work_id=wid)>=500 then raise exception 'Punch list limit reached' using errcode='54000';end if;
  insert into public.pro_work_punch_items(owner_id,work_id,task_id) values(p_actor,wid,tid) returning * into item;
 else
  select * into item from public.pro_work_punch_items where owner_id=p_actor and work_id=wid and task_id=tid for update;
  if not found then raise exception 'Forbidden' using errcode='42501';end if;
  before_json:=public.pro_work_punch_json(p_actor,wid,tid);
  if act='update' then
   if (p_input->>'revision')::integer<>item.revision then raise exception 'Punch item changed' using errcode='40001';end if;
   perform public.pro_work_tasks_mutate(p_actor,jsonb_build_object('action','update','workId',wid,'taskId',tid,'actionId',task_action,'revision',p_input->'taskRevision','title',p_input->'title','details',p_input->'details','dueDate',p_input->'dueDate','assignee',p_input->'assignee'));
   update public.pro_work_punch_items set photo_file_id=photo,photo_required=required,revision=revision+1,updated_at=now() where owner_id=p_actor and work_id=wid and task_id=tid returning * into item;
  else
   if act='complete' and item.photo_required and not exists(select 1 from public.pro_work_files where owner_id=p_actor and work_id=wid and id=item.photo_file_id and ready and mime_type='image/jpeg') then raise exception 'Photo required before completing' using errcode='22023';end if;
   perform public.pro_work_tasks_mutate(p_actor,jsonb_build_object('action',act,'workId',wid,'taskId',tid,'actionId',task_action,'revision',p_input->'taskRevision'));
  end if;
 end if;
 after_json:=public.pro_work_punch_json(p_actor,wid,tid);result:=jsonb_build_object('item',after_json);
 insert into public.pro_work_punch_history(owner_id,work_id,task_id,action_id,action,before_item,after_item) values(p_actor,wid,tid,aid,act,before_json,after_json);
 insert into public.pro_work_punch_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

create or replace function public.pro_work_punchlist_client_read(p_actor uuid,p_request uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare owner uuid;wid text;req_status text;enabled boolean;items jsonb;total integer;done integer;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 select owner_id,work_id,status into owner,wid,req_status from public.pro_appointment_requests where id=p_request and client_user_id=p_actor and work_id is not null;
 if not found then return null;end if;
 select coalesce(show_punchlist,false) into enabled from public.pro_client_dashboards where owner_id=owner and work_id=wid;
 if req_status not in('confirmed','completed') or not coalesce(enabled,false) then return jsonb_build_object('visible',false);end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.task_id,'title',x.title,'status',x.status,'dueDate',case when x.due_date is null then null else to_char(x.due_date,'YYYY-MM-DD') end,'hasPhoto',x.has_photo) order by x.due_date nulls last,x.created_at,x.task_id),'[]'::jsonb),
  count(*),count(*) filter(where x.status='done') into items,total,done
 from (select p.task_id,p.created_at,t.title,t.status,t.due_date,exists(select 1 from public.pro_work_files f where f.owner_id=p.owner_id and f.work_id=p.work_id and f.id=p.photo_file_id and f.ready and f.mime_type='image/jpeg') has_photo
  from public.pro_work_punch_items p join public.pro_work_tasks t on t.owner_id=p.owner_id and t.work_id=p.work_id and t.id=p.task_id
  where p.owner_id=owner and p.work_id=wid and not t.archived order by t.due_date nulls last,p.created_at,p.task_id limit 500) x;
 return jsonb_build_object('visible',true,'items',items,'counts',jsonb_build_object('total',coalesce(total,0),'done',coalesce(done,0)));
end $$;

-- Photo access is re-authorized per request: the owner, or the linked customer of a
-- confirmed/completed request whose customer view shows the punch list.
create or replace function public.pro_work_punch_image(p_actor uuid,p_task uuid,p_request uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare owner uuid;wid text;file_row public.pro_work_files;
begin
 if not exists(select 1 from public.profiles where id=p_actor and not coalesce(is_disabled,false)) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_request is null then
  if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
  owner:=p_actor;select work_id into wid from public.pro_work_punch_items where owner_id=p_actor and task_id=p_task limit 1;
  if wid is null then return null;end if;
 else
  select r.owner_id,r.work_id into owner,wid from public.pro_appointment_requests r join public.pro_client_dashboards d on d.owner_id=r.owner_id and d.work_id=r.work_id
   where r.id=p_request and r.client_user_id=p_actor and r.status in('confirmed','completed') and d.show_punchlist;
  if not found then return null;end if;
 end if;
 select f.* into file_row from public.pro_work_punch_items p join public.pro_work_tasks t on t.owner_id=p.owner_id and t.work_id=p.work_id and t.id=p.task_id and not t.archived
  join public.pro_work_files f on f.owner_id=p.owner_id and f.work_id=p.work_id and f.id=p.photo_file_id and f.ready and f.mime_type='image/jpeg'
  where p.owner_id=owner and p.work_id=wid and p.task_id=p_task;
 if not found then return null;end if;
 return jsonb_build_object('objectPath',file_row.object_path,'mimeType',file_row.mime_type,'sizeBytes',file_row.size_bytes,'sha256',file_row.sha256);
end $$;

alter table public.pro_work_punch_items enable row level security;
alter table public.pro_work_punch_history enable row level security;
alter table public.pro_work_punch_actions enable row level security;
revoke all on public.pro_work_punch_items,public.pro_work_punch_history,public.pro_work_punch_actions from public,anon,authenticated;
grant select,insert,update,delete on public.pro_work_punch_items,public.pro_work_punch_history,public.pro_work_punch_actions to service_role;
revoke all on function public.pro_work_punch_immutable(),public.pro_work_punch_photo_guard(),public.pro_work_punch_json(uuid,text,uuid),public.pro_work_punchlist_read(uuid,text),public.pro_work_punchlist_mutate(uuid,jsonb),public.pro_work_punchlist_client_read(uuid,uuid),public.pro_work_punch_image(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.pro_work_punch_json(uuid,text,uuid),public.pro_work_punchlist_read(uuid,text),public.pro_work_punchlist_mutate(uuid,jsonb),public.pro_work_punchlist_client_read(uuid,uuid),public.pro_work_punch_image(uuid,uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
