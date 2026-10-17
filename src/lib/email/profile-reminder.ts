import { computeCompletion } from "@/lib/professional-completion";

export const PROFILE_REMINDER = {
  key: "completar-perfil-profesional-2026", days: 2, audience: "professional-intent", enabled: true,
  subject: "Completa tu perfil profesional en ContrataCR",
  body: "Tu perfil profesional todavía está pendiente de completar.\n\nSeguimos trabajando para dar a conocer ContrataCR y atraer a más personas que necesiten servicios. La plataforma está creciendo y las oportunidades pueden tomar tiempo en llegar.\n\nAgregá la información que falta para que quienes busquen tus servicios puedan conocer tu trabajo y decidir si quieren contactarte.\n\nPodés retomar el proceso desde tu cuenta de ContrataCR.",
  ctaLabel: "Completar mi perfil", ctaPath: "/continuar-perfil",
} as const;

export function professionalProfileIncomplete(account: {
  role: string | null; is_provider: boolean | null; professionalIntent?: boolean; avatar_url?: string | null;
}, pro: Record<string, unknown> | undefined): boolean {
  if (!pro) return account.professionalIntent === true || account.role === "professional" || account.is_provider === true;
  if (pro.is_banned !== false || pro.oculto_del_buscador !== false) return false;
  // Basic profile data uses the same checklist as the panel. Price, reviews,
  // optional credentials and portfolio have their own campaigns or are optional.
  const basics = new Set(["photo","whatsapp","services","location","bio"]);
  return computeCompletion({...pro,profiles:{avatar_url:account.avatar_url}}).items
    .some((item) => basics.has(item.key) && !item.done);
}

export function profileContinuationDestination(hasProfessionalProfile: boolean) {
  return hasProfessionalProfile ? "/dashboard/profesional?mode=offer&tab=completion" : "/registro/profesional";
}
