-- Migration 186: split the bakery service into pastry and bread.
--
-- "Panaderías y reposterías" mixed two businesses a client picks between: the
-- neighbourhood bakery (bread, a shop with a counter) and whoever bakes a
-- birthday cake to order from home. Both professionals registered under it
-- make cakes, and both agreed to the change, so the EXISTING id keeps them and
-- becomes the pastry service; bread moves to a new id.
--
-- Renaming the id instead would have dropped those two out of every search
-- they already rank in, which is why `panaderias` (plural) now means PASTRY
-- and `panaderia` (singular) means BREAD. The ids look alike for historical
-- reasons, not semantic ones — see the comment in src/lib/data/categories.ts.
--
-- No professional row changes category: the two stay exactly where they are
-- and only their stored display-name snapshot is refreshed at the end.

UPDATE public.categories
SET
  name = 'Pastelería y repostería',
  name_en = 'Pastry & cakes',
  group_id = 'comercios',
  is_hidden = false,
  es_salud = false,
  supports_videoconsulta = false
WHERE id = 'panaderias';

INSERT INTO public.categories (
  id, name, name_en, group_id, is_hidden, es_salud, supports_videoconsulta
)
VALUES (
  'panaderia',
  'Panadería',
  'Bakery',
  'comercios',
  false,
  false,
  false
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  name_en = EXCLUDED.name_en,
  group_id = EXCLUDED.group_id,
  is_hidden = false,
  es_salud = false,
  supports_videoconsulta = false;

-- Refresh the services[].name snapshots so the two professionals show the new
-- label. Same re-runnable statement as migrations 107 and 183; ids untouched.
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
