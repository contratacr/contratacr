-- Pro row 17 follow-up: deleting an account must still cascade through the module permission history.
-- Migration 404 attached pro_team_append_only() to BEFORE UPDATE OR DELETE, so removing a profile (profiles -> history ON DELETE CASCADE)
-- raised "Team comments, events and receipts are append-only" and the account could not be deleted. Direct updates and deletes stay
-- refused (trigger depth 1); only a delete fired by a foreign-key cascade (depth >= 2) passes, like the other Pro append-only tables.
begin;

create or replace function public.pro_module_permission_history_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' and pg_trigger_depth()>=2 then return old;end if;
 raise exception 'Team comments, events and receipts are append-only' using errcode='23514';
end $$;

drop trigger if exists pro_module_permission_history_immutable on public.pro_company_module_permission_history;
create trigger pro_module_permission_history_immutable before update or delete on public.pro_company_module_permission_history
 for each row execute function public.pro_module_permission_history_guard();

revoke all on function public.pro_module_permission_history_guard() from public,anon,authenticated;
grant execute on function public.pro_module_permission_history_guard() to service_role;

commit;
