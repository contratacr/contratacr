// Maps each notification to the role context and dashboard target it belongs to.
// One account can receive client, professional, support, and account notifications
// in the same stream, so routing and per-panel filtering must stay explicit.
export type NotificationLinkInput = {
  type: string;
  data?: { link?: string; booking_id?: string | null; project_id?: string | null } | null;
};

export type NotificationContext = "professional" | "client" | "support" | null;

const PRO_TYPES = new Set([
  "booking_received",
  "booking_cancelled_by_client",
  "booking_completed_by_client",
  "booking_rescheduled",
  "review_received",
  "proposal_accepted",
  "project_proposal_accepted",
  "project_proposal_declined",
  "new_project",
  "project_cancelled",
  "project_deleted",
  "project_completed",
]);

const CLIENT_TYPES = new Set([
  "booking_confirmed",
  "booking_cancelled",
  "booking_completed",
  "booking_update",
  "review_request",
  "proposal_received",
  "proposal_updated",
  "proposal_withdrawn",
  "project_work_done",
]);

export function notificationContext(type: string): NotificationContext {
  if (type === "support_reply") return "support";
  if (PRO_TYPES.has(type)) return "professional";
  if (CLIENT_TYPES.has(type)) return "client";
  return null;
}

export function notificationInMode(type: string, mode: "use" | "offer"): boolean {
  const ctx = notificationContext(type);
  if (ctx === "professional") return mode === "offer";
  if (ctx === "client") return mode === "use";
  return true;
}

export function notificationContextLabel(type: string): string | null {
  const ctx = notificationContext(type);
  if (ctx === "professional") return "Como profesional";
  if (ctx === "client") return "Como cliente";
  if (ctx === "support") return "Soporte";
  return null;
}

function remapClientLink(link: string): string {
  return link
    .replace("/dashboard/cliente?tab=bookings", "/dashboard/profesional?tab=sent_bookings")
    .replace("/dashboard/cliente?tab=projects", "/dashboard/profesional?tab=sent_projects")
    .replace("/dashboard/cliente?tab=saved", "/dashboard/profesional?tab=saved")
    .replace("/dashboard/cliente?tab=notifications", "/dashboard/profesional?tab=notifications")
    .replace("/dashboard/cliente?tab=soporte", "/dashboard/profesional?tab=soporte");
}

function withTargetParams(link: string, data?: NotificationLinkInput["data"]): string {
  if (!data?.booking_id && !data?.project_id) return link;
  const [path, query = ""] = link.split("?");
  const params = new URLSearchParams(query);
  if (data.booking_id) params.set("booking", data.booking_id);
  if (data.project_id) params.set("project", data.project_id);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

function withLocale(link: string, locale: string): string {
  const safeLocale = locale === "en" ? "en" : "es";
  if (link.startsWith("/es/") || link.startsWith("/en/")) {
    return link.replace(/^\/(es|en)\//, `/${safeLocale}/`);
  }
  if (link.startsWith("/")) return `/${safeLocale}${link}`;
  return link;
}

export function notificationHref(n: NotificationLinkInput, _role?: string, locale = "es"): string {
  if (n.data?.link && n.data.link.startsWith("/")) {
    return withLocale(withTargetParams(remapClientLink(n.data.link), n.data), locale);
  }

  let href: string;
  switch (n.type) {
    case "booking_received":
    case "booking_cancelled_by_client":
    case "booking_completed_by_client":
    case "booking_rescheduled":
      href = "/dashboard/profesional?tab=bookings";
      break;

    case "proposal_accepted":
    case "project_proposal_accepted":
    case "project_proposal_declined":
    case "new_project":
    case "project_cancelled":
    case "project_deleted":
    case "project_completed":
      href = "/dashboard/profesional?tab=proposals";
      break;

    case "booking_confirmed":
    case "booking_cancelled":
    case "booking_completed":
    case "booking_update":
    case "review_request":
      href = "/dashboard/profesional?tab=sent_bookings";
      break;

    case "proposal_received":
    case "proposal_updated":
    case "proposal_withdrawn":
    case "project_work_done":
      href = "/dashboard/profesional?tab=sent_projects";
      break;

    case "support_reply":
      href = "/dashboard/profesional?tab=soporte";
      break;

    default:
      href = "/dashboard/profesional?tab=notifications";
  }

  return withLocale(withTargetParams(href, n.data), locale);
}

export function notificationsCenterHref(locale = "es"): string {
  return withLocale("/notificaciones", locale);
}
