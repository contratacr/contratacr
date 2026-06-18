-- Migration 062: drop the unused `categories.icon` column.
-- The emoji icon was seeded (migrations 013/051/052) but is displayed NOWHERE in
-- the app — every category surface (search, /buscar cards, categories page,
-- filters, profession/category pickers, admin Categorías) is text-only. The only
-- code that read it (api/projects select, admin-approve upsert, client-activity +
-- proposals-tab types/render) has been updated to stop referencing it, so this is
-- a clean, zero-visual-impact removal. Idempotent — run in the Supabase SQL editor
-- (or drop the column from the dashboard; this keeps a fresh DB in sync).

ALTER TABLE public.categories DROP COLUMN IF EXISTS icon;

NOTIFY pgrst, 'reload schema';
