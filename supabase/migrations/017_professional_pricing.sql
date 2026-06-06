-- Migration 017: Professional pricing tiers
-- Stores one or more pricing tiers per professional. Each tier:
--   { id, type, amount?, label? }
-- where type ∈ por_hora | por_consulta | por_proyecto | por_dia | paquete | a_convenir
-- Legacy `hourly_rate` is kept as a fallback. Idempotent.

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS pricing jsonb NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
