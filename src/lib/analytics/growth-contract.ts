export const GROWTH_ACTIONS = {
  service_contact: { event: "Contact", audience: "client", path: "/profesionales" },
  project_published: { event: "Lead", audience: "client", path: "/proyectos" },
  service_hire_confirmed: { event: "ServiceHireConfirmed", audience: "client", path: "/dashboard/cliente" },
  professional_profile_published: { event: "ProfessionalProfilePublished", audience: "professional", path: "/dashboard/profesional" },
  professional_project_contact: { event: "ProfessionalProjectContact", audience: "professional", path: "/proyectos" },
  professional_project_accepted: { event: "ProfessionalProjectAccepted", audience: "professional", path: "/proyectos" },
  service_offer_published: { event: "ServiceOfferPublished", audience: "professional", path: "/promociones" },
  employer_job_published: { event: "EmployerJobPublished", audience: "employer", path: "/empleos" },
} as const;
export type GrowthAction = keyof typeof GROWTH_ACTIONS;
export type MetaConversion = { eventName: string; eventId: string; params: { action: GrowthAction; audience: string } };
export const META_TEST_BUDGET = { currency: "USD", total: 14, days: 7, monthlyCeiling: 20 } as const;
export function usableProfessional(row: Record<string, unknown>): boolean {
  const services = Array.isArray(row.services) ? row.services as Record<string, unknown>[] : [];
  const account = (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles) as { is_disabled?: boolean } | null;
  return !account?.is_disabled && !row.is_banned && !row.oculto_del_buscador && row.verification_status !== "rejected"
    && Boolean(String(row.whatsapp ?? "").replace(/\D/g, "").length >= 8)
    && services.some(s => s.active !== false && s.enabled !== false && Boolean(s.name || s.title))
    && Boolean(row.coverage_country || row.provincia_id || (Array.isArray(row.coverage_provincias) && row.coverage_provincias.length) || (Array.isArray(row.coverage_areas) && row.coverage_areas.length));
}
export function qualifiesServiceContact(input: { jobId?: unknown; intent?: unknown; self?: boolean; contactingClient?: boolean; product?: boolean }): boolean {
  return !input.jobId && input.intent !== "job" && !input.self && !input.contactingClient && !input.product;
}
