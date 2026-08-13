import { getCategoryLabel } from "./data/categories";

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
  "verification_approved",
  "verification_pending",
  "verification_rejected",
  "verification_reverted",
  "verification_appeal_received",
  "suggestion_approved",
  "suggestion_rejected",
  "direct_message",
  "professional_follow",
  "followed_professional_activity",
  "job_application",
  "job_application_status",
]);

type NotificationCopyInput = {
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown> | null;
};

type NotificationLocale = "es" | "en";

const TITLES: Record<string, Record<NotificationLocale, string>> = {
  booking_received: { es: "Nueva solicitud", en: "New request" },
  booking_confirmed: { es: "Solicitud confirmada", en: "Request confirmed" },
  booking_completed: { es: "Servicio completado", en: "Service completed" },
  booking_completed_by_client: { es: "Finalización confirmada", en: "Completion confirmed" },
  booking_cancelled: { es: "Solicitud cancelada", en: "Request cancelled" },
  booking_cancelled_by_client: { es: "Solicitud cancelada por el cliente", en: "Request cancelled by client" },
  booking_rescheduled: { es: "Cita reprogramada", en: "Appointment rescheduled" },
  booking_update: { es: "Actualización de solicitud", en: "Request update" },
  review_request: { es: "Deja tu reseña", en: "Leave your review" },
  review_received: { es: "Nueva reseña recibida", en: "New review received" },
  proposal_received: { es: "Nueva propuesta", en: "New proposal" },
  proposal_updated: { es: "Propuesta actualizada", en: "Proposal updated" },
  proposal_withdrawn: { es: "Propuesta retirada", en: "Proposal withdrawn" },
  proposal_accepted: { es: "¡Propuesta aceptada!", en: "Proposal accepted!" },
  project_proposal_accepted: { es: "¡Propuesta aceptada!", en: "Proposal accepted!" },
  project_proposal_declined: { es: "Propuesta no seleccionada", en: "Proposal not selected" },
  new_project: { es: "Nuevo proyecto", en: "New project" },
  project_work_done: { es: "Confirma la finalización del trabajo", en: "Confirm job completion" },
  project_completed: { es: "Oportunidad finalizada", en: "Project completed" },
  project_cancelled: { es: "Solicitud cancelada", en: "Project cancelled" },
  project_deleted: { es: "Solicitud eliminada", en: "Project deleted" },
  support_reply: { es: "Respuesta de soporte", en: "Support reply" },
  verification: { es: "Actualización de verificación", en: "Verification update" },
  verification_approved: { es: "¡Tu identidad fue verificada!", en: "Your identity was verified!" },
  verification_pending: { es: "Tu verificación está en revisión", en: "Your verification is under review" },
  verification_rejected: { es: "Tu verificación no fue aprobada", en: "Your verification was not approved" },
  verification_reverted: { es: "Tu verificación fue actualizada", en: "Your verification was updated" },
  verification_appeal_received: { es: "Nueva apelación de verificación", en: "New verification appeal" },
  suggestion_approved: { es: "Sugerencia aprobada", en: "Suggestion approved" },
  suggestion_rejected: { es: "Sugerencia rechazada", en: "Suggestion rejected" },
  direct_message: { es: "Nuevo mensaje", en: "New message" },
  professional_follow: { es: "Nuevo seguidor", en: "New follower" },
  followed_professional_activity: { es: "Nueva publicación", en: "New post" },
  job_application: { es: "Nueva postulación", en: "New application" },
  job_application_status: { es: "Actualización de postulación", en: "Application update" },
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

function stringData(data: Record<string, unknown> | null | undefined, ...keys: string[]): string {
  for (const key of keys) {
    const value = data?.[key];
    if (typeof value === "string" && value.trim()) return normalizeLegacyNotificationText(value).trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function localizedBookingWhen(
  data: Record<string, unknown> | null | undefined,
  locale: NotificationLocale,
  legacyFallback = "",
): string {
  const date = stringData(data, "scheduled_date");
  const time = stringData(data, "scheduled_time");
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [year, month, day] = date.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    const validDate = parsed.getUTCFullYear() === year
      && parsed.getUTCMonth() === month - 1
      && parsed.getUTCDate() === day;
    if (validDate) {
      const label = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      }).format(parsed);
      const normalizedTime = /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : "";
      return normalizedTime
        ? `${label} ${locale === "en" ? "at" : "a las"} ${normalizedTime}`
        : label;
    }
  }
  return stringData(data, "preferred_date_text", "when_text") || legacyFallback;
}

