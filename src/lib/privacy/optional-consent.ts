/** Versioned, purpose-specific choices. Legacy implicit analytics flags are ignored. */
export const OPTIONAL_CONSENT_VERSION = "2026-10-29";
export const OPTIONAL_CONSENT_EVENT = "contratacr:privacy-choice";
export const ADS_CONSENT_COOKIE = "ccr_ads_consent_v2";
export type OptionalPurpose = "advertising" | "analytics" | "ai";
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
    if (raw?.version !== (purpose === "ai" ? "2026-10-19" : OPTIONAL_CONSENT_VERSION) || !Number.isFinite(age) || age < 0 || age > MAX_AGE * 1000) return "unknown";
    return raw.choice === "accepted" || raw.choice === "declined" ? raw.choice : "unknown";
  } catch { return "unknown"; }
}

/** Measurement requires a current affirmative choice.
 * A saved refusal survives expiry/version changes, including the legacy setting. */
export function advertisingMeasurementEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(WITHDRAWAL_KEY)) return false;
    if (window.localStorage.getItem("contratacr:analytics-consent") === "declined") return false;
    const raw = window.localStorage.getItem(consentKey("advertising"));
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (saved?.choice === "declined") return false;
    return readOptionalConsent("advertising") === "accepted";
  } catch { return false; }
}

function remainingAge(purpose: OptionalPurpose) {
  try { const raw = JSON.parse(window.localStorage.getItem(consentKey(purpose)) ?? "null"); return Math.max(0, Math.min(MAX_AGE, Math.floor((Date.parse(raw?.at) + MAX_AGE * 1000 - Date.now()) / 1000))) || 0; } catch { return 0; }
}

export function syncAdvertisingCookie() {
  if (typeof document === "undefined") return;
  const suffix = `; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  const state = !advertisingMeasurementEnabled() ? "declined" : readOptionalConsent("advertising") === "accepted" ? "accepted" : "declined";
  document.cookie = `${ADS_CONSENT_COOKIE}=${state}; Max-Age=${remainingAge("advertising")}${suffix}`;
  // An earlier version enabled this legacy cookie without affirmative consent.
  document.cookie = `ccr_meta_consent=declined; Max-Age=0${suffix}`;
}

export function saveOptionalConsent(purpose: OptionalPurpose, choice: Exclude<OptionalChoice, "unknown">) {
  if (typeof window === "undefined") return;
  // If storage is blocked, do not claim consent was saved or enable tracking.
  window.localStorage.setItem(consentKey(purpose), JSON.stringify({ version: purpose === "ai" ? "2026-10-19" : OPTIONAL_CONSENT_VERSION, choice, at: new Date().toISOString() }));
  if (purpose === "analytics") {
    syncAnalyticsCookie();
    if (choice === "declined") window.localStorage.setItem("contratacr:statistics-cleanup-pending", "1");
    void retryStatisticsCleanup();
  }
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
  window.addEventListener("focus", onChange);
  const timer = window.setInterval(onChange, 60_000);
  return () => {
    window.removeEventListener(OPTIONAL_CONSENT_EVENT, onChange);
    window.removeEventListener("storage", onChange);
    window.removeEventListener("focus", onChange);
    window.clearInterval(timer);
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

/** Optional product statistics are independent of advertising and AI. */
export function analyticsMeasurementEnabled() { return readOptionalConsent("analytics") === "accepted"; }
export function syncAnalyticsCookie() {
  if (typeof document === "undefined") return;
  const suffix = `; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  document.cookie = `ccr_statistics_consent_v1=${analyticsMeasurementEnabled() ? "accepted" : "declined"}; Max-Age=${remainingAge("analytics")}${suffix}`;
  if (!analyticsMeasurementEnabled()) {
    for (const name of ["ccr_action_attribution"]) document.cookie = `${name}=; Max-Age=0${suffix}`;
    for (const key of ["contratacr:attribution", "contratacr:attribution-first"]) window.localStorage.removeItem(key);
    window.sessionStorage.removeItem("ccr:usage-session:v1");
    window.localStorage.removeItem("ccr:app-first-use:v1");
  }
}
export const OPEN_PRIVACY_SETTINGS = "contratacr:open-privacy-settings";
export function openPrivacySettings() { window.dispatchEvent(new Event(OPEN_PRIVACY_SETTINGS)); }

let cleanupInFlight: Promise<void> | null = null;
export function retryStatisticsCleanup(): Promise<void> {
  if (typeof window === "undefined" || typeof fetch !== "function") return Promise.resolve();
  if (cleanupInFlight) return cleanupInFlight;
  try { if (!window.localStorage.getItem("contratacr:statistics-cleanup-pending")) return Promise.resolve(); } catch { return Promise.resolve(); }
  cleanupInFlight = (async () => {
    try {
      // Let a combined choice enqueue advertising withdrawal before erasing its browser identifier.
      await Promise.resolve();
      await retryAdvertisingWithdrawal();
      if (window.localStorage.getItem(WITHDRAWAL_KEY)) return;
      const response = await fetch("/api/privacy/measurement", { method: "DELETE", keepalive: true, signal: AbortSignal.timeout(8000) });
      if (response.ok) window.localStorage.removeItem("contratacr:statistics-cleanup-pending");
    } catch { /* Retry without blocking local refusal. */ }
  })().finally(() => { cleanupInFlight = null; });
  return cleanupInFlight;
}
