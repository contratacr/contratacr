-- Migration 109: remove slashes from visible service labels.
-- Keeps stable ids unchanged and syncs professional service name snapshots.

WITH canonical(id, name, name_en) AS (
  VALUES
    ('gypsum', 'Gypsum y drywall', 'Gypsum and drywall'),
    ('domotica', U&'Dom\00F3tica y smart home', 'Smart home automation'),
    ('cuidado_infantil', U&'Cuidado infantil y ni\00F1era', 'Childcare and nanny'),
    ('peluqueria_canina', U&'Peluquer\00EDa canina y grooming', 'Dog grooming'),
    ('unhas', U&'U\00F1as y manicure', 'Nails and manicure')
)
UPDATE public.categories c
SET
  name = canonical.name,
  name_en = canonical.name_en
FROM canonical
WHERE c.id = canonical.id;

WITH canonical(id, name) AS (
  VALUES
    ('gypsum', 'Gypsum y drywall'),
    ('domotica', U&'Dom\00F3tica y smart home'),
    ('cuidado_infantil', U&'Cuidado infantil y ni\00F1era'),
    ('peluqueria_canina', U&'Peluquer\00EDa canina y grooming'),
    ('unhas', U&'U\00F1as y manicure')
),
rewritten AS (
  SELECT
    p.id,
    jsonb_agg(
      CASE
        WHEN svc.value ? 'category'
          AND canonical.name IS NOT NULL
          AND COALESCE(svc.value->>'name', '') <> canonical.name
          THEN jsonb_set(svc.value, '{name}', to_jsonb(canonical.name), true)
        ELSE svc.value
      END
      ORDER BY svc.ordinality
    ) AS services
  FROM public.professionals p
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.services, '[]'::jsonb)) WITH ORDINALITY AS svc(value, ordinality)
  LEFT JOIN canonical ON canonical.id = svc.value->>'category'
  WHERE jsonb_typeof(COALESCE(p.services, '[]'::jsonb)) = 'array'
  GROUP BY p.id
)
UPDATE public.professionals p
SET services = rewritten.services
FROM rewritten
WHERE p.id = rewritten.id
  AND p.services IS DISTINCT FROM rewritten.services;

NOTIFY pgrst, 'reload schema';
