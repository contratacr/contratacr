-- LOCAL ONLY. Relational scoped reads and atomic partial writes; workspace JSON is never consulted.
begin;
-- Preserve legacy timestamp spelling; safely index instants even for unscheduled empty dates.
create or replace function public.pro_instant(p_value text) returns timestamptz
language plpgsql immutable strict security invoker set search_path=public,pg_temp as $$
begin return p_value::timestamptz;exception when invalid_datetime_format or datetime_field_overflow then return null;end $$;
create index if not exists pro_work_overlap on public.pro_work(user_id,pro_instant("start"),pro_instant("end")) where not cancelled;
create index if not exists pro_availability_overlap on public.pro_availability(user_id,pro_instant("start"),pro_instant("end"));
-- Remove the historical overload so PostgREST can resolve optional mode/search unambiguously.
drop function if exists public.pro_agenda_page(uuid,text,text,jsonb);
create index if not exists pro_work_client_time on public.pro_work(user_id,pro_instant("start"),id);
create or replace function public.pro_agenda_page(p_user uuid,p_day text,p_month text,p_after jsonb default null,p_mode text default 'day',p_search text default '') returns jsonb
language sql security invoker set search_path=public,pg_temp as $$
 with bounds as (
 select p_day::date::timestamp at time zone 'America/Costa_Rica' as day_start,
 (p_day::date+1)::timestamp at time zone 'America/Costa_Rica' as day_end
 ), appointments as (
 select jsonb_strip_nulls(to_jsonb(r)-'user_id'-'position') as w,pro_instant(r.start) as at,r.id
 from pro_work r cross join bounds
 where r.user_id=p_user
 and (case when p_mode='upcoming' then not r.cancelled and r.stage<>'completed' and pro_instant(r."end")>now()
 else pro_instant(r.start)<day_end and pro_instant(r."end")>day_start end)
 and (p_mode<>'upcoming' or strpos(pro_catalog_search(r.client||' '||r.service),pro_catalog_search(p_search))>0)
 and (p_after is null or (pro_instant(r.start),r.id)>(pro_instant(p_after->>'start'),p_after->>'id'))
 order by pro_instant(r.start),r.id limit 21
 ), times as (
 select jsonb_build_object('start',s.start,'end',s."end") as s from pro_availability s cross join bounds
 where p_mode='day' and s.user_id=p_user and pro_instant(s.start)<day_end and pro_instant(s."end")>day_start
 ), days as (
 select day::date as day from generate_series((p_month||'-01')::date::timestamp,((p_month||'-01')::date+interval '1 month'-interval '1 day')::timestamp,interval '1 day') day
 ), marks as (
 select day::text as day from days where p_mode='day' and (
 exists(select 1 from pro_work w where w.user_id=p_user and not w.cancelled and pro_instant(w.start)<(days.day+1)::timestamp at time zone 'America/Costa_Rica' and pro_instant(w."end")>days.day::timestamp at time zone 'America/Costa_Rica')
 or exists(select 1 from pro_availability s where s.user_id=p_user and pro_instant(s.start)<(days.day+1)::timestamp at time zone 'America/Costa_Rica' and pro_instant(s."end")>days.day::timestamp at time zone 'America/Costa_Rica'))
 )
 select jsonb_build_object('revision',coalesce((select revision from pro_workspace_core where user_id=p_user),0),
 'work',coalesce((select jsonb_agg(w order by at,id) from (select * from appointments order by at,id limit 20) page),'[]'),
 'availability',coalesce((select jsonb_agg(s order by s->>'start') from times),'[]'),
 'marks',coalesce((select jsonb_agg(day order by day) from marks),'[]'),
 'nextCursor',case when (select count(*) from appointments)>20 then (select jsonb_build_object('start',to_char(at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'id',id) from appointments order by at,id offset 19 limit 1) else null end);
$$;
create or replace function public.pro_agenda_item(p_user uuid,p_id text) returns jsonb
language sql security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('revision',c.revision,'work',jsonb_strip_nulls(to_jsonb(w)-'user_id'-'position')) from pro_work w join pro_workspace_core c using(user_id) where w.user_id=p_user and w.id=p_id;
$$;
create or replace function public.pro_quotes_page(p_user uuid,p_search text default '',p_status text default 'all',p_client text default '',p_after jsonb default null) returns jsonb
language sql security invoker set search_path=public,pg_temp as $$
 with mine as (select id from professionals where profile_id=p_user),
 links as (select "quoteId" as quote_id,"clientId" as client_id from pro_quote_links where user_id=p_user),
 all_quotes as (
 select q.id::text as id,coalesce(q.title,'') as title,coalesce(q.client_name,'') as client,q.total,q.status,
 to_char(q.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as at,false as legacy,l.client_id as "clientId",'standard:'||q.id::text as key
 from quotes q left join links l on l.quote_id=q.id::text
 where q.deleted_at is null and (q.professional_id in (select id from mine) or q.client_id=p_user)
 union all
 select q.id,q.title,coalesce(c.name,''),
 (select coalesce(sum(net+floor(net*line.tax::double precision/100+0.5)),0)/100 from pro_legacy_quote_lines line cross join lateral (select floor(line.quantity::double precision*line.price::double precision*100+0.5) as net) cents where line.user_id=q.user_id and line.quote_id=q.id),
 q.status,'',true,q."clientId",'legacy:'||q.id
 from pro_legacy_quotes q left join pro_clients c on c.user_id=q.user_id and c.id=q."clientId" where q.user_id=p_user
 ), page as (
 select * from all_quotes where (p_status='all' or status=p_status) and (p_client='' or "clientId"=p_client)
 and strpos(pro_catalog_search(client||' '||title),pro_catalog_search(p_search))>0
 and (p_after is null or at<p_after->>'at' or at=p_after->>'at' and key>p_after->>'key')
 order by at desc,key limit 21
 )
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(r) order by at desc,key) from (select * from page order by at desc,key limit 20) r),'[]'),
 'nextCursor',case when (select count(*) from page)>20 then (select jsonb_build_object('at',at,'key',key) from page order by at desc,key offset 19 limit 1) else null end);
