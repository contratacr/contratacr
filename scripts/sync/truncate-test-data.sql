\set ON_ERROR_STOP on

do $$
declare
  table_list text;
begin
  select string_agg(format('%I.%I', schemaname, tablename), ', ' order by tablename)
    into table_list
  from pg_tables
  where schemaname = 'public'
    and tablename not in ('padron', 'padron_staging');

  if table_list is not null then
    execute 'truncate table ' || table_list || ' restart identity cascade';
  end if;
end $$;
