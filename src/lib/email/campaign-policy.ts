import { campanaDesdeAsunto } from "@/lib/email/campana";

// Stable identity: editing the subject never creates a new recipient history.
// Include the older general-services campaign, which already reached 404 accounts.
export const SERVICES_CAMPAIGN = {
  id: "recordatorio",
  key: "necesitas-un-electricista-un-abogado-o-u",
  historyKeys: ["necesitas-un-electricista-un-abogado-o-u", campanaDesdeAsunto("263 profesionales verificados, en un solo lugar")],
  nombre: "Servicios disponibles en ContrataCR",
  subject: "Encuentra servicios para tu hogar y tu negocio en ContrataCR",
  body: "En ContrataCR puedes encontrar servicios de electricidad, construcción, remodelación, mecánica, contabilidad, asesoría legal y tecnología.\n\nRevisa los servicios disponibles en tu zona, compara los perfiles y contacta por WhatsApp al profesional que te interese.",
  ctaLabel: "Ver servicios disponibles",
  ctaPath: "/servicios",
  audiencia: "todas",
};
export const REVIEW_CAMPAIGN = {
  id: "resenas",
  key: "primeras-resenas-profesionales-2026",
  historyKeys: ["primeras-resenas-profesionales-2026"],
  nombre: "Pedir primeras reseñas",
  subject: "Pide una reseña a tus clientes desde ContrataCR",
  body: "Si ya realizaste trabajos para clientes, puedes invitarlos a contar cómo fue su experiencia. Una reseña en tu perfil ayuda a otras personas a conocer tu trabajo.\n\nEn tu panel, abre Compartir y elige «Pedir una reseña». Encontrarás un mensaje listo para enviar por WhatsApp a clientes con los que realmente trabajaste. Tú decides a quién enviarlo.",
  ctaLabel: "Preparar mi solicitud de reseña",
  ctaPath: "/dashboard/profesional?mode=offer&share=reviews",
  audiencia: "pros_sin_resenas",
};
export const CAMPAIGN_EMAIL_COOLDOWN_DAYS = 14;
export const CAMPAIGN_BATCH_SIZE = 60;

export type CampaignHistory = {
  email: string; campana: string; enviado_en: string;
  status: "sending" | "sent" | "uncertain";
  abierto_en?: string | null; click_en?: string | null; rebote_en?: string | null;
};
export function normalizeCampaignEmail(email: string) { return email.trim().toLowerCase(); }

export function eligibleCampaignRecipients<T extends { email: string }>(
  accounts: T[], history: CampaignHistory[], unsubscribed: string[], now = Date.now(), ownKeys: string[] = SERVICES_CAMPAIGN.historyKeys,
) {
  const blocked = new Set(unsubscribed.map(normalizeCampaignEmail));
  for (const row of history) {
    if (ownKeys.includes(row.campana) || row.rebote_en || row.status !== "sent"
      || now - Date.parse(row.enviado_en) < CAMPAIGN_EMAIL_COOLDOWN_DAYS * 86_400_000) {
      blocked.add(normalizeCampaignEmail(row.email));
    }
  }
  const seen = new Set<string>();
  return accounts.filter((account) => {
    const email = normalizeCampaignEmail(account.email);
    if (blocked.has(email) || seen.has(email) || !email.includes("@") || email.endsWith("@contratacr.test")) return false;
    seen.add(email);
    return true;
  });
}

export function isRetiredCampaign(campaignId: unknown, audience: unknown) {
  return (campaignId !== undefined && campaignId !== REVIEW_CAMPAIGN.id)
    || (audience !== undefined && audience !== REVIEW_CAMPAIGN.audiencia);
}