function firstMatch(message: string, patterns: RegExp[]): RegExpMatchArray | null {
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) return match;
  }
  return null;
}

function quotedValue(message: string): string {
  return message.match(/["“]([^"”]+)["”]/)?.[1]?.trim() ?? "";
}

function splitReason(message: string, data?: Record<string, unknown> | null) {
  const structured = stringData(data, "review_reason", "cancel_reason", "reason");
  const match = message.match(/\s+(?:Motivo|Reason):\s*([\s\S]+)$/i);
  const legacyReason = (match?.[1] ?? "")
    .trim()
    .replace(/\s*\.?\s*(?:Puedes apelar desde tu panel|You can appeal from your panel|Revisa tu panel para ver el detalle|Check your panel for details)\.?\s*$/i, "")
    .trim()
    .replace(/\.$/, "");
  return {
    message: match ? message.slice(0, match.index).trim() : message,
    reason: structured || legacyReason,
  };
}

function appendReason(message: string, reason: string, locale: NotificationLocale) {
  if (!reason) return message;
  return `${message} ${locale === "en" ? "Reason" : "Motivo"}: ${reason}`;
}

function localizedTitle(type: string, locale: NotificationLocale, fallback: string) {
  return TITLES[type]?.[locale] ?? normalizeLegacyNotificationText(fallback);
}

function legacyOr(message: string, fallback: string) {
  return message.trim() || fallback;
}

export function localizedNotificationCopy(notification: NotificationCopyInput, locale: string) {
  const language: NotificationLocale = locale === "en" ? "en" : "es";
  const en = language === "en";
  const data = notification.data;
  const normalizedMessage = normalizeLegacyNotificationText(notification.message);
  const title = localizedTitle(notification.type, language, notification.title);

  if (notification.type === "professional_follow") {
    const name = stringData(data, "follower_name") || (en ? "Someone" : "Alguien");
    return {
      title,
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
    return { title: en ? `New post from ${name}` : `Nueva publicación de ${name}`, message: `${name} ${action}${content ? `: ${content}` : ""}.` };
  }

  if (notification.type === "job_application") {
    const applicant = stringData(data, "applicant_name") || (en ? "Someone" : "Alguien");
    const job = stringData(data, "job_title") || (en ? "your job" : "tu empleo");
    return { title, message: en ? `${applicant} applied to ${job}.` : `${applicant} se postuló a ${job}.` };
  }

  if (notification.type === "job_application_status") {
    const job = stringData(data, "job_title") || (en ? "this job" : "este empleo");
    const status = stringData(data, "status");
    const statusLabel = en
      ? ({ reviewing: "is under review", shortlisted: "was shortlisted", rejected: "was not selected", hired: "was accepted", withdrawn: "was withdrawn" } as Record<string, string>)[status] || "was updated"
      : ({ reviewing: "está en revisión", shortlisted: "fue preseleccionada", rejected: "no fue seleccionada", hired: "fue aceptada", withdrawn: "fue retirada" } as Record<string, string>)[status] || "fue actualizada";
    return { title, message: en ? `Your application to ${job} ${statusLabel}.` : `Tu postulación a ${job} ${statusLabel}.` };
  }

  if (notification.type === "booking_received") {
    const legacy = firstMatch(normalizedMessage, [
      /^(.+?) solicit[oó] ['"](.+?)['"](?: para el (.+?))?\.$/i,
      /^(.+?) requested ['"](.+?)['"](?: for (.+?))?\.$/i,
    ]);
    const client = stringData(data, "client_name") || legacy?.[1] || (en ? "A client" : "Un cliente");
    const service = stringData(data, "service_description", "service_name") || legacy?.[2] || (en ? "a service" : "un servicio");
    const when = localizedBookingWhen(data, language, legacy?.[3] || "");
    return { title, message: en ? `${client} requested '${service}'${when ? ` for ${when}` : ""}.` : `${client} solicitó '${service}'${when ? ` para el ${when}` : ""}.` };
  }

  if (notification.type === "booking_confirmed" || notification.type === "booking_cancelled") {
    const withReason = splitReason(normalizedMessage, data);
    const legacy = firstMatch(withReason.message, [
      /^(.+?) (?:confirm[oó]|cancel[oó]) tu solicitud de ['"](.+?)['"](?: para el (.+?))?\.$/i,
      /^(.+?) (?:confirmed|cancelled|canceled) your request for ['"](.+?)['"](?: for (.+?))?\.$/i,
    ]);
    const professional = stringData(data, "professional_name") || legacy?.[1] || (en ? "The professional" : "El profesional");
    const service = stringData(data, "service_description", "service_name") || legacy?.[2] || (en ? "the service" : "el servicio");
    const when = localizedBookingWhen(data, language, legacy?.[3] || "");
    const cancelled = notification.type === "booking_cancelled";
    const body = en
      ? `${professional} ${cancelled ? "cancelled" : "confirmed"} your request for '${service}'${when ? ` for ${when}` : ""}.`
      : `${professional} ${cancelled ? "canceló" : "confirmó"} tu solicitud de '${service}'${when ? ` para el ${when}` : ""}.`;
    return { title, message: appendReason(body, withReason.reason, language) };
  }

  if (notification.type === "booking_rescheduled") {
    const legacy = firstMatch(normalizedMessage, [
      /^(.+?) cambi[oó] el horario de ['"](.+?)['"](?: a (.+?))?\. Coordina/i,
      /^(.+?) rescheduled ['"](.+?)['"](?: to (.+?))?\. Coordinate/i,
    ]);
    const client = stringData(data, "client_name") || legacy?.[1] || (en ? "Your client" : "Tu cliente");
    const service = stringData(data, "service_description", "service_name") || legacy?.[2] || (en ? "the service" : "el servicio");
    const when = localizedBookingWhen(data, language, legacy?.[3] || "");
    return {
      title,
      message: en
        ? `${client} rescheduled '${service}'${when ? ` to ${when}` : ""}. Coordinate the details through WhatsApp.`
        : `${client} cambió el horario de '${service}'${when ? ` a ${when}` : ""}. Coordina los detalles por WhatsApp.`,
    };
  }

  if (notification.type === "booking_update") {
    const status = stringData(data, "booking_status", "status");
    const days = stringData(data, "auto_confirm_days") || normalizedMessage.match(/(\d+) d[ií]as/i)?.[1] || "7";
    const awaiting = status === "awaiting_confirmation" || /realizado|completion/i.test(normalizedMessage);
    return {
      title,
      message: awaiting
        ? (en ? `Confirm completion to close the request. It will be confirmed automatically in ${days} days.` : `Confirma la finalización para cerrar la solicitud. Se confirma automáticamente en ${days} días.`)
        : (en ? "The professional marked your request as in progress." : "El profesional marcó tu solicitud en progreso."),
    };
  }

  if (notification.type === "booking_completed" || notification.type === "booking_completed_by_client") {
    return {
      title,
      message: notification.type === "booking_completed_by_client"
        ? (en ? "The request was completed." : "La solicitud quedó finalizada.")
        : (en ? "Your service request was completed." : "Tu solicitud de servicio fue completada."),
    };
  }

  if (notification.type === "booking_cancelled_by_client") {
    const withReason = splitReason(normalizedMessage, data);
    const body = en ? "The client cancelled their request. The time slot is available again." : "El cliente canceló su solicitud. El horario quedó libre.";
    return { title, message: appendReason(body, withReason.reason, language) };
  }

  if (notification.type === "review_request") {
    const professional = stringData(data, "professional_name")
      || normalizedMessage.match(/^Tu servicio con (.+?) se marc[oó] como completado/i)?.[1]
      || normalizedMessage.match(/^Your service with (.+?) was marked as completed/i)?.[1]
      || "";
    return {
      title,
      message: professional
        ? (en ? `Your service with ${professional} was marked as completed. Leave a review to help other clients.` : `Tu servicio con ${professional} se marcó como completado. Deja una reseña para ayudar a otros clientes.`)
        : (en ? "Leave a review to help other clients." : "Deja tu reseña para ayudar a otros clientes."),
    };
  }

  if (notification.type === "review_received") {
    const legacy = firstMatch(normalizedMessage, [
      /^(.+?) te dej[oó] una rese[nñ]a de ([\d.,]+) estrellas\.$/i,
      /^(.+?) left you a ([\d.,]+)-star review\.$/i,
    ]);
    const client = stringData(data, "client_name") || legacy?.[1] || (en ? "A client" : "Un cliente");
    const rawRating = data?.rating;
    const rating = typeof rawRating === "number" && Number.isFinite(rawRating)
      ? new Intl.NumberFormat(en ? "en-US" : "es-CR", { maximumFractionDigits: 1 }).format(rawRating)
      : stringData(data, "rating") || legacy?.[2] || "";
    return { title, message: en ? `${client} left you a ${rating || "new"}-star review.` : `${client} te dejó una reseña de ${rating || "nuevas"} estrellas.` };
  }

  if (notification.type === "proposal_received") {
    const legacy = firstMatch(normalizedMessage, [
      /^(.+?) envi[oó] una propuesta (?:a tu proyecto|para ["“](.+?)["”])\.$/i,
      /^(.+?) sent a proposal (?:to your project|for ["“](.+?)["”])\.$/i,
    ]);
    const professional = stringData(data, "professional_name") || legacy?.[1] || (en ? "A professional" : "Un profesional");
    const project = stringData(data, "project_title") || legacy?.[2] || "";
    return { title, message: en ? `${professional} sent a proposal${project ? ` for "${project}"` : " to your project"}.` : `${professional} envió una propuesta${project ? ` para "${project}"` : " a tu proyecto"}.` };
  }

  if (["proposal_updated", "proposal_withdrawn", "proposal_accepted", "project_proposal_accepted", "project_proposal_declined"].includes(notification.type)) {
    const project = stringData(data, "project_title") || quotedValue(normalizedMessage);
    if (notification.type === "proposal_updated") return { title, message: en ? `A professional updated their proposal${project ? ` for "${project}"` : ""}.` : `Un profesional actualizó su propuesta${project ? ` para "${project}"` : ""}.` };
    if (notification.type === "proposal_withdrawn") return { title, message: en ? `A professional withdrew their proposal${project ? ` for "${project}"` : ""}.` : `Un profesional retiró su propuesta${project ? ` para "${project}"` : ""}.` };
    if (notification.type === "project_proposal_declined") {
      const another = stringData(data, "proposal_outcome") === "another_selected" || /eligi[oó] otra|selected another/i.test(normalizedMessage);
      return { title, message: en ? `The client ${another ? "selected another" : "did not select your"} proposal${project ? ` for "${project}"` : ""}.` : `El cliente ${another ? "eligió otra" : "no seleccionó tu"} propuesta${project ? ` para "${project}"` : ""}.` };
    }
    return {
      title,
      message: en
        ? `The client accepted your proposal${project ? ` for "${project}"` : ""}. Coordinate the work and mark it as completed when finished.`
        : `El cliente aceptó tu propuesta${project ? ` para "${project}"` : ""}. Coordina el trabajo y márcalo como realizado al terminar.`,
    };
  }

  if (notification.type === "new_project") {
    const legacy = firstMatch(normalizedMessage, [
      /^Un cliente public[oó] ["“](.+?)["”] en (.+?)\.$/i,
      /^A client published ["“](.+?)["”] in (.+?)\.$/i,
    ]);
    const project = stringData(data, "project_title") || legacy?.[1] || (en ? "a new project" : "un nuevo proyecto");
    const categoryId = stringData(data, "category_id");
    const category = categoryId
      ? getCategoryLabel(categoryId, language)
      : stringData(data, "category_label") || legacy?.[2] || "";
    return { title, message: en ? `A client published "${project}"${category ? ` in ${category}` : ""}.` : `Un cliente publicó "${project}"${category ? ` en ${category}` : ""}.` };
  }

  if (notification.type === "project_work_done") {
    const project = stringData(data, "project_title") || quotedValue(normalizedMessage) || (en ? "the project" : "el proyecto");
    const days = stringData(data, "auto_confirm_days") || normalizedMessage.match(/(\d+) d[ií]as/i)?.[1] || "7";
    return { title, message: en ? `The professional marked "${project}" as completed. Confirm it to finish the project. If you do not respond within ${days} days, it will be confirmed automatically.` : `El profesional marcó "${project}" como realizado. Confirma para finalizarlo. Si no respondes en ${days} días se confirma automáticamente.` };
  }

  if (["project_completed", "project_cancelled", "project_deleted"].includes(notification.type)) {
    const project = stringData(data, "project_title") || quotedValue(normalizedMessage) || (en ? "the project" : "la solicitud");
    if (notification.type === "project_completed") return { title, message: en ? `The client confirmed completion of "${project}". Great work.` : `El cliente confirmó la finalización de "${project}". Buen trabajo.` };
    const deleted = notification.type === "project_deleted";
    return { title, message: en ? `The client ${deleted ? "deleted" : "cancelled"} the project "${project}". It is no longer active.` : `El cliente ${deleted ? "eliminó" : "canceló"} la solicitud "${project}". Ya no está activa.` };
  }

  if (notification.type === "support_reply") {
    const suggestionDecision = stringData(data, "suggestion_decision");
    if (suggestionDecision) {
      const service = stringData(data, "service_name") || (en ? "your suggestion" : "tu sugerencia");
      const reason = stringData(data, "review_reason");
      const approved = suggestionDecision === "approved";
      const body = approved
        ? (en ? `Your suggestion "${service}" was approved and is now available in search.` : `Tu sugerencia "${service}" fue aprobada y ya está disponible para la búsqueda.`)
        : (en ? `Your suggestion "${service}" was not approved.` : `Tu sugerencia "${service}" no fue aprobada.`);
      return { title: localizedTitle(approved ? "suggestion_approved" : "suggestion_rejected", language, notification.title), message: appendReason(body, reason, language) };
    }
    const subject = stringData(data, "ticket_subject") || quotedValue(normalizedMessage);
    return { title, message: en ? `Support replied to your ticket${subject ? ` "${subject}"` : ""}.` : `Soporte respondió a tu ticket${subject ? ` "${subject}"` : ""}.` };
  }

  if (notification.type === "verification_approved") {
    return { title, message: en ? "We confirmed that your ID is valid and matches the official records. The Verified badge now appears on your profile and in search results." : "Confirmamos que tu cédula es real y coincide con los registros oficiales. La insignia \"Verificado\" ya aparece en tu perfil y en los resultados de búsqueda." };
  }

  if (notification.type === "verification_pending") {
    return { title, message: en ? "We could not automatically confirm your identity. Your case is under review and your account remains active." : "No pudimos confirmar automáticamente tu identidad. Tu caso quedó en revisión y tu cuenta sigue activa." };
  }

  if (notification.type === "verification") {
    const withReason = splitReason(normalizedMessage, data);
    const status = stringData(data, "verification_status", "status").toLowerCase();
    const stateText = `${status} ${withReason.message}`;
    if (/rejected|not approved|no fue aprobada/i.test(stateText)) {
      const body = en
        ? "Your identity verification was not approved. You can appeal from your panel."
        : "Tu verificación de identidad no fue aprobada. Puedes apelar desde tu panel.";
      return { title, message: appendReason(body, withReason.reason, language) };
    }
    if (/reverted|removed|quitada|retirada/i.test(stateText)) {
      const body = en
        ? "Your verification badge was removed. Check your panel for details."
        : "Tu insignia de verificación fue retirada. Revisa tu panel para ver el detalle.";
      return { title, message: appendReason(body, withReason.reason, language) };
    }
    if (/approved|verified|verificada|verificado/i.test(stateText)) {
      return {
        title,
        message: en
          ? "We confirmed that your ID is valid and matches the official records. The Verified badge now appears on your profile and in search results."
          : "Confirmamos que tu cédula es real y coincide con los registros oficiales. La insignia \"Verificado\" ya aparece en tu perfil y en los resultados de búsqueda.",
      };
    }
    if (/pending|under review|en revisi[oó]n/i.test(stateText)) {
      return {
        title,
        message: en
          ? "We could not automatically confirm your identity. Your case is under review and your account remains active."
          : "No pudimos confirmar automáticamente tu identidad. Tu caso quedó en revisión y tu cuenta sigue activa.",
      };
    }
    return {
      title,
      message: en
        ? "Your verification status was updated. Check your panel for details."
        : "El estado de tu verificación fue actualizado. Revisa tu panel para ver el detalle.",
    };
  }

  if (notification.type === "verification_rejected" || notification.type === "verification_reverted") {
    const withReason = splitReason(normalizedMessage, data);
    const rejected = notification.type === "verification_rejected";
    const body = rejected
      ? (en ? "Your identity verification was not approved. You can appeal from your panel." : "Tu verificación de identidad no fue aprobada. Puedes apelar desde tu panel.")
      : (en ? "Your verification badge was removed. Check your panel for details." : "Tu insignia de verificación fue retirada. Revisa tu panel para ver el detalle.");
    return { title, message: appendReason(body, withReason.reason, language) };
  }

  if (notification.type === "verification_appeal_received") {
    const legacy = firstMatch(normalizedMessage, [
      /^(.+?) apel[oó] su revisi[oó]n: ["“]([\s\S]+)["”]$/i,
      /^(.+?) appealed their review: ["“]([\s\S]+)["”]$/i,
    ]);
    const provider = stringData(data, "provider_name") || legacy?.[1] || (en ? "A professional" : "Un profesional");
    const appeal = stringData(data, "appeal_message") || legacy?.[2] || "";
    return { title, message: en ? `${provider} appealed their review${appeal ? `: "${appeal}"` : "."}` : `${provider} apeló su revisión${appeal ? `: "${appeal}"` : "."}` };
  }

  if (notification.type === "suggestion_approved" || notification.type === "suggestion_rejected") {
    const service = stringData(data, "service_name") || quotedValue(normalizedMessage) || (en ? "your suggestion" : "tu sugerencia");
    const reason = stringData(data, "review_reason");
    const approved = notification.type === "suggestion_approved";
    const body = approved
      ? (en ? `Your suggestion "${service}" was approved and is now available in search.` : `Tu sugerencia "${service}" fue aprobada y ya está disponible para la búsqueda.`)
      : (en ? `Your suggestion "${service}" was not approved.` : `Tu sugerencia "${service}" no fue aprobada.`);
    return { title, message: appendReason(body, reason, language) };
  }

  if (notification.type === "direct_message") return { title, message: normalizedMessage };

  return { title, message: legacyOr(normalizedMessage, en ? "Open the notification to see the details." : "Abre la notificación para ver los detalles.") };
}
