/** Keep in sync with the prospective ledger migration and published documents. */
export const LEGAL_VERSION = "2026-10-19";
export const LEGAL_DATE = { es: "19 de octubre de 2026", en: "October 19, 2026" };
export type PrivacyPurpose = "terms" | "marketing" | "advertising" | "ai";
export function signupLegalAcceptance(locale: string) {
  return { accepted: true, version: LEGAL_VERSION, locale: locale === "en" ? "en" : "es" };
}
