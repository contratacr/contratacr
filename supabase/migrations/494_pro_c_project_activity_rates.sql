-- Pro area C: project "Activities and Rates". The per-project override lives in pro_work_extras (kind 'activity', key = activity id; migration 465).
-- This trigger applies it when a time entry of that project is created: the billable rate (rate_cents), the billable flag (can only be switched off)
-- and, for timers (whose cost line is written at stop time from the entry), the cost rate. Manual entries keep the company cost because their
-- job-cost line is written before the entry row exists. Entries without an override are untouched.
begin;
create or replace function public.pro_time_entry_project_rates() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare ov jsonb;
begin
 if new.activity_id is null then return new;end if;
 select x.data into ov from public.pro_work_extras x where x.owner_id=new.owner_id and x.work_id=new.work_id and x.kind='activity' and x.key=new.activity_id::text;
 if ov is null then return new;end if;
 if jsonb_typeof(ov->'rateCents')='number' then new.rate_cents:=(ov->>'rateCents')::bigint;end if;
 if new.source='timer' and jsonb_typeof(ov->'costCents')='number' then new.cost_cents:=(ov->>'costCents')::bigint;end if;
 if ov->>'billable'='false' then new.billable:=false;end if;
 return new;
end $$;
drop trigger if exists pro_time_entries_project_rates on public.pro_time_entries;
create trigger pro_time_entries_project_rates before insert on public.pro_time_entries for each row execute function public.pro_time_entry_project_rates();
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='pro_time_entry_project_rates' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
