-- Migration 103: consolidate service groups into short market segments.
-- This only changes category group placement/labels. Service ids, names,
-- professional links, prices and descriptions remain untouched.

INSERT INTO public.category_groups (id, label, label_en, icon_key, sort_order, is_hidden)
VALUES
  ('hogar', 'Hogar', 'Home', 'armchair', 10, false),
  ('limpieza', 'Limpieza', 'Cleaning', 'sparkles', 20, false),
  ('salud', 'Salud', 'Health', 'heart', 30, false),
  ('bienestar', 'Bienestar', 'Wellness', 'dumbbell', 40, false),
  ('automotriz', 'Vehículos', 'Vehicles', 'car', 50, false),
  ('tecnologia', 'Tecnología', 'Technology', 'laptop', 60, false),
  ('profesional', 'Empresas', 'Business', 'briefcase', 70, false),
  ('creatividad', 'Creatividad', 'Creative', 'palette', 80, false),
  ('eventos', 'Eventos', 'Events', 'calendar-days', 90, false),
  ('educacion', 'Educación', 'Education', 'book-open', 100, false),
  ('transporte', 'Transporte', 'Transport', 'truck', 110, false),
  ('agricultura', 'Agro', 'Agro', 'wheat', 120, false),
  ('turismo', 'Turismo', 'Tourism', 'map', 130, false),
  ('mascotas', 'Mascotas', 'Pets', 'paw-print', 140, false)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  label_en = EXCLUDED.label_en,
  icon_key = EXCLUDED.icon_key,
  sort_order = EXCLUDED.sort_order,
  is_hidden = false,
  updated_at = now();

UPDATE public.category_groups
SET is_hidden = true, updated_at = now()
WHERE id IN ('jardin', 'belleza', 'moda_y_cuidado_personal', 'seguridad', 'restaurantes', 'otras', 'otras_categorias');

UPDATE public.categories
SET group_id = 'hogar'
WHERE group_id = 'jardin'
   OR id IN ('alarmas', 'monitoreo_alarmas', 'cercas_electricas');

UPDATE public.categories
SET group_id = 'bienestar'
WHERE group_id IN ('belleza', 'moda_y_cuidado_personal')
   OR id IN ('entrenamiento_personal', 'entrenamiento_deportivo', 'masajes', 'acupuntura', 'coaching');

UPDATE public.categories
SET group_id = 'automotriz'
WHERE id IN ('lavado_vehiculos');

UPDATE public.categories
SET group_id = 'tecnologia'
WHERE id IN ('cctv', 'control_acceso');

UPDATE public.categories
SET group_id = 'profesional'
WHERE group_id = 'seguridad'
   OR id IN ('guardas_seguridad', 'investigacion_privada');

UPDATE public.categories
SET group_id = 'creatividad'
WHERE id IN (
  'marketing_digital',
  'diseno',
  'publicidad',
  'redaccion_contenido',
  'fotografia',
  'produccion_video',
  'diseno_grafico',
  'audio_video'
);

UPDATE public.categories
SET group_id = 'eventos'
WHERE group_id = 'restaurantes';

UPDATE public.categories
SET group_id = 'agricultura'
WHERE group_id IN ('agro', 'agroindustria');

UPDATE public.categories
SET group_id = 'mascotas'
WHERE id IN ('veterinaria', 'peluqueria_canina', 'cuido_mascotas', 'transporte_mascotas');
