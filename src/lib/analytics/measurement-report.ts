/** Reporting only: never creates tracking, infers consent, or joins messages to ads. */
export type ConversationReceipt = { id: string; client_id: string; professional_profile_id: string; project_id: string | null };
export type MessageReceipt = { id: string; conversation_id: string; sender_id: string; created_at: string };
export type ChoiceReceipt = { id: string | number; user_id: string; purpose: string; accepted: boolean; version: string; recorded_at: string };
export type ConversionReceipt = { event_id: string; action: string; actor_hash: string; created_at: string; attribution: Record<string, unknown> | null; status: string; delivery_mode: string | null };
export type MeasurementReport = {
  period: "week" | "all";
  operations: { conversations: number; clientMessages: number; projectConversations: number } | null;
  consent: { analytics: { accepted: number; declined: number }; advertising: { accepted: number; declined: number } } | null;
  campaigns: { campaign: string; signals: number; received: number; pending: number; other: number; tests: number }[] | null;
};
const DAY = 86400000;
export function summarizeOperationalContacts(conversations: ConversationReceipt[], messages: MessageReceipt[], excluded: Set<string>, since: number, now: number) {
  const eligible = new Map(conversations.filter(c => c.client_id !== c.professional_profile_id && !excluded.has(c.client_id) && !excluded.has(c.professional_profile_id)).map(c => [c.id, c]));
  const threads = new Set<string>(), projectThreads = new Set<string>(), receipts = new Set<string>();
  for (const message of messages) {
    const thread = eligible.get(message.conversation_id), time = Date.parse(message.created_at);
    if (!thread || message.sender_id !== thread.client_id || !Number.isFinite(time) || time < since || time > now || receipts.has(message.id)) continue;
    receipts.add(message.id);
    threads.add(thread.id);
    if (thread.project_id) projectThreads.add(thread.id);
  }
  return { conversations: threads.size, clientMessages: receipts.size, projectConversations: projectThreads.size };
}
/** Ledger receipts are account-level explicit choices, NOT device permission or visitor coverage.
 * The ledger deduplicates identical decisions across channels, so splitting by channel would mislead. */
export function summarizeConsentReceipts(rows: ChoiceReceipt[], excluded: Set<string>, now: number, version: string) {
  const latest = new Map<string, ChoiceReceipt>();
  for (const row of rows) {
    if (!["analytics", "advertising"].includes(row.purpose) || excluded.has(row.user_id)) continue;
    const time = Date.parse(row.recorded_at);
    if (!Number.isFinite(time) || time > now) continue;
    const key = JSON.stringify([row.user_id, row.purpose]);
    const previous = latest.get(key);
    if (!previous || BigInt(row.id) > BigInt(previous.id)) latest.set(key, row);
  }
  const result = { analytics: { accepted: 0, declined: 0 }, advertising: { accepted: 0, declined: 0 } };
  for (const row of latest.values()) {
    if (row.version !== version || now - Date.parse(row.recorded_at) >= 180 * DAY) continue;
    result[row.purpose as "analytics" | "advertising"][row.accepted ? "accepted" : "declined"]++;
  }
  return result;
}
/** A server acknowledgement is delivery, never proof of attribution by Ads Manager. */
export function summarizeContactCampaigns(rows: ConversionReceipt[], excludedHashes: Set<string>, since: number, now: number) {
  const groups = new Map<string, NonNullable<MeasurementReport["campaigns"]>[number]>(), seen = new Set<string>();
  for (const row of rows) {
    const time = Date.parse(row.created_at);
    if (row.action !== "service_contact" || excludedHashes.has(row.actor_hash) || !Number.isFinite(time) || time < since || time > now || seen.has(row.event_id)) continue;
    seen.add(row.event_id);
    const raw = row.attribution?.campaign;
    const source = row.attribution?.source;
    const campaign = typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 120)
      : typeof source === "string" && source.trim() ? `Sin campaña identificada · ${source.trim().slice(0, 80)}` : "Origen desconocido";
    const group = groups.get(campaign) ?? { campaign, signals: 0, received: 0, pending: 0, other: 0, tests: 0 };
    if (row.delivery_mode === "test") group.tests++;
    else {
      group.signals++;
      if (row.status === "sent" && row.delivery_mode === "production") group.received++;
      else if (["pending", "sending"].includes(row.status)) group.pending++;
      else group.other++;
    }
    groups.set(campaign, group);
  }
  return [...groups.values()].sort((a, b) => b.signals - a.signals || a.campaign.localeCompare(b.campaign));
}
