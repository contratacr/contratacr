-- Los proyectos salen a un tablero público, como empleos y promociones.
--
-- Hasta hoy un proyecto solo existía dentro del panel: el profesional lo veía en
-- «Oportunidades» y respondía con una propuesta. En toda la historia de
-- producción hubo 1 proyecto y 1 propuesta, nunca contestada. Empleos y
-- promociones, que SÍ tienen tablero con dirección propia, acumulan 143 y 7
-- vistas en el mismo periodo.
--
-- `allow_direct_contact` NO se pregunta en el formulario: publicar un proyecto
-- ES pedir que lo contacten, y preguntarlo con una casilla era hacer elegir algo
-- ya elegido. Lo que sí se exige al publicar es un WhatsApp al que responder.
-- La columna existe por una sola razón: dejar FUERA del tablero los proyectos
-- viejos, que se publicaron bajo otra regla (ver el `update` de abajo).
--
-- El número NUNCA baja con la página: sale de /api/contact/project-lead, que
-- exige cuenta profesional y lleva tope por hora.

alter table public.projects
  add column if not exists allow_direct_contact boolean not null default true;

-- Los proyectos que YA existían se publicaron bajo otra regla: solo los veían
-- los profesionales de esa profesión, nunca el internet entero. Nadie aceptó un
-- tablero público, así que arrancan en `false` y no salen ahí. Los nuevos nacen
-- en `true`, que es el valor por omisión de la columna.
--
-- El código NO depende de este `update` para protegerlos: lo que los deja fuera
-- es la fecha (TABLERO_PUBLICO_DESDE en src/lib/queries/proyectos-publicos.ts),
-- así el tablero se comporta igual antes y después de esta migración. Esto los
-- marca también en la base, para que el dato diga lo mismo que el código.
update public.projects
   set allow_direct_contact = false
 where created_at < now();

comment on column public.projects.allow_direct_contact is
  'El proyecto sale al tablero público y un profesional registrado puede pedir el WhatsApp del cliente. Falso solo en los proyectos anteriores al tablero, que se publicaron bajo otra regla.';

-- Guardar funciona igual en todas las secciones. Con el tablero público, un
-- proyecto también se guarda: el profesional lo marca y lo contesta después.
alter table public.saved_items drop constraint if exists saved_items_item_type_check;
alter table public.saved_items add constraint saved_items_item_type_check
  check (item_type in ('offer', 'job', 'project'));
