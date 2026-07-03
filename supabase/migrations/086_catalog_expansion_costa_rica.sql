-- Migration 086: Costa Rica catalog expansion.
-- Safe rules:
-- - Additive only for new services and sections.
-- - Do not rename services already selected by professionals.
-- - Keep stable ids so existing professional profiles and filters do not break.

INSERT INTO public.category_groups (id, label, label_en, icon_key, sort_order, is_hidden, updated_at)
VALUES
  ('moda_y_cuidado_personal', 'Moda y cuidado personal', 'Fashion & personal care', 'shirt', 75, false, now()),
  ('turismo', 'Turismo', 'Tourism', 'map', 130, false, now())
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  label_en = EXCLUDED.label_en,
  icon_key = COALESCE(public.category_groups.icon_key, EXCLUDED.icon_key),
  sort_order = EXCLUDED.sort_order,
  is_hidden = false,
  updated_at = now();

INSERT INTO public.categories (
  id, name, name_en, group_id, is_hidden, es_salud, supports_videoconsulta
)
VALUES
  ('polarizado', 'Polarizado', 'Window tinting', 'automotriz', false, false, false),
  ('grua', 'Servicio de grúa', 'Tow truck service', 'automotriz', false, false, false),
  ('spa', 'Spa', 'Spa', 'belleza', false, false, false),
  ('clases_baile', 'Clases de baile', 'Dance classes', 'educacion', false, false, false),
  ('alquiler_mobiliario', 'Alquiler de mobiliario', 'Event furniture rental', 'eventos', false, false, false),
  ('floristeria', 'Floristería', 'Florist', 'eventos', false, false, false),
  ('maestro_ceremonias', 'Maestro de ceremonias', 'Master of ceremonies', 'eventos', false, false, false),
  ('organizacion_eventos', 'Organización de eventos', 'Event planning', 'eventos', false, false, false),
  ('bombas_agua', 'Bombas de agua', 'Water pumps', 'hogar', false, false, false),
  ('ebanisteria', 'Ebanistería', 'Fine woodworking', 'hogar', false, false, false),
  ('herreria', 'Herrería', 'Metalwork', 'hogar', false, false, false),
  ('ingenieria_electrica', 'Ingeniería eléctrica', 'Electrical engineering', 'hogar', false, false, true),
  ('ingenieria_mecanica', 'Ingeniería mecánica', 'Mechanical engineering', 'hogar', false, false, true),
  ('maestro_obras', 'Maestro de obras', 'Construction foreman', 'hogar', false, false, false),
  ('vidrieria', 'Vidriería', 'Glasswork', 'hogar', false, false, false),
  ('lavado_muebles', 'Lavado de muebles', 'Upholstery cleaning', 'limpieza', false, false, false),
  ('costura_y_arreglos_de_ropa', 'Costura y arreglos de ropa', 'Sewing and clothing alterations', 'moda_y_cuidado_personal', false, false, false),
  ('joyeria', 'Joyería', 'Jewelry repair', 'moda_y_cuidado_personal', false, false, false),
  ('lavanderia', 'Lavandería', 'Laundry', 'moda_y_cuidado_personal', false, false, false),
  ('relojeria', 'Relojería', 'Watch repair', 'moda_y_cuidado_personal', false, false, false),
  ('zapateria', 'Zapatería', 'Shoe repair', 'moda_y_cuidado_personal', false, false, false),
  ('asesoria_financiera', 'Asesoría financiera', 'Financial advisory', 'profesional', false, false, true),
  ('asesoria_tributaria', 'Asesoría tributaria', 'Tax advisory', 'profesional', false, false, true),
  ('auditoria', 'Auditoría', 'Auditing', 'profesional', false, false, true),
  ('avaluos', 'Avalúos', 'Appraisals', 'profesional', false, false, true),
  ('capacitacion_empresarial', 'Capacitación empresarial', 'Business training', 'profesional', false, false, true),
  ('coaching', 'Coaching', 'Coaching', 'profesional', false, false, true),
  ('consultoria_ambiental', 'Consultoría ambiental', 'Environmental consulting', 'profesional', false, false, true),
  ('corredor_seguros', 'Corredor de seguros', 'Insurance broker', 'profesional', false, false, true),
  ('gestoria_tramites', 'Gestoría de trámites', 'Administrative errands', 'profesional', false, false, true),
  ('notaria', 'Notaría', 'Notary services', 'profesional', false, false, true),
  ('publicidad', 'Publicidad', 'Advertising', 'profesional', false, false, true),
  ('redaccion_contenido', 'Redacción de contenido', 'Content writing', 'profesional', false, false, true),
  ('ambulancias_privadas', 'Ambulancias privadas', 'Private ambulances', 'salud', false, true, false),
  ('laboratorio_clinico', 'Laboratorio clínico', 'Clinical laboratory', 'salud', false, true, false),
  ('medico_especialista', 'Médico especialista', 'Medical specialist', 'salud', false, true, true),
  ('optica_lentes', 'Óptica y lentes', 'Optical store & lenses', 'salud', false, true, false),
  ('ortodoncia', 'Ortodoncia', 'Orthodontics', 'salud', false, true, false),
  ('psiquiatria', 'Psiquiatría', 'Psychiatry', 'salud', false, true, true),
  ('cercas_electricas', 'Cercas eléctricas', 'Electric fences', 'seguridad', false, false, false),
  ('investigacion_privada', 'Investigación privada', 'Private investigation', 'seguridad', false, false, false),
  ('monitoreo_alarmas', 'Monitoreo de alarmas', 'Alarm monitoring', 'seguridad', false, false, false),
  ('ciberseguridad', 'Ciberseguridad', 'Cybersecurity', 'tecnologia', false, false, true),
  ('consultoria_ti', 'Consultoría TI', 'IT consulting', 'tecnologia', false, false, true),
  ('reparacion_celulares', 'Reparación de celulares', 'Phone repair', 'tecnologia', false, false, false),
  ('reparacion_impresoras', 'Reparación de impresoras', 'Printer repair', 'tecnologia', false, false, false),
  ('alquiler_vehiculos', 'Alquiler de vehículos', 'Vehicle rental', 'transporte', false, false, false),
  ('transporte_privado', 'Transporte privado', 'Private transportation', 'transporte', false, false, false),
  ('agencia_viajes', 'Agencia de viajes', 'Travel agency', 'turismo', false, false, false),
  ('alquiler_vacacional', 'Alquiler vacacional', 'Vacation rental', 'turismo', false, false, false),
  ('guia_turistico', 'Guía turístico', 'Tour guide', 'turismo', false, false, false),
  ('operador_turistico', 'Operador turístico', 'Tour operator', 'turismo', false, false, false)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  name_en = EXCLUDED.name_en,
  group_id = EXCLUDED.group_id,
  is_hidden = false,
  es_salud = EXCLUDED.es_salud,
  supports_videoconsulta = EXCLUDED.supports_videoconsulta;

