-- Split the broad upholstery service into furniture and automotive services.
-- Keep the existing `tapiceria` ID for furniture upholstery so existing
-- professional profiles and saved filters keep working with a clearer label.

UPDATE public.categories
SET
  name = 'Tapicería de muebles',
  name_en = 'Furniture upholstery',
  group_id = 'hogar',
  is_hidden = false,
  es_salud = false,
  supports_videoconsulta = false
WHERE id = 'tapiceria';

INSERT INTO public.categories (id, name, name_en, group_id, is_hidden, es_salud, supports_videoconsulta)
VALUES
  ('tapiceria_automotriz', 'Tapicería automotriz', 'Automotive upholstery', 'automotriz', false, false, false)
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
        WHEN svc.value->>'category' = 'tapiceria'
          OR lower(trim(COALESCE(svc.value->>'name', ''))) IN ('tapicería', 'tapiceria')
        THEN jsonb_set(
          jsonb_set(svc.value, '{category}', to_jsonb('tapiceria'::text), true),
          '{name}',
          to_jsonb('Tapicería de muebles'::text),
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

-- Carlos/Mvebles suggested automotive upholstery and already has furniture
-- upholstery services. Add the automotive service to his profile if present.
WITH target AS (
  SELECT p.id
  FROM public.professionals p
  JOIN public.profiles pr ON pr.id = p.profile_id
  WHERE lower(COALESCE(pr.email, '')) = 'porrasemilia@gmail.com'
     OR lower(COALESCE(p.business_name, '')) = 'mvebles barrantes porras'
     OR lower(COALESCE(pr.full_name, '')) = 'carlos barrantes chavarria'
),
to_update AS (
  SELECT
    p.id,
    COALESCE(p.services, '[]'::jsonb) ||
      jsonb_build_array(
        jsonb_build_object(
          'id', 'svc_tapiceria_automotriz',
          'name', 'Tapicería automotriz',
          'category', 'tapiceria_automotriz',
          'active', true,
          'priceType', 'a_convenir',
          'price', 'Consultar precio'
        )
      ) AS services,
    CASE
      WHEN COALESCE(p.professions, '{}'::text[]) @> ARRAY['tapiceria_automotriz']::text[] THEN p.professions
      ELSE COALESCE(p.professions, '{}'::text[]) || ARRAY['tapiceria_automotriz']::text[]
    END AS professions
  FROM public.professionals p
  JOIN target t ON t.id = p.id
  WHERE NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p.services, '[]'::jsonb)) AS svc(value)
    WHERE svc.value->>'category' = 'tapiceria_automotriz'
  )
)
UPDATE public.professionals p
SET
  services = to_update.services,
  professions = to_update.professions
FROM to_update
WHERE p.id = to_update.id;
