-- 200_professional_columns_grant_refresh.sql
-- La 048 revocó el SELECT de tabla sobre `professionals` para `anon` y lo
-- devolvió columna por columna, calculando la lista con el catálogo del momento.
-- Ese permiso NO cubre las columnas agregadas después: en una base construida
-- desde cero (proyecto de test nuevo, 10-sep-2026) la ficha pública respondía
-- 42501 «permission denied for table professionals» y toda la app mostraba
-- «no encontrado». Aquí se vuelve a calcular la lista con las columnas de HOY.
--
-- Sigue fuera del alcance público lo mismo que en la 048 (notas internas de
-- moderación) y, desde la 199, el correo de contacto, que solo ve quien tiene
-- sesión iniciada.
do $$
declare col_list text;
begin
  execute 'revoke select on public.professionals from anon';
  select string_agg(quote_ident(column_name), ', ')
    into col_list
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'professionals'
     and column_name not in (
       'banned_reason',
       'verification_reason',
       'id_document_note',
       'contact_email'
     );
  execute format('grant select (%s) on public.professionals to anon', col_list);
end $$;

-- Quien tiene sesión conserva la lectura completa: su propio panel lee su fila
-- con select('*') y el correo de contacto se muestra en la ficha.
grant select on public.professionals to authenticated;

notify pgrst, 'reload schema';
