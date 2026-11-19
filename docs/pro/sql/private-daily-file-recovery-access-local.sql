-- LOCAL Pro only: two owner receipt readers, no writer or audience changes.
begin;
create or replace function public.pro_daily_file_reconcile_read(p_actor uuid,p_action uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$declare a pro_daily_log_file_reconcile_actions;begin
 if not coalesce(pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;select * into a from pro_daily_log_file_reconcile_actions where owner_id=p_actor and action_id=p_action;if not found then return jsonb_build_object('attempt',null);end if;perform pro_daily_file_reconcile_owner(p_actor,a.work_id,a.log_id);return jsonb_build_object('attempt',pro_daily_file_reconcile_json(a));end $$;
create or replace function public.pro_daily_log_duplicate_retire_read(p_actor uuid,p_action uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$declare r pro_daily_log_duplicate_retirements;begin
 if not coalesce(pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into r from pro_daily_log_duplicate_retirements where owner_id=p_actor and action_id=p_action;if not found then return jsonb_build_object('retirement',null);end if;perform pro_work_schedule_owner(p_actor,r.work_id);return jsonb_build_object('retirement',r.result);end $$;
revoke all on function public.pro_daily_file_reconcile_read(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pro_daily_file_reconcile_read(uuid,uuid) to service_role;
revoke all on function public.pro_daily_log_duplicate_retire_read(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pro_daily_log_duplicate_retire_read(uuid,uuid) to service_role;
commit;
notify pgrst, 'reload schema';