$$;

-- Global overlap checks execute under the owner lock, regardless of the visible page.
create or replace function public.pro_patch_core(p_user uuid,p_section text,p_row jsonb,p_revision integer) returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v integer;previous jsonb;records integer;begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select revision into v from pro_workspace_core where user_id=p_user for update;
 if coalesce(v,0)<>p_revision then raise exception 'revision conflict' using errcode='40001';end if;
 if p_section='work' then
 select jsonb_strip_nulls(to_jsonb(w)-'user_id'-'position') into previous from pro_work w where user_id=p_user and id=p_row->>'id';
 if previous is not null and previous->>'bookingClientId' is distinct from p_row->>'bookingClientId' then raise exception 'Booking identity is immutable' using errcode='22023';end if;
 if not exists(select 1 from pro_clients where user_id=p_user and id=p_row->>'clientId' and (not archived or previous->>'clientId'=id)) then raise exception 'Inactive client' using errcode='22023';end if;
 if coalesce(p_row->>'quoteId','')<>'' and not exists(select 1 from pro_legacy_quotes where user_id=p_user and id=p_row->>'quoteId' and "clientId"=p_row->>'clientId' and status='accepted') then raise exception 'Invalid legacy quote' using errcode='22023';end if;
 if p_row->>'externalQuoteId' is not null and not exists(select 1 from pro_quote_links l join quotes q on q.id::text=l."quoteId" join professionals p on p.id=q.professional_id where l.user_id=p_user and l."quoteId"=p_row->>'externalQuoteId' and l."clientId"=p_row->>'clientId' and p.profile_id=p_user and q.status='accepted' and q.deleted_at is null) then raise exception 'Invalid accepted quote' using errcode='22023';end if;
 if not (p_row->>'cancelled')::boolean and (p_row->>'stage'='scheduled' or p_row->>'start'<>'' or p_row->>'end'<>'') and (pro_instant(p_row->>'start') is null or pro_instant(p_row->>'end') is null or pro_instant(p_row->>'end')<=pro_instant(p_row->>'start')) then raise exception 'Invalid appointment time' using errcode='22023';end if;
 if not (p_row->>'cancelled')::boolean and p_row->>'stage'='scheduled' and exists(select 1 from pro_work where user_id=p_user and id<>p_row->>'id' and not cancelled and stage='scheduled' and pro_instant("start")<pro_instant(p_row->>'end') and pro_instant("end")>pro_instant(p_row->>'start')) then raise exception 'Overlapping appointment' using errcode='22023';end if;
 select count(*) into records from pro_work where user_id=p_user;
 elsif p_section='availability' then
 select jsonb_build_object('start',"start",'end',"end") into previous from pro_availability where user_id=p_user and "start"=p_row->>'start';
 if coalesce((p_row->>'remove')::boolean,false) then delete from pro_availability where user_id=p_user and "start"=p_row->>'start';
 elsif exists(select 1 from pro_availability where user_id=p_user and "start"<>p_row->>'start' and pro_instant("start")<pro_instant(p_row->>'end') and pro_instant("end")>pro_instant(p_row->>'start')) then raise exception 'Overlapping availability' using errcode='22023';end if;
 select count(*) into records from pro_availability where user_id=p_user;
 elsif p_section='quotes' then
 previous:=pro_legacy_quote_record(p_user,p_row->>'id');
 if previous is null or previous->>'status'<>'draft' and previous<>p_row then raise exception 'Resolved quote is immutable' using errcode='22023';end if;
 if not exists(select 1 from pro_clients where user_id=p_user and id=p_row->>'clientId' and not archived) then raise exception 'Inactive client' using errcode='22023';end if;
 select count(*) into records from pro_legacy_quotes where user_id=p_user;
 elsif p_section='quoteLinks' then
 select jsonb_build_object('quoteId',"quoteId",'clientId',"clientId") into previous from pro_quote_links where user_id=p_user and "quoteId"=p_row->>'quoteId';
 if previous is not null and previous<>p_row then raise exception 'Quote link is immutable' using errcode='22023';end if;
 if not exists(select 1 from quotes q join professionals p on p.id=q.professional_id join pro_clients c on c.user_id=p_user and c.id=p_row->>'clientId' and not c.archived where q.id::text=p_row->>'quoteId' and p.profile_id=p_user and q.deleted_at is null) then raise exception 'Invalid quote link' using errcode='22023';end if;
 select count(*) into records from pro_quote_links where user_id=p_user;
 else raise exception 'Invalid section' using errcode='22023';end if;
 if records+(case when previous is null then 1 else 0 end)>(case when p_section='availability' then 1000 else 10000 end) then raise exception 'Record limit' using errcode='22023';end if;
 v:=coalesce(v,0)+1;
 insert into pro_workspace_core(user_id,document,revision) values(p_user,'{"version":1,"social":[]}',v) on conflict(user_id) do update set revision=excluded.revision,updated_at=now();
 if not(p_section='availability' and coalesce((p_row->>'remove')::boolean,false)) then perform pro_upsert_panels(p_user,jsonb_build_object(p_section,jsonb_build_array(p_row)));end if;
 update pro_workspace_core set panel_fields=case when p_section=any(panel_fields) then panel_fields else array_append(panel_fields,p_section) end where user_id=p_user;
 return v;
