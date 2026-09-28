-- QUIÉN BLOQUEÓ, PARA QUE SOLO ESA PERSONA PUEDA DESBLOQUEAR.
--
-- «Reportar y bloquear» dejaba la conversación en `blocked` y ahí terminaba:
-- no había forma de deshacerlo desde el app y la conversación desaparecía de
-- las dos bandejas. Quien se equivocaba de botón perdía el canal para siempre
-- y solo soporte podía devolvérselo a mano.
--
-- Para poder ofrecer «Desbloquear» hay que saber QUIÉN bloqueó. Sin este dato
-- la única opción sería dejar que cualquiera de las dos partes desbloquee, y
-- eso pone el botón en manos de la persona de la que alguien se quiso
-- proteger: el bloqueo dejaría de servir para lo único que sirve.
--
-- Se queda `null` en las conversaciones bloqueadas antes de esta migración. Esas
-- no ofrecen desbloqueo —no sabemos de quién fue la decisión— y siguen como
-- estaban: soporte las revisa si alguien escribe.

alter table public.direct_conversations
  add column if not exists blocked_by uuid references public.profiles(id) on delete set null;

comment on column public.direct_conversations.blocked_by is
  'Quién bloqueó la conversación. Solo esa persona puede desbloquearla. Null en los bloqueos anteriores a esta columna.';

-- La bandeja de bloqueados es «los que YO bloqueé», no «los bloqueados»: se
-- consulta siempre por esta columna junto con el estado.
create index if not exists direct_conversations_blocked_by_idx
  on public.direct_conversations (blocked_by)
  where status = 'blocked';
