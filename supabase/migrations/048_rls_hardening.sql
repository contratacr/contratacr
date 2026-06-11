-- 048_rls_hardening.sql
-- Follow-up RLS hardening from the security audit (complements 047_profiles).

-- ── 1. Legacy `support_messages` was WORLD-WRITABLE ─────────────────────────
-- Migration 012 created `support_messages` with
--   CREATE POLICY "Anyone can insert support messages" FOR INSERT WITH CHECK (true)
-- i.e. ANY visitor (even anonymous) could insert rows (name/email/message) — a
-- spam / storage-abuse vector. The table is LEGACY: the live support system uses
-- `support_tickets` + `support_ticket_messages` (migration 039/040) and nothing
-- in the app reads or writes `support_messages`. Drop the open INSERT policy so
-- the table is locked to the service-role only (RLS stays ON; the owner-scoped
-- SELECT policy remains, so no data is lost / exposed).
drop policy if exists "Anyone can insert support messages" on public.support_messages;

-- ── 2. Hide professionals' INTERNAL moderation columns from the public key ───
-- `professionals` is intentionally public-readable (cards/profiles), but it also
-- holds internal moderation notes: `banned_reason`, `verification_reason`,
-- `id_document_note`. None of the public queries select them, yet with a blanket
-- SELECT a holder of the (public) anon key could read them directly. Restrict the
-- ANON role to every column EXCEPT those three (computed from the catalog so we
-- can never miss/typo a column as the schema evolves). The `authenticated` role
-- keeps full SELECT — the OWNER dashboard reads its own record via select('*')
-- and only admins (service-role) ever surface these fields. This closes the
-- realistic attack (anonymous mass-scrape with the public key).
do $$
declare col_list text;
begin
  execute 'revoke select on public.professionals from anon';
  select string_agg(quote_ident(column_name), ', ')
    into col_list
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'professionals'
     and column_name not in ('banned_reason', 'verification_reason', 'id_document_note');
  execute format('grant select (%s) on public.professionals to anon', col_list);
end $$;

notify pgrst, 'reload schema';
