-- Remove the accidental physical workplace added to Isaac's ContrataCR profile.
-- This is intentionally scoped to one production account and one synthetic address.
-- It does not touch services, pricing, bio, availability, reviews, or videoconsulta.

WITH target AS (
  SELECT p.id, p.workplaces
  FROM public.professionals p
  JOIN public.profiles pr ON pr.id = p.profile_id
  WHERE lower(pr.email) = 'isaacsanchezmonge@gmail.com'
    AND lower(coalesce(p.business_name, '')) = 'contratacr'
),
filtered AS (
  SELECT
    t.id,
    coalesce(
      jsonb_agg(item.value ORDER BY item.ordinality)
        FILTER (
          WHERE NOT (
            lower(coalesce(item.value->>'name', '')) = 'contratacr'
            AND lower(coalesce(item.value->>'address', '')) LIKE '%atenas%'
            AND lower(coalesce(item.value->>'address', '')) LIKE '%alajuela%'
          )
        ),
      '[]'::jsonb
    ) AS next_workplaces
  FROM target t
  LEFT JOIN LATERAL jsonb_array_elements(t.workplaces) WITH ORDINALITY AS item(value, ordinality) ON true
  GROUP BY t.id
)
UPDATE public.professionals p
SET
  workplaces = f.next_workplaces,
  search_provincias = (
    SELECT coalesce(array_agg(DISTINCT provincia_id), ARRAY[]::text[])
    FROM (
      SELECT nullif(w.value->>'provinciaId', '') AS provincia_id
      FROM jsonb_array_elements(f.next_workplaces) AS w(value)
      UNION
      SELECT nullif(area.value->>'provinciaId', '') AS provincia_id
      FROM jsonb_array_elements(coalesce(p.coverage_areas, '[]'::jsonb)) AS area(value)
      WHERE coalesce(area.value->>'level', CASE WHEN area.value ? 'cantonId' THEN 'canton' ELSE 'provincia' END) <> 'country'
      UNION
      SELECT unnest(coalesce(p.coverage_provincias, ARRAY[]::text[])) AS provincia_id
    ) s
    WHERE provincia_id IS NOT NULL
  ),
  search_cantones = (
    SELECT coalesce(array_agg(DISTINCT canton_id), ARRAY[]::text[])
    FROM (
      SELECT nullif(w.value->>'cantonId', '') AS canton_id
      FROM jsonb_array_elements(f.next_workplaces) AS w(value)
      UNION
      SELECT nullif(area.value->>'cantonId', '') AS canton_id
      FROM jsonb_array_elements(coalesce(p.coverage_areas, '[]'::jsonb)) AS area(value)
      WHERE coalesce(area.value->>'level', CASE WHEN area.value ? 'cantonId' THEN 'canton' ELSE 'provincia' END) = 'canton'
    ) s
    WHERE canton_id IS NOT NULL
  ),
  lat = CASE WHEN jsonb_array_length(f.next_workplaces) = 0 THEN NULL ELSE p.lat END,
  lng = CASE WHEN jsonb_array_length(f.next_workplaces) = 0 THEN NULL ELSE p.lng END
FROM filtered f
WHERE p.id = f.id
  AND p.workplaces IS DISTINCT FROM f.next_workplaces;
