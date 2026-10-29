"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { OPEN_PRIVACY_SETTINGS, readOptionalConsent, saveOptionalConsent, subscribeOptionalConsent, syncAdvertisingCookie, syncAnalyticsCookie } from "@/lib/privacy/optional-consent";

const snapshot = () => `${readOptionalConsent("analytics")}:${readOptionalConsent("advertising")}`;
const serverSnapshot = () => "pending";
const button = "min-h-11 rounded-2xl border border-[#162543] bg-[#f3fbfe] px-5 py-3 text-sm font-bold text-[#162543] transition-colors hover:border-[#0083b0] hover:bg-[#e5f6fc] active:bg-[#d8f0fa] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009fd9]";

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
    ? "We use cookies and similar technologies to keep ContrataCR working securely. With your permission, they also help us improve the app and measure our ads with Meta. You can change your preferences at any time."
    : "Usamos cookies y tecnologías similares para que ContrataCR funcione de forma segura. Con tu permiso, también nos ayudan a mejorar la app y medir nuestros anuncios con Meta. Puedes cambiar tus preferencias cuando quieras.";
  const actions = <div className="grid gap-2.5">
    <button className={button} onClick={() => save(true, true)}>{en ? "Accept all" : "Aceptar todas"}</button>
    <button className={button} onClick={() => save(false, false)}>{en ? "Only necessary" : "Solo necesarias"}</button>
  </div>;
  return <>
    {needsChoice && !settings && <section role="region" aria-labelledby="cookie-title" data-cookie-banner className="fixed inset-x-0 bottom-0 z-[130] max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-[24px] border border-b-0 border-[#dce6ec] bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))] text-[#162543] shadow-[0_-8px_40px_rgba(22,37,67,0.12)] sm:bottom-6 sm:left-6 sm:right-auto sm:w-[380px] sm:rounded-[24px] sm:border-b sm:p-6 sm:shadow-[0_16px_64px_rgba(22,37,67,0.18)]">
      <h2 id="cookie-title" className="mb-3 text-lg font-extrabold leading-6">{en ? "Cookies and privacy" : "Cookies y privacidad"}</h2>
      <p className="mb-3 text-sm leading-6 text-[#526176]">{notice}</p>
      {actions}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4">
    <button className="min-h-11 rounded-lg text-xs font-semibold text-[#007fae] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-[#009fd9]" onClick={() => { setAnalytics(readOptionalConsent("analytics") === "accepted"); setAdvertising(readOptionalConsent("advertising") === "accepted"); setSettings(true); }}>{en ? "Manage preferences" : "Configurar preferencias"}</button>
        <Link href="/privacidad#cookies" className="inline-flex min-h-11 items-center rounded-lg text-xs font-semibold text-[#007fae] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-[#009fd9]">{en ? "Privacy policy" : "Política de privacidad"}</Link>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{en ? "Could not save your preferences. Please try again." : "No pudimos guardar tus preferencias. Inténtalo de nuevo."}</p>}
    </section>}
    <dialog ref={dialog} onCancel={() => setSettings(false)} onClose={() => setSettings(false)} aria-labelledby="privacy-settings-title" className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[95dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-[24px] border border-b-0 border-[#dce6ec] bg-white p-4 pb-[max(16px,env(safe-area-inset-bottom))] text-[#162543] shadow-2xl backdrop:bg-[#162543]/30 sm:inset-0 sm:m-auto sm:max-h-[90dvh] sm:max-w-lg sm:rounded-[24px] sm:border-b sm:p-6">
      <h2 id="privacy-settings-title" className="text-lg font-extrabold leading-6">{en ? "Cookies and privacy" : "Cookies y privacidad"}</h2>
      <p className="mb-3 mt-2 text-xs leading-4 text-[#526176]">{en ? "Choose statistics and advertising separately for this device. You can change your choice from the footer." : "Elige estadísticas y publicidad por separado en este dispositivo. Puedes cambiarlas desde el pie de página."}</p>
      <div className="grid gap-2">
        <div className="rounded-2xl border border-[#e5edf2] p-3"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-bold">{en ? "Necessary" : "Necesarias"}</h3><span className="text-xs font-semibold text-[#526176]">{en ? "Always active" : "Siempre activas"}</span></div><p className="mt-1 text-xs leading-4 text-[#526176]">{en ? "Sign-in, security, language, privacy choices and essential service records." : "Inicio de sesión, seguridad, idioma, preferencias y registros indispensables del servicio."}</p></div>
        {[{ key: "analytics", title: en ? "Usage statistics" : "Estadísticas de uso", value: analytics, change: setAnalytics, description: en ? "Visits and actions to improve the app, linked to your account or a visitor identifier." : "Visitas y acciones para mejorar la app, vinculadas a tu cuenta o a un identificador de visitante." }, { key: "advertising", title: en ? "Advertising and Meta" : "Publicidad y Meta", value: advertising, change: setAdvertising, description: en ? "Campaign events and technical identifiers sent to Meta. No private messages, documents or contact details. May involve international processing." : "Eventos de campañas e identificadores técnicos enviados a Meta. Sin mensajes privados, documentos ni datos de contacto. Puede implicar tratamiento internacional." }].map(item => <label key={item.key} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#e5edf2] p-3"><input type="checkbox" checked={item.value} onChange={event => item.change(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#0083b0]" /><span className="flex-1"><span className="text-sm font-bold">{item.title}</span><span className="mt-1 block text-xs leading-4 text-[#526176]">{item.description}</span></span></label>)}
      </div>
      <Link href="/privacidad#cookies" onClick={() => setSettings(false)} className="flex min-h-11 items-center text-xs font-semibold text-[#007fae] underline underline-offset-2">{en ? "Privacy policy" : "Política de privacidad"}</Link>
      <button onClick={() => save(analytics, advertising)} className={`${button} w-full`}>{en ? "Save preferences" : "Guardar preferencias"}</button>
      <button onClick={() => save(false, false)} className={`${button} mt-2 w-full`}>{en ? "Only necessary" : "Solo necesarias"}</button>
      <button autoFocus onClick={() => setSettings(false)} className="mt-1 flex min-h-11 w-full items-center justify-center rounded-lg text-sm font-semibold text-[#007fae] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-[#009fd9]">{en ? "Back" : "Volver"}</button>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{en ? "Could not save your preferences." : "No pudimos guardar tus preferencias."}</p>}
    </dialog>
  </>;
}
