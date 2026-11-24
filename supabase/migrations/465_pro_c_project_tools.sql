-- Pro area C (inside a project): small per-project and per-owner side stores for task tags, time markup/taxable,
-- per-project activity rates, project pin / overview scope and custom statuses / templates.
-- Same pattern as pro_product_pricing (460): owner only, service_role only, optimistic concurrency (revision), bounds in SQL.
-- Shapes of each kind are validated by the API (strict zod); SQL enforces owner, existence of the keyed record, size and CAS.
begin;

create table if not exists public.pro_work_extras(
 owner_id uuid not null,work_id text not null,kind text not null check(kind in('task','time','prefs','activity')),
 key text not null check(length(key) between 0 and 160),
 data jsonb not null check(jsonb_typeof(data)='object' and octet_length(data::text)<=4096),
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now(),
 primary key(owner_id,work_id,kind,key),
 foreign key(owner_id,work_id) references public.pro_work(user_id,id) on delete cascade
);

create table if not exists public.pro_owner_extras(
 owner_id uuid not null,kind text not null check(kind in('statuses','templates')),
 key text not null check(length(key) between 0 and 160),
 data jsonb not null check(jsonb_typeof(data)='object' and octet_length(data::text)<=16384),
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now(),
 primary key(owner_id,kind,key)
);

-- Work level read: returns {key:{revision,data}} for the requested keys (all keys of the kind when p_keys is null).
create or replace function public.pro_work_extras_read(p_actor uuid,p_work text,p_kind text,p_keys text[]) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_kind is null or p_kind not in('task','time','prefs','activity') or p_work is null or length(p_work) not between 1 and 160 then raise exception 'Invalid extras' using errcode='22023';end if;
 if p_keys is not null and cardinality(p_keys)>200 then raise exception 'Invalid extras' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work w where w.user_id=p_actor and w.id=p_work) then raise exception 'Work unavailable' using errcode='P0002';end if;
 return coalesce((select jsonb_object_agg(e.key,jsonb_build_object('revision',e.revision,'data',e.data))
  from public.pro_work_extras e where e.owner_id=p_actor and e.work_id=p_work and e.kind=p_kind and(p_keys is null or e.key=any(p_keys))),'{}'::jsonb);
end $$;

create or replace function public.pro_work_extras_set(p_actor uuid,p_work text,p_kind text,p_key text,p_revision integer,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare cur public.pro_work_extras;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_kind is null or p_kind not in('task','time','prefs','activity') or p_work is null or length(p_work) not between 1 and 160
  or p_key is null or length(p_key) not between 0 and 160 or p_revision is null or p_revision<0
  or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>4096 then raise exception 'Invalid extras' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work w where w.user_id=p_actor and w.id=p_work) then raise exception 'Work unavailable' using errcode='P0002';end if;
 if p_kind='task' and not exists(select 1 from public.pro_work_tasks t where t.owner_id=p_actor and t.work_id=p_work and t.id::text=p_key) then raise exception 'Record unavailable' using errcode='P0002';end if;
 if p_kind='time' and not exists(select 1 from public.pro_time_entries t where t.owner_id=p_actor and t.work_id=p_work and t.id::text=p_key) then raise exception 'Record unavailable' using errcode='P0002';end if;
 if p_kind='activity' and not exists(select 1 from public.pro_time_activities a where a.owner_id=p_actor and a.id::text=p_key) then raise exception 'Record unavailable' using errcode='P0002';end if;
 if p_kind='prefs' and p_key<>'' then raise exception 'Invalid extras' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-work-extras:'||p_actor::text||':'||p_work||':'||p_kind||':'||p_key,0));
 select * into cur from public.pro_work_extras e where e.owner_id=p_actor and e.work_id=p_work and e.kind=p_kind and e.key=p_key for update;
 if not found then
  if p_revision<>0 then raise exception 'Stale extras' using errcode='40001';end if;
  insert into public.pro_work_extras(owner_id,work_id,kind,key,data) values(p_actor,p_work,p_kind,p_key,p_data);
 else
  if cur.revision<>p_revision then raise exception 'Stale extras' using errcode='40001';end if;
  update public.pro_work_extras e set data=p_data,revision=e.revision+1,updated_at=now()
   where e.owner_id=p_actor and e.work_id=p_work and e.kind=p_kind and e.key=p_key;
 end if;
 return public.pro_work_extras_read(p_actor,p_work,p_kind,array[p_key])->p_key;
end $$;

-- Phase and planned dates a task is linked to in the project schedule (read only).
create or replace function public.pro_work_task_schedule_link(p_actor uuid,p_work text,p_tasks uuid[]) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 or p_tasks is null or cardinality(p_tasks)>200 then raise exception 'Invalid extras' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work w where w.user_id=p_actor and w.id=p_work) then raise exception 'Work unavailable' using errcode='P0002';end if;
 return coalesce((select jsonb_object_agg(pl.task_id::text,jsonb_build_object('phase',ph.title,'start',pl.planned_start,'end',pl.planned_end))
  from public.pro_work_schedule_plans pl
  left join public.pro_work_schedule_phases ph on ph.owner_id=pl.owner_id and ph.work_id=pl.work_id and ph.id=pl.phase_id
  where pl.owner_id=p_actor and pl.work_id=p_work and pl.task_id=any(p_tasks)),'{}'::jsonb);
end $$;

-- Owner level read/set (statuses, project templates).
create or replace function public.pro_owner_extras_read(p_actor uuid,p_kind text,p_keys text[]) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_kind is null or p_kind not in('statuses','templates') then raise exception 'Invalid extras' using errcode='22023';end if;
 if p_keys is not null and cardinality(p_keys)>200 then raise exception 'Invalid extras' using errcode='22023';end if;
 return coalesce((select jsonb_object_agg(e.key,jsonb_build_object('revision',e.revision,'data',e.data))
  from public.pro_owner_extras e where e.owner_id=p_actor and e.kind=p_kind and(p_keys is null or e.key=any(p_keys))),'{}'::jsonb);
end $$;

create or replace function public.pro_owner_extras_set(p_actor uuid,p_kind text,p_key text,p_revision integer,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare cur public.pro_owner_extras;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_kind is null or p_kind not in('statuses','templates') or p_key is null or p_key<>''
  or p_revision is null or p_revision<0 or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>16384 then raise exception 'Invalid extras' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pro-owner-extras:'||p_actor::text||':'||p_kind,0));
 select * into cur from public.pro_owner_extras e where e.owner_id=p_actor and e.kind=p_kind and e.key=p_key for update;
 if not found then
  if p_revision<>0 then raise exception 'Stale extras' using errcode='40001';end if;
  insert into public.pro_owner_extras(owner_id,kind,key,data) values(p_actor,p_kind,p_key,p_data);
 else
  if cur.revision<>p_revision then raise exception 'Stale extras' using errcode='40001';end if;
  update public.pro_owner_extras e set data=p_data,revision=e.revision+1,updated_at=now()
   where e.owner_id=p_actor and e.kind=p_kind and e.key=p_key;
 end if;
 return public.pro_owner_extras_read(p_actor,p_kind,array[p_key])->p_key;
end $$;

do $$declare f record;begin
 alter table public.pro_work_extras enable row level security;
 alter table public.pro_owner_extras enable row level security;
 revoke all on public.pro_work_extras,public.pro_owner_extras from public,anon,authenticated;
 grant select,insert,update,delete on public.pro_work_extras,public.pro_owner_extras to service_role;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('pro_work_extras_read','pro_work_extras_set','pro_work_task_schedule_link','pro_owner_extras_read','pro_owner_extras_set') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
