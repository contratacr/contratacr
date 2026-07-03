-- Migration 092: refine broad legacy service labels.
--
-- The category/group labels stay unchanged:
-- - tecnologia group = Tecnologia
-- - belleza group = Belleza y estetica
--
-- Only the broad service labels change:
-- - tecnologia service -> TI
-- - belleza service -> Servicios de belleza
--
-- Stable IDs/categories remain unchanged and professionals.services[].name is the
-- only professional JSON field updated.

WITH canonical(id, name, name_en, group_id) AS (
  VALUES
    ('tecnologia', 'TI', 'IT', 'tecnologia'),
    ('belleza', U&'Servicios de belleza', 'Beauty services', 'belleza')
)
INSERT INTO public.categories (
  id, name, name_en, group_id, is_hidden, es_salud, supports_videoconsulta
)
SELECT
  id, name, name_en, group_id, false, false, false
FROM canonical
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  name_en = EXCLUDED.name_en,
  group_id = EXCLUDED.group_id,
  is_hidden = false,
  es_salud = false,
  supports_videoconsulta = false;

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
