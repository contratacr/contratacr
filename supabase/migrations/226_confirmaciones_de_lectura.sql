-- «Confirmaciones de lectura», recíprocas como en WhatsApp.
--
-- Encendidas por defecto. Quien las apaga:
--   · no marca «visto» los mensajes que lee (la base no guarda read_at de su
--     lectura: nada que filtrar, nada que se escape en vivo);
--   · tampoco ve el «visto» de los demás: el servidor se lo quita de lo que
--     le devuelve.
-- «Recibido» y el contador de no leídos no dependen de esto.
alter table public.profiles
  add column if not exists confirmaciones_de_lectura boolean not null default true;

comment on column public.profiles.confirmaciones_de_lectura is
  'Muestra y ve el «visto» de los mensajes. Recíproco: apagado, no se marca ni se ve.';

notify pgrst, 'reload schema';
