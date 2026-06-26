-- 071_sync_account_identity_status.sql
-- Identity verification is account-level: one profile can act as client and
-- professional, but the cedula/status belongs to the person, not to a mode.

update public.profiles p
set
  client_identity_status = case
    when pr.verification_status = 'verified' then 'verified'
    when pr.verification_status = 'rejected' then 'unverified'
    else 'pending'
  end,
  client_identity_verified_at = case
    when pr.verification_status = 'verified' then coalesce(pr.verified_at, pr.verification_updated_at, now())
    else null
  end,
  client_identity_provider = coalesce(pr.verification_provider, p.client_identity_provider)
from public.professionals pr
where pr.profile_id = p.id;

update public.projects pj
set client_identity_status = p.client_identity_status
from public.profiles p
where pj.client_id = p.id
  and pj.status = 'open';

notify pgrst, 'reload schema';
