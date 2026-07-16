-- Migration 104: move legacy dynamic groups into the new short segments.
-- Some admin-created groups used label-derived ids, so migration 103 did not
-- catch them by exact id. This keeps services intact and only changes group_id.

INSERT INTO public.category_groups (id, label, label_en, icon_key, sort_order, is_hidden)
VALUES
  ('comercios', 'Comercios', 'Shops', 'store', 75, false),
  ('agricultura', 'Agro', 'Agro', 'wheat', 120, false)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  label_en = EXCLUDED.label_en,
  icon_key = EXCLUDED.icon_key,
  sort_order = EXCLUDED.sort_order,
  is_hidden = false,
  updated_at = now();

UPDATE public.categories AS c
SET group_id = 'hogar'
FROM public.category_groups AS g
WHERE c.group_id = g.id
  AND (
    g.id IN ('hogar_y_muebles', 'jardin')
    OR g.label IN ('Hogar y muebles', 'Jardín y exterior', 'Jardin y exterior')
  );

UPDATE public.categories AS c
SET group_id = 'comercios'
FROM public.category_groups AS g
WHERE c.group_id = g.id
  AND (
    g.id IN ('restaurantes', 'restaurantes_comida')
    OR g.label IN ('Restaurantes y comida')
  );

UPDATE public.categories AS c
SET group_id = 'agricultura'
FROM public.category_groups AS g
WHERE c.group_id = g.id
  AND (
    g.id IN ('agro', 'agroindustria', 'agricultura_y_agroindustria')
    OR g.label IN ('Agricultura y agroindustria')
  );

UPDATE public.category_groups
SET is_hidden = true, updated_at = now()
WHERE id IN (
    'hogar_y_muebles',
    'jardin',
    'belleza',
    'moda_y_cuidado_personal',
    'seguridad',
    'restaurantes',
    'restaurantes_comida',
    'agro',
    'agroindustria',
    'agricultura_y_agroindustria',
    'otras',
    'otras_categorias'
  )
  OR label IN (
    'Hogar y muebles',
    'Jardín y exterior',
    'Jardin y exterior',
    'Belleza y estética',
    'Moda y cuidado personal',
    'Seguridad',
    'Restaurantes y comida',
    'Agricultura y agroindustria',
    'Otras categorías'
  );
