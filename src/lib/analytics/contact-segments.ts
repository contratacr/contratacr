/** Classify the context of an interaction, never the recipient's account role.
 * An employer can also sell services. Unknown history stays unknown. */
export const CONTACT_EVENT_TYPES = ["whatsapp_click", "phone_click", "email_click", "project_lead_whatsapp", "project_lead_phone"] as const;
export type ContactSegment = "services" | "jobs" | "projects" | "unknown";
export type ContactEvent = {
  event_type: string; source?: string | null; metadata?: Record<string, unknown> | null;
  created_at: string; professional_id?: string | null; viewer_user_id?: string | null; visitor_hash?: string | null;
};
export function contactSegment(event: Pick<ContactEvent, "event_type" | "source" | "metadata">): ContactSegment {
  const meta = event.metadata ?? {};
  if (event.source === "jobs" || meta.jobId || meta.job_id || meta.intent === "job" || event.event_type === "job_view" || event.event_type === "job_application_sent") return "jobs";
  if (event.source === "project" || meta.projectId || meta.project_id || event.event_type.startsWith("project_lead_")) return "projects";
  if (meta.product === true || (meta.offer_type && meta.offer_type !== "service_offer")) return "unknown";
  if (event.source === "offers") return meta.offer_type === "service_offer" ? "services" : "unknown";
  if (["search", "profile", "profile_service", "favorites"].includes(event.source ?? "")) return "services";
  return "unknown";
}
export function isContactClick(event: Pick<ContactEvent, "event_type">) {
  return (CONTACT_EVENT_TYPES as readonly string[]).includes(event.event_type);
}
export type SegmentCount = { clicks: number; uniquePairs: number; recipients: number };
export type ContactBreakdown = Record<ContactSegment, SegmentCount>;
export function summarizeContacts(events: ContactEvent[]): ContactBreakdown {
  const segments = ["services", "jobs", "projects", "unknown"] as const;
  return Object.fromEntries(segments.map(segment => {
    const rows = events.filter(row => isContactClick(row) && contactSegment(row) === segment);
    const pairs = new Set(rows.flatMap(row => {
      const actor = row.viewer_user_id ? `account:${row.viewer_user_id}` : row.visitor_hash ? `visitor:${row.visitor_hash}` : null;
      return actor && row.professional_id ? [JSON.stringify([actor, row.professional_id])] : [];
    }));
    return [segment, { clicks: rows.length, uniquePairs: pairs.size, recipients: new Set(rows.map(r => r.professional_id).filter(Boolean)).size }];
  })) as ContactBreakdown;
}
