import type { createAdminClient } from "@/lib/supabase/admin";

/** A successful official lookup always supplies the complete identity name.
 * Display-name shortening belongs to public presentation, never identity data.
 */
export async function verifiedProfileName(
  _db: ReturnType<typeof createAdminClient>,
  _profileId: string,
  _currentName: string,
  _cedula: string,
  officialName: string,
): Promise<string> {
  return officialName;
}

/** Explicit admin approval also adopts a name returned by the official API.
 * A missing/unavailable lookup does not prevent a human document approval.
 */
export async function syncOfficialProfileName(
  db: ReturnType<typeof createAdminClient>, profileId: string,
): Promise<void> {
  const { data: profile, error: readError } = await db.from("profiles").select("full_name, cedula").eq("id", profileId).maybeSingle();
  if (readError) throw readError;
  if (!profile?.cedula) return;
  const { getIdentityVerifier } = await import("./identity-verifier");
  const result = await getIdentityVerifier().lookup(profile.cedula);
  if (!result.found || result.unavailable || !result.fullName || result.fullName === profile.full_name) return;
  const { data: saved, error } = await db.from("profiles").update({ full_name: result.fullName })
    .eq("id", profileId).eq("cedula", profile.cedula).select("id").maybeSingle();
  if (error) throw error;
  if (!saved) throw new Error("La identificación cambió. Recarga antes de verificar.");
  const { data: account, error: accountError } = await db.auth.admin.getUserById(profileId);
  if (accountError) throw accountError;
  if (account.user) {
    const { error: authError } = await db.auth.admin.updateUserById(profileId, { user_metadata: { ...account.user.user_metadata, full_name: result.fullName } });
    if (authError) throw authError;
  }
}
