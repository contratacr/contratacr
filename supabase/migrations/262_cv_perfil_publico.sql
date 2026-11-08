-- Only owner-confirmed public fields. Source CV files/text are never uploaded.
-- Existing professionals RLS/ownership policies remain unchanged.
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS cv_profile jsonb
  NOT NULL DEFAULT '{"education":[],"experience":[],"skills":[]}'::jsonb;

CREATE OR REPLACE FUNCTION public.valid_cv_profile(value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE section text; entry jsonb; field text;
BEGIN
  IF jsonb_typeof(value) <> 'object' OR octet_length(value::text) > 65000
    OR NOT value ?& ARRAY['education','experience','skills']
    OR (value - ARRAY['education','experience','skills']) <> '{}'::jsonb THEN RETURN false; END IF;
  FOREACH section IN ARRAY ARRAY['education','experience'] LOOP
    IF jsonb_typeof(value->section) <> 'array' THEN RETURN false; END IF;
    IF jsonb_array_length(value->section) > 20 THEN RETURN false; END IF;
    FOR entry IN SELECT jsonb_array_elements(value->section) LOOP
      IF jsonb_typeof(entry) <> 'object' OR NOT entry ?& ARRAY['title','organization','period','description']
        OR (entry - ARRAY['title','organization','period','description']) <> '{}'::jsonb THEN RETURN false; END IF;
      FOREACH field IN ARRAY ARRAY['title','organization','period','description'] LOOP
        IF jsonb_typeof(entry->field) <> 'string' OR length(entry->>field) > (CASE field WHEN 'description' THEN 1000 WHEN 'period' THEN 80 ELSE 160 END) THEN RETURN false; END IF;
      END LOOP;
      IF btrim(entry->>'title') = '' THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  IF jsonb_typeof(value->'skills') <> 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(value->'skills') > 40 THEN RETURN false; END IF;
  FOR entry IN SELECT jsonb_array_elements(value->'skills') LOOP
    IF jsonb_typeof(entry) <> 'string' OR length(entry #>> '{}') NOT BETWEEN 1 AND 80 THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;
ALTER TABLE public.professionals DROP CONSTRAINT IF EXISTS professionals_cv_profile_valid;
ALTER TABLE public.professionals ADD CONSTRAINT professionals_cv_profile_valid CHECK (public.valid_cv_profile(cv_profile));
COMMENT ON COLUMN public.professionals.cv_profile IS 'Public education, work experience and skills explicitly reviewed and saved by the owner. Never source CV files, raw text or contact details.';
NOTIFY pgrst, 'reload schema';
