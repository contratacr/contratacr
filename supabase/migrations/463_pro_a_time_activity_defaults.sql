-- Pro area A (time management, "Activities and Rates"): default markup % and taxable flag per activity. Side table keyed by the
-- activity (pro_time_activities), same pattern as pro_product_pricing: owner only, service_role only, optimistic revision, bounds in SQL.
-- The Time tracking form uses them as the starting values of a manual time entry; the entry can still override both.
begin;
create table if not exists public.pro_time_activity_defaults(
 owner_id uuid not null,
 activity_id uuid not null,
 markup_bps integer not null default 0 check(markup_bps between 0 and 100000),
 taxable boolean not null default false,
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now(),
 primary key(owner_id,activity_id),
 foreign key(owner_id,activity_id) references public.pro_time_activities(owner_id,id) on delete cascade
);
create or replace function public.pro_time_activity_defaults_read(p_actor uuid) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 return coalesce((select jsonb_object_agg(d.activity_id::text,jsonb_build_object('revision',d.revision,'markupBps',d.markup_bps,'taxable',d.taxable))
  from public.pro_time_activity_defaults d where d.owner_id=p_actor),'{}'::jsonb);
end $$;
create or replace function public.pro_time_activity_defaults_save(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare aid uuid;rev integer;bps integer;tax boolean;cur integer;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_input is null or jsonb_typeof(p_input)<>'object' or jsonb_typeof(p_input->'taxable')<>'boolean'
  or not coalesce(p_input->>'markupBps'~'^[0-9]{1,6}$',false) or not coalesce(p_input->>'revision'~'^[0-9]{1,9}$',false) then raise exception 'Invalid defaults' using errcode='22023';end if;
 begin aid:=(p_input->>'activityId')::uuid;exception when others then raise exception 'Invalid defaults' using errcode='22023';end;
 bps:=(p_input->>'markupBps')::integer;tax:=(p_input->>'taxable')::boolean;rev:=(p_input->>'revision')::integer;
 if bps>100000 then raise exception 'Invalid defaults' using errcode='22023';end if;
 if not exists(select 1 from public.pro_time_activities a where a.owner_id=p_actor and a.id=aid) then raise exception 'Activity not found' using errcode='P0002';end if;
 select d.revision into cur from public.pro_time_activity_defaults d where d.owner_id=p_actor and d.activity_id=aid for update;
 cur:=coalesce(cur,0);
 if cur<>rev then raise exception 'Defaults changed' using errcode='40001';end if;
 insert into public.pro_time_activity_defaults(owner_id,activity_id,markup_bps,taxable,revision) values(p_actor,aid,bps,tax,cur+1)
  on conflict(owner_id,activity_id) do update set markup_bps=excluded.markup_bps,taxable=excluded.taxable,revision=excluded.revision,updated_at=now();
 return jsonb_build_object('activityId',aid,'revision',cur+1,'markupBps',bps,'taxable',tax);
end $$;
do $$declare f record;begin
 alter table public.pro_time_activity_defaults enable row level security;
 revoke all on public.pro_time_activity_defaults from public,anon,authenticated;
 grant select,insert,update,delete on public.pro_time_activity_defaults to service_role;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('pro_time_activity_defaults_read','pro_time_activity_defaults_save') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
