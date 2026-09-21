"use client";

import { FichaVacio } from "@/components/professionals/ficha-vacio";
import { enlacePerfil } from "@/lib/profile-url";
import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useParams, useSearchParams } from "next/navigation";
import {
  MapPin, Shield, ArrowLeft, Star, Briefcase, Banknote, BadgeCheck, Languages,
  Flag, Award, SearchX, Globe, BadgePercent, Users, Share2, Link2, ChevronRight, Bookmark,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { VerifiedSeal } from "@/components/ui/verified-seal";
import { InstagramIcon, FacebookIcon, TikTokIcon, LinkedInIcon } from "@/components/icons/social-icons";
import { buildSocialUrl, buildWebsiteUrl } from "@/lib/social";
import { Link, useRouter } from "@/i18n/navigation";
import { Navbar } from "@/components/layout/navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ImagePreviewDialog } from "@/components/ui/image-preview-dialog";
import { getInitials, proDisplayName, cn } from "@/lib/utils";
import { RecordRecentVisit } from "@/components/mobile/record-recent-visit";
import { anyVideoConsultCategory, getCategoryLabel } from "@/lib/data/categories";
import { casoProfession, countCases } from "@/lib/services";
import { addTaxIncludedToPriceLabel, formatServicePrice, primaryPricingLabel, splitPricingLabel } from "@/lib/pricing";
import { languageLabel } from "@/lib/data/languages";
import { insurerLabel } from "@/lib/data/insurers";
import { getCantonById, getProvinceById } from "@/lib/data/cr-geography";
import { ReviewSection } from "@/components/professionals/review-section";
import { CaseShowcase } from "@/components/professionals/case-showcase";
import { BrandIconBadge } from "@/components/ui/brand-icon-badge";
import { ReportProfileModal } from "@/components/professionals/report-profile-modal";
import { createClient } from "@/lib/supabase/client";
import { getDashboardCache, setDashboardCache } from "@/lib/dashboard-prefetch-cache";
import { ProfessionalSchedule, type ScheduleSlot } from "@/components/professionals/professional-schedule";
import { DirectChatLauncher } from "@/components/professionals/direct-chat-launcher";
import { ClientRegistrationModal } from "@/components/auth/client-registration-modal";
import { SelfActionModal, SELF_MSG } from "@/components/professionals/self-action-modal";
import { SaveButton, useGuardarProfesional, type SavedPro } from "@/components/professionals/save-button";
import { MenuFicha } from "@/components/ui/menu-ficha";
import { BotonCompartir, CaraCompartir, useCompartir } from "@/components/ui/boton-compartir";
import type { ProfessionalDetail } from "@/lib/queries/professionals";
import { getProfessionalDisplayName } from "@/lib/display-name";
import { trackMetaEvent } from "@/lib/analytics/meta-pixel";
import { trackInteraction } from "@/lib/analytics/interaction-events";
import { cldLarge, cldThumb } from "@/lib/cloudinary";
import { formatOfferBeforePrice, formatOfferPrice, offerDiscountPercent, type ProfessionalOffer } from "@/lib/offers";
import { formatJobSalary, WORKPLACE_TYPES, type JobPost } from "@/lib/jobs";
import { EMPLEOS_VISIBLE } from "@/lib/feature-flags";
import { PerfilSkeleton } from "@/components/ui/section-skeletons";
import { ProgressiveImage } from "@/components/ui/progressive-image";
import { useArrastreHorizontal } from "@/hooks/use-arrastre-horizontal";

// ─── WhatsApp icon ────────────────────────────────────────────────────────────
// ─── Sub-rating row ───────────────────────────────────────────────────────────
// ─── Tab types ────────────────────────────────────────────────────────────────
type Tab = "disponibilidad" | "servicios" | "ofertas" | "empleos" | "casos" | "certificaciones" | "resenas" | "sobre";

function searchParamFromUrl(key: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(key);
}
function safeProfileReturnHref(value: string | null): string {
  if (!value) return "/buscar";
  let href = value;
  try {
    href = decodeURIComponent(value);
  } catch {
    href = value;
  }
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\")) return "/buscar";
  const path = href.split(/[?#]/u)[0]?.replace(/^\/(?:es|en)(?=\/|$)/u, "") || "/";
  const allowed = path === "/"
    || path === "/buscar"
    || path === "/ofertas"
    || path.startsWith("/ofertas/")
    || path === "/empleos"
    || path.startsWith("/empleos/")
    || path.startsWith("/dashboard/cliente")
    || path.startsWith("/dashboard/profesional")
    || path === "/mensajes";
  // The i18n <Link> re-adds the locale: hand back a bare path even when the
  // sender included one, so the return never becomes /es/es/... .
  return allowed ? href.replace(/^\/(?:es|en)(?=\/|$)/u, "") || "/" : "/buscar";
}

function profileReturnLabel(href: string, locale: string) {
  const path = href.split(/[?#]/u)[0]?.replace(/^\/(?:es|en)(?=\/|$)/u, "") || "/";
  const params = new URLSearchParams(href.includes("?") ? href.split("?")[1]?.split("#")[0] : "");
  if (path.startsWith("/ofertas")) return locale === "en" ? "Back to promotions" : "Volver a promociones";
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

function initialProfileReturnHref() {
  const explicit = searchParamFromUrl("from");
  if (explicit) return safeProfileReturnHref(explicit);
  if (typeof document !== "undefined" && document.referrer) {
    try {
      const referrer = new URL(document.referrer);
      if (referrer.origin === window.location.origin && !referrer.pathname.includes("/profesionales/")) {
        return safeProfileReturnHref(`${referrer.pathname}${referrer.search}${referrer.hash}`);
      }
    } catch {
      return "/buscar";
    }
  }
  return "/buscar";
}

// ─── Main page ────────────────────────────────────────────────────────────────
type ProfilePageData = {
  pro: ProfessionalDetail;
  slots: ScheduleSlot[];
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
export default function ProfilePage({ fichaInicial }: { fichaInicial?: ProfessionalDetail | null }) {
  const t = useTranslations("profile");
  const tMenu = useTranslations("menuFicha");
  const locale = useLocale();
  const catLabel = (id?: string | null) => id ? getCategoryLabel(id, locale) : "";
  const routeParams = useParams();
  const routeSlugParam = routeParams?.slug;
  const routeSlug = Array.isArray(routeSlugParam) ? routeSlugParam[0] : routeSlugParam;
  const [professional, setProfessional] = useState<ProfessionalDetail | null>(fichaInicial ?? null);
  const [profileSlots, setProfileSlots] = useState<ScheduleSlot[]>([]);
  const [publicOffers, setPublicOffers] = useState<ProfessionalOffer[]>([]);
  const [publicJobs, setPublicJobs] = useState<JobPost[]>([]);
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
    const value = searchParams.get("tab");
    return (["disponibilidad", "servicios", "ofertas", "empleos", "casos", "certificaciones", "resenas", "sobre"] as const).includes(value as Tab)
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
  const setActiveTab = setChosenTab;
  const previousActiveTabRef = useRef<Tab | null>(null);
  // En computadora las pestañas se arrastran con el mouse (ver el hook).
  const carrilPestanasRef = useRef<HTMLDivElement | null>(null);
  useArrastreHorizontal(carrilPestanasRef);
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
  const [profileReturnHref, setProfileReturnHref] = useState(() => {
    const explicit = searchParams.get("from");
    return explicit ? safeProfileReturnHref(explicit) : "/buscar";
  });
  useEffect(() => {
    setProfileReturnHref(initialProfileReturnHref());
  }, []);
  const [navbarOwnsHeader, setNavbarOwnsHeader] = useState(false);
  // Deep-link support: /profesionales/[slug]?tab=casos opens that tab.
  // Preview mode (?preview=1): a pro opened "Ver cómo me ven los clientes" from
  // their panel → show a clear "Volver a mi panel" bar so they never get stuck.
  const [previewMode] = useState(() => searchParamFromUrl("preview") === "1");
  // The profession the client searched/filtered by (?categoria=) — passed to the
  // booking modal so, for a multi-specialty pro, that service is pre-selected and we
  // know up front whether it's a health service (DOB) without re-asking.
  const [activeCategory] = useState<string | undefined>(() => searchParamFromUrl("categoria") ?? undefined);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewerResuelto, setViewerResuelto] = useState(false);
  // Quién visita se pregunta de una vez, sin esperar a la ficha ni a los
  // horarios: de eso depende que las acciones de la ficha propia queden
  // bloqueadas, y antes llegaba al final de una cadena de tres peticiones.
  useEffect(() => {
    let vivo = true;
    void createClient().auth.getUser().then(({ data }) => {
      if (!vivo) return;
      setViewerId(data.user?.id ?? null);
      setIsAuthenticated(!!data.user);
      setViewerResuelto(true);
    });
    return () => { vivo = false; };
  }, []);
  const [slug, setSlug] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [menuFichaAbierto, setMenuFichaAbierto] = useState(false);
  // Aviso de "enlace copiado" del botón Compartir. Vive aquí, con el resto de
  // los hooks: debajo de los `return` de carga React contaba un hook de más.
  const { compartir: compartirEnlace, avisoNodo: avisoCompartir } = useCompartir();
  const nombreEnBarra = professional
    ? getProfessionalDisplayName(professional.fullName, professional.businessName).primaryMobile
    : "";
  const [nombreFueraDeVista, setNombreFueraDeVista] = useState(false);
  // Arriba dice a dónde te devuelve la flecha (convención de iOS); al desplazar,
  // cuando el nombre ya no está a la vista, la barra pasa a decir de quién es el
  // perfil.
  const tituloBarra =
    nombreFueraDeVista && nombreEnBarra ? nombreEnBarra : profileReturnLabel(profileReturnHref, locale);
  useEffect(() => {
    if (previewMode) return;
    const global = window as unknown as {
      __ccrSectionHeader?: string | null;
      __ccrSectionActive?: boolean;
      __ccrSectionShare?: boolean;
      __ccrSectionMenu?: boolean;
    };
    global.__ccrSectionHeader = tituloBarra;
    global.__ccrSectionActive = true;
    global.__ccrSectionShare = false;
    // El «...» de la barra, igual que en Empleos, Promociones y Proyectos:
    // guardar, compartir y reportar en el mismo orden y en la misma hoja.
    global.__ccrSectionMenu = true;
    window.dispatchEvent(new CustomEvent("ccr:section-header", { detail: { title: tituloBarra, menu: true } }));
    return () => {
      global.__ccrSectionHeader = null;
      global.__ccrSectionActive = false;
      global.__ccrSectionShare = false;
      global.__ccrSectionMenu = false;
      setNavbarOwnsHeader(false);
      window.dispatchEvent(new CustomEvent("ccr:section-header", { detail: null }));
    };
  }, [previewMode, tituloBarra]);

  // El nombre de la tarjeta decide qué muestra la barra.
  useEffect(() => {
    if (previewMode || !professional) return;
    const nodo = document.querySelector('[data-testid="professional-profile-name"]');
    if (!nodo) return;
    const observador = new IntersectionObserver(
      ([entrada]) => setNombreFueraDeVista(!entrada.isIntersecting),
      { threshold: 0 },
    );
    observador.observe(nodo);
    return () => observador.disconnect();
  }, [previewMode, professional]);

  const volverRef = useRef<(() => void) | null>(null);
  const compartirRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const onBack = () => volverRef.current?.();
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
  // Own-profile self-actions are blocked with a friendly modal (buttons stay visible).
  const [selfMsg, setSelfMsg] = useState<string | null>(null);
  // "Solicitar servicio" (per service card) → the SAME existing request flow as the
  // contact card: bookable pros open the booking modal (registration-gated for guests);
  // WhatsApp-only pros open WhatsApp. `bookingCat` carries the card's service as context.
  const [bookingCat, setBookingCat] = useState<string | null>(null);
  const router = useRouter();
  const [bookingReg, setBookingReg] = useState(false);
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
        setProfileSlots(warm.slots);
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
      const [offersResult, jobsResult, availability, authResult] = await Promise.all([
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
        fetch(`/api/public-availability?professionalId=${pro.id}`, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        supabase.auth.getUser(),
      ]);
      const fresh: ProfilePageData = {
        pro,
        slots: Array.isArray(availability?.slots) ? availability.slots : [],
        offers: ((offersResult.data ?? []) as unknown as ProfessionalOffer[]).filter(
          (offer) => !offer.valid_until || offer.valid_until >= today,
        ),
        jobs: ((jobsResult.data ?? []) as unknown as JobPost[]).filter(
          (job) => !job.application_deadline || job.application_deadline >= today,
        ),
      };
      setDashboardCache(cacheKey, fresh);
      setProfessional(fresh.pro);
      setProfileSlots(fresh.slots);
      setPublicOffers(fresh.offers);
      setPublicJobs(fresh.jobs);
      const { data: { user } } = authResult;
      setIsAuthenticated(!!user);
      setViewerId(user?.id ?? null);
      setViewerResuelto(true);
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
    let secondFrame: number | null = null;
    const activateReviews = window.setTimeout(() => {
      setActiveTab("resenas");
      secondFrame = window.requestAnimationFrame(scrollToReviews);
    }, 0);
    const firstFrame = window.requestAnimationFrame(scrollToReviews);
    const fallback = window.setTimeout(scrollToReviews, 250);
    return () => {
      window.clearTimeout(activateReviews);
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
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

  if (proNotFound || !professional) {
    return (
      <div className="min-h-screen flex flex-col bg-[#f4f7fa]">
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
                href="/buscar"
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
  // Count CASES, not photos: 1 caso de éxito with 3 photos must read "1", not "3"
  // (portfolioUrls is the flattened photo list). See countCases().
  const casosCount = countCases(professional.portfolioItems, professional.portfolioUrls);
  const certificationsList = (professional.certifications ?? []).filter((c) => c?.name?.trim());
  const hasCerts = certificationsList.length > 0;
  // Group certifications by profession (legacy untagged → principal profession).
  const principalProfession = professional.professions?.[0] ?? professional.categoryId ?? "";
  const certGroups = (() => {
    const map = new Map<string, typeof certificationsList>();
    for (const c of certificationsList) {
      const key = c.profession || principalProfession || "";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return Array.from(map.entries());
  })();
  // A pro viewing their OWN public profile cannot request a service from themselves.
  const isOwn = !!viewerId && viewerId === professional.profileId;
  // La ficha llega pintada del servidor: hasta que la sesión responde no se sabe
  // si quien mira es el dueño.
  const viewerPendiente = !viewerResuelto;

  // "Ver disponibilidad" routing — keep service cards aligned with the contact card
  // from the first paint. The live schedule panel confirms the exact slots, but if a
  // profile has public availability enabled we should not briefly render the WhatsApp
  // CTA while that confirmation is still loading.
  const canBookService =
    (professional.availabilityPublic ?? true) &&
    (professional.contactPreference ?? "ambas") !== "solo_whatsapp";
  function requestService(cat: string) {
    if (!professional) return;
    if (isOwn) { setSelfMsg(SELF_MSG.request); return; }
    trackMetaEvent("InitiateCheckout", {
      content_type: "professional_service",
      source: "profile_service",
    });
    trackInteraction({
      type: "service_request_started",
      professionalId: professional.id,
      source: "profile_service",
      locale,
      categoryId: cat,
    });
    setBookingCat(cat);
    // La reserva es una página propia: se navega con el servicio elegido.
    if (isAuthenticated) irAReservar(cat);
    else setBookingReg(true);
  }

  function irAReservar(cat?: string | null) {
    if (!professional) return;
    const servicio = cat ?? bookingCat;
    const params = new URLSearchParams();
    if (servicio) params.set("servicio", servicio);
    // Desde el perfil se vuelve al perfil, con el origen que este ya conocía.
    params.set("desde", `/profesionales/${professional.slug}`);
    router.push(`/profesionales/${professional.slug}/reservar?${params.toString()}`);
  }

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

  // Favorites: the SAME system as the /buscar cards. Keyed on `professional.id`
  // (the professionals row id the card also uses), so saving here reflects on the
  // card and vice-versa. `isVerified` is derived exactly like the card. Self-favorite
  // is blocked via the shared SelfActionModal (isOwn) — see SaveButton.
  const savedPro: SavedPro = {
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
  };
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
    ...(publicOffers.length > 0 ? [{ id: "ofertas" as Tab, label: locale === "en" ? "Promotions" : "Promociones" }] : []),
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

  const bloqueContacto = (conAncla: boolean) => (
    <div {...(conAncla ? { id: "perfil-contacto" } : {})} className="mx-auto flex w-full max-w-md flex-col gap-4 lg:max-w-none">
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
        availabilityPublic={professional.availabilityPublic ?? true}
        contactPreference={professional.contactPreference ?? "ambas"}
        slots={profileSlots}
        isOwn={isOwn}
        viewerPendiente={viewerPendiente}
        placeFallback={placeFallback}
        placeAddress={placeAddress}
        businessName={professional.businessName ?? ""}
        // «+N zonas» abre Información, que es donde vive la lista completa con
        // sus direcciones. Antes la ficha la tenía dos veces.
        onVerZonas={() => {
          setActiveTab("sobre");
          requestAnimationFrame(() => document.getElementById("resenas")?.scrollIntoView({ behavior: "smooth", block: "start" }));
        }}
      />
      {/* Las redes van DESPUÉS de los botones de contacto: son para creerle al
          profesional, no para contactarlo, así que no compiten con «Enviar
          mensaje» ni con «Llamar». Solo iconos, centrados. */}
      {redesDelProfesional.length > 0 && (
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
        </div>
      )}

    </div>
  );

  // Reportar no es una forma de contactar: iba pegado a WhatsApp y Llamar en la
  // tarjeta de arriba, donde parecía una tercera opción. Va al pie de
  // «Información», que es la letra chica de la ficha.
  const botonReportar = !isOwn ? (
    <div className="mt-6 flex items-center justify-center border-t border-[#eef2f6] pt-4">
      <button
        type="button"
        onClick={() => setReportOpen(true)}
        className="inline-flex !min-h-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-medium text-[#9aa3ad] transition-colors hover:text-[#6b7280]"
      >
        <Flag className="h-3.5 w-3.5" />
        {t("reportProfile")}
      </button>
    </div>
  ) : null;

  // «disponibilidad» ya no es una pestaña: si llega por un enlace viejo, se cae
  // en la primera que sí existe.
  const primeraPestana = TABS[0]?.id ?? "sobre";
  const tabEfectiva: Tab = activeTab === "disponibilidad" ? primeraPestana : activeTab;
  // Derivado durante el render (no en un efecto): así la pestaña nueva ya está
  // montada en el mismo cuadro en que se elige, sin un cuadro vacío.
  if (!pestanasVisitadas.has(tabEfectiva)) setPestanasVisitadas((previas) => new Set(previas).add(tabEfectiva));
  const montada = (id: string) => id === tabEfectiva || pestanasVisitadas.has(id);

  return (
    <div className="min-h-screen flex flex-col bg-[#f4f7fa]">
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
              // En computadora, un enlace discreto encima del contenido, igual que
              // en una oferta o un empleo: la franja blanca de lado a lado solo
              // para dos palabras empujaba la ficha hacia abajo y competía con la
              // barra del sitio, que ahí está siempre a la vista.
              "lg:mx-0 lg:mb-3 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0",
              // La barra superior toma el título y el «volver» SOLO en el teléfono
              // (ahí es donde dibuja «← Título»). En computadora la barra no lo
              // dibuja, así que ocultar el de la página dejaba la ficha sin ningún
              // «Volver a resultados»: se pintaba en el servidor y desaparecía al
              // montar, que era el parpadeo, y encima se perdía el enlace.
              navbarOwnsHeader && "max-lg:hidden",
            )}>
              <Link
                href={profileReturnHref}
                ref={(node) => { volverRef.current = node ? () => node.click() : null; }}
                className="inline-flex h-10 min-w-0 items-center gap-1.5 text-sm font-semibold text-[#374151] transition-colors hover:text-[#009FD9] lg:rounded-lg lg:px-2 lg:font-extrabold lg:text-[#162543] lg:hover:bg-[#eaf6fc]"
              >
                <ArrowLeft className="h-4 w-4 shrink-0" />
                <span className="truncate">{profileReturnLabel(profileReturnHref, locale)}</span>
              </Link>

            </div>
          )}

          {/* No unverified-identity notice in the client preview: the ABSENCE of the
              "Verificado" badge already communicates the unverified state. (The invite to
              verify lives in the pro's own panel.) */}

          {/* Sin items-start: la columna derecha tiene que estirarse a lo alto de la
              fila para que su tarjeta pueda quedarse pegada al bajar. */}
          <div className="flex flex-col gap-6 lg:flex-row">

            {/* ── COLUMNA IZQUIERDA: identidad y secciones ── */}
            <div className="order-1 flex-1 min-w-0">
            {/* ── CABECERA ── En computadora: foto | nombre, oficio y cifras | acciones.
                Todo lo del centro arranca en la misma línea (antes las cifras
                colgaban debajo de la foto y el borde izquierdo quedaba en zigzag)
                y las dos acciones comparten renglón arriba a la derecha, del
                ancho de su texto. En el teléfono sigue centrado como estaba. */}
            <div className="relative mb-6 rounded-2xl border border-[#e5e7eb] bg-white px-4 pb-4 pt-3.5 shadow-sm sm:grid sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start sm:gap-x-5 sm:p-6 sm:pt-6">
                {/* En el teléfono: foto a la izquierda, y a su lado el nombre y
                    las cifras. Centrado ocupaba tres renglones para decir lo
                    mismo y empujaba los botones de contacto fuera de la
                    pantalla. En computadora sigue siendo la rejilla de
                    foto | nombre y cifras | acciones. */}
                <div className="flex min-w-0 items-center gap-3 text-left sm:contents sm:gap-0">
                  <ImagePreviewDialog
                    src={professional.avatarUrl}
                    alt={professional.fullName}
                    openLabel={locale === "en" ? "View profile photo" : "Ver foto de perfil"}
                    closeLabel={locale === "en" ? "Close" : "Cerrar"}
                    className="sm:col-start-1 sm:row-start-1 sm:row-span-2 sm:self-center"
                  >
                    <Avatar className="h-[72px] w-[72px] shrink-0 sm:h-[88px] sm:w-[88px]">
                      <AvatarImage src={professional.avatarUrl ? cldThumb(professional.avatarUrl, 320) : undefined} loading="eager" alt={professional.fullName} className="object-cover" />
                      <AvatarFallback className="bg-[#EBF5FB] text-xl font-bold text-[#009FD9] sm:text-2xl">{getInitials(professional.fullName)}</AvatarFallback>
                    </Avatar>
                  </ImagePreviewDialog>
                  <div className="w-full min-w-0 sm:col-start-2 sm:row-start-1 sm:w-auto">
                    <div className="min-w-0">
                      <h1 data-testid="professional-profile-name" className="min-w-0 text-[17px] font-bold leading-[1.15] text-[#162543] [overflow-wrap:anywhere] sm:text-2xl sm:leading-tight sm:[overflow-wrap:normal]">
                        {/* El sello va pegado a la ÚLTIMA palabra del nombre en un
                            trozo que no se parte: así el nombre puede ocupar dos
                            renglones si hace falta, pero el sello nunca se queda
                            solo en un renglón nuevo. */}
                        {professional.verificationStatus === "verified" ? (
                          <>
                            {displayName.primaryDesktop.split(" ").slice(0, -1).join(" ")}
                            {displayName.primaryDesktop.includes(" ") ? " " : ""}
                            <span className="whitespace-nowrap">
                              {displayName.primaryDesktop.split(" ").slice(-1)[0]}
                              <VerifiedSeal
                                label={t("identityVerified")}
                                className="mb-[0.08em] ml-1 inline-block h-4 w-4 shrink-0 align-middle text-[#009FD9] sm:h-5 sm:w-5"
                              />
                            </span>
                          </>
                        ) : (
                          displayName.primaryDesktop
                        )}
                      </h1>
                    </div>
                    {/* La ubicación NO va aquí: las zonas de trabajo están en la
                        tarjeta de contacto, completas, y el cantón del perfil
                        repetía una de ellas a medias. */}
                  {/* Prueba social en una línea. Los casos de éxito NO van aquí:
                      tienen su propia pestaña y repetir la cifra gastaba un
                      renglón sin decir nada nuevo. */}
                  {/* Una línea, con las dos cifras juntas: a 40 px en computadora
                      se leían como dos datos sueltos. El ícono de cada una ya
                      marca dónde empieza la siguiente. */}
                  {(professional.reviewCount > 0 || expYears > 0) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[#68778d] sm:mt-3 sm:gap-x-5 sm:text-[13px]">
                      {professional.reviewCount > 0 && (
                        <button type="button" onClick={() => setActiveTab("resenas")} className="inline-flex min-w-0 items-center gap-1.5">
                          <Star className="h-3.5 w-3.5 shrink-0 fill-[#ff9b32] text-[#ff9b32]" />
                          <span className="text-[14px] font-bold text-[#162543] sm:text-[15px]">{professional.ratingAvg.toFixed(1)}</span>
                          <span className="whitespace-nowrap">{t("reviewCountLabel", { count: professional.reviewCount })}</span>
                        </button>
                      )}
                      {expYears > 0 && (
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <Briefcase className="h-3.5 w-3.5 shrink-0 text-[#009FD9]" />
                          <span className="text-[14px] font-bold text-[#162543] sm:text-[15px]">{expYears}</span>
                          <span className="whitespace-nowrap">{t("statYears")}</span>
                        </span>
                      )}
                    </div>
                  )}
                  </div>

                  </div>
                {/* En el teléfono, guardar y compartir viven en el «...» de la
                    barra de arriba, igual que en Empleos, Promociones y
                    Proyectos: son acciones sobre la ficha, no formas de
                    contactar, y dentro de la tarjeta le quitaban sitio a lo que
                    sí contacta. En computadora no hay barra de ficha, así que
                    siguen discretas arriba a la derecha. */}
                {/* En el teléfono, contactar vive AQUÍ: arriba, a la vista, sin
                    pestaña de por medio. En computadora sigue siendo la columna
                    de la derecha, que ya está siempre visible. */}
                <div className="mt-4 border-t border-[#eef2f6] pt-4 lg:hidden">{bloqueContacto(true)}</div>
                <div className="hidden sm:absolute sm:right-3 sm:top-3 sm:flex sm:items-center sm:gap-1">
                  <SaveButton pro={savedPro} isOwn={isOwn} sutil />
                  <BotonCompartir onPress={shareProfile} sutil />
                </div>
            </div>
            <div id="resenas" className="scroll-mt-24 [.ccr-native-app_&]:scroll-mt-0">
              <div className="rounded-2xl border border-[#e5e7eb] bg-white shadow-sm">

                {/* Tab bar — sticks under the header on the phone so any section is one tap away. */}
                <div data-profile-tabs="" className="sticky top-16 z-20 rounded-t-2xl border-b border-[#e5e7eb] bg-white [.ccr-native-app_&]:top-0 lg:static lg:rounded-t-2xl">
                  <div
                    role="tablist"
                    aria-label={locale === "en" ? "Profile sections" : "Secciones del perfil"}
                    ref={carrilPestanasRef}
                    className="ccr-carril scrollbar-none flex overflow-x-auto scroll-smooth"
                  >
                    {TABS.map(tab => (
                      <button
                        key={tab.id}
                        role="tab"
                        aria-selected={tabEfectiva === tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                          "relative shrink-0 px-4 py-4 text-sm font-semibold transition-colors",
                        )}
                        style={{ color: tabEfectiva === tab.id ? "#009FD9" : "#6b7280" }}
                      >
                        {tab.label}
                        {tabEfectiva === tab.id && (
                          <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#009FD9] rounded-full" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tab content */}
                <div className="p-6">

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
                        <h2 className="text-lg font-semibold text-[#162543] mb-1">{t("servicesOffered")}</h2>
                        <p className="text-sm text-[#68778d] mb-5">{t("servicesOfferedSub")}</p>
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
                              const yearsItem = items.find((s) => typeof (s as { years?: number }).years === "number" && ((s as { years?: number }).years ?? 0) > 0);
                              const serviceYears = (yearsItem as { years?: number } | undefined)?.years;
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
                                <article key={cat} className="flex flex-col overflow-hidden rounded-2xl sm:min-h-[280px] border border-[#e5e7eb] bg-white shadow-sm transition-colors hover:border-[#bdd7e5]">
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
                                    <div className="mt-3 space-y-2 text-sm">
                                      <p className="hidden items-center gap-2 text-[#162543]">
                                        <Banknote className="h-4 w-4 shrink-0 text-[#009FD9]" />
                                        <span className="font-bold [overflow-wrap:anywhere]">
                                          {priceParts.amount}
                                          {priceParts.unit && <span className="font-semibold text-[#6b7280]"> {priceParts.unit}</span>}
                                          {priceParts.taxSuffix && <span className="ml-1 text-[10px] font-semibold tracking-wide text-[#68778d]">{priceParts.taxSuffix}</span>}
                                        </span>
                                      </p>
                                      {credentialNumber && (
                                        <p className="flex items-start gap-2 border-t border-[#eef2f6] pt-3 text-xs font-semibold leading-snug text-[#526277]">
                                          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#009FD9]" />
                                          <span className="min-w-0">
                                            <span className="font-bold text-[#162543]">{credentialLabel}:</span>{" "}
                                            <span>{credentialNumber}</span>
                                            {credentialIssuer && <span className="text-[#6b7280]"> · {credentialIssuer}</span>}
                                          </span>
                                        </p>
                                      )}
                                    </div>
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
                  {montada("ofertas") && <div hidden={tabEfectiva !== "ofertas"}>{(
                    <section className="space-y-5">
                      <div>
                        <h2 className="text-lg font-semibold text-[#162543]">
                          {locale === "en" ? "Promotions" : "Promociones"}
                        </h2>
                        <p className="mt-1 text-sm text-[#68778d]">
                          {locale === "en"
                            ? "Active promotions from this professional."
                            : "Promociones activas de este profesional."}
                        </p>
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
                              href={`/ofertas/${offer.id}?from=${encodeURIComponent(`/profesionales/${routeSlug}?tab=ofertas`)}`}
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
                        <h2 className="text-lg font-semibold text-[#162543]">
                          {locale === "en" ? "Jobs" : "Empleos"}
                        </h2>
                        <p className="mt-1 text-sm text-[#68778d]">
                          {locale === "en"
                            ? "Open opportunities published by this professional."
                            : "Oportunidades abiertas publicadas por este profesional."}
                        </p>
                      </div>
                      {/* Cada vacante en su tarjeta: el salario, que es lo primero
                          que se mira, en grande, y la modalidad y la zona como
                          etiquetas. En una lista corrida se leían todas iguales. */}
                      <div className="grid gap-3">
                        {publicJobs.map((job) => (
                          <Link
                            key={job.id}
                            href={`/empleos/${job.id}?from=${encodeURIComponent(`/profesionales/${routeSlug}?tab=empleos`)}`}
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
                      <div>
                        <h2 className="text-lg font-semibold text-[#162543] mb-1">{t("tabs.casos")}</h2>
                        <p className="text-sm text-[#68778d]">{t("casosSubtitle", { name: professional.fullName.split(" ")[0] })}</p>
                      </div>
                      {hasCasos ? (
                        (() => {
                          // NEW per-profession CASE model (sprint 493): each caso has a service title,
                          // recipient, date and up to 3 photos. Reads BOTH shapes — new cases (have
                          // `photos[]`) and legacy photos (`{url}`, grouped by profession into cases).
                          const svcs = professional.services ?? [];
                          const profsOrder = (professional.professions && professional.professions.length > 0)
                            ? professional.professions
                            : (professional.categoryId ? [professional.categoryId] : []);
                          const primaryProf = profsOrder[0] ?? "";
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          const profOf = (it: any) => casoProfession(it, svcs, primaryProf);
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          const raw: any[] = (professional.portfolioItems && professional.portfolioItems.length > 0)
                            ? professional.portfolioItems
                            : (professional.portfolioUrls ?? []).map((url) => ({ url }));
                          type Caso = { id: string; profession: string; title?: string; description?: string; recipient?: string; date?: string; photos: string[] };
                          const caseList: Caso[] = [];
                          const legacyByProf = new Map<string, string[]>();
                          for (const it of raw) {
                            if (Array.isArray(it?.photos) && it.id) {
                              caseList.push({ id: String(it.id), profession: it.profession ?? primaryProf, title: it.title, description: it.description, recipient: it.recipient, date: it.date, photos: it.photos });
                            } else if (it?.url) {
                              const prof = profOf(it) || primaryProf || "";
                              const arr = legacyByProf.get(prof) ?? []; arr.push(it.url); legacyByProf.set(prof, arr);
                            }
                          }
                          for (const [prof, photos] of legacyByProf) {
                            for (let i = 0; i < photos.length; i += 3) caseList.push({ id: `${prof}_${i}`, profession: prof, photos: photos.slice(i, i + 3) });
                          }
                          // Client-facing showcase: profession filter + a polished case-card grid.
                          return <CaseShowcase cases={caseList} professions={profsOrder} initialCaseId={searchParamFromUrl("case")} serviceBuscado={activeCategory ?? null} />;
                        })()
                      ) : (
                        <FichaVacio icono="casos" titulo={t("noCasos")} />
                      )}
                    </div>
                  )}</div>}

                  {/* ── TAB: Formación (texto, sin imágenes) ── */}
                  {montada("certificaciones") && <div hidden={tabEfectiva !== "certificaciones"}>{hasCerts && (
                    <div>
                      <h2 className="text-lg font-semibold text-[#162543] mb-1">{t("tabs.certificaciones")}</h2>
                      <p className="text-sm text-[#68778d] mb-4">{t("certsSubtitle")}</p>
                      <div className="flex flex-col gap-5">
                        {certGroups.map(([prof, certs]) => (
                          <div key={prof || "general"}>
                            {certGroups.length > 1 && prof && (
                              <h3 className="text-xs font-bold uppercase tracking-wide text-[#0089bb] mb-2">{getCategoryLabel(prof, locale)}</h3>
                            )}
                            <div className="flex flex-col gap-2.5">
                              {certs.map((c, i) => (
                                <div key={c.id ?? i} className="flex items-start gap-3 rounded-xl border border-[#e5e7eb] p-3.5">
                                  <div className="flex h-9 w-9 items-center justify-center rounded-full shrink-0 ccr-caja-icono-plana">
                                    <Award className="h-4 w-4 text-[#009FD9]" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-[#162543] break-words">{c.name}</p>
                                    {(c.institution || c.year) && (
                                      <p className="text-xs text-[#52627a] mt-0.5 break-words">
                                        {[c.institution, c.year].filter(Boolean).join(" · ")}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}</div>}

                  {/* ── TAB: Reseñas ── */}
                  {montada("resenas") && <div hidden={tabEfectiva !== "resenas"}>{(
                    <div>
                      <ReviewSection
                        professionalId={professional.id}
                        professionalName={professional.fullName}
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
                    const uniqueWorkplaces = Array.from(
                      new Map(
                        (professional.workplaces ?? [])
                          .map((w) => {
                            const name = String(w.name ?? "").trim();
                            const address = String(w.address ?? "").trim();
                            return [`${name.toLowerCase()}|${address.toLowerCase()}`, { ...w, name, address }] as const;
                          })
                          .filter(([, w]) => w.name || w.address)
                      ).values()
                    );
                    const workplaceAreaLines = Array.from(new Set([
                      ...uniqueWorkplaces
                        .map((w) => {
                          const area = w as typeof w & { provinciaId?: string; cantonId?: string };
                          const cantonName = area.cantonId ? getCantonById(area.cantonId)?.name : "";
                          const provinceName = area.provinciaId ? getProvinceById(area.provinciaId)?.name : "";
                          return [cantonName, provinceName].filter(Boolean).join(", ");
                        })
                        .filter(Boolean),
                      locationText,
                    ].filter(Boolean)));
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
                    if (workplaceAreaLines.length > 0 || offersVideoConsult) facts.push({
                      key: "loc", icon: <MapPin className="h-5 w-5" />,
                      label: workplaceAreaLines.length > 1 || offersVideoConsult ? t("whereServes") : t("location"),
                      value: (
                        <span className="flex flex-col gap-1">
                          {workplaceAreaLines.map((line) => (
                            <span key={line} className="[overflow-wrap:anywhere]">{line}</span>
                          ))}
                          {offersVideoConsult && (
                            <span className="[overflow-wrap:anywhere]">
                              {professional.coverage?.country ? t("videoConsultCountry") : t("videoConsult")}
                            </span>
                          )}
                        </span>
                      ),
                    });
                    return (
                      <div className="flex flex-col gap-6">
                        {professional.bio && (
                          <section>
                            <h2 className="text-lg font-semibold text-[#162543]">{t("tabs.sobre")}</h2>
                            <p className="mt-2 whitespace-pre-line text-[15px] leading-7 text-[#3f4c63] [overflow-wrap:anywhere]">
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
                        {botonReportar}
                      </div>
                    );
                  })()}</div>}

                </div>
              </div>
            </div>
            </div>

            {/* ── COLUMNA DERECHA (solo computadora): contacto siempre a la vista ── */}
            <aside className="order-2 hidden w-[352px] shrink-0 lg:block">
              <div className="sticky top-20 rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
                {bloqueContacto(false)}
              </div>
            </aside>

          </div>
        </div>
      </main>

      {/* "Solicitar servicio" (service cards) — the existing booking flow, registration-gated
          for guests. Carries the card's service as the booking context. */}
      <ClientRegistrationModal
        open={bookingReg}
        onClose={() => setBookingReg(false)}
        onSuccess={() => { setBookingReg(false); irAReservar(); }}
        professionalName={professional.fullName}
      />

      {serviceDescriptionOpen && (
        <Modal
          title={serviceDescriptionOpen.title}
          subtitle={t("description")}
          open={!!serviceDescriptionOpen}
          onClose={() => setServiceDescriptionOpen(null)}
          closeLabel={t("close")}
          size="md"
        >
          <p className="whitespace-pre-line text-[15px] leading-7 text-[#374151] [overflow-wrap:anywhere]">
            {serviceDescriptionOpen.description}
          </p>
        </Modal>
      )}

      {/* La hoja del «...» de la barra: el MISMO componente, las mismas
          opciones y el mismo orden que en Empleos, Promociones y Proyectos.
          El botón que la abre lo dibuja la barra de arriba. */}
      <MenuFicha
        controlado={{ abierto: menuFichaAbierto, onCambio: setMenuFichaAbierto }}
        opciones={[
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
          // Las dos caras pintadas y el CSS elige, como en `BotonCompartir`:
          // Chrome en macOS trae `navigator.share` y el menú decía «Compartir».
          {
            id: "compartir",
            icono: <CaraCompartir dedo={<Share2 className="h-4 w-4" />} raton={<Link2 className="h-4 w-4" />} />,
            texto: <CaraCompartir dedo={tMenu("share")} raton={tMenu("copyLink")} />,
            etiqueta: tMenu("share"),
            onSelect: shareProfile,
          },
          ...(isOwn ? [] : [{ id: "reportar", icono: <Flag className="h-4 w-4" />, texto: tMenu("reportProfile"), peligro: true, onSelect: () => setReportOpen(true) }]),
        ]}
      />

      {reportOpen && (
        <ReportProfileModal
          professionalName={professional.fullName}
          professionalSlug={slug}
          onClose={() => setReportOpen(false)}
        />
      )}

      {/* Room for the pinned action bar on phones, so the footer stays reachable. */}
      <SelfActionModal open={!!selfMsg} onClose={() => setSelfMsg(null)} message={selfMsg ?? ""} />
      {avisoCompartir}
      {/* Aquí vivía una SEGUNDA franja de contacto —«Disponibilidad · WhatsApp
          · Llamar»— con su propio alto y su propio relleno, que solo salía si
          alguien llegaba por un enlace viejo a ?tab=disponibilidad: una pestaña
          que ya no existe, y una agenda que el app ya no reserva. La ficha
          contacta por la misma franja que el resto de las secciones. */}
      <LandingFooter />
    </div>
  );
}
