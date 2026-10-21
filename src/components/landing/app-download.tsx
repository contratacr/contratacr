"use client";

import { iosAppEntry } from "@/lib/mobile/ios-app-entry";
import { androidAppIntent, isInstalledAndroidApp, type RelatedApp } from "@/lib/mobile/android-app-entry";

import { mobileDownloadPlatform, DOWNLOAD_DISMISS_COOKIE } from "@/lib/mobile-download-platform";
import Image from "next/image";
import { ContrataCRLogo } from "@/components/brand/brand-logo";
import { X } from "lucide-react";
import { APP_STORES } from "@/lib/app-stores";
export { APP_STORES } from "@/lib/app-stores";
import { useLocale } from "next-intl";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useNativeApp } from "@/hooks/use-native-app";

const subscribeClient = () => () => {};
const DISMISSED_KEY = "ccr:app-download-dismissed-until:v2";

export function AppStoreLinks() {
  const native = useNativeApp();
  const en = useLocale() === "en";
  if (native) return null;
  // Google supplies different transparent margins in each localized PNG.
  // Normalize its visible artwork, rather than giving the whole file 70 px.
  const play = en ? { x: 41, y: 41, width: 564, height: 168 } : { x: 0, y: 29, width: 646, height: 192 };
  return <div className="ccr-solo-web flex flex-wrap items-center justify-center gap-3 sm:justify-start" data-testid="app-store-links">
    {(["ios", "android"] as const).map(platform => <a key={platform} href={APP_STORES[platform]} className="inline-flex min-h-12 shrink-0 items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#009fd9]" aria-label={`${en ? "Download on" : "Descargar en"} ${platform === "ios" ? "App Store" : "Google Play"}`}>
      {platform === "ios" ? <Image src={`/stores/app-store-${en ? "en" : "es"}.svg`} width={120} height={40} alt="App Store" data-store-badge="ios" className="h-10 w-auto sm:h-12" /> :
        <span data-store-badge="android" className="relative block h-10 w-[134.6px] overflow-hidden sm:h-12 sm:w-[161.5px]">
          <Image src={`/stores/google-play-${en ? "en" : "es"}.png`} width={646} height={250} unoptimized alt="Google Play" className="absolute max-w-none" style={{ width: `${646 / play.width * 100}%`, height: `${250 / play.height * 100}%`, left: `${-play.x / play.width * 100}%`, top: `${-play.y / play.height * 100}%` }} />
        </span>}
    </a>)}
  </div>;
}

export function AppDownloadSection() {
  const native = useNativeApp();
  const en = useLocale() === "en";
  const section = useRef<HTMLElement | null>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (native || near || !section.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setNear(true); observer.disconnect(); }
    }, { rootMargin: "500px 0px" });
    observer.observe(section.current);
    return () => observer.disconnect();
  }, [native, near]);
  if (native) return null;
  return <section ref={section} id="descargar-app" data-testid="app-download-section" className="ccr-solo-web ccr-download-section relative isolate flex w-full min-w-0 min-h-[max(520px,140vw)] items-end overflow-hidden bg-[#38261c] sm:aspect-[3/1] sm:min-h-[360px] sm:items-center lg:min-h-[460px]">
    {near && <picture className="absolute inset-0 -z-10">
      <source media="(max-width: 639px)" srcSet="/stores/app-workshop-mobile-welcome-20261013.webp" width={1122} height={1402} />
      <Image src="/stores/app-workshop-desktop-welcome-20261013.webp" width={2172} height={724} unoptimized alt={en ? "ContrataCR on a phone in a carpentry workshop" : "ContrataCR en un teléfono dentro de un taller de carpintería"} data-testid="app-download-artwork" className="h-full w-full object-cover object-top sm:object-right" />
    </picture>}
    <div className="relative mx-auto w-full max-w-7xl px-5 pb-5 pt-8 sm:px-8 sm:py-6 lg:px-14 lg:py-7">
      <div className="mx-auto max-w-md text-center text-white [text-shadow:0_2px_14px_rgba(0,0,0,0.6)] sm:mx-0 sm:max-w-[49%] sm:text-left">
        <p className="mb-3 hidden text-[11px] font-semibold tracking-[0.14em] text-white/90 sm:block lg:mb-4 lg:text-sm">{en ? "AVAILABLE FOR iOS AND ANDROID" : "DISPONIBLE PARA iOS Y ANDROID"}</p>
        <h2 className="text-[25px] font-extrabold leading-[1.08] tracking-tight md:text-4xl lg:text-[clamp(2rem,2.8vw,2.75rem)]">{en ? "Download the ContrataCR app" : "Descarga la app de ContrataCR"}</h2>
        <p className="mx-auto mb-4 mt-3 max-w-md text-sm leading-relaxed text-white/90 sm:mx-0 sm:mt-4 sm:text-base lg:mb-4 lg:mt-3 lg:text-base">{en ? "Find professionals and promote your services." : "Busca profesionales y da a conocer tus servicios."}</p>
        <AppStoreLinks />
        <div className="mt-4 hidden items-center gap-4 lg:flex">
          <Image src="/stores/download-app-qr.svg?v=20261013-store-redirect" width={104} height={104} alt={en ? "Scan to download ContrataCR" : "Escanea para descargar ContrataCR"} className="shrink-0 rounded-lg bg-white" />
          <div className="max-w-[240px]"><p className="text-sm font-semibold">{en ? "Scan with your phone" : "Escanea con tu celular"}</p><p className="mt-2 text-sm leading-relaxed text-white/90">{en ? "Sign in with your existing account." : "Ingresa con tu cuenta de siempre."}</p></div>
        </div>
      </div>
    </div>
  </section>;
}

