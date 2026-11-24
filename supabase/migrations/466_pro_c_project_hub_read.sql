-- Pro area C: read the pin flag, custom status and custom status list of ONE project for the in-project menu
-- (tables pro_project_hub_state / pro_project_statuses belong to the projects hub, migration 461). Read only.
begin;
create or replace function public.pro_project_hub_read_one(p_actor uuid,p_work text) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare st public.pro_project_hub_state;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 then raise exception 'Invalid project' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work w where w.user_id=p_actor and w.id=p_work) then raise exception 'Project not found' using errcode='P0002';end if;
 select * into st from public.pro_project_hub_state s where s.owner_id=p_actor and s.work_id=p_work;
 return jsonb_build_object('pinned',coalesce(st.pinned,false),'statusId',st.status_id,
  'statuses',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'color',u.color) order by u.position,u.name) from public.pro_project_statuses u where u.owner_id=p_actor),'[]'::jsonb));
end $$;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='pro_project_hub_read_one' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
