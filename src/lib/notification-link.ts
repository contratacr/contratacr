// Maps each notification to the role context and dashboard target it belongs to.
// One account can receive client, professional, support, and account notifications
// in the same stream, so routing and per-panel filtering must stay explicit.
export type NotificationLinkInput = {
  type: string;
  data?: {
    link?: string;
    booking_id?: string | null;
    project_id?: string | null;
    activity_id?: string | null;
    job_id?: string | null;
    application_id?: string | null;
    professional_id?: string | null;
    activity_type?: string | null;
    content_id?: string | null;
  } | null;
};

export type NotificationContext = "professional" | "client" | "support" | null;

// Solo tipos que el app genera hoy. `new_project` le llega al PROFESIONAL de
// la categoria; `project_cancelled` (autocierre) y las respuestas de soporte, a
// quien publico. Lo de citas, propuestas, postulaciones y seguir se retiro.
const PRO_TYPES = new Set([
  "review_received",
  "new_project",
]);

const CLIENT_TYPES = new Set([
  "project_cancelled",
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
  const [base, hash = ""] = link.split("#");
  const [path, query = ""] = base.split("?");
  const params = new URLSearchParams(query);
  if (data.booking_id) params.set("booking", data.booking_id);
  if (data.project_id) params.set("project", data.project_id);
  const qs = params.toString();
  const target = qs ? `${path}?${qs}` : path;
  return hash ? `${target}#${hash}` : target;
}

function withLocale(link: string, locale: string): string {
  const safeLocale = locale === "en" ? "en" : "es";
  if (link.startsWith("/es/") || link.startsWith("/en/")) {
    return link.replace(/^\/(es|en)\//, `/${safeLocale}/`);
  }
  if (link.startsWith("/")) return `/${safeLocale}${link}`;
  return link;
}

function withReviewTarget(link: string): string {
  const [base, hash = ""] = link.split("#");
  const [path, query = ""] = base.split("?");
  const params = new URLSearchParams(query);
  params.set("tab", "resenas");
  return `${path}?${params.toString()}#${hash || "resenas"}`;
}

export function notificationHref(n: NotificationLinkInput, _role?: string, locale = "es"): string {
  if (n.data?.link && n.data.link.startsWith("/")) {
    const link = n.type === "review_received" ? withReviewTarget(n.data.link) : n.data.link;
    return withLocale(withTargetParams(remapClientLink(link), n.data), locale);
  }

  let href: string;
  switch (n.type) {
    case "new_project":
    case "project_cancelled":
      href = "/proyectos";
      break;

    case "support_reply":
      href = "/dashboard/profesional?tab=soporte";
      break;

    default:
      href = "/dashboard/profesional?tab=notifications";
  }

  return withLocale(withTargetParams(href, n.data), locale);
}

const NON_NAVIGABLE_TYPES = new Set([
  "suggestion_rejected",
]);

export function notificationActionHref(n: NotificationLinkInput, role?: string, locale = "es"): string | null {
  if (NON_NAVIGABLE_TYPES.has(n.type)) return null;
  return notificationHref(n, role, locale);
}

export function notificationsCenterHref(locale = "es"): string {
  return withLocale("/notificaciones", locale);
}