export function AppStoreFooterLinks() {
  const native = useNativeApp();
  const en = useLocale() === "en";
  if (native) return null;
  return <div className="ccr-solo-web flex items-center gap-5 text-sm" data-testid="app-store-footer-links">
    <span className="text-[#162543]">{en ? "Mobile app" : "App móvil"}</span>
    <a href={APP_STORES.ios} aria-label={en ? "Download ContrataCR for iOS" : "Descargar ContrataCR para iOS"} className="inline-flex h-11 w-11 items-center justify-center text-[#162543] transition-colors hover:text-[#0083b0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009fd9]"><Image src="/stores/apple-icon-navy.svg" width={21} height={24} alt="" className="h-6 w-auto" /></a>
    <a href={APP_STORES.android} aria-label={en ? "Download ContrataCR for Android" : "Descargar ContrataCR para Android"} className="inline-flex h-11 w-11 items-center justify-center text-[#162543] transition-colors hover:text-[#0083b0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009fd9]"><Image src="/stores/android-icon-navy.svg" width={23} height={24} alt="" className="h-6 w-auto" /></a>
  </div>;
}

export function MobileAppDownloadBanner({ initialPlatform = null, initialDismissed = false, initialHostname = "contratacr.com", initialPath }: { initialHostname?: string; initialPath?: string; initialPlatform?: "ios" | "android" | null; initialDismissed?: boolean }) {
  const native = useNativeApp();
  const en = useLocale() === "en";
  const pathname = usePathname();
  const platform = useSyncExternalStore(subscribeClient, () => mobileDownloadPlatform(navigator.userAgent, navigator.maxTouchPoints), () => initialPlatform);
  const storedDismissal = useSyncExternalStore(subscribeClient, () => {
    const cookie = document.cookie.split(";").map(item => item.trim()).find(item => item.startsWith(`${DOWNLOAD_DISMISS_COOKIE}=`))?.split("=")[1];
    if (Number(cookie ?? 0) > Date.now()) return true;
    try { return Number(localStorage.getItem(DISMISSED_KEY) ?? 0) > Date.now(); } catch { return false; }
  }, () => initialDismissed);
  const [androidInstalled, setAndroidInstalled] = useState<boolean | null>(null);
  const [openHref, setOpenHref] = useState<string | null>(() => androidAppIntent(initialPath ?? pathname) ?? androidAppIntent(en ? "/en" : "/"));
  const [iosHref, setIosHref] = useState<string | null>(() => iosAppEntry(initialPath ?? pathname, initialHostname) ?? iosAppEntry(en ? "/en" : "/", initialHostname));
  useEffect(() => {
    if (native || platform !== "ios") return;
    const update = () => setIosHref(iosAppEntry(location.pathname + location.search + location.hash, location.hostname) ?? iosAppEntry(en ? "/en" : "/", location.hostname));
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, [native, platform, pathname, en]);
  useEffect(() => {
    if (native || platform !== "android") return;
    let active = true;
    const updateDestination = () => setOpenHref(androidAppIntent(location.pathname + location.search + location.hash) ?? androidAppIntent(en ? "/en" : "/"));
    updateDestination();
    window.addEventListener("hashchange", updateDestination);
    const navigatorWithApps = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<RelatedApp[]> };
    let revision = 0;
    const checkInstalled = () => {
      if (!navigatorWithApps.getInstalledRelatedApps) return;
      const current = ++revision;
      void navigatorWithApps.getInstalledRelatedApps().then(apps => {
        if (active && current === revision) setAndroidInstalled(isInstalledAndroidApp(apps));
      }).catch(() => { if (active && current === revision) setAndroidInstalled(null); });
    };
    const onVisible = () => { if (document.visibilityState === "visible") checkInstalled(); };
    checkInstalled();
    window.addEventListener("pageshow", checkInstalled);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.removeEventListener("hashchange", updateDestination);
      window.removeEventListener("pageshow", checkInstalled);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [native, platform, pathname, en]);
  const [dismissed, setDismissed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [downloadRequested, setDownloadRequested] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let alignAllowed = true;
    const stopAligning = () => { alignAllowed = false; };
    const alignDownload = () => {
      if (cancelled || !alignAllowed || native || location.hash !== "#descargar-app" || !window.matchMedia("(max-width: 1023px)").matches) return;
      const section = document.getElementById("descargar-app");
      if (!section) return;
      const headerBottom = Math.max(0, ...Array.from(document.querySelectorAll("header")).map(el => el.getBoundingClientRect()).filter(rect => rect.height > 0).map(rect => rect.bottom));
      section.scrollIntoView({ block: "start", behavior: "instant" });
      window.scrollBy({ top: section.getBoundingClientRect().top - headerBottom - 12, behavior: "instant" });
    };
    const sync = (event?: Event) => {
      const requested = location.hash === "#descargar-app";
      setDownloadRequested(requested);
      if (requested && window.matchMedia("(max-width: 1023px)").matches && !native) {
        alignAllowed = true;
        if (event?.type === "hashchange") setDismissed(false);
        requestAnimationFrame(alignDownload);
      }
    };
    const headerObserver = new ResizeObserver(() => requestAnimationFrame(alignDownload));
    document.querySelectorAll("header").forEach(header => headerObserver.observe(header));
    const intentEvents = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    intentEvents.forEach(event => window.addEventListener(event, stopAligning, { passive: true }));
    sync(); window.addEventListener("hashchange", sync);
    // Fonts and streamed home content can change the anchor position on a
    // cold visit. Align once more after loading, using the real header height.
    const loaded = document.readyState === "complete" ? Promise.resolve() : new Promise<void>(resolve => window.addEventListener("load", () => resolve(), { once: true }));
    void Promise.all([document.fonts.ready, loaded]).then(() => requestAnimationFrame(alignDownload));
    return () => { cancelled = true; headerObserver.disconnect(); intentEvents.forEach(event => window.removeEventListener(event, stopAligning)); window.removeEventListener("hashchange", sync); };
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
  // A compact desktop window uses the mobile layout, but is not a mobile
  // device. Require a detected platform before rendering or reserving space.
  const visible = platform !== null && !native && eligible && (!storedDismissal || downloadRequested) && !dismissed && !blocked;
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (visible) root.setAttribute("data-web-download-banner", "");
    else root.removeAttribute("data-web-download-banner");
    return () => root.removeAttribute("data-web-download-banner");
  }, [visible]);
  if (!visible || !platform) return null;
  const androidAction = platform === "android" && openHref;
  const actionHref = platform === "ios" ? iosHref ?? APP_STORES.ios
    : androidAction ? openHref : APP_STORES.android;
  const knownAndroid = platform === "android" && androidInstalled !== null;
  const actionLabel = knownAndroid ? (androidInstalled ? (en ? "Open" : "Abrir") : (en ? "Download" : "Descargar"))
    : (en ? "Continue" : "Continuar");
  return <div className="ccr-solo-web ccr-download-banner-wrap lg:hidden" data-testid="mobile-app-download">
    <aside className="ccr-download-banner" aria-label={en ? "ContrataCR mobile app" : "App móvil ContrataCR"}>
      <button type="button" aria-label={en ? "Dismiss app notice" : "Cerrar aviso de la app"} className="flex h-11 w-6 shrink-0 items-center justify-center min-[390px]:w-8 text-[#64748b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009fd9]" onClick={() => { setDismissed(true); const until = String(Date.now() + 30 * 86400000); document.cookie = `${DOWNLOAD_DISMISS_COOKIE}=${until}; Path=/; Max-Age=2592000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`; try { localStorage.setItem(DISMISSED_KEY, until); } catch {} }}><X aria-hidden="true" className="h-[18px] w-[18px]" /></button>
      <div className="flex min-w-0 flex-1 items-center gap-0.5 whitespace-nowrap min-[390px]:gap-1">
        <ContrataCRLogo className="shrink-0 max-[389px]:[&>img:first-child]:h-7 max-[389px]:[&>img:first-child]:w-7 max-[389px]:[&>img:last-child]:h-[21px] max-[389px]:[&>img:last-child]:w-[92px]" />
        <span data-testid="app-platform-label" className="shrink-0 text-[10px] leading-5 text-[#162543] min-[390px]:text-[11px]">
          {en ? "for" : "para"}{" "}{platform === "ios" ? "iOS" : "Android"}
        </span>
      </div>
      <a href={actionHref ?? APP_STORES[platform]} onClick={(event) => {
        if (platform === "ios") {
          event.currentTarget.href = iosAppEntry(location.pathname + location.search + location.hash, location.hostname) ?? iosAppEntry(en ? "/en" : "/", location.hostname) ?? APP_STORES.ios;
        } else if (androidAction) {
          const current = androidAppIntent(location.pathname + location.search + location.hash) ?? androidAppIntent(en ? "/en" : "/");
          if (current) event.currentTarget.href = current;
        }
      }} aria-label={`${actionLabel} ContrataCR`} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-[#009fd9] px-2.5 text-xs font-semibold text-white min-[390px]:px-3 min-[390px]:text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009fd9]">
        {actionLabel}
      </a>
    </aside>
  </div>;
}
