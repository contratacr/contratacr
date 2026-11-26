import type { CampaignHistory } from "./campaign-policy";

/**
 * SEGUIMIENTOS: lo que recibe una cuenta DESPUÉS de las campañas de bienvenida.
 *
 * Solo salen los tipos de esta lista. Isaac aprobó los textos el 2026-11-26 y
 * encender primero diciembre y "¿Cómo le fue?"; los demás siguen apagados
 * hasta ver cómo responden. Si la lista queda vacía, el trabajo diario ni
 * siquiera carga sus datos. El panel de campañas igual muestra cuántas cuentas
 * califican en cada tipo (simulación).
 */
export const FOLLOWUP_ENABLED_KINDS: ReadonlySet<string> = new Set(["seg-cli-resena", "seg-cli-diciembre", "seg-pro-diciembre"]);
export const FOLLOWUP_CAMPAIGNS_ENABLED = FOLLOWUP_ENABLED_KINDS.size > 0;

/** Todas las llaves empiezan así: sirve para contar seguimientos en el historial. */
export const FOLLOWUP_PREFIX = "seg-";
/** Entre un correo de campaña cualquiera (incluida la bienvenida) y un seguimiento. */
export const FOLLOWUP_GAP_DAYS = 30;
/** Quien usó la app hace poco no necesita el empujón. */
export const ACTIVE_RECENTLY_DAYS = 14;
/** "Lleva tiempo sin entrar" para el aviso de búsquedas al profesional. */
export const PRO_INACTIVE_DAYS = 60;
/** Regla de salida: tantos seguimientos seguidos sin un clic pausan la cuenta. */
export const FOLLOWUP_STOP_AFTER = 3;
export const FOLLOWUP_STOP_DAYS = 180;
/** Mínimos para que el dato valga la pena contarlo. Con menos, ese mes no se envía. */
export const MIN_PRO_SEARCHERS = 5;
export const MIN_NEW_PROS = 3;
/** "¿Cómo le fue?" sale a los 7 días del contacto; después de 30 la pregunta caduca en la app. */
export const REVIEW_ASK_AFTER_DAYS = 7;
export const REVIEW_ASK_UNTIL_DAYS = 30;

const DAY = 86_400_000;

export type FollowupEmail = {
  key: string;
  /** Familia estable (sin período) para contar y mostrar en el panel. */
  kind: FollowupKind;
  subject: string;
  /** Párrafos separados por línea en blanco. Texto plano: se escapa al armar el HTML. */
  body: string;
  ctaLabel: string;
  ctaPath: string;
};
export type FollowupKind =
  | "seg-pro-resumen" | "seg-pro-busquedas" | "seg-pro-diciembre"
  | "seg-cli-nuevos" | "seg-cli-resena" | "seg-cli-diciembre" | "seg-cli-lluvias";

/** Para el panel: qué existe, a quién va y cuándo. */
export const FOLLOWUP_CATALOG: { kind: FollowupKind; nombre: string; audience: "professional" | "client"; cuando: string }[] = [
  { kind: "seg-pro-resumen", nombre: "Resumen de su perfil (últimos 30 días)", audience: "professional", cuando: "días 1 a 10 de cada mes, si tuvo visitas" },
  { kind: "seg-pro-busquedas", nombre: "Hay personas buscando su servicio en su zona", audience: "professional", cuando: "días 1 a 10, si lleva 60 días sin entrar y hubo 5 o más personas buscando" },
  { kind: "seg-pro-diciembre", nombre: "Diciembre: ¿su perfil está listo?", audience: "professional", cuando: "1 al 12 de diciembre" },
  { kind: "seg-cli-resena", nombre: "¿Cómo le fue con el profesional? (dejar reseña)", audience: "client", cuando: "7 días después de contactar a un profesional, si no respondió en la app" },
  { kind: "seg-cli-nuevos", nombre: "Nuevos profesionales en su provincia", audience: "client", cuando: "días 1 a 10, si se unieron 3 o más en la provincia que busca" },
  { kind: "seg-cli-diciembre", nombre: "Antes de fin de año: deje su casa lista", audience: "client", cuando: "1 al 12 de diciembre" },
  { kind: "seg-cli-lluvias", nombre: "Antes de las lluvias: revise techos y canoas", audience: "client", cuando: "20 al 30 de abril" },
];