end $$;
create or replace function public.pro_reserve_core(p_user uuid,p_client jsonb,p_work jsonb,p_revision integer) returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v integer;begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select revision into v from pro_workspace_core where user_id=p_user for update;
 if coalesce(v,0)<>p_revision then raise exception 'revision conflict' using errcode='40001';end if;
 if not exists(select 1 from pro_availability s where s.user_id=p_user and pro_instant(s.start)=pro_instant(p_work->>'start') and pro_instant(s."end")=pro_instant(p_work->>'end') and pro_instant(s.start)>now()+interval '15 minutes' and pro_instant(s.start)<now()+interval '90 days') or exists(select 1 from pro_work w where w.user_id=p_user and not w.cancelled and pro_instant(w.start)<pro_instant(p_work->>'end') and pro_instant(w."end")>pro_instant(p_work->>'start')) then raise exception 'Slot unavailable' using errcode='40001';end if;
 insert into pro_workspace_core(user_id,document,revision) values(p_user,'{"version":1,"social":[]}',coalesce(v,0)) on conflict do nothing;
 perform pro_upsert_catalog(p_user,jsonb_build_object('clients',jsonb_build_array(p_client)));
 return pro_patch_core(p_user,'work',p_work,p_revision);
end $$;
create or replace function public.pro_booking_context(p_user uuid,p_id text default '') returns jsonb
language sql security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('revision',coalesce((select revision from pro_workspace_core where user_id=p_user),0),
 'work',coalesce((select jsonb_agg(jsonb_strip_nulls(to_jsonb(w)-'user_id'-'position')) from pro_work w where user_id=p_user and id=p_id),'[]'),
 'availability',coalesce((select jsonb_agg(jsonb_build_object('start',s.start,'end',s."end") order by s.start) from pro_availability s where s.user_id=p_user and pro_instant(s.start)>now()+interval '15 minutes' and pro_instant(s.start)<now()+interval '90 days' and not exists(select 1 from pro_work w where w.user_id=p_user and not w.cancelled and pro_instant(w.start)<pro_instant(s."end") and pro_instant(w."end")>pro_instant(s.start))),'[]'));
