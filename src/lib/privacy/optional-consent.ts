/** Versioned, purpose-specific choices. Legacy implicit analytics flags are ignored. */
export const OPTIONAL_CONSENT_VERSION = "2026-10-19";
export const OPTIONAL_CONSENT_EVENT = "contratacr:privacy-choice";
export const ADS_CONSENT_COOKIE = "ccr_ads_consent_v1";
export type OptionalPurpose = "advertising" | "ai";
export type OptionalChoice = "accepted" | "declined" | "unknown";
const MAX_AGE = 180 * 86400;
export function consentKey(purpose: OptionalPurpose) { return `contratacr:consent:${purpose}:v1`; }

export function readOptionalConsent(purpose: OptionalPurpose): OptionalChoice {
  if (typeof window === "undefined") return "unknown";
  try {
    const raw = JSON.parse(window.localStorage.getItem(consentKey(purpose)) ?? "null");
    const age = Date.now() - Date.parse(raw?.at);
    if (raw?.version !== OPTIONAL_CONSENT_VERSION || !Number.isFinite(age) || age < 0 || age > MAX_AGE * 1000) return "unknown";
    return raw.choice === "accepted" || raw.choice === "declined" ? raw.choice : "unknown";
  } catch { return "unknown"; }
}

export function syncAdvertisingCookie() {
  if (typeof document === "undefined") return;
  const suffix = `; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  document.cookie = `${ADS_CONSENT_COOKIE}=${readOptionalConsent("advertising") === "accepted" ? "accepted" : "declined"}; Max-Age=${MAX_AGE}${suffix}`;
  // An earlier version enabled this legacy cookie without affirmative consent.
  document.cookie = `ccr_meta_consent=declined; Max-Age=0${suffix}`;
}

export function saveOptionalConsent(purpose: OptionalPurpose, choice: Exclude<OptionalChoice, "unknown">) {
  if (typeof window === "undefined") return;
  // If storage is blocked, do not claim consent was saved or enable tracking.
  window.localStorage.setItem(consentKey(purpose), JSON.stringify({ version: OPTIONAL_CONSENT_VERSION, choice, at: new Date().toISOString() }));
  if (purpose === "advertising") {
    syncAdvertisingCookie();
    if (choice === "declined") {
      try { window.sessionStorage.removeItem("contratacr:meta-pendientes"); } catch { /* storage optional */ }
      // Local tracking stops synchronously; notify the server to cancel any
      // pending conversions belonging to this same browser/account as well.
      if (typeof fetch === "function") void fetch("/api/privacy/advertising", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted: false, version: OPTIONAL_CONSENT_VERSION }), keepalive: true,
      }).catch(() => { /* Network failures do not turn local tracking back on. */ });
      for (const key of ["_fbp", "_fbc"]) {
        document.cookie = `${key}=; Path=/; Max-Age=0`;
        if (/(^|\.)contratacr\.com$/.test(location.hostname)) document.cookie = `${key}=; Path=/; Domain=.contratacr.com; Max-Age=0`;
      }
    }
  }
  window.dispatchEvent(new CustomEvent(OPTIONAL_CONSENT_EVENT, { detail: { purpose, choice } }));
}

export function subscribeOptionalConsent(onChange: () => void) {
  window.addEventListener(OPTIONAL_CONSENT_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(OPTIONAL_CONSENT_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
