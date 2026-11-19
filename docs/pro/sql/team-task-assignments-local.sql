-- LOCAL PRO ONLY. Explicit account-bound task responsibility; no notifications.
begin;
create table if not exists public.pro_team_task_assignments(
 owner_id uuid not null,work_id text not null,task_id uuid not null,
 grant_id uuid not null,source_invite_id uuid not null,display_name text not null check(length(display_name)<=160),
 updated_at timestamptz not null default now(),primary key(owner_id,task_id),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade,
 foreign key(owner_id,task_id) references public.pro_work_tasks(owner_id,id) on delete cascade
);
alter table public.pro_team_task_assignments drop constraint if exists pro_team_task_assignments_task_scope_fk;
alter table public.pro_team_task_assignments add constraint pro_team_task_assignments_task_scope_fk foreign key(owner_id,work_id,task_id) references public.pro_work_tasks(owner_id,work_id,id) on delete cascade;
create or replace function public.pro_team_grant_json(p_grant public.pro_team_grants) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_grant.id,'ownerId',p_grant.owner_id,'workId',p_grant.work_id,'userId',p_grant.member_user_id,'displayName',p_grant.member_name,'role',p_grant.role,'active',p_grant.active,'revision',p_grant.revision,
 'canAssign',p_grant.active and p_grant.role='contributor' and exists(select 1 from public.profiles p where p.id=p_grant.member_user_id and not coalesce(p.is_disabled,false)));
$$;
alter table public.pro_team_task_assignments enable row level security;
revoke all on public.pro_team_task_assignments from public,anon,authenticated;
grant select,insert,update,delete on public.pro_team_task_assignments to service_role;
alter table public.pro_team_events drop constraint if exists pro_team_events_action_check;
alter table public.pro_team_events add constraint pro_team_events_action_check check(action in('invite','accept','cancel_invite','set_role','revoke','comment','complete','reopen','assign'));
create or replace function public.pro_team_assignment_json(p_owner uuid,p_task uuid) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('grantId',a.grant_id,'name',a.display_name,'active',coalesce(g.active and g.role='contributor' and g.source_invite_id=a.source_invite_id and exists(select 1 from public.profiles p where p.id=g.member_user_id and not coalesce(p.is_disabled,false)),false))
 from public.pro_team_task_assignments a left join public.pro_team_grants g on g.id=a.grant_id and g.owner_id=a.owner_id and g.work_id=a.work_id where a.owner_id=p_owner and a.task_id=p_task;
