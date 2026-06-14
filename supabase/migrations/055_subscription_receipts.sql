-- Migration 055: SINPE/transfer receipt review flow for subscription payments.
-- A professional submits a manual payment with a comprobante (receipt) image/PDF;
-- it lands as a 'pending' payment for an admin to review and approve/reject.
-- Adds the receipt URL + reviewer columns and a 'rejected' payment status.
-- Idempotent — run in the Supabase SQL Editor. (Requires migration 054 first.)

ALTER TABLE public.subscription_payments ADD COLUMN IF NOT EXISTS receipt_url  text;
ALTER TABLE public.subscription_payments ADD COLUMN IF NOT EXISTS reviewed_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.subscription_payments ADD COLUMN IF NOT EXISTS reviewed_at  timestamptz;

-- Allow 'rejected' alongside the existing statuses.
ALTER TABLE public.subscription_payments DROP CONSTRAINT IF EXISTS subscription_payments_status_check;
ALTER TABLE public.subscription_payments
  ADD CONSTRAINT subscription_payments_status_check
  CHECK (status IN ('paid','pending','failed','refunded','rejected'));

-- Pending review queue is admin-only (read via service-role); no extra RLS policy
-- needed — owner-read from 054 still lets a pro see their own pending payment.
CREATE INDEX IF NOT EXISTS sub_payments_pending_idx
  ON public.subscription_payments (status) WHERE status = 'pending';

NOTIFY pgrst, 'reload schema';
