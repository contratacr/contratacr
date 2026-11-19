-- LOCAL PRO ONLY. Read-only combined list; existing records are not changed.
begin;
create or replace function public.pro_appointment_inbox(p_owner uuid,p_status text default 'pending',p_after jsonb default null) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 with entries as (
 select r.id::text id,'request'::text source,r.client_name client,r.service,
 coalesce(pro_instant(w.start),r.proposed_start,r.requested_start) start,
 coalesce(pro_instant(w.start),r.proposed_start,r.requested_start,r.created_at) at,
 case when w.cancelled or r.status in ('cancelled','declined') then 'cancelled' when w.stage='completed' or r.status='completed' then 'completed' when r.status in ('requested','proposed') then 'pending' else 'confirmed' end status,
 r.status detail_status
 from pro_appointment_requests r left join pro_work w on w.user_id=r.owner_id and w.id=r.work_id where r.owner_id=p_owner and r.origin='booking'
 union all
 select w.id,'manual',w.client,w.service,pro_instant(w.start),coalesce(pro_instant(w.start),'epoch'::timestamptz),
 -- Round 1 (2026-11-12): a job of the owner that is still new/quoting or has no dates is
 -- pending (to be scheduled), not confirmed; jobs linked by invitation are listed here too.
 case when w.cancelled then 'cancelled' when w.stage='completed' then 'completed' when w.stage in('new','quoting') or btrim(w.start)='' then 'pending' else 'confirmed' end,w.stage
 from pro_work w where w.user_id=p_owner and not exists(select 1 from pro_appointment_requests r where r.owner_id=p_owner and r.work_id=w.id and r.origin='booking')
 ), page as (
 select * from entries where (p_status='all' or status=p_status)
 and (p_after is null or (at,source,id)>((p_after->>'at')::timestamptz,p_after->>'source',p_after->>'id'))
 order by at,source,id limit 26
 ), visible as (select * from page order by at,source,id limit 25)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(v)-'at' order by at,source,id) from visible v),'[]'::jsonb),
 'nextCursor',case when (select count(*) from page)>25 then (select jsonb_build_object('at',at,'source',source,'id',id) from visible order by at desc,source desc,id desc limit 1) else null end);
$$;
revoke all on function public.pro_appointment_inbox(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.pro_appointment_inbox(uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
