import type { createAdminClient } from "@/lib/supabase/admin";
import { cleanId } from "@/lib/cedula";

/** An explicit admin correction takes precedence over a later automatic lookup.
 * Scope new corrections to the identity document and the exact saved name, so a
 * different document or a subsequent name edit can still be verified normally.
 * Older audit rows have no document snapshot; retain those corrections too.
 */
export async function verifiedProfileName(
  db: ReturnType<typeof createAdminClient>,
  profileId: string,
  currentName: string,
  cedula: string,
  officialName: string,
): Promise<string> {
  if (!currentName || currentName === officialName) return officialName;
  const { data: account, error: accountError } = await db.auth.admin.getUserById(profileId);
  if (accountError || !account.user) throw new Error("No se pudo comprobar la corrección administrativa del nombre.");
  // app_metadata can only be written by trusted server/admin code. Unlike the
  // audit history, this marker is not removed by operational retention.
  const saved = account.user.app_metadata?.admin_profile_name;
  if (saved) return saved.name === currentName && cleanId(String(saved.cedula ?? "")) === cleanId(cedula) ? currentName : officialName;
  const { data, error } = await db.from("user_action_audit")
    .select("after_data, metadata")
    .eq("entity_owner_user_id", profileId)
    .eq("action", "admin_edit_user_data")
    .eq("actor_role", "admin")
    .not("after_data->>nombre", "is", null)
    .order("created_at", { ascending: false })
    .limit(1).maybeSingle();
  // A failed history lookup must never undo a potential human correction.
  if (error) throw new Error("No se pudo comprobar la corrección administrativa del nombre.");
  if (data?.after_data?.nombre !== currentName) return officialName;
  const document = data.metadata?.name_cedula;
  if (document !== undefined && cleanId(String(document ?? "")) !== cleanId(cedula)) return officialName;
  const { error: saveError } = await db.auth.admin.updateUserById(profileId, {
    app_metadata: { ...account.user.app_metadata, admin_profile_name: { name: currentName, cedula: cleanId(cedula) } },
  });
  if (saveError) throw new Error("No se pudo conservar la corrección administrativa del nombre.");
  return currentName;
}
