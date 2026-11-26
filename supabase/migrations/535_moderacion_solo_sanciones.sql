-- 535 (reservado con la sesión de Pro el 2026-11-25; Pro sigue en 536+).
-- En main salta de 291 a 535 a propósito: el flujo aplica con --include-all.

-- 1) La persona reportada solo ve los reportes que terminaron en sanción
--    (advertencia, retiro o restricción), con el motivo de esa sanción.
--    Antes devolvía todo reporte con decision_reason, incluida la nota interna
--    de revisión y los cierres sin infracción, y cualquier sesión podía
--    llamarla directo. La ruta /api/moderation/decisions ya filtraba en la app;
--    esto cierra el hueco en la base.
create or replace function public.my_moderation_decisions() returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb) from (
  select r.id,r.target_type,r.target_id,s.reason as decision_reason,r.status,r.appealed_at,s.created_at
  from reports r
  join lateral (
   select a.reason,a.created_at from moderation_actions a
   where a.report_id=r.id and a.action in ('hide','warn','restrict')
   order by a.created_at desc limit 1
  ) s on true
  where r.subject_user_id=auth.uid()
  order by s.created_at desc limit 100
 ) t;
$$;
revoke all on function public.my_moderation_decisions() from public,anon;
grant execute on function public.my_moderation_decisions() to authenticated;

-- 2) Tipo propio para el aviso de sanción en la campana. Se agrega al check
--    vivo sin reescribirlo (mismo patrón que 257 y las migraciones de Pro).
do $$
declare prior text;
begin
 select pg_get_expr(conbin,conrelid) into prior from pg_constraint
  where conrelid='public.notifications'::regclass and conname='notifications_type_check';
 if prior is null then raise exception 'Notification type contract not found'; end if;
 if position('moderation_decision' in prior)=0 then
  alter table public.notifications drop constraint notifications_type_check;
  execute format('alter table public.notifications add constraint notifications_type_check check ((%s) or type = %L)', prior, 'moderation_decision');
 end if;
end $$;
