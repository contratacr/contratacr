"use client";
import { WorkplaceDirections } from "@/components/professionals/workplace-directions";
import { serviceModalities } from "@/components/professionals/service-modalities";
import type { CoverageArea } from "@/lib/public-workplaces";

import { CvProfileDetails } from "@/components/professionals/cv-profile";
import { hasCv, normalizeCv } from "@/lib/cv/model";
import { PromotionHistory } from "@/components/pro/promotion-history";

import { ProfileIdentityName, profileIdentityAvatarClass } from "@/components/professionals/profile-identity-name";

import { sinPrefijoDeIdioma } from "@/lib/prefijo-de-idioma";

import { esRutaDeBusqueda } from "@/lib/buscar-url";
import { rutaEmpleo, rutaPromocion } from "@/lib/marketplace-url";
import { FichaVacio } from "@/components/professionals/ficha-vacio";
import { enlacePerfil } from "@/lib/profile-url";
import { useState, useEffect, useLayoutEffect, useCallback, useRef, type ReactNode } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useParams, useSearchParams } from "next/navigation";
import {
  MapPin, Shield, ArrowLeft, Briefcase, BadgeCheck, Languages,
  Flag, SearchX, Globe, BadgePercent, Share2, Link2, ChevronRight, Bookmark,
  X, Ban, Images, PenLine,
} from "lucide-react";
import { BIZ, RatingLine, Stars, ratingNumber, ring } from "@/components/directory/biz-ui";
import { SelfActionModal } from "@/components/professionals/self-action-modal";
import { Modal } from "@/components/ui/modal";
import { VerificationInfo } from "@/components/ui/verification-info";
import { InstagramIcon, FacebookIcon, TikTokIcon, LinkedInIcon } from "@/components/icons/social-icons";
import { buildSocialUrl, buildWebsiteUrl } from "@/lib/social";
import { Link } from "@/i18n/navigation";
import { rutaAnterior } from "@/lib/volver-por-historial";
import { Navbar } from "@/components/layout/navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { ImagePreviewDialog } from "@/components/ui/image-preview-dialog";
import { getInitials, proDisplayName, cn } from "@/lib/utils";
import { RecordRecentVisit } from "@/components/mobile/record-recent-visit";
import { anyVideoConsultCategory, getCategoryLabel, esServicioDelCatalogo } from "@/lib/data/categories";
import { casoProfession } from "@/lib/services";
import { addTaxIncludedToPriceLabel, formatServicePrice, primaryPricingLabel, splitPricingLabel } from "@/lib/pricing";
import { languageLabel } from "@/lib/data/languages";
import { insurerLabel } from "@/lib/data/insurers";
import { ReviewSection } from "@/components/professionals/review-section";
import { CaseShowcase } from "@/components/professionals/case-showcase";
import { BrandIconBadge } from "@/components/ui/brand-icon-badge";
import { ReportProfileModal } from "@/components/professionals/report-profile-modal";
import { createClient } from "@/lib/supabase/client";
import { getDashboardCache, setDashboardCache } from "@/lib/dashboard-prefetch-cache";
import { ProfessionalSchedule } from "@/components/professionals/professional-schedule";
import { useGuardarProfesional, type SavedPro } from "@/components/professionals/save-button";
import { MenuFicha } from "@/components/ui/menu-ficha";
import { CaraCompartir, useCompartir } from "@/components/ui/boton-compartir";
import type { ProfessionalDetail } from "@/lib/queries/professionals";
import { getProfessionalDisplayName } from "@/lib/display-name";
import { trackInteraction } from "@/lib/analytics/interaction-events";
import { cldLarge, cldThumb } from "@/lib/cloudinary";
import { formatOfferBeforePrice, formatOfferPrice, offerDiscountPercent, type ProfessionalOffer } from "@/lib/offers";
import { formatJobSalary, WORKPLACE_TYPES, type JobPost } from "@/lib/jobs";
import { EMPLEOS_VISIBLE } from "@/lib/feature-flags";
import { PerfilSkeleton } from "@/components/ui/section-skeletons";
import { useNativeApp } from "@/hooks/use-native-app";
import { ProgressiveImage } from "@/components/ui/progressive-image";
import { useArrastreHorizontal } from "@/hooks/use-arrastre-horizontal";
import { useDesvanecidoDeCarril } from "@/hooks/use-desvanecido-de-carril";
import { FlechasDeCarril } from "@/components/ui/flechas-de-carril";
import { BloquearUsuarioModal } from "@/components/moderation/bloquear-usuario-modal";

// ─── WhatsApp icon ────────────────────────────────────────────────────────────
// ─── Sub-rating row ───────────────────────────────────────────────────────────
// ─── Tab types ────────────────────────────────────────────────────────────────
type Tab = "disponibilidad" | "servicios" | "promociones" | "empleos" | "casos" | "certificaciones" | "resenas" | "sobre";

