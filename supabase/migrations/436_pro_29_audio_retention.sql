-- Pro row 76: retention of meeting and call audio. The audio (bytea in pro_ai_recordings) is deleted automatically
-- after a number of days chosen by the server (PRO_AI_AUDIO_RETENTION_DAYS, default 90); the reviewed notes,
-- summaries and tasks are kept. The function only touches the owner's own recordings, deletes nothing else and
-- is granted to service_role only (the route calls it when the owner opens the job's meetings).
begin;
create or replace function public.pro_ai_recordings_purge(p_actor uuid,p_days integer) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare removed integer;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_days is null or p_days<0 or p_days>3650 then raise exception 'Invalid retention' using errcode='22023';end if;
 delete from public.pro_ai_recordings where owner_id=p_actor and created_at<clock_timestamp()-make_interval(days=>p_days);
 get diagnostics removed=row_count;
 return jsonb_build_object('removed',removed,'days',p_days);
end $$;
revoke all on function public.pro_ai_recordings_purge(uuid,integer) from public,anon,authenticated;
grant execute on function public.pro_ai_recordings_purge(uuid,integer) to service_role;
commit;