-- Correct obvious translation/admin mistakes only if no professional is using
-- the service as a primary or secondary profession.
UPDATE public.categories c
SET name = 'Mudanzas',
    name_en = 'Moving',
    group_id = 'transporte'
WHERE c.id = 'mudanzas'
  AND NOT EXISTS (
    SELECT 1 FROM public.professionals p
    WHERE p.category_id = c.id OR p.professions @> ARRAY[c.id]::text[]
  );

UPDATE public.categories c
SET name = 'Detailing de autos',
    name_en = 'Car detailing',
    group_id = 'automotriz'
WHERE c.id = 'detailing'
  AND NOT EXISTS (
    SELECT 1 FROM public.professionals p
    WHERE p.category_id = c.id OR p.professions @> ARRAY[c.id]::text[]
  );

UPDATE public.categories c
SET name = 'Contabilidad y finanzas',
    name_en = 'Accounting & finance',
    group_id = 'profesional'
WHERE c.id = 'contabilidad'
  AND NOT EXISTS (
    SELECT 1 FROM public.professionals p
    WHERE p.category_id = c.id OR p.professions @> ARRAY[c.id]::text[]
  );

UPDATE public.categories c
SET name = 'Gypsum / Drywall',
    name_en = 'Gypsum / Drywall',
    group_id = 'hogar'
WHERE c.id = 'gypsum'
  AND NOT EXISTS (
    SELECT 1 FROM public.professionals p
    WHERE p.category_id = c.id OR p.professions @> ARRAY[c.id]::text[]
  );

NOTIFY pgrst, 'reload schema';
