-- Migration 093: canonicalize the legacy design/art service.
--
-- Safe rules:
-- - Keeps the stable service id `diseno`.
-- - Makes the label consistent across server-rendered cards, profile pages,
--   /servicios and the services dropdown.
-- - Only rewrites professionals.services[].name for services whose category is
--   `diseno`; price, description, years, active state and modalities remain intact.

INSERT INTO public.categories (
  id, name, name_en, group_id, is_hidden, es_salud, supports_videoconsulta
)
VALUES (
  'diseno',
  U&'Dise\00F1o y arte',
  'Design and art',
  'profesional',
  false,
  false,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  name_en = EXCLUDED.name_en,
  group_id = EXCLUDED.group_id,
  is_hidden = false,
  es_salud = false,
  supports_videoconsulta = true;

WITH rewritten AS (
  SELECT
    p.id,
    jsonb_agg(
      CASE
        WHEN svc.value->>'category' = 'diseno'
          THEN jsonb_set(svc.value, '{name}', to_jsonb(U&'Dise\00F1o y arte'::text), true)
        ELSE svc.value
      END
      ORDER BY svc.ordinality
    ) AS services
  FROM public.professionals p
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.services, '[]'::jsonb)) WITH ORDINALITY AS svc(value, ordinality)
  WHERE jsonb_typeof(COALESCE(p.services, '[]'::jsonb)) = 'array'
  GROUP BY p.id
)
UPDATE public.professionals p
SET services = rewritten.services
FROM rewritten
WHERE p.id = rewritten.id
  AND p.services IS DISTINCT FROM rewritten.services;

NOTIFY pgrst, 'reload schema';
