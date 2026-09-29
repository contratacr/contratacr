-- Migración 223: ocultar del buscador NO es sancionar.
--
-- `is_banned` se estaba usando para dos cosas distintas: suspender a un
-- profesional por moderación, y esconder del buscador dos cuentas internas
-- (la de revisión de las tiendas y la de publicidad). Mientras un baneo solo
-- quitaba de la búsqueda, la mezcla no se notaba. Al cerrarle también la ficha
-- y avisarle en su panel —que es lo que un baneo DEBE hacer—, la cuenta de
-- revisión de Apple empezó a ver «Tu perfil está suspendido» y su ficha dejó
-- de abrir. Son dos conceptos: se separan.
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS oculto_del_buscador boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.professionals.oculto_del_buscador IS
  'Cuenta interna que no debe aparecer en búsqueda/mapa/sitemap, sin ser una sanción. El perfil abre y la cuenta funciona con normalidad.';

-- Las cuentas que hoy están «baneadas» solo para no salir en la búsqueda pasan
-- a la columna nueva y dejan de estar sancionadas.
UPDATE public.professionals
   SET oculto_del_buscador = true,
       is_banned = false,
       banned_reason = NULL,
       banned_at = NULL
 WHERE is_banned = true
   AND banned_reason IS NOT NULL
   AND banned_reason ILIKE '%oculta%';

CREATE INDEX IF NOT EXISTS professionals_oculto_idx ON public.professionals(oculto_del_buscador) WHERE oculto_del_buscador;
