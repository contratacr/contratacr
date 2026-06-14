-- Migration 054: professional subscription infrastructure (INACTIVE by default).
-- Builds the data model to charge professionals a subscription LATER without
-- activating anything now. No code path writes here until the PAYMENTS_ENABLED
-- feature flag is on; with the flag off the app is unchanged for everyone.
--
-- PRIVACY/SECURITY:
--   * We NEVER store card data. Card payments go through a payment gateway; we
--     only keep non-sensitive references (gateway ids, last4 is optional text).
--   * RLS: a professional can read ONLY their own subscription + payments. There
--     are NO INSERT/UPDATE/DELETE policies, so all writes happen via the
--     service-role server (admin APIs / gateway webhooks) which bypasses RLS.
--     Admin reads go through the service-role admin APIs too.
-- Idempotent — run in the Supabase SQL Editor.

-- ── Subscriptions: one row per professional (their current plan) ───────────────
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id    uuid NOT NULL UNIQUE REFERENCES public.professionals(id) ON DELETE CASCADE,
  plan               text NOT NULL DEFAULT 'free'   CHECK (plan IN ('free','premium')),
  status             text NOT NULL DEFAULT 'inactive'
                       CHECK (status IN ('active','inactive','expired','pending','cancelled')),
  billing_cycle      text CHECK (billing_cycle IN ('monthly','annual')),
  price_paid         integer,                       -- colones (₡), no decimals
  payment_method     text CHECK (payment_method IN ('card','sinpe','manual')),
  started_at         timestamptz,
  current_period_end timestamptz,                   -- renewal / expiry date
  cancel_at          timestamptz,
  -- Gateway references only — NEVER card data.
  gateway            text CHECK (gateway IN ('onvo','tilopay')),
  gateway_customer_id     text,
  gateway_subscription_id text,
  card_last4         text,                           -- optional, returned by gateway
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscriptions_professional_idx ON public.subscriptions (professional_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx       ON public.subscriptions (status);

-- ── Payment history: append-only ledger (card via gateway, or manual SINPE) ────
CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id    uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  professional_id    uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  amount             integer NOT NULL,              -- colones (₡)
  currency           text NOT NULL DEFAULT 'CRC',
  method             text NOT NULL CHECK (method IN ('card','sinpe','manual')),
  status             text NOT NULL DEFAULT 'paid'
                       CHECK (status IN ('paid','pending','failed','refunded')),
  billing_cycle      text CHECK (billing_cycle IN ('monthly','annual')),
  period_start       timestamptz,
  period_end         timestamptz,
  paid_at            timestamptz NOT NULL DEFAULT now(),
  -- Manual SINPE/transfer bookkeeping.
  reference          text,                           -- SINPE/transfer reference no.
  recorded_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL, -- admin
  note               text,
  -- Gateway references only — NEVER card data.
  gateway            text CHECK (gateway IN ('onvo','tilopay')),
  gateway_payment_id text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sub_payments_professional_idx ON public.subscription_payments (professional_id);
CREATE INDEX IF NOT EXISTS sub_payments_subscription_idx ON public.subscription_payments (subscription_id);

-- ── RLS: owner-read only; all writes via service-role (admin APIs / webhooks) ──
ALTER TABLE public.subscriptions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions_owner_read" ON public.subscriptions;
CREATE POLICY "subscriptions_owner_read" ON public.subscriptions
  FOR SELECT USING (
    auth.uid() = (SELECT profile_id FROM public.professionals WHERE id = subscriptions.professional_id)
  );

DROP POLICY IF EXISTS "sub_payments_owner_read" ON public.subscription_payments;
CREATE POLICY "sub_payments_owner_read" ON public.subscription_payments
  FOR SELECT USING (
    auth.uid() = (SELECT profile_id FROM public.professionals WHERE id = subscription_payments.professional_id)
  );
-- No INSERT/UPDATE/DELETE policies on purpose → only the service-role can write.

NOTIFY pgrst, 'reload schema';
