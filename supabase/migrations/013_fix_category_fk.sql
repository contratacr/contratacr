-- Migration 013: Fix category FK constraints + insert all category IDs
-- Run in Supabase SQL Editor (idempotent)

-- ============================================================
-- 1. Drop FK constraints so any category string is accepted
-- ============================================================
ALTER TABLE public.professionals
  DROP CONSTRAINT IF EXISTS professionals_category_id_fkey;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_category_id_fkey;

-- ============================================================
-- 2. Insert all category IDs used by the app
--    ON CONFLICT DO NOTHING makes this safe to re-run
-- ============================================================
INSERT INTO public.categories (id, name, icon) VALUES
  -- Hogar y construcción
  ('plomeria',            'Plomería',                    '🔧'),
  ('electricidad',        'Electricidad',                 '⚡'),
  ('construccion',        'Construcción',                 '🏗️'),
  ('pintura',             'Pintura',                      '🖌️'),
  ('carpinteria',         'Carpintería',                  '🪵'),
  ('remodelacion',        'Remodelación',                 '🏠'),
  ('techos',              'Techos y cubiertas',           '🏚️'),
  ('pisos',               'Pisos y revestimientos',       '🪨'),
  ('impermeabilizacion',  'Impermeabilización',           '💧'),
  ('fumigacion',          'Fumigación',                   '🐛'),
  ('cerrajeria',          'Cerrajería',                   '🔑'),
  ('aire_acondicionado',  'Aire acondicionado',           '❄️'),
  ('calentadores',        'Calentadores de agua',         '🚿'),
  ('ventanas_puertas',    'Ventanas y puertas',           '🚪'),
  ('soldadura',           'Soldadura',                    '⚙️'),
  ('gypsum',              'Gypsum / Drywall',             '🧱'),
  -- Jardín y exterior
  ('jardineria',          'Jardinería',                   '🌿'),
  ('poda_arboles',        'Poda de árboles',              '🌳'),
  ('paisajismo',          'Paisajismo',                   '🌺'),
  ('limpieza_piscinas',   'Limpieza de piscinas',         '🏊'),
  ('riego_automatizado',  'Riego automatizado',           '💦'),
  ('control_plagas',      'Control de plagas',            '🐜'),
  -- Limpieza
  ('limpieza',            'Limpieza del hogar',           '🧹'),
  ('limpieza_oficinas',   'Limpieza de oficinas',         '🏢'),
  ('desinfeccion',        'Desinfección',                 '🧴'),
  ('lavado_alfombras',    'Lavado de alfombras',          '🧺'),
  ('limpieza_post_construccion', 'Limpieza post-construcción', '🧽'),
  ('lavado_vehiculos',    'Lavado de vehículos',          '🚗'),
  -- Tecnología
  ('reparacion_computadoras', 'Reparación de computadoras', '💻'),
  ('redes_internet',      'Redes e internet',             '📡'),
  ('camaras_seguridad',   'Cámaras de seguridad',         '📷'),
  ('domotica',            'Domótica',                     '🏡'),
  ('desarrollo_web',      'Desarrollo web',               '🌐'),
  ('diseno_grafico',      'Diseño gráfico',               '🎨'),
  ('diseno_apps',         'Diseño de apps',               '📱'),
  ('soporte_tecnico',     'Soporte técnico',              '🖥️'),
  ('impresion_3d',        'Impresión 3D',                 '🖨️'),
  ('audio_video',         'Audio y video',                '🎬'),
  -- Servicios profesionales
  ('contabilidad',        'Contabilidad y finanzas',      '📊'),
  ('legal',               'Abogados y servicios legales', '⚖️'),
  ('ingenieria_civil',    'Ingeniería civil',             '🏗️'),
  ('arquitectura',        'Arquitectura',                 '🏛️'),
  ('topografia',          'Topografía',                   '📏'),
  ('consultoria',         'Consultoría empresarial',      '💼'),
  ('traduccion',          'Traducción',                   '🌍'),
  ('recursos_humanos',    'Recursos humanos',             '👥'),
  ('marketing_digital',   'Marketing digital',            '📣'),
  ('fotografia',          'Fotografía profesional',       '📸'),
  ('produccion_video',    'Producción de video',          '🎥'),
  ('bienes_raices',       'Bienes raíces',                '🏘️'),
  -- Salud y bienestar
  ('entrenamiento_personal', 'Entrenamiento personal',    '🏋️'),
  ('nutricion',           'Nutrición y dietética',        '🥗'),
  ('masajes',             'Masajes terapéuticos',         '💆'),
  ('psicologia',          'Psicología y terapia',         '🧠'),
  ('fisioterapia',        'Fisioterapia',                 '🦴'),
  ('enfermeria',          'Enfermería a domicilio',       '💉'),
  ('cuidado_adultos',     'Cuidado de adultos mayores',   '👴'),
  ('cuidado_infantil',    'Cuidado infantil / Niñera',    '👶'),
  ('veterinaria',         'Veterinaria',                  '🐾'),
  ('peluqueria_canina',   'Peluquería canina',            '🐕'),
  -- Belleza y estética
  ('peluqueria',          'Peluquería y barbería',        '✂️'),
  ('maquillaje',          'Maquillaje',                   '💄'),
  ('unhas',               'Uñas / Manicure',              '💅'),
  ('pestanas',            'Pestañas',                     '👁️'),
  ('depilacion',          'Depilación',                   '🪒'),
  ('estetica_facial',     'Estética facial',              '🧖'),
  ('bronceado',           'Bronceado',                    '☀️'),
  -- Educación
  ('tutorias',            'Tutorías académicas',          '📚'),
  ('idiomas',             'Idiomas',                      '🗣️'),
  ('musica',              'Música e instrumentos',        '🎵'),
  ('matematicas',         'Matemáticas y ciencias',       '🔢'),
  ('preparacion_universitaria', 'Preparación universitaria', '🎓'),
  ('clases_manejo',       'Clases de manejo',             '🚘'),
  ('clases_cocina',       'Clases de cocina',             '👨‍🍳'),
  -- Mudanzas y transporte
  ('mudanzas',            'Mudanzas',                     '📦'),
  ('fletes',              'Fletes y carga',               '🚛'),
  ('mensajeria',          'Mensajería y delivery',        '📬'),
  ('transporte_mascotas', 'Transporte de mascotas',       '🐕'),
  -- Eventos
  ('fotografia_eventos',  'Fotografía de eventos',        '📸'),
  ('videografia',         'Videografía de eventos',       '🎬'),
  ('dj_sonido',           'DJ y sonido',                  '🎧'),
  ('catering',            'Catering y banquetes',         '🍽️'),
  ('decoracion',          'Decoración de eventos',        '🎊'),
  ('animacion_infantil',  'Animación infantil',           '🤹'),
  ('bartending',          'Bartending',                   '🍹'),
  -- Seguridad
  ('guardas_seguridad',   'Guardas de seguridad',         '🛡️'),
  ('alarmas',             'Instalación de alarmas',       '🚨'),
  ('cctv',                'Circuito cerrado CCTV',        '📹'),
  ('control_acceso',      'Control de acceso',            '🔒'),
  -- Automotriz
  ('mecanica',            'Mecánica general',             '🔩'),
  ('hojalateria',         'Hojalatería y pintura',        '🚗'),
  ('electricidad_automotriz', 'Electricidad automotriz',  '🔋'),
  ('tapiceria',           'Tapicería',                    '🛋️'),
  ('detailing',           'Detailing de autos',           '✨'),
  ('cambio_llantas',      'Cambio de llantas',            '🔄'),
  -- Legacy / other
  ('otro',                'Otro servicio',                '⭐'),
  ('seguridad',           'Seguridad',                    '🔐'),
  ('tecnologia',          'Tecnología / TI',              '💻'),
  ('ensenanza',           'Enseñanza / Tutorías',         '📚'),
  ('belleza',             'Belleza / Estética',           '💅'),
  ('mascotas',            'Veterinaria / Mascotas',       '🐾'),
  ('diseno',              'Diseño / Arte',                '🎨'),
  ('diseno_interiores',   'Diseño de interiores',         '🛋️'),
  ('herreria',            'Herrería',                     '⚒️'),
  ('chapisteria',         'Chapistería',                  '🔨'),
  ('eventos',             'Eventos',                      '🎉')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. Also drop FK on projects.category_id if it somehow exists
-- ============================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_name = 'projects'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%category%'
  LOOP
    EXECUTE 'ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
