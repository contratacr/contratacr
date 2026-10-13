"use client";

import { mobileDownloadPlatform, DOWNLOAD_DISMISS_COOKIE } from "@/lib/mobile-download-platform";
import Image from "next/image";
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
    <div className="absolute inset-y-0 right-0 w-[58%] [mask-image:linear-gradient(to_right,transparent,#000_30%)]">
      <Image src="/mobile/contratacr-welcome-client-v1.webp" fill sizes="58vw" alt="" className="object-cover object-[center_25%]" />
    </div>
    <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,#092532_0%,#092532_35%,rgba(9,37,50,0.85)_49%,rgba(9,37,50,0.22)_75%,rgba(9,37,50,0.18)_100%)]" />
    <div className="relative mx-auto grid min-h-[560px] max-w-7xl grid-cols-[1.1fr_1fr] items-center gap-12 px-10 py-16 xl:px-14">
      <div className="max-w-xl text-white">
        <p className="mb-5 text-sm font-semibold tracking-[0.16em] text-[#88dcf5]">CONTRATACR · iOS & ANDROID</p>
        <h2 className="text-[clamp(2.5rem,3.6vw,3.5rem)] font-extrabold leading-[1.08] tracking-tight">{en ? "Your next solution, right in your pocket." : "Tu próxima solución, en tu bolsillo."}</h2>
        <p className="mb-7 mt-6 max-w-md text-lg leading-relaxed text-white/80">{en ? "Find professionals, post projects and manage your profile and messages wherever you are." : "Encuentra profesionales, publica proyectos y gestiona tu perfil y tus mensajes desde donde estés."}</p>
        <AppStoreLinks />
        <div className="mt-7 flex items-center gap-4">
          <Image src="/stores/download-app-qr.svg" width={88} height={88} alt={en ? "Scan to download ContrataCR" : "Escanea para descargar ContrataCR"} className="shrink-0 rounded-lg bg-white" />
          <div className="max-w-[240px]"><p className="text-sm font-semibold">{en ? "Scan with your phone" : "Escanea con tu celular"}</p><p className="mt-2 text-sm leading-relaxed text-white/65">{en ? "Already have an account? Sign in with the same one." : "¿Ya tienes cuenta? Ingresa con la misma."}</p></div>
        </div>
      </div>
      <div className="relative flex justify-end pr-6" aria-hidden="true">
        <div className="relative w-[245px] rotate-[7deg] rounded-[38px] border-[7px] border-[#14212a] bg-[#14212a] p-1 shadow-[0_30px_70px_rgba(0,0,0,0.4)] xl:w-[260px]">
          <div className="overflow-hidden rounded-[26px] bg-white"><Image src="/guia/profesionales.jpg" width={588} height={1278} alt="" sizes="260px" className="h-auto w-full" /></div>
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
    <span className="text-white/45">{en ? "Mobile app" : "App móvil"}</span>
    <a href={APP_STORES.ios} aria-label={en ? "Download ContrataCR for iOS" : "Descargar ContrataCR para iOS"} className="inline-flex min-h-11 items-center font-semibold text-white/80 hover:text-white">iOS <span className="ml-1 text-white/40" aria-hidden>↗</span></a>
    <a href={APP_STORES.android} aria-label={en ? "Download ContrataCR for Android" : "Descargar ContrataCR para Android"} className="inline-flex min-h-11 items-center font-semibold text-white/80 hover:text-white">Android <span className="ml-1 text-white/40" aria-hidden>↗</span></a>
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
  const visible = !native && eligible && Boolean(platform) && (!storedDismissal || downloadRequested) && !dismissed && !blocked;
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (visible) root.setAttribute("data-web-download-banner", "");
    else root.removeAttribute("data-web-download-banner");
    return () => root.removeAttribute("data-web-download-banner");
  }, [visible]);
  if (!visible || !platform) return null;
  return <div className="ccr-solo-web ccr-download-banner-wrap lg:hidden" data-testid="mobile-app-download">
    <aside className="ccr-download-banner" aria-label={en ? "Download ContrataCR" : "Descargar ContrataCR"}>
      <Image src="/web-app-manifest-flat-logo-v3-192x192.png" width={48} height={48} alt="" className="h-12 w-12 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1"><p className="text-[13px] font-bold leading-tight text-[#162543] sm:text-sm">ContrataCR <span className="font-normal">{en ? "for" : "para"} {platform === "ios" ? "iOS" : "Android"}</span></p><p className="mt-1 text-xs text-[#526178]">{en ? "Take it with you" : "Llévala contigo"}</p></div>
      <a href={APP_STORES[platform]} className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-[#009fd9] px-3 text-sm font-bold text-white">{en ? "Download" : "Descargar"}</a>
      <button type="button" aria-label={en ? "Dismiss download notice" : "Cerrar aviso de descarga"} className="flex h-11 w-11 shrink-0 items-center justify-center text-2xl text-[#8492a5]" onClick={() => { setDismissed(true); const until = String(Date.now() + 30 * 86400000); document.cookie = `${DOWNLOAD_DISMISS_COOKIE}=${until}; Path=/; Max-Age=2592000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`; try { localStorage.setItem(DISMISSED_KEY, until); } catch {} }}>×</button>
    </aside>
  </div>;
}