$$;
create or replace function public.pro_team_task_json(p_task public.pro_work_tasks) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_task.id,'title',p_task.title,'dueDate',case when p_task.due_date is null then null else to_char(p_task.due_date,'YYYY-MM-DD') end,'status',p_task.status,'revision',p_task.revision,'assignment',public.pro_team_assignment_json(p_task.owner_id,p_task.id));
$$;
create or replace function public.pro_team_task_assign(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;wid text;tid uuid;gid uuid;rev integer;keys text[];t public.pro_work_tasks;g public.pro_team_grants;r public.pro_team_actions;before_json jsonb;full_before jsonb;answer jsonb;
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid assignment' using errcode='22023';end if;
 select array_agg(key order by key) into keys from jsonb_object_keys(p_input) key;
 if keys is distinct from array['action','actionId','assigneeGrantId','revision','taskId','workId'] or p_input->>'action' is distinct from 'assign' or jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'taskId') is distinct from 'string' or jsonb_typeof(p_input->'workId') is distinct from 'string' or jsonb_typeof(p_input->'assigneeGrantId') not in('string','null') or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false) then raise exception 'Invalid assignment fields' using errcode='22023';end if;
 aid:=(p_input->>'actionId')::uuid;tid:=(p_input->>'taskId')::uuid;gid:=(p_input->>'assigneeGrantId')::uuid;wid:=p_input->>'workId';
 if length(wid) not between 1 and 160 or (p_input->>'revision')::numeric not between 1 and 2147483646 then raise exception 'Invalid assignment scope' using errcode='22023';end if;rev:=(p_input->>'revision')::integer;
 perform pg_advisory_xact_lock(hashtextextended('pro-team-action:'||p_actor::text||':'||aid::text,0));
 perform pg_advisory_xact_lock(hashtextextended('pro-work-tasks:'||p_actor::text||':'||wid,0));
 if not coalesce(public.pro_appointment_enabled(p_actor),false) or not exists(select 1 from public.pro_work where user_id=p_actor and id=wid) then raise exception 'Forbidden' using errcode='42501';end if;
 -- Shared receipt namespace also blocks reuse through the older team writer.
 select * into r from public.pro_team_actions where actor_id=p_actor and action_id=aid;
 if found then if r.input is distinct from p_input then raise exception 'Action identity reused' using errcode='22023';end if;return r.result;end if;
 if gid is not null then
  select * into g from public.pro_team_grants where id=gid and owner_id=p_actor and work_id=wid for update;
  if not found or not g.active or g.role<>'contributor' or not exists(select 1 from public.profiles where id=g.member_user_id and not coalesce(is_disabled,false)) then raise exception 'Member unavailable' using errcode='40001';end if;
 end if;
 select * into t from public.pro_work_tasks where owner_id=p_actor and work_id=wid and id=tid and not archived for update;
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 if not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if gid is not null and (not g.active or g.role<>'contributor' or not exists(select 1 from public.profiles where id=g.member_user_id and not coalesce(is_disabled,false))) then raise exception 'Member unavailable' using errcode='40001';end if;
 if t.revision<>rev then raise exception 'Task changed' using errcode='40001';end if;
 before_json:=public.pro_team_task_json(t);full_before:=public.pro_work_task_json(t);
 if gid is null then delete from public.pro_team_task_assignments where owner_id=p_actor and task_id=tid;
 else insert into public.pro_team_task_assignments(owner_id,work_id,task_id,grant_id,source_invite_id,display_name) values(p_actor,wid,tid,g.id,g.source_invite_id,g.member_name)
 on conflict(owner_id,task_id) do update set grant_id=excluded.grant_id,source_invite_id=excluded.source_invite_id,display_name=excluded.display_name,updated_at=now();end if;
 update public.pro_work_tasks set revision=revision+1,updated_at=now() where owner_id=p_actor and id=tid returning * into t;
 insert into public.pro_work_task_history(owner_id,work_id,task_id,action_id,action,before_task,after_task) values(p_actor,wid,tid,aid,'update',full_before,public.pro_work_task_json(t));
 insert into public.pro_team_events(owner_id,work_id,actor_id,actor_name,action_id,action,task_id,title,grant_id,before_projected,after_projected)
 values(p_actor,wid,p_actor,public.pro_team_name(p_actor),aid,'assign',tid,t.title,gid,before_json,public.pro_team_task_json(t));
 answer:=jsonb_build_object('action','assign','ownerId',p_actor,'workId',wid,'task',public.pro_team_task_json(t));
 insert into public.pro_team_actions(actor_id,action_id,owner_id,work_id,input,result) values(p_actor,aid,p_actor,wid,p_input,answer);return answer;
end $$;
create or replace function public.pro_team_assignment_action_read(p_actor uuid,p_action uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r public.pro_team_actions;t public.pro_work_tasks;
begin
 select * into r from public.pro_team_actions where actor_id=p_actor and action_id=p_action;
 if not found or r.input->>'action'<>'assign' then return public.pro_team_action_read(p_actor,p_action);end if;
 if r.owner_id<>p_actor or not coalesce(public.pro_appointment_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into t from public.pro_work_tasks where owner_id=p_actor and work_id=r.work_id and id=(r.input->>'taskId')::uuid and not archived;
 if not found then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_object('action','assign','ownerId',p_actor,'workId',r.work_id,'task',public.pro_team_task_json(t));
end $$;
revoke all on function public.pro_team_assignment_json(uuid,uuid),public.pro_team_task_assign(uuid,jsonb),public.pro_team_assignment_action_read(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pro_team_assignment_json(uuid,uuid),public.pro_team_task_assign(uuid,jsonb),public.pro_team_assignment_action_read(uuid,uuid) to service_role;
create or replace function public.pro_team_audit_read(p_actor uuid,p_work text,p_after uuid default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare items jsonb;cursor_id uuid;cursor_at timestamptz;
begin
 if not coalesce(public.pro_appointment_enabled(p_actor),false) or not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_after is not null then select at into cursor_at from public.pro_team_events where owner_id=p_actor and work_id=p_work and id=p_after;if not found then raise exception 'Invalid audit cursor' using errcode='22023';end if;end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'actionId',e.action_id,'actorId',e.actor_id,'actorName',e.actor_name,'action',e.action,'at',e.at,'taskId',e.task_id,'title',e.title,'grantId',e.grant_id,'role',e.role,'assignmentBefore',e.before_projected->'assignment','assignmentAfter',e.after_projected->'assignment') order by e.at desc,e.id desc),'[]'::jsonb) into items from (
  select * from public.pro_team_events where owner_id=p_actor and work_id=p_work and (p_after is null or (at,id)<(cursor_at,p_after)) order by at desc,id desc limit 21
 ) e;
 if jsonb_array_length(items)>20 then cursor_id:=(items->19->>'id')::uuid;items:=items-20;end if;return jsonb_build_object('workId',p_work,'items',items,'nextCursor',cursor_id);
end $$;
commit;
