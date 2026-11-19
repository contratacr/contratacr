"use client";
import { GuideVisualWalkthrough, hasVisualGuide } from "@/components/dashboard/guide-visual-walkthrough";
import {useLocalProAccess} from "@/components/pro/use-local-pro-access";
import {BusinessDashboardEntry} from "@/components/directory/business-dashboard-entry";
import { PanelListSkeleton } from "@/components/ui/content-loading";
import {backPro,navigatePro,pushProPath,replaceProPath,setProNavigationAccount} from "@/lib/pro/navigation";
import {ProWorkspace} from "@/components/pro/pro-workspace";
import {ProManagementShell} from "@/components/pro/management-shell";
import {ProTools} from "@/components/pro/simple-workspace";
import {SalesWorkspace} from "@/components/pro/sales-workspace";
import {AppointmentRequestsWorkspace} from "@/components/pro/appointment-requests-workspace";
import { ProfileIdentityName, profileIdentityAvatarClass } from "@/components/professionals/profile-identity-name";

import { AvatarFileInput } from "@/components/ui/avatar-file-input";

import { rutaInternaSegura } from "@/lib/navigation/ruta-interna";
import { useAppDialog } from "@/hooks/use-app-dialog";
import { idiomaDe, prefijoDeIdioma } from "@/lib/prefijo-de-idioma";
import { suspensionNoticeCopy } from "@/lib/pro/suspension-notice";
import { irAlInicio, iniciarSeccionArriba } from "@/lib/ir-al-inicio";
import { enlacePerfil } from "@/lib/profile-url";
import { EMPLEOS_VISIBLE } from "@/lib/feature-flags";

import { useEffect, useState, useCallback, useMemo, useRef, useLayoutEffect, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { useHairlineOnScroll } from "@/components/util/use-hairline-on-scroll";
import { isSigningOut, signOutToHome } from "@/lib/auth/sign-out";
import {useProSearchParams} from "@/components/pro/use-pro-search-params";
import {
  User, Award, Wrench,
  ShieldCheck, Bell, Handshake, ClipboardList, Bookmark, Settings, Headset, ArrowLeft, ArrowRight, ChevronDown, ChevronRight, Sparkles, AlertCircle, MessageSquareMore, Home, LogOut, Users, CheckCircle2, FileText, Search, Camera, Eye, Trash2, Loader2,
  BriefcaseBusiness, Star, ReceiptText, ExternalLink, Share2, BookOpen, ChartNoAxesColumn, FileUser, Mail,
  } from "lucide-react";
import { CERRAR_EDITOR_CV, CvBuilder } from "@/components/dashboard/cv-builder";
import { StatisticsPanel } from "@/components/dashboard/statistics/statistics-panel";
import { QuotesSection, cargarCotizaciones } from "@/components/quotes/quotes-section";
import { SectionBoundary } from "@/components/dashboard/section-boundary";
import { SectionHeadline } from "@/components/dashboard/section-headline";
import { Herramientas } from "@/components/dashboard/herramientas";
import { Navbar } from "@/components/layout/navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VerificationInfo } from "@/components/ui/verification-info";
import { ShareKit } from "@/components/dashboard/pro/share-kit";
import { getCategoryLabel } from "@/lib/data/categories";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProfileEditor } from "@/components/dashboard/pro/profile-editor";
import { ProfileCompletion, computeCompletion } from "@/components/dashboard/pro/profile-completion";
import { PhotoGallery } from "@/components/dashboard/pro/photo-gallery";
import { ServiceRequestInvitations } from "@/components/dashboard/pro/service-request-invitations";
import { ServicesEditor } from "@/components/dashboard/pro/services-editor";
import { JobsPanel } from "@/components/dashboard/pro/jobs-panel";
import { StatusFilterTabs } from "@/components/dashboard/status-filter-tabs";
import { OffersPanel } from "@/components/dashboard/pro/offers-panel";
import { SaveStatusProvider } from "@/components/dashboard/save-status-context";
import { VerificationPanel } from "@/components/dashboard/pro/verification-panel";
import { ClientActivity, fetchClientProjects } from "@/components/dashboard/client-activity";
import { ClientConnections } from "@/components/dashboard/client-connections";
import { applyPendingSavedPro } from "@/components/professionals/save-button";
import { BasicProfileSection } from "@/components/dashboard/basic-profile-section";
import { isValidId } from "@/lib/cedula";
import { NotificationsList } from "@/components/notifications/notifications-list";
import { AccountSecuritySection } from "@/components/account/account-security";
import { AccountPrivacySection } from "@/components/account/account-privacy";
import { CloseAccountSection } from "@/components/account/close-account-section";
import { SupportTickets } from "@/components/support/support-tickets";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/utils";
import { canOffer } from "@/lib/auth/capabilities";
import { useMode, type Mode } from "@/hooks/use-mode";
import { ImagePreviewDialog } from "@/components/ui/image-preview-dialog";
import { notificationContext } from "@/lib/notification-link";
import { Link, useRouter } from "@/i18n/navigation";
import { openInNewTabOnDesktop } from "@/lib/desktop-new-tab";
import { useAuth } from "@/hooks/use-auth";
import { scheduleVisibleIdlePrefetch } from "@/lib/visible-idle-prefetch";
import { useAvisosSinLeer } from "@/hooks/use-avisos-sin-leer";
import { useDirectMessageUnread } from "@/hooks/use-direct-message-unread";
import { cn } from "@/lib/utils";
import { SupportThreadSkeleton } from "@/components/support/support-thread-skeleton";
import { PanelSkeleton } from "@/components/ui/section-skeletons";
import { PublishProjectModal } from "@/components/projects/publish-project-modal";
import { withPromiseTimeout } from "@/lib/promise-timeout";
import { getDashboardCache, setDashboardCache, subscribeDashboardCache } from "@/lib/dashboard-prefetch-cache";
import {
  dashboardBootstrapKey,
  type DashboardBootstrap,
  type DashboardProfileData,
} from "@/lib/dashboard-bootstrap-cache";
import { PROFILE_IMAGE_OPTIONS, prepareImageForUpload, uploadPhotoFormDataWithRetry } from "@/lib/client-image-upload";
import { deleteOwnedMediaUrl } from "@/lib/client-media-cleanup";
import { formatPersonDisplayName, getProfessionalDisplayName } from "@/lib/display-name";
import { OfferTagPercentIcon } from "@/components/icons/offer-tag-percent-icon";
import { CABECERA_BOTON, CABECERA_GLIFO, CABECERA_TITULO, COLUMNAS_CABECERA } from "@/components/layout/cabecera";
import { BrandIconBadge } from "@/components/ui/brand-icon-badge";
import { Modal } from "@/components/ui/modal";

// ONE unified panel for every account (Airbnb model). A MODE SWITCH flips between
// "Usar servicios" (the seek capability, always available) and "Ofrecer servicios"
// (the offer capability, unlocked by completing the professional profile). There
// is no separate client panel; everyone lives here.
type Tab =
  | "pro_tools" | "pro_payments" | "pro_billing" | "pro_expenses" | "pro_agenda" | "pro_clients" | "pro_quotes" | "pro_inventory" | "pro_social" | "pro" | "home" | "profile" | "services" | "photos" | "quotes" | "verificacion"
  | "jobs" | "offers" | "publicaciones" | "completion"
  | "sent_projects" | "applications" | "saved" | "connections" | "appointments"
  | "chat" | "notifications" | "soporte" | "cuenta" | "guides" | "statistics" | "cv" | "carta" | "tools";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProData = Record<string, any>;

// Las citas se borraron el 8-oct-2026 (cero en toda la historia). Un enlace
// viejo con ?tab=availability, bookings o sent_bookings no está en este
// conjunto y cae en el inicio del panel. El nuevo recorrido local de solicitudes
// usa appointments, sin reinterpretar ni reactivar las reservas históricas.
const ALL_TABS = new Set<Tab>([
  "pro_tools", "pro_payments", "pro_expenses", "pro_billing", "pro_agenda", "pro_clients", "pro_inventory", "pro_social", "pro", "home", "profile", "services", "photos", "quotes", "verificacion",
  "jobs", "offers", "publicaciones", "completion", "sent_projects", "applications", "saved", "connections", "appointments",
  "chat", "notifications", "soporte", "cuenta", "guides", "statistics", "cv", "carta", "tools",
]);

const PRO_SALES_TABS = new Set<Tab>(["quotes","pro_billing","pro_payments"]);
const LOCAL_APPOINTMENT_TABS=process.env.NODE_ENV==='development'?['appointments']:[];

const TAB_ICONS: Record<Tab, React.ReactNode> = {
  pro_tools: <Wrench className="h-4 w-4" />,
  pro_payments: <ReceiptText className="h-4 w-4" />,
  pro_agenda: <ClipboardList className="h-4 w-4" />,
  pro_expenses: <ReceiptText className="h-4 w-4" />,
  pro_billing: <ReceiptText className="h-4 w-4" />,
  pro_clients: <Users className="h-4 w-4" />,
  pro_quotes: <ReceiptText className="h-4 w-4" />,
  pro_inventory: <BriefcaseBusiness className="h-4 w-4" />,
  pro_social: <Sparkles className="h-4 w-4" />,
  pro: <Sparkles className="h-4 w-4" />,
  statistics: <ChartNoAxesColumn className="h-4 w-4" />,
  home: <Home className="h-4 w-4" />,
  profile: <User className="h-4 w-4" />,
  services: <Wrench className="h-4 w-4" />,
  photos: <Award className="h-4 w-4" />,
  quotes: <ReceiptText className="h-4 w-4" />,
  verificacion: <ShieldCheck className="h-4 w-4" />,
  sent_projects: <ClipboardList className="h-4 w-4" />,
  appointments: <ClipboardList className="h-4 w-4" />,
  applications: <BriefcaseBusiness className="h-4 w-4" />,
  saved: <Bookmark className="h-4 w-4" />,
  connections: <Users className="h-4 w-4" />,
  chat: <MessageSquareMore className="h-4 w-4" />,
  notifications: <Bell className="h-4 w-4" />,
  soporte: <Headset className="h-4 w-4" />,
  cuenta: <Settings className="h-4 w-4" />,
  guides: <FileText className="h-4 w-4" />,
  cv: <FileUser className="h-4 w-4" />,
  carta: <Mail className="h-4 w-4" />,
  tools: <Wrench className="h-4 w-4" />,
  jobs: <BriefcaseBusiness className="h-4 w-4" />,
  offers: <OfferTagPercentIcon className="h-4 w-4" />,
  publicaciones: <OfferTagPercentIcon className="h-4 w-4" />,
  completion: <CheckCircle2 className="h-4 w-4" />,
};

// Toda sección abre con una línea que dice qué es. Va en el cuerpo, arriba de
// los filtros, no en la cabecera de la tarjeta: la cabecera solo existe de
// 1024px para arriba y a media pantalla el subtítulo desaparecía.
const TABS_WITH_SUBTITLE = new Set<Tab>([
  "verificacion", "completion",
  "applications", "saved", "connections", "notifications", "cuenta", "guides", "cv", "carta",
]);

// Las que faltan —sent_projects, soporte, photos, offers, jobs, quotes y
// services— dibujan su propia cabecera desde adentro del componente, porque ahí
// el subtítulo va en la misma fila que un botón que depende de sus datos.

// Mode membership. The first three render only in "offer" mode, the next three
// only in "use" mode; "profile" + the shared tabs are valid in both, so the mode
// for those is taken from the URL (?mode=) or defaults to the account's capability.
const OFFER_ONLY = new Set<Tab>(["services", "photos", "quotes", "verificacion", "jobs", "offers", "completion"]);
// Ya no hay dos paneles: «Mis proyectos» es del profesional tanto como del
// cliente —publicar un proyecto es publicar, tenga o no ficha—, así que ninguna
// sección fuerza el panel de cliente. Se conserva el conjunto vacío porque el
// parámetro ?mode= sigue llegando en enlaces viejos.
const USE_ONLY = new Set<Tab>([]);

// Sidebar order per mode (+ a shared block appended below).
// Citas y Mi agenda salieron del menú. Medido en producción: 45 profesionales
// publicaron agenda —9.820 horas futuras— y NUNCA hubo una sola cita. Peor: el
// perfil con agenda convierte 2,6% de vista a contacto y el que no la tiene,
// 9,5%. La agenda competía con el botón de contactar y se lo comía. El 8-oct-2026
// se borró el código entero; si vuelve, está en el historial de git.
//
// Oportunidades también sale: los proyectos pasan a un tablero público
// (/solicitudes), como empleos y promociones, y el profesional contacta directo
// en vez de mandar una propuesta que nadie contesta (1 en toda la historia).
// Mis postulaciones (0) y Volver a contratar (0) se retiran por lo mismo.
// Seis secciones para el profesional y cuatro para el cliente. «Mis trabajos» y
// «Servicios» vive dentro de «Mi perfil», que es donde se ven; empleos y
// promociones comparten «Mis publicaciones», que es lo mismo: algo que publico.
const OFFER_TABS: Tab[] = ([
  "sent_projects", "jobs", "offers", "tools", "photos", "services", "statistics", "profile", "saved", "soporte", "guides",
] as Tab[]).filter((tab) => EMPLEOS_VISIBLE || tab !== "jobs");
const USE_TABS: Tab[] = ["sent_projects", "tools", "statistics", "saved", "profile", "soporte", "guides"] as Tab[];
// «Mis publicaciones» reúne TODO lo que uno saca a un tablero público: el
// proyecto que pide un trabajo, el empleo que ofrece uno y la promoción. Son el
// mismo acto —publicar— y antes vivían en dos paneles distintos, con un
// interruptor «cliente / profesional» de por medio. Medido en producción: de
// 289 profesionales, DOS usaron alguna vez el panel de cliente.
type Publicacion = "proyectos" | "empleos" | "promociones";
const PUBLICACION_TABS = [{ id: "proyectos" }, { id: "empleos" }, { id: "promociones" }] as const satisfies ReadonlyArray<{ id: Publicacion }>;

// Once filas planas se leían una por una; los bloques ordenan el recorrido. El
// agrupamiento se nota por el orden, sin rótulos ni líneas: lo único que hay
// que leer ahí son los nombres de las secciones.
// Primero lo que uno mueve todos los días —lo publicado y las cotizaciones—,
// después lo que arma la ficha —trabajos, servicios, perfil—, y al final lo
// guardado y la ayuda.
// «Servicios» y «Trabajos» estuvieron un rato dentro de «Mi perfil»: son parte
// del perfil, sí, pero también son las dos cosas que un profesional vuelve a
// tocar, y «Trabajos» es la más floja de todas (29 de 289 tienen alguno) y la
// que más vende. Enterrada dos niveles no la iba a encontrar nadie.
const PANEL_GROUPS: { grupo: "work" | "business" | "tools" | "saved" | "account"; tabs: Tab[] }[] = [
  // Tres entradas, no un interruptor: «Mis publicaciones» juntaba proyectos,
  // empleos y promociones en una sola puerta, y una puerta con un interruptor
  // adentro hay que descubrirla. En el menú se leen de una.
  { grupo: "business", tabs: ["sent_projects", "appointments", "jobs", "offers", "pro_agenda", "pro_clients", "pro_inventory", "pro_billing", "pro_expenses"] },
  // Herramientas: documentos que uno arma y descarga, cada una en su pantalla.
  { grupo: "tools", tabs: ["tools"] },
  { grupo: "work", tabs: ["photos", "services", "statistics", "profile", "completion"] },
  { grupo: "saved", tabs: ["saved"] },
  { grupo: "account", tabs: ["soporte", "guides"] },
];
function agruparPestanas(tabs: Tab[]): Tab[][] {
  const grupos = PANEL_GROUPS
    // El orden dentro de cada bloque es el del bloque, no el de la lista de pestañas.
    .map((g) => g.tabs.filter((tab) => tabs.includes(tab)))
    .filter((g) => g.length > 0);
  const sueltas = tabs.filter((tab) => !PANEL_GROUPS.some((g) => g.tabs.includes(tab)));
  return sueltas.length > 0 ? [...grupos, sueltas] : grupos;
}

