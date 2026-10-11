import { REVIEW_CAMPAIGN, SERVICES_CAMPAIGN, type CampaignHistory, normalizeCampaignEmail } from "./campaign-policy";
import { tienePrecioReal } from "@/lib/notifications/empujones-del-perfil";

export const LIFECYCLE_CAMPAIGNS = [
  { ...REVIEW_CAMPAIGN, days: 7, audience: "professional", enabled: true },
  { key: "precio-desde-profesionales-2026", days: 21, audience: "professional", enabled: true,
    subject: "Ayuda a tus clientes a conocer tu precio desde",
    body: "Un cliente puede dudar en contactarte si no tiene ninguna referencia de cuánto cuesta tu servicio.\n\nAgrega un precio «desde» para orientarlo antes de conversar. No es una cotización definitiva: el precio final depende del trabajo y lo acuerdas con el cliente.\n\nEn tu panel, edita tus servicios y añade el precio inicial de los que puedas ofrecer con una referencia real.",
    ctaLabel: "Agregar precio desde", ctaPath: "/dashboard/profesional?mode=offer&tab=completion" },
  { key: "buscar-profesionales-clientes-2026", days: 3, audience: "all", enabled: true,
    subject: "Encuentra un profesional para lo que necesitas",
    body: "¿Tienes un trabajo pendiente en tu casa o negocio?\n\nEn ContrataCR puedes buscar profesionales por servicio y ubicación, revisar sus perfiles y contactar directamente a quien te interese.",
    ctaLabel: "Buscar profesionales", ctaPath: "/buscar" },
  { key: "crear-proyecto-clientes-2026", days: 17, audience: "all", enabled: true,
    subject: "Cuenta qué necesitas y encuentra quién lo haga",
    body: "Si prefieres explicar tu trabajo en un solo lugar, publica un proyecto en ContrataCR: indica qué necesitas y dónde.\n\nLos profesionales interesados podrán contactarte para conversar sobre el trabajo. Tú decides a quién contratar.",
    ctaLabel: "Crear un proyecto", ctaPath: "/publicar-proyecto" },
] as const;

export type LifecycleAccount = { id: string; email: string | null; full_name: string | null; created_at: string | null; is_disabled: boolean | null; role: string | null; is_provider: boolean | null };
export type LifecycleProfessional = { profile_id: string | null; created_at: string | null; review_count: number | null; services: unknown; is_banned: boolean | null; oculto_del_buscador: boolean | null; slug: string | null };
const DAY = 86_400_000;
export function lifecycleCandidate(account: LifecycleAccount, pro: LifecycleProfessional | undefined,
  history: CampaignHistory[], unsubscribed: string[], hasProject: boolean, now = Date.now(), includeUnapproved = false) {
  const email = normalizeCampaignEmail(account.email ?? "");
  if (account.is_disabled !== false || account.role === "admin" || !email.includes("@") || email.endsWith("@contratacr.test")
    || unsubscribed.some((s) => normalizeCampaignEmail(s) === email)) return null;
  const own = history.filter((r) => r.profile_id === account.id || normalizeCampaignEmail(r.email) === email);
  if (own.some((r) => r.rebote_en || r.status !== "sent" || now - Date.parse(r.enviado_en) < 14 * DAY)) return null;
  const professional = Boolean(pro) || account.is_provider === true || account.role === "professional";
  const registered = Date.parse(account.created_at ?? "");
  if (!Number.isFinite(registered) || now < registered) return null;
  const usablePro = professional && pro && pro.is_banned === false && pro.oculto_del_buscador === false && Boolean(pro.slug);
  const pendingReview = usablePro && Number(pro.review_count ?? 0) <= 0 && !own.some((r) => r.campana === REVIEW_CAMPAIGN.key);
  const pendingPrice = usablePro && !tienePrecioReal(pro.services) && !own.some((r) => r.campana === "precio-desde-profesionales-2026");
  for (const campaign of LIFECYCLE_CAMPAIGNS) {
    const age = now - (campaign.audience === "professional" && pro ? Math.max(registered,Date.parse(pro.created_at ?? "")) : registered);
    if ((!campaign.enabled && !includeUnapproved) || !Number.isFinite(age)
      || (campaign.audience === "professional" && !usablePro)
      || age < campaign.days * DAY || own.some((r) => r.campana === campaign.key)) continue;
    if (campaign.audience === "all" && (pendingReview || pendingPrice)) continue;
    if (campaign.key === REVIEW_CAMPAIGN.key && Number(pro?.review_count ?? 0) > 0) continue;
    if (campaign.key === "precio-desde-profesionales-2026" && tienePrecioReal(pro?.services)) continue;
    if (campaign.key === "crear-proyecto-clientes-2026" && hasProject) continue;
    if (campaign.key === "buscar-profesionales-clientes-2026" && own.some((r) => SERVICES_CAMPAIGN.historyKeys.includes(r.campana))) continue;
    // Price/projects wait for the first applicable step even for old accounts.
    if (campaign.key === "precio-desde-profesionales-2026" && Number(pro?.review_count ?? 0) <= 0
      && !own.some((r) => r.campana === REVIEW_CAMPAIGN.key)) continue;
    if (campaign.key === "crear-proyecto-clientes-2026"
      && !own.some((r) => r.campana === "buscar-profesionales-clientes-2026" || SERVICES_CAMPAIGN.historyKeys.includes(r.campana))) continue;
    return campaign;
  }
  return null;
}
