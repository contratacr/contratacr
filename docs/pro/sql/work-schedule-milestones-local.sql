-- LOCAL PRO ONLY. Named civil dates, independent from tasks and appointment dates.
-- Add after work-schedule-local.sql. Existing writers and receipts remain unchanged.
begin;
create table if not exists public.pro_work_schedule_milestones(
 owner_id uuid not null,work_id text not null,id uuid not null,
 title text not null check(length(btrim(title)) between 1 and 160),
 milestone_date date not null check(milestone_date between date '1900-01-01' and date '2100-12-31'),
 notes text not null default '' check(length(notes)<=1000),archived boolean not null default false,
 primary key(owner_id,work_id,id),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade
);
create index if not exists pro_work_schedule_milestones_page on public.pro_work_schedule_milestones(owner_id,work_id,archived,milestone_date,id);
create or replace function public.pro_work_milestone_json(p_item public.pro_work_schedule_milestones) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_item.id,'title',p_item.title,'date',to_char(p_item.milestone_date,'YYYY-MM-DD'),'notes',p_item.notes,'archived',p_item.archived);
$$;
create or replace function public.pro_work_milestones_read(p_actor uuid,p_work text default null,p_grant uuid default null,p_status text default 'active',p_after uuid default null) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare own uuid;wid text;g public.pro_team_grants;items jsonb;cursor_date date;cursor_id uuid;rev integer;want_archived boolean;
begin
 if p_status is null or p_status not in('active','archived') then raise exception 'Invalid milestone status' using errcode='22023';end if;
 if p_grant is not null then
  if p_work is not null then raise exception 'Ambiguous milestone scope' using errcode='22023';end if;
  g:=public.pro_team_context(p_actor,p_grant,false);own:=g.owner_id;wid:=g.work_id;
  if p_status<>'active' then raise exception 'Forbidden' using errcode='42501';end if;
 else perform public.pro_work_schedule_owner(p_actor,p_work);own:=p_actor;wid:=p_work;end if;
 want_archived:=p_status='archived';
 if p_after is not null then
  select milestone_date into cursor_date from public.pro_work_schedule_milestones where owner_id=own and work_id=wid and id=p_after and archived=want_archived;
  if not found then raise exception 'Invalid milestone cursor' using errcode='22023';end if;
 end if;
 select coalesce(jsonb_agg(public.pro_work_milestone_json(m::public.pro_work_schedule_milestones) order by m.milestone_date,m.id),'[]'::jsonb) into items from(
  select * from public.pro_work_schedule_milestones where owner_id=own and work_id=wid and archived=want_archived and(p_after is null or(milestone_date,id)>(cursor_date,p_after)) order by milestone_date,id limit 21
 )m;
 if jsonb_array_length(items)>20 then cursor_id:=(items->19->>'id')::uuid;items:=items-20;end if;
 select revision into rev from public.pro_work_schedule_heads where owner_id=own and work_id=wid;
 return jsonb_build_object('workId',wid,'revision',coalesce(rev,0),'items',items,'nextCursor',cursor_id);
