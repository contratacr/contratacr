import type { createAdminClient } from "@/lib/supabase/admin";
import type { EmailResult } from "@/lib/email/send";
import { isInternalCampaignRecipient, normalizeCampaignEmail } from "@/lib/email/campaign-policy";

type Admin = ReturnType<typeof createAdminClient>;

export async function deliverCampaignOnce(
  admin: Admin, campaign: string, recipient: string, send: () => Promise<EmailResult>,
  { coordinated = false }: { coordinated?: boolean } = {},
): Promise<"sent" | "skipped" | "uncertain" | "already_reserved" | "queued"> {
  const email = normalizeCampaignEmail(recipient);
  if (isInternalCampaignRecipient(email)) return "skipped";
  const { data: claimed, error: reserveError } = coordinated
    ? await admin.rpc("claim_outreach_email", { p_campaign: campaign, p_email: email })
    : { ...(await admin.from("admin_campaign_sends").insert({ campana: campaign, email, status: "sending" })), data: true };
  if (reserveError?.code === "23505") return "already_reserved";
  if (reserveError) throw reserveError; // Never contact the provider without a receipt.
  if (!claimed) return "already_reserved";
  let result: EmailResult;
  try { result = await send(); }
  catch { result = { ok: false, status: "failed", detail: "Uncertain provider result" }; }
  if (result.status === "queued") return "queued";
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
