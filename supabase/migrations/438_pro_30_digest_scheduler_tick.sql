-- Pro row 24 (2026-11-23): the digest scheduler tick. The Worker cron (every minute, already used for the push drain)
-- calls /api/internal/pro/digest-tick, which calls this function. For each person whose digest hour is the current
-- Costa Rica hour (daily, or weekly on the chosen ISO weekday) and who has unread notices, one SANDBOX outbox record
-- is written (nothing is sent: there is no authorised provider). Idempotent per person and period key, skipped inside
-- the person's quiet hours, bounded per call.
begin;

create or replace function public.pro_notification_digest_tick(p_now timestamptz default clock_timestamp()) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r record;local_ts timestamp:=p_now at time zone 'America/Costa_Rica';hr integer:=extract(hour from local_ts)::integer;wd integer:=extract(isodow from local_ts)::integer;
 mins integer:=hr*60+extract(minute from local_ts)::integer;key text:=to_char(local_ts,'YYYY-MM-DD"T"HH24');unread integer;lines text;qs integer;qe integer;quiet boolean;written integer:=0;skipped integer:=0;oid uuid;ins integer;
begin
 for r in select * from public.pro_notification_schedule s where s.digest_frequency<>'off' and s.digest_hour=hr and (s.digest_frequency='daily' or s.digest_weekday=wd) order by s.owner_id,s.person_id limit 500 loop
  quiet:=false;
  if r.quiet_enabled then
   qs:=split_part(r.quiet_start,':',1)::integer*60+split_part(r.quiet_start,':',2)::integer;qe:=split_part(r.quiet_end,':',1)::integer*60+split_part(r.quiet_end,':',2)::integer;
   quiet:=(r.quiet_weekends and wd>=6) or case when qs<qe then mins>=qs and mins<qe else mins>=qs or mins<qe end;
  end if;
  if quiet then skipped:=skipped+1;continue;end if;
  select count(*) into unread from public.pro_notifications where owner_id=r.owner_id and person_id=r.person_id and read_at is null;
  if unread=0 then continue;end if;
  select coalesce(string_agg('- '||left(title,120),E'\n' order by created_at desc),'') into lines from (select title,created_at from public.pro_notifications where owner_id=r.owner_id and person_id=r.person_id and read_at is null order by created_at desc,id desc limit 5) n;
  oid:=pro_ops_uuid('digest-tick:'||r.owner_id::text||':'||r.person_id::text||':'||key);
  insert into public.pro_notification_outbox(owner_id,person_id,id,channel,subject,body,unread_count) values(r.owner_id,r.person_id,oid,'email','ContrataCR: '||unread||' unread',left(lines,1200),unread) on conflict do nothing;
  get diagnostics ins=row_count;written:=written+ins;
  delete from public.pro_notification_outbox o where o.owner_id=r.owner_id and o.person_id=r.person_id and (o.owner_id,o.person_id,o.id) not in
   (select owner_id,person_id,id from public.pro_notification_outbox where owner_id=r.owner_id and person_id=r.person_id order by created_at desc,id desc limit 50);
 end loop;
 return jsonb_build_object('key',key,'written',written,'quietSkipped',skipped,'mode','sandbox');
end $$;

revoke all on function public.pro_notification_digest_tick(timestamptz) from public,anon,authenticated;
grant execute on function public.pro_notification_digest_tick(timestamptz) to service_role;
commit;
notify pgrst,'reload schema';
