"use client";
import { useLocale } from "next-intl";
import { openPrivacySettings } from "@/lib/privacy/optional-consent";
// `variant="link"` (the footer legal row) looks exactly like the Privacy and Terms links next to it; the default is the
// outlined button used inside the privacy page.
export function AdvertisingPreferences({ variant = "button" }: { variant?: "button" | "link" }) {
  const en = useLocale() === "en";
  const label = en ? "Cookie and privacy settings" : "Configurar cookies y privacidad";
  if (variant === "link") {
    return <button type="button" data-advertising-preferences onClick={openPrivacySettings} className="text-left text-xs text-[#162543] transition-colors hover:text-[#0083b0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009fd9]">{label}</button>;
  }
  return <section aria-label={en ? "Privacy preferences" : "Preferencias de privacidad"} data-advertising-preferences>
    <button type="button" onClick={openPrivacySettings} className="min-h-11 rounded-full border border-[#0083b0] px-5 py-3 text-sm font-semibold text-[#007fae]">{label}</button>
  </section>;
}
