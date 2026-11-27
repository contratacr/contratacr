-- 545 (Pro, 2026-11-27): in-app notices for «Agregar mi empresa» requests (POST /api/negocio/solicitud): the requester
-- hears when the team publishes the place (link to /lugar/<slug>/reclamar) or rejects it. Two new notification types;
-- the rest of notifications_type_check stays exactly as it is (extended in place, whatever its current list).
begin;
do $$declare def text;
begin
 select pg_get_constraintdef(oid) into def from pg_constraint where conname='notifications_type_check' and conrelid='public.notifications'::regclass;
 if def is null then raise exception 'notifications_type_check not found';end if;
 if position('place_request_published' in def)>0 then return;end if;
 alter table public.notifications drop constraint notifications_type_check;
 execute 'alter table public.notifications add constraint notifications_type_check check ((('||regexp_replace(def,'^CHECK \((.*)\)$','\1')
  ||') OR (type = ANY (ARRAY[''place_request_published''::text, ''place_request_rejected''::text]))))';
end $$;
commit;
