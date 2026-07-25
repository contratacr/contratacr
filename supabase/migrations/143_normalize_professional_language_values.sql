-- Normalize legacy free-text professional language values to stable IDs.
-- "Idiomas" remains a single service category; concrete languages belong in
-- professionals.languages so filters/profile details stay consistent.

WITH normalized AS (
  SELECT
    p.id,
    ARRAY(
      SELECT DISTINCT mapped.value
      FROM unnest(
        COALESCE(p.languages, '{}'::text[]) ||
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(p.services, '[]'::jsonb)) AS svc(value)
            WHERE lower(trim(COALESCE(svc.value->>'name', ''))) IN ('english program', 'english', 'ingles', 'inglés')
          )
          THEN ARRAY['en']::text[]
          ELSE ARRAY[]::text[]
        END
      ) AS raw(value)
      CROSS JOIN LATERAL (
        VALUES (
          CASE lower(trim(raw.value))
            WHEN 'english program' THEN 'en'
            WHEN 'english' THEN 'en'
            WHEN 'ingles' THEN 'en'
            WHEN 'inglés' THEN 'en'
            WHEN 'espanol' THEN 'es'
            WHEN 'español' THEN 'es'
            WHEN 'spanish' THEN 'es'
            ELSE trim(raw.value)
          END
        )
      ) AS mapped(value)
      WHERE mapped.value <> ''
      ORDER BY mapped.value
    ) AS languages
  FROM public.professionals p
)
UPDATE public.professionals p
SET languages = normalized.languages
FROM normalized
WHERE p.id = normalized.id
  AND COALESCE(p.languages, '{}'::text[]) IS DISTINCT FROM normalized.languages;
