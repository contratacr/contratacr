export type ProGrant = { status: string; expires_at: string | null } | null;
/** Input must come from the server database, never editable auth metadata. */
export function hasProAccess(profile: { role: string; is_disabled?: boolean | null } | null, grant: ProGrant, now = Date.now()) {
  if (!profile || profile.is_disabled) return false;
  if (profile.role === 'admin') return true;
  return grant?.status === 'active' && (grant.expires_at === null || (Number.isFinite(Date.parse(grant.expires_at)) && Date.parse(grant.expires_at) > now));
}
