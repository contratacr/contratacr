-- Migration 089: backfill public services for professionals created under the
-- older category/professions model.
--
-- Safe rules:
-- - Only touches rows where professionals.services is NULL or [].
-- - Does not overwrite descriptions, prices, years, active flags, or manually
--   added services.
-- - Uses the already selected professions/category_id as the source.

WITH candidates AS (
  SELECT
    p.id AS professional_id,
    CASE
      WHEN COALESCE(array_length(p.professions, 1), 0) > 0 THEN p.professions
      WHEN p.category_id IS NOT NULL THEN ARRAY[p.category_id]
      ELSE ARRAY[]::text[]
    END AS raw_service_ids
  FROM public.professionals p
  WHERE (p.services IS NULL OR p.services = '[]'::jsonb)
    AND (
      p.category_id IS NOT NULL
      OR COALESCE(array_length(p.professions, 1), 0) > 0
    )
),
service_ids AS (
  SELECT
    c.professional_id,
    service_id,
    MIN(ord) AS ord
  FROM candidates c
  CROSS JOIN LATERAL unnest(c.raw_service_ids) WITH ORDINALITY AS sid(service_id, ord)
  WHERE service_id IS NOT NULL
    AND btrim(service_id) <> ''
  GROUP BY c.professional_id, service_id
),
built_services AS (
  SELECT
    s.professional_id,
    jsonb_agg(
      jsonb_build_object(
        'id', 'svc_backfill_' || replace(s.professional_id::text, '-', '') || '_' || s.ord::text,
        'name', COALESCE(cat.name, initcap(replace(s.service_id, '_', ' '))),
        'category', s.service_id,
        'active', true,
        'priceType', 'a_convenir',
        'price', 'Consultar precio'
      )
      ORDER BY s.ord
    ) AS services
  FROM service_ids s
  LEFT JOIN public.categories cat ON cat.id = s.service_id
  GROUP BY s.professional_id
)
UPDATE public.professionals p
SET services = b.services
FROM built_services b
WHERE p.id = b.professional_id
  AND (p.services IS NULL OR p.services = '[]'::jsonb)
  AND jsonb_typeof(b.services) = 'array'
  AND jsonb_array_length(b.services) > 0;

NOTIFY pgrst, 'reload schema';
