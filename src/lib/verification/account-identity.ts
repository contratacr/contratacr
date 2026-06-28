import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;
type AccountIdentityStatus = "verified" | "pending" | "unverified";

export async function syncProfessionalVerificationFromAccount(
  admin: AdminClient,
  profileId: string,
  status: AccountIdentityStatus,
  provider: string | null = null
) {
  const { data: pro } = await admin
    .from("professionals")
    .select("id, verification_status")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (!pro) return;

  const now = new Date().toISOString();

  if (status === "verified") {
    if (pro.verification_status === "verified") return;
    await admin
      .from("professionals")
      .update({
        verification_status: "verified",
        verification_method: "account_identity",
        verification_provider: provider,
        verification_reason: null,
        verified_at: now,
        verification_updated_at: now,
        is_verified: true,
      })
      .eq("id", pro.id);
    return;
  }

  if (pro.verification_status === "verified") {
    await admin
      .from("professionals")
      .update({
        verification_status: status === "pending" ? "pending" : "rejected",
        verification_method: "account_identity",
        verification_provider: provider,
        verification_reason: status === "unverified" ? "Identidad de cuenta sin verificar." : null,
        verified_at: null,
        verification_updated_at: now,
        is_verified: false,
      })
      .eq("id", pro.id);
  }
}
