import { campanaDesdeAsunto } from "@/lib/email/campana";

// Stable identity: editing the subject never creates a new recipient history.
// Include the older general-services campaign, which already reached 404 accounts.
export const SERVICES_CAMPAIGN = {
  id: "recordatorio",
  key: "necesitas-un-electricista-un-abogado-o-u",
  historyKeys: ["necesitas-un-electricista-un-abogado-o-u", campanaDesdeAsunto("263 profesionales verificados, en un solo lugar")],
  nombre: "Servicios disponibles en ContrataCR",
  subject: "Encuentre servicios para su hogar y su negocio en ContrataCR",
  body: "En ContrataCR puede encontrar servicios de electricidad, construcción, remodelación, mecánica, contabilidad, asesoría legal y tecnología.\n\nRevise los servicios disponibles en su zona, compare los perfiles y contacte por WhatsApp al profesional que le interese.",
  ctaLabel: "Ver servicios disponibles",
  ctaPath: "/servicios",
  audiencia: "todas",
};
export const REVIEW_CAMPAIGN = {
  id: "resenas",
  key: "primeras-resenas-profesionales-2026",
  historyKeys: ["primeras-resenas-profesionales-2026"],
  nombre: "Pedir primeras reseñas",
  subject: "Destaca su perfil con su primera reseña",
  body: "Seguimos trabajando para dar a conocer ContrataCR y atraer a más personas que necesiten servicios. Mientras la comunidad crece, una reseña de un trabajo real puede ayudar a que quienes vean su perfil conozcan la experiencia de sus clientes.\n\nNo necesita esperar a conseguir un cliente en ContrataCR: puede pedir una reseña a personas para las que ya trabajó.\n\nEntre a Compartir → Pedir una reseña en su panel y envíeles el mensaje preparado por WhatsApp.",
  ctaLabel: "Pedir mi primera reseña",
  ctaPath: "/dashboard/profesional?mode=offer&share=reviews",
  audiencia: "pros_sin_resenas",
};
export const CAMPAIGN_EMAIL_COOLDOWN_DAYS = 14;
// The shared daily quota stops bulk sends with 50 of Brevo's 300 sends free.
export const CAMPAIGN_BATCH_SIZE = 250;

export type CampaignHistory = {
  profile_id?: string | null;
  email: string; campana: string; enviado_en: string;
  status: "sending" | "sent" | "uncertain";
  abierto_en?: string | null; click_en?: string | null; rebote_en?: string | null;
};
export function normalizeCampaignEmail(email: string) { return email.trim().toLowerCase(); }
export function isInternalCampaignRecipient(email: string, role?: string | null) {
  return role === "admin" || normalizeCampaignEmail(email) === "isaacsanchezmonge@gmail.com";
}

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
    if (isInternalCampaignRecipient(email) || blocked.has(email) || seen.has(email) || !email.includes("@") || email.endsWith("@contratacr.test")) return false;
    seen.add(email);
    return true;
  });
}

export function isRetiredCampaign(campaignId: unknown, audience: unknown) {
  return (campaignId !== undefined && campaignId !== REVIEW_CAMPAIGN.id)
    || (audience !== undefined && audience !== REVIEW_CAMPAIGN.audiencia);
}
