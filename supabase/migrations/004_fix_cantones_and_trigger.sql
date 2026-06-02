-- Migration 004: Fix missing cantones + simplify trigger
-- Run in Supabase SQL Editor

-- ============================================================
-- 1. Seed all missing cantones (that exist in cr-geography.ts
--    but were absent from migration 001)
-- ============================================================
INSERT INTO public.cantones (id, name, provincia_id) VALUES
  -- San José (missing)
  ('sj-ta',  'Tarrazú',                 'sj'),
  ('sj-as',  'Aserrí',                  'sj'),
  ('sj-mo',  'Mora',                    'sj'),
  ('sj-vb',  'Vásquez de Coronado',     'sj'),
  ('sj-ac',  'Acosta',                  'sj'),
  ('sj-mu',  'Montes de Oca',           'sj'),
  ('sj-tu2', 'Turrubares',              'sj'),
  ('sj-da',  'Dota',                    'sj'),
  ('sj-le',  'León Cortés Castro',      'sj'),
  -- Alajuela (missing)
  ('al-sm',  'San Mateo',               'al'),
  ('al-at',  'Atenas',                  'al'),
  ('al-po',  'Poás',                    'al'),
  ('al-oc',  'Orotina',                 'al'),
  ('al-za',  'Zarcero',                 'al'),
  ('al-va',  'Valverde Vega',           'al'),
  ('al-up',  'Upala',                   'al'),
  ('al-lo',  'Los Chiles',              'al'),
  ('al-gu',  'Guatuso',                 'al'),
  -- Cartago (missing)
  ('ca-ji',  'Jiménez',                 'ca'),
  ('ca-al',  'Alvarado',                'ca'),
  ('ca-oa',  'Oreamuno',                'ca'),
  ('ca-el',  'El Guarco',               'ca'),
  -- Heredia (missing)
  ('he-sr',  'San Rafael',              'he'),
  ('he-si',  'San Isidro',              'he'),
  ('he-fl',  'Flores',                  'he'),
  ('he-sp',  'San Pablo',               'he'),
  ('he-sa2', 'Sarapiquí',               'he'),
  -- Guanacaste (missing)
  ('gu-ba',  'Bagaces',                 'gu'),
  ('gu-ca',  'Carrillo',                'gu'),
  ('gu-ca2', 'Cañas',                   'gu'),
  ('gu-ab',  'Abangares',               'gu'),
  ('gu-ti',  'Tilarán',                 'gu'),
  ('gu-na',  'Nandayure',               'gu'),
  ('gu-lc',  'La Cruz',                 'gu'),
  ('gu-ho',  'Hojancha',                'gu'),
  -- Puntarenas (missing)
  ('pu-bv',  'Buenos Aires',            'pu'),
  ('pu-mo',  'Montes de Oro',           'pu'),
  ('pu-os',  'Osa',                     'pu'),
  ('pu-ag',  'Aguirre',                 'pu'),
  ('pu-ga',  'Golfito',                 'pu'),
  ('pu-cc',  'Coto Brus',               'pu'),
  ('pu-pa2', 'Parrita',                 'pu'),
  ('pu-co',  'Corredores',              'pu'),
  ('pu-ga2', 'Garabito',                'pu'),
  -- Limón (missing)
  ('li-ta',  'Talamanca',               'li'),
  ('li-ma',  'Matina',                  'li'),
  ('li-gu',  'Guácimo',                 'li')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. Replace the trigger: ONLY create the profile row.
--    Professional record is created via the /api/register/professional
--    server route (uses service_role key, so no RLS issues).
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta         jsonb := NEW.raw_user_meta_data;
  profile_role text  := COALESCE(meta->>'role', 'client');
BEGIN
  INSERT INTO public.profiles (id, email, full_name, cedula, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(meta->>'full_name', ''), split_part(NEW.email, '@', 1)),
    NULLIF(meta->>'cedula', ''),
    profile_role
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Re-attach (trigger already exists from migration 003, just replacing the function)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