const PANEL_TAB_LABELS: Partial<Record<Tab, { es: string; en: string }>> = {
  pro_agenda:{es:"Citas",en:"Appointments"},
  pro_expenses:{es:"Gastos",en:"Expenses"},
  pro_billing:{es:"Facturación",en:"Billing"},
  pro_payments:{es:"Pagos",en:"Payments"},
  pro_clients:{es:"Clientes",en:"Customers"},
  pro_quotes:{es:"Cotizaciones",en:"Quotes"},
  pro_inventory:{es:"Inventario",en:"Inventory"},
  pro_social:{es:"Difusión",en:"Promotion history"},
  pro: {es:"ContrataCR Pro",en:"ContrataCR Pro"},
  statistics: { es: "Estadísticas", en: "Statistics" },
  quotes: { es: "Cotizaciones", en: "Quotes" },
  sent_projects: { es: "Mis solicitudes", en: "My requests" },
  appointments: {es:"Mis citas",en:"My appointments"},
  applications: { es: "Mis postulaciones", en: "My applications" },
  connections: { es: "Volver a contratar", en: "Hire again" },
  photos: { es: "Casos de éxito", en: "Success stories" },
  services: { es: "Servicios", en: "Services" },
  saved: { es: "Favoritos", en: "Favorites" },
  soporte: { es: "Soporte", en: "Support" },
  profile: { es: "Mi perfil", en: "My profile" },
  publicaciones: { es: "Mis publicaciones", en: "My posts" },
  jobs: { es: "Empleos", en: "Jobs" },
  offers: { es: "Promociones", en: "Promotions" },
  completion: { es: "Complete su perfil", en: "Complete your profile" },
  guides: { es: "Guías", en: "Guides" },
  // El CV y la carta de presentación: para postularse a un empleo, con o sin ficha.
  cv: { es: "Currículum", en: "Resume" },
  carta: { es: "Carta de presentación", en: "Cover letter" },
  tools: { es: "Herramientas", en: "Tools" },
};

type GuideItem = {
  id: string;
  section: "client" | "shared" | "professional";
  actionTab?: Tab;
  targetField?: string;
  href?: string;
  targetMode?: Mode;
  stepCount: number;
};

const GUIDE_ITEMS: GuideItem[] = ([
  // Las guías de citas salieron junto con las citas: quedaba explicando una
  // pantalla que ya no está en el menú.
  { id: "clientPanel", section: "client", actionTab: "sent_projects", targetMode: "use", stepCount: 5 },
  { id: "clientProjects", section: "client", actionTab: "sent_projects", targetMode: "use", stepCount: 3 },
  { id: "clientSaved", section: "client", actionTab: "saved", targetMode: "use", stepCount: 4 },
  { id: "clientProfile", section: "client", actionTab: "profile", targetMode: "use", stepCount: 3 },
  { id: "searchServices", section: "shared", href: "/profesionales", stepCount: 5 },
  { id: "jobsGuide", section: "shared", href: "/empleos", stepCount: 4 },
  { id: "offersGuide", section: "shared", href: "/promociones", stepCount: 4 },
  { id: "notificationsGuide", section: "shared", actionTab: "notifications", stepCount: 5 },
  { id: "reviewsGuide", section: "shared", href: "/profesionales", stepCount: 4 },
  { id: "supportGuide", section: "shared", actionTab: "soporte", stepCount: 3 },
  { id: "accountSecurityGuide", section: "shared", actionTab: "cuenta", stepCount: 4 },
  { id: "professionalPanel", section: "professional", actionTab: "publicaciones", targetMode: "offer", stepCount: 4 },
  { id: "completionGuide", section: "professional", actionTab: "completion", targetMode: "offer", stepCount: 4 },
  { id: "opportunities", section: "shared", href: "/solicitudes", stepCount: 3 },
  { id: "successCases", section: "professional", actionTab: "profile", targetMode: "offer", stepCount: 4 },
  { id: "services", section: "professional", actionTab: "services", targetMode: "offer", stepCount: 4 },
  { id: "workplacesGuide", section: "professional", actionTab: "profile", targetField: "location", targetMode: "offer", stepCount: 4 },
  { id: "jobsPanel", section: "professional", actionTab: "publicaciones", targetMode: "offer", stepCount: 4 },
  { id: "offersPanel", section: "professional", actionTab: "publicaciones", targetMode: "offer", stepCount: 4 },
  { id: "professionalProfile", section: "professional", actionTab: "profile", targetMode: "offer", stepCount: 5 },
] as GuideItem[]).filter((guide) => EMPLEOS_VISIBLE || !["jobsGuide", "jobsPanel"].includes(guide.id));

function guideIcon(id: string) {
  switch (id) {
    case "clientPanel":
    case "professionalPanel":
      return <Home className="h-4 w-4" />;
    case "searchServices":
    case "searchFilters":
      return <Search className="h-4 w-4" />;
    case "reviewsGuide":
      return <Star className="h-4 w-4" />;
    case "notificationsGuide":
      return <Bell className="h-4 w-4" />;
    case "accountSecurityGuide":
      return <ShieldCheck className="h-4 w-4" />;
    case "completionGuide":
      return <Sparkles className="h-4 w-4" />;
    case "jobsGuide":
    case "jobsPanel":
    case "clientApplications":
      return <BriefcaseBusiness className="h-4 w-4" />;
    case "offersGuide":
    case "offersPanel":
      return <OfferTagPercentIcon className="h-4 w-4" />;
    case "messages":
      return <MessageSquareMore className="h-4 w-4" />;
    case "clientProjects":
      return <ClipboardList className="h-4 w-4" />;
    case "clientSaved":
      return <Bookmark className="h-4 w-4" />;
    case "clientConnections":
      return <Users className="h-4 w-4" />;
    case "clientProfile":
    case "professionalProfile":
      return <User className="h-4 w-4" />;
    case "supportGuide":
      return <Headset className="h-4 w-4" />;
    case "services":
      return <Wrench className="h-4 w-4" />;
    case "successCases":
      return <Award className="h-4 w-4" />;
    case "opportunities":
      return <Handshake className="h-4 w-4" />;
    default:
      return <User className="h-4 w-4" />;
  }
}

