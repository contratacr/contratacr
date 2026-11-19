-- LOCAL PRO ONLY. Read-only "Projects" hub over existing jobs (pro_work).
-- No new tables and no writes. The status is derived from the existing job
-- fields; it never changes them. Ordered newest first by the stable identity
-- position, because pro_work has no creation timestamp (none is invented).
begin;
create or replace function public.pro_project_status(p_work public.pro_work) returns text
language sql immutable security invoker set search_path=public,pg_temp as $$
 select case when coalesce(p_work.cancelled,false) then 'cancelled' when p_work.stage='completed' then 'completed'
  when p_work.stage='scheduled' and p_work."start"<>'' then 'in_progress' else 'open' end;
$$;
create or replace function public.pro_projects_page(p_actor uuid,p_status text default 'active',p_search text default '',p_after bigint default null) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare items jsonb;next_cursor bigint;counts jsonb;needle text;
begin
 if not coalesce(public.pro_private_work_tools_enabled(p_actor),false) then raise exception 'Forbidden' using errcode='42501';end if;
 if p_status is null or p_status not in('active','open','in_progress','completed','cancelled','all') or p_search is null or length(p_search)>160 or p_after is not null and p_after<1 then
  raise exception 'Invalid project query' using errcode='22023';end if;
 needle:=nullif(btrim(p_search),'');
 select jsonb_build_object('open',count(*) filter(where s='open'),'in_progress',count(*) filter(where s='in_progress'),'completed',count(*) filter(where s='completed'),'cancelled',count(*) filter(where s='cancelled'),'all',count(*))
  into counts from (select public.pro_project_status(w) s from public.pro_work w where w.user_id=p_actor) x;
 select coalesce(jsonb_agg(x.content order by x.position desc),'[]'::jsonb) into items from (
  select w.position,jsonb_build_object('id',w.id,'name',w.service,'client',w.client,'clientId',w."clientId",'status',public.pro_project_status(w),
   'start',nullif(w."start",''),'end',nullif(w."end",''),'hasQuote',w."quoteId" is not null or w."externalQuoteId" is not null,
   'linkedCustomer',exists(select 1 from public.pro_appointment_requests r join public.profiles c on c.id=r.client_user_id
     where r.owner_id=w.user_id and r.work_id=w.id and r.status in('confirmed','completed') and not coalesce(c.is_disabled,false)),
   'customView',exists(select 1 from public.pro_client_dashboards d where d.owner_id=w.user_id and d.work_id=w.id)) as content
  from public.pro_work w
  where w.user_id=p_actor and (p_after is null or w.position<p_after)
   and (p_status='all' or p_status='active' and public.pro_project_status(w) in('open','in_progress') or public.pro_project_status(w)=p_status)
   and (needle is null or strpos(lower(w.service),lower(needle))>0 or strpos(lower(w.client),lower(needle))>0)
  order by w.position desc limit 21
 ) x;
 if jsonb_array_length(items)>20 then
  select w.position into next_cursor from public.pro_work w where w.user_id=p_actor and w.id=items->19->>'id';
  items:=items-20;
 end if;
 return jsonb_build_object('items',items,'nextCursor',next_cursor,'counts',counts);
end $$;
revoke all on function public.pro_project_status(public.pro_work),public.pro_projects_page(uuid,text,text,bigint) from public,anon,authenticated;
grant execute on function public.pro_project_status(public.pro_work),public.pro_projects_page(uuid,text,text,bigint) to service_role;
commit;