end $$;
create or replace function public.pro_work_milestones_mutate(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare act text;aid uuid;wid text;mid uuid;rev integer;current_rev integer;keys text[];r public.pro_work_schedule_actions;m public.pro_work_schedule_milestones;title_text text;note_text text;day date;before_json jsonb;answer jsonb;
begin
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid milestone operation' using errcode='22023';end if;
 act:=p_input->>'action';select array_agg(key order by key) into keys from jsonb_object_keys(p_input)key;
 if act='milestone_save' then
  if keys is distinct from array['action','actionId','date','milestoneId','notes','revision','title','workId'] or jsonb_typeof(p_input->'title') is distinct from 'string' or jsonb_typeof(p_input->'notes') is distinct from 'string' or jsonb_typeof(p_input->'date') is distinct from 'string' then raise exception 'Invalid milestone fields' using errcode='22023';end if;
  title_text:=btrim(p_input->>'title');note_text:=btrim(p_input->>'notes');
  if length(title_text) not between 1 and 160 or length(note_text)>1000 or not coalesce((p_input->>'date')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$',false) then raise exception 'Invalid milestone content' using errcode='22023';end if;
  day:=(p_input->>'date')::date;if day not between date '1900-01-01' and date '2100-12-31' then raise exception 'Invalid milestone date' using errcode='22023';end if;
 elsif act in('milestone_archive','milestone_restore') then
  if keys is distinct from array['action','actionId','milestoneId','revision','workId'] then raise exception 'Invalid milestone archive fields' using errcode='22023';end if;
 else raise exception 'Unknown milestone operation' using errcode='22023';end if;
 if jsonb_typeof(p_input->'actionId') is distinct from 'string' or jsonb_typeof(p_input->'milestoneId') is distinct from 'string' or jsonb_typeof(p_input->'workId') is distinct from 'string' or jsonb_typeof(p_input->'revision') is distinct from 'number' or not coalesce((p_input->>'revision')~'^[0-9]{1,10}$',false) or(p_input->>'revision')::numeric not between 0 and 2147483646 then raise exception 'Invalid milestone identity' using errcode='22023';end if;
 aid:=(p_input->>'actionId')::uuid;mid:=(p_input->>'milestoneId')::uuid;wid:=p_input->>'workId';rev:=(p_input->>'revision')::integer;
 if length(wid) not between 1 and 160 then raise exception 'Invalid milestone scope' using errcode='22023';end if;
 perform public.pro_work_schedule_owner(p_actor,wid);
 perform pg_advisory_xact_lock(hashtextextended('pro-work-schedule-action:'||p_actor::text||':'||aid::text,0));
 perform pg_advisory_xact_lock(hashtextextended('pro-work-tasks:'||p_actor::text||':'||wid,0));
 perform public.pro_work_schedule_owner(p_actor,wid);
 select * into r from public.pro_work_schedule_actions where actor_id=p_actor and action_id=aid;
 if found then if r.input is distinct from p_input then raise exception 'Schedule identity reused' using errcode='22023';end if;return r.result;end if;
 select revision into current_rev from public.pro_work_schedule_heads where owner_id=p_actor and work_id=wid for update;current_rev:=coalesce(current_rev,0);
 if rev<>current_rev then raise exception 'Schedule changed' using errcode='40001';end if;
 if current_rev>=2147483647 then raise exception 'Schedule revision exhausted' using errcode='54000';end if;
 select * into m from public.pro_work_schedule_milestones where owner_id=p_actor and work_id=wid and id=mid for update;
 if found then
  before_json:=public.pro_work_milestone_json(m);
  if act='milestone_save' then
   if m.archived then raise exception 'Milestone archived' using errcode='40001';end if;
   update public.pro_work_schedule_milestones set title=title_text,milestone_date=day,notes=note_text where owner_id=p_actor and work_id=wid and id=mid returning * into m;
  else
   if m.archived=(act='milestone_archive') then raise exception 'Milestone status changed' using errcode='40001';end if;
   update public.pro_work_schedule_milestones set archived=act='milestone_archive' where owner_id=p_actor and work_id=wid and id=mid returning * into m;
  end if;
 else
  if act<>'milestone_save' then raise exception 'Milestone unavailable' using errcode='42501';end if;
  if(select count(*) from public.pro_work_schedule_milestones where owner_id=p_actor and work_id=wid)>=500 then raise exception 'Milestone limit reached' using errcode='54000';end if;
  insert into public.pro_work_schedule_milestones(owner_id,work_id,id,title,milestone_date,notes) values(p_actor,wid,mid,title_text,day,note_text) returning * into m;
 end if;
 perform public.pro_work_schedule_owner(p_actor,wid);
 answer:=jsonb_build_object('action',act,'workId',wid,'revision',current_rev+1,'milestone',public.pro_work_milestone_json(m));
 insert into public.pro_work_schedule_heads(owner_id,work_id,revision) values(p_actor,wid,current_rev+1) on conflict(owner_id,work_id) do update set revision=excluded.revision,updated_at=now();
 insert into public.pro_work_schedule_actions(actor_id,action_id,work_id,input,result,before_state) values(p_actor,aid,wid,p_input,answer,before_json);return answer;
end $$;
create or replace function public.pro_work_schedule_action_v2_read(p_actor uuid,p_work text,p_action uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r public.pro_work_schedule_actions;
begin
 perform public.pro_work_schedule_owner(p_actor,p_work);
 select * into r from public.pro_work_schedule_actions where actor_id=p_actor and work_id=p_work and action_id=p_action;
 if not found then return null;end if;
 if r.input->>'action' not in('milestone_save','milestone_archive','milestone_restore') then return public.pro_work_schedule_action_read(p_actor,p_work,p_action);end if;
 if not exists(select 1 from public.pro_work_schedule_milestones where owner_id=p_actor and work_id=p_work and id=(r.input->>'milestoneId')::uuid) then raise exception 'Milestone unavailable' using errcode='42501';end if;
 return r.result;
end $$;
alter table public.pro_work_schedule_milestones enable row level security;
revoke all on public.pro_work_schedule_milestones from public,anon,authenticated;
grant select,insert,update,delete on public.pro_work_schedule_milestones to service_role;
revoke all on function public.pro_work_milestone_json(public.pro_work_schedule_milestones),public.pro_work_milestones_read(uuid,text,uuid,text,uuid),public.pro_work_milestones_mutate(uuid,jsonb),public.pro_work_schedule_action_v2_read(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.pro_work_milestone_json(public.pro_work_schedule_milestones),public.pro_work_milestones_read(uuid,text,uuid,text,uuid),public.pro_work_milestones_mutate(uuid,jsonb),public.pro_work_schedule_action_v2_read(uuid,text,uuid) to service_role;
commit;
