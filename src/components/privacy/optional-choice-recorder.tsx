"use client";
import { useEffect } from "react";
import { useLocale } from "next-intl";
import { useAuth } from "@/hooks/use-auth";
import { isNativeAppRuntime } from "@/hooks/use-native-app";
import { privacyChoiceVersion, legalLocale } from "@/lib/privacy/legal-version";
import { OPTIONAL_CONSENT_EVENT, type OptionalPurpose } from "@/lib/privacy/optional-consent";

/** Mirror only explicit actions made by this account, never another device user's old choice. */
export function OptionalChoiceRecorder() {
  const { user } = useAuth();
  const userId = user?.id;
  const locale = useLocale();
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    let chain = Promise.resolve();
    const key = (purpose: OptionalPurpose) => `contratacr:pending-choice:${userId}:${purpose}`;
    const enqueue = (purpose: OptionalPurpose, body: string) => {
      try { sessionStorage.setItem(key(purpose), body); } catch { /* Send directly if storage is blocked. */ }
      // Preserve order when a user accepts then withdraws in quick succession.
      chain = chain.catch(() => {}).then(async () => {
        if (controller.signal.aborted) return;
        const response = await fetch("/api/privacy/choices", { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: controller.signal });
        if (!response.ok) return;
        try { if (sessionStorage.getItem(key(purpose)) === body) sessionStorage.removeItem(key(purpose)); } catch { /* storage optional */ }
      }).catch(() => { /* Retry only for this same account when online or on next load. */ });
    };
    const onChoice = (event: Event) => {
      const detail = (event as CustomEvent<{purpose: OptionalPurpose; choice: string}>).detail;
      if (!detail || !["advertising","ai","analytics"].includes(detail.purpose) || !["accepted","declined"].includes(detail.choice)) return;
      enqueue(detail.purpose, JSON.stringify({ purpose: detail.purpose, accepted: detail.choice === "accepted", version: privacyChoiceVersion(detail.purpose), locale: legalLocale(locale), channel: isNativeAppRuntime() ? "native" : "web" }));
    };
    const retry = () => {
      for (const purpose of ["advertising","ai","analytics"] as const) {
        try {
          const body = sessionStorage.getItem(key(purpose));
          if (body) {
            const pending = JSON.parse(body);
            if (pending.purpose === purpose && pending.version === privacyChoiceVersion(purpose) && typeof pending.accepted === "boolean") enqueue(purpose, body);
          }
        } catch { /* no pending receipt */ }
      }
    };
    retry();
    window.addEventListener(OPTIONAL_CONSENT_EVENT, onChoice);
    window.addEventListener("online", retry);
    return () => {
      controller.abort();
      window.removeEventListener(OPTIONAL_CONSENT_EVENT, onChoice);
      window.removeEventListener("online", retry);
    };
  }, [userId, locale]);
  return null;
}
