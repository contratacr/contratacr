"use client";

import { useLocale } from "next-intl";

const CONSENT_KEY = "contratacr:analytics-consent";

export function PrivacyPreferences() {
  const en = useLocale() === "en";

  function save(value: "accepted" | "declined") {
    window.localStorage.setItem(CONSENT_KEY, value);
    window.location.reload();
  }

  return (
    <div className="mt-4 border-t border-[#e5e7eb] pt-4">
      <p className="font-semibold text-[#374151]">{en ? "Measurement preferences" : "Preferencias de medición"}</p>
      <p className="mt-1 leading-5">
        {en
          ? "You can change whether Meta Pixel is allowed on this device."
          : "Puede cambiar si permite Meta Pixel en este dispositivo."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => save("declined")} className="min-h-9 rounded-lg border border-[#cdd8e1] px-3 font-semibold text-[#526277] hover:border-[#9fb5c5]">
          {en ? "Essential only" : "Solo esenciales"}
        </button>
        <button type="button" onClick={() => save("accepted")} className="min-h-9 rounded-lg bg-[#009FD9] px-3 font-semibold text-white hover:bg-[#0089BB]">
          {en ? "Allow measurement" : "Aceptar medición"}
        </button>
      </div>
    </div>
  );
}
