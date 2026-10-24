import { MOBILE_APP_CAMPAIGN } from "./mobile-app-campaign";
import { REVIEW_CAMPAIGN, SERVICES_CAMPAIGN, type CampaignHistory, normalizeCampaignEmail, isInternalCampaignRecipient } from "./campaign-policy";
import { tienePrecioReal } from "@/lib/notifications/empujones-del-perfil";
import { PROFILE_REMINDER, professionalProfileIncomplete } from "./profile-reminder";

// Retired campaigns never appear in admin, simulation or delivery, even with includeUnapproved.
export const LIFECYCLE_CAMPAIGNS = ([
  PROFILE_REMINDER,
  { ...REVIEW_CAMPAIGN, days: 7, audience: "professional", enabled: true },
  MOBILE_APP_CAMPAIGN,
  { key: "precio-desde-profesionales-2026", days: 21, audience: "professional", enabled: true,
    subject: "Agrega un precio desde a tus servicios",
    body: "Ayuda al cliente a conocer tu tarifa inicial antes de contactarte.\n\nEn tu panel, entra a Servicios y edita el servicio. En «Precio desde», indica el monto y elige cómo cobras: por hora, consulta, proyecto, día o paquete. Aclara en la descripción qué incluye y qué puede cambiar el precio.\n\nAgrega un monto solo cuando puedas dar una referencia real. Si necesitas conocer el trabajo antes de indicar un precio, puedes mantener «Consultar precio». El precio final lo acuerdas con el cliente.",
    ctaLabel: "Agregar precio desde", ctaPath: "/dashboard/profesional?mode=offer&tab=services" },
  { key: "buscar-profesionales-clientes-2026", days: 3, audience: "all", enabled: true,
    subject: "Encuentra un profesional para lo que necesitas",
    body: "¿Tienes un trabajo pendiente en tu casa o negocio?\n\nEn ContrataCR puedes buscar profesionales por servicio y ubicación, revisar sus perfiles y contactar directamente a quien te interese.",
    ctaLabel: "Buscar profesionales", ctaPath: "/buscar" },
  { key: "crear-proyecto-clientes-2026", days: 17, audience: "all", enabled: true,
    subject: "¿Necesitas ayuda con un trabajo? Publica un proyecto",
    body: "¿Necesitas pintar tu casa, reparar una fuga o hacer otro trabajo?\n\nPublica lo que necesitas en ContrataCR: cuenta qué hay que hacer y en qué zona. Los profesionales interesados podrán contactarte.\n\nTú conversas con ellos y eliges a quién contratar. No necesitas una cuenta profesional para publicar.",
    ctaLabel: "Crear un proyecto", ctaPath: "/publicar-proyecto" },
] as const).filter(campaign => !("retired" in campaign && campaign.retired));

export type LifecycleAccount = { id: string; email: string | null; full_name: string | null; created_at: string | null; is_disabled: boolean | null; role: string | null; is_provider: boolean | null; hasUsedMobileApp?: boolean; professionalIntent?: boolean; emailConfirmed?: boolean; avatar_url?: string | null };
export type LifecycleProfessional = { profile_id: string | null; created_at: string | null; review_count: number | null; services: unknown; is_banned: boolean | null; oculto_del_buscador: boolean | null; slug: string | null; [key: string]: unknown };
const DAY = 86_400_000;
export function lifecycleCandidate(account: LifecycleAccount, pro: LifecycleProfessional | undefined,
  history: CampaignHistory[], unsubscribed: string[], hasProject: boolean, now = Date.now(), includeUnapproved = false) {
  const email = normalizeCampaignEmail(account.email ?? "");
  if (account.is_disabled !== false || isInternalCampaignRecipient(email,account.role) || !email.includes("@") || email.endsWith("@contratacr.test")
    || unsubscribed.some((s) => normalizeCampaignEmail(s) === email)) return null;
  const own = history.filter((r) => r.profile_id === account.id || normalizeCampaignEmail(r.email) === email);
  if (own.some((r) => r.rebote_en || r.status !== "sent" || now - Date.parse(r.enviado_en) < 14 * DAY)) return null;
  const professional = Boolean(pro) || account.is_provider === true || account.role === "professional";
  const registered = Date.parse(account.created_at ?? "");
  if (!Number.isFinite(registered) || now < registered) return null;
  const incomplete = (PROFILE_REMINDER.enabled || includeUnapproved) && professionalProfileIncomplete(account,pro);
  const pendingCompletion = incomplete && !own.some((r) => r.campana === PROFILE_REMINDER.key);
  const usablePro = professional && pro && !incomplete && pro.is_banned === false && pro.oculto_del_buscador === false && Boolean(pro.slug);
  const pendingReview = usablePro && Number(pro.review_count ?? 0) <= 0 && !own.some((r) => r.campana === REVIEW_CAMPAIGN.key);
  const pendingPrice = usablePro && !tienePrecioReal(pro.services) && !own.some((r) => r.campana === "precio-desde-profesionales-2026");
  for (const campaign of LIFECYCLE_CAMPAIGNS) {
    const age = now - (campaign.audience === "professional" && pro ? Math.max(registered,Date.parse(pro.created_at ?? "")) : registered);
    if ((!campaign.enabled && !includeUnapproved) || !Number.isFinite(age)
      || (campaign.audience === "professional" && !usablePro)
      || age < campaign.days * DAY || own.some((r) => r.campana === campaign.key)) continue;
    if (campaign.key === PROFILE_REMINDER.key && (!incomplete || account.emailConfirmed === false)) continue;
    if (campaign.key !== PROFILE_REMINDER.key && pendingCompletion) continue;
    // Unknown evidence fails closed for this invitation. Other campaigns keep
    // working if mobile measurement is temporarily unavailable.
    if (campaign.key === MOBILE_APP_CAMPAIGN.key && (account.hasUsedMobileApp !== false || account.emailConfirmed !== true)) continue;
    if (campaign.audience === "all" && (pendingReview || (pendingPrice && campaign.key !== MOBILE_APP_CAMPAIGN.key))) continue;
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
