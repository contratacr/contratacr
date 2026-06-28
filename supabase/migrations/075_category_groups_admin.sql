-- Migration 075: admin-managed service sections.
-- Keeps the built-in section ids compatible, while allowing new sections
-- without a code deploy.

CREATE TABLE IF NOT EXISTS public.category_groups (
  id text PRIMARY KEY,
  label text NOT NULL,
  label_en text,
  icon_key text,
  sort_order integer NOT NULL DEFAULT 100,
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.category_groups (id, label, label_en, icon_key, sort_order)
VALUES
  ('hogar', 'Hogar y construcción', 'Home & construction', 'home', 10),
  ('jardin', 'Jardín y exterior', 'Garden & outdoor', 'leaf', 20),
  ('limpieza', 'Limpieza', 'Cleaning', 'sparkles', 30),
  ('tecnologia', 'Tecnología', 'Technology', 'laptop', 40),
  ('profesional', 'Servicios empresariales', 'Business services', 'briefcase', 50),
  ('salud', 'Salud y bienestar', 'Health & wellness', 'heart', 60),
  ('belleza', 'Belleza y estética', 'Beauty & aesthetics', 'star', 70),
  ('educacion', 'Educación', 'Education & classes', 'book-open', 80),
  ('transporte', 'Mudanzas y transporte', 'Moving & transport', 'truck', 90),
  ('eventos', 'Eventos', 'Events', 'calendar-days', 100),
  ('seguridad', 'Seguridad', 'Security', 'shield', 110),
  ('automotriz', 'Automotriz', 'Automotive', 'car', 120)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  label_en = EXCLUDED.label_en,
  icon_key = COALESCE(public.category_groups.icon_key, EXCLUDED.icon_key),
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
