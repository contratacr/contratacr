-- LOCAL PRO ONLY. Round 6D (2026-11-13): five more providers in the Round 6A–6C integration framework, all
-- MOCK by default and never automatic in production (same rules: sandbox only with every env var, production
-- only with the typed confirmation AND PRO_INTEGRATIONS_ALLOW_PRODUCTION=1):
--   marketing_email  email campaigns and automations (Brevo transactional API adapter, inactive)
--   meta_ads         Meta Marketing API cost import (documented stub, inactive)
--   google_ads       Google Ads API cost import (documented stub, inactive)
--   product_clipper  public product page reader for «Agregar desde enlace» (Open Graph / schema.org; inactive)
--   site_domain      custom domain for the professional website (Cloudflare for SaaS custom hostnames; inactive)
-- Only the provider whitelist changes; pro_integration_read/mutate already read pro_integration_provider_ids().
begin;
create or replace function public.pro_integration_provider_ids() returns text[]
language sql immutable security invoker set search_path=public,pg_temp as $$
 select array['hacienda','tilopay','esign','google','microsoft','quickbooks','ai','transcription','marketing_email','meta_ads','google_ads','product_clipper','site_domain']::text[] $$;
do $$declare t text;begin foreach t in array array['pro_integration_connections','pro_integration_requests','pro_integration_webhooks'] loop
 execute format('alter table public.%I drop constraint if exists %I',t,t||'_provider_check');
 execute format('alter table public.%I add constraint %I check(provider = any(public.pro_integration_provider_ids()))',t,t||'_provider_check');
end loop;end $$;
revoke all on function public.pro_integration_provider_ids() from public,anon,authenticated;
grant execute on function public.pro_integration_provider_ids() to service_role;
notify pgrst,'reload schema';
commit;