// Guías es una PANTALLA del panel, no un modal: llegar por navegación (o por el
// enlace ?tab=guides) dejaba la sección en blanco porque el contenido solo vivía
// dentro del modal. Este cuerpo se usa en los dos sitios.
function GuidesBody({
  isProvider,
  onGo,
  onClose,
}: {
  isProvider: boolean;
  onGo: (guide: GuideItem) => void;
  onClose?: () => void;
}) {
  const t = useTranslations("proPanel.guides");
  const [busqueda, setBusqueda] = useState("");
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);

  // A quien todavía no ofrece servicios, las guías de profesional le van al
  // final: no son su trabajo de hoy, son la invitación a dar el paso.
  const orden: GuideItem["section"][] = isProvider
    ? ["professional", "shared", "client"]
    : ["client", "shared", "professional"];
  const consulta = busqueda.trim().toLocaleLowerCase();
  const coincide = (guide: GuideItem) => {
    if (!consulta) return true;
    return `${t(`items.${guide.id}.title`)} ${t(`items.${guide.id}.body`)}`.toLocaleLowerCase().includes(consulta);
  };
  const secciones = orden
    .map((id) => ({ id, title: t(`sections.${id}`), guides: GUIDE_ITEMS.filter((g) => g.section === id && coincide(g)) }))
    .filter((seccion) => seccion.guides.length > 0);

  const go = (guide: GuideItem) => {
    onClose?.();
    // El destino real (registro, enlace o sección) lo resuelve el panel en onGo.
    if ((!isProvider && guide.section === "professional") || guide.href || guide.actionTab) onGo(guide);
  };

  return (
    <div data-guides-section="" className="mx-auto w-full max-w-[620px]">
      <p className="text-sm leading-relaxed text-[#526277]">
        {isProvider ? t("providerNoteBody") : t("clientNoteBody")}
      </p>

      <div className="mt-4 flex h-11 items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-3">
        <Search className="h-4 w-4 shrink-0 text-[#9aa8b9]" />
        <input
          value={busqueda}
          onChange={(event) => setBusqueda(event.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="min-w-0 flex-1 bg-transparent text-sm text-[#162543] outline-none placeholder:text-[#9aa8b9]"
        />
      </div>

      {secciones.length === 0 && (
        <p className="mt-8 text-center text-sm text-[#6b7280]">{t("searchEmpty")}</p>
      )}

      {secciones.map((seccion) => (
        <section key={seccion.id} className="mt-6">
          <h3 className="px-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#8494a8]">{seccion.title}</h3>
          <div className="mt-2 flex flex-col gap-2">
            {seccion.guides.map((guide) => {
              const abierta = selectedGuideId === guide.id;
              return (
                <div key={guide.id} className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => setSelectedGuideId(abierta ? null : guide.id)}
                    aria-expanded={abierta}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[#f9fbfd]"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl ccr-caja-icono-plana">
                      {guideIcon(guide.id)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-bold leading-snug text-[#162543]">{t(`items.${guide.id}.title`)}</span>
                      {!abierta && (
                        <span className="mt-0.5 block truncate text-[13px] text-[#6b7280]">{t(`items.${guide.id}.body`)}</span>
                      )}
                    </span>
                    <ChevronDown className={cn("h-4 w-4 shrink-0 text-[#9aa8b9] transition-transform", abierta && "rotate-180")} />
                  </button>
                  {abierta && (
                    <div className="border-t border-[#eef2f6] px-4 pb-4 pt-3">
                      <p className="text-sm leading-relaxed text-[#526277]">{t(`items.${guide.id}.body`)}</p>
                      {hasVisualGuide(guide.id) ? <GuideVisualWalkthrough id={guide.id} title={t(`items.${guide.id}.title`)} steps={Array.from({ length: guide.stepCount }, (_, i) => t(`items.${guide.id}.steps.${i}`))} /> : <ol className="mt-3 space-y-2">
                        {Array.from({ length: guide.stepCount }, (_, stepIndex) => (
                          <li key={stepIndex} className="flex gap-2 text-sm leading-relaxed text-[#374151]">
                            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#EBF5FB] text-[11px] font-extrabold text-[#0089bb]">
                              {stepIndex + 1}
                            </span>
                            <span>{t(`items.${guide.id}.steps.${stepIndex}`)}</span>
                          </li>
                        ))}
                      </ol>}
                      <Button type="button" className="mt-4 w-full rounded-full px-5 sm:w-auto" onClick={() => go(guide)}>
                        {!isProvider && guide.section === "professional" ? t("activateProfessionalCta") : t(`items.${guide.id}.cta`)}
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* La salida a soporte cierra las guías: era una tarjeta pálida con un
          botón de contorno, y se leía apagada justo donde alguien pide ayuda.
          Ahora es una tarjeta como las demás y su botón pesa como los otros. */}
      <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#ccecf8] ccr-caja-icono-plana">
            <Headset className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-bold leading-snug text-[#162543]">{t("supportTitle")}</p>
            <p className="mt-1 text-sm leading-relaxed text-[#526277]">{t("supportBody")}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            onClose?.();
            onGo({ id: "supportGuide", section: "shared", actionTab: "soporte", stepCount: 3 });
          }}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#009FD9] px-4 text-sm font-bold text-white transition-colors hover:bg-[#0089bb]"
        >
          {t("supportCta")}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// Las acciones de texto del encabezado del panel (Ver perfil, Compartir,
// Guías): una sola clase para que no vuelvan a separarse.
// Cada una con su icono de 14 px delante: tres palabras grises seguidas se
// leian como un pie de pagina, no como acciones. El icono le da a cada una
// algo que reconocer antes de leerla —la flecha de salir, el nodo de
// compartir, el libro— y es como se dibujan las acciones secundarias de una
// cabecera en GitHub o Linear. Sin caja ni borde: siguen sin competir con el
// nombre de la cuenta.
const ENLACE_DE_CABECERA = "group/enlace inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold leading-none text-[#526277] transition hover:text-[#009FD9] focus-visible:outline-none focus-visible:underline";
// 12 px y trazo fino: son ACOMPANANTES del rotulo, no botones. A 14 px con el
// trazo normal pesaban tanto como la palabra y la fila se leia como tres
// botones con icono en vez de tres enlaces de texto.
const ICONO_DE_CABECERA = "h-3 w-3 shrink-0 stroke-[1.9] text-[#9aa7b6] transition-colors group-hover/enlace:text-[#009FD9]";

// The navbar already publishes its acknowledgement on this external contract.
// Subscribe instead of mirroring/resetting it in a layout effect.
function subscribeNavbarHeader(update: () => void) {
  window.addEventListener("ccr:section-header", update);
  window.addEventListener("ccr:section-header-ack", update);
  return () => {
    window.removeEventListener("ccr:section-header", update);
    window.removeEventListener("ccr:section-header-ack", update);
  };
}
function acknowledgedNavbarHeader() {
  const header = window as unknown as { __ccrSectionHeader?: string | null; __ccrSectionAck?: boolean };
  return header.__ccrSectionAck ? header.__ccrSectionHeader ?? null : null;
}
const emptyExternalSnapshot = () => null;

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  useEffect(()=>{setProNavigationAccount(user?.id??null);return()=>setProNavigationAccount(null);},[user?.id]);
  const {enabled:proEnabled,ready:proAccessReady,error:proAccessError,retry:retryProAccess}=useLocalProAccess(user?.id);
  const simpleCopy=useTranslations("ProSimple");
  const { cabeceraRef, conLinea } = useHairlineOnScroll();
  const router = useRouter();
  // Query-only Pro history can outlive Next's cached router tree across reloads.
  // Keep the browser URL authoritative while access is being resolved as well;
  // this changes no permission decision and preserves the basic panel afterward.
  const searchParams = useProSearchParams(proEnabled || !proAccessReady,LOCAL_APPOINTMENT_TABS);
  // Publicar una solicitud desde el inicio abre el formulario DE UNA VEZ, encima
  // de lo que esté cargando: antes se veía medio segundo del panel antes del modal.
  const [publicarDirecto, setPublicarDirecto] = useState(() => searchParams.get("openPublish") === "1");
  // Guías es una ventana, no una sección. `?tab=guides` sigue funcionando —hay
  // enlaces viejos y correos que apuntan ahí— y ahora abre la ventana.
  const [guiasAbiertasManualmente, setGuiasAbiertas] = useState(false);
  const guiasPorDireccion = searchParams.get("tab") === "guides";
  const guiasAbiertas = guiasAbiertasManualmente || guiasPorDireccion;
  function cerrarGuias() {
    setGuiasAbiertas(false);
    if (guiasPorDireccion) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", "home");
      replaceProPath(window.location.pathname + "?" + params.toString());
    }
  }
  // De dónde llegó quien tocó «Publicar proyecto». Se guarda al llegar porque
  // el panel reescribe su dirección: al cerrar el formulario SIN publicar se
  // vuelve ahí, en vez de dejar a la persona en una lista que no fue a buscar.
  // A dónde vuelve la flecha del formulario abierto por /publicar-solicitud:
  // la página de la que vino (inicio, búsqueda, Proyectos…), si es interna.
  const [publicarVolverA] = useState(() => (publicarDirecto ? rutaInternaSegura(searchParams.get("returnTo")) : null));
  const publicadoRef = useRef(false);
  const publicarLimpiadoRef = useRef(false);
  useEffect(() => {
    if (!publicarDirecto || publicarLimpiadoRef.current) return;
    publicarLimpiadoRef.current = true;
    // Se quita el parámetro para que la sección no abra un segundo formulario.
    const params = new URLSearchParams(searchParams.toString());
    params.delete("openPublish");
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [publicarDirecto, router, searchParams]);
  const formularioPublicar = publicarDirecto ? (
    <PublishProjectModal
      onClose={() => {
        // Publicado, se queda: el proyecto nuevo está en esta lista. Sin
        // publicar, vuelve por donde vino SIN cerrar antes el formulario: si se
        // cerraba primero se veía el panel un instante y después Proyectos (el
        // parpadeo al volver con la flecha). El formulario se va con la pantalla.
        if (publicarVolverA && !publicadoRef.current) { router.push(publicarVolverA); return; }
        setPublicarDirecto(false);
      }}
      onSuccess={() => {
        publicadoRef.current = true;
        window.dispatchEvent(new Event("contratacr:projects-changed"));
      }}
    />
  ) : null;
  const t = useTranslations("proPanel");
  const locale = useLocale();
  const pc = useTranslations("ProPanelCopy");
  const proAccessPlaceholder = <div data-pro-access-placeholder>{proAccessReady
    ? <p className="p-4">{pc("toolsUnavailable")}</p>
    : proAccessError ? <div role="alert" className="space-y-3 p-4"><p>{pc("accessCheckFailed")}</p><Button type="button" variant="secondary" onClick={retryProAccess}>{pc("retry")}</Button></div>
    : <PanelListSkeleton rows={3} compacto/>}</div>;
  // qué oficio pertenece, y de ahí sale a quién se le avisa.
  const rawRequestedTab = searchParams.get("tab")==="pro_quotes"?"quotes":searchParams.get("tab");
  const legacyVerificationTab = rawRequestedTab === "verificacion";
  // `?tab=proposals` es una direccion VIEJA: Oportunidades ya no existe, pero
  // sigue llegando desde avisos guardados, push y enlaces de cotizaciones. Cae
  // en «Mis proyectos», que es donde esta ahora lo que esa pantalla mostraba,
  // en vez de dejar a la persona en una seccion que no existe.
  // Guides is an overlay, not the desktop's mobile-only home destination.
  // Leave the normal panel underneath without rewriting the overlay's URL.
  // Antes el currículum y la carta eran una sola sección: ?tab=cv&doc=carta abre la carta.
  const normalizedTab = rawRequestedTab === "guides" ? null : rawRequestedTab === "appointments"&&!LOCAL_APPOINTMENT_TABS.length?"sent_projects":rawRequestedTab === "pro_social" ? "home" : legacyVerificationTab ? "profile" : rawRequestedTab === "proposals" ? "sent_projects" : rawRequestedTab === "cv" && searchParams.get("doc") === "carta" ? "carta" : rawRequestedTab;
  // Un ?tab= desconocido mostraba una sección vacía titulada con el id crudo:
  // se ignora y cae al inicio del panel.
  const requestedTab = (normalizedTab && ALL_TABS.has(normalizedTab as Tab) ? normalizedTab : null) as Tab | null;
  const requestedMode = searchParams.get("mode");
  const urlModeParam: Mode | null = requestedMode === "use" || requestedMode === "offer" ? requestedMode : null;
  const requestedReturnTo = searchParams.get("returnTo");
  const externalReturnTo = requestedReturnTo === "/promociones" || requestedReturnTo === "/empleos" || requestedReturnTo === "/solicitudes" || requestedReturnTo === "/notificaciones"
    ? requestedReturnTo
    : requestedReturnTo?.startsWith("/mensajes") && !requestedReturnTo.startsWith("//") && !requestedReturnTo.includes("\\")
      ? requestedReturnTo
      : null;
  // El panel reescribe su URL, así que el origen se guarda al llegar.
  const returnToRef = useRef<string | null>(null);
  // Captured at arrival: the dashboard's own URL rewrites drop the param long
  // before the back arrow is pressed. Se guarda DESPUÉS de pintar, no durante:
  // escribir una referencia en medio del render es justo lo que React pide no
  // hacer, y aquí no cambia nada porque la flecha se pulsa mucho más tarde.
  const chatReturnRef = useRef<string | null>(null);
  useEffect(() => {
    if (!externalReturnTo) return;
    returnToRef.current = externalReturnTo;
    if (externalReturnTo.startsWith("/mensajes")) chatReturnRef.current = externalReturnTo;
  }, [externalReturnTo]);

  const accountId = user?.id ?? null;
  const subscribeBootstrap = useCallback((update: () => void) => accountId
    ? subscribeDashboardCache(dashboardBootstrapKey(accountId), update)
    : () => {}, [accountId]);
  const readBootstrap = useCallback(() => accountId
    ? getDashboardCache<DashboardBootstrap>(dashboardBootstrapKey(accountId))
    : null, [accountId]);
  const cachedBootstrap = useSyncExternalStore(subscribeBootstrap, readBootstrap, emptyExternalSnapshot);
  const [loadedPro, setPro] = useState<ProData | null>(null);
  const [loadedProfile, setProfile] = useState<DashboardProfileData | null>(null);
  const [networkLoading, setLoading] = useState(true);
  // SSR and hydration both start with null. React then reads the account's
  // cache synchronously; no effect copies it just to reveal the first frame.
  // Missing professional data never resolves a provider's loading guard.
  const usableBootstrap = cachedBootstrap && user && (!canOffer(user) || cachedBootstrap.pro) ? cachedBootstrap : null;
  const pro = networkLoading && usableBootstrap ? usableBootstrap.pro as ProData | null : loadedPro;
  const profile = networkLoading && usableBootstrap ? usableBootstrap.profile : loadedProfile;
  const loading = networkLoading && !usableBootstrap;
  // PRECARGA de Mis proyectos y Cotizaciones (5-oct-2026): eran las únicas
  // secciones que la primera vez mostraban esqueleto (1-1,3 s). Al abrir el
  // panel, en un rato libre, se llenan las MISMAS claves de caché que usan
  // esas secciones; al entrar ya pintan de una. Solo si no hay nada guardado.
  useEffect(() => {
    if (!user?.id) return;
    const uid = user.id;
    const proId = typeof pro?.id === "string" ? pro.id : null;
    return scheduleVisibleIdlePrefetch((isActive) => {
      const claveProyectos = `dashboard:client-projects:${uid}`;
      if (!getDashboardCache(claveProyectos)) void fetchClientProjects().then((d) => { if (isActive() && !getDashboardCache(claveProyectos)) setDashboardCache(claveProyectos, d); }).catch(() => {});
      if (proId && proAccessReady && !proEnabled) {
        const claveCotizaciones = `quotes:${proId}`;
        if (!getDashboardCache(claveCotizaciones)) void cargarCotizaciones().then((d) => { if (isActive() && !getDashboardCache(claveCotizaciones)) setDashboardCache(claveCotizaciones, d); }).catch(() => {});
      }
    });
  }, [user?.id, pro?.id,proAccessReady,proEnabled]);
  const [refreshKey] = useState(0);
  const chatUnread = useDirectMessageUnread(!!user);
  const [profileFocus, setProfileFocus] = useState<{ field: string; key: number } | null>(null);
  const [serviceFocus, setServiceFocus] = useState<{ field: string; key: number } | null>(null);
  const [completionFlowField, setCompletionFlowField] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem("contratacr:profile-completion-field");
  });
  const [profileResetKey, setProfileResetKey] = useState(0);
  const [mobileProfileSectionTitle, setMobileProfileSectionTitle] = useState<string | null>(null);
  const [supportThreadTitle, setSupportThreadTitle] = useState<string | null>(null);
  // Un currículum o carta abierto: la flecha de la barra vuelve a la lista.
  const [cvEditorAbierto, setCvEditorAbierto] = useState(false);
  // Qué mitad de «Mis publicaciones» se está viendo.
  const [publicacionTipo, setPublicacionTipo] = useState<Publicacion>("proyectos");
  const [conteoPublicaciones, setConteoPublicaciones] = useState<Record<string, number>>({});
  const anotarConteo = useCallback((clave: Publicacion, total: number) => {
    setConteoPublicaciones((previo) => (previo[clave] === total ? previo : { ...previo, [clave]: total }));
  }, []);
  const [supportThreadRef, setSupportThreadRef] = useState<string | null>(null);
  const [proLoadError, setProLoadError] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  // EL VALOR BUENO DESDE EL PRIMER CUADRO. Arrancaba en `false` y un efecto lo
  // corregía después, así que en el teléfono, al entrar al panel sin `?tab=`,
  // se pintaba «Mis proyectos» y un cuadro más tarde saltaba al menú: dos
  // pantallas distintas seguidas. `matchMedia` se puede preguntar durante el
  // primer render en el navegador; en el servidor no existe y `false` es lo
  // correcto, que es lo mismo que pinta la web ancha.
  const [preferMobileMenuDefault, setPreferMobileMenuDefault] = useState(
    () => typeof window !== "undefined" && !rawRequestedTab && window.matchMedia("(max-width: 1023px)").matches,
  );
  const contentRef = useRef<HTMLDivElement>(null);
  const headerPhotoInputRef = useRef<HTMLInputElement>(null);
  const headerPhotoMenuRef = useRef<HTMLDivElement>(null);
  const [headerPhotoMenuOpen, setHeaderPhotoMenuOpen] = useState(false);
  // Guarda en QUÉ sección se abrió: "Cotizar" y el panel son la misma página con
  // otro `tab`, así que al volver el componente no se remonta y la ventana
  // reaparecía. Atado al tab, se cierra sola al cambiar de sección.
  const [shareKitTab, setShareKitTab] = useState<string | null>(null);
  const [shareKitInitialView, setShareKitInitialView] = useState<"menu" | "reviews">("menu");
  const reviewShareLinkHandled = useRef(false);
  const [headerPhotoPreviewOpen, setHeaderPhotoPreviewOpen] = useState(false);
  const [headerPhotoUploading, setHeaderPhotoUploading] = useState(false);
  const proFetchSequenceRef = useRef(0);
  // Lo último que se logró cargar: si ya hay panel en pantalla, un fallo de red
  // se reintenta en silencio en vez de sustituirlo por una pantalla de error.
  const proRef = useRef<ProData | null>(null);
  const [noProTries, setNoProTries] = useState(0);
  const focusKeyRef = useRef(0);
  const bootstrapHydratedForRef = useRef<string | null>(null);
  const nextFocusKey = useCallback(() => {
    focusKeyRef.current += 1;
    return focusKeyRef.current;
  }, []);

  // Professional access is unlocked only by the real professionals row. Metadata
  // can lag or be stale, so it must not authorize professional-only sections.
  const isProvider = !!pro;
  // Haber EMPEZADO el registro profesional ya no cambia nada en el panel. Antes
  // sacaba de él y devolvía al formulario en cada entrada: quien lo abrió, se
  // arrepintió y se salió quedaba obligado a terminarlo para volver a su propia
  // cuenta de cliente. Ahora el panel funciona igual y «Ofrecer mis servicios»
  // retoma el formulario donde quedó, sin decirlo.

  // Airbnb FULL switch: the active mode is the GLOBAL (persisted) mode shared with the
  // navbar + bell. A mode-specific tab in the URL (a deep link from a notification or a
  // navbar quick link) overrides it, and is persisted below so everything stays in sync.
  // A non-provider has no offer world: always "use".
  const { mode: globalMode, setMode } = useMode(isProvider);
  // ── Ser profesional no se "desaprende" a media sesión ─────────────────────
  // `pro` puede volver nulo un instante cuando sus datos se vuelven a pedir
  // (por ejemplo al guardar en Disponibilidad). En ese parpadeo, las secciones
  // que solo existen para profesionales quedaban prohibidas y la pantalla
  // saltaba a otra: eso era "me saca de la sección". Una vez confirmado, el
  // dato se conserva mientras dure la sesión.
  const [profesionalConfirmado, setProfesionalConfirmado] = useState(false);
  if (isProvider && !profesionalConfirmado) setProfesionalConfirmado(true);
  const esProfesional = isProvider || profesionalConfirmado;
  const requestedOfferOnlyTab = !!requestedTab && OFFER_ONLY.has(requestedTab);
  // A history update is scheduled as a Next transition. Keep the selected
  // section synchronous so the previous panel cannot paint under its new URL.
  const [pendingPanelTab, setPendingPanelTab] = useState<{ from: string | null; tab: Tab; serviceRequest?: string } | null>(null);
  const visibleRequestedTab = pendingPanelTab && rawRequestedTab === pendingPanelTab.from ? pendingPanelTab.tab : requestedTab;
  const serviceRequestToComplete = pendingPanelTab && rawRequestedTab === pendingPanelTab.from
    ? pendingPanelTab.serviceRequest ?? searchParams.get("serviceRequest")
    : searchParams.get("serviceRequest");
  const allowedRequestedTab = visibleRequestedTab && (!OFFER_ONLY.has(visibleRequestedTab) || esProfesional) ? visibleRequestedTab : null;
  if (pendingPanelTab && (rawRequestedTab !== pendingPanelTab.from || (pendingPanelTab.serviceRequest && searchParams.get("serviceRequest") === pendingPanelTab.serviceRequest))) setPendingPanelTab(null);
  const urlForcedMode: Mode | null =
    legacyVerificationTab && esProfesional ? "offer" : requestedOfferOnlyTab && esProfesional ? "offer" : requestedTab && USE_ONLY.has(requestedTab) ? "use" : urlModeParam;
  // Un solo panel: la cuenta profesional SIEMPRE ve el suyo. ?mode=use sigue
  // llegando en enlaces viejos y avisos ya enviados; se acepta y se ignora.
  const mode: Mode = esProfesional ? "offer" : "use";
  // Citas salieron del menú: el panel abre en lo que sí se usa —Oportunidades
  // para el profesional, Mis proyectos para el cliente.
  const proFocused = proEnabled && mode === "offer";
  const defaultTab: Tab = proEnabled ? "home" : "sent_projects";
  const activeTab: Tab = allowedRequestedTab ?? (preferMobileMenuDefault ? "home" : defaultTab);
  useEffect(() => {
    if (reviewShareLinkHandled.current || searchParams.get("share") !== "reviews" || !pro?.slug || mode !== "offer") return;
    reviewShareLinkHandled.current = true;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("share");
    setShareKitInitialView("reviews");
    queueMicrotask(() => setShareKitTab(activeTab));
    router.replace(`/dashboard/profesional?${params.toString()}`, { scroll: false });
  }, [activeTab, mode, pro?.slug, router, searchParams]);

  // When a deep link forces a mode, adopt it globally so the navbar switch + bell follow.
  useEffect(() => {
    if (isProvider && urlForcedMode && urlForcedMode !== globalMode) setMode(urlForcedMode);
  }, [isProvider, urlForcedMode, globalMode, setMode]);
  // ENTRAR AL PANEL ES ENTRAR AL PANEL PROFESIONAL. Quien ofrece servicios abre
  // aquí su negocio: el panel de cliente es una visita, no el lugar donde se
  // queda. La elección se guardaba en la sesión, así que quien lo miraba una
  // vez volvía a caer ahí cada vez que entraba —"me lleva al panel cliente
  // aunque yo sea profesional"—. Ahora cada entrada al panel arranca en
  // profesional; dentro, el cambio a cliente se respeta mientras no se salga, y
  // un enlace con ?mode=use (por ejemplo desde un aviso de cliente) también.
  const modoDeEntradaFijado = useRef(false);
  useEffect(() => {
    if (modoDeEntradaFijado.current || authLoading || !isProvider) return;
    modoDeEntradaFijado.current = true;
    if (!urlModeParam && globalMode !== "offer") setMode("offer");
  }, [authLoading, isProvider, urlModeParam, globalMode, setMode]);

  // Security guard: a client can use this unified dashboard route, but must never
  // enter professional-only sections by editing the URL or reusing stale links.
  // Round 4B (race «?tab=jobs» → otra sección): una cuenta que SE DECLARA profesional
  // (canOffer) y cuya ficha todavía no llegó —la consulta devolvió vacío y fetchPro reintenta,
  // ver el efecto de noProTries— no es un cliente. La pantalla ya espera con el esqueleto
  // (professionalRecordResolving), pero estos efectos la trataban como cliente: reescribían la
  // URL a ?tab=sent_projects&mode=use y fijaban el modo cliente, y cuando la ficha llegaba
  // 700 ms después el enlace directo ya se había perdido. Ahora esperan a que se resuelva.
  const providerRecordPending = !!user && canOffer(user) && !pro && !proLoadError;
  useEffect(() => {
    if (authLoading || loading || !user || isProvider || providerRecordPending || !requestedOfferOnlyTab) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", "use");
    params.set("tab", "sent_projects");
    params.delete("focus");
    params.delete("flow");
    router.replace('/dashboard/profesional?' + params.toString(), { scroll: false });
  }, [authLoading, isProvider, loading, providerRecordPending, requestedOfferOnlyTab, router, searchParams, user]);

  useEffect(() => {
    const handler = (event: Event) => {
      const title = (event as CustomEvent<string | null>).detail;
      setMobileProfileSectionTitle(typeof title === "string" && title.trim() ? title : null);
    };
    window.addEventListener("ccr:profile-mobile-section-title", handler as EventListener);
    return () => window.removeEventListener("ccr:profile-mobile-section-title", handler as EventListener);
  }, []);

  useEffect(() => {
    if (activeTab !== "soporte" && supportThreadTitle) {
      const frame = requestAnimationFrame(() => {
        setSupportThreadTitle(null);
        setSupportThreadRef(null);
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [activeTab, supportThreadTitle]);

  useEffect(() => {
    if (!headerPhotoMenuOpen) return;

    function closePhotoMenuOnOutsidePress(event: PointerEvent) {
      if (!headerPhotoMenuRef.current?.contains(event.target as Node)) {
        setHeaderPhotoMenuOpen(false);
      }
    }

    function closePhotoMenuOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setHeaderPhotoMenuOpen(false);
    }

    document.addEventListener("pointerdown", closePhotoMenuOnOutsidePress);
    document.addEventListener("keydown", closePhotoMenuOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closePhotoMenuOnOutsidePress);
      document.removeEventListener("keydown", closePhotoMenuOnEscape);
    };
  }, [headerPhotoMenuOpen]);

  useEffect(() => {
    if (activeTab !== "profile") {
      const frame = requestAnimationFrame(() => setMobileProfileSectionTitle(null));
      return () => cancelAnimationFrame(frame);
    }
  }, [activeTab]);

  // Every panel section opens from its top: switching tabs used to inherit the
  // previous section's scroll position (window on the web, <main> in the app).
  const previousDashboardTabRef = useRef<Tab | null>(null);
  useEffect(() => {
    const previous = previousDashboardTabRef.current;
    previousDashboardTabRef.current = activeTab;
    if (previous === null || previous === activeTab) return;
    irAlInicio();
  }, [activeTab]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    const updateDefaultPanelTarget = () => {
      const isMobilePanel = mediaQuery.matches;
      setPreferMobileMenuDefault(!rawRequestedTab && isMobilePanel);
      if (!isMobilePanel) setMobilePanelOpen(false);
    };
    updateDefaultPanelTarget();
    window.addEventListener("resize", updateDefaultPanelTarget);
    mediaQuery.addEventListener("change", updateDefaultPanelTarget);
    return () => {
      window.removeEventListener("resize", updateDefaultPanelTarget);
      mediaQuery.removeEventListener("change", updateDefaultPanelTarget);
    };
  }, [rawRequestedTab]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.innerWidth >= 1024 && preferMobileMenuDefault) {
      queueMicrotask(() => {
        setPreferMobileMenuDefault(false);
        setMobilePanelOpen(false);
      });
    }
  }, [preferMobileMenuDefault]);

  useEffect(() => {
    const closePanelModeSelector = (event: PointerEvent) => {
      document.querySelectorAll<HTMLDetailsElement>("details[data-panel-mode-selector][open]").forEach((selector) => {
        if (!selector.contains(event.target as Node)) selector.removeAttribute("open");
      });
    };
    document.addEventListener("pointerdown", closePanelModeSelector);
    return () => document.removeEventListener("pointerdown", closePanelModeSelector);
  }, []);

  useEffect(() => {
    if (!legacyVerificationTab || authLoading || loading || !user || providerRecordPending) return;
    const params = new URLSearchParams(searchParams.toString());
    if (!isProvider) {
      params.set("tab", "sent_projects");
      params.set("mode", "use");
      params.delete("focus");
      if(proEnabled)replaceProPath(`${window.location.pathname}?${params.toString()}`);else window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
      return;
    }
    params.set("tab", "profile");
    params.set("mode", "offer");
    params.set("focus", "verification");
    if(proEnabled)replaceProPath(`${window.location.pathname}?${params.toString()}`);else window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [authLoading, isProvider, legacyVerificationTab, loading, searchParams, user, proEnabled, providerRecordPending]);

  useEffect(() => {
    if (requestedTab !== "chat") return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tab");
    const qs = params.toString();
    router.replace(`/mensajes${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [requestedTab, searchParams, router]);

  useEffect(() => {
    if (requestedTab !== "home") return;
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      const frame = requestAnimationFrame(() => setMobilePanelOpen(false));
      return () => cancelAnimationFrame(frame);
    }
    if (!proAccessReady || defaultTab === "home") return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", defaultTab);
    const qs = params.toString();
    if(proEnabled)replaceProPath(`${window.location.pathname}?${qs}`);else router.replace(`/dashboard/profesional?${qs}`, { scroll: false });
  }, [defaultTab, requestedTab, router, searchParams, proAccessReady, proEnabled]);

  useEffect(() => {
    if (requestedTab || activeTab !== "home") return;
    if (typeof window === "undefined" || window.innerWidth < 1024) return;
    if (!proAccessReady || defaultTab === "home") return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", defaultTab);
    const qs = params.toString();
    if(proEnabled)replaceProPath(`${window.location.pathname}?${qs}`);else router.replace(`/dashboard/profesional?${qs}`, { scroll: false });
  }, [activeTab, defaultTab, requestedTab, router, searchParams, proAccessReady, proEnabled]);

  // Suppress the login-redirect while signing out (from the navbar menu) straight
  // to main, no /login flash. Logout lives only in the navbar profile menu now.
  useEffect(() => {
    if (!authLoading && !user && !isSigningOut()) {
      const query = searchParams.toString();
      const destination = `/dashboard/profesional${query ? `?${query}` : ""}`;
      router.push(`/login?redirect=${encodeURIComponent(destination)}`);
    }
  }, [user, authLoading, router, searchParams]);

  useEffect(() => {
    if (authLoading || !user) return;
    applyPendingSavedPro();
  }, [authLoading, user]);

  // Deep links open the appropriate editor after its authenticated data is ready.
  useEffect(() => {
    const focus = searchParams.get("focus");
    if (!focus || authLoading || loading || !user) return;
    if (requestedTab === "services" && !isProvider) return;
    const sourceUrl = window.location.href;
    queueMicrotask(() => {
      if (window.location.href !== sourceUrl) return;
      if (requestedTab === "services") {
        setServiceFocus({ field: focus, key: nextFocusKey() });
      } else {
        setProfileFocus({ field: focus, key: nextFocusKey() });
      }
      const params = new URLSearchParams(searchParams.toString());
      params.delete("focus");
      const qs = params.toString();
      if(proEnabled)replaceProPath(`${window.location.pathname}${qs ? `?${qs}` : ""}`);else window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    });
  }, [searchParams, nextFocusKey, authLoading, loading, user, requestedTab, isProvider, proEnabled]);

  // Una foto de arranque sin ficha solo vale si la ficha se CONSULTÓ. Si el
  // perfil llegaba antes que `professionals`, se guardaba `{ pro: null }` como
  // si la cuenta no tuviera ficha; con metadatos atrasados (sin `is_provider`)
  // esa foto apagaba el cargador y el guardia de seguridad mandaba al
  // profesional a «Mis proyectos». El perfil adelantado espera aquí hasta que
  // la ficha se confirme.
  const pendingBootstrapProfileRef = useRef<{ userId: string; profile: DashboardProfileData | null } | null>(null);
  const cacheDashboardBootstrap = useCallback((next: Partial<DashboardBootstrap>) => {
    if (!user) return;
    const key = dashboardBootstrapKey(user.id);
    const current = getDashboardCache<DashboardBootstrap>(key);
    const pending = pendingBootstrapProfileRef.current?.userId === user.id ? pendingBootstrapProfileRef.current.profile : null;
    if (!current && !("pro" in next)) {
      pendingBootstrapProfileRef.current = { userId: user.id, profile: next.profile ?? pending };
      return;
    }
    pendingBootstrapProfileRef.current = null;
    setDashboardCache(key, { ...(current ?? { pro: null, profile: pending }), ...next });
  }, [user]);

  // El conteo de mensajes sin leer lo lleva `useDirectMessageUnread`, que hace
  // exactamente esta misma cuenta. Aquí había una copia con su PROPIO canal en
  // tiempo real y su propia llamada a /api/direct-chat: con el panel abierto,
  // cada mensaje de la plataforma disparaba las dos y el servidor resolvía el
  // doble de consultas para pintar el mismo número.

  const fetchPro = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!user) return null;
    const requestSequence = ++proFetchSequenceRef.current;
    const supabase = createClient();
    setProLoadError(false);

    // Tres intentos con espera creciente en vez de dos seguidos: la mayoría de
    // los fallos son un bache de red de un segundo. Y si el servidor responde
    // que el permiso venció —lo típico al volver a abrir la app horas después—
    // se renueva la sesión antes de reintentar, que si no el reintento falla
    // igual y la persona veía "No pudimos cargar tu panel" con la red buena.
    const esperas = [0, 600, 1800];
    let result: { data: ProData | null } | null = null;
    let ultimoFallo: unknown = null;
    for (let intento = 0; intento < esperas.length; intento += 1) {
      if (esperas[intento] > 0) await new Promise((r) => window.setTimeout(r, esperas[intento]));
      if (requestSequence !== proFetchSequenceRef.current) return null;
      try {
        const respuesta = await withPromiseTimeout(
          supabase.from("professionals").select("*").eq("profile_id", user.id).maybeSingle(),
          8_000,
          "dashboard-professional-timeout",
        );
        if (!respuesta.error) { result = { data: (respuesta.data ?? null) as ProData | null }; break; }
        ultimoFallo = respuesta.error;
        const mensaje = `${respuesta.error.code ?? ""} ${respuesta.error.message ?? ""}`.toLowerCase();
        if (mensaje.includes("jwt") || mensaje.includes("401") || mensaje.includes("expired")) {
          await supabase.auth.refreshSession().catch(() => undefined);
        }
      } catch (error) {
        ultimoFallo = error;
      }
    }

    if (requestSequence !== proFetchSequenceRef.current) return null;
    if (!result) {
      console.error("[dashboard] professional load failed after retries", ultimoFallo);
      // Con un panel ya pintado (de la caché o de una carga anterior) el error
      // no se muestra: se queda lo que hay y se vuelve a intentar solo.
      if (!silent) {
        if (!proRef.current) setProLoadError(true);
        setLoading(false);
      }
      return null;
    }

    const { data } = result;

    // A slower request started before a save must never overwrite the freshly
    // saved professional data when it finishes later.
    setPro((current) => JSON.stringify(current) === JSON.stringify(data) ? current : data);
    cacheDashboardBootstrap({ pro: data });
    if (data) {
      setNoProTries(0);
    } else if (!silent) {
      setNoProTries((n) => n + 1);
    }
    if (!silent) setLoading(false);
    return data;
  }, [cacheDashboardBootstrap, setLoading, setNoProTries, setPro, setProLoadError, user]);

  useEffect(() => {
    proRef.current = pro;
  }, [pro]);

  // Con la pantalla de error puesta, volver a la app o recuperar la conexión
  // reintenta solo: nadie debería tener que buscar el botón.
  useEffect(() => {
    if (!proLoadError) return;
    const reintentar = () => {
      if (document.visibilityState !== "visible") return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      void fetchPro();
    };
    window.addEventListener("online", reintentar);
    document.addEventListener("visibilitychange", reintentar);
    return () => {
      window.removeEventListener("online", reintentar);
      document.removeEventListener("visibilitychange", reintentar);
    };
  }, [proLoadError, fetchPro]);

  const fetchProfile = useCallback(async () => {
    if (!user) return null;
    const supabase = createClient();
    let data = null;
    try {
      ({ data } = await withPromiseTimeout(supabase.rpc("get_my_profile"), 8_000, "dashboard-profile-timeout"));
    } catch (error) {
      console.error("[dashboard] profile load timed out or failed", error);
    }
    if (data) {
      setProfile((current) => JSON.stringify(current) === JSON.stringify(data) ? current : data);
      cacheDashboardBootstrap({ profile: data });
    }
    return data ?? null;
  }, [cacheDashboardBootstrap, setProfile, user]);

  useEffect(() => {
    if (!user) {
      bootstrapHydratedForRef.current = null;
      return;
    }
    // Supabase can emit a refreshed user object for the same authenticated
    // account while the first professional request is still in flight. Starting
    // a second silent fetch here invalidates the visible request sequence, but a
    // silent fetch never clears the route loader. Bootstrap exactly once per
    // user id; explicit refresh events below remain responsible for later syncs.
    if (bootstrapHydratedForRef.current === user.id) return;
    bootstrapHydratedForRef.current = user.id;
    const cached = getDashboardCache<DashboardBootstrap>(dashboardBootstrapKey(user.id));
    if (cached) {
      // Una ficha profesional en la caché sí es respuesta: se pinta el panel de
      // una vez (la suscripción de caché ya la muestra) y la consulta
      // silenciosa lo confirma por detrás.
      //
      // Una caché SIN ficha no lo es. "Todavía no cargó" y "no tiene ficha" se
      // ven igual, y darla por buena apagaba el cargador y pintaba el panel de
      // cliente a un profesional. Bastaba una lectura vacía —la primera visita
      // recién registrado, o una consulta que no devolvió la fila— para que la
      // caché quedara así y CADA entrada siguiente abriera en el panel
      // equivocado. Por eso pasaba "en veces" y no siempre.
      // Una caché sin ficha solo es sospechosa si la cuenta DICE ser profesional
      // (metadatos): ahí la ficha tendría que existir y se espera a confirmar.
      // Para una cuenta de cliente "sin ficha" es lo normal y se pinta de una
      // vez; si no, cada entrada al panel del cliente mostraba el esqueleto.
      const sinFicha = !cached.pro && canOffer(user);
      queueMicrotask(() => {
        setPro(cached.pro as ProData | null);
        setProfile(cached.profile);
        if (sinFicha) {
          // El cargador se queda puesto hasta que la consulta confirme.
          void fetchPro();
          return;
        }
        setLoading(false);
        void fetchPro({ silent: true });
      });
      return;
    }
    queueMicrotask(() => fetchPro());
  }, [user, refreshKey, fetchPro]);

  // Base profile (name/avatar) for the header, works for seekers with no pro row.
  useEffect(() => {
    if (!user) return;
    queueMicrotask(() => fetchProfile());
    window.addEventListener("ccr:profile-updated", fetchProfile);
    window.addEventListener("ccr:identity-updated", fetchProfile);
    return () => {
      window.removeEventListener("ccr:profile-updated", fetchProfile);
      window.removeEventListener("ccr:identity-updated", fetchProfile);
    };
  }, [user, refreshKey, fetchProfile]);

  useEffect(() => {
    const onIdentityUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ fullName?: unknown; cedula?: unknown }>).detail;
      const name = typeof detail?.fullName === "string" ? detail.fullName.trim() : "";
      const cedula = typeof detail?.cedula === "string" ? detail.cedula : null;
      if (!name && !cedula) return;
      const patch = { ...(name ? { full_name: name } : {}), ...(cedula ? { cedula } : {}) };
      setProfile(current => current ? { ...current, ...patch } : current);
      const patchProfessional = (current: ProData | null) => {
        if (!current) return current;
        const owner = Array.isArray(current.profiles) ? current.profiles[0] : current.profiles;
        return { ...current, profiles: { ...(owner ?? {}), ...patch } };
      };
      setPro(patchProfessional);
      const cached = user ? getDashboardCache<DashboardBootstrap>(dashboardBootstrapKey(user.id)) : null;
      if (cached) cacheDashboardBootstrap({
        profile: cached.profile ? { ...cached.profile, ...patch } : cached.profile,
        pro: patchProfessional(cached.pro as ProData | null),
      });
    };
    window.addEventListener("ccr:identity-updated", onIdentityUpdated);
    return () => window.removeEventListener("ccr:identity-updated", onIdentityUpdated);
  }, [cacheDashboardBootstrap, setProfile, setPro, user]);

  useEffect(() => {
    if (!user) return;
    let stopped = false;
    const refreshVerificationState = () => {
      if (stopped || document.hidden) return;
      void fetchPro({ silent: true });
      void fetchProfile();
    };
    const onVisible = () => {
      if (!document.hidden) refreshVerificationState();
    };

    window.addEventListener("focus", refreshVerificationState);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.removeEventListener("focus", refreshVerificationState);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, fetchPro, fetchProfile]);

  // Unread notifications, bucketed by mode (per-mode model): the sidebar Notificaciones
  // badge shows the ACTIVE mode's unread (its own + account-level), and the switch shows
  // the OTHER mode's pending count so the user is aware without switching.
  // La lista sin leer es UNA sola para todo el app: de ella salen el globo del
  // panel y el de Soporte, y también la usa la pantalla de Soporte.
  // El aviso del app, no el del navegador (ver BotonEscribir en Proyectos).
  const avisoDelPanel = useAppDialog();
  const avisosSinLeer = useAvisosSinLeer(user?.id ?? null);
  const conteoDeAvisos = useMemo(() => {
    let pro = 0, cli = 0, neu = 0, soporte = 0;
    for (const aviso of avisosSinLeer) {
      if (aviso.type === "support_reply") soporte++;
      const ctx = notificationContext(aviso.type);
      if (ctx === "professional") pro++;
      else if (ctx === "client") cli++;
      else neu++;
    }
    return { pro, cli, neu, soporte };
  }, [avisosSinLeer]);
  // Todos los avisos de la cuenta, no solo los «de profesional»: con un solo
  // panel, el profesional que publica un proyecto también tiene que enterarse
  // de que le respondieron. Antes ese aviso ni contaba ni salía en la lista.
  const unreadCount = conteoDeAvisos.pro + conteoDeAvisos.cli + conteoDeAvisos.neu;
  const supportUnread = conteoDeAvisos.soporte;

  // Unread opportunities deserve a front-door modal even when the user did not
  // arrive through the explicit post-login redirect.
  // Inconsistent state ONLY: metadata says this account can offer, but no pro row
  // exists yet. A freshly-created pro account can lag (replication/RLS), retry a
  // few times, then send them to finish the professional profile. A genuine seeker
  // (cannot offer) is never bounced; a missing pro row is normal for them.
  useEffect(() => {
    if (authLoading || loading || pro || !user || proLoadError) return;
    if (!canOffer(user)) return;
    if (noProTries < 4) {
      const id = setTimeout(() => fetchPro(), 700);
      return () => clearTimeout(id);
    }
    router.replace("/registro/profesional");
  }, [authLoading, loading, pro, user, router, noProTries, fetchPro, proLoadError]);



  // Una sola forma de estrenar arriba en toda la app: `irAlInicio()`. Aquí
  // había una copia propia que solo repetía el `scrollTo` en dos cuadros, y eso
  // no bastaba contra la inercia de WebKit ni contra el candado del cuerpo.
  const scrollDashboardToPageTop = irAlInicio;

  // CADA SECCIÓN ABRE ARRIBA DEL TODO. El botón del menú ya lo hacía, pero
  // llegar por un enlace (un aviso, la barra de abajo, atrás/adelante) no, y la
  // sección abría a media altura. Va por sección Y por panel: cambiar de
  // cliente a profesional también estrena pantalla.
  // ANTES de pintar, no después: con `useEffect` el navegador alcanzaba a
  // dibujar la sección nueva en la altura de la anterior y el salto se veía.
  // Con `useLayoutEffect` la sección ya nace arriba.
  useLayoutEffect(() => {
    iniciarSeccionArriba();
  }, [activeTab, mode]);

  useEffect(() => {
    // El contenido llega después de la primera pintura: si la página crece, el
    // navegador puede restaurar el desplazamiento anterior.
    const tardio = window.setTimeout(scrollDashboardToPageTop, 160);
    return () => window.clearTimeout(tardio);
  }, [activeTab, mode, scrollDashboardToPageTop]);

  const requestUnsavedAction = useCallback((action: () => void) => {
    if (typeof window === "undefined") {
      action();
      return;
    }
    const event = new CustomEvent("ccr:confirm-unsaved-action", {
      cancelable: true,
      detail: { proceed: action },
    });
    if (window.dispatchEvent(event)) action();
  }, []);

  function clearCompletionFlow() {
    setCompletionFlowField(null);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("contratacr:profile-completion-field");
    }
  }

  const SECTION_RETURN_STORAGE_KEY = "contratacr:dashboard-section-return";

  function rememberSectionReturnTarget() {
    if (typeof window === "undefined") return;
    const target = { tab: activeTab, mode };
    window.sessionStorage.setItem(SECTION_RETURN_STORAGE_KEY, JSON.stringify(target));
  }

  function takeSectionReturnTarget(): { tab: Tab; mode: Mode } | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.sessionStorage.getItem(SECTION_RETURN_STORAGE_KEY);
      window.sessionStorage.removeItem(SECTION_RETURN_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { tab?: string; mode?: string };
      if (!parsed.tab || !ALL_TABS.has(parsed.tab as Tab)) return null;
      return {
        tab: parsed.tab as Tab,
        mode: parsed.mode === "use" ? "use" : "offer",
      };
    } catch {
      window.sessionStorage.removeItem(SECTION_RETURN_STORAGE_KEY);
      return null;
    }
  }

  async function refreshDashboardAfterSave() {
    await Promise.all([
      fetchPro({ silent: true }),
      fetchProfile(),
    ]);
  }

  function setTab(tab: Tab, preserveCompletionFlow = false) {
    if (!isProvider && OFFER_ONLY.has(tab)) {
      setMobilePanelOpen(false);
      setMode("use");
      if(proEnabled)replaceProPath(`${window.location.pathname}?tab=sent_projects&mode=use`);else window.history.replaceState(null, "", `${window.location.pathname}?tab=sent_projects&mode=use`);
      scrollDashboardToPageTop();
      return;
    }
    setMobilePanelOpen(false);
    if (!preserveCompletionFlow) {
      clearCompletionFlow();
      // El foco que dejó el atajo de «te faltan pasos» tiene que morir con él.
      // Si sobrevive, la próxima vez que se entra a Servicios o a Perfil por el
      // menú la sección se monta otra vez con ese foco puesto y vuelve a abrir
      // sola la ventana de editar (o el buscador de oficios), sin que nadie se
      // lo haya pedido.
      setServiceFocus(null);
      setProfileFocus(null);
      if (tab !== activeTab) rememberSectionReturnTarget();
    }
    if (tab === "verificacion") {
      openProfileVerification();
      return;
    }
    if (tab === "profile" && tab === activeTab) {
      setProfileFocus(null);
      setProfileResetKey((key) => key + 1);
      scrollDashboardToPageTop();
      return;
    }
    if (tab === activeTab) return;
    if (OFFER_ONLY.has(tab)) setMode("offer");
    if (USE_ONLY.has(tab)) setMode("use");
    if (tab === "profile") {
      setProfileFocus(null);
      setProfileResetKey((key) => key + 1);
    }
    // Mode is persisted globally now, so the tab alone is enough; a mode-specific tab
    // also re-asserts its mode via the effect above, keeping the navbar switch in sync.
    // Query-only panel navigation should not request the same route again.
    // Next integrates native history with useSearchParams, including Back/Forward.
    // Commit the destination content before updating history or scrolling.
    // Flushing pushState alone does not flush Next's internal transition.
    flushSync(() => setPendingPanelTab({ from: rawRequestedTab, tab }));
    if(proEnabled||tab==='appointments'||activeTab==='appointments')navigatePro(tab);
    else window.history.pushState(null, "", `${window.location.pathname}?tab=${tab}`);
    // Reset to the top of the new section INSTANTLY via the window. A smooth scrollIntoView
    // fought the fixed mobile bottom bar (its backdrop-blur made "Más" flicker / feel covered
    // during the animated scroll); an instant window scroll never interferes with it.
    scrollDashboardToPageTop();
  }

  function openRequestedService(categoryId: string) {
    requestUnsavedAction(() => {
      // This is an internal panel action, not a new route. Commit the section
      // and requested draft together before Next observes the history update.
      flushSync(() => {
        clearCompletionFlow();
        setServiceFocus(null);
        setProfileFocus(null);
        setMobilePanelOpen(false);
        setPendingPanelTab({ from: rawRequestedTab, tab: "services", serviceRequest: categoryId });
      });
      const url = new URL(window.location.href);
      url.searchParams.set("tab", "services");
      url.searchParams.set("mode", "offer");
      url.searchParams.set("serviceRequest", categoryId);
      window.history.pushState(null, "", url.pathname + url.search);
      scrollDashboardToPageTop();
    });
  }

  function openProfileVerification() {
    if (!isProvider) {
      setTab("sent_projects");
      return;
    }
    if (isProvider && mode !== "offer") setMode("offer");
    flushSync(() => setProfileFocus({ field: "verification", key: nextFocusKey() }));
    if(proEnabled)pushProPath(`${window.location.pathname}?tab=profile&mode=offer`);else window.history.pushState(null, "", `${window.location.pathname}?tab=profile&mode=offer`);
    scrollDashboardToPageTop();
  }

  function openCompletionTarget(tab: string, field?: string, { track = true }: { track?: boolean } = {}) {
    if (track) {
      const completionField = field ?? tab;
      setCompletionFlowField(completionField);
      window.sessionStorage.setItem("contratacr:profile-completion-field", completionField);
    }
    if (tab === "verificacion" || field === "verification") {
      openProfileVerification();
      return;
    }
    if (tab === "profile") {
      if (isProvider && mode !== "offer") setMode("offer");
      setMobilePanelOpen(false);
      if (field) flushSync(() => setProfileFocus({ field, key: nextFocusKey() }));
      if(proEnabled)pushProPath(`${window.location.pathname}?tab=profile&mode=offer`);else window.history.pushState(null, "", `${window.location.pathname}?tab=profile&mode=offer`);
      scrollDashboardToPageTop();
      return;
    }
    if (field && tab === "services") {
      flushSync(() => setServiceFocus({ field, key: nextFocusKey() }));
    }
    setTab(tab as Tab, true);
    if (field && tab === "services") {
      return;
    }
    if (field) setProfileFocus({ field, key: nextFocusKey() });
  }

  function hasActiveCompletionFlow() {
    if (completionFlowField) return true;
    if (typeof window === "undefined") return false;
    return !!window.sessionStorage.getItem("contratacr:profile-completion-field");
  }

  function goToCompletionChecklist({ clearFlow = true }: { clearFlow?: boolean } = {}) {
    // Commit the destination and its header together. Clearing the editor
    // first painted the profile overview while Next deferred the history update.
    flushSync(() => {
      setPendingPanelTab({ from: rawRequestedTab, tab: "completion" });
      setMobileProfileSectionTitle(null);
      setProfileFocus(null);
      setServiceFocus(null);
      if (clearFlow) clearCompletionFlow();
      setMode("offer");
    });
    if (typeof window !== "undefined") {
      if(proEnabled)pushProPath(`${window.location.pathname}?tab=completion&mode=offer`);else window.history.pushState(null, "", `${window.location.pathname}?tab=completion&mode=offer`);
    }
    scrollDashboardToPageTop();
  }

  function returnAfterSectionSave() {
    const isMobilePanel = typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;

    if (hasActiveCompletionFlow()) {
      goToCompletionChecklist();
      return;
    }

    if (activeTab === "profile") {
      if (isMobilePanel) {
        setMobileProfileSectionTitle(null);
        setProfileFocus(null);
        setProfileResetKey((key) => key + 1);
        scrollDashboardToPageTop();
      }
      return;
    }

    if (!isMobilePanel) return;

    const target = takeSectionReturnTarget();
    if (target && target.tab !== activeTab) {
      setMode(target.mode);
      setTab(target.tab, true);
      return;
    }

    // Guardar NO es salir: se sigue en la sección. Antes, cada guardado
    // devolvía al inicio del panel, así que ajustar un horario y querer
    // ajustar el siguiente obligaba a volver a entrar. Quien quiera salir usa
    // la flecha. Los dos casos de arriba se mantienen porque ahí sí venías de
    // otro sitio al que hay que devolverte (la lista de tu perfil incompleto o
    // la sección que te trajo).
    scrollDashboardToPageTop();
  }

  function handleSaved(intent: "section" | "internal" = "section") {
    const storedCompletionField = typeof window !== "undefined"
      ? window.sessionStorage.getItem("contratacr:profile-completion-field")
      : null;
    const cameFromCompletion = !!completionFlowField || !!storedCompletionField;

    if (intent === "internal" && !cameFromCompletion) {
      void refreshDashboardAfterSave();
      return;
    }

    if (cameFromCompletion) {
      goToCompletionChecklist({ clearFlow: false });
      void Promise.all([
        fetchPro({ silent: true }),
        fetchProfile(),
      ]).then(([nextPro]) => {
        const latestPro = (nextPro ?? proForCompletion) as ProData | null;
        const proId = latestPro && typeof latestPro.id === "string" ? latestPro.id : "profile";
        let ignoredSteps: string[] = [];

        if (typeof window !== "undefined") {
          try {
            const parsed = JSON.parse(localStorage.getItem(`contratacr_completion_ignored_${proId}`) || "[]");
            ignoredSteps = Array.isArray(parsed) ? parsed.filter((key) => typeof key === "string") : [];
          } catch {
            ignoredSteps = [];
          }
        }

        const ignoredSet = new Set(ignoredSteps);
        const missingSteps = latestPro
          ? computeCompletion(latestPro).items.filter((item) => !item.done && !ignoredSet.has(item.key))
          : [];

        setMobileProfileSectionTitle(null);
        setProfileFocus(null);
        setServiceFocus(null);

        if (missingSteps.length > 0) {
          clearCompletionFlow();
          scrollDashboardToPageTop();
          return;
        }

        clearCompletionFlow();
        setTab("home", true);
      });
      return;
    }

    void refreshDashboardAfterSave().then(returnAfterSectionSave);
  }

  async function updateHeaderAvatar(nextAvatarUrl: string | null) {
    if (!user) return;
    const supabase = createClient();
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ avatar_url: nextAvatarUrl })
      .eq("id", user.id);
    if (profileError) throw profileError;
    await supabase.auth.updateUser({ data: { avatar_url: nextAvatarUrl } });
    setProfile((current) => current ? { ...current, avatar_url: nextAvatarUrl ?? undefined } : current);
    setPro((current) => {
      if (!current) return current;
      const currentProfile = Array.isArray(current.profiles) ? current.profiles[0] : current.profiles;
      return {
        ...current,
        profiles: {
          ...(currentProfile ?? {}),
          avatar_url: nextAvatarUrl,
        },
      };
    });
    cacheDashboardBootstrap({
      profile: profile ? { ...profile, avatar_url: nextAvatarUrl ?? undefined } : profile,
      pro: pro ? {
        ...pro,
        profiles: {
          ...((Array.isArray(pro.profiles) ? pro.profiles[0] : pro.profiles) ?? {}),
          avatar_url: nextAvatarUrl,
        },
      } : pro,
    });
    window.dispatchEvent(new Event("ccr:profile-updated"));
  }

  async function handleHeaderPhotoUpload(file: File) {
    setHeaderPhotoUploading(true);
    setHeaderPhotoMenuOpen(false);
    try {
      const preparedFile = await prepareImageForUpload(file, PROFILE_IMAGE_OPTIONS);
      const fd = new FormData();
      fd.append("file", preparedFile);
      fd.append("type", "avatar");
      const upload = await uploadPhotoFormDataWithRetry(fd);
      if (!upload.ok || !upload.data.url) throw new Error(upload.data.error || "No se pudo subir la foto.");
      const previousAvatarUrl = profile?.avatar_url || proProfile?.avatar_url || null;
      await updateHeaderAvatar(upload.data.url);
      if (previousAvatarUrl !== upload.data.url) {
        await deleteOwnedMediaUrl(previousAvatarUrl).catch(() => false);
      }
      handleSaved("internal");
    } catch (error) {
      console.error("[dashboard] avatar upload failed", error);
      await avisoDelPanel.showMessage({ title: t("fotoTitulo"), description: t("fotoErrorGuardar") });
    } finally {
      setHeaderPhotoUploading(false);
    }
  }

  async function handleHeaderPhotoRemove() {
    setHeaderPhotoUploading(true);
    setHeaderPhotoMenuOpen(false);
    try {
      const previousAvatarUrl = profile?.avatar_url || proProfile?.avatar_url || null;
      await updateHeaderAvatar(null);
      await deleteOwnedMediaUrl(previousAvatarUrl).catch(() => false);
      handleSaved("internal");
    } catch (error) {
      console.error("[dashboard] avatar remove failed", error);
      await avisoDelPanel.showMessage({ title: t("fotoTitulo"), description: t("fotoErrorEliminar") });
    } finally {
      setHeaderPhotoUploading(false);
    }
  }


  // Una sola barra superior: dentro de una sección, la barra de la app muestra
  // "← Título" en vez del logo. El panel publica el título y atiende el atrás;
  // si la barra no confirma (ack), la cabecera propia sigue apareciendo.
  // El menú del panel también tiene nombre. Sin él la barra caía al rótulo
  // suelto «ContrataCR», que dice dónde estás tanto como no decir nada: la
  // misma barra que en Proyectos, Empleos o Notificaciones lleva el nombre de
  // la sección al lado de la marca, y aquí se quedaba sin él.
  const mobileSectionHeaderTitle = activeTab === "home"
    ? (proEnabled ? simpleCopy("day") : t("panelHeading"))
    : (supportThreadTitle ?? mobileProfileSectionTitle ?? (activeTab === "services" ? t("servicesHeading") : panelTabLabel(activeTab)));
  const sectionBackRef = useRef<(() => void) | null>(null);
  // EL GESTO DE VOLVER (deslizar en iOS, el botón físico de Android, el atrás
  // del navegador) usa el HISTORIAL, que no sabe nada de los pasos que se abren
  // DENTRO de una pestaña. Desde «Datos básicos» el gesto saltaba dos pantallas
  // —hasta el menú del panel— en vez de volver al menú de Mi perfil, que es lo
  // que hace la flecha de la barra. Mientras hay un paso interno abierto se deja
  // una entrada centinela en el historial: el gesto la consume y aquí se cierra
  // ese paso, igual que la flecha. Solo en teléfono: de 640px en adelante las
  // secciones son un acordeón y no son un paso de navegación.
  const pasoInternoAbierto =
    (activeTab === "profile" && !!mobileProfileSectionTitle)
    || (activeTab === "soporte" && !!supportThreadTitle)
    || ((activeTab === "cv" || activeTab === "carta") && cvEditorAbierto);
  useEffect(() => {
    if (!pasoInternoAbierto) return;
    if (!window.matchMedia("(max-width: 639px)").matches) return;
    const centinela = { ...(window.history.state ?? {}), ccrPasoInterno: true };
    if (!window.history.state?.ccrPasoInterno) window.history.pushState(centinela, "", window.location.href);
    const cierre = activeTab === "soporte" ? "ccr:support-close-thread" : activeTab === "cv" || activeTab === "carta" ? CERRAR_EDITOR_CV : "ccr:profile-mobile-close-section";
    function alVolver() {
      // El aviso de cambios sin guardar atiende este mismo gesto con su propio
      // centinela: cuando está puesto, manda él y aquí no se cierra nada.
      if (window.history.state?.ccrUnsavedGuard) return;
      // Ni cuando ese aviso está RETIRANDO su centinela porque ya no hay
      // cambios: es limpieza del historial, no alguien queriendo volver.
      if ((window as unknown as { __ccrRetirandoCentinela?: boolean }).__ccrRetirandoCentinela) return;
      window.dispatchEvent(new Event(cierre));
    }
    window.addEventListener("popstate", alVolver);
    return () => {
      window.removeEventListener("popstate", alVolver);
      // El paso se cerró por la flecha y seguimos sobre el centinela: se retira
      // para que el historial no quede con una entrada de más.
      if (window.history.state?.ccrPasoInterno) window.history.back();
    };
  }, [pasoInternoAbierto, activeTab]);
  const navbarHeader = useSyncExternalStore(subscribeNavbarHeader, acknowledgedNavbarHeader, emptyExternalSnapshot);
  const navbarOwnsHeader = navbarHeader !== null && navbarHeader === mobileSectionHeaderTitle;
  useLayoutEffect(() => {
    const onBack = () => sectionBackRef.current?.();
    window.addEventListener("ccr:section-back", onBack);
    return () => {
      window.removeEventListener("ccr:section-back", onBack);
    };
  }, []);
  // De capa: la barra cambia en el mismo cuadro que la sección.
  useLayoutEffect(() => {
    // `root` distingue la RAÍZ del panel de una sección abierta: en la raíz la
    // barra lleva el menú y la marca (no hay a dónde volver), dentro de una
    // sección lleva la flecha.
    // `paso` = un paso DENTRO de una sección (un formulario, una conversación):
    // la barra lleva solo la flecha y el título, como Publicar empleo. La
    // campana ahí sobra —nadie revisa avisos a medio formulario— y dejaba a
    // «Contactar soporte» distinta de las demás pantallas de formulario.
    const publicar = (title: string | null, root = false, paso = false) => {
      const global = window as unknown as { __ccrSectionHeader?: string | null; __ccrSectionRoot?: boolean; __ccrSectionPaso?: boolean; __ccrSectionAck?: boolean };
      global.__ccrSectionAck = false;
      global.__ccrSectionHeader = title;
      global.__ccrSectionRoot = root;
      global.__ccrSectionPaso = paso;
      window.dispatchEvent(new CustomEvent("ccr:section-header", { detail: title ? { title, root, paso } : null }));
    };
    publicar(mobileSectionHeaderTitle, activeTab === "home", pasoInternoAbierto || activeTab.startsWith("pro_") || activeTab === "appointments");
    return () => publicar(null);
  }, [activeTab, mobileSectionHeaderTitle, pasoInternoAbierto]);

  // Never render the client dashboard as a temporary fallback for an account
  // marked as a provider whose professional row is still missing. Keep the
  // route behind the loading guard while fetchPro retries, then the effect
  // below sends the account straight to professional registration.
  const professionalRecordResolving = !!user && canOffer(user) && !pro && !proLoadError;
  if (isSigningOut()) return null;
  if (authLoading || loading || !user || professionalRecordResolving) {
    return <>{formularioPublicar}{/* La forma sale solo de la URL: la preferencia del teléfono no existe
        en el servidor y romper la hidratación rehacía toda la página. */}
      {requestedTab === "soporte" && searchParams.get("ticket") ? <SupportThreadSkeleton fullPage /> : <PanelSkeleton seccion={allowedRequestedTab !== null && allowedRequestedTab !== "home"} />}</>;
  }

  const proProfile = Array.isArray(pro?.profiles) ? pro?.profiles[0] : pro?.profiles;
  const currentCedula = typeof profile?.cedula === "string" && profile.cedula.trim()
    ? profile.cedula.trim()
    : typeof proProfile?.cedula === "string" && proProfile.cedula.trim()
      ? proProfile.cedula.trim()
      : typeof user.user_metadata?.cedula === "string"
        ? user.user_metadata.cedula.trim()
        : null;
  const businessName = typeof pro?.business_name === "string" ? pro.business_name.trim() : "";
  const personalDisplayName =
    profile?.full_name ||
    proProfile?.full_name ||
    (user.user_metadata?.full_name as string) ||
    user.email?.split("@")[0] ||
    "";
  const professionalDisplayName = businessName || personalDisplayName;
  const displayName = mode === "offer" ? professionalDisplayName : personalDisplayName;
  const compactHeaderName = mode === "offer" ? getProfessionalDisplayName(personalDisplayName, businessName).primaryDesktop : formatPersonDisplayName(personalDisplayName);
  // The panel and public profile share naming, wrapping and avatar dimensions.
  const mobileHeaderName = mode === "offer"
    ? getProfessionalDisplayName(personalDisplayName, businessName).primaryMobile
    : formatPersonDisplayName(personalDisplayName, "mobile");
  const headerAvatar = profile?.avatar_url || proProfile?.avatar_url || null;
  const proForCompletion = pro && headerAvatar && !proProfile?.avatar_url
    ? { ...pro, profiles: { ...(proProfile ?? {}), avatar_url: headerAvatar } }
    : pro;
  const proForEditor = pro
    ? {
        ...pro,
        profiles: {
          ...(proProfile ?? {}),
          full_name:
            proProfile?.full_name ||
            profile?.full_name ||
            (user.user_metadata?.full_name as string) ||
            user.email?.split("@")[0] ||
            "",
          email: proProfile?.email || user.email || "",
          cedula: proProfile?.cedula || currentCedula || null,
          avatar_url: proProfile?.avatar_url || headerAvatar || null,
        },
      }
    : pro;
  const publicProfileHref = mode === "offer" && typeof pro?.slug === "string" && pro.slug.trim()
    ? `/profesionales/${pro.slug.trim()}`
    : null;
  // Client (use mode) identity: verified via cédula (saved at solicitud/booking or before).
  // Drives the identity check beside the account name.
  const clientVerified =
    profile?.client_identity_status === "verified" &&
    !!profile?.cedula &&
    isValidId(String(profile.cedula));

  // Offer mode without a pro row: a genuine seeker sees the activation gate only
  // after the professional lookup finished; until then the panel shell stays visible.
  const showOfferGate = !loading && mode === "offer" && !pro && !canOffer(user);

  // Keep the primary dashboard navigation focused. Shared surfaces like chat,
  // notifications and support stay routable from the navbar or direct links
  // instead of competing with the core panel tasks.
  const modeTabs = mode === "offer" ? OFFER_TABS : USE_TABS;
  const proCoreTabs:Tab[]=["home","pro_agenda"];
  // Keep the existing publication order and place tools immediately before profile.
  const proRemainingTabs=modeTabs.filter(tab=>!["quotes","statistics","photos","services"].includes(tab)&&!proCoreTabs.includes(tab));
  const businessTabs:Tab[] = proFocused?[...proCoreTabs,...proRemainingTabs.flatMap(tab=>tab==="profile"?["pro_tools" as Tab,tab]:[tab])]:modeTabs;
  const sidebarTabs:Tab[] = LOCAL_APPOINTMENT_TABS.length&&!proFocused?[...businessTabs.slice(0,1),'appointments',...businessTabs.slice(1)]:businessTabs;
  // Guías también en escritorio. Estaba fuera de la columna y no había ningún
  // otro sitio donde entrar: en computadora la sección solo se alcanzaba
  // escribiendo ?tab=guides a mano. Va en el bloque de cuenta, junto a Perfil y
  // Soporte, igual que en el teléfono.
  // Guías ya no es una fila del menú: es una ventana que se abre desde la
  // cabecera del panel —la misma en teléfono y en computadora— y deja la
  // sección donde estabas atrás, intacta. Es material de consulta: se lee, se
  // toca «Ir a…» y se sigue trabajando.
  const ventanaGuias = guiasAbiertas ? (
    <Modal
      open
      onClose={cerrarGuias}
      title={panelTabLabel("guides")}
      subtitle={t("subtitles.guides")}
      size="lg"
      // Flecha, como las demás secciones del panel en el teléfono.
      backLabel={pc("back")}
      bodyClassName="px-5 py-5 sm:px-6"
    >
      <GuidesBody
        isProvider={isProvider}
        onClose={cerrarGuias}
        onGo={(guide) => {
          requestUnsavedAction(() => {
            if (!isProvider && guide.section === "professional") {
              router.push("/registro/profesional");
              return;
            }
            if (guide.href) {
              router.push(guide.href);
              return;
            }
            if (guide.targetMode) setMode(guide.targetMode);
            if (guide.targetField) {
              clearCompletionFlow();
              openCompletionTarget(guide.actionTab ?? "profile", guide.targetField, { track: false });
            } else setTab(guide.actionTab ?? "home");
          });
        }}
      />
    </Modal>
  ) : null;
  const desktopSidebarTabs = sidebarTabs.filter((tab) => tab !== "guides");
  // En el teléfono Guías vuelve a la lista de opciones, al final, junto a
  // Soporte: arriba, como texto bajo el nombre, no se encontraba. En computadora
  // sigue en el renglón del nombre.
  const mobileSectionTabs: Tab[] = [...sidebarTabs.filter((tab) => tab !== "guides" && tab !== "home"), "guides"];
  const mobileFullScreenTab = activeTab !== "home";
  const mobileSectionOpen = activeTab !== "home" || mobilePanelOpen;
  const singleSurfaceTab = activeTab === "profile";
  // Editores del panel: mismo lenguaje que "Publicar oferta" (gris + tarjeta).
  const editorSurfaceTab = activeTab === "verificacion" || activeTab === "cuenta";
  const profileCompletionPercent = proForCompletion ? computeCompletion(proForCompletion).percent : null;
  const showProfileCompletion =
    mode === "offer" &&
    !!proForCompletion &&
    ((profileCompletionPercent ?? 0) < 100 || proForCompletion.verification_status !== "verified");

  function panelTabLabel(tab: Tab) {
    const labels:Partial<Record<Tab,string>>={home:"day",pro_agenda:"work",pro_tools:"tools",pro_inventory:"catalog",quotes:"quotes",pro_billing:"advanced",pro_payments:"payments"};
    // Tool titles stay stable while access loads; this grants no feature access.
    if(labels[tab]&&(proEnabled||tab.startsWith("pro_")))return simpleCopy(labels[tab]);
    return PANEL_TAB_LABELS[tab]?.[idiomaDe(locale)] ?? t(`tabs.${tab}`);
  }

  function openPanelDestination(tab: Tab) {
    if(tab==="pro_tools"&&proEnabled){pushProPath(prefijoDeIdioma(locale)+"/dashboard/pro");return;}
    if(tab===activeTab)return;
    setTab(tab);
  }

  // «Herramientas» sigue marcada mientras se está dentro de una de sus tres pantallas.
  const tabActiva = (tab: Tab) => activeTab === tab || (tab === "tools" && (activeTab === "quotes" || activeTab === "cv" || activeTab === "carta"));

  function desktopSidebarButton(tab: Tab) {
    const badge = tab === "notifications" ? unreadCount : tab === "soporte" ? supportUnread : tab === "chat" ? chatUnread : 0;
    const label = tab==="pro_tools"&&proEnabled?"ContrataCR Pro":panelTabLabel(tab);
    return (
      <button
        key={tab}
        type="button"
        data-testid={`panel-tab-${tab}`}
        onClick={() => {
          requestUnsavedAction(() => openPanelDestination(tab));
        }}
        className={cn(
          "relative flex min-h-[54px] w-full items-center gap-3 px-5 py-3 text-left text-[14px] font-semibold transition-colors",
          tabActiva(tab)
            ? "bg-[#f6fbfe] text-[#009FD9]"
            : "text-[#162543] hover:bg-[#f8fbfd] hover:text-[#009FD9]"
        )}
      >
        <span className={cn(
          "relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors [&>svg]:h-4.5 [&>svg]:w-4.5",
          tabActiva(tab) ? "bg-[#EBF5FB] text-[#009FD9]" : "text-[#64748b]",
        )}>
          {TAB_ICONS[tab]}
          {badge > 0 && (
            <span className="absolute -right-2 -top-2 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-[#009FD9] px-1 text-center text-[9px] font-bold leading-none text-white ring-2 ring-white">
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </button>
    );
  }

  function desktopPanelNav() {
    return (
      <aside className="hidden lg:block lg:w-[260px] lg:shrink-0">
        <div className="sticky top-[6.5rem]">
          <div className="overflow-hidden rounded-[22px] border border-[#e5e7eb] bg-white shadow-[0_12px_34px_-28px_rgba(15,23,42,0.55)]">
            <div className="flex flex-col">
              <nav className="flex flex-col divide-y divide-[#eef2f6]">
                {(proFocused?[desktopSidebarTabs.slice(0,5),desktopSidebarTabs.slice(5)]:agruparPestanas(desktopSidebarTabs)).map((grupo, i) => (
                  <div key={grupo[0] ?? i} className="flex flex-col divide-y divide-[#eef2f6]">
                    {grupo.map(desktopSidebarButton)}
                  </div>
                ))}
              </nav>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  // Una cuenta que solo contrata no tiene por qué buscar dónde se activa el
  // perfil profesional: la puerta va afuera, arriba del menú, no escondida
  // dentro de Guías. Es lo único que esta cuenta todavía no puede hacer.
  /**
   * La puerta a «Ofrecer mis servicios» desde el panel, SOLO en teléfono y
   * tableta. En computadora NO va: ahí la barra de arriba la tiene siempre a la
   * vista, también dentro del panel, así que ponerla otra vez era decir lo
   * mismo dos veces en la misma pantalla. Debajo de 1024 px la barra la guarda
   * en el menú hamburguesa, y entonces esta fila es la única puerta visible.
   */
  function ofrecerServiciosCard() {
    if (esProfesional) return null;
    return (
      <Link
        href="/registro/profesional"
        data-testid="panel-ofrecer-servicios"
        className="flex min-h-[60px] w-full items-center gap-3 rounded-2xl bg-[#009FD9] px-4 py-3.5 text-left text-[15px] font-bold text-white transition-colors hover:bg-[#008fc3]"
      >
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 [&>svg]:h-5 [&>svg]:w-5">
          <BriefcaseBusiness />
        </span>
        {/* Siempre el mismo rótulo, esté el registro empezado o no: es la misma
            puerta y cambiarle el nombre la hacía parecer otra cosa. Lo que
            queda a medias se retoma donde quedó, sin anunciarlo. */}
        <span className="min-w-0 flex-1 leading-tight">{pc("offerServices")}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-white/80" />
      </Link>
    );
  }

  function mobileSectionButton(tab: Tab) {
    const label = tab==="pro_tools"&&proEnabled?"ContrataCR Pro":panelTabLabel(tab);
    return (
      <button
        key={tab}
        type="button"
        data-testid={`panel-tab-${tab}`}
        onClick={() => {
          if (tab === "home") {
            setMobilePanelOpen(true);
            scrollDashboardToPageTop();
            return;
          }
          if (tab === "guides") { setGuiasAbiertas(true); return; }
          requestUnsavedAction(() => openPanelDestination(tab));
        }}
        className="flex min-h-[60px] w-full items-center gap-3 rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3.5 text-left text-[15px] font-semibold text-[#162543] transition-colors hover:bg-[#f8fbfd]"
      >
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#52627a] [&>svg]:h-5 [&>svg]:w-5">
          {TAB_ICONS[tab]}
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-[#b6c4d4]" />
      </button>
    );
  }

  function identityBadge() {
    if (clientVerified || pro?.verification_status === "verified") {
      return (
        <VerificationInfo audience={mode === "use" ? "client" : "professional"} />
      );
    }
    // The header badge is a positive trust signal only. Pending, rejected and
    // unverified states belong in the verification section, where there is room
    // to explain the next step without shortening the account name.
    return null;
  }

  return (
    // El lienzo de la página lleva el MISMO color que la sección: donde la
    // sección termina (una lista corta, un vacío, un hilo de soporte) seguía el
    // fondo de la página y se veía una franja blanca entre el contenido y el
    // pie —o entre el contenido y la barra de abajo, en la app—. Ahora no hay
    // costura: el color es uno solo hasta el final de la pantalla.
    <div className={cn(
      "ccr-dashboard-shell min-h-screen flex flex-col bg-white lg:bg-white",
      // El mismo color que la sección en CADA ancho: si la sección es blanca en
      // el teléfono y el fondo gris, donde la sección termina aparecía la
      // costura. (En la app manda el CSS, que pinta los dos de #f4f7fa.)
      mobileSectionOpen && "bg-white lg:bg-white",
      mobileFullScreenTab && "bg-white lg:bg-white",
    )}>
      <Navbar mobileSearch={false} />
      {formularioPublicar}
      <main className={cn(
        "ccr-dashboard-main flex-1 min-h-[calc(100svh-88px)] bg-white lg:bg-white",
        // Con una sección abierta, el lienzo es el GRIS de la sección en todo
        // ancho menor de 1024px. Antes en teléfono era blanco (de cuando las
        // secciones llenaban la pantalla en blanco): ahora las secciones van en
        // tarjetas sobre gris, la sección termina antes que la pantalla y ese
        // blanco quedaba como un bloque suelto entre el gris y el pie.
        mobileSectionOpen && "bg-white lg:bg-white",
        mobileFullScreenTab && "bg-white lg:bg-white",
      )}>
        <div className={cn(
          "dashboard-panel-content mx-auto max-w-7xl px-4 pb-6 pt-6 sm:px-6 lg:px-8 lg:pb-8 lg:pt-8",
          mobileSectionOpen && "px-0 pt-0 sm:px-0 lg:px-8 lg:pt-8",
          mobileFullScreenTab && "max-w-none px-0 pb-0 pt-0 sm:px-0 lg:max-w-7xl lg:px-8 lg:pb-8 lg:pt-8",
        )}>
          {/* Header card - identity and status grouped in one surface on desktop.
              Its right edge must land where the row below ends. When the content
              column is capped at 54rem, that row measures 260px (nav) + 1.25rem
              (gap-5) + 54rem = 71.5rem; on chat/home nothing caps it, so the card
              keeps the full width. */}
          <div data-dashboard-identity-card className={cn(
            "mx-auto mb-6 w-full",
            "max-w-[79.5rem]",
            // Topada al ancho de la fila Y pegada a su izquierda: centrada,
            // el sobrante del contenedor la corría 36px a la derecha del nav.
            activeTab !== "chat" && activeTab !== "home" && "lg:ml-0 lg:mr-auto lg:max-w-[71.5rem]",
            mobileSectionOpen ? "hidden lg:block" : "block",
          )}>
            <div className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-5 shadow-sm sm:px-6 sm:py-5">
            {/* Las columnas van en `style` y no en una clase nueva de Tailwind: en
                desarrollo la clase recién escrita llega a la pantalla antes que
                su CSS, y una rejilla sin columnas reparte tres iguales —el
                nombre quedaba en el centro de la tarjeta—. En el teléfono el
                contenedor es flex y esta plantilla no aplica. */}
            <div style={{ gridTemplateColumns: "auto minmax(0, 1fr)" }} className="flex min-w-0 flex-col flex-wrap items-start gap-x-2 gap-y-3 text-left min-[360px]:flex-row min-[360px]:items-center min-[360px]:gap-x-3 sm:grid sm:items-center sm:gap-5">
              <div ref={headerPhotoMenuRef} className={`relative shrink-0 sm:self-center ${profileIdentityAvatarClass}`}>
                <button
                  type="button"
                  onClick={() => setHeaderPhotoMenuOpen((open) => !open)}
                  disabled={headerPhotoUploading}
                  className={`relative block rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-[#009FD9] focus-visible:ring-offset-2 disabled:opacity-70 ${profileIdentityAvatarClass}`}
                  data-profile-identity-avatar
                  aria-label={pc("photoOptions")}
                >
                  <Avatar className={`bg-transparent ${profileIdentityAvatarClass}`}>
                    <AvatarImage src={headerAvatar ?? undefined} />
                    <AvatarFallback className="bg-[#EBF5FB] text-lg font-bold text-[#009FD9]">
                      {getInitials(compactHeaderName || displayName || "?")}
                    </AvatarFallback>
                  </Avatar>
                  {mode === "offer" && (
                    <span className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#009FD9] text-white shadow-sm">
                      {headerPhotoUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" strokeWidth={2.4} />}
                    </span>
                  )}
                </button>
                {headerPhotoMenuOpen && (
                  <div className="absolute left-0 top-[calc(100%+0.5rem)] z-40 w-56 overflow-hidden rounded-xl border border-[#dbe7ef] bg-white py-1 shadow-xl">
                    {headerAvatar && (
                      <button type="button" onClick={() => { setHeaderPhotoMenuOpen(false); setHeaderPhotoPreviewOpen(true); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-[#162543] transition-colors hover:bg-[#f8fafc]">
                        <Eye className="h-4 w-4 text-[#009FD9]" />
                        {pc("viewPhoto")}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setHeaderPhotoMenuOpen(false); headerPhotoInputRef.current?.click(); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-[#162543] transition-colors hover:bg-[#f8fafc]"
                    >
                      <Camera className="h-4 w-4 text-[#009FD9]" />
                      {headerAvatar ? pc("changePhoto") : pc("addPhoto")}
                    </button>
                    {headerAvatar && (
                      <button
                        type="button"
                        onClick={() => void handleHeaderPhotoRemove()}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        {pc("removePhoto")}
                      </button>
                    )}
                  </div>
                )}
                <AvatarFileInput ref={headerPhotoInputRef} className="hidden" onFile={handleHeaderPhotoUpload} />
                {publicProfileHref && (
                  <ShareKit
                    key={shareKitInitialView}
                    open={shareKitTab === activeTab}
                    onClose={() => setShareKitTab(null)}
                    initialView={shareKitInitialView}
                    profileUrl={enlacePerfil(pro?.slug ?? "")}
                    name={getProfessionalDisplayName(personalDisplayName, businessName).primaryDesktop}
                    services={((pro?.professions && pro.professions.length > 0) ? pro.professions : (pro?.category_id ? [pro.category_id] : [])).map((id: string) => getCategoryLabel(id, locale)).filter(Boolean)}
                    avatarUrl={headerAvatar}
                    isVerified={pro?.verification_status === "verified"}
                    ratingAvg={Number(pro?.rating_avg ?? 0)}
                    reviewCount={Number(pro?.review_count ?? 0)}
                  />
                )}
                <ImagePreviewDialog
                  src={headerAvatar}
                  alt={pc("profilePhoto")}
                  closeLabel={pc("close")}
                  open={headerPhotoPreviewOpen}
                  onOpenChange={setHeaderPhotoPreviewOpen}
                />
              </div>
              <div className="flex w-full min-w-0 flex-1 flex-col items-start gap-1.5 text-left min-[360px]:w-auto sm:block sm:w-auto sm:flex-none sm:self-center sm:py-0">
                <div className="flex min-w-0 max-w-full items-center gap-0 sm:hidden">
                  <ProfileIdentityName name={mobileHeaderName || displayName} title={displayName} testId="dashboard-identity-name" badge={identityBadge()} />
                </div>
                <div className="hidden min-w-0 max-w-full flex-nowrap items-center gap-0 sm:flex">
                  <ProfileIdentityName name={compactHeaderName} title={displayName} className="flex-1" badge={identityBadge()} />
                  {/* Ver perfil, Compartir y Guías cierran el renglón del nombre,
                      los tres iguales: texto gris que se pinta de celeste al
                      pasar, sin ícono y sin caja. Antes Guías era texto y los
                      otros dos, píldoras con borde en otra columna: tres cosas
                      del mismo rango con dos lenguajes distintos, y las píldoras
                      pesaban más que el nombre de la cuenta. */}
                  <div className="ml-auto flex shrink-0 items-center gap-5 pl-4">
                    {publicProfileHref && (
                      <Link
                        href={`${publicProfileHref}?from=${encodeURIComponent("/dashboard/profesional")}`}
                        onClick={openInNewTabOnDesktop}
                        aria-label={pc("viewPublicProfile")}
                        data-testid="panel-ver-perfil"
                        className={ENLACE_DE_CABECERA}
                      >
                        <ExternalLink className={ICONO_DE_CABECERA} />
                        {pc("viewProfile")}
                      </Link>
                    )}
                    {publicProfileHref && (
                      <button type="button" data-testid="panel-compartir-perfil" onClick={() => setShareKitTab(activeTab)} className={ENLACE_DE_CABECERA}>
                        <Share2 className={ICONO_DE_CABECERA} />
                        {pc("share")}
                      </button>
                    )}
                    <button
                      type="button"
                      data-testid="panel-abrir-guias"
                      onClick={() => setGuiasAbiertas(true)}
                      className={ENLACE_DE_CABECERA}
                    >
                      <BookOpen className={ICONO_DE_CABECERA} />
                      {panelTabLabel("guides")}
                    </button>
                  </div>
                </div>
                <div data-testid="dashboard-identity-actions" className={cn("flex items-start justify-start gap-3 sm:mt-3 sm:min-h-[22px]", !(mode === "offer" && (pro?.review_count ?? 0) > 0 && publicProfileHref) && "hidden")}>
                  {/* Las reseñas, que es la prueba social que mira un cliente. Los
                      seguidores se retiraron de la app: guardar ya cubre "lo quiero
                      a mano" y dos conceptos para lo mismo confundían. */}
                  {/* Solo en modo profesional: la calificación es la prueba social
                      que un cliente mira, y solo cuando ya hay reseñas. En modo
                      cliente no hay nada que medir —sus reseñas no existen—, así
                      que bajo el nombre no va nada en vez de un "aún sin reseñas"
                      que suena a reproche por algo que no le toca hacer. */}
                  {mode === "offer" && (pro?.review_count ?? 0) > 0 && publicProfileHref && (
                    <Link
                      href={`${publicProfileHref}?tab=resenas&from=${encodeURIComponent("/dashboard/profesional")}`}
                      onClick={openInNewTabOnDesktop}
                      className="inline-flex items-baseline gap-1.5 text-[13px] font-semibold leading-none text-[#526277] transition hover:text-[#009FD9]"
                    >
                      <Star className="h-4 w-4 shrink-0 translate-y-0.5 fill-[#ff9b32] text-[#ff9b32]" />
                      <strong className="text-[14px] leading-none text-[#162543]">{Number(pro?.rating_avg ?? 0).toFixed(1)}</strong>
                      <span className="whitespace-nowrap">{t("headerReviews", { count: pro?.review_count ?? 0 })}</span>
                    </Link>
                  )}
                </div>
              </div>
              {publicProfileHref && (
                <div className="mt-1 grid w-full grid-cols-2 gap-2 sm:hidden">
                  <Link
                    href={`${publicProfileHref}?from=${encodeURIComponent("/dashboard/profesional")}`}
                    onClick={openInNewTabOnDesktop}
                    aria-label={pc("viewPublicProfile")}
                    data-testid="dashboard-mobile-view-profile"
                    className="inline-flex h-11 w-full items-center justify-center rounded-full border border-[#d7e1ea] bg-white text-[13px] font-bold text-[#162543] transition active:bg-[#f6f9fb]"
                  >
                    {pc("viewProfile")}
                  </Link>
                  <button
                    type="button"
                    data-testid="dashboard-mobile-share-profile"
                    onClick={() => setShareKitTab(activeTab)}
                    className="inline-flex h-11 !min-h-0 w-full items-center justify-center rounded-full border border-[#d7e1ea] bg-white text-[13px] font-bold text-[#162543] transition active:bg-[#f6f9fb]"
                  >
                    {pc("share")}
                  </button>
                </div>
              )}
              {showProfileCompletion && proForCompletion && (
                // De borde a borde de la rejilla, tenga las columnas que tenga.
                <div style={{ gridColumn: "1 / -1" }} className="w-full">
                  <ProfileCompletion
                    pro={proForCompletion}
                    variant="header"
                    onViewSteps={() => setTab("completion", true)}
                    onGo={(tab, field) => requestUnsavedAction(() => openCompletionTarget(tab, field))}
                  />
                </div>
              )}
              {/* Launch without Pro (2026-11-18): «Mi negocio» for accounts that manage a claimed place. */}
              <div style={{ gridColumn: "1 / -1" }} className="w-full empty:hidden"><BusinessDashboardEntry locale={locale} /></div>
            </div>
            </div>
          </div>

          {ventanaGuias}
          {/* Offer mode, provider row still loading: spinner (avoids gate flash). */}
          {proLoadError ? (
            <Card>
              <CardContent className="px-6 py-12 flex flex-col items-center text-center">
                <div className="ccr-caja-icono mb-4 flex h-14 w-14 items-center justify-center rounded-2xl">
                  <AlertCircle className="h-7 w-7" />
                </div>
                <h2 className="text-xl font-bold text-[#162543] mb-2">
                  {pc("panelLoadFailed")}
                </h2>
                <p className="text-sm text-[#6b7280] max-w-md mb-6 leading-relaxed">
                  {pc("panelLoadHint")}
                </p>
                <Button onClick={() => fetchPro()}>
                  {pc("tryAgain")}
                </Button>
              </CardContent>
            </Card>
          ) : /* Offer mode, not yet a provider: activation gate. */
          showOfferGate ? (
            <Card>
              <CardContent className="px-6 py-12 flex flex-col items-center text-center">
                <BrandIconBadge icon={Sparkles} size={64} className="mb-5" />
                <h2 className="text-xl font-bold text-[#162543] mb-2">{t("offerGateTitle")}</h2>
                <p className="text-sm text-[#6b7280] max-w-md mb-6 leading-relaxed">{t("offerGateBody")}</p>
                <Button onClick={() => router.push("/registro/profesional")}>
                  {t("offerGateCta")} <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {activeTab !== "home" && (
                <>
                <div ref={cabeceraRef as React.RefObject<HTMLDivElement>} style={COLUMNAS_CABECERA} className={cn(
                  "ccr-cabecera-pegada sticky top-0 z-20 grid min-h-16 items-center border-b bg-white px-4 py-2 text-[#162543] transition-colors duration-200 lg:hidden",
                  conLinea ? "border-[#e5e7eb]" : "border-transparent",
                  navbarOwnsHeader && "hidden",
                )}>
                  <button
                    type="button"
                    onClick={() => {
                      requestUnsavedAction(() => {
                        const chatReturn = chatReturnRef.current;
                        if (chatReturn) {
                          chatReturnRef.current = null;
                          router.push(chatReturn);
                          return;
                        }
                        if (hasActiveCompletionFlow()) {
                          goToCompletionChecklist();
                          return;
                        }
                        if (activeTab === "profile" && mobileProfileSectionTitle) {
                          window.dispatchEvent(new Event("ccr:profile-mobile-close-section"));
                          return;
                        }
                        if (activeTab === "soporte" && supportThreadTitle) {
                          window.dispatchEvent(new Event("ccr:support-close-thread"));
                          return;
                        }
                        if((activeTab==='appointments'&&LOCAL_APPOINTMENT_TABS.length||proEnabled&&["pro_agenda","pro_clients","pro_inventory","pro_billing","pro_payments","pro_expenses","pro_tools","quotes","statistics","services","photos"].includes(activeTab))&&backPro())return;
                        const volverA = externalReturnTo ?? returnToRef.current;
                        if (volverA && (activeTab === "offers" || activeTab === "jobs" || activeTab === "sent_projects" || volverA.startsWith("/mensajes") || volverA === "/notificaciones")) {
                          router.push(volverA);
                          return;
                        }
                        if ((activeTab === "cv" || activeTab === "carta") && cvEditorAbierto) {
                          window.dispatchEvent(new Event(CERRAR_EDITOR_CV));
                          return;
                        }
                        if (activeTab === "quotes" || activeTab === "cv" || activeTab === "carta") {
                          setTab("tools");
                          return;
                        }
                        setTab("home");
                      });
                    }}
                    ref={(node) => {
                      sectionBackRef.current = node ? () => node.click() : null;
                    }}
                    data-native-back="dashboard-section"
                    aria-label={t("backToPanel")}
                    className={cn(CABECERA_BOTON, "justify-self-start")}
                  >
                    <ArrowLeft className={CABECERA_GLIFO} />
                  </button>
                  {supportThreadTitle ? (
                    <h2 className={cn(CABECERA_TITULO, "flex items-baseline justify-center gap-1.5 px-1 text-center")}>
                      <span className="min-w-0 truncate">{supportThreadTitle}</span>
                      {supportThreadRef && <span className="shrink-0 text-[11px] font-semibold text-[#6b7280]">#{supportThreadRef}</span>}
                    </h2>
                  ) : (
                    <h2 className={cn(CABECERA_TITULO, "px-2 text-center")}>{mobileProfileSectionTitle ?? (activeTab === "services" ? t("servicesHeading") : panelTabLabel(activeTab))}</h2>
                  )}
                  <div data-pro-section-actions-slot className="flex shrink-0 justify-self-end" />
                </div>
                </>
              )}

              {/* La fila se ESTIRA: una sección corta (un vacío) quedaba más baja
                  que el menú de la izquierda. El menú no cambia —su tarjeta va
                  dentro de un contenedor pegajoso—; la sección llega al menos a
                  su altura. */}
              {/* Una suspensión no se avisa por correo: se avisa acá, que es donde
                  el profesional se entera cuando importa (requirePro lo manda acá
                  al bloquearle Pro) y tiene el botón de reclamo al lado. Va FUERA
                  de la tarjeta de la sección: en Inicio esa tarjeta es `lg:hidden`
                  y en escritorio el aviso no se veía. */}
              {pro?.is_banned === true && (() => {
                const copy = suspensionNoticeCopy(locale, pro.banned_reason);
                return (
                  <div role="alert" data-pro-suspended-notice className="mx-4 mb-4 mt-4 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 lg:mx-0 lg:mt-0">
                    <p className="text-sm font-bold text-[#991b1b]">{copy.title}</p>
                    <p className="mt-1 text-sm text-[#7f1d1d]">{copy.body}</p>
                    <button
                      type="button"
                      onClick={() => router.push(`${prefijoDeIdioma(locale)}/dashboard/profesional?tab=soporte`)}
                      className="mt-2 inline-flex h-9 items-center rounded-lg bg-[#b91c1c] px-3 text-xs font-bold text-white hover:bg-[#991b1b]"
                    >
                      {copy.cta}
                    </button>
                  </div>
                );
              })()}
              <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch">
                {activeTab !== "home" || proFocused ? desktopPanelNav() : null}
                {/* Main content, min-w-0 so a long unbroken string inside a card can't
                    grow this flex column past the available width and break the page. */}
                <div ref={contentRef} className="flex-1 min-w-0 scroll-mt-20 lg:flex lg:scroll-mt-0 lg:flex-col">
                  <SaveStatusProvider>
                    <Card className={cn(
                      activeTab === "home" && (proFocused ? "border-0 bg-transparent shadow-none" : "rounded-none border-0 bg-transparent shadow-none lg:hidden"),
                      activeTab === "chat" && "overflow-hidden",
                      // En pantalla grande la columna se queda en 54rem: a 62rem las
                      // tarjetas de un proyecto quedaban como cintas de
                      // un metro con tres renglones de texto y un botón en cada punta.
                      activeTab !== "chat" && activeTab !== "home" && "lg:max-w-[54rem] lg:flex-1",
                      singleSurfaceTab && "!border-0 !bg-transparent !shadow-none",
                      mobileSectionOpen && !singleSurfaceTab && "dashboard-section-card rounded-none border-0 bg-white shadow-none lg:overflow-hidden lg:rounded-[22px] lg:border lg:border-[#e5e7eb] lg:shadow-[0_12px_34px_-28px_rgba(15,23,42,0.55)]",
                    )}>
                      {activeTab !== "chat" && activeTab !== "home" && !singleSurfaceTab && <CardHeader className="hidden border-b border-[#eef2f6] bg-white px-5 py-4 sm:px-6 lg:block">
                        <div className="relative">
                          <div className="flex min-w-0 items-center gap-2 pr-28">
                            <h2 className={CABECERA_TITULO}>{activeTab === "services" ? t("servicesHeading") : panelTabLabel(activeTab)}</h2>
                          </div>
                          <div data-pro-section-actions-slot className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center" />
                        </div>
                      </CardHeader>}
                      <CardContent data-dashboard-current={activeTab} className={mobileSectionOpen ? cn(
                        "dashboard-section-content ccr-editor-surface min-h-[calc(100svh-var(--ccr-native-header-height,124px)-var(--ccr-responsive-footer-reserve,72px)-64px)] bg-white px-4 pb-6 pt-4 sm:px-5 lg:min-h-0 lg:bg-white lg:px-6 lg:pb-6 lg:pt-5",
                        editorSurfaceTab && "px-4 py-5",
                        singleSurfaceTab && "px-4 py-5 lg:!bg-transparent lg:px-0 lg:pb-0 lg:pt-0"
                      ) : cn(
                        "px-4 pt-0 pb-4 sm:px-6 sm:pt-1 sm:pb-6",
                        activeTab === "home" && "ccr-dashboard-mobile-home bg-white px-0 sm:px-0",
                        singleSurfaceTab && "!bg-transparent px-0 pt-0 pb-0 sm:px-0 sm:pt-0 sm:pb-0",
                      )}>
                        {/* Cada sección dentro de su propio límite: si una revienta,
                            cae ella sola con su aviso y su reintento, y el error queda
                            registrado. Antes se llevaba la pantalla entera. */}
                        {pro && mode === "offer" && activeTab === "services" && <ServiceRequestInvitations onComplete={openRequestedService} />}
                        <SectionBoundary titulo={t("sectionErrorTitle")} cuerpo={t("sectionErrorBody")} reintentar={t("sectionErrorRetry")}>
                        {TABS_WITH_SUBTITLE.has(activeTab) && (
                          <SectionHeadline subtitulo={t(`subtitles.${activeTab}`)} className="mb-4" />
                        )}
                        {activeTab === "home" && (
                          <>
                            <div className={proFocused?"space-y-5":"lg:hidden"}>
                              <div className={proFocused?"lg:hidden":undefined}>
                                <div>
                                  <div className="flex flex-col gap-2.5">
                                    {ofrecerServiciosCard()}
                                    {(proFocused?[mobileSectionTabs.slice(0,5),mobileSectionTabs.slice(5)]:agruparPestanas(mobileSectionTabs)).map((grupo, i) => (
                                      <div key={grupo[0] ?? i} className="flex flex-col gap-2.5">
                                        {grupo.map(mobileSectionButton)}
                                      </div>
                                    ))}
                                  </div>
                                  <div className="pt-2.5">
                                    <button
                                      type="button"
                                      onClick={() => signOutToHome(locale)}
                                      className="flex min-h-[60px] w-full items-center gap-3 rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3.5 text-left text-[15px] font-semibold text-[#162543] transition-colors hover:bg-[#f8fbfd]"
                                    >
                                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#64748b]">
                                        <LogOut className="h-5 w-5" />
                                      </span>
                                      <span className="min-w-0 flex-1 truncate">{pc("signOut")}</span>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </>
                        )}

                        {/* MI PERFIL, pro editor in offer mode, basic identity in use mode. */}
                        {activeTab === "profile" && mode === "offer" && pro && (
                          <ProfileEditor
                            professionalId={pro.id}
                            profileId={user.id}
                            initial={proForEditor ?? pro}
                            onSaved={() => handleSaved("section")}
                            collapseOnSave={!hasActiveCompletionFlow()}
                            focusField={profileFocus?.field ?? null}
                            focusKey={profileFocus?.key}
                            resetKey={profileResetKey}
                            extraSections={[
                              ...(proFocused ? [
                                {id: "profile-services-link", title: pc("services"), footer: null, children: <ServicesEditor key={`servicios:${(pro.professions ?? []).length}:${(pro.services ?? []).length}`} professionalId={pro.id} primaryCategory={pro.category_id} initialProfessions={pro.professions ?? []} initialServices={pro.services ?? []} onSaved={(intent) => handleSaved(intent ?? "section")} focusField={serviceFocus?.field ?? null} focusKey={serviceFocus?.key} />},
                                {id: "profile-photos-link", title: pc("workPhotos"), footer: null, children: <PhotoGallery key={`casos:${(pro.portfolio_items ?? []).length}:${(pro.portfolio_urls ?? []).length}`} professionalId={pro.id} initialUrls={pro.portfolio_urls ?? []} initialItems={pro.portfolio_items ?? undefined} professions={(pro.professions && pro.professions.length > 0) ? pro.professions : (pro.category_id ? [pro.category_id] : [])} services={pro.services ?? []} onSaved={(intent) => handleSaved(intent ?? "section")} />},
                              ] : []),
                              {
                                id: "verificacion",
                                footer: null,
                                title: t("tabs.verificacion"),
                                desc: t("profileSections.verificationDesc"),
                                children: (
                                  <VerificationPanel
                                    professionalId={pro.id}
                                    status={pro.verification_status ?? "pending"}
                                    reason={pro.verification_reason}
                                    currentCedula={currentCedula}
                                    currentFullName={profile?.full_name || proProfile?.full_name || null}
                                    noCrId={pro.no_cr_id ?? false}
                                    onSaved={() => handleSaved("internal")}
                                  />
                                ),
                              },
                              // Blocked accounts are managed here on both web and native.
                              {
                                id: "privacidad",
                                title: t("tabs.privacidad"),
                                desc: t("profileSections.privacyDesc"),
                                footer: null,
                                children: <AccountPrivacySection />,
                              },
                              {
                                id: "cuenta",
                                title: t("tabs.cuenta"),
                                desc: t("profileSections.accountDesc"),
                                footer: null,
                                children: (
                                  <div className="space-y-6">
                                    <AccountSecuritySection showHeading={false} />
                                    <CloseAccountSection />
                                  </div>
                                ),
                              },
                            ]}
                          />
                        )}
                        {activeTab === "profile" && mode === "use" && (
                          <BasicProfileSection
                            initialProfile={profile}
                            extraSections={[
                              // Blocked accounts are managed here on both web and native.
                              {
                                id: "privacidad",
                                title: t("tabs.privacidad"),
                                desc: t("profileSections.privacyDesc"),
                                footer: null,
                                children: <AccountPrivacySection />,
                              },
                              {
                                id: "cuenta",
                                title: t("tabs.cuenta"),
                                desc: t("profileSections.accountDesc"),
                                footer: null,
                                children: (
                                  <div className="space-y-6">
                                    <AccountSecuritySection showHeading={false} />
                                    <CloseAccountSection />
                                  </div>
                                ),
                              },
                            ]}
                          />
                        )}

                        {activeTab === "services" && pro && (
                          <ServicesEditor
                            // Igual que la agenda: el editor copia estos valores
                            // al montarse y el panel pinta PRIMERO lo que tiene
                            // en caché. Sin la clave, una foto vieja sin
                            // servicios dejaba «no tenés servicios» en pantalla
                            // —invitando a volver a crear los que ya existen—
                            // aunque la respuesta del servidor ya los hubiera
                            // traído.
                            key={`servicios:${(pro.professions ?? []).length}:${(pro.services ?? []).length}`}
                            professionalId={pro.id}
                            primaryCategory={pro.category_id}
                            categoryToComplete={serviceRequestToComplete}
                            initialProfessions={pro.professions ?? []}
                            initialServices={pro.services ?? []}
                            onSaved={(intent) => handleSaved(intent ?? "section")}
                            focusField={serviceFocus?.field ?? null}
                            focusKey={serviceFocus?.key}
                          />
                        )}
                        {activeTab === "photos" && pro && (
                          <PhotoGallery
                            // Ver la nota de Servicios: sin la clave, la caché
                            // sin casos de éxito dejaba el vacío puesto aunque
                            // el servidor los devolviera un instante después.
                            key={`casos:${(pro.portfolio_items ?? []).length}:${(pro.portfolio_urls ?? []).length}`}
                            professionalId={pro.id}
                            initialUrls={pro.portfolio_urls ?? []}
                            initialItems={pro.portfolio_items ?? undefined}
                            professions={(pro.professions && pro.professions.length > 0) ? pro.professions : (pro.category_id ? [pro.category_id] : [])}
                            services={pro.services ?? []}
                            onSaved={(intent) => handleSaved(intent ?? "section")}
                          />
                        )}
                        <ProManagementShell enabled={proEnabled} activeTab={activeTab}>
                        {activeTab === "statistics" && <StatisticsPanel professional={!!pro} callsEnabled={!!pro?.allow_phone_call && !!(pro?.call_phone || pro?.whatsapp)} />}
                        {activeTab === "pro_tools" && (proEnabled ? <ProTools/> : proAccessPlaceholder)}
                        {(["pro_agenda","pro_clients","pro_inventory","pro_social","pro_expenses"] as Tab[]).includes(activeTab) && (proEnabled?<ProWorkspace key={`${user?.id??"anonymous"}:${activeTab}`} server embedded section={activeTab==="pro_expenses"?"Gastos":activeTab==="pro_agenda"?"Agenda":activeTab==="pro_clients"?"Clientes":activeTab==="pro_inventory"?"Inventario":"Redes"}/>:proAccessPlaceholder)}
                        {activeTab === "pro" && (proEnabled?<ProWorkspace server embedded/>:proAccessPlaceholder)}
                        {PRO_SALES_TABS.has(activeTab) && (proAccessReady?
                          proEnabled?<SalesWorkspace key={user?.id??"anonymous"} proName={professionalDisplayName} proSlug={typeof pro?.slug === "string" ? pro.slug : null} puedeCrear={!!pro?.id}/>:activeTab==="quotes"?<QuotesSection
                            proEnabled={false}
                            proName={professionalDisplayName}
                            proSlug={typeof pro?.slug === "string" ? pro.slug : null}
                            proId={typeof pro?.id === "string" ? pro.id : null}
                            puedeCrear={!!pro?.id}
                          />:<p className="p-4">{t("salesProRequired")}</p>:<PanelListSkeleton rows={3} compacto/>
                        )}
                        </ProManagementShell>
                        {/* "Usar servicios", the seek capability. */}
                        {activeTab === "sent_projects" && <ClientActivity section="projects" />}
                        {activeTab === "appointments" && LOCAL_APPOINTMENT_TABS.length>0 && <AppointmentRequestsWorkspace side="client"/>}
                        {/* «Mis postulaciones» se retiró con el formulario: se
                            aplica por WhatsApp y no hay nada que seguir aquí.
                            La dirección sigue existiendo y muestra el aviso de
                            sección vacía, para no romper enlaces viejos. */}
                        {activeTab === "saved" && <ClientActivity section="saved" />}
                        {activeTab === "tools" && <Herramientas esProfesional={esProfesional} alAbrir={(destino) => requestUnsavedAction(() => setTab(destino))} />}
                        {activeTab === "cv" && <CvBuilder pro={pro} documento="cv" alCambiarEditor={setCvEditorAbierto} />}
                        {activeTab === "carta" && <CvBuilder pro={pro} documento="carta" alCambiarEditor={setCvEditorAbierto} />}
                        {activeTab === "connections" && <ClientConnections />}
                        {activeTab === "notifications" && <NotificationsList scope="all" />}
                        {activeTab === "soporte" && (
                          <SupportTickets
                            initialTicketId={searchParams.get("ticket")}
                            initialNewSupport={searchParams.get("newSupport") === "1"}
                            onThreadChange={({ open, title, reference }) => {
                              setSupportThreadTitle(open ? title : null);
                              setSupportThreadRef(open ? reference : null);
                            }}
                          />
                        )}
                        {activeTab === "jobs" && pro && <JobsPanel professionalId={pro.id} />}
                        {activeTab === "offers" && pro && <OffersPanel professionalId={pro.id} />}
                        {/* Publicar es publicar: el proyecto que pide un trabajo,
                            el empleo que ofrece uno y la promoción viven juntos.
                            Quien no es profesional ve solo sus proyectos, sin
                            interruptor: no tiene nada más que publicar. */}
                        {activeTab === "publicaciones" && (
                          <div className="space-y-4">
                            {pro && (
                              // Mismo control que el filtro de Favoritos y el de
                              // Mis trabajos: un filtro se ve igual en todo el
                              // app. Con conteo, que dice qué hay en cada uno sin
                              // entrar. No se «limpia» al volver a tocarlo: es un
                              // cambiador de vista, siempre queda uno elegido.
                              <StatusFilterTabs
                                tabs={PUBLICACION_TABS.filter((opcion) => EMPLEOS_VISIBLE || opcion.id !== "empleos")}
                                value={publicacionTipo}
                                onChange={(id) => setPublicacionTipo(id as Publicacion)}
                                counts={conteoPublicaciones}
                                labelFor={(id) => (id === "proyectos" ? panelTabLabel("sent_projects") : id === "empleos" ? panelTabLabel("jobs") : panelTabLabel("offers"))}
                                variant="chips"
                                limpiable={false}
                              />
                            )}
                            {/* Las tres vistas se montan siempre y se esconden con
                                CSS: así el conteo de las tres está desde el
                                primer momento, sin tener que entrar a cada una. */}
                            <div hidden={!!pro && publicacionTipo !== "proyectos"}>
                              <ClientActivity section="projects" onCount={(n) => anotarConteo("proyectos", n)} />
                            </div>
                            {pro && EMPLEOS_VISIBLE && (
                              <div hidden={publicacionTipo !== "empleos"}>
                                <JobsPanel professionalId={pro.id} onCount={(n) => anotarConteo("empleos", n)} />
                              </div>
                            )}
                            {pro && (
                              <div hidden={publicacionTipo !== "promociones"}>
                                <OffersPanel professionalId={pro.id} onCount={(n) => anotarConteo("promociones", n)} />
                              </div>
                            )}
                          </div>
                        )}
                        {activeTab === "completion" && proForCompletion && (
                          <ProfileCompletion
                            pro={proForCompletion}
                            variant="details"
                            onComplete={() => {
                              clearCompletionFlow();
                              setTab("home", true);
                              scrollDashboardToPageTop();
                            }}
                            onGo={(tab, field) => {
                              requestUnsavedAction(() => openCompletionTarget(tab, field));
                            }}
                          />
                        )}
                        {activeTab === "cuenta" && (
                          <div className="space-y-6">
                            <AccountSecuritySection showHeading={false} />
                            <CloseAccountSection />
                          </div>
                        )}
                      </SectionBoundary>
                      </CardContent>
                    </Card>
                  </SaveStatusProvider>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      <div className="ccr-dashboard-footer">
        <LandingFooter />
      </div>
      {avisoDelPanel.dialogNode}
    </div>
  );
}
