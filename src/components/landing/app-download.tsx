"use client";

import Image from "next/image";
import { useLocale } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useNativeApp } from "@/hooks/use-native-app";

export const APP_STORES = {
  ios: "https://apps.apple.com/cr/app/contratacr/id6794559661",
  android: "https://play.google.com/store/apps/details?id=com.contratacr.app",
};
const subscribeClient = () => () => {};
const DISMISSED_KEY = "ccr:app-download-dismissed-until:v1";

export function AppStoreLinks() {
  const native = useNativeApp();
  const en = useLocale() === "en";
  if (native) return null;
  return <div className="ccr-solo-web flex flex-wrap gap-3" data-testid="app-store-links">
    {(["ios", "android"] as const).map(platform => <a key={platform} href={APP_STORES[platform]} className="inline-flex min-h-12 items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#009fd9]" aria-label={`${en ? "Download on" : "Descargar en"} ${platform === "ios" ? "App Store" : "Google Play"}`}>
      <Image src={`/stores/${platform === "ios" ? "app-store" : "google-play"}-${en ? "en" : "es"}.${platform === "ios" ? "svg" : "png"}`} width={platform === "ios" ? 145 : 180} height={platform === "ios" ? 48 : 70} alt={platform === "ios" ? "App Store" : "Google Play"} className={platform === "ios" ? "h-12 w-auto" : "-my-2 h-[70px] w-auto"} />
    </a>)}
  </div>;
}

export function AppDownloadSection() {
  const native = useNativeApp();
  const en = useLocale() === "en";
  if (native) return null;
  return <section id="descargar-app" data-testid="app-download-section" className="ccr-solo-web bg-[#eaf6fc] px-5 py-12 sm:py-16">
    <div className="mx-auto grid max-w-5xl items-center gap-8 sm:grid-cols-[1fr_240px]">
      <div>
        <p className="mb-3 text-sm font-bold text-[#007fae]">iPhone · Android</p>
        <h2 className="text-3xl font-extrabold text-[#162543] sm:text-4xl">{en ? "ContrataCR, now on your phone" : "ContrataCR, ahora en tu celular"}</h2>
        <p className="mb-6 mt-4 max-w-xl text-base leading-relaxed text-[#526178]">{en ? "Find professionals, post projects and discover jobs and offers from the app. Already have an account? Sign in with the same one." : "Encuentra profesionales, publica proyectos y descubre empleos y promociones desde la app. ¿Ya tienes cuenta? Ingresa con la misma."}</p>
        <AppStoreLinks />
      </div>
      <div className="mx-auto hidden w-[220px] overflow-hidden rounded-[28px] border-[6px] border-[#162543] bg-white shadow-lg sm:block">
        <Image src="/guia/profesionales.jpg" width={390} height={844} alt={en ? "ContrataCR on your phone" : "ContrataCR en tu celular"} className="h-auto w-full" />
      </div>
    </div>
  </section>;
}

export function MobileAppDownloadBanner() {
  const native = useNativeApp();
  const en = useLocale() === "en";
  const pathname = usePathname();
  const platform = useSyncExternalStore(subscribeClient, () => /Android/i.test(navigator.userAgent) ? "android" : /iPhone|iPad|iPod/i.test(navigator.userAgent) ? "ios" : null, () => null);
  const storedDismissal = useSyncExternalStore(subscribeClient, () => { try { return Number(localStorage.getItem(DISMISSED_KEY) ?? 0) > Date.now(); } catch { return false; } }, () => true);
  const [dismissed, setDismissed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  // Only informational routes: never compete with search sheets, editors,
  // account flows or fixed action bars.
  const path = pathname.replace(/^\/(es|en)(?=\/|$)/, "") || "/";
  const eligible = path === "/" || /^\/(como-funciona|servicios)(\/|$)/.test(path);
  useEffect(() => {
    if (native || !eligible) return;
    const update = () => setBlocked(document.documentElement.hasAttribute("data-keyboard-open") || document.documentElement.hasAttribute("data-keyboard-visible") || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? "") || document.body.classList.contains("ccr-con-barra-accion") || Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [aria-modal="true"]')).some(el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'));
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-keyboard-open", "data-keyboard-visible"] });
    observer.observe(document.body, { attributes: true, childList: true, subtree: true, attributeFilter: ["class", "aria-modal"] });
    document.addEventListener("focusin", update); document.addEventListener("focusout", update); update();
    return () => { observer.disconnect(); document.removeEventListener("focusin", update); document.removeEventListener("focusout", update); };
  }, [eligible, native]);
  if (native || !eligible || !platform || storedDismissal || dismissed || blocked) return null;
  return <div className="ccr-solo-web ccr-download-banner-wrap lg:hidden" data-testid="mobile-app-download">
    <aside className="ccr-download-banner" aria-label={en ? "Download ContrataCR" : "Descargar ContrataCR"}>
      <button type="button" aria-label={en ? "Dismiss download notice" : "Cerrar aviso de descarga"} className="h-11 w-11 shrink-0 text-2xl text-[#526178]" onClick={() => { setDismissed(true); try { localStorage.setItem(DISMISSED_KEY, String(Date.now() + 30 * 86400000)); } catch {} }}>×</button>
      <div className="min-w-0 flex-1"><p className="text-sm font-bold text-[#162543]">ContrataCR</p><p className="text-xs text-[#526178]">{en ? "Also available as an app" : "También disponible en app"}</p></div>
      <a href={APP_STORES[platform]} className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-[#009fd9] px-4 text-sm font-bold text-white">{en ? "Download" : "Descargar"}</a>
    </aside>
  </div>;
}
