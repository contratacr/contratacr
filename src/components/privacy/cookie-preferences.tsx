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
      setAnalytics(readOptionalConsent("analytics") !== "declined");
      setAdvertising(readOptionalConsent("advertising") !== "declined");
      setSettings(true);
    };
    window.addEventListener(OPEN_PRIVACY_SETTINGS, open);
    return () => window.removeEventListener(OPEN_PRIVACY_SETTINGS, open);
  }, []);
  useEffect(() => {
    if (settings) {
      dialog.current?.showModal();
      dialog.current?.querySelector<HTMLElement>("#privacy-settings-title")?.focus({ preventScroll: true });
    }
    else dialog.current?.close();
  }, [settings]);
  function save(stats: boolean, ads: boolean) {
    try {
      saveOptionalConsent("analytics", stats ? "accepted" : "declined");
      saveOptionalConsent("advertising", ads ? "accepted" : "declined");
      setError(false); setSettings(false);
    } catch { setError(true); }
  }
  function openSettings() {
    setAnalytics(readOptionalConsent("analytics") !== "declined");
    setAdvertising(readOptionalConsent("advertising") !== "declined");
    setSettings(true);
  }
  const notice = en
    ? 'We use necessary cookies to keep ContrataCR working securely. By choosing “Agree”, you accept optional usage statistics and advertising measurement with Meta. In “Settings” you can accept or reject each purpose. You can change your choice at any time.'
    : 'Usamos cookies necesarias para que ContrataCR funcione de forma segura. Al elegir “De acuerdo”, aceptás las estadísticas de uso y la medición publicitaria con Meta. En “Configuración” podés aceptar o rechazar cada fin opcional. Podés cambiar tu decisión cuando quieras.';
  const categories = [
    { key: "necessary", title: en ? "Necessary" : "Necesarias", description: en ? "Sign-in, security, language, privacy choices and essential service records. These functions are always active and cannot be disabled here." : "Inicio de sesión, seguridad, idioma, preferencias y registros indispensables del servicio. Estas funciones están siempre activas y no se pueden desactivar aquí." },
    { key: "analytics", title: en ? "Statistics" : "Estadísticas", value: analytics, change: setAnalytics, description: en ? "Visits and actions to improve the app, linked to your account or a visitor identifier. These records are not necessarily anonymous. Optional statistics stay off unless you accept them." : "Visitas y acciones para mejorar la app, vinculadas a tu cuenta o a un identificador de visitante. Estos registros no son necesariamente anónimos. Las estadísticas opcionales permanecen desactivadas hasta que las aceptés." },
    { key: "advertising", title: en ? "Marketing" : "Marketing", value: advertising, change: setAdvertising, description: en ? "Campaign measurement with Meta using events and technical identifiers. No private messages, documents or contact details. Advertising identifiers are not anonymous; processing may take place abroad. This permission is separate from promotional emails and operating system permissions." : "Medición de campañas con Meta mediante eventos e identificadores técnicos. Sin mensajes privados, documentos ni datos de contacto. Los identificadores publicitarios no son anónimos y puede haber tratamiento internacional. Este permiso es independiente de los correos promocionales y los permisos del sistema operativo." },
  ];
  return <>
    {needsChoice && !settings && <section role="region" aria-labelledby="cookie-title" data-cookie-banner className="fixed inset-x-0 bottom-0 z-[130] max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-[24px] border border-b-0 border-[#dce6ec] bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))] text-[#162543] shadow-[0_-8px_40px_rgba(22,37,67,0.12)] sm:bottom-6 sm:left-6 sm:right-auto sm:w-[380px] sm:rounded-[24px] sm:border-b sm:p-6 sm:shadow-[0_16px_64px_rgba(22,37,67,0.18)]">
      <h2 id="cookie-title" className="mb-3 text-lg font-extrabold leading-6">{en ? "Cookies and privacy" : "Cookies y privacidad"}</h2>
      <p className="mb-3 text-sm leading-6 text-[#526176]">{notice}</p>
      <div className="grid gap-2.5">
        <button className={button} onClick={openSettings}>{en ? "Settings" : "Configuración"}</button>
        <button className={button} onClick={() => save(true, true)}>{en ? "Agree" : "De acuerdo"}</button>
      </div>
      <Link href="/privacidad#cookies" className="mx-auto mt-2 flex min-h-11 w-fit items-center rounded-lg text-xs font-semibold text-[#007fae] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-[#009fd9]">{en ? "Privacy policy" : "Política de privacidad"}</Link>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{en ? "Could not save your preferences. Please try again." : "No pudimos guardar tus preferencias. Inténtalo de nuevo."}</p>}
    </section>}
    <dialog ref={dialog} onCancel={() => setSettings(false)} onClose={() => setSettings(false)} aria-labelledby="privacy-settings-title" className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[95dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-[24px] border border-b-0 border-[#dce6ec] bg-white p-4 pb-[max(16px,env(safe-area-inset-bottom))] text-[#162543] shadow-2xl backdrop:bg-[#162543]/30 sm:inset-0 sm:m-auto sm:max-h-[90dvh] sm:max-w-lg sm:rounded-[24px] sm:border-b sm:p-6">
      <h2 id="privacy-settings-title" tabIndex={-1} className="text-lg font-extrabold leading-6 outline-none!">{en ? "Data privacy settings" : "Configuración de privacidad"}</h2>
      <p className="mb-3 mt-2 text-xs leading-4 text-[#526176]">{en ? "Choose what to accept and press “Save”. Turn off both options to use only necessary cookies. Change your decision from the footer at any time." : "Elegí qué aceptás y pulsá “Guardar”. Desactivá ambas opciones para usar solo las cookies necesarias. Cambiá tu decisión desde el pie de página cuando quieras."}</p>
      <button className={`${button} mb-3 w-full`} onClick={() => save(true, true)}>{en ? "Accept all" : "Aceptar todo"}</button>
      <div className="grid gap-2">
        {categories.map(item => <div key={item.key} className="rounded-2xl border border-[#e5edf2] p-3">
          <div className="flex items-center justify-between gap-3">
            <h3 id={`privacy-${item.key}`} className="text-sm font-bold">{item.title}</h3>
            {item.change ? <input type="checkbox" aria-labelledby={`privacy-${item.key}`} checked={item.value} onChange={event => item.change?.(event.target.checked)} className="h-5 w-5 shrink-0 accent-[#0083b0]" /> : <span className="text-xs font-semibold text-[#526176]">{en ? "Always active" : "Siempre activas"}</span>}
          </div>
          <details className="mt-1 text-xs leading-4 text-[#526176]">
            <summary className="w-fit cursor-pointer rounded py-1 font-semibold text-[#007fae] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-[#009fd9]">{en ? "More information" : "Más información"}<span className="sr-only">: {item.title}</span></summary>
            <p className="mt-2">{item.description}</p>
          </details>
        </div>)}
      </div>
      <Link href="/privacidad#cookies" onClick={() => setSettings(false)} className="flex min-h-11 items-center text-xs font-semibold text-[#007fae] underline underline-offset-2">{en ? "Privacy policy" : "Política de privacidad"}</Link>
      <button onClick={() => save(analytics, advertising)} className={`${button} w-full`}>{en ? "Save" : "Guardar"}</button>
      <button onClick={() => setSettings(false)} className="mx-auto mt-1 flex min-h-11 w-fit items-center justify-center rounded px-2 text-sm font-semibold text-[#162543] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009fd9]">{en ? "Back" : "Volver"}</button>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{en ? "Could not save your preferences." : "No pudimos guardar tus preferencias."}</p>}
    </dialog>
  </>;
}
