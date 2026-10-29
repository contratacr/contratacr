"use client";
import { useLocale } from "next-intl";
import { openPrivacySettings } from "@/lib/privacy/optional-consent";
export function AdvertisingPreferences() {
  const en = useLocale() === "en";
  return <section aria-label={en ? "Privacy preferences" : "Preferencias de privacidad"} data-advertising-preferences>
    <button type="button" onClick={openPrivacySettings} className="min-h-11 rounded-full border border-[#0083b0] px-5 py-3 text-sm font-semibold text-[#007fae]">{en ? "Cookies and privacy settings" : "Configurar cookies y privacidad"}</button>
  </section>;
}
