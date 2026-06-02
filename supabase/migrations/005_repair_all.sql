-- ============================================================
-- REPAIR SCRIPT — run this in Supabase SQL Editor
-- Safe to run multiple times (idempotent)
-- ============================================================

-- 1. Make cedula nullable (OAuth / users without cedula)
ALTER TABLE public.profiles ALTER COLUMN cedula DROP NOT NULL;

-- 2. RLS: allow users to insert their own profile
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- 3. RLS: allow professionals to insert their own record
DROP POLICY IF EXISTS "Professionals can insert their own record" ON public.professionals;
CREATE POLICY "Professionals can insert their own record" ON public.professionals
  FOR INSERT WITH CHECK (auth.uid() = profile_id);

-- 4. Seed ALL cantones (covers every canton in the app's cr-geography.ts)
INSERT INTO public.cantones (id, name, provincia_id) VALUES
  -- San José
  ('sj-sj',  'San José',               'sj'),
  ('sj-es',  'Escazú',                 'sj'),
  ('sj-de',  'Desamparados',           'sj'),
  ('sj-pu',  'Puriscal',               'sj'),
  ('sj-ta',  'Tarrazú',                'sj'),
  ('sj-as',  'Aserrí',                 'sj'),
  ('sj-mo',  'Mora',                   'sj'),
  ('sj-go',  'Goicoechea',             'sj'),
  ('sj-sa',  'Santa Ana',              'sj'),
  ('sj-al',  'Alajuelita',             'sj'),
  ('sj-vb',  'Vásquez de Coronado',    'sj'),
  ('sj-ac',  'Acosta',                 'sj'),
  ('sj-ti',  'Tibás',                  'sj'),
  ('sj-mo2', 'Moravia',                'sj'),
  ('sj-mu',  'Montes de Oca',          'sj'),
  ('sj-tu2', 'Turrubares',             'sj'),
  ('sj-da',  'Dota',                   'sj'),
  ('sj-cu',  'Curridabat',             'sj'),
  ('sj-pm',  'Pérez Zeledón',          'sj'),
  ('sj-le',  'León Cortés Castro',     'sj'),
  -- Alajuela
  ('al-al',  'Alajuela',               'al'),
  ('al-sa',  'San Ramón',              'al'),
  ('al-gr',  'Grecia',                 'al'),
  ('al-sm',  'San Mateo',              'al'),
  ('al-at',  'Atenas',                 'al'),
  ('al-na',  'Naranjo',                'al'),
  ('al-pa',  'Palmares',               'al'),
  ('al-po',  'Poás',                   'al'),
  ('al-oc',  'Orotina',                'al'),
  ('al-sc',  'San Carlos',             'al'),
  ('al-za',  'Zarcero',                'al'),
  ('al-va',  'Valverde Vega',          'al'),
  ('al-up',  'Upala',                  'al'),
  ('al-lo',  'Los Chiles',             'al'),
  ('al-gu',  'Guatuso',                'al'),
  -- Cartago
  ('ca-ca',  'Cartago',                'ca'),
  ('ca-pa',  'Paraíso',                'ca'),
  ('ca-lu',  'La Unión',               'ca'),
  ('ca-ji',  'Jiménez',                'ca'),
  ('ca-tu',  'Turrialba',              'ca'),
  ('ca-al',  'Alvarado',               'ca'),
  ('ca-oa',  'Oreamuno',               'ca'),
  ('ca-el',  'El Guarco',              'ca'),
  -- Heredia
  ('he-he',  'Heredia',                'he'),
  ('he-ba',  'Barva',                  'he'),
  ('he-sd',  'Santo Domingo',          'he'),
  ('he-sa',  'Santa Bárbara',          'he'),
  ('he-sr',  'San Rafael',             'he'),
  ('he-si',  'San Isidro',             'he'),
  ('he-be',  'Belén',                  'he'),
  ('he-fl',  'Flores',                 'he'),
  ('he-sp',  'San Pablo',              'he'),
  ('he-sa2', 'Sarapiquí',              'he'),
  -- Guanacaste
  ('gu-li',  'Liberia',                'gu'),
  ('gu-ni',  'Nicoya',                 'gu'),
  ('gu-sc',  'Santa Cruz',             'gu'),
  ('gu-ba',  'Bagaces',                'gu'),
  ('gu-ca',  'Carrillo',               'gu'),
  ('gu-ca2', 'Cañas',                  'gu'),
  ('gu-ab',  'Abangares',              'gu'),
  ('gu-ti',  'Tilarán',                'gu'),
  ('gu-na',  'Nandayure',              'gu'),
  ('gu-lc',  'La Cruz',                'gu'),
  ('gu-ho',  'Hojancha',               'gu'),
  -- Puntarenas
  ('pu-pu',  'Puntarenas',             'pu'),
  ('pu-es',  'Esparza',                'pu'),
  ('pu-bv',  'Buenos Aires',           'pu'),
  ('pu-mo',  'Montes de Oro',          'pu'),
  ('pu-os',  'Osa',                    'pu'),
  ('pu-ag',  'Aguirre',                'pu'),
  ('pu-ga',  'Golfito',                'pu'),
  ('pu-cc',  'Coto Brus',              'pu'),
  ('pu-pa2', 'Parrita',                'pu'),
  ('pu-co',  'Corredores',             'pu'),
  ('pu-ga2', 'Garabito',               'pu'),
  -- Limón
  ('li-li',  'Limón',                  'li'),
  ('li-po',  'Pococí',                 'li'),
  ('li-si',  'Siquirres',              'li'),
  ('li-ta',  'Talamanca',              'li'),
  ('li-ma',  'Matina',                 'li'),
  ('li-gu',  'Guácimo',                'li')
ON CONFLICT (id) DO NOTHING;

-- 5. Replace the trigger with a bulletproof version that NEVER blocks
--    user creation — profile insert is wrapped in exception handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.profiles (id, email, full_name, cedula, role)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(
        NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
        split_part(NEW.email, '@', 1)
      ),
      NULLIF(NEW.raw_user_meta_data->>'cedula', ''),
      COALESCE(NEW.raw_user_meta_data->>'role', 'client')
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Log to Postgres logs but never block sign-up
    RAISE WARNING 'handle_new_user: could not create profile for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
