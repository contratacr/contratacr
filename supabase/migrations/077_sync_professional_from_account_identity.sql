-- 077_sync_professional_from_account_identity.sql
-- Account identity is shared by client/professional modes. If a user verified as
-- client and later has a professional profile, the professional identity badge
-- should use that same account verification.

update public.professionals pr
set
  verification_status = 'verified',
  verification_method = coalesce(pr.verification_method, 'account_identity'),
  verification_provider = coalesce(p.client_identity_provider, pr.verification_provider),
  verification_reason = null,
  verified_at = coalesce(pr.verified_at, p.client_identity_verified_at, now()),
  verification_updated_at = now(),
  is_verified = true
from public.profiles p
where p.id = pr.profile_id
  and p.client_identity_status = 'verified'
  and p.cedula is not null
  and pr.verification_status <> 'verified';

notify pgrst, 'reload schema';
