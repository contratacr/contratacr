-- 076_clear_revoked_account_identity.sql
-- Identity is account-level. If an admin rejects or revokes a professional
-- verification, the saved ID must be removed from the shared client/pro profile
-- so the person is asked again before creating requests or offering services.

with latest_manual_decision as (
  select distinct on (professional_id)
    professional_id,
    action,
    created_at
  from public.provider_verification_log
  where action in ('rejected', 'reverted_pending')
  order by professional_id, created_at desc
)
update public.profiles p
set
  cedula = null,
  client_identity_status = case
    when l.action = 'rejected' then 'unverified'
    else 'pending'
  end,
  client_identity_verified_at = null,
  client_identity_provider = 'manual'
from public.professionals pr
join latest_manual_decision l on l.professional_id = pr.id
where p.id = pr.profile_id
  and pr.verification_status <> 'verified'
  and p.cedula is not null;

notify pgrst, 'reload schema';
