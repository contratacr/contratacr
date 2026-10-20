import { createAdminClient } from "@/lib/supabase/admin";
import { LEGAL_VERSION } from "./legal-version";
/** A signup, an app install or an API identity match is never marketing consent. */
export async function hasMarketingConsent(email: string): Promise<boolean | null> {
  const db = createAdminClient();
  // ILIKE is case-insensitive, but email underscores must remain literal.
  const exactEmailPattern = email.replace(/[\\%_]/g, "\\$&");
  const profile = await db.from("profiles").select("id").ilike("email", exactEmailPattern).maybeSingle();
  if (profile.error) return null;
  if (!profile.data) return false;
  const receipt = await db.from("privacy_choices").select("accepted,version").eq("user_id", profile.data.id).eq("purpose", "marketing").order("id", { ascending: false }).limit(1).maybeSingle();
  if (receipt.error) return null; // Fail closed; a temporarily unavailable ledger is not an opt-in.
  return receipt.data?.accepted === true && receipt.data.version === LEGAL_VERSION;
}
