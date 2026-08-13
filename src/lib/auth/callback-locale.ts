export type AuthCallbackLocale = "es" | "en";

export function resolveAuthCallbackLocale(localeParam: string | null, safeNext: string | null): AuthCallbackLocale {
  return localeParam === "en" || /^\/en(?:\/|$)/.test(safeNext ?? "") ? "en" : "es";
}
