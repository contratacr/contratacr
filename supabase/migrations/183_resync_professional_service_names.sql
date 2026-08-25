-- Migration 183: re-sync saved professional service names with the catalog.
--
-- Professionals store the stable id in services[].category plus a display-name
-- snapshot in services[].name. Migration 107 refreshed those snapshots once,
-- but renames done since then (accent repairs, "Nutrición y dietética" →
-- "Nutrición", "Servicio de gas" → "Cilindro de gas", …) left 30 rows across
-- 19 professionals with the old text. Every screen resolves the label from the
-- id, so this only showed in the share-preview image — but the snapshot should
-- never drift from what the admin panel says.
--
-- Same statement as 107, re-runnable: only the `name` snapshot changes, the id
-- is never touched, and rows already in sync are skipped.

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
