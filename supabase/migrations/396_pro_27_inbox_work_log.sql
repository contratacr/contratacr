-- Pro row 10: conversation log per job. Reads the received messages (read-only copy) that the owner linked to ONE job
-- so the job screen can show them next to the emails sent or simulated from that job. Changes nothing.
begin;
create or replace function public.pro_inbox_work_read(p_actor uuid,p_work text,p_limit integer default 30) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_work is null or length(p_work) not between 1 and 160 or p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid query' using errcode='22023';end if;
 if not exists(select 1 from public.pro_work where user_id=p_actor and id=p_work) then raise exception 'Job unavailable' using errcode='P0002';end if;
 return jsonb_build_object('messages',coalesce((select jsonb_agg(x order by x->>'receivedAt' desc) from (
   select jsonb_build_object('provider',i.provider,'remoteId',i.remote_id,'mode',i.mode,'fromEmail',i.from_email,'fromName',i.from_name,'subject',i.subject,
    'snippet',i.snippet,'receivedAt',i.received_at,'workId',i.work_id) x
   from public.pro_inbox_messages i where i.owner_id=p_actor and i.work_id=p_work order by i.received_at desc limit p_limit) q),'[]'::jsonb));
end $$;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='pro_inbox_work_read' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
