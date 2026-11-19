-- LOCAL PRO ONLY. Round 7C (2026-11-13): one file size limit for the private Pro files.
-- The six modules with private uploads (work files, daily log files, company files, task
-- discussion files, expense receipts, bid portal files) move from 3 MiB (2 MiB for normalized
-- JPEG) to the global cap of the local storage stack: 20 MiB (supabase/config.toml
-- file_size_limit = "20MiB", which this module does NOT change). Production target is 25 MB and
-- needs the storage global limit raised by the owner first. Each module's writer, fresh table check
-- and bucket were updated in place (its bucket insert now updates the limit on reapply); this module
-- migrates the existing table CHECK constraints (no rows touched: every stored size already fits)
-- and verifies tables + buckets. Delivery photos (pro_work_delivery_photos, 2 MiB) are not part of it.
begin;
do $$declare r record;tables regclass[]:=array['public.pro_work_files','public.pro_daily_log_files','public.pro_company_files','public.pro_team_task_files','public.pro_expense_receipts','public.pro_bid_portal_files']::regclass[];def text;
begin
 for r in select c.conrelid::regclass rel,c.conname,pg_get_constraintdef(c.oid) d from pg_constraint c where c.conrelid=any(tables) and c.contype='c' and pg_get_constraintdef(c.oid)~'\m(3145728|2097152)\M' loop
  def:=regexp_replace(r.d,'\m(3145728|2097152)\M','20971520','g');
  execute format('alter table %s drop constraint %I',r.rel,r.conname);
  execute format('alter table %s add constraint %I %s',r.rel,r.conname,def);
 end loop;
 if exists(select 1 from pg_constraint c where c.conrelid=any(tables) and pg_get_constraintdef(c.oid)~'\m(3145728|2097152)\M') then raise exception 'A Pro file table still limits files to 3 MiB';end if;
 if (select count(*) from pg_constraint c where c.conrelid=any(tables) and c.contype='c' and pg_get_constraintdef(c.oid)~'\m20971520\M')<6 then raise exception 'Pro file tables are missing the 20 MiB check';end if;
 if to_regclass('storage.buckets') is not null then
  update storage.buckets set file_size_limit=20971520 where id in('pro-work-files','pro-daily-log-files','pro-company-files','pro-team-task-files','pro-expense-receipts','pro-bid-portal-files') and file_size_limit is distinct from 20971520;
  if exists(select 1 from storage.buckets where id in('pro-work-files','pro-daily-log-files','pro-company-files','pro-team-task-files','pro-expense-receipts','pro-bid-portal-files') and (public or file_size_limit is distinct from 20971520)) then raise exception 'Pro file buckets are not private with 20 MiB';end if;
 end if;
end $$;
commit;
