/** Only fixed product topics may leave the app for AI inference; never copy text. */
const TOPICS: Array<[string, RegExp]> = [
  ["account access", /login|sesion|contrasena|password|ingresar|entrar|acceso/],
  ["notifications", /notificacion|notification|aviso|push/],
  ["professional profile", /perfil|profile|profesional|professional/],
  ["service search", /busca|search|servicio|service/],
  ["projects", /proyecto|project/],
  ["promotions", /promocion|promotion/],
  ["jobs", /empleo|trabajo|jobs|employment/],
  ["messaging", /mensaje|message|chat|whatsapp/],
  ["identity verification", /verifica|verification|identidad|identity/],
  ["appointments", /agenda|cita|appointment|booking/],
  ["prices", /precio|tarifa|price|pricing/],
  ["privacy", /privacidad|privacy|datos|data/],
];
export function assistantExternalTopics(message: string): string | null {
  const normalized = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const topics = TOPICS.filter(([, pattern]) => pattern.test(normalized)).map(([topic]) => topic);
  return topics.length ? `Provide general ContrataCR guidance about these product topics: ${topics.join(", ")}. Do not assume any personal circumstances; ask for clarification if needed.` : null;
}
