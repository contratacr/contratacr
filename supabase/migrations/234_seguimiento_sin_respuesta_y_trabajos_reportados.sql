-- SEGUIMIENTO DE CONTACTOS: «NO ME RESPONDIÓ», FUERA LOS EMPLEOS, Y LOS
-- TRABAJOS QUE REPORTA EL PROFESIONAL (8-oct-2026).
--
-- 1. La tarjeta «¿Llegaste a contratarlo?» suma la respuesta «No me respondió».
--    Es el único dato que dice qué profesional contesta: la conversación es por
--    WhatsApp y el app no la ve.
-- 2. Abrir WhatsApp desde un EMPLEO también creaba el seguimiento, y a quien se
--    postuló le preguntaba días después si «contrató» al empleador. Eran 277 de
--    372 filas. El código ya no los crea; aquí se cierran los que quedaron.
-- 3. Una vez por semana se le pregunta al profesional que recibió contactos con
--    cuántos cerró trabajo. La respuesta vive aquí.

do $$
declare
  v_nombre text;
begin
  select con.conname into v_nombre
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'whatsapp_contact_followups'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%status%';
  if v_nombre is not null then
    execute format('alter table public.whatsapp_contact_followups drop constraint %I', v_nombre);
  end if;
end $$;

alter table public.whatsapp_contact_followups
  add constraint whatsapp_contact_followups_status_check
  check (status in ('contacted', 'hire_intent', 'hired', 'dismissed', 'reviewed', 'no_response'));

update public.whatsapp_contact_followups f
set status = 'dismissed', updated_at = now()
where f.status in ('contacted', 'hire_intent')
  and exists (
    select 1 from public.job_posts j
    where j.employer_id = f.professional_id
      and j.title = f.service_name
  );

create table if not exists public.trabajos_reportados (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  -- Lunes de la semana reportada (día de Costa Rica).
  semana date not null,
  -- Cuántos contactos le contamos esa semana, para leer la respuesta en contexto.
  contactos integer not null default 0 check (contactos >= 0),
  -- Lo que respondió: con cuántos cerró trabajo. Null = todavía no responde.
  cerrados integer check (cerrados is null or (cerrados >= 0 and cerrados <= 100)),
  enviado_en timestamptz not null default now(),
  respondido_en timestamptz,
  constraint trabajos_reportados_semana_uidx unique (professional_id, semana)
);

comment on table public.trabajos_reportados is
  'Resumen semanal al profesional: contactos que le llegaron por ContrataCR y con cuántos dijo haber cerrado trabajo.';

-- Solo la escribe y la lee el servidor con la llave de servicio.
alter table public.trabajos_reportados enable row level security;
