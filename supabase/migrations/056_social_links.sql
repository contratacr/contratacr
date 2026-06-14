-- Migration 056: optional social-media links for professionals.
-- Stores ONLY URLs (no storage cost) as a small JSON object, e.g.
--   { "instagram": "https://instagram.com/...", "facebook": "...",
--     "tiktok": "https://tiktok.com/@...", "website": "https://..." }
-- Shown on the public profile (alongside "casos de éxito" photos — additive, not a
-- replacement). Optional; only the links the pro fills in are stored/shown.
-- Idempotent — run in the Supabase SQL Editor.

ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS social_links jsonb;

NOTIFY pgrst, 'reload schema';
