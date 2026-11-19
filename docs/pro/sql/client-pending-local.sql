-- LOCAL PRO ONLY. Read-only projection; no records or statuses are modified.
begin;
create or replace function public.pro_client_pending_page(p_user uuid,p_client text,p_after jsonb default null) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare moment timestamptz:=statement_timestamp(); result jsonb;
begin
 if p_client is null or length(p_client) not between 1 and 160 then raise exception 'Invalid client' using errcode='22023'; end if;
 if p_after is not null then
  if jsonb_typeof(p_after)<>'object' or not(p_after ?& array['priority','at','key','asOf'])
    or jsonb_typeof(p_after->'priority')<>'number' or (p_after->>'priority') !~ '^[0-4]$'
    or jsonb_typeof(p_after->'at')<>'string' or length(p_after->>'at')>40
    or jsonb_typeof(p_after->'key')<>'string' or length(p_after->>'key') not between 1 and 180
    or jsonb_typeof(p_after->'asOf')<>'string' or length(p_after->>'asOf')>40 or pro_instant(p_after->>'asOf') is null
  then raise exception 'Invalid cursor' using errcode='22023'; end if;
  moment:=pro_instant(p_after->>'asOf');
 end if;
 if not exists(select 1 from pro_clients where user_id=p_user and id=p_client) then return null; end if;
 with candidates as (
  select w.id,'work:'||w.id as key,'work'::text as kind,w.service as title,
   case when pro_instant(w."end") is null or pro_instant(w."end")<=moment then 'review' else 'upcoming' end as reason,
   coalesce(to_char(pro_instant(w.start) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'') as at,false as legacy,
   case when pro_instant(w."end") is null or pro_instant(w."end")<=moment then 0 else 1 end as priority,null::integer as "sourceRevision",null::text as "requestStatus"
  from pro_work w where w.user_id=p_user and w."clientId"=p_client and not w.cancelled and w.stage<>'completed'
  union all
  select q.id::text,'standard:'||q.id::text,'quote',coalesce(q.title,''),
   case when q.status='accepted' then 'schedule' when q.status='draft' then 'prepare' when q.valid_until<(moment at time zone 'America/Costa_Rica')::date then 'expired' else 'response' end,
   to_char(q.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),false,
   case when q.status='accepted' then 2 when q.status='draft' or q.valid_until<(moment at time zone 'America/Costa_Rica')::date then 3 else 4 end,null::integer,null::text
  from pro_quote_links l join quotes q on q.id::text=l."quoteId"
   join professionals p on p.id=q.professional_id and p.profile_id=p_user
  where l.user_id=p_user and l."clientId"=p_client and q.deleted_at is null and q.status in ('draft','sent','accepted')
   and (q.status<>'accepted' or not exists(select 1 from pro_work w where w.user_id=p_user and w."externalQuoteId"=q.id::text and not w.cancelled))
  union all
  select q.id,'legacy:'||q.id,'quote',q.title,case q.status when 'accepted' then 'schedule' else 'prepare' end,'',true,case q.status when 'accepted' then 2 else 3 end,null::integer,null::text
  from pro_legacy_quotes q where q.user_id=p_user and q."clientId"=p_client and q.status in ('draft','accepted')
   and (q.status<>'accepted' or not exists(select 1 from pro_work w where w.user_id=p_user and w."quoteId"=q.id and not w.cancelled))
  union all
  select r.id::text,'request:'||r.id::text,'request',r.service,
   case when r.status='requested' then 'request' else 'confirmation' end,
   coalesce(to_char((case when r.status='proposed' then r.proposed_start else r.requested_start end) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),''),false,
   case when r.status='requested' then 0 else 4 end,r.revision,r.status
  from pro_appointment_requests r
  where r.owner_id=p_user and p_client='reservation-'||r.client_user_id::text
   and r.status in ('requested','proposed') and r.work_id is null
 ), page as (
  select * from candidates where p_after is null or (priority,at,key)>((p_after->>'priority')::integer,p_after->>'at',p_after->>'key') order by priority,at,key limit 7
 )
 select jsonb_build_object('asOf',moment,'fingerprint',(select md5(coalesce(jsonb_agg(to_jsonb(c) order by priority,at,key)::text,'[]')) from candidates c),
  'summary',(select jsonb_build_object('review',count(*) filter(where reason='review'),'upcoming',count(*) filter(where reason='upcoming'),'prepare',count(*) filter(where reason='prepare'),'response',count(*) filter(where reason='response'),'schedule',count(*) filter(where reason='schedule'),'request',count(*) filter(where reason='request'),'confirmation',count(*) filter(where reason='confirmation'),'expired',count(*) filter(where reason='expired')) from candidates),
  'items',coalesce((select jsonb_agg(to_jsonb(r) order by priority,at,key) from(select * from page order by priority,at,key limit 6) r),'[]'),
  'nextCursor',case when(select count(*) from page)>6 then(select jsonb_build_object('priority',priority,'at',at,'key',key,'asOf',moment) from page order by priority,at,key offset 5 limit 1) else null end) into result;
 return result;
end;$$;
revoke all on function public.pro_client_pending_page(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.pro_client_pending_page(uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
