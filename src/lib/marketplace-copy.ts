import type { EmploymentType, ExperienceLevel, SalaryPeriod, WorkplaceType } from "@/lib/jobs";
import type { OfferPriceUnit, OfferType } from "@/lib/offers";

export type MarketplaceLocale = "es" | "en";

export function marketplaceLocale(locale?: string): MarketplaceLocale {
  return locale === "en" ? "en" : "es";
}

const EMPLOYMENT_TYPE_LABELS: Record<MarketplaceLocale, Record<EmploymentType, string>> = {
  es: { full_time: "Tiempo completo", part_time: "Medio tiempo", contract: "Por contrato", temporary: "Temporal", internship: "Pasantía" },
  en: { full_time: "Full-time", part_time: "Part-time", contract: "Contract", temporary: "Temporary", internship: "Internship" },
};

const WORKPLACE_TYPE_LABELS: Record<MarketplaceLocale, Record<WorkplaceType, string>> = {
  es: { onsite: "Presencial", hybrid: "Híbrido", remote: "Remoto" },
  en: { onsite: "On-site", hybrid: "Hybrid", remote: "Remote" },
};

const EXPERIENCE_LEVEL_LABELS: Record<MarketplaceLocale, Record<ExperienceLevel, string>> = {
  es: { any: "Sin experiencia requerida", one_plus: "1+ año de experiencia", two_plus: "2+ años de experiencia", three_plus: "3+ años de experiencia", five_plus: "5+ años de experiencia" },
  en: { any: "No experience required", one_plus: "1+ year of experience", two_plus: "2+ years of experience", three_plus: "3+ years of experience", five_plus: "5+ years of experience" },
};

const SALARY_PERIOD_LABELS: Record<MarketplaceLocale, Record<SalaryPeriod, string>> = {
  es: { hourly: "por hora", biweekly: "por quincena", monthly: "por mes", annual: "por año", project: "por proyecto" },
  en: { hourly: "per hour", biweekly: "every two weeks", monthly: "per month", annual: "per year", project: "per project" },
};

const OFFER_TYPE_LABELS: Record<MarketplaceLocale, Record<OfferType, string>> = {
  es: { service_offer: "Servicio en oferta", product: "Producto", package: "Paquete" },
  en: { service_offer: "Service offer", product: "Product", package: "Package" },
};

const OFFER_PRICE_UNIT_LABELS: Record<MarketplaceLocale, Record<OfferPriceUnit, string>> = {
  es: { total: "total", hour: "por hora", session: "por sesión", project: "por proyecto", month: "por mes" },
  en: { total: "total", hour: "per hour", session: "per session", project: "per project", month: "per month" },
};

export const employmentTypeLabel = (value: EmploymentType, locale?: string) => EMPLOYMENT_TYPE_LABELS[marketplaceLocale(locale)][value];
export const workplaceTypeLabel = (value: WorkplaceType, locale?: string) => WORKPLACE_TYPE_LABELS[marketplaceLocale(locale)][value];
export const experienceLevelLabel = (value: ExperienceLevel, locale?: string) => EXPERIENCE_LEVEL_LABELS[marketplaceLocale(locale)][value];
export const salaryPeriodLabel = (value: SalaryPeriod, locale?: string) => SALARY_PERIOD_LABELS[marketplaceLocale(locale)][value];
export const offerTypeLabel = (value: OfferType, locale?: string) => OFFER_TYPE_LABELS[marketplaceLocale(locale)][value];
export const offerPriceUnitLabel = (value: OfferPriceUnit, locale?: string) => OFFER_PRICE_UNIT_LABELS[marketplaceLocale(locale)][value];
