import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { privacyChoiceVersion } from "@/lib/privacy/legal-version";
import { readAllAdminRows, readAdminRowsByIds } from "./read-all-rows";
import { summarizeContactCampaigns, summarizeConsentReceipts, summarizeOperationalContacts, type MeasurementReport } from "@/lib/analytics/measurement-report";

/** Called only after the existing MFA admin gate. No message content, contact details,
 * ad payloads, or account identifiers are returned to the browser. Missing data stays null. */
export async function getAdminMeasurement(period: "week" | "all"): Promise<MeasurementReport> {
  const result: MeasurementReport = { period, operations: null, consent: null, campaigns: null };
  const db = createAdminClient(), now = Date.now();
  const since = period === "week" ? now - 7 * 86400000 : 0;
  const date = new Date(since).toISOString(), until = new Date(now).toISOString();
  const { data: profiles, error } = await readAllAdminRows((from, to) => db.from("profiles").select("id,role").order("id").range(from, to)).catch(() => ({ data: null, error: true }));
  if (error) return result; // Cannot reliably exclude staff.
  const excluded = new Set((profiles ?? []).filter(p => p.role === "admin").map(p => p.id));
  const excludedHashes = new Set([...excluded].map(id => createHash("sha256").update(id).digest("hex")));
  await Promise.all([
    (async () => {
      try {
        const messages = await readAllAdminRows((from, to) => db.from("direct_messages").select("id,conversation_id,sender_id,created_at").gte("created_at", date).lte("created_at", until).order("id").range(from, to));
        if (messages.error) return;
        const conversations = await readAdminRowsByIds((messages.data ?? []).map(m => m.conversation_id), (ids, from, to) => db.from("direct_conversations").select("id,client_id,professional_profile_id,project_id").in("id", ids).order("id").range(from, to));
        if (conversations.error) return;
        result.operations = summarizeOperationalContacts(conversations.data ?? [], messages.data ?? [], excluded, since, now);
      } catch { /* Unknown is not zero. */ }
    })(),
    (async () => {
      try {
        const rows = await readAllAdminRows((from, to) => db.from("privacy_choices").select("id,user_id,purpose,accepted,version,recorded_at").in("purpose", ["analytics", "advertising"]).gte("recorded_at", new Date(now - 180 * 86400000).toISOString()).lte("recorded_at", until).order("id").range(from, to));
        if (!rows.error) result.consent = summarizeConsentReceipts(rows.data ?? [], excluded, now, privacyChoiceVersion("analytics"));
      } catch { /* Unknown is not zero. */ }
    })(),
    (async () => {
      try {
        const rows = await readAllAdminRows((from, to) => db.from("growth_conversion_events").select("event_id,action,actor_hash,created_at,attribution,status,delivery_mode").eq("is_baseline", false).eq("action", "service_contact").gte("created_at", date).lte("created_at", until).order("event_id").range(from, to));
        if (!rows.error) result.campaigns = summarizeContactCampaigns(rows.data ?? [], excludedHashes, since, now);
      } catch { /* Unknown is not zero. */ }
    })(),
  ]);
  return result;
}
