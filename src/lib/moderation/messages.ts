const UNSAFE_MESSAGE_PATTERNS = [
  /\b(hijueputa|malparid[oa]s?|carepichas?|cerotes?|mierdas?|put[ao]s?|cabron(?:es)?|imbecil(?:es)?|idiot[ao]s?|estupid[ao]s?)\b/i,
  /\b(maricon|play[ao]|zorra|perra)\b/i,
  /\b(te voy a matar|voy a matarte|muerete|asesinar(?:te)?|amenaz[ao])\b/i,
];

// Igual que en las reseñas: este texto se devuelve tal cual desde
// `/api/direct-chat` y se pinta sin traducir.
export function validateDirectMessage(value: unknown, idioma: "es" | "en" = "es") {
  const en = idioma === "en";
  const message = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  const searchableMessage = message.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  if (message.length > 2000) return { ok: false as const, error: en ? "A message cannot be longer than 2000 characters." : "El mensaje no puede superar 2000 caracteres." };
  if (UNSAFE_MESSAGE_PATTERNS.some((pattern) => pattern.test(searchableMessage))) {
    return { ok: false as const, error: en ? "The message contains offensive language or threats. Edit it to send it." : "El mensaje contiene lenguaje ofensivo o amenazas. Edítalo para enviarlo." };
  }
  return { ok: true as const, message };
}
