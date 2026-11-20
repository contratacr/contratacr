// Cerrar un caso no puede ser un cambio de estado silencioso: quien escribió
// merece leer por qué se cerró y cómo seguir. El admin elige un motivo y ese
// motivo se convierte en un mensaje real del hilo, firmado por soporte.
//
// El cierre nunca obliga a abrir un caso nuevo: responder aquí reabre este
// mismo hilo con todo su historial, que es justo lo que soporte necesita para
// retomar. Un caso nuevo solo tiene sentido si el tema es otro.
export const SUPPORT_CLOSE_REASONS = [
  {
    id: "solved",
    label: { es: "Resuelto", en: "Solved" },
    message: {
      es: "Tu consulta quedó resuelta y cerramos el caso. Si todavía necesitas ayuda, abre la conversación desde el botón y responde allí.",
      en: "We're marking this case as solved. If the problem comes back, reply to this message and we'll pick it up with the full history at hand.",
    },
  },
  {
    id: "no_reply",
    label: { es: "Sin respuesta del usuario", en: "No reply from the user" },
    message: {
      es: "Cerramos el caso porque no recibimos respuesta. No perdiste nada: si todavía necesitas ayuda, responde a este mensaje y el caso se reabre donde quedó.",
      en: "We're closing this case because we didn't hear back. Nothing is lost: if you still need help, reply to this message and the case reopens right where it left off.",
    },
  },
  {
    id: "duplicate",
    label: { es: "Caso duplicado", en: "Duplicate case" },
    message: {
      es: "Cerramos este caso porque ya lo estamos atendiendo en otro. Seguimos la conversación allá para no dividir el historial.",
      en: "We're closing this case because we're already handling it in another one. We'll continue there so the history stays in one place.",
    },
  },
  {
    id: "out_of_scope",
    label: { es: "Fuera del alcance de soporte", en: "Outside support's scope" },
    message: {
      es: "Este caso queda fuera de lo que soporte puede resolver, así que lo cerramos. Si tienes otra consulta sobre la plataforma, escríbenos un caso nuevo y con gusto la vemos.",
      en: "This case is outside what support can resolve, so we're closing it. If you have another question about the platform, open a new case and we'll gladly look at it.",
    },
  },
] as const;

export function supportCloseReason(id: string) {
  // Preserve old records and callers without offering two equivalent choices.
  const canonicalId = id === "answered" ? "solved" : id;
  return SUPPORT_CLOSE_REASONS.find((reason) => reason.id === canonicalId) ?? null;
}

// El mensaje que se publica: el motivo y, si el admin escribió algo propio, su
// nota debajo. La nota amplía el motivo, no lo reemplaza.
export function buildSupportCloseMessage(id: string, nota?: string | null, locale: "es" | "en" = "es") {
  const reason = supportCloseReason(id);
  if (!reason) return null;
  const limpia = (nota ?? "").trim();
  return limpia ? `${reason.message[locale]}\n\n${limpia}` : reason.message[locale];
}
