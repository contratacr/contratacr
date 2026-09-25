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
  // El correo es un CONTACTO; un clic a Instagram no. Iban con el mismo tipo,
  // así que la tasa de contacto del panel contaba clics a redes sociales.
  "email_click",
  // Lo que el app hace HOY y no se medía: la cotización, el mensaje interno,
  // el profesional que escribe a un proyecto del tablero, la verificación
  // aprobada y el clic que llega desde un correo de campaña.
  "quote_created",
  "quote_accepted",
  "quote_declined",
  "internal_message_sent",
  "project_lead_whatsapp",
  "identity_verified",
  "campaign_click",
  "service_request_started",
  "service_request_created",
  "project_published",
  "proposal_sent",
  "proposal_accepted",
  "review_created",
  "search_performed",
  "job_view",
  "job_application_sent",
  "offer_view",
  "assistant_question",
  "page_freeze",
  "contact_gate_shown",
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
