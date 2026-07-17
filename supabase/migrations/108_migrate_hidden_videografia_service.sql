-- Migration 108: move professionals from hidden `videografia` to active `produccion_video`.
-- Keeps professional service details intact and only changes the stable category id
-- plus the display name snapshot.

WITH target AS (
  SELECT
    'produccion_video'::text AS id,
    COALESCE((SELECT name FROM public.categories WHERE id = 'produccion_video'), 'Producción de video') AS name
)
UPDATE public.professionals p
SET
  category_id = CASE WHEN p.category_id = 'videografia' THEN target.id ELSE p.category_id END,
  professions = CASE
    WHEN p.professions IS NULL THEN p.professions
    ELSE (
      SELECT ARRAY(
        SELECT deduped.id
        FROM (
          SELECT mapped.id, MIN(mapped.ord) AS first_ord
          FROM unnest(p.professions) WITH ORDINALITY AS prof(id, ord)
          CROSS JOIN LATERAL (
            SELECT CASE WHEN prof.id = 'videografia' THEN target.id ELSE prof.id END AS id,
                   prof.ord
          ) AS mapped
          WHERE mapped.id IS NOT NULL AND btrim(mapped.id) <> ''
          GROUP BY mapped.id
        ) AS deduped
        ORDER BY deduped.first_ord
      )
    )
  END,
  services = CASE
    WHEN jsonb_typeof(COALESCE(p.services, '[]'::jsonb)) <> 'array' THEN p.services
    ELSE (
      SELECT jsonb_agg(
        CASE
          WHEN svc.value->>'category' = 'videografia'
            THEN jsonb_set(
              jsonb_set(svc.value, '{category}', to_jsonb(target.id), true),
              '{name}',
              to_jsonb(target.name),
              true
            )
          ELSE svc.value
        END
        ORDER BY svc.ordinality
      )
      FROM jsonb_array_elements(COALESCE(p.services, '[]'::jsonb)) WITH ORDINALITY AS svc(value, ordinality)
    )
  END
FROM target
WHERE p.category_id = 'videografia'
   OR p.professions @> ARRAY['videografia']::text[]
   OR p.services @> '[{"category":"videografia"}]'::jsonb;

UPDATE public.availability_slots
SET category_id = 'produccion_video'
WHERE category_id = 'videografia';

UPDATE public.availability_weekly
SET category_id = 'produccion_video'
WHERE category_id = 'videografia';

UPDATE public.availability_exceptions
SET category_id = 'produccion_video'
WHERE category_id = 'videografia';

NOTIFY pgrst, 'reload schema';