/** Fecha en Costa Rica (UTC-6, sin horario de verano). */
export function crDate(now: number) {
  const d = new Date(now - 6 * 3_600_000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Ventanas de envío. Son rangos de días, no un solo día: el cupo diario es
 *  compartido y un solo día dejaría fuera a casi todos para siempre. */
export function followupWindows(now: number) {
  const { year, month, day } = crDate(now);
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const diciembre = month === 12 && day <= 12;
  const lluvias = month === 4 && day >= 20;
  // En diciembre la campaña de temporada reemplaza al seguimiento del mes.
  const mensual = day <= 10 && month !== 12;
  return { year, period, diciembre, lluvias, mensual, any: diciembre || lluvias || mensual };
}

export type FollowupContext = {
  professional: boolean;
  /** Edad de la cuenta en días. */
  accountAgeDays: number;
  /** La bienvenida no tiene nada pendiente para esta cuenta. */
  onboardingDone: boolean;
  /** Última actividad conocida (inicio de sesión o uso de la app). */
  lastActiveAt: number | null;
  history: CampaignHistory[];
  unsubscribed: boolean;
  /** Profesional: datos de los últimos 30 días, con los mismos filtros del panel de estadísticas. */
  pro?: {
    views: number; contacts: number;
    searchers: number; serviceName: string | null;
    hasReviews: boolean; hasPhotos: boolean; hasPrice: boolean;
  };
  /** Cliente. */
  client?: {
    /** Contacto pendiente de reseña más reciente que califica. */
    reviewAsk?: { id: string; professionalName: string; serviceName: string | null } | null;
    /** Provincia de sus búsquedas y profesionales nuevos ahí en 30 días. */
    province?: { id: string; name: string; newPros: number; services: string[] } | null;
  };
};

/** El historial propio dice si toca descansar. Falla cerrado ante envíos dudosos o rebotes. */
export function followupBlocked(history: CampaignHistory[], now: number) {
  if (history.some((r) => r.rebote_en || r.status !== "sent")) return "historial dudoso";
  if (history.some((r) => now - Date.parse(r.enviado_en) < FOLLOWUP_GAP_DAYS * DAY)) return "correo reciente";
  const seguimientos = history
    .filter((r) => r.campana.startsWith(FOLLOWUP_PREFIX))
    .sort((a, b) => Date.parse(b.enviado_en) - Date.parse(a.enviado_en));
  const ultimos = seguimientos.slice(0, FOLLOWUP_STOP_AFTER);
  if (ultimos.length === FOLLOWUP_STOP_AFTER && ultimos.every((r) => !r.click_en)
    && now - Date.parse(ultimos[0].enviado_en) < FOLLOWUP_STOP_DAYS * DAY) return "pausa por falta de interés";
  return null;
}

function plural(n: number, uno: string, varios: string) { return `${n} ${n === 1 ? uno : varios}`; }
function listaNatural(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

export function proSummaryEmail(period: string, d: NonNullable<FollowupContext["pro"]>): FollowupEmail {
  const contactos = d.contacts > 0 ? ` y ${plural(d.contacts, "contacto por WhatsApp o llamada", "contactos por WhatsApp o llamada")}` : "";
  const consejo = !d.hasReviews ? "Pedir una reseña a clientes anteriores ayuda a que quienes visitan su perfil confíen en su trabajo."
    : !d.hasPhotos ? "Agregar fotos de trabajos anteriores ayuda a que los clientes vean lo que usted hace."
    : !d.hasPrice ? "Indicar un precio de referencia ayuda a que los clientes sepan qué esperar antes de escribirle."
    : "Mantener sus servicios y zonas de trabajo al día ayuda a que le encuentren las personas correctas.";
  return {
    key: `seg-pro-resumen-${period}`, kind: "seg-pro-resumen",
    subject: "Su perfil en ContrataCR: últimos 30 días",
    body: `En los últimos 30 días su perfil tuvo ${plural(d.views, "visita", "visitas")}${contactos}.\n\n${consejo}`,
    ctaLabel: "Ver mis estadísticas", ctaPath: "/dashboard/profesional?mode=offer&tab=statistics",
  };
}

export function proSearchesEmail(period: string, d: NonNullable<FollowupContext["pro"]>): FollowupEmail {
  const servicio = d.serviceName ?? "su servicio";
  return {
    key: `seg-pro-busquedas-${period}`, kind: "seg-pro-busquedas",
    subject: `Hay personas buscando ${servicio} en su zona`,
    body: `En los últimos 30 días, ${plural(d.searchers, "persona buscó", "personas buscaron")} ${servicio} en las zonas donde usted trabaja.\n\nRevise que sus servicios, zonas y precios estén al día para que le encuentren.`,
    ctaLabel: "Revisar mi perfil", ctaPath: "/dashboard/profesional?mode=offer&tab=services",
  };
}

export function proDecemberEmail(year: number): FollowupEmail {
  return {
    key: `seg-pro-diciembre-${year}`, kind: "seg-pro-diciembre",
    subject: "Diciembre: ¿su perfil está listo?",
    body: "Se acerca fin de año, una época en la que muchas familias aprovechan para hacer arreglos en casa.\n\nRevise que sus servicios, zonas de trabajo y precios estén al día para que le encuentren.",
    ctaLabel: "Revisar mi perfil", ctaPath: "/dashboard/profesional?mode=offer&tab=services",
  };
}

export function clientReviewEmail(ask: NonNullable<NonNullable<FollowupContext["client"]>["reviewAsk"]>): FollowupEmail {
  const servicio = ask.serviceName ? ` por ${ask.serviceName}` : "";
  return {
    key: `seg-cli-resena-${ask.id}`, kind: "seg-cli-resena",
    subject: `¿Cómo le fue con ${ask.professionalName}?`,
    body: `Hace unos días contactó a ${ask.professionalName}${servicio} desde ContrataCR.\n\nSi llegó a contratarle, su opinión ayuda a otras personas a decidir y a ${ask.professionalName} a conseguir más trabajo.`,
    ctaLabel: "Dejar una reseña", ctaPath: "/",
  };
}

export function clientNewProsEmail(period: string, p: NonNullable<NonNullable<FollowupContext["client"]>["province"]>): FollowupEmail {
  const ejemplos = p.services.length ? `, en servicios como ${listaNatural(p.services.slice(0, 3))}` : "";
  return {
    key: `seg-cli-nuevos-${period}`, kind: "seg-cli-nuevos",
    subject: `Nuevos profesionales en ${p.name}`,
    body: `En los últimos 30 días se unieron ${plural(p.newPros, "profesional", "profesionales")} en ${p.name}${ejemplos}.\n\nSi tiene algo pendiente en su casa o negocio, puede revisar sus perfiles y escribirles directamente.`,
    ctaLabel: "Ver profesionales", ctaPath: `/buscar?provincia=${encodeURIComponent(p.id)}`,
  };
}

export function clientDecemberEmail(year: number): FollowupEmail {
  return {
    key: `seg-cli-diciembre-${year}`, kind: "seg-cli-diciembre",
    subject: "Antes de fin de año: deje su casa lista",
    body: "Diciembre es buen momento para pintar, limpiar a fondo o hacer ese arreglo pendiente antes de las visitas de fin de año.\n\nEn ContrataCR encuentra profesionales de su zona y les escribe directamente.",
    ctaLabel: "Buscar profesionales", ctaPath: "/buscar",
  };
}

export function clientRainsEmail(year: number): FollowupEmail {
  return {
    key: `seg-cli-lluvias-${year}`, kind: "seg-cli-lluvias",
    subject: "Antes de las lluvias: revise techos y canoas",
    body: "En mayo empieza la época lluviosa. Limpiar canoas y revisar el techo a tiempo evita goteras y daños mayores.\n\nEncuentre en ContrataCR a alguien de su zona que lo haga.",
    ctaLabel: "Buscar profesionales", ctaPath: "/buscar",
  };
}

/**
 * El seguimiento que le toca a una cuenta hoy, o null. Una sola regla decide
 * para el trabajo diario, la verificación justo antes de enviar y la simulación.
 */
export function followupCandidate(ctx: FollowupContext, now = Date.now(), includeUnapproved = false): FollowupEmail | null {
  if (!FOLLOWUP_CAMPAIGNS_ENABLED && !includeUnapproved) return null;
  const aprobado = (c: FollowupEmail | null): c is FollowupEmail => c !== null && (includeUnapproved || FOLLOWUP_ENABLED_KINDS.has(c.kind));
  if (ctx.unsubscribed || !ctx.onboardingDone || ctx.accountAgeDays < FOLLOWUP_GAP_DAYS) return null;
  if (followupBlocked(ctx.history, now)) return null;
  const yaRecibio = (key: string) => ctx.history.some((r) => r.campana === key);
  const activo = ctx.lastActiveAt !== null && now - ctx.lastActiveAt < ACTIVE_RECENTLY_DAYS * DAY;
  const w = followupWindows(now);

  if (!ctx.professional) {
    // Pedir la reseña responde a algo que la persona hizo: va aunque esté activa.
    const ask = ctx.client?.reviewAsk;
    const resena = ask && !yaRecibio(`seg-cli-resena-${ask.id}`) ? clientReviewEmail(ask) : null;
    if (aprobado(resena)) return resena;
    if (activo) return null;
    const candidatos = [
      w.diciembre ? clientDecemberEmail(w.year) : null,
      w.lluvias ? clientRainsEmail(w.year) : null,
      w.mensual && ctx.client?.province && ctx.client.province.newPros >= MIN_NEW_PROS ? clientNewProsEmail(w.period, ctx.client.province) : null,
    ];
    return candidatos.find((c) => aprobado(c) && !yaRecibio(c.key)) ?? null;
  }

  if (activo || !ctx.pro) return null;
  const inactivo = ctx.lastActiveAt === null || now - ctx.lastActiveAt >= PRO_INACTIVE_DAYS * DAY;
  const candidatos = [
    w.diciembre ? proDecemberEmail(w.year) : null,
    w.mensual && inactivo && ctx.pro.searchers >= MIN_PRO_SEARCHERS ? proSearchesEmail(w.period, ctx.pro) : null,
    w.mensual && ctx.pro.views >= 1 ? proSummaryEmail(w.period, ctx.pro) : null,
  ];
  // Un solo seguimiento por mes al profesional, aunque califique para los dos.
  const delMes = (c: FollowupEmail) => c.key.endsWith(w.period) && ctx.history.some((r) => r.campana.startsWith("seg-pro-") && r.campana.endsWith(w.period));
  return candidatos.find((c) => aprobado(c) && !yaRecibio(c.key) && !delMes(c)) ?? null;
}
