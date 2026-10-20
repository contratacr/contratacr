"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { isNativeAppRuntime } from "@/hooks/use-native-app";
import { readOptionalConsent, saveOptionalConsent, subscribeOptionalConsent, type OptionalChoice } from "@/lib/privacy/optional-consent";

const snapshot = () => readOptionalConsent("advertising");
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
      <p className="text-sm leading-6 text-[#526176]">{en ? "Allow measurement of visits and actions with Meta to assess our advertising? You can use ContrataCR without accepting." : "¿Permite medir visitas y acciones con Meta para evaluar nuestra publicidad? Puede usar ContrataCR sin aceptar."}</p>
      <p className="text-sm">{choice === "accepted" ? (en ? "Advertising measurement enabled on this device." : "Medición publicitaria activada en este dispositivo.") : (en ? "Advertising measurement disabled on this device." : "Medición publicitaria desactivada en este dispositivo.")}</p>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => choose("declined")} className="min-h-11 rounded-full border border-[#009FD9] bg-white px-4 text-sm font-semibold text-[#0083b0]">{en ? "Reject" : "Rechazar"}</button>
        <button type="button" onClick={() => choose("accepted")} className="min-h-11 rounded-full border border-[#009FD9] bg-white px-4 text-sm font-semibold text-[#0083b0]">{en ? "Accept" : "Aceptar"}</button>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{en ? "Could not save. Measurement remains disabled unless a saved permission exists." : "No se pudo guardar. La medición permanece desactivada si no existe un permiso guardado."}</p>}
      <Link href="/privacidad#cookies" className="inline-flex min-h-11 items-center text-sm font-semibold text-[#0083b0]">{en ? "Privacy Policy" : "Política de Privacidad"}</Link>
    </section>
  );
}
