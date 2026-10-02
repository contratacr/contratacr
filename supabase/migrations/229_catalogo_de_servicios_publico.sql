-- EL CATÁLOGO DE SERVICIOS SE LEE SIN SESIÓN.
--
-- El 1-oct-2026 todos los enlaces de servicio de producción
-- (/profesionales/plomeria, /profesionales/electricidad…) abrían «Perfil no
-- encontrado». En producción `categories` tenía la seguridad por filas
-- encendida sin ninguna regla de lectura —activada desde el panel, no por una
-- migración—: con la llave pública devolvía CERO filas, y el middleware, que
-- consulta el catálogo así para distinguir un servicio de un perfil, concluía
-- que ningún servicio existía. En test la tabla seguía abierta y no se veía.
--
-- Ahora queda igual en los dos ambientes, explícito: seguridad por filas
-- encendida, LECTURA pública (es un catálogo) y escritura solo del servidor
-- (la llave de servicio no pasa por estas reglas).

alter table public.categories enable row level security;

drop policy if exists "El catálogo de servicios es público" on public.categories;
create policy "El catálogo de servicios es público"
  on public.categories
  for select
  to anon, authenticated
  using (true);

grant select on public.categories to anon, authenticated;

notify pgrst, 'reload schema';