function searchParamFromUrl(key: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(key);
}
function safeProfileReturnHref(value: string | null): string {
  if (!value) return "/profesionales";
  let href = value;
  try {
    href = decodeURIComponent(value);
  } catch {
    href = value;
  }
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\")) return "/profesionales";
  const path = href.split(/[?#]/u)[0]?.replace(/^\/(?:es|en)(?=\/|[?#]|$)/u, "") || "/";
  const allowed = path === "/"
    || path === "/profesionales"
    || path.startsWith("/profesionales/")
    || path === "/promociones"
    || path.startsWith("/promociones/")
    || path === "/empleos"
    || path.startsWith("/empleos/")
    || path.startsWith("/dashboard/cliente")
    || path.startsWith("/dashboard/profesional")
    || path === "/mensajes"
    || path === "/notificaciones";
  // The i18n <Link> re-adds the locale: hand back a bare path even when the
  // sender included one, so the return never becomes /es/es/... .
  return allowed ? sinPrefijoDeIdioma(href) : "/profesionales";
}

function profileReturnLabel(href: string, locale: string) {
  const path = href.split(/[?#]/u)[0]?.replace(/^\/(?:es|en)(?=\/|[?#]|$)/u, "") || "/";
  const params = new URLSearchParams(href.includes("?") ? href.split("?")[1]?.split("#")[0] : "");
  if (path.startsWith("/promociones")) return locale === "en" ? "Back to promotions" : "Volver a promociones";
  if (path.startsWith("/empleos")) return locale === "en" ? "Back to jobs" : "Volver a empleos";
  if (path.startsWith("/dashboard/profesional")) {
    if (params.get("tab") === "saved") return locale === "en" ? "Back to favorites" : "Volver a favoritos";
    return locale === "en" ? "Back to my dashboard" : "Volver a mi panel";
  }
  if (path.startsWith("/dashboard/cliente")) {
    if (params.get("tab") === "connections") return locale === "en" ? "Back to connections" : "Volver a conexiones";
    if (params.get("tab") === "saved") return locale === "en" ? "Back to favorites" : "Volver a favoritos";
    return locale === "en" ? "Back to my dashboard" : "Volver a mi panel";
  }
  if (path.startsWith("/mensajes")) return locale === "en" ? "Back to messages" : "Volver a mensajes";
  if (path === "/") return locale === "en" ? "Back to home" : "Volver al inicio";
  return locale === "en" ? "Back to results" : "Volver a resultados";
}

// El regreso calculado se guarda por ficha: al limpiar la dirección (?from= se
// quita) la ficha puede volver a montarse y ya no lo encontraría en la URL.
const CLAVE_REGRESO = "ccr:regreso-de-ficha";
function regresoGuardado(): string | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(CLAVE_REGRESO) || "null") as { ficha: string; a: string } | null;
    return d && d.ficha === fichaDeLaDireccion() ? d.a : null;
  } catch { return null; }
}
function guardarRegreso(a: string) {
  try { sessionStorage.setItem(CLAVE_REGRESO, JSON.stringify({ ficha: fichaDeLaDireccion(), a })); } catch { /* sin almacenamiento */ }
}
function fichaDeLaDireccion(): string {
  // /profesionales/nombre-1a2b3c4d o /nombre: el nombre sin el sufijo.
  const ultimo = window.location.pathname.split("/").filter(Boolean).pop() ?? "";
  return ultimo.replace(/-[a-z0-9]{8}$/, "");
}

function initialProfileReturnHref() {
  const explicit = searchParamFromUrl("from");
  if (explicit) { const a = safeProfileReturnHref(explicit); guardarRegreso(a); return a; }
  const guardado = regresoGuardado();
  if (guardado) return guardado;
  // La pantalla anterior DENTRO de la app (portada, una lista…). El referrer
  // del navegador no cambia al navegar dentro del app: desde la portada la
  // flecha decía «Volver a resultados» y llevaba a la búsqueda.
  const anterior = typeof window !== "undefined" ? rutaAnterior() : null;
  if (anterior && (!anterior.includes("/profesionales/") || esRutaDeBusqueda(anterior.split("?")[0], esServicioDelCatalogo))) {
    return safeProfileReturnHref(anterior);
  }
  if (typeof document !== "undefined" && document.referrer) {
    try {
      const referrer = new URL(document.referrer);
      // Otro perfil no es un lugar al que volver; la búsqueda de un servicio
      // (/profesionales/techos) sí, aunque tenga la misma forma.
      if (referrer.origin === window.location.origin && (!referrer.pathname.includes("/profesionales/") || esRutaDeBusqueda(referrer.pathname, esServicioDelCatalogo))) {
        return safeProfileReturnHref(`${referrer.pathname}${referrer.search}${referrer.hash}`);
      }
    } catch {
      return "/profesionales";
    }
  }
  return "/profesionales";
}

// ─── Main page ────────────────────────────────────────────────────────────────
type ProfilePageData = {
  pro: ProfessionalDetail;
  offers: ProfessionalOffer[];
  jobs: JobPost[];
};

/**
 * La ficha pública. La arma el servidor con `fichaInicial` y este componente la
 * pinta desde el primer cuadro; después revalida en silencio.
 *
 * Antes pedía el perfil al montar y hasta entonces solo había un esqueleto: el
 * primer pintado tardaba 2,6 s en un teléfono (medido en producción) y el HTML
 * que recibía Google no traía ni el nombre ni los servicios, solo los
 * metadatos. El dato ya lo tenía el servidor —la cabecera lo consulta para los
 * metadatos, con la misma consulta cacheada—, así que traerlo no cuesta nada.
 */
export default function ProfilePage({ fichaInicial, ofertasIniciales = [], empleosIniciales = [] }: { fichaInicial?: ProfessionalDetail | null; ofertasIniciales?: ProfessionalOffer[]; empleosIniciales?: JobPost[] }) {
  const t = useTranslations("profile");
  const tMenu = useTranslations("menuFicha");
  const tVolver = useTranslations("marketplaceReturn");
  const tFoto = useTranslations("clientPage");
  const locale = useLocale();
  const catLabel = (id?: string | null) => id ? getCategoryLabel(id, locale) : "";
  const routeParams = useParams();
  const routeSlugParam = routeParams?.slug;
  const routeSlug = Array.isArray(routeSlugParam) ? routeSlugParam[0] : routeSlugParam;
  const [professional, setProfessional] = useState<ProfessionalDetail | null>(fichaInicial ?? null);
  // NACEN CON LO QUE PINTÓ EL SERVIDOR. Arrancando en [] la fila de pestañas
  // salía con cinco y pasaba a siete al llegar la consulta del navegador:
  // «Promociones» y «Empleos» aparecían tarde y corrían de sitio a las demás.
  const [publicOffers, setPublicOffers] = useState<ProfessionalOffer[]>(ofertasIniciales);
  const [publicJobs, setPublicJobs] = useState<JobPost[]>(empleosIniciales);
  // Con la ficha del servidor no hay nada que esperar: se pinta y la consulta
  // de fondo solo confirma.
  const [loading, setLoading] = useState(!fichaInicial);
  const [proNotFound, setProNotFound] = useState(false);
  // The logged-in viewer's role-aware panel route — drives the "Volver a mi panel"
  // button on the "Profesional no encontrado" screen so a signed-in visitor is never
  // stranded. `null` = logged out (that screen then shows only "Buscar profesionales").
  const [panelHref, setPanelHref] = useState<string | null>(null);
  // La pestaña sale de la URL, no de un estado inicial: al volver desde un
  // empleo o una oferta (?tab=empleos) la primera pintura ocurre en el servidor,
  // donde no hay URL, y el perfil se abría siempre en "Disponibilidad".
  const searchParams = useSearchParams();
  const tabFromUrl = ((): Tab | null => {
    // ?tab=curriculum es el nombre visible de la pestaña "certificaciones".
    const value = searchParams.get("tab") === "curriculum" ? "certificaciones" : searchParams.get("tab");
    return (["disponibilidad", "servicios", "promociones", "empleos", "casos", "certificaciones", "resenas", "sobre"] as const).includes(value as Tab)
      ? (value as Tab)
      : null;
  })();
  const [chosenTab, setChosenTab] = useState<Tab | null>(null);
  const activeTab = chosenTab ?? tabFromUrl ?? "servicios";
  // Pestañas ya abiertas: se quedan montadas (ocultas) en vez de desmontarse.
  // Al desmontarse, volver a una armaba todo de cero y cada foto arrancaba en
  // blanco para aparecer 100 ms después: eso era el parpadeo al cambiar de
  // pestaña.
  const [pestanasVisitadas, setPestanasVisitadas] = useState<Set<string>>(() => new Set());
  const setActiveTab = (next: Tab) => {
    if (next === activeTab) return;
    if (activeTab === "resenas") {
      const detail = { proceed: () => setChosenTab(next), handled: false };
      window.dispatchEvent(new CustomEvent("ccr:confirm-unsaved-action", { detail }));
      if (detail.handled) return;
    }
    setChosenTab(next);
  };
  const previousActiveTabRef = useRef<Tab | null>(null);
  // En computadora las pestañas se arrastran con el mouse (ver el hook).
  const carrilPestanasRef = useRef<HTMLDivElement | null>(null);
  useArrastreHorizontal(carrilPestanasRef);
  // LAS PESTAÑAS QUE NO CABEN TIENEN QUE DECIRLO. Con siete secciones, en el
  // teléfono «Formación» e «Información» quedaban fuera y la fila se cortaba
  // contra el filo: parecía que esas secciones no existían. El mismo degradado
  // que el resto de los carriles del app, y flechas en computadora.
  const { mascara: mascaraPestanas } = useDesvanecidoDeCarril(carrilPestanasRef);
  // Opening another section starts from its top: if the previous section was
  // scrolled past the pinned tab strip, bring the sections card back up.
  useEffect(() => {
    const previous = previousActiveTabRef.current;
    previousActiveTabRef.current = activeTab;
    // La tira de pestañas se desplaza para mostrar la activa: al volver desde un
    // empleo, "Empleos" quedaba fuera de la vista y parecía que no había pestaña.
    if (previous === null || previous === activeTab) return;
    const strip = document.querySelector("[data-profile-tabs]");
    const card = document.getElementById("resenas");
    if (!strip || !card) return;
    if (card.getBoundingClientRect().top < strip.getBoundingClientRect().top - 2) {
      card.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }, [activeTab]);
  const cantidadPestanas = publicOffers.length + publicJobs.length;
  // En computadora la disponibilidad no es una pestaña sino la columna de la
  // derecha, así que ahí esa pestaña no existe y se cae a la siguiente.
  useEffect(() => {
    const seleccionada = document.querySelector<HTMLElement>('[data-profile-tabs] [aria-selected="true"]');
    const carril = seleccionada?.parentElement;
    if (!seleccionada || !carril) return;
    // Solo se mueve la tira si la pestaña activa no se ve entera. Antes usaba
    // offsetLeft, que se mide contra la tarjeta y no contra la tira: la primera
    // pestaña quedaba cortada por la izquierda sin necesidad.
    const tab = seleccionada.getBoundingClientRect();
    const tira = carril.getBoundingClientRect();
    if (tab.left >= tira.left - 1 && tab.right <= tira.right + 1) return;
    const izquierda = tab.left - tira.left + carril.scrollLeft;
    carril.scrollLeft = Math.max(0, izquierda - (carril.clientWidth - tab.width) / 2);
  }, [activeTab, cantidadPestanas]);

  // El destino de "volver" depende de la URL, y la primera pintura ocurre en el
  // servidor, donde no hay URL: calcularlo ahí dejaba el botón clavado en
  // "Volver a resultados" aunque vinieras del panel. Se resuelve en el cliente,
  // apenas monta, y de ahí no vuelve a cambiar.
  // `?from=` viene en la dirección y el servidor SÍ la conoce: con eso el primer
  // pintado ya trae el destino correcto (las tarjetas de /buscar y del panel lo
  // mandan). El referrer, que solo existe en el navegador, apenas afina después.
  const [assistantReturn, setAssistantReturn] = useState(false);
  const [profileReturnHref, setProfileReturnHref] = useState(() => {
    const explicit = searchParams.get("from");
    return explicit ? safeProfileReturnHref(explicit) : "/profesionales";
  });
  useEffect(() => {
    const destination = initialProfileReturnHref();
    let fromAssistant = false;
    try {
      const origin = sessionStorage.getItem("ccr:volver-al-asistente");
      fromAssistant = !!origin && safeProfileReturnHref(origin) === destination;
    } catch { /* Regular route label without storage. */ }
    const frame = requestAnimationFrame(() => {
      setProfileReturnHref(destination);
      setAssistantReturn(fromAssistant);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  // LA BARRA DE DIRECCIONES CON EL ENLACE BONITO (4-oct-2026): ya calculado el
  // regreso, la dirección pasa a contratacr.com/nombre-apellido —la misma de
  // «Copiar enlace»— sin «?from=…» ni el sufijo. Recargarla abre la misma ficha
  // (el middleware la sirve ahí). Otros parámetros (?tab=…) se conservan.
  useEffect(() => {
    if (!professional?.slug || searchParamFromUrl("preview") === "1") return;
    const corta = new URL(enlacePerfil(professional.slug, window.location.origin)).pathname;
    const prefijo = /^\/en(?=\/|$)/.test(window.location.pathname) ? "/en" : "";
    const params = new URLSearchParams(window.location.search);
    params.delete("from");
    const cadena = params.toString();
    const destino = `${prefijo}${corta}${cadena ? `?${cadena}` : ""}${window.location.hash}`;
    if (destino !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, "", destino);
    }
  }, [professional?.slug]);
  // En la app la barra de arriba siempre toma el «volver» (y ya se sabe en el
  // servidor por la cookie): la fila propia de la ficha no se pinta para
  // luego esconderse, que subía toda la ficha 85 px al llegar la confirmación.
  const appNativa = useNativeApp();
  const [navbarOwnsHeader, setNavbarOwnsHeader] = useState(() => appNativa && searchParams.get("preview") !== "1");
  // Deep-link support: /profesionales/[slug]?tab=casos opens that tab.
  // Preview mode (?preview=1): a pro opened "Ver cómo me ven los clientes" from
  // their panel → show a clear "Volver a mi panel" bar so they never get stuck.
  const [previewMode] = useState(() => searchParamFromUrl("preview") === "1");
  // The profession the client searched/filtered by (?categoria=): the contact
  // buttons carry it as context.
  const [activeCategory] = useState<string | undefined>(() => searchParamFromUrl("categoria") ?? undefined);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  // Quién visita se pregunta de una vez, sin esperar a la ficha: de eso depende que las acciones de la ficha propia queden
  // bloqueadas, y antes llegaba al final de una cadena de tres peticiones.
  useEffect(() => {
    let vivo = true;
    void createClient().auth.getUser().then(({ data }) => {
      if (!vivo) return;
      setViewerId(data.user?.id ?? null);
      setIsAuthenticated(!!data.user);
    });
    return () => { vivo = false; };
  }, []);
  const [slug, setSlug] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  // BLOQUEAR (6-oct-2026, regla 1.2 de Apple): desde el «···». Si esta cuenta
  // ya bloqueó a este profesional, la ficha no se muestra.
  const [bloqueando, setBloqueando] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  const tBloqueo = useTranslations("bloqueo");
  useEffect(() => {
    if (!viewerId || !professional?.profileId || viewerId === professional.profileId) return;
    let vivo = true;
    fetch("/api/block").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (vivo && d?.blocked?.some((b: { id: string }) => b.id === professional.profileId)) setBloqueado(true);
    }).catch(() => {});
    return () => { vivo = false; };
  }, [viewerId, professional?.profileId]);
  const [menuFichaAbierto, setMenuFichaAbierto] = useState(false);
  // Aviso de "enlace copiado" del botón Compartir. Vive aquí, con el resto de
  // los hooks: debajo de los `return` de carga React contaba un hook de más.
  const { compartir: compartirEnlace, avisoNodo: avisoCompartir } = useCompartir();
  // LA BARRA DICE SIEMPRE LO MISMO: a dónde devuelve la flecha.
  //
  // Antes cambiaba al desplazar: cuando el nombre de la tarjeta salía de la
  // vista, el rótulo pasaba de «Volver a resultados» al nombre del profesional
  // —la convención de iOS del título grande que se recoge—. Deja de funcionar
  // desde que el rótulo va PEGADO A LA FLECHA: ahí «← Redes Bahía» se lee como
  // «volver a Redes Bahía», que es justo lo contrario de lo que hace. Y rompe la
  // regla de la casa: un control no cambia de texto mientras uno lo mira.
  //
  // El nombre no se pierde: es el h1 de la tarjeta, y está a un dedo de
  // distancia hacia arriba.
  // Notificaciones usa el rótulo compartido de las fichas (en messages/*.json).
  const rotuloDeRegreso = assistantReturn ? tVolver("backToAssistant") : profileReturnHref === "/notificaciones" ? tVolver("backToNotifications") : profileReturnLabel(profileReturnHref, locale);
  const tituloBarra = rotuloDeRegreso;
  // El «...» (guardar, compartir, reportar) solo tiene sentido con una ficha que mostrar.
  const hayFicha = !loading && !proNotFound && !!professional;
  // De capa: la barra cambia en el mismo cuadro que la pantalla, al entrar y al volver.
  useLayoutEffect(() => {
    if (previewMode) return;
    const global = window as unknown as {
      __ccrSectionHeader?: string | null;
      __ccrSectionActive?: boolean;
      __ccrSectionShare?: boolean;
      __ccrSectionMenu?: boolean;
      __ccrSectionVolver?: boolean;
    };
    global.__ccrSectionHeader = tituloBarra;
    global.__ccrSectionActive = true;
    global.__ccrSectionShare = false;
    // El «...» de la barra, igual que en Empleos, Promociones y Proyectos:
    // guardar, compartir y reportar en el mismo orden y en la misma hoja.
    global.__ccrSectionMenu = hayFicha;
    global.__ccrSectionVolver = true;
    window.dispatchEvent(new CustomEvent("ccr:section-header", { detail: { title: tituloBarra, menu: hayFicha, volver: true } }));
    return () => {
      global.__ccrSectionHeader = null;
      global.__ccrSectionActive = false;
      global.__ccrSectionShare = false;
      global.__ccrSectionMenu = false;
      global.__ccrSectionVolver = false;
      // En la app la barra nunca suelta el «volver»: bajar la bandera aquí
      // pintaba la fila propia un cuadro entre un rótulo y el siguiente.
      if (!appNativa) setNavbarOwnsHeader(false);
      window.dispatchEvent(new CustomEvent("ccr:section-header", { detail: null }));
    };
  }, [previewMode, tituloBarra, hayFicha, appNativa]);

  const volverRef = useRef<(() => void) | null>(null);
  const compartirRef = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    // Sin ficha (perfil no encontrado) el «volver» de la ficha no existe:
    // la flecha regresa a la pantalla anterior, o al inicio si no hay.
    const onBack = () => {
      if (volverRef.current) return volverRef.current();
      if (window.history.length > 1) window.history.back();
      else window.location.assign("/");
    };
    const onShare = () => compartirRef.current?.();
    const onAck = () => setNavbarOwnsHeader(true);
    const onMenu = () => setMenuFichaAbierto(true);
    // La barra pudo confirmar antes de que esto escuchara: el aviso viaja
    // también como bandera, si no la ficha dibujaba su propio «volver» además
    // del de la barra.
    if ((window as unknown as { __ccrSectionAck?: boolean }).__ccrSectionAck) onAck();
    window.addEventListener("ccr:section-back", onBack);
    window.addEventListener("ccr:section-share", onShare);
    window.addEventListener("ccr:section-menu", onMenu);
    window.addEventListener("ccr:section-header-ack", onAck);
    return () => {
      window.removeEventListener("ccr:section-back", onBack);
      window.removeEventListener("ccr:section-share", onShare);
      window.removeEventListener("ccr:section-menu", onMenu);
      window.removeEventListener("ccr:section-header-ack", onAck);
    };
  }, []);
  // «¿NO TE RESPONDIÓ?» (4-oct-2026): tras abrir WhatsApp, al volver a la
  // ficha se ofrece publicar lo que necesita para que le escriban varios.
  // Una vez por visita; se cierra con la ✕.
  const [ofrecerProyecto, setOfrecerProyecto] = useState(false);
  useEffect(() => {
    let abrio = false;
    const alAbrir = () => { abrio = true; };
    const alVolver = () => { if (abrio && document.visibilityState === "visible") setOfrecerProyecto(true); };
    window.addEventListener("ccr:whatsapp-abierto", alAbrir);
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    return () => {
      window.removeEventListener("ccr:whatsapp-abierto", alAbrir);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, []);
  const [serviceDescriptionOpen, setServiceDescriptionOpen] = useState<{ title: string; description: string } | null>(null);

  // Recarga puntual del perfil (tras publicar una reseña, por ejemplo): pide
  // los datos frescos y actualiza lista, promedio y contador.
  const reloadProfessional = useCallback(async () => {
    if (!routeSlug) return;
    try {
      const res = await fetch(`/api/professionals/${routeSlug}`, { cache: "no-store" });
      if (!res.ok) return;
      const fresh: ProfessionalDetail | null = await res.json();
      if (!fresh) return;
      setProfessional((current) => (current ? { ...current, ...fresh } : fresh));
      const cached = getDashboardCache<ProfilePageData>(`profile:${routeSlug}`);
      if (cached) setDashboardCache(`profile:${routeSlug}`, { ...cached, pro: fresh });
    } catch {
      /* una recarga fallida deja los datos que ya estaban */
    }
  }, [routeSlug]);

  useEffect(() => {
    async function load() {
      if (!routeSlug) return;
      // A profile seen before paints from the cache at once (five minutes in
      // this tab) and refreshes quietly; a first visit shows the loading state.
      const cacheKey = `profile:${routeSlug}`;
      const warm = getDashboardCache<ProfilePageData>(cacheKey);
      if (warm) {
        setProfessional(warm.pro);
        setPublicOffers(warm.offers);
        setPublicJobs(warm.jobs);
        setLoading(false);
      } else if (!fichaInicial) {
        setLoading(true);
      }
      setProNotFound(false);
      setSlug(routeSlug);
      const res = await fetch(`/api/professionals/${routeSlug}`);
      if (!res.ok) { setProNotFound(true); setLoading(false); return; }
      const pro: ProfessionalDetail | null = await res.json();
      if (!pro) { setProNotFound(true); setLoading(false); return; }
      const supabase = createClient();
      const today = new Date().toISOString().slice(0, 10);
      const [offersResult, jobsResult, authResult] = await Promise.all([
        supabase
          .from("professional_offers")
          .select("id, professional_id, service_category_id, title, description, offer_type, service_label, image_urls, price_now, price_before, currency, price_unit, location_label, valid_until, quantity_available, status, created_at")
          .eq("professional_id", pro.id)
          .eq("status", "published")
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("job_posts")
          .select("id, employer_id, service_category_id, duration_label, experience_level, title, description, responsibilities, requirements, benefits, employment_type, workplace_type, provincia_id, canton_id, location_label, salary_min, salary_max, salary_period, currency, show_salary, openings, application_deadline, status, created_at")
          .eq("employer_id", pro.id)
          .eq("status", "published")
          .order("created_at", { ascending: false })
          .limit(8),
        supabase.auth.getUser(),
      ]);
      const fresh: ProfilePageData = {
        pro,
        offers: ((offersResult.data ?? []) as unknown as ProfessionalOffer[]).filter(
          (offer) => !offer.valid_until || offer.valid_until >= today,
        ),
        jobs: ((jobsResult.data ?? []) as unknown as JobPost[]).filter(
          (job) => !job.application_deadline || job.application_deadline >= today,
        ),
      };
      setDashboardCache(cacheKey, fresh);
      setProfessional(fresh.pro);
      setPublicOffers(fresh.offers);
      setPublicJobs(fresh.jobs);
      const { data: { user } } = authResult;
      setIsAuthenticated(!!user);
      setViewerId(user?.id ?? null);
      if (user?.id !== pro.profileId) {
        trackInteraction({ type: "profile_view", professionalId: pro.id, source: "profile", locale });
      }

      setLoading(false);
    }
    load();
  }, [locale, routeSlug]);


  // Resolve the viewer's role-aware panel route up front (parallel, non-blocking) so the
  // "Profesional no encontrado" screen can offer "Volver a mi panel" even though load()
  // bails early on a missing pro. Reads ONLY the session (no avatar/profiles query).
  useEffect(() => {
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(({ data: { user } }) => {
        if (!user) { setPanelHref(null); return; }
        const role = (user.user_metadata?.role as string | undefined) ?? "client";
        setPanelHref(role === "professional" ? "/dashboard/profesional" : "/dashboard/profesional?mode=use");
      })
      .catch(() => setPanelHref(null));
  }, []);

  useEffect(() => {
    if (!professional || typeof window === "undefined") return;
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab !== "resenas") return;

    const scrollToReviews = () => {
      document.getElementById("resenas")?.scrollIntoView({ block: "start" });
    };
    // activeTab already reads ?tab=resenas. A background profile refresh must
    // not reset a section the visitor selected while that request was loading.
    const firstFrame = window.requestAnimationFrame(scrollToReviews);
    const fallback = window.setTimeout(scrollToReviews, 250);
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.clearTimeout(fallback);
    };
  }, [professional]);

  // Guardar, con su estado y su aviso de «no te podés guardar a vos mismo».
  // Va ARRIBA de los returns tempranos: un gancho no se puede llamar a veces.
  // Mientras la ficha carga, el profesional todavía no existe y se le pasa un
  // identificador vacío; la hoja del «...» no se abre hasta que hay ficha.
  const guardarPro = useGuardarProfesional({
    pro: (professional
      ? {
          id: professional.id,
          profileId: professional.profileId,
          slug: professional.slug,
          fullName: professional.fullName,
          businessName: professional.businessName,
          avatarUrl: professional.avatarUrl ?? undefined,
          categoryIcon: professional.categoryIcon,
          categoryId: professional.categoryId,
          provinceName: professional.provinceName,
          cantonName: professional.cantonName,
          ratingAvg: professional.ratingAvg,
          reviewCount: professional.reviewCount,
          hourlyRate: professional.hourlyRate,
          isVerified: professional.verificationStatus === "verified",
          videoconsulta: professional.videoconsulta,
          coverage: professional.coverage,
        }
      : { id: "", slug: "", fullName: "" }) as SavedPro,
    isOwn: !!viewerId && viewerId === professional?.profileId,
  });

  if (loading) {
    return <PerfilSkeleton />;
  }

  if (bloqueado && professional) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <Navbar />
        <main className="flex-1 bg-white">
          <section className="mx-auto flex min-h-[calc(100dvh-64px)] max-w-3xl flex-col items-center justify-center px-6 py-14 text-center sm:px-8 sm:py-20">
            <BrandIconBadge icon={Ban} size={76} />
            <div className="mt-7 space-y-4">
              <h1 className="text-[28px] font-bold leading-tight text-[#162543] sm:text-3xl">{tBloqueo("pantallaTitulo")}</h1>
              <p className="mx-auto max-w-md text-base leading-7 text-[#6b7280] sm:text-[17px]">{tBloqueo("pantallaTexto")}</p>
            </div>
            <Link href="/profesionales" className="mt-9 inline-flex min-h-12 items-center justify-center rounded-full bg-[#009FD9] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0089bb]">{t("searchProfessionals")}</Link>
          </section>
        </main>
      </div>
    );
  }

  if (proNotFound || !professional) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <Navbar />
        <main className="flex-1 bg-white">
          <section className="mx-auto flex min-h-[calc(100dvh-64px)] max-w-3xl flex-col items-center justify-center px-6 py-14 text-center sm:px-8 sm:py-20">
            <BrandIconBadge icon={SearchX} size={76} />
            <div className="mt-7 space-y-4">
              <h1 className="text-[28px] font-bold leading-tight text-[#162543] sm:text-3xl">{t("notFoundTitle")}</h1>
              <p className="mx-auto max-w-md text-base leading-7 text-[#6b7280] sm:text-[17px]">
                {t("notFoundDesc")}
              </p>
            </div>
            {/* A logged-in visitor gets a role-aware "Volver a mi panel" (primary) so they're
                never stranded; "Buscar profesionales" stays as the secondary. A guest sees
                only "Buscar profesionales" (no broken panel link). Stacks full-width ~360px. */}
            <div className="mt-9 flex w-full max-w-sm flex-col items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center">
              {panelHref && (
                <Link
                  href={panelHref}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#009FD9] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0089bb] sm:w-auto"
                >
                  <ArrowLeft className="h-4 w-4" /> {t("backToPanel")}
                </Link>
              )}
              <Link
                href="/profesionales"
                className={
                  panelHref
                    ? "inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#e5e7eb] px-6 py-3 text-sm font-semibold text-[#374151] transition-colors hover:border-[#009FD9] hover:text-[#009FD9] sm:w-auto"
                    : "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#009FD9] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0089bb] sm:w-auto"
                }
              >
                {t("searchProfessionals")}
              </Link>
            </div>
          </section>
        </main>
        <LandingFooter />
      </div>
    );
  }

  const expYears = professional.yearsExperience ?? 0;

  // Hide services the pro marked INACTIVE (paused) — clients only see active ones.
  const services = (professional.services ?? []).filter((s) => (s as { active?: boolean }).active !== false);
  const locationText = [professional.cantonName, professional.provinceName].filter(Boolean).join(", ");
  // Fallback location tab/address for the contact-card schedule (when the pro has no named
  // workplaces) — same data the /buscar card passes to ProfessionalSchedule.
  const placeFallback = professional.cantonName || professional.provinceName || "";
  const placeAddress = locationText;

  const hasCasos = !!professional.portfolioUrls && professional.portfolioUrls.length > 0;
  // Los casos de éxito, una sola vez: los usa la pestaña y la franja de fotos de
  // la cabecera. Lee las dos formas guardadas —casos nuevos (con `photos[]`) y
  // fotos viejas (`{url}`), agrupadas por profesión de tres en tres—.
  const profsOrder = (professional.professions && professional.professions.length > 0)
    ? professional.professions
    : (professional.categoryId ? [professional.categoryId] : []);
  type Caso = { id: string; profession: string; title?: string; description?: string; recipient?: string; date?: string; photos: string[] };
  const caseList: Caso[] = (() => {
    if (!hasCasos) return [];
    const svcs = professional.services ?? [];
    const primaryProf = profsOrder[0] ?? "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profOf = (it: any) => casoProfession(it, svcs, primaryProf);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any[] = (professional.portfolioItems && professional.portfolioItems.length > 0)
      ? professional.portfolioItems
      : (professional.portfolioUrls ?? []).map((url) => ({ url }));
    const lista: Caso[] = [];
    const legacyByProf = new Map<string, string[]>();
    for (const it of raw) {
      if (Array.isArray(it?.photos) && it.id) {
        lista.push({ id: String(it.id), profession: it.profession ?? primaryProf, title: it.title, description: it.description, recipient: it.recipient, date: it.date, photos: it.photos });
      } else if (it?.url) {
        const prof = profOf(it) || primaryProf || "";
        const arr = legacyByProf.get(prof) ?? []; arr.push(it.url); legacyByProf.set(prof, arr);
      }
    }
    for (const [prof, photos] of legacyByProf) {
      for (let i = 0; i < photos.length; i += 3) lista.push({ id: `${prof}_${i}`, profession: prof, photos: photos.slice(i, i + 3) });
    }
    return lista;
  })();
  // LA FRANJA DE FOTOS DE ARRIBA (modelo Yelp, 19-nov-2026): la portada de cada
  // caso primero —que la franja muestre trabajos distintos— y luego el resto,
  // hasta cuatro. Sin casos no hay franja: nunca una caja gris vacía.
  const coverPhotos = (() => {
    const portadas = caseList.map((c) => c.photos.find((p) => typeof p === "string" && p.trim())).filter((p): p is string => !!p);
    const resto = caseList.flatMap((c) => c.photos).filter((p) => typeof p === "string" && p.trim() && !portadas.includes(p));
    return [...new Set([...portadas, ...resto])].slice(0, 4);
  })();
  const certificationsList = (professional.certifications ?? []).filter((c) => c?.name?.trim());
  const cvProfile = normalizeCv(professional.cvProfile);
  const hasCerts = certificationsList.length > 0 || hasCv(cvProfile) || !!professional.hasCvFile;
  // A pro viewing their OWN public profile cannot request a service from themselves.
  const isOwn = !!viewerId && viewerId === professional.profileId;

  // Compartir abre siempre la misma hoja: el enlace a la vista y WhatsApp,
  // Facebook y correo. Antes en computadora solo copiaba, sin decir a dónde iba.
  // Compartir la ficha: la hoja del sistema en el teléfono, copiar el enlace
  // en la computadora —igual que empleos, promociones y proyectos—. Antes abría
  // una ventana con WhatsApp, Instagram, Facebook y correo.
  function shareProfile() {
    if (!professional) return;
    trackInteraction({ type: "profile_share", professionalId: professional.id, source: "profile", locale });
    const url = enlacePerfil(professional.slug, process.env.NEXT_PUBLIC_APP_URL || window.location.origin);
    void compartirEnlace(url, professional.businessName?.trim() || proDisplayName(professional.fullName));
  }
  const displayName = getProfessionalDisplayName(professional.fullName, professional.businessName);
  const visitaProfesional = {
    id: professional.slug ?? slug,
    titulo: displayName.primaryMobile,
    subtitulo: professional.cantonName ?? undefined,
    imagen: professional.avatarUrl ?? undefined,
    iniciales: getInitials(professional.fullName),
    href: `/profesionales/${professional.slug ?? slug}`,
  };
  // Sin pestaña de contacto: WhatsApp y Llamar subieron a la tarjeta de arriba,
  // donde se ven sin tocar nada. Esconder la única acción que convierte detrás
  // de una pestaña era el mismo error que el muro de registro.
  const TABS: Array<{ id: Tab; label: string }> = [
    { id: "servicios",      label: t("tabs.servicios") },
    { id: "resenas",        label: t("tabs.resenas") },
    ...(hasCasos ? [{ id: "casos" as Tab, label: t("tabs.casos") }] : []),
    ...(publicOffers.length > 0 ? [{ id: "promociones" as Tab, label: locale === "en" ? "Promotions" : "Promociones" }] : []),
    ...(EMPLEOS_VISIBLE && publicJobs.length > 0 ? [{ id: "empleos" as Tab, label: locale === "en" ? "Jobs" : "Empleos" }] : []),
    // La formación vuelve a tener pestaña propia: solo aparece si hay algo que mostrar.
    ...(hasCerts ? [{ id: "certificaciones" as Tab, label: t("tabs.certificaciones") }] : []),
    { id: "sobre",          label: t("tabs.sobre") },
  ];

  // Precio, horarios, contacto y redes. En el teléfono es la pestaña
  // "Disponibilidad"; en computadora es la columna fija de la derecha, como
  // en Upwork o Thumbtack: así deja de ser un contenedor enorme con cuatro
  // líneas adentro y lo que hace contratar queda siempre a la vista.
  // Las redes del profesional: solo iconos, en la tarjeta de identidad. Con
  // rótulo y al final del bloque de contacto no se veían sin desplazar, y
  // puestas como botones grandes competían con «Enviar mensaje» y «Llamar».
  const redesDelProfesional = (() => {
    const sl = professional.socialLinks;
    return [
      { k: "website", href: buildWebsiteUrl(sl?.website), Icon: Globe },
      { k: "instagram", href: buildSocialUrl("instagram", sl?.instagram), Icon: InstagramIcon },
      { k: "facebook", href: buildSocialUrl("facebook", sl?.facebook), Icon: FacebookIcon },
      { k: "tiktok", href: buildSocialUrl("tiktok", sl?.tiktok), Icon: TikTokIcon },
      { k: "linkedin", href: buildSocialUrl("linkedin", sl?.linkedin), Icon: LinkedInIcon },
    ].filter((x) => x.href);
  })();

  // Las acciones de la ficha, en UN SOLO SITIO: las usa el «···» de la barra
  // del teléfono y el «···» de computadora. Antes en computadora iban sueltas
  // —«Guardar» y «Copiar enlace» escritas en la esquina—, así que la misma
  // ficha ofrecía sus acciones de dos formas según la pantalla, y ninguna otra
  // sección lo hace: en Empleos, Promociones y Proyectos siempre es el «···».
  const opcionesDeLaFicha = [
          // En la ficha propia no se ofrece guardar, igual que en la ficha
          // propia de un empleo, una promoción o un proyecto. Antes salía y,
          // al tocarlo, no pasaba nada: el aviso que lo explica solo lo dibuja
          // el botón de computadora, no este menú.
          ...(isOwn ? [] : [{
            id: "guardar",
            icono: <Bookmark className={`h-4 w-4 ${guardarPro.guardado ? "fill-current text-[#0089bb]" : ""}`} />,
            texto: guardarPro.etiqueta,
            onSelect: () => void guardarPro.alternar(),
          }]),
          // Las dos caras pintadas y el CSS elige, como en `CaraCompartir`:
          // Chrome en macOS trae `navigator.share` y el menú decía «Compartir».
          {
            id: "compartir",
            icono: <CaraCompartir dedo={<Share2 className="h-4 w-4" />} raton={<Link2 className="h-4 w-4" />} />,
            texto: <CaraCompartir dedo={tMenu("share")} raton={tMenu("copyLink")} />,
            etiqueta: tMenu("share"),
            onSelect: shareProfile,
          },
          ...(isOwn ? [] : [{ id: "reportar", icono: <Flag className="h-4 w-4" />, texto: tMenu("report"), peligro: true, onSelect: () => setReportOpen(true) }]),
          ...(isOwn ? [] : [{ id: "bloquear", icono: <Ban className="h-4 w-4" />, texto: tMenu("block"), peligro: true, onSelect: () => setBloqueando(true) }]),
  ];

  const bloqueContacto = (conAncla: boolean) => (
    // Precio y zona son UN bloque («cuánto y dónde»): con 16 px entre los dos,
    // y la línea alta del precio, se leían como dos secciones sueltas.
    <div {...(conAncla ? { id: "perfil-contacto" } : {})} className="mx-auto flex w-full max-w-md flex-col gap-1.5 lg:max-w-none">
      <div>
        {(() => {
          const label = primaryPricingLabel(professional.pricing, professional.hourlyRate, locale);
          const { amount, unit, taxSuffix } = splitPricingLabel(label);
          return (
            <p className="leading-tight">
              <span className="text-xl font-bold text-[#009FD9]">{amount}</span>
              {unit && <span className="text-sm font-semibold text-[#52627a]"> {unit}</span>}
              {taxSuffix && <span className="text-[11px] font-semibold tracking-wide text-[#68778d]"> · {taxSuffix}</span>}
            </p>
          );
        })()}
      </div>
      <ProfessionalSchedule
        stacked
        professional={professional}
        activeCategory={activeCategory}
        categoryName={catLabel(professional.categoryId)}
        isOwn={isOwn}
        placeFallback={placeFallback}
        placeAddress={placeAddress}
        businessName={professional.businessName ?? ""}
        // «+N zonas» abre Información, que es donde vive la lista completa con
        // sus direcciones. Antes la ficha la tenía dos veces.
        // Las redes van después de esta tarjeta: si no hay, la raya que cierra
        // la ubicación no separa nada y queda suelta contra el borde.
        hayContenidoDespues={redesDelProfesional.length > 0}
        onVerZonas={() => {
          setActiveTab("sobre");
          requestAnimationFrame(() => document.getElementById("resenas")?.scrollIntoView({ behavior: "smooth", block: "start" }));
        }}
      />
      {/* Las redes van DESPUÉS de los botones de contacto: son para creerle al
          profesional, no para contactarlo, así que no compiten con «Enviar
          mensaje» ni con «Llamar». Solo iconos, centrados. */}
      {(redesDelProfesional.length > 0 || professional.workplaces?.length) ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {redesDelProfesional.map(({ k, href, Icon }) => (
            <a
              key={k}
              href={href as string}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={k === "website" ? t("linksWebsite") : k}
              title={k === "website" ? t("linksWebsite") : k}
              onClick={() => trackInteraction({
                type: "external_link_click",
                professionalId: professional.id,
                source: "profile_social",
                locale,
                metadata: { channel: k },
              })}
              className="grid h-9 w-9 place-items-center rounded-full border border-[#e5e7eb] text-[#52627a] transition-colors hover:border-[#009FD9] hover:text-[#009FD9]"
            >
              <Icon className="h-4 w-4" />
            </a>
          ))}
          <WorkplaceDirections places={professional.workplaces} english={locale === "en"}/>
        </div>
      ) : null}
    </div>
  );

  // REPORTAR VIVE EN EL «···», Y EN UN SOLO SITIO.
  // Estuvo pegado a WhatsApp y Llamar —donde parecía una tercera forma de
  // contactar—, y de ahí se mudó al pie de «Información». Cuando la ficha ganó
  // su «···» con guardar, compartir y reportar, quedaron los dos: la misma
  // acción dos veces en la misma pantalla, y la de abajo escondida al final de
  // una pestaña que casi nadie abre. Se queda la del menú, que es donde está en
  // las fichas de empleo, promoción y proyecto.

  // «disponibilidad» ya no es una pestaña: si llega por un enlace viejo, se cae
  // en la primera que sí existe.
  const primeraPestana = TABS[0]?.id ?? "sobre";
  const tabEfectiva: Tab = activeTab === "disponibilidad" ? primeraPestana : activeTab;
  // Derivado durante el render (no en un efecto): así la pestaña nueva ya está
  // montada en el mismo cuadro en que se elige, sin un cuadro vacío.
  if (!pestanasVisitadas.has(tabEfectiva)) setPestanasVisitadas((previas) => new Set(previas).add(tabEfectiva));
  const montada = (id: string) => id === tabEfectiva || pestanasVisitadas.has(id);
  // Abrir una sección desde la cabecera (estrellas, «Escribir una reseña», la
  // franja de fotos): la pestaña se elige y la tira de pestañas sube a la vista.
  const en = locale === "en";
  const irASeccion = (tab: Tab) => {
    setActiveTab(tab);
    requestAnimationFrame(() => document.getElementById("resenas")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  // La zona en la cabecera SOLO cuando el profesional no guardó lugares de
  // trabajo: entonces es la misma que dice la tarjeta de contacto. Con lugares,
  // el cantón del perfil puede no ser ninguno de ellos («Atenas» arriba y
  // «Escazú +5 zonas» al lado): la zona vive completa en la tarjeta.
  const zonaDeCabecera = professional.workplaces?.length ? "" : locationText;
  const etiquetasDeServicio = [...new Set(profsOrder.map((id) => catLabel(id)).filter(Boolean))];
  // Tecla de la fila de acciones: píldora en computadora, ícono sobre el rótulo
  // en el teléfono (tres iguales a lo ancho). 44 px de alto mínimo en los dos.
  const accionDeFicha = cn(
    "inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-full border border-[#cfd9e3] bg-white px-4 text-[14px] font-semibold text-[#162543] transition-colors hover:border-[#162543] hover:bg-[#f7fafc]",
    "max-sm:min-h-[60px] max-sm:flex-col max-sm:gap-1 max-sm:rounded-xl max-sm:px-1.5 max-sm:py-2 max-sm:text-[12.5px] max-sm:leading-tight",
    ring,
  );

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar />

      {/* El respiro final es solo eso: el alto de la barra de abajo ya lo
          descuenta el propio main (`position: fixed; bottom: barra`), y
          reservarlo otra vez dejaba 91 px de scroll contra el vacío. */}
      <main className="flex-1 pb-8 pt-4 lg:pt-8 [.ccr-native-app_&]:!pt-0 [.ccr-native-app_&]:!pb-6">
        <div className="mx-auto max-w-7xl px-4 pt-0 sm:px-6 lg:px-8 [.ccr-native-app_&]:pt-4">

          {/* Preview mode → a clear way back to the panel. Otherwise, back to search. */}
          {!previewMode && <RecordRecentVisit surface="profesionales" visita={visitaProfesional} />}
          {previewMode ? (
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-sm text-[#6b7280] font-medium">{t("previewNote")}</p>
              <Link href="/dashboard/profesional" className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#009FD9] hover:bg-[#0089bb] text-white text-sm font-semibold px-4 py-2 transition-colors shrink-0">
                <ArrowLeft className="h-4 w-4" /> {t("backToPanel")}
              </Link>
            </div>
          ) : (
            <div className={cn(
              "-mx-4 mb-6 flex items-center justify-between gap-3 border-b border-[#e5e7eb] bg-white px-4 py-2.5 sm:-mx-6 sm:px-6",
              // EN COMPUTADORA NO SE DIBUJA. La flecha del navegador ya está a
              // la izquierda de la dirección y hace exactamente eso; una segunda
              // dentro de la página duplica el camino. En el teléfono se queda,
              // que ahí no hay otra. (Prueba: sin-volver-en-computadora.spec.ts)
              "lg:hidden",
              // La barra superior toma el título y el «volver» SOLO en el teléfono
              // (ahí es donde dibuja «← Título»). En computadora la barra no lo
              // dibuja, así que ocultar el de la página dejaba la ficha sin ningún
              // «Volver a resultados»: se pintaba en el servidor y desaparecía al
              // montar, que era el parpadeo, y encima se perdía el enlace.
              navbarOwnsHeader && "max-lg:hidden",
            )}>
              <Link
                href={profileReturnHref}
                onClick={() => {
                  // Cover the destination while the origin route is resolving;
                  // returning to the assistant must not expose the old panel.
                  if (assistantReturn) window.dispatchEvent(new Event("contratacr:open-ai"));
                }}
                ref={(node) => { volverRef.current = node ? () => node.click() : null; }}
                className="inline-flex h-10 min-w-0 items-center gap-1.5 text-sm font-semibold text-[#374151] transition-colors hover:text-[#009FD9] lg:rounded-lg lg:px-2 lg:font-extrabold lg:text-[#162543] lg:hover:bg-[#eaf6fc]"
              >
                <ArrowLeft className="h-4 w-4 shrink-0" />
                <span className="truncate">{rotuloDeRegreso}</span>
              </Link>

            </div>
          )}

          {/* No unverified-identity notice in the client preview: the ABSENCE of the
              "Verificado" badge already communicates the unverified state. (The invite to
              verify lives in the pro's own panel.) */}

          {/* ── FRANJA DE FOTOS (modelo Yelp, 19-nov-2026) ── Lo primero que se ve
              son los trabajos: las portadas de los casos de éxito, a lo ancho, y
              un solo control que abre la pestaña de casos. Sin casos no se pinta
              nada (nunca una caja gris vacía): la cabecera arranca con la foto y
              el nombre, como siempre. En el teléfono va a sangre, sin bordes. */}
          {coverPhotos.length > 0 && (
            <button
              type="button"
              data-profile-cover={coverPhotos.length}
              onClick={() => irASeccion("casos")}
              aria-label={t("biz.coverSeeAll", { count: caseList.length })}
              className={cn("group relative -mx-4 mb-5 block w-[calc(100%+2rem)] overflow-hidden bg-[#eef2f6] text-left sm:mx-0 sm:mb-7 sm:w-full sm:rounded-2xl lg:mb-8", ring)}
            >
              <span className={cn(
                "grid h-[208px] grid-cols-1 gap-1 sm:h-[260px] lg:h-[300px]",
                coverPhotos.length === 2 && "sm:grid-cols-2",
                coverPhotos.length === 3 && "sm:grid-cols-4",
                coverPhotos.length >= 4 && "sm:grid-cols-4 sm:grid-rows-2",
              )}>
                {coverPhotos.map((foto, i) => (
                  <span
                    key={foto}
                    className={cn(
                      "relative block min-h-0 overflow-hidden",
                      i > 0 && "hidden sm:block",
                      coverPhotos.length === 3 && i === 0 && "sm:col-span-2",
                      coverPhotos.length >= 4 && i === 0 && "sm:col-span-2 sm:row-span-2",
                      coverPhotos.length >= 4 && i === 1 && "sm:row-span-2",
                    )}
                  >
                    <ProgressiveImage
                      src={cldLarge(foto, i === 0 ? 1100 : 640)}
                      alt=""
                      priority={i === 0}
                      fit="cover"
                      wrapperClassName="h-full w-full"
                      className="transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                    />
                  </span>
                ))}
              </span>
              <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0b1628]/45 to-transparent" />
              <span aria-hidden className="absolute bottom-3 right-4 inline-flex min-h-10 items-center gap-2 rounded-full bg-white/95 px-4 text-[14px] font-semibold text-[#162543] shadow-[0_6px_18px_-8px_rgba(11,22,40,0.6)] transition-colors group-hover:bg-white sm:bottom-4 sm:right-4">
                <Images className="h-4 w-4 text-[#009FD9]" />
                {t("biz.coverSeeAll", { count: caseList.length })}
              </span>
            </button>
          )}

          {/* Sin items-start: la columna derecha tiene que estirarse a lo alto de la
              fila para que su tarjeta pueda quedarse pegada al bajar. */}
          <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">

            {/* ── COLUMNA IZQUIERDA: identidad y secciones ── */}
            <div className="order-1 flex-1 min-w-0">
            {/* ── CABECERA (modelo Yelp) ── Foto | nombre con su sello, estrellas
                con el número de reseñas, los servicios como etiquetas y los datos
                que SÍ existen (zona, años de experiencia: nunca uno inventado).
                Debajo, la fila de acciones sobre la ficha. Sin tarjeta: es la
                cabecera de la página, no una caja más. */}
            <div data-profile-header className="relative mb-2 rounded-2xl">
              <div className="flex min-w-0 items-start gap-3 sm:gap-5">
                <ImagePreviewDialog
                  src={professional.avatarUrl}
                  alt={professional.fullName}
                  openLabel={tFoto("viewPhoto")}
                  closeLabel={t("close")}
                  className="shrink-0"
                >
                  {/* LA FOTO LA PINTA EL SERVIDOR, Y LAS INICIALES SON LAS DEL
                      NOMBRE QUE SE LEE ARRIBA. Con el avatar de Radix la <img> no
                      existía hasta que el NAVEGADOR cargaba la imagen: en cada
                      recarga se veían primero las iniciales («MH» de Mateo
                      Herrera bajo el título «Redes Bahía») y después la foto. Una
                      <img> normal viaja en el HTML y las iniciales quedan DETRÁS. */}
                  <span data-profile-identity-avatar className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-[#EBF5FB] ring-1 ring-[#e3e9ef] ${profileIdentityAvatarClass}`}>
                    {/* Las iniciales SOLO si no hay foto: detrás de un logo con
                        fondo transparente se veían por debajo del dibujo. */}
                    {!professional.avatarUrl && (
                      <span aria-hidden className="text-xl font-bold text-[#009FD9] sm:text-2xl">{getInitials(displayName.primaryMobile)}</span>
                    )}
                    {professional.avatarUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cldThumb(professional.avatarUrl, 320)}
                        alt={displayName.primaryMobile}
                        loading="eager"
                        fetchPriority="high"
                        decoding="async"
                        // `bg-white`: un PNG con fondo transparente no deja
                        // ver el azul del hueco detrás.
                        className="absolute inset-0 h-full w-full bg-white object-cover"
                      />
                    )}
                  </span>
                </ImagePreviewDialog>
                <div className="min-w-0 flex-1 sm:pt-1">
                  {/* El «···» va en el MISMO renglón del nombre: el menú es de
                      ESTA ficha, y la ficha es el nombre. En el teléfono lo
                      dibuja la barra de arriba. */}
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div data-verification-owner className="min-w-0">
                      <ProfileIdentityName testId="professional-profile-name" name={displayName.primaryDesktop}
                        badge={professional.verificationStatus === "verified" ? <VerificationInfo /> : null} />
                    </div>
                    <MenuFicha className="-mt-1.5 hidden shrink-0 sm:block" opciones={opcionesDeLaFicha} />
                  </div>
                  <div className="mt-1 sm:mt-1.5">
                    {professional.reviewCount > 0 ? (
                      // Toda la línea abre Reseñas: estrellas, promedio y cuántas.
                      <button
                        type="button"
                        onClick={() => irASeccion("resenas")}
                        aria-label={`${ratingNumber(professional.ratingAvg, en)} · ${t("reviewCountLabel", { count: professional.reviewCount })}`}
                        data-rating-line={professional.reviewCount}
                        className={cn("-mx-1 inline-flex min-h-11 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg px-1 text-left text-[15px]", ring)}
                      >
                        <Stars value={professional.ratingAvg} />
                        <span className="font-bold text-[#162543]">{ratingNumber(professional.ratingAvg, en)}</span>
                        <span className="text-[#526277] underline-offset-2 hover:underline">({t("reviewCountLabel", { count: professional.reviewCount })})</span>
                      </button>
                    ) : (
                      <div className="flex min-h-11 items-center"><RatingLine average={null} count={0} en={en} /></div>
                    )}
                  </div>
                  {etiquetasDeServicio.length > 0 && (
                    <ul className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5" data-profile-categories>
                      {etiquetasDeServicio.slice(0, 3).map((label) => (
                        <li key={label} className={cn(BIZ.chip, "max-w-full truncate")}>{label}</li>
                      ))}
                      {etiquetasDeServicio.length > 3 && (
                        <li className="text-[13px] font-semibold text-[#526277]">{t("biz.moreCategories", { count: etiquetasDeServicio.length - 3 })}</li>
                      )}
                    </ul>
                  )}
                  {(zonaDeCabecera || expYears > 0) && (
                    <ul className={cn("mt-3 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 text-[14px] text-[#526277]", expYears <= 0 && "max-lg:hidden")} data-profile-facts>
                      {zonaDeCabecera && (
                        // En el teléfono la zona sale justo debajo, en el bloque de
                        // contacto: aquí solo la repetía.
                        <li className="inline-flex min-w-0 items-center gap-1.5 max-lg:hidden">
                          <MapPin aria-hidden className="h-4 w-4 shrink-0 text-[#009FD9]" />
                          <span className="min-w-0 truncate">{zonaDeCabecera}</span>
                        </li>
                      )}
                      {expYears > 0 && (
                        <li className="inline-flex items-center gap-1.5">
                          <Briefcase aria-hidden className="h-4 w-4 shrink-0 text-[#009FD9]" />
                          <span>{t("biz.experienceYears", { count: expYears })}</span>
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              </div>

              {/* LA FILA DE ACCIONES (modelo Yelp): reseñar, compartir y guardar,
                  a la vista. Contactar NO va aquí: es la tarjeta de la derecha en
                  computadora y la franja pegada al fondo en el teléfono. En el
                  teléfono son tres teclas iguales con el ícono arriba.
                  Guardar NO lleva `data-save-button`: ese atributo marca «el
                  botón de guardar de esta pantalla» para el «···» y las pruebas,
                  y aquí el «···» sigue ofreciendo guardar. */}
              <div className="mt-4 grid grid-cols-3 gap-2 sm:mt-5 sm:flex sm:flex-wrap" data-profile-actions>
                <button type="button" onClick={() => irASeccion("resenas")} data-profile-write-review className={cn(accionDeFicha, "sm:border-[#162543] sm:bg-[#162543] sm:text-white sm:hover:border-[#22355c] sm:hover:bg-[#22355c]")}>
                  <PenLine aria-hidden className="h-[18px] w-[18px] shrink-0" />
                  <span className="truncate">{t("biz.writeReview")}</span>
                </button>
                <button type="button" onClick={shareProfile} className={accionDeFicha}>
                  <CaraCompartir
                    dedo={<span className="inline-flex items-center gap-2 max-sm:flex-col max-sm:gap-1"><Share2 aria-hidden className="h-[18px] w-[18px] shrink-0" /><span>{tMenu("share")}</span></span>}
                    raton={<span className="inline-flex items-center gap-2 max-sm:flex-col max-sm:gap-1"><Link2 aria-hidden className="h-[18px] w-[18px] shrink-0" /><span>{tMenu("copyLink")}</span></span>}
                  />
                </button>
                <button
                  type="button"
                  data-profile-save
                  aria-pressed={guardarPro.guardado}
                  onClick={(e) => void guardarPro.alternar(e)}
                  className={cn(accionDeFicha, guardarPro.guardado && "border-[#009FD9] bg-[#eaf7fc] text-[#007fae] hover:border-[#009FD9]")}
                >
                  <Bookmark aria-hidden className="h-[18px] w-[18px] shrink-0" fill={guardarPro.guardado ? "currentColor" : "none"} />
                  <span>{guardarPro.etiqueta}</span>
                </button>
              </div>
              <SelfActionModal open={!!guardarPro.selfMsg} onClose={guardarPro.limpiarSelfMsg} message={guardarPro.selfMsg ?? ""} />

              {/* En el teléfono, contactar vive AQUÍ: precio, zona y los botones
                  (que se pegan al fondo de la pantalla). En computadora es la
                  columna de la derecha, siempre a la vista. */}
              <div className="mt-5 border-t border-[#e8edf2] pt-5 lg:hidden">{bloqueContacto(true)}</div>
            </div>
            <div id="resenas" className="scroll-mt-24 [.ccr-native-app_&]:scroll-mt-0">
              {/* Las secciones, sin caja alrededor (modelo Yelp): la tira de
                  pestañas con su raya y el contenido debajo, a lo ancho de la
                  columna. */}
              <div className="bg-white">

                {/* Tab bar — sticks under the header on the phone so any section is one tap away. */}
                <div data-profile-tabs="" className="group/carril relative sticky top-16 z-20 -mx-4 border-b border-[#e3e9ef] bg-white sm:mx-0 [.ccr-native-app_&]:top-0 lg:static">
                  <FlechasDeCarril carril={carrilPestanasRef} />
                  <div
                    role="tablist"
                    aria-label={locale === "en" ? "Profile sections" : "Secciones del perfil"}
                    ref={carrilPestanasRef}
                    style={{ maskImage: mascaraPestanas, WebkitMaskImage: mascaraPestanas }}
                    data-ccr-degradado={mascaraPestanas ? "" : undefined}
                    className="ccr-carril scrollbar-none flex overflow-x-auto scroll-smooth"
                  >
                    {TABS.map(tab => (
                      <button
                        key={tab.id}
                        role="tab"
                        aria-selected={tabEfectiva === tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                          "relative min-h-12 shrink-0 px-4 py-3.5 text-[15px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#009FD9]",
                          tabEfectiva === tab.id ? "text-[#162543]" : "text-[#526277] hover:text-[#162543]",
                        )}
                      >
                        {tab.label}
                        {tabEfectiva === tab.id && (
                          <span aria-hidden className="absolute inset-x-4 bottom-0 h-[3px] rounded-full bg-[#009FD9]" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tab content */}
                <div className="pt-7 sm:pt-8">

                  {/* ── TAB: Servicios ── */}
                  {montada("servicios") && <div hidden={tabEfectiva !== "servicios"}>{(() => {
                    // Text-only service cards: ONE card per service CATEGORY (the pro's professions),
                    // with its description, price and request action. Images belong to casos/photos.
                    const rawProfs = (professional.professions && professional.professions.length > 0)
                      ? professional.professions
                      : (professional.categoryId ? [professional.categoryId] : []);
                    const byCat = new Map<string, typeof services>();
                    for (const s of services) {
                      const cat = (s as { category?: string }).category || rawProfs[0] || "otro";
                      const arr = byCat.get(cat) ?? []; arr.push(s); byCat.set(cat, arr);
                    }
                    const profs = rawProfs.filter((c) => byCat.has(c));
                    // Cards = active service categories only; de-duplicated, profile order first.
                    const cats = [...profs, ...[...byCat.keys()].filter((c) => !profs.includes(c))]
                      .filter((c, i, a) => a.indexOf(c) === i);
                    return (
                      <div>
                        <h2 className={cn(BIZ.h2, "mb-5")}>{t("servicesOffered")}</h2>
                        {cats.length === 0 ? (
                          <FichaVacio icono="servicios" titulo={t("noServices")} />
                        ) : (
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            {cats.map((cat) => {
                              const items = byCat.get(cat) ?? [];
                              // ONE clean summary per service: its description + price (the model is
                              // services-only). No icon overlay on the photo; the action is a single
                              // "Solicitar servicio" that enters the existing request flow.
                              const rep = items.find((s) => s.description) ?? items.find((s) => s.price) ?? items[0];
                              const priced = items.find((s) => s.priceAmount || s.price || (s as { priceType?: string }).priceType === "a_convenir");
                              const priceLabel = priced
                                ? formatServicePrice(priced.priceAmount, priced.priceType, locale)
                                  ?? (priced.price ? addTaxIncludedToPriceLabel(priced.price.replaceAll("/hora", locale === "en" ? " /hour" : " /hora").replaceAll("Precio a consultar", t("priceConsult")).replaceAll("Consultar precio", t("priceConsult"))) : t("priceConsult"))
                                : t("priceConsult");
                              const title = getCategoryLabel(cat, locale);
                              const description = rep?.description?.trim() ?? "";
                              const serviceImageUrl = typeof (rep as { imageUrl?: unknown } | undefined)?.imageUrl === "string"
                                ? ((rep as { imageUrl: string }).imageUrl).trim()
                                : "";
                              const credential = rep as {
                                professionalCredentialLabel?: string;
                                professionalCredentialNumber?: string;
                                professionalCredentialIssuer?: string;
                              } | undefined;
                              const credentialNumber = credential?.professionalCredentialNumber?.trim();
                              const credentialLabel = credential?.professionalCredentialLabel?.trim() || (locale === "en" ? "Professional credential" : "Credencial profesional");
                              const credentialIssuer = credential?.professionalCredentialIssuer?.trim();
                              const hasFullDescription = description.length > 150;
                              const priceParts = splitPricingLabel(priceLabel);
                              return (
                                <article key={cat} className={cn(BIZ.card, "flex flex-col overflow-hidden transition-colors hover:border-[#bdd7e5]")}>
                                  {serviceImageUrl && (
                                    <ImagePreviewDialog
                                      src={serviceImageUrl}
                                      alt={title}
                                      openLabel={locale === "en" ? `View image for ${title}` : `Ver imagen de ${title}`}
                                      closeLabel={locale === "en" ? "Close" : "Cerrar"}
                                      className="block w-full"
                                      imageClassName="sm:max-w-[900px]"
                                    >
                                      <span className="flex aspect-[16/9] w-full items-center justify-center overflow-hidden border-b border-[#e5e7eb] bg-[#eef2f6]">
                                        <ProgressiveImage src={cldLarge(serviceImageUrl, 900)} alt={title} fit="cover" wrapperClassName="h-full w-full" />
                                      </span>
                                    </ImagePreviewDialog>
                                  )}
                                  <div className="flex flex-1 flex-col p-4 sm:p-5">
                                    {/* El nombre del servicio se lleva el renglón entero y
                                        el precio va debajo, en una sola línea. Compartiendo
                                        fila, «Desarrollo de apps móviles» se partía en dos
                                        mientras el precio se apilaba en tres a la derecha:
                                        dos columnas peleando por el mismo ancho. */}
                                    <h3 className="min-w-0 text-base font-bold leading-snug text-[#162543] [overflow-wrap:anywhere]">{title}</h3>
                                    <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 leading-tight">
                                      <span className="text-sm font-bold text-[#009FD9]">{priceParts.amount}</span>
                                      {priceParts.unit && <span className="text-[11px] font-semibold text-[#6b7280]">{priceParts.unit}</span>}
                                      {priceParts.taxSuffix && <span className="text-[10px] font-semibold tracking-wide text-[#68778d]">{priceParts.taxSuffix}</span>}
                                    </p>
                                    <div className="mt-2.5">
                                      {description ? (
                                        <>
                                        <p className="line-clamp-2 text-sm leading-relaxed text-[#526277] [overflow-wrap:anywhere]">{description}</p>
                                          <button
                                            type="button"
                                            onClick={() => hasFullDescription && setServiceDescriptionOpen({ title, description })}
                                            aria-hidden={!hasFullDescription}
                                            tabIndex={hasFullDescription ? 0 : -1}
                                            className={cn(
                                              "mt-1 text-left text-xs font-semibold text-[#009FD9] transition-colors hover:text-[#0089bb]",
                                              !hasFullDescription && "invisible pointer-events-none"
                                            )}
                                          >
                                            {t("readFullDescription")}
                                          </button>
                                        </>
                                      ) : (
                                        <>
                                          <p className="text-sm leading-relaxed text-[#68778d]">{t("askForDetails")}</p>
                                        </>
                                      )}
                                    </div>
                                    {credentialNumber && (
                                    <div className="mt-3 text-sm">
                                        <p className="flex items-start gap-2 border-t border-[#eef2f6] pt-3 text-xs font-semibold leading-snug text-[#526277]">
                                          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#009FD9]" />
                                          <span className="min-w-0">
                                            <span className="font-bold text-[#162543]">{credentialLabel}:</span>{" "}
                                            <span>{credentialNumber}</span>
                                            {credentialIssuer && <span className="text-[#6b7280]"> · {credentialIssuer}</span>}
                                          </span>
                                        </p>
                                    </div>
                                    )}
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}</div>}

                  {/* "Disponibilidad" is NOT a content tab — the contact card already
                      shows the schedule (3-day strip + booking/contact), so a separate
                      section here would only duplicate it. */}

                  {/* ── TAB: Casos de éxito (grouped per profession/service) ── */}
                  {montada("promociones") && <div hidden={tabEfectiva !== "promociones"}>{(
                    <section className="space-y-5">
                      <div>
                        <h2 className={BIZ.h2}>
                          {locale === "en" ? "Promotions" : "Promociones"}
                        </h2>
                      </div>
                      {/* Una oferta se compra con los ojos: la foto manda, el
                          descuento va sobre ella y el precio se lee grande. La
                          fila con miniatura de 72 px las hacía todas iguales. */}
                      <div className="grid gap-4 sm:grid-cols-2">
                        {publicOffers.map((offer) => {
                          const cover = offer.image_urls?.[0];
                          const descuento = offerDiscountPercent(offer);
                          const antes = formatOfferBeforePrice(offer, locale === "en" ? "en" : "es");
                          return (
                            <Link
                              key={offer.id}
                              href={`${rutaPromocion(offer)}?from=${encodeURIComponent(`/profesionales/${routeSlug}?tab=promociones`)}`}
                              className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white transition-colors hover:border-[#bfe3f5]"
                            >
                              <span className="relative block aspect-[16/10] w-full overflow-hidden bg-[#eef2f6]">
                                {cover
                                  ? <ProgressiveImage src={cldLarge(cover, 640)} alt={offer.title} fit="cover" wrapperClassName="h-full w-full" />
                                  : <span className="grid h-full w-full place-items-center"><BadgePercent className="h-8 w-8 text-[#9fc9dd]" /></span>}
                                {descuento && (
                                  <span className="absolute left-3 top-3 rounded-md bg-[#009fd9] px-2.5 py-1 text-[12px] font-extrabold leading-4 text-white shadow-sm">-{descuento}%</span>
                                )}
                              </span>
                              <span className="flex min-w-0 flex-1 flex-col gap-1 p-4">
                                <span className="line-clamp-2 text-[15px] font-extrabold leading-5 text-[#162543]">{offer.title}</span>
                                <span className="flex flex-wrap items-baseline gap-2">
                                  <span className="text-[17px] font-extrabold leading-6 text-[#007fae]">{formatOfferPrice(offer)}</span>
                                  {antes && <span className="text-[13px] font-semibold text-[#8794a7] line-through">{antes}</span>}
                                </span>
                                {offer.service_label && (
                                  <span className="mt-auto truncate pt-1 text-[13px] font-semibold leading-5 text-[#008fc3]">{offer.service_label}</span>
                                )}
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    </section>
                  )}</div>}

                  {montada("empleos") && <div hidden={tabEfectiva !== "empleos"}>{(
                    <section className="space-y-5">
                      <div>
                        <h2 className={BIZ.h2}>
                          {locale === "en" ? "Jobs" : "Empleos"}
                        </h2>
                      </div>
                      {/* Cada vacante en su tarjeta: el salario, que es lo primero
                          que se mira, en grande, y la modalidad y la zona como
                          etiquetas. En una lista corrida se leían todas iguales. */}
                      <div className="grid gap-3">
                        {publicJobs.map((job) => (
                          <Link
                            key={job.id}
                            href={`${rutaEmpleo(job)}?from=${encodeURIComponent(`/profesionales/${routeSlug}?tab=empleos`)}`}
                            className="group flex min-w-0 items-center gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-4 transition-colors hover:border-[#bfe3f5] hover:bg-[#f8fcfe]"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block text-[15px] font-extrabold leading-5 text-[#162543]">
                                {job.title}
                              </span>
                              <span className="mt-1.5 block text-[15px] font-extrabold leading-5 text-[#007fae]">
                                {formatJobSalary(job)}
                              </span>
                              <span className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                                <span className="rounded-md bg-[#eef3f8] px-2 py-0.5 text-[12px] font-bold leading-5 text-[#52627a]">{WORKPLACE_TYPES[job.workplace_type]}</span>
                                {job.location_label && (
                                  <span className="min-w-0 truncate rounded-md bg-[#eef3f8] px-2 py-0.5 text-[12px] font-bold leading-5 text-[#52627a]">{job.location_label}</span>
                                )}
                              </span>
                            </span>
                            <ChevronRight className="h-5 w-5 shrink-0 text-[#9aa8ba]" />
                          </Link>
                        ))}
                      </div>
                    </section>
                  )}</div>}

                  {montada("casos") && <div hidden={tabEfectiva !== "casos"}>{(
                    <div className="flex flex-col gap-6">
                      <h2 className={BIZ.h2}>{t("tabs.casos")}</h2>
                      {hasCasos ? (
                        // Client-facing showcase: profession filter + a polished case-card grid.
                        <CaseShowcase cases={caseList} professions={profsOrder} initialCaseId={searchParamFromUrl("case")} serviceBuscado={activeCategory ?? null} />
                      ) : (
                        <FichaVacio icono="casos" titulo={t("noCasos")} />
                      )}
                    </div>
                  )}</div>}

                  {/* ── TAB: Currículum (texto, sin imágenes) ── */}
                  {montada("certificaciones") && <div hidden={tabEfectiva !== "certificaciones"}>{hasCerts && (
                    <CvProfileDetails
                      professionalId={professional.id}
                      slug={professional.slug ?? slug}
                      hasFile={professional.hasCvFile}
                      value={cvProfile}
                      english={locale === "en"}
                      title={<h2 className={BIZ.h2}>{t("tabs.certificaciones")}</h2>}
                      legacyEducation={certificationsList.map(c => ({ title: c.name ?? "", organization: c.institution ?? "", period: c.year ?? "", description: "" }))}
                    />
                  )}</div>}

                  {/* ── TAB: Reseñas ── */}
                  {montada("resenas") && <div hidden={tabEfectiva !== "resenas"}>{(
                    <div>
                      <ReviewSection
                        professionalId={professional.id}
                        professionalName={displayName.primaryDesktop}
                        reviewCount={professional.reviewCount}
                        ratingAvg={professional.ratingAvg}
                        reviews={professional.reviews}
                        isAuthenticated={isAuthenticated}
                        onReviewSubmitted={reloadProfessional}
                      />
                    </div>
                  )}</div>}

                  {/* ── TAB: Sobre mí ── */}
                  {montada("sobre") && <div hidden={tabEfectiva !== "sobre"}>{(() => {
                    // Facts in display order — each = brand-tint icon + uppercase label + value
                    // + an optional caption, laid out in a hairline-divided grid (owner mockup).
                    type Fact = { key: string; icon: ReactNode; label: string; value: ReactNode; caption?: ReactNode };
                    const facts: Fact[] = [];
                    const profileCategoryIds = (professional.professions && professional.professions.length > 0)
                      ? professional.professions
                      : (professional.categoryId ? [professional.categoryId] : []);
                    const offersVideoConsult = !!professional.videoconsulta && anyVideoConsultCategory(profileCategoryIds);
                    if (professional.languages && professional.languages.length > 0) facts.push({
                      key: "lang", icon: <Languages className="h-5 w-5" />, label: t("languages"),
                      value: professional.languages.map((l) => languageLabel(l, locale)).join(" · "),
                    });
                    if (professional.insuranceNetworks && professional.insuranceNetworks.length > 0) facts.push({
                      key: "ins", icon: <Shield className="h-5 w-5" />, label: t("insurers"),
                      value: professional.insuranceNetworks.map((id) => insurerLabel(id)).join(" · "),
                    });
                    const dondeAtiende = serviceModalities({
                      workplaces: professional.workplaces as CoverageArea[] | undefined,
                      fallbackLocation: locationText,
                      video: offersVideoConsult,
                      videoCountry: !!professional.coverage?.country,
                      english: locale === "en",
                    });
                    if (dondeAtiende) facts.unshift({
                      key: "service-location", icon: <MapPin className="h-5 w-5" />,
                      label: t("whereServes"), value: dondeAtiende,
                    });
                    return (
                      <div className="flex flex-col gap-6">
                        {/* El título va siempre: sin descripción, los datos quedaban
                            sueltos, sin nada que dijera de qué sección eran. */}
                        {!professional.bio && <h2 className={cn(BIZ.h2, "-mb-2")}>{t("tabs.sobre")}</h2>}
                        {professional.bio && (
                          <section>
                            <h2 className={BIZ.h2}>{t("tabs.sobre")}</h2>
                            <p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-[#3f4c63] [overflow-wrap:anywhere]">
                              {professional.bio}
                            </p>
                          </section>
                        )}
                        {facts.length > 0 && (
                          <section className={professional.bio ? "border-t border-[#eef2f6]" : ""}>
                            <div className="divide-y divide-[#eef2f6]">
                              {facts.map((f) => (
                                <div key={f.key} className="flex items-start gap-3.5 py-4">
                                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center text-[#009FD9]">{f.icon}</span>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#68778d]">{f.label}</p>
                                    <div className="mt-1 text-[15px] font-semibold text-[#162543] [overflow-wrap:anywhere]">{f.value}</div>
                                    {f.caption && <div className="mt-1 text-xs leading-relaxed text-[#6b7280] [overflow-wrap:anywhere]">{f.caption}</div>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </section>
                        )}
                      </div>
                    );
                  })()}</div>}

                </div>
              </div>
            </div>
            </div>

            {/* ── COLUMNA DERECHA (solo computadora): contacto siempre a la vista ── */}
            {/* La tarjeta de contacto (modelo Yelp): con su título, pegada al
                bajar, con sombra suave para que se lea por encima de la página. */}
            <aside aria-labelledby="perfil-contacto-titulo" className="order-2 hidden w-[360px] shrink-0 lg:block">
              <div className={cn(BIZ.card, "sticky top-24 p-6 shadow-[0_10px_30px_-18px_rgba(22,37,67,0.35)]")}>
                <h2 id="perfil-contacto-titulo" className="mb-3 text-[17px] font-extrabold leading-6 text-[#162543]">{t("biz.contactCardTitle")}</h2>
                {bloqueContacto(false)}
              </div>
            </aside>

          </div>
        </div>
      </main>

      {serviceDescriptionOpen && (
        <Modal
          title={serviceDescriptionOpen.title}
          subtitle={t("description")}
          open={!!serviceDescriptionOpen}
          onClose={() => setServiceDescriptionOpen(null)}
          closeLabel={t("close")}
          // Ancha como la de editar: con descripciones de hasta 2000
          // caracteres, a 512 px quedaba una columna larga y angosta.
          size="lg"
        >
          <p className="whitespace-pre-line text-[15px] leading-7 text-[#374151] [overflow-wrap:anywhere]">
            {serviceDescriptionOpen.description}
          </p>
        </Modal>
      )}

      {/* La hoja del «...» de la barra del teléfono: el MISMO componente, las
          mismas opciones y el mismo orden que en Empleos, Promociones y
          Proyectos. El botón que la abre lo dibuja la barra de arriba. */}
      <MenuFicha
        controlado={{ abierto: menuFichaAbierto, onCambio: setMenuFichaAbierto }}
        opciones={opcionesDeLaFicha}
      />

      {bloqueando && (
        <BloquearUsuarioModal nombre={professional.businessName?.trim() || proDisplayName(professional.fullName)} profileId={professional.profileId} onClose={() => setBloqueando(false)} onBloqueado={() => setBloqueado(true)} />
      )}
      {reportOpen && (
        <ReportProfileModal
          professionalName={displayName.primaryDesktop}
          professionalSlug={slug}
          bloqueo={isOwn ? undefined : { profileId: professional.profileId, onBloqueado: () => setBloqueado(true) }}
          onClose={() => setReportOpen(false)}
        />
      )}

      {/* Room for the pinned action bar on phones, so the footer stays reachable. */}
      {avisoCompartir}
      {process.env.NODE_ENV === "development" && isOwn && <div className="mx-auto w-full max-w-6xl px-4"><PromotionHistory key={professional.id} contentType="profile" contentId={professional.id}/></div>}
      {ofrecerProyecto && !isOwn && (
        <div className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+88px)] z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-3 shadow-lg lg:bottom-6">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[#162543]">{t("noRespondioTitulo")}</p>
            <p className="text-xs text-[#5b6b82]">{t("noRespondioTexto")}</p>
          </div>
          <Link
            href={`/publicar-solicitud${professional.professions?.[0] ? `?categoria=${encodeURIComponent(professional.professions[0])}` : ""}`}
            className="shrink-0 rounded-xl bg-[#009FD9] px-3 py-2 text-xs font-bold text-white"
          >
            {t("noRespondioBoton")}
          </Link>
          <button type="button" aria-label={t("cerrar")} onClick={() => setOfrecerProyecto(false)} className="shrink-0 p-1 text-[#68778d]">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {/* Aquí vivía una SEGUNDA franja de contacto —«Disponibilidad · WhatsApp
          · Llamar»— con su propio alto y su propio relleno, que solo salía si
          alguien llegaba por un enlace viejo a ?tab=disponibilidad: una pestaña
          que ya no existe, y una agenda que el app ya no reserva. La ficha
          contacta por la misma franja que el resto de las secciones. */}
      <LandingFooter />
    </div>
  );
}
