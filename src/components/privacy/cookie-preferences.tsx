"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocale } from "next-intl";
import { ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { OPEN_PRIVACY_SETTINGS, readOptionalConsent, saveOptionalConsent, subscribeOptionalConsent, syncAdvertisingCookie, syncAnalyticsCookie } from "@/lib/privacy/optional-consent";

const snapshot = () => `${readOptionalConsent("analytics")}:${readOptionalConsent("advertising")}`;
const serverSnapshot = () => "pending";
const button = "min-h-11 rounded-2xl border border-[#162543] px-5 py-3 text-sm font-bold transition-colors hover:bg-[#edf7fb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009fd9]";

export function CookiePreferences() {
  const en = useLocale() === "en";
  const state = useSyncExternalStore(subscribeOptionalConsent, snapshot, serverSnapshot);
  const [settings, setSettings] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [advertising, setAdvertising] = useState(false);
  const [error, setError] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const needsChoice = state !== "pending" && state.includes("unknown");
  useEffect(() => {
    try { syncAdvertisingCookie(); syncAnalyticsCookie(); } catch { /* Choice stays unknown when storage is unavailable. */ }
    const open = () => {
      setAnalytics(readOptionalConsent("analytics") === "accepted");
      setAdvertising(readOptionalConsent("advertising") === "accepted");
      setSettings(true);
    };
    window.addEventListener(OPEN_PRIVACY_SETTINGS, open);
    return () => window.removeEventListener(OPEN_PRIVACY_SETTINGS, open);
  }, []);
  useEffect(() => {
    if (settings) dialog.current?.showModal();
    else dialog.current?.close();
  }, [settings]);
  function save(stats: boolean, ads: boolean) {
    try {
      saveOptionalConsent("analytics", stats ? "accepted" : "declined");
      saveOptionalConsent("advertising", ads ? "accepted" : "declined");
      setError(false); setSettings(false);
    } catch { setError(true); }
  }
  const notice = en
    ? "Necessary technologies keep your session secure and the app working. With your permission, we also measure how ContrataCR is used and the results of our ads with Meta. You choose, and can change your choice at any time."
    : "Las tecnologías necesarias protegen tu sesión y permiten usar la app. Con tu permiso, también medimos el uso de ContrataCR y los resultados de nuestros anuncios con Meta. Tú eliges y puedes cambiar tu decisión cuando quieras.";
  const actions = <div className="grid gap-2.5">
    <button className={button} onClick={() => save(true, true)}>{en ? "Accept all" : "Aceptar todas"}</button>
    <button className={button} onClick={() => save(false, false)}>{en ? "Only necessary" : "Solo necesarias"}</button>
    <button className="flex min-h-11 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-semibold text-[#526176] hover:bg-[#f1f5f9] focus-visible:outline-2 focus-visible:outline-[#009fd9]" onClick={() => { setAnalytics(readOptionalConsent("analytics") === "accepted"); setAdvertising(readOptionalConsent("advertising") === "accepted"); setSettings(true); }}><SlidersHorizontal size={16} aria-hidden="true" />{en ? "Settings" : "Configurar"}</button>
  </div>;
  return <>
    {needsChoice && !settings && <section role="region" aria-labelledby="cookie-title" data-cookie-banner className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-[130] max-h-[85dvh] overflow-y-auto rounded-[24px] border border-[#dce6ec] bg-white p-5 text-[#162543] shadow-[0_16px_64px_rgba(22,37,67,0.18)] sm:left-6 sm:right-auto sm:w-[380px] sm:p-6">
      <div className="mb-4 flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#e9f8fd] text-[#0083b0]"><ShieldCheck size={23} aria-hidden="true" /></span><h2 id="cookie-title" className="text-lg font-extrabold leading-6">{en ? "Your privacy, your choice" : "Tu privacidad, tú decides"}</h2></div>
      <p className="mb-3 text-sm leading-6 text-[#526176]">{notice}</p>
      <p className="mb-5 text-xs leading-5 text-[#526176]">{en ? "Only necessary turns off optional statistics and advertising measurement." : "Solo necesarias desactiva las estadísticas opcionales y la medición publicitaria."} <Link href="/privacidad#cookies" className="font-semibold text-[#007fae] underline underline-offset-2">{en ? "Privacy policy" : "Política de privacidad"}</Link></p>
      {actions}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{en ? "Could not save your preferences. Please try again." : "No pudimos guardar tus preferencias. Inténtalo de nuevo."}</p>}
    </section>}
    <dialog ref={dialog} onCancel={() => setSettings(false)} onClose={() => setSettings(false)} aria-labelledby="privacy-settings-title" className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_24px)] max-w-lg overflow-y-auto rounded-[24px] border border-[#dce6ec] bg-white p-5 text-[#162543] shadow-2xl backdrop:bg-[#162543]/40 sm:p-7">
      <div className="mb-5 flex items-start justify-between gap-4"><h2 id="privacy-settings-title" className="text-xl font-extrabold">{en ? "Privacy preferences" : "Preferencias de privacidad"}</h2><button autoFocus onClick={() => setSettings(false)} aria-label={en ? "Close" : "Cerrar"} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-[#f1f5f9]"><X size={20} /></button></div>
      <p className="mb-5 text-sm leading-6 text-[#526176]">{en ? "These choices apply to this browser or app on this device. They do not accept terms, marketing emails, AI access or operating-system permissions." : "Estas opciones se aplican a este navegador o app en este dispositivo. No aceptan los términos, correos promocionales, acceso de IA ni permisos del sistema."}</p>
      <div className="divide-y divide-[#e5edf2] rounded-2xl border border-[#e5edf2] px-4">
        <div className="py-4"><div className="flex justify-between gap-3"><h3 className="text-sm font-bold">{en ? "Necessary" : "Necesarias"}</h3><span className="text-xs font-semibold text-[#526176]">{en ? "Always active" : "Siempre activas"}</span></div><p className="mt-2 text-sm leading-5 text-[#526176]">{en ? "Sign-in, security, language and saving this choice. Essential service and security records remain available." : "Inicio de sesión, seguridad, idioma y guardar esta elección. Se conservan los registros necesarios del servicio y de seguridad."}</p></div>
        {[{ key: "analytics", title: en ? "Usage statistics" : "Estadísticas de uso", value: analytics, change: setAnalytics, description: en ? "Visits, navigation and use of features to improve the app. Activity may be linked to your account or a pseudonymous visitor identifier." : "Visitas, navegación y uso de funciones para mejorar la app. La actividad puede vincularse a tu cuenta o a un identificador seudónimo de visitante." }, { key: "advertising", title: en ? "Advertising measurement" : "Medición publicitaria", value: advertising, change: setAdvertising, description: en ? "Measure campaign results with Meta using events and technical identifiers. We do not send private messages, documents or contact details. This may involve international data processing." : "Medir resultados de campañas con Meta mediante eventos e identificadores técnicos. No enviamos mensajes privados, documentos ni datos de contacto. Puede implicar tratamiento internacional de datos." }].map(item => <label key={item.key} className="flex cursor-pointer items-start gap-4 py-4"><span className="flex-1"><span className="text-sm font-bold">{item.title}</span><span className="mt-2 block text-sm leading-5 text-[#526176]">{item.description}</span></span><input type="checkbox" checked={item.value} onChange={event => item.change(event.target.checked)} className="mt-1 h-6 w-6 shrink-0 accent-[#0083b0]" /></label>)}
      </div>
      <button onClick={() => save(analytics, advertising)} className={`${button} mt-5 w-full`}>{en ? "Save preferences" : "Guardar preferencias"}</button>
      <button onClick={() => save(false, false)} className={`${button} mt-2.5 w-full`}>{en ? "Only necessary" : "Solo necesarias"}</button>
      <Link href="/privacidad#cookies" onClick={() => setSettings(false)} className="mt-3 flex min-h-11 items-center justify-center text-sm font-semibold text-[#007fae] underline">{en ? "Privacy policy" : "Política de privacidad"}</Link>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{en ? "Could not save your preferences." : "No pudimos guardar tus preferencias."}</p>}
    </dialog>
  </>;
}
