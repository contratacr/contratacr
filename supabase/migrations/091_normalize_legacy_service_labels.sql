-- Migration 091: normalize legacy service display labels.
--
-- Safe rules:
-- - Stable service IDs/categories remain unchanged.
-- - Only updates catalog display labels and professionals.services[].name.
-- - Preserves description, priceAmount, priceType, years, active, modalities, and
--   every other service JSON property.

WITH canonical(id, name, name_en, group_id) AS (
  VALUES
    ('belleza', U&'Belleza y est\00E9tica', 'Beauty & aesthetics', 'belleza'),
    ('musica', U&'Clases de m\00FAsica', 'Music lessons', 'educacion'),
    ('tecnologia', U&'Tecnolog\00EDa / TI', 'Technology / IT', 'tecnologia'),
    ('camaras_seguridad', U&'C\00E1maras de seguridad', 'Security cameras', 'tecnologia'),
    ('mecanica', U&'Mec\00E1nica automotriz', 'Auto mechanics', 'automotriz'),
    ('consultoria', U&'Consultor\00EDa empresarial', 'Business consulting', 'profesional'),
    ('legal', U&'Abogados y servicios legales', 'Lawyers & legal services', 'profesional')
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
