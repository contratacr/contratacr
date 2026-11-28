"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { OPEN_PRIVACY_SETTINGS, acceptUndecidedOptionalConsent, readOptionalConsent, saveOptionalConsent, subscribeOptionalConsent, syncAdvertisingCookie, syncAnalyticsCookie } from "@/lib/privacy/optional-consent";

/** The Capacitor shell marks the document; same signals as use-native-app, without its heavy imports. */
function isNativeAppRuntime() {
  if (typeof window === "undefined") return false;
  const capacitor = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(capacitor?.isNativePlatform?.()) || document.documentElement.classList.contains("ccr-native-app");
}

const snapshot = () => `${readOptionalConsent("analytics")}:${readOptionalConsent("advertising")}`;
const serverSnapshot = () => "pending";

export function CookiePreferences() {
  const en = useLocale() === "en";
  const state = useSyncExternalStore(subscribeOptionalConsent, snapshot, serverSnapshot);
  const [settings, setSettings] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [advertising, setAdvertising] = useState(false);
  const [error, setError] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const needsChoice = state !== "pending" && state.includes("unknown");
  const pathname = usePathname();
  const shownAt = useRef<string | null | undefined>(undefined);
  const settingsOpen = useRef(false);
  useEffect(() => { settingsOpen.current = settings; }, [settings]);
  // IMPLIED ACCEPTANCE (web only). The notice says that browsing the site means acceptance.
  // It counts once the notice has been on screen and the person moves to ANOTHER page of
  // the app (client-side navigation). A hard reload, the first page view and an open
  // settings panel never count. A refusal saved earlier is never overridden. The native
  // app does not use implied acceptance: there only "Continuar" accepts.
  useEffect(() => {
    if (!needsChoice) { shownAt.current = undefined; return; }
    if (shownAt.current === undefined) { shownAt.current = pathname; return; }
    if (pathname === shownAt.current || settingsOpen.current || isNativeAppRuntime()) return;
    try { acceptUndecidedOptionalConsent("implicit"); } catch { /* Storage blocked: stays undecided. */ }
  }, [needsChoice, pathname]);
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
  // "Continuar" is an explicit acceptance of what is still undecided; a refusal that is
  // still valid is kept (the person can change it from the settings).
  function continueToSite() {
    try {
      for (const purpose of ["analytics", "advertising"] as const) {
        if (readOptionalConsent(purpose) !== "declined") saveOptionalConsent(purpose, "accepted", "click");
      }
      setError(false);
    } catch { setError(true); }
  }
  // "Continuar" is an explicit acceptance. The X also counts as acceptance on the web,
  // but never overrides an earlier refusal; in the native app the X only dismisses.
  function closeNotice() {
    if (isNativeAppRuntime()) return;
    try { acceptUndecidedOptionalConsent("close"); setError(false); } catch { setError(true); }
  }
  const noticeIntro = en
    ? "ContrataCR uses cookies and pixels to improve the experience and analyze performance and traffic. We also use pixels to share information about use of the site with third parties, including social media, advertising and analytics partners. By browsing our site, you agree to that use and to that information being shared with those partners."
    : "ContrataCR usa cookies y píxeles para mejorar la experiencia y analizar el rendimiento y el tráfico. También usa píxeles para compartir información sobre el uso del sitio con terceros, incluidos socios de redes sociales, publicidad y analítica. Al navegar por nuestro sitio, usted acepta ese uso y que se comparta la información con esos socios.";
  const categorySummaries: Record<string, string> = {
    necessary: en ? "Sign-in, security and essential preferences." : "Inicio de sesión, seguridad y preferencias esenciales.",
    analytics: en ? "Visits and actions to improve ContrataCR." : "Visitas y acciones para mejorar ContrataCR.",
    advertising: en ? "Advertising campaign measurement with Meta." : "Medición de campañas publicitarias con Meta.",
  };
  const categories = [
    { key: "necessary", title: en ? "Necessary" : "Necesarias", description: en ? "Sign-in, security, language, privacy choices and essential service records. These functions are always active and cannot be disabled here." : "Inicio de sesión, seguridad, idioma, preferencias y registros indispensables del servicio. Estas funciones están siempre activas y no se pueden desactivar aquí." },
    { key: "analytics", title: en ? "Statistics" : "Estadísticas", value: analytics, change: setAnalytics, description: en ? "Visits and actions to improve the app, linked to your account or a visitor identifier. These records are not necessarily anonymous. Optional statistics stay off unless you accept them." : "Visitas y acciones para mejorar la app, vinculadas a su cuenta o a un identificador de visitante. Estos registros no son necesariamente anónimos. Las estadísticas opcionales permanecen desactivadas hasta que usted las acepte." },
    { key: "advertising", title: en ? "Marketing" : "Marketing", value: advertising, change: setAdvertising, description: en ? "Campaign measurement with Meta using events and technical identifiers. No private messages, documents or contact details. Advertising identifiers are not anonymous; processing may take place abroad. This permission is separate from promotional emails and operating system permissions." : "Medición de campañas con Meta mediante eventos e identificadores técnicos. Sin mensajes privados, documentos ni datos de contacto. Los identificadores publicitarios no son anónimos y puede haber tratamiento internacional. Este permiso es independiente de los correos promocionales y los permisos del sistema operativo." },
  ];
  return <>
    {needsChoice && !settings && <section role="region" aria-labelledby="cookie-title" data-cookie-banner className="fixed inset-x-0 bottom-0 z-[130] max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-[24px] border border-b-0 border-[#dce6ec] bg-white px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3.5 text-[#162543] shadow-[0_-8px_40px_rgba(22,37,67,0.12)] sm:bottom-6 sm:left-6 sm:right-auto sm:w-[400px] sm:rounded-[24px] sm:border-b sm:p-5 sm:shadow-[0_16px_64px_rgba(22,37,67,0.18)]">
      <button type="button" data-cookie-close aria-label={en ? "Close" : "Cerrar"} onClick={closeNotice} className="absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-full text-[#162543] transition-colors hover:bg-[#f3fbfe] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009fd9]"><X className="h-5 w-5" aria-hidden="true" /></button>
      <h2 id="cookie-title" className="mb-1 pr-8 text-lg font-extrabold leading-[1.2]">{en ? "Cookies and tracking pixels" : "Cookies y píxeles de seguimiento"}</h2>
      <p className="mb-2.5 text-sm leading-[1.3] text-[#526176]">{noticeIntro}{" "}<Link href="/privacidad#cookies" className="font-semibold text-[#162543] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-[#009fd9]">{en ? "Cookie Policy and Privacy Notice" : "Política de cookies y Aviso de privacidad"}</Link>.</p>
      <button type="button" data-cookie-continue className="min-h-11 w-full rounded-2xl border border-[#162543] bg-[#162543] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#0f1a31] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009fd9]" onClick={continueToSite}>{en ? "Continue to site" : "Continuar"}</button>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{en ? "Could not save your preferences. Please try again." : "No pudimos guardar sus preferencias. Inténtelo de nuevo."}</p>}
    </section>}
    <dialog ref={dialog} onCancel={() => setSettings(false)} onClose={() => setSettings(false)} aria-labelledby="privacy-settings-title" className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[95dvh] w-full max-w-none overflow-hidden rounded-t-[24px] border border-b-0 border-[#dce6ec] bg-white p-0 text-[#162543] shadow-2xl backdrop:bg-[#162543]/30 open:flex open:flex-col sm:inset-0 sm:m-auto sm:max-h-[90dvh] sm:max-w-lg sm:rounded-[24px] sm:border-b">
      <header className="shrink-0 px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
        <h2 id="privacy-settings-title" tabIndex={-1} className="text-lg font-extrabold leading-6 outline-none!">{en ? "Data privacy settings" : "Configuración de privacidad"}</h2>
        <p className="mt-2 text-sm leading-5 text-[#526176]">{en ? "Choose what to allow. Optional categories can be turned off; your changes apply when you save." : "Elija qué permite. Puede desactivar las categorías opcionales; los cambios se aplican al guardar."}</p>
      </header>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6">
      <div className="grid gap-3">
        {categories.map(item => <section key={item.key} aria-labelledby={`privacy-${item.key}`} className="rounded-2xl border border-[#dce6ec] bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            {item.change ? <label className="flex min-h-6 cursor-pointer items-center gap-3">
              <input type="checkbox" aria-labelledby={`privacy-${item.key}`} checked={item.value} onChange={event => item.change?.(event.target.checked)} className="h-5 w-5 shrink-0 cursor-pointer accent-[#0083b0]" />
              <span id={`privacy-${item.key}`} className="text-sm font-bold">{item.title}</span>
            </label> : <>
              <h3 id={`privacy-${item.key}`} className="text-sm font-bold">{item.title}</h3>
              <span className="text-xs font-semibold text-[#526176]">{en ? "Always active" : "Siempre activas"}</span>
            </>}
          </div>
          <p className="mt-2 text-sm leading-5 text-[#526176]">{categorySummaries[item.key]}</p>
          <details className="mt-2 text-sm leading-5 text-[#526176]">
            <summary className="w-fit cursor-pointer rounded py-2 font-semibold text-[#007fae] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-[#009fd9]">{en ? "More information" : "Más información"}<span className="sr-only">: {item.title}</span></summary>
            <p className="mt-2">{item.description}</p>
          </details>
        </section>)}
      </div>
      </div>
      <footer className="shrink-0 border-t border-[#e5edf2] bg-white px-5 pt-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:px-6">
        <div className="grid grid-cols-2 items-stretch gap-3">
          <button className="min-h-12 rounded-2xl border border-[#9aabba] bg-white px-3 py-3 text-sm font-bold text-[#162543] transition-colors hover:border-[#0083b0] hover:bg-[#f3fbfe] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009fd9]" onClick={() => save(true, true)}>{en ? "Accept all" : "Aceptar todas"}</button>
          <button onClick={() => save(analytics, advertising)} className="min-h-12 rounded-2xl border border-[#009fd9] bg-[#009fd9] px-3 py-3 text-sm font-bold text-[#162543] transition-colors hover:bg-[#21afe2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0083b0]">{en ? "Save" : "Guardar"}</button>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5">
          <button onClick={() => setSettings(false)} className="flex min-h-11 items-center justify-center rounded px-1 text-sm font-semibold text-[#162543] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009fd9]">{en ? "Back" : "Volver"}</button>
          <Link href="/privacidad#cookies" onClick={() => setSettings(false)} className="flex min-h-11 items-center rounded text-sm font-semibold text-[#007fae] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009fd9]">{en ? "Privacy policy" : "Política de privacidad"}</Link>
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-red-700">{en ? "Could not save your preferences." : "No pudimos guardar sus preferencias."}</p>}
      </footer>
    </dialog>
  </>;
}
