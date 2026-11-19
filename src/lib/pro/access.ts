import type { SupabaseClient } from '@supabase/supabase-js';
export type ProGrant = { status: string; expires_at: string | null } | null;
export type ProAccessProfile = { role: string; is_disabled?: boolean | null; is_provider?: boolean | null } | null;
/**
 * TypeScript mirror of SQL public.pro_entitled (docs/pro/sql/pro-entitled-draft.sql).
 * Input must come from the server database, never editable auth metadata.
 * `professionalBanned` is professionals.is_banned of this account (false when it has no professional row);
 * a banned or suspended professional is refused even with an active grant or the admin role, exactly like SQL.
 * Callers that cannot read the ban flag must refuse access rather than pass false.
 */
export function hasProAccess(profile: ProAccessProfile, grant: ProGrant, professionalBanned: boolean, now = Date.now()) {
  if (!profile || profile.is_disabled || professionalBanned !== false) return false;
  if (profile.role === 'admin') return true;
  if (!profile.is_provider && profile.role !== 'professional') return false;
  return grant?.status === 'active' && (grant.expires_at === null || (Number.isFinite(Date.parse(grant.expires_at)) && Date.parse(grant.expires_at) > now));
}
/** Reads professionals.is_banned for an account: true (banned), false (not banned or no professional row), null (unknown → refuse). */
export async function proBannedFlag(db: Pick<SupabaseClient, 'from'>, userId: string): Promise<boolean | null> {
  const { data, error } = await db.from('professionals').select('is_banned').eq('profile_id', userId).limit(5);
  if (error || !Array.isArray(data)) return null;
  return data.some((row: { is_banned?: boolean | null }) => Boolean(row?.is_banned));
}
