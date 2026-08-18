-- 173_remove_supabase_padron_after_d1_cutover.sql
-- D1 cutover cleanup.
--
-- The padrón source of truth now lives in Cloudflare D1. Production and test
-- were verified through /api/cedula returning source = cloudflare_d1_padron.
--
-- Goal: remove the heavy Supabase copy so the project can fit the Free quota.
-- This intentionally leaves auth/app/business tables untouched.

begin;

drop function if exists public.padron_lookup(text);

drop table if exists public.padron_staging;
drop table if exists public.padron;

commit;
