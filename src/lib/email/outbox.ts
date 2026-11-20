import { hasMarketingConsent } from "@/lib/privacy/marketing-consent";
import { hasVerificationDocuments } from "@/lib/verification/documents";
import { queuedCampaignEligible, queuedActivityEligible } from "./revalidate-campaign";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EmailResult } from "./send";
import type { NivelDeCorreo } from "./cuota";

export type EmailPurpose = "security" | "support" | "activity" | "campaign" | "verification";
type Envelope = {
  id: string; status: string; attempts: number; purpose: EmailPurpose; recipient: string; subject: string;
  user_id: string | null; event_key: string; payload: Record<string, unknown> | null; attempt_token: string; campaign: string | null;
};
type RecordedEmail = {
  recipient: string; subject: string; payload: Record<string, unknown>; purpose: EmailPurpose;
  level: NivelDeCorreo; eventKey?: string; campaign?: string; professionalId?: string; verificationSequence?: number;
};
const queued: EmailResult = { ok: false, status: "queued", detail: "Correo registrado y pendiente de envío" };

export async function deliverRecordedEmail(input: RecordedEmail): Promise<EmailResult> {
  const db = createAdminClient();
  const recipient = input.recipient.trim().toLowerCase();
  // Exact identical envelopes are the same event. Event producers with repeatable
  // copy supply a domain key (ticket, project, message...) instead of a time bucket.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || /\.(test|invalid|example|localhost|local)$/.test(recipient))
    return { ok: false, status: "skipped", detail: "Recipient is not deliverable" };
  const key = input.eventKey ?? createHash("sha256").update(JSON.stringify([recipient, input.purpose, input.payload])).digest("hex");
  const { data: id, error } = await db.rpc("enqueue_email_delivery", {
    p_key: key, p_recipient: recipient, p_subject: input.subject, p_purpose: input.purpose,
    p_level: input.level, p_payload: input.payload, p_campaign: input.campaign ?? null,
    p_professional: input.professionalId ?? null, p_sequence: input.verificationSequence ?? null,
  });
  if (error || !id) return { ok: false, status: "skipped", detail: "No se pudo reservar el envío o ya no corresponde" };
  return processEmailDelivery(id);
}

/** Only explicit non-acceptance is retryable. A lost response is held for the
 * provider webhook; blind retries after Brevo's 15-minute window can duplicate. */
export function providerOutcome(status: number, code?: string): "retry" | "failed" | "uncertain" {
  if (status === 429 || code === "not_enough_credits") return "retry";
  if (status >= 500 || code === "duplicate_parameter") return "uncertain";
  return "failed";
}

