"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { isNativeAppRuntime } from "@/hooks/use-native-app";
import { advertisingMeasurementEnabled, saveOptionalConsent, subscribeOptionalConsent, type OptionalChoice } from "@/lib/privacy/optional-consent";

const snapshot = (): OptionalChoice => advertisingMeasurementEnabled() ? "accepted" : "declined";
const serverSnapshot = (): OptionalChoice => "unknown";
// Only embedded in Privacy/account settings; never an automatic overlay.
export function AdvertisingPreferences() {
  const en = useLocale() === "en";
  const choice = useSyncExternalStore(subscribeOptionalConsent, snapshot, serverSnapshot);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(!isNativeAppRuntime()));
    return () => cancelAnimationFrame(frame);
  }, []);
  if (!ready) return null;
  function choose(value: "accepted" | "declined") {
    try { saveOptionalConsent("advertising", value); setError(false); } catch { setError(true); }
  }
  return (
    <section aria-label={en ? "Advertising preferences" : "Preferencias de publicidad"} data-advertising-preferences
      className="space-y-3 text-[#162543]">
      <h2 className="text-base font-bold">{en ? "Advertising preferences" : "Preferencias de publicidad"}</h2>
      <p className="text-sm leading-6 text-[#526176]">{en ? "Limited measurement of visits and conversions with Meta helps assess our ads. It excludes names, contact details and private content. You can turn it off without losing access." : "La medición limitada de visitas y conversiones con Meta permite evaluar nuestros anuncios. Excluye nombres, datos de contacto y contenido privado. Puede desactivarla sin perder acceso."}</p>
      <p className="text-sm">{choice === "accepted" ? (en ? "Advertising measurement enabled on this device." : "Medición publicitaria activada en este dispositivo.") : (en ? "Advertising measurement disabled on this device." : "Medición publicitaria desactivada en este dispositivo.")}</p>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => choose("declined")} className="min-h-11 rounded-full border border-[#009FD9] bg-white px-4 text-sm font-semibold text-[#0083b0]">{en ? "Disable" : "Desactivar"}</button>
        <button type="button" onClick={() => choose("accepted")} className="min-h-11 rounded-full border border-[#009FD9] bg-white px-4 text-sm font-semibold text-[#0083b0]">{en ? "Enable" : "Activar"}</button>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{en ? "Could not save this change. Your previous setting remains in effect." : "No se pudo guardar el cambio. Se mantiene la configuración anterior."}</p>}
      <Link href="/privacidad#cookies" className="inline-flex min-h-11 items-center text-sm font-semibold text-[#0083b0]">{en ? "Privacy Policy" : "Política de Privacidad"}</Link>
    </section>
  );
}
