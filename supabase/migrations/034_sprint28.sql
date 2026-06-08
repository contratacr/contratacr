-- Migration 034 (sprint 28): category suggestion tickets, phone-call opt-in,
-- editable reviews, account close/disable with reason. Idempotent.

-- ── Category suggestion tickets ("¿No ves tu categoría?") ─────────────────────
-- Same model as `insurers`: a pending row is a tracked admin ticket; approved=true
-- ⇒ official/usable. NOT usable until an admin approves.
CREATE TABLE IF NOT EXISTS public.category_suggestions (
  id text PRIMARY KEY,
  label text NOT NULL,
  suggested_name text,
  approved boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',          -- 'pending' | 'approved' | 'rejected'
  suggested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
ALTER TABLE public.category_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS category_suggestions_read_approved ON public.category_suggestions;
CREATE POLICY category_suggestions_read_approved ON public.category_suggestions FOR SELECT USING (approved = true);
DROP POLICY IF EXISTS category_suggestions_suggest ON public.category_suggestions;
CREATE POLICY category_suggestions_suggest ON public.category_suggestions FOR INSERT WITH CHECK (auth.uid() = suggested_by);

-- ── Phone-call contact opt-in (item 6) ────────────────────────────────────────
-- "Contáctanos por llamada" is OFF by default; the pro enables it in Disponibilidad.
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS allow_phone_call boolean NOT NULL DEFAULT false;

-- ── Editable reviews (item 13) ────────────────────────────────────────────────
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- ── Account close / disable with reason (item 17) ─────────────────────────────
-- Soft-disable: hidden from search, reactivatable; reason surfaced to admin.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_disabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS disabled_reason text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS disabled_at timestamptz;

NOTIFY pgrst, 'reload schema';
