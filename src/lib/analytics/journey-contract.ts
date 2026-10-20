// Closed first-party vocabulary. Never capture DOM text, input values or URLs.
export const JOURNEY_ACTIONS = ["navigation", "button", "filter", "form_start", "form_submit", "form_abandon", "form_error", "scroll", "client_error", "measurement_status"] as const;
export type JourneyAction = typeof JOURNEY_ACTIONS[number];
export function routeSection(path: string): string {
  const first = path.replace(/^\/(?:es|en)(?=\/|$)/, "").split("/").filter(Boolean)[0] ?? "home";
  const known = ["home","buscar","profesionales","proyectos","promociones","empleos","servicios","asistente","mensajes","cotizaciones","dashboard","perfil","cuenta","login","registro","privacidad","terminos","ayuda","admin"];
  return known.includes(first) ? first : "perfil_publico";
}
export const JOURNEY_TARGETS = ["navigation","action","submit","filter","form","page","runtime","login","registro","buscar","profesionales","proyectos","promociones","empleos","servicios","asistente","mensajes","cotizaciones","dashboard","perfil","cuenta","privacidad","terminos","ayuda","home","perfil_publico","save","send","publish","share","whatsapp","call","download","next","more","attach"] as const;
export function cleanJourney(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !/^[a-f0-9-]{36}$/i.test(row.id)
    || !JOURNEY_ACTIONS.includes(row.action as JourneyAction)
    || !JOURNEY_TARGETS.includes(row.target as typeof JOURNEY_TARGETS[number])
    || typeof row.section !== "string" || routeSection(`/${row.section}`) !== row.section) return null;
  return { id: row.id, action: row.action as JourneyAction, target: String(row.target), section: row.section,
    value: typeof row.value === "number" && Number.isFinite(row.value) ? Math.max(0, Math.min(100, Math.round(row.value))) : null };
}

const BUTTON_LABELS: Record<string,string> = {
 "buscar":"buscar","search":"buscar","enviar":"send","send":"send","publicar":"publish","publish":"publish",
 "guardar":"save","guardar cambios":"save","save":"save","save changes":"save","compartir":"share","share":"share",
 "whatsapp":"whatsapp","contactar por whatsapp":"whatsapp","llamar":"call","call":"call","descargar pdf":"download","download pdf":"download",
 "continuar":"next","continue":"next","siguiente":"next","next":"next","cargar más":"more","load more":"more","adjuntar":"attach","attach":"attach",
 "enviar mensaje":"mensajes","send message":"mensajes","iniciar sesión":"login","sign in":"login","registrarme":"registro","sign up":"registro"
};
export function buttonTarget(label: string | null | undefined) { return BUTTON_LABELS[(label ?? "").trim().replace(/\s+/g," ").toLowerCase()] ?? "action"; }
