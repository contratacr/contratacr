import type { createAdminClient } from "@/lib/supabase/admin";
import type { EmailResult } from "@/lib/email/send";
import { normalizeCampaignEmail } from "@/lib/email/campaign-policy";

type Admin = ReturnType<typeof createAdminClient>;

export async function deliverCampaignOnce(
  admin: Admin, campaign: string, recipient: string, send: () => Promise<EmailResult>,
): Promise<"sent" | "skipped" | "uncertain" | "already_reserved"> {
  const email = normalizeCampaignEmail(recipient);
  const { error: reserveError } = await admin.from("admin_campaign_sends")
    .insert({ campana: campaign, email, status: "sending" });
  if (reserveError?.code === "23505") return "already_reserved";
  if (reserveError) throw reserveError; // Never contact the provider without a receipt.
  let result: EmailResult;
  try { result = await send(); }
  catch { result = { ok: false, status: "failed", detail: "Uncertain provider result" }; }
  if (result.status === "skipped") {
    // A local skip (missing configuration/quota/recipient) never contacts Brevo.
    const { error } = await admin.from("admin_campaign_sends").delete()
      .eq("campana", campaign).eq("email", email).eq("status", "sending");
    if (error) throw error;
    return "skipped";
  }
  const status = result.ok ? "sent" : "uncertain";
  const { error } = await admin.from("admin_campaign_sends").update({ status })
    .eq("campana", campaign).eq("email", email).eq("status", "sending");
  if (error) throw error; // Keep the reservation if recording confirmation fails.
  return status;
}
