/** Keep in sync with the prospective ledger migration and published documents. */
export const LEGAL_VERSION = "2026-10-19";
export const LEGAL_DATE = { es: "19 de octubre de 2026", en: "October 19, 2026" };
export type PrivacyPurpose = "terms" | "marketing" | "advertising" | "ai" | "analytics";
export function legalLocale(locale: string): "en" | "es" {
  if (locale === "en") return "en";
  return "es";
}
export function signupLegalAcceptance(locale: string) {
  return { accepted: true, version: LEGAL_VERSION, locale: legalLocale(locale) };
}

export function privacyChoiceVersion(purpose: string) { return purpose === "analytics" || purpose === "advertising" ? "2026-10-29" : LEGAL_VERSION; }
