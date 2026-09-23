const BLOCKED_REVIEW_PATTERNS = [
  /\b(hijueputa|malparid[oa]s?|carepichas?|pichas?|cerotes?|mierdas?|put[ao]s?|cabron(?:es)?|imbecil(?:es)?|idiot[ao]s?|estupid[ao]s?)\b/i,
  /\b(maric[oó]n|play[ao]|zorra|perra)\b/i,
  /\b(matar|asesinar|mu[eé]rete|te voy a matar|amenaza)\b/i,
  /(https?:\/\/|www\.|@[\w.-]+)/i,
];

export function normalizeReviewText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

// El texto sale en el idioma de quien escribe: estos mensajes se devuelven tal
// cual desde `/api/reviews` y se pintan sin traducir.
export function validateReviewText(comment: string, idioma: "es" | "en" = "es") {
  const en = idioma === "en";
  const clean = normalizeReviewText(comment);
  if (!clean) {
    return { ok: false, error: en ? "Write a comment to post your review." : "Escribe un comentario para publicar tu reseña." };
  }
  if (clean.length > 300) {
    return { ok: false, error: en ? "A review cannot be longer than 300 characters." : "La reseña no puede superar 300 caracteres." };
  }
  if (BLOCKED_REVIEW_PATTERNS.some((pattern) => pattern.test(clean))) {
    return {
      ok: false,
      error: en
        ? "Your review contains offensive language, threats or contact details. Edit the text to post it."
        : "Tu reseña contiene lenguaje ofensivo, amenazas o datos de contacto. Edita el texto para publicarla.",
    };
  }
  return { ok: true, comment: clean };
}
