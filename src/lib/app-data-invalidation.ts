"use client";

export const APP_DATA_INVALIDATED_EVENT = "contratacr:data-invalidated";
export const APP_DATA_INVALIDATED_KEY = "contratacr:last-data-invalidation";

export type AppDataDomain = "offers" | "jobs" | "profile" | "availability" | "saved" | "notifications" | "all";
export type AppDataInvalidation = { domain: AppDataDomain; at: number };

export function invalidateAppData(domain: AppDataDomain = "all") {
  if (typeof window === "undefined") return;
  const detail: AppDataInvalidation = { domain, at: Date.now() };
  try { window.localStorage.setItem(APP_DATA_INVALIDATED_KEY, JSON.stringify(detail)); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent<AppDataInvalidation>(APP_DATA_INVALIDATED_EVENT, { detail }));
}

export function readLastAppDataInvalidation(): AppDataInvalidation | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(APP_DATA_INVALIDATED_KEY) ?? "null") as Partial<AppDataInvalidation> | null;
    return value && typeof value.at === "number" && typeof value.domain === "string" ? value as AppDataInvalidation : null;
  } catch {
    return null;
  }
}