$$;
-- Only the selected customer's history; no workspace reconstruction or N+1 requests.
create or replace function public.pro_client_history(p_user uuid,p_client text) returns jsonb
language sql security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object(
 'work',coalesce((select jsonb_agg(jsonb_strip_nulls(to_jsonb(w)-'user_id'-'position') order by position) from pro_work w where user_id=p_user and "clientId"=p_client),'[]'),
 'quotes',coalesce((select jsonb_agg(pro_legacy_quote_record(q.user_id,q.id) order by position) from pro_legacy_quotes q where user_id=p_user and "clientId"=p_client),'[]'),
 'quoteLinks',coalesce((select jsonb_agg(jsonb_build_object('quoteId',"quoteId",'clientId',"clientId") order by position) from pro_quote_links where user_id=p_user and "clientId"=p_client),'[]'));
$$;
revoke all on function public.pro_client_history(uuid,text) from public,anon,authenticated;
grant execute on function public.pro_client_history(uuid,text) to service_role;
revoke all on function public.pro_agenda_item(uuid,text),public.pro_agenda_page(uuid,text,text,jsonb,text,text),public.pro_quotes_page(uuid,text,text,text,jsonb),public.pro_patch_core(uuid,text,jsonb,integer),public.pro_reserve_core(uuid,jsonb,jsonb,integer),public.pro_booking_context(uuid,text) from public,anon,authenticated;
grant execute on function public.pro_agenda_item(uuid,text),public.pro_agenda_page(uuid,text,text,jsonb,text,text),public.pro_quotes_page(uuid,text,text,text,jsonb),public.pro_patch_core(uuid,text,jsonb,integer),public.pro_reserve_core(uuid,jsonb,jsonb,integer),public.pro_booking_context(uuid,text) to service_role;
notify pgrst,'reload schema';

-- Paged customer timeline. Only summaries cross the API; details retain their existing owner checks.
create or replace function public.pro_client_history_page(p_user uuid,p_client text,p_after jsonb default null) returns jsonb
language sql security invoker set search_path=public,pg_temp as $$
 with history as (
 select w.id,'work:'||w.id as key,'work'::text as kind,w.service as title,
 case when w.cancelled then 'cancelled' else w.stage end as status,
 coalesce(to_char(pro_instant(w.start) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'') as at,
 null::numeric as total,false as legacy,w.start as start,w."end" as "end"
 from pro_work w where w.user_id=p_user and w."clientId"=p_client
 union all
 select q.id::text,'standard:'||q.id::text,'quote',coalesce(q.title,''),q.status,
 to_char(q.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),q.total,false,null,null
 from pro_quote_links l join quotes q on q.id::text=l."quoteId"
 join professionals professional on professional.id=q.professional_id and professional.profile_id=p_user
 where l.user_id=p_user and l."clientId"=p_client and q.deleted_at is null
 union all
 select q.id,'legacy:'||q.id,'quote',q.title,q.status,'',
 (select coalesce(sum(net+floor(net*line.tax::double precision/100+0.5)),0)/100 from pro_legacy_quote_lines line cross join lateral (select floor(line.quantity::double precision*line.price::double precision*100+0.5) as net) cents where line.user_id=q.user_id and line.quote_id=q.id),true,null,null
 from pro_legacy_quotes q where q.user_id=p_user and q."clientId"=p_client
 ), page as (
 select * from history where p_after is null or at<p_after->>'at' or at=p_after->>'at' and key>p_after->>'key'
 order by at desc,key limit 21
 )
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(r) order by at desc,key) from (select * from page order by at desc,key limit 20) r),'[]'),
 'nextCursor',case when (select count(*) from page)>20 then (select jsonb_build_object('at',at,'key',key) from page order by at desc,key offset 19 limit 1) else null end);
$$;
revoke all on function public.pro_client_history_page(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.pro_client_history_page(uuid,text,jsonb) to service_role;

commit;
