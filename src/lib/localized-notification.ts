export const TRANSLATED_NOTIFICATION_TYPES = new Set([
  "booking_received",
  "booking_confirmed",
  "booking_completed",
  "booking_completed_by_client",
  "booking_cancelled",
  "booking_cancelled_by_client",
  "booking_rescheduled",
  "booking_update",
  "review_request",
  "review_received",
  "proposal_received",
  "proposal_updated",
  "proposal_withdrawn",
  "proposal_accepted",
  "project_proposal_accepted",
  "project_proposal_declined",
  "new_project",
  "project_work_done",
  "project_completed",
  "project_cancelled",
  "project_deleted",
  "support_reply",
  "verification",
  "verification_appeal_received",
  "suggestion_approved",
  "suggestion_rejected",
]);

type NotificationCopyInput = {
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown> | null;
};

function normalizeLegacyNotificationText(value: string): string {
  const legacyMarkerCount = (text: string) => {
    const markerCodePoints = new Set([195, 194, 226]);
    return Array.from(text).reduce(
      (count, char) => count + (markerCodePoints.has(char.codePointAt(0) ?? -1) ? 1 : 0),
      0,
    );
  };
  if (legacyMarkerCount(value) === 0) return value;
  const bytes: number[] = [];
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code > 255) return value;
    bytes.push(code);
  }
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
    return legacyMarkerCount(decoded) < legacyMarkerCount(value) ? decoded : value;
  } catch {
    return value;
  }
}

function stringData(data: Record<string, unknown> | null | undefined, key: string): string {
  const value = data?.[key];
  return typeof value === "string" ? normalizeLegacyNotificationText(value).trim() : "";
}

export function localizedNotificationCopy(notification: NotificationCopyInput, locale: string) {
  const en = locale === "en";
  const data = notification.data;

  if (notification.type === "professional_follow") {
    const name = stringData(data, "follower_name") || (en ? "Someone" : "Alguien");
    return {
      title: en ? "New follower" : "Nuevo seguidor",
      message: en
        ? `${name} started following your professional profile.`
        : `${name} empezó a seguir tu perfil profesional.`,
    };
  }

  if (notification.type === "followed_professional_activity") {
    const name = stringData(data, "actor_name") || (en ? "A professional you follow" : "Un profesional que sigues");
    const content = stringData(data, "content_title");
    const activity = stringData(data, "activity_type");
    const action = en
      ? ({ success_case: "published a new success story", service: "added a new service", offer: "published a new offer", job: "published a new job opportunity" } as Record<string, string>)[activity] || "published an update"
      : ({ success_case: "publicó un nuevo caso de éxito", service: "agregó un nuevo servicio", offer: "publicó una nueva oferta", job: "publicó una nueva oportunidad de empleo" } as Record<string, string>)[activity] || "publicó una novedad";
    return {
      title: en ? `New post from ${name}` : `Nueva publicación de ${name}`,
      message: `${name} ${action}${content ? `: ${content}` : ""}.`,
    };
  }

  if (notification.type === "job_application") {
    const applicant = stringData(data, "applicant_name") || (en ? "Someone" : "Alguien");
    const job = stringData(data, "job_title") || (en ? "your job" : "tu empleo");
    return {
      title: en ? "New application" : "Nueva postulación",
      message: en ? `${applicant} applied to ${job}.` : `${applicant} se postuló a ${job}.`,
    };
  }

  if (notification.type === "job_application_status") {
    const job = stringData(data, "job_title") || (en ? "this job" : "este empleo");
    const status = stringData(data, "status");
    const statusLabel = en
      ? ({ reviewing: "is under review", shortlisted: "was shortlisted", rejected: "was not selected", hired: "was accepted", withdrawn: "was withdrawn" } as Record<string, string>)[status] || "was updated"
      : ({ reviewing: "está en revisión", shortlisted: "fue preseleccionada", rejected: "no fue seleccionada", hired: "fue aceptada", withdrawn: "fue retirada" } as Record<string, string>)[status] || "fue actualizada";
    return {
      title: en ? "Application update" : "Actualización de postulación",
      message: en ? `Your application to ${job} ${statusLabel}.` : `Tu postulación a ${job} ${statusLabel}.`,
    };
  }

  return {
    title: normalizeLegacyNotificationText(notification.title),
    message: normalizeLegacyNotificationText(notification.message),
  };
}
