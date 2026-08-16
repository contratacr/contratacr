-- Account deletion performs a deliberately exhaustive privacy cleanup across
-- historical JSON/audit rows. Production accounts can exceed PostgREST's
-- default per-statement timeout even though the operation is bounded to one
-- confirmed deletion request. Give this service-role-only RPC enough time to
-- finish atomically; callers still receive an error and the transaction rolls
-- back if it cannot complete.
alter function public.finalize_account_deletion(uuid)
  set statement_timeout = '120s';
