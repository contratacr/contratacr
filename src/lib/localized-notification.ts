import { getCategoryLabel } from "./data/categories";

// SOLO LO QUE EL APP GENERA HOY. Las citas, las propuestas, las postulaciones,
// seguir y las cotizaciones enviadas dentro del app salieron del producto: sus
// tipos se retiran de aqui y los avisos viejos que queden en la base se pintan
// con el texto guardado en la fila (la rama por defecto).
export const TRANSLATED_NOTIFICATION_TYPES = new Set([
  "review_received",
  "new_project",
  "project_cancelled",
  "support_reply",
  "verification",
  "verification_approved",
  "verification_pending",
  "verification_rejected",
  "verification_reverted",
  "verification_appeal_received",
  "verification_outreach",
  "suggestion_approved",
  "suggestion_rejected",
  "direct_message",
  "counterparty_account_deleted",
]);

type NotificationCopyInput = {
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown> | null;
};

type NotificationLocale = "es" | "en";

const TITLES: Record<string, Record<NotificationLocale, string>> = {
  review_received: { es: "Nueva reseña recibida", en: "New review received" },
  new_project: { es: "Nuevo proyecto", en: "New project" },
  project_cancelled: { es: "Proyecto cancelado", en: "Project cancelled" },
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
  verification_outreach: { es: "Terminemos tu verificación", en: "Let's finish your verification" },
  counterparty_account_deleted: { es: "Una cuenta con la que coordinabas se cerró", en: "An account you were coordinating with was closed" },
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

  if (["proposal_updated", "proposal_withdrawn", "proposal_accepted", "project_proposal_accepted", "project_proposal_declined"].includes(notification.type)) {
    const project = stringData(data, "project_title") || quotedValue(normalizedMessage);
    if (notification.type === "proposal_updated") return { title, message: en ? `A professional updated their reply${project ? ` to "${project}"` : ""}.` : `Un profesional actualizó su respuesta${project ? ` a "${project}"` : ""}.` };
    if (notification.type === "proposal_withdrawn") return { title, message: en ? `A professional withdrew their reply${project ? ` to "${project}"` : ""}.` : `Un profesional retiró su respuesta${project ? ` a "${project}"` : ""}.` };
    if (notification.type === "project_proposal_declined") {
      const another = stringData(data, "proposal_outcome") === "another_selected" || /eligi[oó] otra|selected another/i.test(normalizedMessage);
      return { title, message: en ? `The client ${another ? "chose another professional" : "did not choose you"}${project ? ` for "${project}"` : ""}.` : `El cliente ${another ? "eligió a otro profesional" : "no te eligió"}${project ? ` para "${project}"` : ""}.` };
    }
    return {
      title,
      message: en
        ? `The client chose you${project ? ` for "${project}"` : ""}. Coordinate the details by message.`
        : `El cliente te eligió${project ? ` para "${project}"` : ""}. Coordinen los detalles por mensaje.`,
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

  if (["project_completed", "project_cancelled", "project_deleted"].includes(notification.type)) {
    const project = stringData(data, "project_title") || quotedValue(normalizedMessage) || (en ? "the project" : "el proyecto");
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

  // LEGADO, y se queda: el tipo generico «verification» ya no se emite, pero
  // hay avisos guardados con el y sin este bloque quien usa el app en ingles
  // los leia en espanol. No es basura: es como se pinta la historia.
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

  // Recordatorios por inactividad. El aviso guardado ya trae el texto en
  // español; los datos (hito, título, cuántas) permiten rehacerlo en inglés.
  if (notification.type === "direct_message") return { title, message: normalizedMessage };

  return { title, message: legacyOr(normalizedMessage, en ? "Open the notification to see the details." : "Abre la notificación para ver los detalles.") };
}
