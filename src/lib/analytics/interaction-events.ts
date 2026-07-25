export const INTERACTION_EVENT_TYPES = [
  "profile_view",
  "whatsapp_click",
  "phone_click",
  "availability_view",
  "schedule_slot_selected",
  "favorite_add",
  "favorite_remove",
  "profile_share",
  "external_link_click",
  "service_request_started",
  "service_request_created",
  "project_published",
  "proposal_sent",
  "proposal_accepted",
  "review_created",
] as const;

export type InteractionEventType = (typeof INTERACTION_EVENT_TYPES)[number];

type InteractionEvent = {
  type: InteractionEventType;
  professionalId?: string | null;
  source: string;
  locale?: string;
  categoryId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

export function trackInteraction(event: InteractionEvent) {
  if (typeof window === "undefined") return;
  const body = JSON.stringify(event);
  void fetch("/api/analytics/interaction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => undefined);
}
