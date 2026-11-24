-- Pro area A (time management, "Activities and Rates"): team permissions per activity. An activity with no rows is open to the whole team
-- (previous behaviour); with rows, only those team members (by account) can be credited with hours on it. The owner is always allowed.
-- Enforced in the same writer path as the crediting (pro_time_mutate_person), so no entry is written when the member is not allowed.
begin;
create table if not exists public.pro_time_activity_members(
 owner_id uuid not null,
 activity_id uuid not null,
 member_user_id uuid not null,
 created_at timestamptz not null default now(),
 primary key(owner_id,activity_id,member_user_id),
 foreign key(owner_id,activity_id) references public.pro_time_activities(owner_id,id) on delete cascade
);
create or replace function public.pro_time_activity_members_read(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 return jsonb_build_object(
  'restrictions',coalesce((select jsonb_object_agg(r.activity_id::text,r.ids) from (
    select m.activity_id,jsonb_agg(m.member_user_id::text order by m.member_user_id) as ids from public.pro_time_activity_members m where m.owner_id=p_actor group by m.activity_id) r),'{}'::jsonb),
  'members',coalesce((select jsonb_agg(jsonb_build_object('userId',x.member_user_id,'name',x.member_name) order by lower(x.member_name),x.member_user_id) from (
    select g.member_user_id,coalesce(nullif(btrim(max(g.member_name)),''),'Miembro') as member_name from public.pro_team_grants g where g.owner_id=p_actor and g.active group by g.member_user_id limit 100) x),'[]'::jsonb));
end $$;
create or replace function public.pro_time_activity_members_save(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare aid uuid;ids uuid[];n integer;saved jsonb;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_input is null or jsonb_typeof(p_input)<>'object' or jsonb_typeof(p_input->'memberUserIds')<>'array' or jsonb_array_length(p_input->'memberUserIds')>100 then raise exception 'Invalid members' using errcode='22023';end if;
 begin aid:=(p_input->>'activityId')::uuid;exception when others then raise exception 'Invalid members' using errcode='22023';end;
 begin select coalesce(array_agg(distinct v::uuid),'{}'::uuid[]) into ids from jsonb_array_elements_text(p_input->'memberUserIds') as t(v);exception when others then raise exception 'Invalid members' using errcode='22023';end;
 if not exists(select 1 from public.pro_time_activities a where a.owner_id=p_actor and a.id=aid) then raise exception 'Activity not found' using errcode='P0002';end if;
 select count(*) into n from public.pro_team_grants g where g.owner_id=p_actor and g.active and g.member_user_id=any(ids);
 if n=0 and cardinality(ids)>0 then raise exception 'Invalid members' using errcode='22023';end if;
 delete from public.pro_time_activity_members m where m.owner_id=p_actor and m.activity_id=aid;
 insert into public.pro_time_activity_members(owner_id,activity_id,member_user_id)
  select p_actor,aid,u from unnest(ids) as u where exists(select 1 from public.pro_team_grants g where g.owner_id=p_actor and g.active and g.member_user_id=u);
 select coalesce(jsonb_agg(m.member_user_id::text order by m.member_user_id),'[]'::jsonb) into saved from public.pro_time_activity_members m where m.owner_id=p_actor and m.activity_id=aid;
 return jsonb_build_object('activityId',aid,'memberUserIds',saved);
end $$;
-- The people of a job now also carry the account id so the form can hide members who cannot take the chosen activity.
create or replace function public.pro_time_people(p_actor uuid,p_work text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_array(jsonb_build_object('grantId',null,'name',coalesce(nullif(btrim(p.full_name),''),'Propietario'),'self',true))
  ||coalesce((select jsonb_agg(jsonb_build_object('grantId',g.id,'name',coalesce(nullif(btrim(g.member_name),''),'Miembro'),'self',false,'memberUserId',g.member_user_id) order by lower(g.member_name),g.id)
   from pro_team_grants g where g.owner_id=p_actor and g.work_id=p_work and g.active),'[]'::jsonb)
 from profiles p where p.id=p_actor and exists(select 1 from pro_work w where w.user_id=p_actor and w.id=p_work);
$$;
create or replace function public.pro_time_mutate_person(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb;g pro_team_grants;who text;eid uuid;aid uuid;
begin
 if jsonb_typeof(p_input) is distinct from 'object' or not(p_input ? 'personGrantId') then return public.pro_time_mutate(p_actor,p_input);end if;
 if p_input->>'action' not in('start','manual') or jsonb_typeof(p_input->'personGrantId') not in('string','null') then raise exception 'Invalid time person' using errcode='22023';end if;
 if p_input->>'personGrantId' is null then
  select coalesce(nullif(btrim(full_name),''),'Propietario') into who from profiles where id=p_actor;
 else
  select * into g from pro_team_grants where id=(p_input->>'personGrantId')::uuid and owner_id=p_actor and work_id=p_input->>'workId' and active;
  if not found then raise exception 'Team member unavailable' using errcode='40001';end if;
  who:=coalesce(nullif(btrim(g.member_name),''),'Miembro');
  if jsonb_typeof(p_input->'activityId')='string' then
   aid:=(p_input->>'activityId')::uuid;
   if exists(select 1 from pro_time_activity_members m where m.owner_id=p_actor and m.activity_id=aid)
    and not exists(select 1 from pro_time_activity_members m where m.owner_id=p_actor and m.activity_id=aid and m.member_user_id=g.member_user_id)
   then raise exception 'Member not allowed on this activity' using errcode='42501';end if;
  end if;
 end if;
 result:=public.pro_time_mutate(p_actor,p_input-'personGrantId');
 eid:=(p_input->>'entryId')::uuid;
 insert into pro_time_entry_people(owner_id,entry_id,grant_id,name) values(p_actor,eid,g.id,left(who,160))
  on conflict(owner_id,entry_id) do nothing;
 return jsonb_set(result,'{entry}',public.pro_time_entry_json((select e from pro_time_entries e where e.owner_id=p_actor and e.id=eid)));
end $$;
do $$declare f record;begin
 alter table public.pro_time_activity_members enable row level security;
 revoke all on public.pro_time_activity_members from public,anon,authenticated;
 grant select,insert,update,delete on public.pro_time_activity_members to service_role;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('pro_time_activity_members_read','pro_time_activity_members_save','pro_time_people','pro_time_mutate_person') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
