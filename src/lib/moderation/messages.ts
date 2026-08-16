const UNSAFE_MESSAGE_PATTERNS = [
  /\b(hijueputa|malparid[oa]s?|carepichas?|cerotes?|mierdas?|put[ao]s?|cabron(?:es)?|imbecil(?:es)?|idiot[ao]s?|estupid[ao]s?)\b/i,
  /\b(maricon|play[ao]|zorra|perra)\b/i,
  /\b(te voy a matar|voy a matarte|muerete|asesinar(?:te)?|amenaz[ao])\b/i,
];

export function validateDirectMessage(value: unknown) {
  const message = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  const searchableMessage = message.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  if (message.length > 2000) return { ok: false as const, error: "El mensaje no puede superar 2000 caracteres." };
  if (UNSAFE_MESSAGE_PATTERNS.some((pattern) => pattern.test(searchableMessage))) {
    return { ok: false as const, error: "El mensaje contiene lenguaje ofensivo o amenazas. Edítalo para enviarlo." };
  }
  return { ok: true as const, message };
}
