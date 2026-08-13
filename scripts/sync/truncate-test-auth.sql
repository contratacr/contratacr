\set ON_ERROR_STOP on

-- Rollback restores a complete auth snapshot. Truncate every auth table in one
-- statement so foreign-key order is handled atomically before pg_restore runs.
do $$
declare
  table_list text;
begin
  select string_agg(format('%I.%I', schemaname, tablename), ', ' order by tablename)
    into table_list
  from pg_tables
  where schemaname = 'auth';

  if table_list is not null then
    execute 'truncate table ' || table_list || ' restart identity';
  end if;
end $$;
