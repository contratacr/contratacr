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
  where schemaname = 'auth'
    -- Solo las tablas que este rol puede vaciar. `auth.schema_migrations` es de
    -- GoTrue y no le pertenece: incluirla abortaba el rollback entero con
    -- "permission denied" y test se quedaba sin datos.
    and pg_catalog.has_table_privilege(format('%I.%I', schemaname, tablename), 'TRUNCATE');

  if table_list is not null then
    -- CASCADE: auth.users está referenciada desde public (profiles), y un
    -- TRUNCATE sin cascada se niega aunque esas tablas ya estén vacías.
    execute 'truncate table ' || table_list || ' restart identity cascade';
  end if;
end $$;
