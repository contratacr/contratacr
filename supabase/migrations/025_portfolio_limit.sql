-- Migration 025: enforce the 5-photo portfolio limit server-side (DB level),
-- complementing the client-side cap. Idempotent.

ALTER TABLE public.professionals DROP CONSTRAINT IF EXISTS professionals_portfolio_limit;
ALTER TABLE public.professionals ADD CONSTRAINT professionals_portfolio_limit
  CHECK (coalesce(array_length(portfolio_urls, 1), 0) <= 5);

NOTIFY pgrst, 'reload schema';
