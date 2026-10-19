import { createHash } from "node:crypto";

/** Private audit marker: prior-document reviews must not block a new ID. */
export function identityReviewScope(profileId: string, cedula: string): string {
  return `document:${createHash("sha256").update(JSON.stringify([profileId, cedula])).digest("hex")}`;
}

/** Read only the change marker belonging to the currently saved document. */
export async function identityReviewBoundary(
  db: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  professionalId: string,
  profileId: string,
  cedula: string,
): Promise<string | null> {
  const { data, error } = await db.from("provider_verification_log")
    .select("created_at").eq("professional_id", professionalId).eq("action", "identity_document_changed")
    .eq("reason", identityReviewScope(profileId, cedula)).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data?.created_at ?? null;
}
