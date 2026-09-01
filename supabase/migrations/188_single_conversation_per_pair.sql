-- 188_single_conversation_per_pair.sql
-- Un solo chat por pareja cliente–profesional.
--
-- Hasta ahora cada solicitud, proyecto o propuesta abría su propio hilo, así que
-- la bandeja mostraba la misma persona repetida cuatro o cinco veces sin poder
-- distinguir de qué trataba cada fila. Ahora la conversación es de la persona y
-- los orígenes se acumulan dentro: `contexts` guarda la lista y la barra fijada
-- del chat los muestra.
--
-- Los hilos que ya existen se fusionan en el más reciente de cada pareja: sus
-- mensajes se mueven, los contadores se suman y los orígenes se conservan.

alter table public.direct_conversations
  add column if not exists contexts jsonb not null default '[]'::jsonb;

-- 1) Cada conversación aporta su propio origen a la lista.
update public.direct_conversations
set contexts = jsonb_build_array(
  jsonb_strip_nulls(jsonb_build_object(
    'type', case
      when proposal_id is not null then 'proposal'
      when project_id is not null then 'project'
      when booking_id is not null then 'booking'
      else 'profile'
    end,
    'bookingId', booking_id,
    'projectId', project_id,
    'proposalId', proposal_id,
    'title', subject,
    'at', coalesce(last_message_at, created_at)
  ))
)
where contexts = '[]'::jsonb
  and (booking_id is not null or project_id is not null or proposal_id is not null or subject is not null);

-- 2) La conversación que sobrevive por pareja: la de actividad más reciente.
create temporary table ccr_conv_merge on commit drop as
select
  c.id,
  first_value(c.id) over (
    partition by c.client_id, c.professional_id
    order by coalesce(c.last_message_at, c.created_at) desc, c.created_at desc, c.id
  ) as keep_id
from public.direct_conversations c;

-- 3) Los mensajes de las demás pasan a la que se queda.
update public.direct_messages m
set conversation_id = k.keep_id
from ccr_conv_merge k
where m.conversation_id = k.id
  and k.id <> k.keep_id;

-- 4) La superviviente hereda orígenes, contadores y último mensaje.
with fusionadas as (
  select
    k.keep_id,
    jsonb_agg(distinct ctx) filter (where ctx is not null) as contexts,
    sum(c.client_unread_count) as client_unread,
    sum(c.professional_unread_count) as professional_unread,
    max(coalesce(c.last_message_at, c.created_at)) as last_at
  from ccr_conv_merge k
  join public.direct_conversations c on c.id = k.id
  left join lateral jsonb_array_elements(c.contexts) as ctx on true
  group by k.keep_id
)
update public.direct_conversations c
set contexts = coalesce(f.contexts, c.contexts),
    client_unread_count = least(coalesce(f.client_unread, 0), 999),
    professional_unread_count = least(coalesce(f.professional_unread, 0), 999),
    last_message_at = coalesce(f.last_at, c.last_message_at),
    updated_at = now()
from fusionadas f
where c.id = f.keep_id;

-- 5) Fuera las que quedaron vacías.
delete from public.direct_conversations c
using ccr_conv_merge k
where c.id = k.id and k.id <> k.keep_id;

-- 6) El último mensaje visible se recalcula sobre el hilo ya fusionado.
with ultimo as (
  select distinct on (m.conversation_id)
    m.conversation_id, m.body, m.created_at, m.sender_id
  from public.direct_messages m
  order by m.conversation_id, m.created_at desc
)
update public.direct_conversations c
set last_message = u.body,
    last_message_at = u.created_at,
    last_sender_id = u.sender_id
from ultimo u
where c.id = u.conversation_id;

-- 7) Los índices únicos por origen ya no aplican: ahora manda la pareja.
drop index if exists public.direct_conversations_booking_uidx;
drop index if exists public.direct_conversations_project_professional_uidx;
drop index if exists public.direct_conversations_profile_pair_uidx;

create unique index if not exists direct_conversations_pair_uidx
  on public.direct_conversations (client_id, professional_id);

notify pgrst, 'reload schema';
