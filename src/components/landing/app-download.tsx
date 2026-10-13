"use client";

import { mobileDownloadPlatform, DOWNLOAD_DISMISS_COOKIE } from "@/lib/mobile-download-platform";
import Image from "next/image";
import { AppPhonePreview } from "./app-phone-preview";
import { useLocale } from "next-intl";
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
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
  return <section id="descargar-app" data-testid="app-download-section" className="ccr-solo-web ccr-download-section relative hidden overflow-hidden bg-[#092532] lg:block">
    <div aria-hidden="true" className="absolute -right-[5%] -top-[8%] aspect-[3/2] w-[78%] min-w-[1000px] max-w-[1200px]">
      <Image src="/stores/app-phone-table.webp" fill sizes="78vw" alt="" className="object-cover" />
      <AppPhonePreview />
    </div>
    <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,#092532_0%,#092532_32%,rgba(9,37,50,0.96)_43%,rgba(9,37,50,0.2)_64%,transparent_82%)]" />
    <div className="relative mx-auto grid min-h-[620px] max-w-7xl grid-cols-[1.1fr_1fr] items-center gap-12 px-10 py-16 xl:px-14">
      <div className="max-w-xl text-white">
        <p className="mb-5 text-sm font-semibold tracking-[0.16em] text-[#88dcf5]">{en ? "AVAILABLE FOR iOS AND ANDROID" : "DISPONIBLE PARA iOS Y ANDROID"}</p>
        <h2 className="text-[clamp(2.5rem,3.6vw,3.5rem)] font-extrabold leading-[1.08] tracking-tight">{en ? "Download the ContrataCR app" : "Descarga la app de ContrataCR"}</h2>
        <p className="mb-7 mt-6 max-w-md text-lg leading-relaxed text-white/80">{en ? "Find professionals, post projects or offer your services from your phone." : "Encuentra profesionales, publica proyectos u ofrece tus servicios desde tu celular."}</p>
        <AppStoreLinks />
        <div className="mt-7 flex items-center gap-4">
          <Image src="/stores/download-app-qr.svg" width={112} height={112} alt={en ? "Scan to download ContrataCR" : "Escanea para descargar ContrataCR"} className="shrink-0 rounded-lg bg-white" />
          <div className="max-w-[240px]"><p className="text-sm font-semibold">{en ? "Scan with your phone" : "Escanea con tu celular"}</p><p className="mt-2 text-sm leading-relaxed text-white/65">{en ? "Sign in with your existing account." : "Ingresa con tu cuenta de siempre."}</p></div>
        </div>
      </div>

    </div>
  </section>;
}

export function AppStoreFooterLinks() {
  const native = useNativeApp();
  const en = useLocale() === "en";
  if (native) return null;
  return <div className="ccr-solo-web hidden items-center gap-5 text-sm lg:flex" data-testid="app-store-footer-links">
    <span className="text-white">{en ? "Mobile app" : "App móvil"}</span>
    <a href={APP_STORES.ios} aria-label={en ? "Download ContrataCR for iOS" : "Descargar ContrataCR para iOS"} className="inline-flex h-11 w-11 items-center justify-center text-white transition-colors hover:text-[#88dcf5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><Image src="/stores/apple-icon.svg" width={28} height={32} alt="" /></a>
    <a href={APP_STORES.android} aria-label={en ? "Download ContrataCR for Android" : "Descargar ContrataCR para Android"} className="inline-flex h-11 w-11 items-center justify-center text-white transition-colors hover:text-[#88dcf5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><Image src="/stores/android-icon.svg" width={30} height={32} alt="" /></a>
  </div>;
}

