-- Las redes públicas del profesional (sitio web, Instagram, Facebook, TikTok,
-- LinkedIn) nunca se veían en la ficha: la tabla `professionals` tiene permisos
-- por columna y `social_links` quedó fuera de la lista pública, así que la
-- consulta que las trae fallaba en silencio ("permission denied") y el perfil se
-- pintaba sin ellas. El correo público de contacto tenía el mismo problema, pero
-- ese solo se muestra a quien inició sesión, así que se abre solo para esa parte.
GRANT SELECT (social_links) ON public.professionals TO anon, authenticated;
GRANT SELECT (contact_email) ON public.professionals TO authenticated;
