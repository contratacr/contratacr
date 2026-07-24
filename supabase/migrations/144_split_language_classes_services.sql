-- Replace the overly broad "Idiomas" service with concrete language class
-- services. Keep the existing `idiomas` ID as English lessons for backwards
-- compatibility with existing profiles, URLs and saved filters.

UPDATE public.categories
SET
  name = 'Clases de inglés',
  name_en = 'English lessons',
  group_id = 'educacion',
  is_hidden = false,
  supports_videoconsulta = true
WHERE id = 'idiomas';

INSERT INTO public.categories (id, name, name_en, group_id, is_hidden, es_salud, supports_videoconsulta)
VALUES
  ('clases_frances', 'Clases de francés', 'French lessons', 'educacion', false, false, true),
  ('clases_portugues', 'Clases de portugués', 'Portuguese lessons', 'educacion', false, false, true),
  ('clases_mandarin', 'Clases de mandarín', 'Mandarin lessons', 'educacion', false, false, true),
  ('clases_japones', 'Clases de japonés', 'Japanese lessons', 'educacion', false, false, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  name_en = EXCLUDED.name_en,
  group_id = EXCLUDED.group_id,
  is_hidden = EXCLUDED.is_hidden,
  es_salud = EXCLUDED.es_salud,
  supports_videoconsulta = EXCLUDED.supports_videoconsulta;

WITH rewritten AS (
  SELECT
    p.id,
    jsonb_agg(
      CASE
        WHEN svc.value->>'category' = 'idiomas'
          OR lower(trim(COALESCE(svc.value->>'name', ''))) IN ('idiomas', 'english program', 'english', 'ingles', 'inglés')
        THEN jsonb_set(
          jsonb_set(svc.value, '{category}', to_jsonb('idiomas'::text), true),
          '{name}',
          to_jsonb('Clases de inglés'::text),
          true
        )
        ELSE svc.value
      END
      ORDER BY svc.ordinality
    ) AS services
  FROM public.professionals p
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.services, '[]'::jsonb)) WITH ORDINALITY AS svc(value, ordinality)
  GROUP BY p.id
)
UPDATE public.professionals p
SET services = rewritten.services
FROM rewritten
WHERE p.id = rewritten.id
  AND COALESCE(p.services, '[]'::jsonb) IS DISTINCT FROM rewritten.services;

UPDATE public.professionals
SET languages = (
  SELECT ARRAY(
    SELECT DISTINCT value
    FROM unnest(COALESCE(languages, '{}'::text[]) || ARRAY['en']::text[]) AS t(value)
    ORDER BY value
  )
)
WHERE category_id = 'idiomas'
   OR EXISTS (
     SELECT 1
     FROM jsonb_array_elements(COALESCE(services, '[]'::jsonb)) AS svc(value)
     WHERE svc.value->>'category' = 'idiomas'
        OR lower(trim(COALESCE(svc.value->>'name', ''))) IN ('clases de inglés', 'english program', 'english', 'ingles', 'inglés')
   );