export function MobileAppDownloadBanner({ initialPlatform = null, initialDismissed = false }: { initialPlatform?: "ios" | "android" | null; initialDismissed?: boolean }) {
  const native = useNativeApp();
  const en = useLocale() === "en";
  const pathname = usePathname();
  const platform = useSyncExternalStore(subscribeClient, () => mobileDownloadPlatform(navigator.userAgent, navigator.maxTouchPoints), () => initialPlatform);
  const storedDismissal = useSyncExternalStore(subscribeClient, () => {
    const cookie = document.cookie.split(";").map(item => item.trim()).find(item => item.startsWith(`${DOWNLOAD_DISMISS_COOKIE}=`))?.split("=")[1];
    if (Number(cookie ?? 0) > Date.now()) return true;
    try { return Number(localStorage.getItem(DISMISSED_KEY) ?? 0) > Date.now(); } catch { return false; }
  }, () => initialDismissed);
  const [dismissed, setDismissed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [downloadRequested, setDownloadRequested] = useState(false);
  useEffect(() => {
    const sync = () => {
      const requested = location.hash === "#descargar-app";
      setDownloadRequested(requested);
      if (requested && window.matchMedia("(max-width: 1023px)").matches && !native) {
        setDismissed(false);
        window.scrollTo({ top: 0, behavior: "instant" });
      }
    };
    sync(); window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [native]);
  // Public browsing pages share the notice; private tasks keep their space.
  const path = pathname.replace(/^\/(es|en)(?=\/|$)/, "") || "/";
  const eligible = (path === "/" || /^\/(?:como-funciona|servicios|categorias|buscar|profesionales|proyectos|empleos|promociones|ayuda|contacto|privacidad|terminos)(?:\/|$)/.test(path)) && !/\/(?:publicar|editar|mis-empleos|mis-promociones)(?:\/|$)/.test(path);
  useEffect(() => {
    if (native || !eligible) return;
    const update = () => setBlocked(document.documentElement.hasAttribute("data-keyboard-open") || document.documentElement.hasAttribute("data-keyboard-visible") || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? "") || document.body.classList.contains("ccr-con-barra-accion") || Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [aria-modal="true"]')).some(el => !(el.classList.contains('ccr-menu-completo') && !el.classList.contains('ccr-menu-abierto')) && el.getAttribute('data-state') !== 'closed' && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'));
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-keyboard-open", "data-keyboard-visible"] });
    observer.observe(document.body, { attributes: true, childList: true, subtree: true, attributeFilter: ["class", "aria-modal"] });
    document.addEventListener("focusin", update); document.addEventListener("focusout", update); update();
    return () => { observer.disconnect(); document.removeEventListener("focusin", update); document.removeEventListener("focusout", update); };
  }, [eligible, native]);
  const visible = !native && eligible && (!storedDismissal || downloadRequested) && !dismissed && !blocked;
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (visible) root.setAttribute("data-web-download-banner", "");
    else root.removeAttribute("data-web-download-banner");
    return () => root.removeAttribute("data-web-download-banner");
  }, [visible]);
  if (!visible) return null;
  return <div className="ccr-solo-web ccr-download-banner-wrap lg:hidden" data-testid="mobile-app-download">
    <aside className="ccr-download-banner" aria-label={en ? "Download ContrataCR" : "Descargar ContrataCR"}>
      <Image src="/web-app-manifest-flat-logo-v3-192x192.png" width={48} height={48} alt="" className="h-12 w-12 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 text-center"><p className="text-[13px] font-bold leading-tight text-[#162543] sm:text-sm">ContrataCR {platform && <span className="font-normal">{en ? "for" : "para"} {platform === "ios" ? "iOS" : "Android"}</span>}</p></div>
      {platform ? <a href={APP_STORES[platform]} className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-[#009fd9] px-3 text-sm font-bold text-white">{en ? "Download" : "Descargar"}</a> : <div className="flex shrink-0 gap-1">{(["ios", "android"] as const).map(os => <a key={os} href={APP_STORES[os]} className="inline-flex min-h-11 items-center rounded-lg bg-[#009fd9] px-2 text-xs font-bold text-white">{os === "ios" ? "iOS" : "Android"}</a>)}</div>}
      <button type="button" aria-label={en ? "Dismiss download notice" : "Cerrar aviso de descarga"} className="flex h-11 w-11 shrink-0 items-center justify-center text-2xl text-[#8492a5]" onClick={() => { setDismissed(true); const until = String(Date.now() + 30 * 86400000); document.cookie = `${DOWNLOAD_DISMISS_COOKIE}=${until}; Path=/; Max-Age=2592000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`; try { localStorage.setItem(DISMISSED_KEY, until); } catch {} }}>×</button>
    </aside>
  </div>;
}
