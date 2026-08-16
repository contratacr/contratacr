const UNSAFE_MESSAGE_PATTERNS = [
  /\b(hijueputa|malparid[oa]s?|carepichas?|cerotes?|mierdas?|put[ao]s?|cabron(?:es)?|imbecil(?:es)?|idiot[ao]s?|estupid[ao]s?)\b/i,
  /\b(maric[oó]n|play[ao]|zorra|perra)\b/i,
  /\b(te voy a matar|voy a matarte|mu[eé]rete|asesinar(?:te)?|amenaz[ao])\b/i,
];

export function validateDirectMessage(value: unknown) {
  const message = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (message.length > 2000) return { ok: false as const, error: "El mensaje no puede superar 2000 caracteres." };
  if (UNSAFE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))) {
    return { ok: false as const, error: "El mensaje contiene lenguaje ofensivo o amenazas. Edítalo para enviarlo." };
  }
  return { ok: true as const, message };
}
