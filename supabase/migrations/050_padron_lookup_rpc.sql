-- 050_padron_lookup_rpc.sql
-- FIX: identity verification reported every cédula as "not found" after the
-- RLS/security hardening. The `padron` table is RLS-enabled with NO policies and
-- is meant to be read only by the server. The service-role bypasses RLS, but it
-- still needs a table-level SELECT *privilege* — and the broad REVOKEs in the
-- security pass left the server unable to read `padron`, so every lookup returned
-- nothing and sent valid users to manual review.
--
-- The padrón MUST stay private (never readable by anon/authenticated). So we add
-- a SECURITY DEFINER function that runs as its OWNER (which owns the table and can
-- always read it), and grant EXECUTE to the service-role ONLY. anon/authenticated
-- cannot call it, so the padrón is never exposed to the public/client.

create or replace function public.padron_lookup(p_cedula text)
returns table (nombre text, papellido text, sapellido text)
language sql
security definer
set search_path = public
as $$
  select p.nombre, p.papellido, p.sapellido
  from public.padron p
  where p.cedula = p_cedula
  limit 1;
$$;

-- Private by default: only the server (service-role) may execute it.
revoke all on function public.padron_lookup(text) from public, anon, authenticated;
grant execute on function public.padron_lookup(text) to service_role;

-- Belt-and-suspenders: restore the server's direct SELECT privilege on the padrón
-- tables (RLS stays ON; this only re-grants the server role, never anon/auth), so
-- other legitimate server-side reads work too. The padrón remains private.
grant select on public.padron, public.padron_staging to service_role;

notify pgrst, 'reload schema';