export async function processEmailDelivery(id: string): Promise<EmailResult> {
  if (!process.env.BREVO_API_KEY) return queued;
  const db = createAdminClient();
  const { data, error } = await db.rpc("claim_email_delivery", { p_id: id });
  if (error) return { ok: false, status: "failed", detail: "No se pudo reclamar el envío" };
  if (!data) {
    const { data: receipt, error: readError } = await db.from("email_deliveries").select("status").eq("id", id).single();
    if (readError) return { ok: false, status: "failed", detail: "No se pudo consultar el envío" };
    if (receipt.status === "accepted") return { ok: true, status: "sent", detail: "already_accepted" };
    if (receipt.status === "uncertain") return { ok: false, status: "uncertain", detail: "Esperando confirmación del proveedor" };
    if (["failed", "cancelled"].includes(receipt.status)) return { ok: false, status: "skipped", detail: "Envío detenido; revisa su registro" };
    return queued;
  }
  const mail = data as Envelope;
  const finish = async (outcome: string, provider: string | null = null, detail: string | null = null) => {
    const result = await db.rpc("finish_email_delivery", { p_id: mail.id, p_token: mail.attempt_token,
      p_outcome: outcome, p_provider: provider, p_error: detail });
    if (result.error || result.data !== true) throw new Error("Delivery receipt not confirmed");
  };
  try {
    if (mail.purpose === "campaign") {
      const consent = await hasMarketingConsent(mail.recipient);
      if (consent !== true) {
        await finish(consent === false ? "cancelled" : "retry", null, consent === false ? "No affirmative marketing permission" : "Consent ledger unavailable");
        return consent === false ? { ok: false, status: "skipped", detail: "Sin autorización promocional" } : queued;
      }
    }
    if (mail.purpose === "campaign" && mail.campaign) {
      const eligible = await queuedCampaignEligible(mail.recipient, mail.campaign);
      if (eligible !== true) {
        await finish(eligible === false ? "cancelled" : "retry", null, eligible === false ? "Campaign no longer eligible" : "Eligibility unavailable");
        return eligible === false ? { ok: false, status: "skipped", detail: "La cuenta ya no es elegible" } : queued;
      }
    }
    if (mail.purpose === "verification") {
      const documents = mail.user_id ? await hasVerificationDocuments(mail.user_id) : null;
      if (documents !== false) {
        await finish(documents ? "cancelled" : "retry", null, documents ? "Documents received" : "Review unavailable");
        return documents ? { ok: false, status: "skipped", detail: "Documentos recibidos; recordatorio detenido" } : queued;
      }
    }
    if (mail.purpose === "activity") {
      const eligible = await queuedActivityEligible(mail.event_key);
      if (eligible !== true) {
        await finish(eligible === false ? "cancelled" : "retry", null, eligible === false ? "Activity no longer relevant" : "Eligibility unavailable");
        return eligible === false ? { ok: false, status: "skipped", detail: "El aviso ya no corresponde" } : queued;
      }
    }
    if (!mail.payload) throw new Error("Missing reserved envelope");
    const tags = Array.isArray(mail.payload.tags) ? mail.payload.tags : [];
    const body = { ...mail.payload, tags: [...tags, `ccr-mail-${mail.id}`],
      headers: { ...(mail.payload.headers as Record<string, string> ?? {}), idempotencyKey: mail.id } };
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST", headers: { "api-key": process.env.BREVO_API_KEY!, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
    });
    const result = await response.json().catch(() => ({})) as { messageId?: string; code?: string };
    if (response.ok) {
      if (!result.messageId) { await finish("uncertain", null, "Provider accepted without message ID"); return { ok: false, status: "uncertain", detail: "Esperando confirmación del proveedor" }; }
      await finish("accepted", result.messageId);
      return { ok: true, status: "sent", detail: null };
    }
    const outcome = providerOutcome(response.status, result.code);
    await finish(outcome, null, `HTTP ${response.status}: ${result.code ?? "provider_error"}`);
    return outcome === "retry" && mail.attempts < 4 ? queued : { ok: false, status: outcome === "uncertain" ? "uncertain" : "failed", detail: `Proveedor HTTP ${response.status}` };
  } catch {
    // Includes DB failure AFTER provider acceptance. Never return a false success.
    await finish("uncertain", null, "Dispatch or receipt interrupted; reconcile provider").catch(() => undefined);
    return { ok: false, status: "uncertain", detail: "Esperando confirmación del proveedor" };
  }
}

export async function drainEmailDeliveries(limit = 40) {
  const db = createAdminClient();
  // Reap expired envelopes even if their next attempt is scheduled much later.
  const { error: expireError } = await db.from("email_deliveries").update({ status: "cancelled", payload: null, last_error: "Expired" })
    .in("status", ["queued", "retry"]).lt("expires_at", new Date().toISOString());
  if (expireError) throw expireError;
  // Crashed sends are not safe retries. Webhooks can reconcile them later.
  const { error: reapError } = await db.from("email_deliveries").update({ status: "uncertain", payload: null, last_error: "Worker interrupted; reconcile provider receipt" })
    .eq("status", "sending").lt("lease_until", new Date().toISOString());
  if (reapError) throw reapError;
  const totals = { sent: 0, queued: 0, stopped: 0, uncertain: 0 };
  // Priority order, not PostgREST's alphabetic sort order.
  for (const purpose of ["security", "support", "activity", "verification", "campaign"]) {
    const remaining = Math.max(0, limit - Object.values(totals).reduce((a,b) => a+b, 0));
    if (!remaining) break;
    const { data, error } = await db.from("email_deliveries").select("id").eq("purpose", purpose)
      .in("status", ["queued", "retry"]).lte("available_at", new Date().toISOString()).order("created_at").limit(remaining);
    if (error) throw error;
    for (const row of data ?? []) {
      const result = await processEmailDelivery(row.id);
      if (result.ok) totals.sent++;
      else if (result.status === "queued") totals.queued++;
      else if (result.status === "uncertain") totals.uncertain++;
      else totals.stopped++;
    }
  }
  return totals;
}
