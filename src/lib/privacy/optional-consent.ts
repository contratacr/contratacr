/** Versioned, purpose-specific choices. Legacy implicit analytics flags are ignored. */
export const OPTIONAL_CONSENT_VERSION = "2026-10-19";
export const OPTIONAL_CONSENT_EVENT = "contratacr:privacy-choice";
export const ADS_CONSENT_COOKIE = "ccr_ads_consent_v1";
export type OptionalPurpose = "advertising" | "ai";
export type OptionalChoice = "accepted" | "declined" | "unknown";
const WITHDRAWAL_KEY = "contratacr:advertising-withdrawal-pending";
let withdrawalInFlight: Promise<void> | null = null;
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

/** Limited measurement is a product setting, not a fabricated acceptance receipt.
 * A saved refusal survives expiry/version changes, including the legacy setting. */
export function advertisingMeasurementEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(WITHDRAWAL_KEY)) return false;
    if (window.localStorage.getItem("contratacr:analytics-consent") === "declined") return false;
    const raw = window.localStorage.getItem(consentKey("advertising"));
    if (!raw) return true;
    const saved = JSON.parse(raw);
    if (saved?.choice === "declined") return false;
    return readOptionalConsent("advertising") === "accepted";
  } catch { return false; }
}

export function syncAdvertisingCookie() {
  if (typeof document === "undefined") return;
  const suffix = `; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  const state = !advertisingMeasurementEnabled() ? "declined" : readOptionalConsent("advertising") === "accepted" ? "accepted" : "limited";
  document.cookie = `${ADS_CONSENT_COOKIE}=${state}; Max-Age=${MAX_AGE}${suffix}`;
  // An earlier version enabled this legacy cookie without affirmative consent.
  document.cookie = `ccr_meta_consent=declined; Max-Age=0${suffix}`;
}

export function saveOptionalConsent(purpose: OptionalPurpose, choice: Exclude<OptionalChoice, "unknown">) {
  if (typeof window === "undefined") return;
  // If storage is blocked, do not claim consent was saved or enable tracking.
  window.localStorage.setItem(consentKey(purpose), JSON.stringify({ version: OPTIONAL_CONSENT_VERSION, choice, at: new Date().toISOString() }));
  if (purpose === "advertising") {
    window.localStorage.removeItem("contratacr:analytics-consent");
    syncAdvertisingCookie();
    if (choice === "declined") {
      try { window.sessionStorage.removeItem("contratacr:meta-pendientes"); } catch { /* storage optional */ }
      // Persist only a retry marker, never an identity or advertising payload.
      window.localStorage.setItem(WITHDRAWAL_KEY, "1");
      void retryAdvertisingWithdrawal();
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

/** Guests also need withdrawal retried after a failed/offline request. A pending
 * withdrawal blocks advertising even if another tab enables it before delivery. */
export function retryAdvertisingWithdrawal(): Promise<void> {
  if (typeof window === "undefined" || typeof fetch !== "function") return Promise.resolve();
  if (withdrawalInFlight) return withdrawalInFlight;
  try { if (!window.localStorage.getItem(WITHDRAWAL_KEY)) return Promise.resolve(); }
  catch { return Promise.resolve(); }
  withdrawalInFlight = (async () => {
    try {
      const response = await fetch("/api/privacy/advertising", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted: false, version: OPTIONAL_CONSENT_VERSION }), keepalive: true,
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return;
      window.localStorage.removeItem(WITHDRAWAL_KEY);
      syncAdvertisingCookie();
      window.dispatchEvent(new CustomEvent(OPTIONAL_CONSENT_EVENT, { detail: { purpose: "advertising", synchronized: true } }));
    } catch { /* Keep the marker and local refusal until reconnection/next load. */ }
  })().finally(() => { withdrawalInFlight = null; });
  return withdrawalInFlight;
}
