-- LOCAL Pro only. Sole allowlisted replacement: owner plan authorization.
-- Team context/client readers and all writers remain unchanged. This shared guard
-- is also consumed by owner DailyLogs/file/discussion/template helpers; their
-- additional direct public-availability guards are intentionally unchanged.
begin;
create or replace function public.pro_work_schedule_owner(p_actor uuid,p_work text) returns void language plpgsql volatile security invoker set search_path=public,pg_temp as $$
begin if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) or not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then raise exception 'Forbidden' using errcode='42501';end if;end $$;
revoke all on function public.pro_work_schedule_owner(uuid,text) from public,anon,authenticated;
grant execute on function public.pro_work_schedule_owner(uuid,text) to service_role;
commit;
notify pgrst, 'reload schema';
