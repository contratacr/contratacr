-- Migration 090: keep service display names aligned with the catalog.
--
-- Safe rules:
-- - Stable service IDs/categories remain unchanged.
-- - Only updates the display field services[].name.
-- - Preserves description, priceAmount, priceType, years, active, modalities, and
--   every other service JSON property.

UPDATE public.categories
SET name = U&'Enfermer\00EDa',
    name_en = 'Nursing'
WHERE id = 'enfermeria';

WITH rewritten AS (
  SELECT
    p.id,
    jsonb_agg(
      CASE
        WHEN svc.value ? 'category'
          AND cat.name IS NOT NULL
          AND COALESCE(svc.value->>'name', '') <> cat.name
          THEN jsonb_set(svc.value, '{name}', to_jsonb(cat.name), true)
        ELSE svc.value
      END
      ORDER BY svc.ordinality
    ) AS services
  FROM public.professionals p
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.services, '[]'::jsonb)) WITH ORDINALITY AS svc(value, ordinality)
  LEFT JOIN public.categories cat ON cat.id = svc.value->>'category'
  WHERE jsonb_typeof(COALESCE(p.services, '[]'::jsonb)) = 'array'
  GROUP BY p.id
)
UPDATE public.professionals p
SET services = rewritten.services
FROM rewritten
WHERE p.id = rewritten.id
  AND p.services IS DISTINCT FROM rewritten.services;

NOTIFY pgrst, 'reload schema';
