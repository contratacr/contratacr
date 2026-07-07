-- Migration 101: extend user action audit triggers to additional operational tables.
-- Keep 100 immutable after it has been applied; add new coverage here.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'notifications',
    'notification_deliveries',
    'saved_professionals',
    'support_messages',
    'insurers',
    'provider_appeals',
    'provider_verification_log',
    'beneficiary_dob',
    'subscriptions',
    'subscription_payments'
  ]
  loop
    if to_regclass('public.' || quote_ident(table_name)) is null then
      continue;
    end if;
    execute format('drop trigger if exists audit_%I_row_change on public.%I', table_name, table_name);
    execute format(
      'create trigger audit_%I_row_change after insert or update or delete on public.%I for each row execute function public.audit_user_row_change()',
      table_name,
      table_name
    );
  end loop;
end $$;

notify pgrst, 'reload schema';
