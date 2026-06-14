-- Migration 056: optional social-media links for professionals.
-- REQUIRED for the social-links feature to persist (without this column the save
-- silently no-ops). Stores ONLY usernames (no URLs, no storage cost) as a small
-- JSON object, e.g. { "instagram": "juanperez", "facebook": "juan.perez",
-- "tiktok": "juanperez" }; the app builds the URL from the username. Shown on the
-- public profile (additive to "casos de éxito" photos). Idempotent — run in the
-- Supabase SQL Editor; the NOTIFY reloads PostgREST's schema cache.

ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS social_links jsonb;

NOTIFY pgrst, 'reload schema';
