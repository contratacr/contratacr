// Maps a notification to the page it should open when clicked, and tells you
// which ROLE context it belongs to so the UI can tag it ("Como profesional" /
// "Como cliente"). One account receives BOTH professional and client
// notifications in a single stream; the context tag + role-aware routing keep
// them unambiguous.
export type NotificationLinkInput = {
  type: string;
  data?: { link?: string } | null;
};

export type NotificationContext = "professional" | "client" | "support" | null;

// Notification types raised while the user is acting as a PROFESSIONAL.
const PRO_TYPES = new Set([
  "booking_received",   // a client requested your service
  "proposal_accepted",  // a client accepted your proposal
  "new_project",        // a new project you can bid on
]);

// Notification types raised about the user's own activity AS A CLIENT.
const CLIENT_TYPES = new Set([
  "booking_confirmed",
  "booking_cancelled",
  "booking_rescheduled",
  "booking_completed",
  "review_request",
  "proposal_received",  // a professional sent a proposal to your project
]);

export function notificationContext(type: string): NotificationContext {
  if (type === "support_reply") return "support";
  if (PRO_TYPES.has(type)) return "professional";
  if (CLIENT_TYPES.has(type)) return "client";
  return null;
}

/** Short tag shown on each notification so the role context is always obvious. */
export function notificationContextLabel(type: string): string | null {
  const ctx = notificationContext(type);
  if (ctx === "professional") return "Como profesional";
  if (ctx === "client") return "Como cliente";
  if (ctx === "support") return "Soporte";
  return null;
}

// Everyone uses the ONE unified panel; the "Usar servicios" sections live under
// their own tabs there. Remap any legacy client-panel deep link into it.
function remapClientLink(link: string): string {
  return link
    .replace("/dashboard/cliente?tab=bookings", "/dashboard/profesional?tab=sent_bookings")
    .replace("/dashboard/cliente?tab=projects", "/dashboard/profesional?tab=sent_projects")
    .replace("/dashboard/cliente?tab=saved", "/dashboard/profesional?tab=saved")
    .replace("/dashboard/cliente?tab=notifications", "/dashboard/profesional?tab=notifications")
    .replace("/dashboard/cliente?tab=soporte", "/dashboard/profesional?tab=soporte");
}

// `role` is accepted for signature compatibility but no longer needed: there is a
// single panel and each tab implies its own mode.
export function notificationHref(n: NotificationLinkInput, _role?: string): string {
  // An explicit link stored at creation time wins — but only if it's a well-formed
  // internal path. Anything stale/garbage falls through to the type-based routing
  // below (always a live dashboard tab), so a click never dead-ends.
  if (n.data?.link && n.data.link.startsWith("/")) {
    return remapClientLink(n.data.link);
  }

  switch (n.type) {
    // Offer-capability context (offer-only tabs → the panel opens in offer mode)
    case "booking_received":
      return "/es/dashboard/profesional?tab=bookings";
    case "proposal_accepted":
      return "/es/dashboard/profesional?tab=proposals";
    case "new_project":
      return "/es/dashboard/profesional?tab=proposals";

    // Seek-capability context (use-only tabs → the panel opens in use mode)
    case "booking_confirmed":
    case "booking_cancelled":
    case "booking_rescheduled":
    case "booking_completed":
    case "review_request":
      return "/es/dashboard/profesional?tab=sent_bookings";
    case "proposal_received":
      return "/es/dashboard/profesional?tab=sent_projects";

    default:
      return "/es/dashboard/profesional?tab=notifications";
  }
}
