"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { isSigningOut, signOutToHome } from "@/lib/auth/sign-out";
import { useSearchParams } from "next/navigation";
import {
  User, Award, CalendarCheck, CalendarClock, CalendarDays, Wrench,
  ShieldCheck, Bell, Handshake, ClipboardList, Bookmark, Settings, Headset, CreditCard,
  ArrowLeft, ArrowRight, ChevronDown, ChevronRight, Sparkles, Plus, AlertCircle, X, MessageSquareMore, Home, LogOut, ExternalLink, Users, BookOpen, Check, CheckCircle2, FileText, Search, Camera, Eye, Trash2, Loader2,
  BriefcaseBusiness, Star,
} from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProfileEditor } from "@/components/dashboard/pro/profile-editor";
import { ProfileCompletion, computeCompletion } from "@/components/dashboard/pro/profile-completion";
import { PhotoGallery } from "@/components/dashboard/pro/photo-gallery";
import { AvailabilityEditor } from "@/components/dashboard/pro/availability-editor";
import { ServicesEditor } from "@/components/dashboard/pro/services-editor";
import { JobsPanel } from "@/components/dashboard/pro/jobs-panel";
import { OffersPanel } from "@/components/dashboard/pro/offers-panel";
import { SaveStatusProvider } from "@/components/dashboard/save-status-context";
import { BookingRequests } from "@/components/dashboard/pro/booking-requests";
import { ProposalsTab } from "@/components/dashboard/pro/proposals-tab";
import { VerificationPanel } from "@/components/dashboard/pro/verification-panel";
import { ClientActivity } from "@/components/dashboard/client-activity";
import { ClientConnections } from "@/components/dashboard/client-connections";
import { ClientJobApplications } from "@/components/dashboard/client-job-applications";
import { applyPendingSavedPro } from "@/components/professionals/save-button";
import { applyPendingFollow } from "@/components/professionals/follow-button";
import { FollowNetworkTab } from "@/components/professionals/follow-network-tab";
import { FollowNetworkSummaryLink } from "@/components/professionals/follow-network-summary-link";
import { BasicProfileSection } from "@/components/dashboard/basic-profile-section";
import { detectIdType } from "@/lib/cedula";
import { NotificationsList } from "@/components/notifications/notifications-list";
import { AccountSecuritySection } from "@/components/account/account-security";
import { CloseAccountSection } from "@/components/account/close-account-section";
import { SupportTickets } from "@/components/support/support-tickets";
import { SubscriptionPanel } from "@/components/dashboard/pro/subscription-panel";
import { PAYMENTS_ENABLED } from "@/lib/payments/config";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/utils";
import { canOffer } from "@/lib/auth/capabilities";
import { anyVideoConsultCategory } from "@/lib/data/categories";
import { useMode, type Mode } from "@/hooks/use-mode";
import { ImagePreviewDialog } from "@/components/ui/image-preview-dialog";
import { Modal } from "@/components/ui/modal";
import { notificationContext } from "@/lib/notification-link";
import { Link, useRouter } from "@/i18n/navigation";
import { openInNewTabOnDesktop } from "@/lib/desktop-new-tab";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { DashboardRouteLoading } from "@/components/ui/route-loading";
import { withPromiseTimeout } from "@/lib/promise-timeout";
import { getDashboardCache, setDashboardCache } from "@/lib/dashboard-prefetch-cache";
import {
  dashboardBootstrapKey,
  type DashboardBootstrap,
  type DashboardProfileData,
} from "@/lib/dashboard-bootstrap-cache";
import { prepareImageForUpload, uploadPhotoFormDataWithRetry } from "@/lib/client-image-upload";
import { deleteOwnedMediaUrl } from "@/lib/client-media-cleanup";
import { IMAGE_ACCEPT } from "@/lib/upload-validation";
import { OfferTagPercentIcon } from "@/components/icons/offer-tag-percent-icon";

// ONE unified panel for every account (Airbnb model). A MODE SWITCH flips between
// "Usar servicios" (the seek capability, always available) and "Ofrecer servicios"
// (the offer capability, unlocked by completing the professional profile). There
// is no separate client panel; everyone lives here.
type Tab =
  | "home" | "profile" | "services" | "photos" | "availability" | "bookings" | "proposals" | "verificacion"
  | "jobs" | "offers" | "completion"
  | "suscripcion"
  | "sent_bookings" | "sent_projects" | "applications" | "saved" | "connections" | "network"
  | "chat" | "notifications" | "soporte" | "cuenta" | "guides";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProData = Record<string, any>;

const ALL_TABS = new Set<Tab>([
  "home", "profile", "services", "photos", "availability", "bookings", "proposals", "verificacion",
  "jobs", "offers", "completion", "suscripcion", "sent_bookings", "sent_projects", "applications", "saved", "connections",
  "network", "chat", "notifications", "soporte", "cuenta", "guides",
]);

const TAB_ICONS: Record<Tab, React.ReactNode> = {
  home: <Home className="h-4 w-4" />,
  profile: <User className="h-4 w-4" />,
  services: <Wrench className="h-4 w-4" />,
  photos: <Award className="h-4 w-4" />,
  availability: <CalendarDays className="h-4 w-4" />,
  bookings: <CalendarCheck className="h-4 w-4" />,
  proposals: <Handshake className="h-4 w-4" />,
  verificacion: <ShieldCheck className="h-4 w-4" />,
  suscripcion: <CreditCard className="h-4 w-4" />,
  sent_bookings: <CalendarClock className="h-4 w-4" />,
  sent_projects: <ClipboardList className="h-4 w-4" />,
  applications: <BriefcaseBusiness className="h-4 w-4" />,
  saved: <Bookmark className="h-4 w-4" />,
  connections: <Users className="h-4 w-4" />,
  network: <Users className="h-4 w-4" />,
  chat: <MessageSquareMore className="h-4 w-4" />,
  notifications: <Bell className="h-4 w-4" />,
  soporte: <Headset className="h-4 w-4" />,
  cuenta: <Settings className="h-4 w-4" />,
  guides: <FileText className="h-4 w-4" />,
  jobs: <BriefcaseBusiness className="h-4 w-4" />,
  offers: <OfferTagPercentIcon className="h-4 w-4" />,
  completion: <CheckCircle2 className="h-4 w-4" />,
};

// Tabs that show a one-line context note under the section title.
const TABS_WITH_SUBTITLE = new Set<Tab>(["proposals", "sent_bookings", "sent_projects", "saved", "connections", "network"]);

// Mode membership. The first three render only in "offer" mode, the next three
// only in "use" mode; "profile" + the shared tabs are valid in both, so the mode
// for those is taken from the URL (?mode=) or defaults to the account's capability.
const OFFER_ONLY = new Set<Tab>(["services", "photos", "availability", "bookings", "proposals", "verificacion", "suscripcion", "jobs", "offers", "completion"]);
const USE_ONLY = new Set<Tab>(["sent_bookings", "sent_projects", "applications", "saved", "connections"]);

// Sidebar order per mode (+ a shared block appended below).
const OFFER_TABS: Tab[] = [
  "bookings", "proposals", "jobs", "offers", "photos", "availability", "services", "soporte", "profile", "guides",
  ...(PAYMENTS_ENABLED ? (["suscripcion"] as Tab[]) : []),
];
const USE_TABS: Tab[] = ["sent_bookings", "sent_projects", "applications", "connections", "saved", "soporte", "profile", "guides"];
const OPPORTUNITY_MODAL_SEEN_STORAGE_PREFIX = "contratacr:seen-opportunity-modal";

const PANEL_TAB_LABELS: Partial<Record<Tab, { es: string; en: string }>> = {
  bookings: { es: "Solicitudes Recibidas", en: "Received requests" },
  proposals: { es: "Proyectos Recibidos", en: "Received projects" },
  sent_bookings: { es: "Mis solicitudes", en: "My requests" },
  sent_projects: { es: "Mis proyectos", en: "My projects" },
  applications: { es: "Mis postulaciones", en: "My applications" },
  connections: { es: "Conexiones", en: "Connections" },
  photos: { es: "Casos de éxito", en: "Success cases" },
  availability: { es: "Disponibilidad", en: "Availability" },
  services: { es: "Servicios", en: "Services" },
  saved: { es: "Favoritos", en: "Favorites" },
  soporte: { es: "Soporte", en: "Support" },
  profile: { es: "Perfil", en: "Profile" },
  jobs: { es: "Empleos", en: "Jobs" },
  offers: { es: "Ofertas", en: "Offers" },
  completion: { es: "Completa tu perfil", en: "Complete your profile" },
  guides: { es: "Guías", en: "Guides" },
};

type GuideItem = {
  id: string;
  section: "client" | "shared" | "professional";
  actionTab?: Tab;
  href?: string;
  targetMode?: Mode;
  stepCount: number;
};

const GUIDE_ITEMS: GuideItem[] = [
  { id: "clientPanel", section: "client", actionTab: "sent_bookings", targetMode: "use", stepCount: 5 },
  { id: "clientRequests", section: "client", actionTab: "sent_bookings", targetMode: "use", stepCount: 3 },
  { id: "clientProjects", section: "client", actionTab: "sent_projects", targetMode: "use", stepCount: 3 },
  { id: "clientApplications", section: "client", actionTab: "applications", targetMode: "use", stepCount: 4 },
  { id: "clientSaved", section: "client", actionTab: "saved", targetMode: "use", stepCount: 4 },
  { id: "clientConnections", section: "client", actionTab: "connections", targetMode: "use", stepCount: 3 },
  { id: "clientProfile", section: "client", actionTab: "profile", targetMode: "use", stepCount: 3 },
  { id: "searchServices", section: "shared", href: "/buscar", stepCount: 5 },
  { id: "jobsGuide", section: "shared", href: "/empleos", stepCount: 4 },
  { id: "offersGuide", section: "shared", href: "/ofertas", stepCount: 4 },
  { id: "followingGuide", section: "shared", actionTab: "network", stepCount: 4 },
  { id: "notificationsGuide", section: "shared", actionTab: "notifications", stepCount: 5 },
  { id: "reviewsGuide", section: "shared", href: "/buscar", stepCount: 4 },
  { id: "supportGuide", section: "shared", actionTab: "soporte", stepCount: 3 },
  { id: "accountSecurityGuide", section: "shared", actionTab: "cuenta", stepCount: 4 },
  { id: "professionalPanel", section: "professional", actionTab: "bookings", targetMode: "offer", stepCount: 4 },
  { id: "completionGuide", section: "professional", actionTab: "completion", targetMode: "offer", stepCount: 4 },
  { id: "requests", section: "professional", actionTab: "bookings", targetMode: "offer", stepCount: 3 },
  { id: "opportunities", section: "professional", actionTab: "proposals", targetMode: "offer", stepCount: 3 },
  { id: "successCases", section: "professional", actionTab: "photos", targetMode: "offer", stepCount: 4 },
  { id: "availability", section: "professional", actionTab: "availability", targetMode: "offer", stepCount: 4 },
  { id: "services", section: "professional", actionTab: "services", targetMode: "offer", stepCount: 4 },
  { id: "jobsPanel", section: "professional", actionTab: "jobs", targetMode: "offer", stepCount: 4 },
  { id: "offersPanel", section: "professional", actionTab: "offers", targetMode: "offer", stepCount: 4 },
  { id: "professionalProfile", section: "professional", actionTab: "profile", targetMode: "offer", stepCount: 5 },
];

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
    case "followingGuide":
      return <Users className="h-4 w-4" />;
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
    case "clientRequests":
      return <CalendarClock className="h-4 w-4" />;
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
    case "availability":
      return <CalendarDays className="h-4 w-4" />;
    case "successCases":
      return <Award className="h-4 w-4" />;
    case "requests":
      return <CalendarCheck className="h-4 w-4" />;
    case "opportunities":
      return <Handshake className="h-4 w-4" />;
    default:
      return <User className="h-4 w-4" />;
  }
}

function compactDisplayName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (name.length <= 29 || parts.length < 4) return name;
  return [parts[0], ...parts.slice(-2)].join(" ");
}

type OpportunityProjectSummary = { id?: string | null };

function opportunitySeenStorageKey(userId: string) {
  return `${OPPORTUNITY_MODAL_SEEN_STORAGE_PREFIX}:${userId}`;
}

function opportunityProjectKey(project: { id?: string | null }) {
  return project.id ? `project:${project.id}` : null;
}

function readSeenOpportunityKeys(userId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(opportunitySeenStorageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

function rememberSeenOpportunityKeys(userId: string, keys: string[]) {
  if (keys.length === 0) return;
  try {
    const current = readSeenOpportunityKeys(userId);
    for (const key of keys) current.add(key);
    window.localStorage.setItem(opportunitySeenStorageKey(userId), JSON.stringify([...current].slice(-200)));
  } catch {
    // If storage is unavailable, the notification list still works; the modal may show again.
  }
}

function QuickGuidesModal({
  open,
  onClose,
  isProvider,
  onGo,
}: {
  open: boolean;
  onClose: () => void;
  isProvider: boolean;
  onGo: (guide: GuideItem) => void;
}) {
  const t = useTranslations("proPanel.guides");
  const locale = useLocale();
  const guideSections = [
    { id: "client", title: t("sections.client"), guides: GUIDE_ITEMS.filter((guide) => guide.section === "client") },
    { id: "professional", title: t("sections.professional"), guides: GUIDE_ITEMS.filter((guide) => guide.section === "professional") },
    { id: "shared", title: t("sections.shared"), guides: GUIDE_ITEMS.filter((guide) => guide.section === "shared") },
  ];
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);
  const selectedGuide = selectedGuideId ? GUIDE_ITEMS.find((guide) => guide.id === selectedGuideId) : null;

  useEffect(() => {
    if (open) queueMicrotask(() => setSelectedGuideId(null));
  }, [open]);

  if (!open) return null;

  const go = (guide: GuideItem) => {
    onClose();
    if (!isProvider && guide.section === "professional") {
      window.location.assign(`/${locale}/registro/profesional`);
      return;
    }
    if (guide.href) {
      window.location.assign(`/${locale}${guide.href}`);
      return;
    }
    if (guide.actionTab) onGo(guide);
  };

  return (
    <Modal
      onClose={onClose}
      title={t("modalTitle")}
      subtitle={t("modalSubtitle")}
      size="lg"
      mobilePresentation="fullscreen"
      bodyClassName="bg-white px-5 py-5 pb-[max(env(safe-area-inset-bottom),1rem)] sm:px-7 sm:py-6"
    >
      <div className="mx-auto max-w-[620px]">
        <p className="mx-auto max-w-[520px] text-center text-xs font-semibold leading-relaxed text-[#7c8ba0]">
          {isProvider ? (
            <>
              {t("providerNoteBody")}
            </>
          ) : (
            <>
              {t("clientNoteBody")}
            </>
          )}
        </p>

        <div className="mt-5 overflow-hidden rounded-lg border border-[#dfe5ec]">
          {guideSections.map((section) => (
            <div key={section.id} className="border-b border-[#dfe5ec] last:border-b-0">
              <div className="bg-white px-4 py-2 text-xs font-extrabold uppercase tracking-[0.06em] text-[#7c8ba0]">
                {section.title}
              </div>
              {section.guides.map((guide, guideIndex) => {
                const selected = selectedGuide?.id === guide.id;
                return (
                  <div key={guide.id} className="border-t border-white first:border-t-0">
                    <button
                      type="button"
                      onClick={() => setSelectedGuideId(selected ? "" : guide.id)}
                      className={cn(
                        "flex w-full items-center gap-3 bg-[#e9edf2] px-4 py-2.5 text-left text-sm font-semibold text-[#162543] transition hover:bg-[#dfe5ec]",
                        selected && "bg-[#dfe5ec]",
                      )}
                    >
                      <span className="w-10 shrink-0 whitespace-nowrap text-right tabular-nums">{guideIndex + 1} -</span>
                      <span className="min-w-0 flex-1 truncate">{t(`items.${guide.id}.title`)}</span>
                    </button>
                    {selected && (
                      <div className="bg-white px-4 py-4">
                        <p className="text-sm leading-relaxed text-[#526277]">{t(`items.${guide.id}.body`)}</p>
                        <ol className="mt-3 space-y-2">
                          {Array.from({ length: guide.stepCount }, (_, stepIndex) => (
                            <li key={stepIndex} className="flex gap-2 text-sm leading-relaxed text-[#374151]">
                              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#009FD9]" />
                              <span>{t(`items.${guide.id}.steps.${stepIndex}`)}</span>
                            </li>
                          ))}
                        </ol>
                        <Button type="button" className="mt-4 rounded-full px-5" onClick={() => go(guide)}>
                          {!isProvider && guide.section === "professional" ? t("activateProfessionalCta") : t(`items.${guide.id}.cta`)}
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-[#dfe8f0] bg-[#f8fbfe] px-4 py-4 sm:px-5">
          <p className="text-sm font-semibold text-[#162543]">{t("supportTitle")}</p>
          <p className="mt-1 text-sm leading-relaxed text-[#526277]">{t("supportBody")}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-4 rounded-full px-5"
            onClick={() => {
              onClose();
              window.location.assign(`/${locale}/dashboard/profesional?tab=soporte`);
            }}
          >
            {t("supportCta")}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

      </div>
    </Modal>
  );
}
function GuidePreview({ id, t }: { id: string; t: ReturnType<typeof useTranslations<"proPanel.guides">> }) {
  if (id === "services") {
    return (
      <div className="rounded-2xl border border-[#dbeafe] bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="font-bold text-[#162543]">{t("preview.services.title")}</h4>
          <span className="rounded-full bg-[#EBF5FB] px-2 py-1 text-xs font-bold text-[#0089bb]">{t("preview.services.badge")}</span>
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border border-[#e5e7eb] p-3">
            <p className="font-bold text-[#111827]">Desarrollo web</p>
            <p className="mt-1 text-xs text-[#6b7280]">{t("preview.services.desc")}</p>
            <div className="mt-3 h-2 rounded-full bg-[#EBF5FB]" />
          </div>
          <div className="rounded-xl border border-[#e5e7eb] p-3">
            <p className="font-bold text-[#111827]">Automatizaciones</p>
            <p className="mt-1 text-xs text-[#6b7280]">{t("preview.services.detail")}</p>
          </div>
        </div>
      </div>
    );
  }

  if (id === "availability") {
    return (
      <div className="rounded-2xl border border-[#dbeafe] bg-white p-4 shadow-sm">
        <h4 className="font-bold text-[#162543]">{t("preview.availability.title")}</h4>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
          {["Mañana", "31 jul", "1 ago"].map((day) => (
            <div key={day}>
              <p className="mb-2 font-bold text-[#6b7280]">{day}</p>
              {["09:00", "14:00"].map((time) => (
                <div key={time} className="mb-2 rounded-lg bg-[#EBF5FB] px-2 py-1.5 font-bold text-[#0089bb]">{time}</div>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-full bg-[#009FD9] py-2 text-center text-sm font-bold text-white">{t("preview.availability.cta")}</div>
      </div>
    );
  }

  if (id === "successCases") {
    return (
      <div className="rounded-2xl border border-[#dbeafe] bg-white p-4 shadow-sm">
        <h4 className="font-bold text-[#162543]">{t("preview.cases.title")}</h4>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="aspect-square rounded-xl bg-[#EBF5FB] p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.png" alt="" className="h-full w-full object-contain" />
          </div>
          <div className="aspect-square rounded-xl bg-[#eef2f6] p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/ai-assistant-robot.png" alt="" className="h-full w-full object-contain" />
          </div>
        </div>
        <p className="mt-3 text-sm font-bold text-[#111827]">{t("preview.cases.caseTitle")}</p>
        <p className="mt-1 text-xs leading-relaxed text-[#6b7280]">{t("preview.cases.body")}</p>
      </div>
    );
  }

  if (id === "jobsGuide" || id === "jobsPanel") {
    return (
      <div className="rounded-2xl border border-[#dbeafe] bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="font-bold text-[#162543]">{t("preview.jobs.title")}</h4>
          <span className="rounded-full bg-[#EBF5FB] px-2 py-1 text-xs font-bold text-[#0089bb]">{t("preview.jobs.badge")}</span>
        </div>
        <div className="space-y-3">
          <div className="flex gap-3 rounded-xl border border-[#e5e7eb] p-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EBF5FB] text-[#009FD9]">
              <BriefcaseBusiness className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-[#111827]">{t("preview.jobs.role")}</p>
              <p className="mt-0.5 text-xs font-semibold text-[#526277]">ContrataCR</p>
              <p className="mt-1 text-xs text-[#6b7280]">{t("preview.jobs.meta")}</p>
            </div>
          </div>
          <div className="rounded-xl bg-[#009FD9] px-3 py-2 text-center text-sm font-bold text-white">{t("preview.jobs.cta")}</div>
        </div>
      </div>
    );
  }

  if (id === "offersGuide" || id === "offersPanel") {
    return (
      <div className="rounded-2xl border border-[#dbeafe] bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="font-bold text-[#162543]">{t("preview.offers.title")}</h4>
          <span className="rounded-full bg-[#EBF5FB] px-2 py-1 text-xs font-bold text-[#0089bb]">{t("preview.offers.badge")}</span>
        </div>
        <div className="overflow-hidden rounded-xl border border-[#e5e7eb]">
          <div className="flex h-24 items-center justify-center bg-[#f4f8fb] text-[#009FD9]">
            <OfferTagPercentIcon className="h-8 w-8" />
          </div>
          <div className="p-3">
            <p className="text-sm font-bold text-[#111827]">{t("preview.offers.offer")}</p>
            <p className="mt-1 text-xs text-[#6b7280]">{t("preview.offers.meta")}</p>
          </div>
        </div>
      </div>
    );
  }

  if (id === "requests" || id === "opportunities") {
    return (
      <div className="rounded-2xl border border-[#dbeafe] bg-white p-4 shadow-sm">
        <h4 className="font-bold text-[#162543]">{id === "requests" ? t("preview.requests.title") : t("preview.opportunities.title")}</h4>
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-[#e5e7eb] p-3">
            <p className="text-sm font-bold text-[#111827]">{id === "requests" ? "Gerardo Solís" : t("preview.opportunities.project")}</p>
            <p className="mt-1 text-xs text-[#6b7280]">{id === "requests" ? t("preview.requests.body") : t("preview.opportunities.body")}</p>
          </div>
          <div className="rounded-xl bg-[#009FD9] px-3 py-2 text-center text-sm font-bold text-white">{id === "requests" ? t("preview.requests.cta") : t("preview.opportunities.cta")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#dbeafe] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-mark.png" alt="" className="h-16 w-16 rounded-xl object-contain ring-1 ring-[#eef2f6]" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-lg font-bold text-[#111827]">ContrataCR</p>
            <Badge variant="verified">{t("exampleProfile.verified")}</Badge>
          </div>
          <p className="text-sm text-[#526277]">Isaac Alberto Sanchez Monge</p>
          <p className="mt-1 inline-flex rounded-full bg-[#f3f4f6] px-2 py-0.5 text-xs font-semibold text-[#6b7280]">{t("exampleProfile.service")}</p>
        </div>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-[#526277]">{t("preview.profile.body")}</p>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs text-[#526277]">
        <span className="rounded-xl bg-[#EBF5FB] px-2 py-2 font-bold text-[#0089bb]">5.0<br /><span className="font-medium">{t("exampleProfile.reviews")}</span></span>
        <span className="rounded-xl bg-[#EBF5FB] px-2 py-2 font-bold text-[#0089bb]">4<br /><span className="font-medium">{t("exampleProfile.cases")}</span></span>
        <span className="rounded-xl bg-[#EBF5FB] px-2 py-2 font-bold text-[#0089bb]">1<br /><span className="font-medium">{t("exampleProfile.year")}</span></span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("proPanel");
  const tc = useTranslations("clientActivity");
  const locale = useLocale();
  const rawRequestedTab = searchParams.get("tab");
  const legacyVerificationTab = rawRequestedTab === "verificacion";
  const requestedTab = (legacyVerificationTab ? "profile" : rawRequestedTab) as Tab | null;
  const requestedMode = searchParams.get("mode");
  const urlModeParam: Mode | null = requestedMode === "use" || requestedMode === "offer" ? requestedMode : null;
  const requestedReturnTo = searchParams.get("returnTo");
  const externalReturnTo = requestedReturnTo === "/ofertas" || requestedReturnTo === "/empleos" ? requestedReturnTo : null;
  const shouldCheckOpportunityWelcome = searchParams.get("welcomeOpportunities") === "1";
  const opportunityWelcomeParamCount = Math.max(0, Number.parseInt(searchParams.get("welcomeOpportunityCount") ?? "0", 10) || 0);

  const [pro, setPro] = useState<ProData | null>(null);
  const [profile, setProfile] = useState<DashboardProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [supportUnread, setSupportUnread] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);
  const [profileFocus, setProfileFocus] = useState<{ field: string; key: number } | null>(null);
  const [serviceFocus, setServiceFocus] = useState<{ field: string; key: number } | null>(null);
  const [pendingProfileFocusField, setPendingProfileFocusField] = useState<string | null>(null);
  const [pendingServiceFocusField, setPendingServiceFocusField] = useState<string | null>(null);
  const [completionFlowField, setCompletionFlowField] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem("contratacr:profile-completion-field");
  });
  const [profileResetKey, setProfileResetKey] = useState(0);
  const [mobileProfileSectionTitle, setMobileProfileSectionTitle] = useState<string | null>(null);
  const [supportThreadTitle, setSupportThreadTitle] = useState<string | null>(null);
  const [supportThreadRef, setSupportThreadRef] = useState<string | null>(null);
  const [proLoadError, setProLoadError] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [guidesOpen, setGuidesOpen] = useState(false);
  const [networkModal, setNetworkModal] = useState<"following" | "followers" | null>(null);
  const [preferMobileMenuDefault, setPreferMobileMenuDefault] = useState(false);
  const [opportunityWelcomeCount, setOpportunityWelcomeCount] = useState<number | null>(null);
  const [opportunityWelcomeKeys, setOpportunityWelcomeKeys] = useState<string[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);
  const headerPhotoInputRef = useRef<HTMLInputElement>(null);
  const headerPhotoMenuRef = useRef<HTMLDivElement>(null);
  const [headerPhotoMenuOpen, setHeaderPhotoMenuOpen] = useState(false);
  const [headerPhotoPreviewOpen, setHeaderPhotoPreviewOpen] = useState(false);
  const [headerPhotoUploading, setHeaderPhotoUploading] = useState(false);
  const opportunityWelcomeCheckedRef = useRef(false);
  const opportunityWelcomeDismissedRef = useRef(false);
  const proFetchSequenceRef = useRef(0);
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
  const pendingProfessionalSignup =
    user?.user_metadata?.professional_signup_started === true &&
    user.user_metadata?.is_provider !== true;

  // Airbnb FULL switch: the active mode is the GLOBAL (persisted) mode shared with the
  // navbar + bell. A mode-specific tab in the URL (a deep link from a notification or a
  // navbar quick link) overrides it, and is persisted below so everything stays in sync.
  // A non-provider has no offer world: always "use".
  const { mode: globalMode, setMode } = useMode(isProvider);
  const requestedOfferOnlyTab = !!requestedTab && OFFER_ONLY.has(requestedTab);
  const allowedRequestedTab = requestedTab && (!requestedOfferOnlyTab || isProvider) ? requestedTab : null;
  const urlForcedMode: Mode | null =
    legacyVerificationTab && isProvider ? "offer" : requestedOfferOnlyTab && isProvider ? "offer" : requestedTab && USE_ONLY.has(requestedTab) ? "use" : urlModeParam;
  const mode: Mode = !isProvider ? "use" : urlForcedMode ?? globalMode;
  const defaultTab: Tab = mode === "offer" ? "bookings" : "sent_bookings";
  const activeTab: Tab = allowedRequestedTab ?? (preferMobileMenuDefault ? "home" : defaultTab);

  // When a deep link forces a mode, adopt it globally so the navbar switch + bell follow.
  useEffect(() => {
    if (isProvider && urlForcedMode && urlForcedMode !== globalMode) setMode(urlForcedMode);
  }, [isProvider, urlForcedMode, globalMode, setMode]);

  // Security guard: a client can use this unified dashboard route, but must never
  // enter professional-only sections by editing the URL or reusing stale links.
  useEffect(() => {
    if (authLoading || loading || !user || isProvider || !requestedOfferOnlyTab) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", "use");
    params.set("tab", "sent_bookings");
    params.delete("focus");
    params.delete("flow");
    router.replace('/dashboard/profesional?' + params.toString(), { scroll: false });
  }, [authLoading, isProvider, loading, requestedOfferOnlyTab, router, searchParams, user]);

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

  useEffect(() => {
    if (!pendingProfileFocusField || activeTab !== "profile") return;
    const field = pendingProfileFocusField;
    const frame = requestAnimationFrame(() => {
      setPendingProfileFocusField(null);
      requestAnimationFrame(() => {
        setProfileFocus({ field, key: nextFocusKey() });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTab, nextFocusKey, pendingProfileFocusField]);

  useEffect(() => {
    if (!pendingServiceFocusField || activeTab !== "services") return;
    const field = pendingServiceFocusField;
    const frame = requestAnimationFrame(() => {
      setPendingServiceFocusField(null);
      requestAnimationFrame(() => {
        setServiceFocus({ field, key: nextFocusKey() });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTab, nextFocusKey, pendingServiceFocusField]);

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
    if (!legacyVerificationTab) return;
    const params = new URLSearchParams(searchParams.toString());
    if (!isProvider) {
      params.set("tab", "sent_bookings");
      params.set("mode", "use");
      params.delete("focus");
      router.replace(`/dashboard/profesional?${params.toString()}`, { scroll: false });
      return;
    }
    params.set("tab", "profile");
    params.set("mode", "offer");
    params.set("focus", "verification");
    router.replace(`/dashboard/profesional?${params.toString()}`, { scroll: false });
  }, [isProvider, legacyVerificationTab, searchParams, router]);

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
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", defaultTab);
    const qs = params.toString();
    router.replace(`/dashboard/profesional?${qs}`, { scroll: false });
  }, [defaultTab, requestedTab, router, searchParams]);

  useEffect(() => {
    if (requestedTab || activeTab !== "home") return;
    if (typeof window === "undefined" || window.innerWidth < 1024) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", defaultTab);
    const qs = params.toString();
    router.replace(`/dashboard/profesional?${qs}`, { scroll: false });
  }, [activeTab, defaultTab, requestedTab, router, searchParams]);

  // Suppress the login-redirect while signing out (from the navbar menu) straight
  // to main, no /login flash. Logout lives only in the navbar profile menu now.
  useEffect(() => {
    if (!authLoading && !user && !isSigningOut()) router.push("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (authLoading || !user) return;
    applyPendingSavedPro();
    applyPendingFollow(user.id);
  }, [authLoading, user]);

  useEffect(() => {
    if (authLoading || !user || !pendingProfessionalSignup) return;
    router.replace("/registro/profesional");
  }, [authLoading, pendingProfessionalSignup, router, user]);

  // Deep-link focus: `?tab=profile&focus=location` opens the editor at that field.
  useEffect(() => {
    const focus = searchParams.get("focus");
    if (!focus) return;
    queueMicrotask(() => {
      setProfileFocus({ field: focus, key: nextFocusKey() });
      const params = new URLSearchParams(searchParams.toString());
      params.delete("focus");
      const qs = params.toString();
      router.replace(`/dashboard/profesional${qs ? `?${qs}` : ""}`, { scroll: false });
    });
  }, [searchParams, router, nextFocusKey]);

  const cacheDashboardBootstrap = useCallback((next: Partial<DashboardBootstrap>) => {
    if (!user) return;
    const key = dashboardBootstrapKey(user.id);
    const current = getDashboardCache<DashboardBootstrap>(key) ?? { pro: null, profile: null };
    setDashboardCache(key, { ...current, ...next });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let stopped = false;
    const supabase = createClient();
    const loadChatUnread = async () => {
      const response = await fetch("/api/direct-chat", { cache: "no-store" }).catch(() => null);
      if (!response?.ok || stopped) return;
      const payload = await response.json().catch(() => ({ conversations: [] }));
      const total = (payload.conversations ?? []).reduce((sum: number, conversation: {
        client_id?: string;
        client_unread_count?: number;
        professional_unread_count?: number;
      }) => sum + (conversation.client_id === user.id
        ? Number(conversation.client_unread_count ?? 0)
        : Number(conversation.professional_unread_count ?? 0)), 0);
      setChatUnread(total);
    };
    void loadChatUnread();
    const onChanged = () => void loadChatUnread();
    window.addEventListener("notificationsChanged", onChanged);
    const channel = supabase.channel(`dashboard-chat-unread-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "direct_conversations" }, onChanged)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, onChanged)
      .subscribe();
    return () => {
      stopped = true;
      window.removeEventListener("notificationsChanged", onChanged);
      void supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchPro = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!user) return null;
    const requestSequence = ++proFetchSequenceRef.current;
    const supabase = createClient();
    setProLoadError(false);
    let result;
    try {
      result = await withPromiseTimeout(
        supabase.from("professionals").select("*").eq("profile_id", user.id).maybeSingle(),
        8_000,
        "dashboard-professional-timeout",
      );
    } catch (error) {
      if (requestSequence !== proFetchSequenceRef.current) return null;
      console.error("[dashboard] professional load timed out or failed", error);
      if (!silent) {
        setProLoadError(true);
        setLoading(false);
      }
      return null;
    }
    const { data, error } = result;

    // A slower request started before a save must never overwrite the freshly
    // saved professional data when it finishes later.
    if (requestSequence !== proFetchSequenceRef.current) return data;
    setPro((current) => JSON.stringify(current) === JSON.stringify(data) ? current : data);
    cacheDashboardBootstrap({ pro: data });
    if (data) {
      setNoProTries(0);
    }
    if (error) {
      console.error("[dashboard] professional load failed:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      if (!silent) setProLoadError(true);
    } else if (!data && !silent) {
      setNoProTries((n) => n + 1);
    }
    if (!silent) setLoading(false);
    return data;
  }, [cacheDashboardBootstrap, setLoading, setNoProTries, setPro, setProLoadError, user]);

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
      queueMicrotask(() => {
        setPro(cached.pro as ProData | null);
        setProfile(cached.profile);
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
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const loadUnread = () => supabase
      .from("notifications")
      .select("type")
      .eq("user_id", user.id)
      .eq("read", false)
      .then(({ data }) => {
        let pro = 0, cli = 0, neu = 0;
        for (const n of data ?? []) {
          const ctx = notificationContext(n.type as string);
          if (ctx === "professional") pro++;
          else if (ctx === "client") cli++;
          else neu++;
        }
        setUnreadCount((mode === "offer" ? pro : cli) + neu);
      });
    loadUnread();
    window.addEventListener("notificationsChanged", loadUnread);
    return () => {
      window.removeEventListener("notificationsChanged", loadUnread);
    };
  }, [user, mode]);

  // Unread opportunities deserve a front-door modal even when the user did not
  // arrive through the explicit post-login redirect.
  // Unread support replies: badge on the Soporte sidebar item.
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const loadSupportUnread = () => supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("type", "support_reply")
      .eq("read", false)
      .then(({ count }) => setSupportUnread(count ?? 0));
    loadSupportUnread();
    window.addEventListener("notificationsChanged", loadSupportUnread);
    return () => {
      window.removeEventListener("notificationsChanged", loadSupportUnread);
    };
  }, [user]);

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

  const clearOpportunityWelcomeParam = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("welcomeOpportunities") && !params.has("welcomeOpportunityCount")) return;

    params.delete("welcomeOpportunities");
    params.delete("welcomeOpportunityCount");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
  }, []);

  useEffect(() => {
    if (
      !shouldCheckOpportunityWelcome ||
      authLoading ||
      loading ||
      !user ||
      !pro ||
      opportunityWelcomeCheckedRef.current
    ) {
      return;
    }

    opportunityWelcomeCheckedRef.current = true;
    let mounted = true;

    if (opportunityWelcomeParamCount > 0) {
      queueMicrotask(() => {
        if (!mounted) return;
        setOpportunityWelcomeKeys([]);
        setOpportunityWelcomeCount(opportunityWelcomeParamCount);
        clearOpportunityWelcomeParam();
      });
      return () => {
        mounted = false;
      };
    }

    fetch("/api/projects?role=professional", { cache: "no-store" })
      .then(async (res) => (res.ok ? res.json() : { projects: [] }))
      .then((data) => {
        if (!mounted) return;
        const projects: OpportunityProjectSummary[] = Array.isArray(data?.projects) ? data.projects : [];
        const keys = projects.map(opportunityProjectKey).filter((key): key is string => !!key);
        if (keys.length > 0) {
          setOpportunityWelcomeKeys(keys);
          setOpportunityWelcomeCount(keys.length);
        }
      })
      .catch((error) => {
        console.error("[dashboard] opportunity welcome load failed:", error);
      })
      .finally(() => {
        if (!mounted) return;
        clearOpportunityWelcomeParam();
      });

    return () => {
      mounted = false;
    };
  }, [authLoading, clearOpportunityWelcomeParam, loading, opportunityWelcomeParamCount, pro, shouldCheckOpportunityWelcome, user]);

  function scrollDashboardToPageTop() {
    const scrollTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    scrollTop();
    requestAnimationFrame(() => {
      scrollTop();
      requestAnimationFrame(scrollTop);
    });
  }

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
      window.history.replaceState(null, "", `${window.location.pathname}?tab=sent_bookings&mode=use`);
      scrollDashboardToPageTop();
      return;
    }
    setMobilePanelOpen(false);
    if (!preserveCompletionFlow) {
      clearCompletionFlow();
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
    window.history.pushState(null, "", `${window.location.pathname}?tab=${tab}`);
    // Reset to the top of the new section INSTANTLY via the window. A smooth scrollIntoView
    // fought the fixed mobile bottom bar (its backdrop-blur made "Más" flicker / feel covered
    // during the animated scroll); an instant window scroll never interferes with it.
    scrollDashboardToPageTop();
  }

  function openProfileVerification() {
    if (!isProvider) {
      setTab("sent_bookings");
      return;
    }
    if (isProvider && mode !== "offer") setMode("offer");
    setProfileFocus({ field: "verification", key: nextFocusKey() });
    window.history.pushState(null, "", `${window.location.pathname}?tab=profile&mode=offer`);
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
      if (field) setPendingProfileFocusField(field);
      window.history.pushState(null, "", `${window.location.pathname}?tab=profile&mode=offer`);
      scrollDashboardToPageTop();
      return;
    }
    if (field && tab === "services") {
      setPendingServiceFocusField(field);
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
    setMobileProfileSectionTitle(null);
    setProfileFocus(null);
    setServiceFocus(null);
    setPendingProfileFocusField(null);
    setPendingServiceFocusField(null);
    if (clearFlow) clearCompletionFlow();
    setMode("offer");
    if (typeof window !== "undefined") {
      window.history.pushState(null, "", `${window.location.pathname}?tab=completion&mode=offer`);
    }
    scrollDashboardToPageTop();
  }

  // The mode switch now lives in the panel header (sprint 518). Switching flips the global
  // mode AND lands on the destination mode's MAIN tab, which re-asserts the mode via the
  // urlForcedMode effect, so a switch from ANY section (incl. a mode-specific one) sticks.
  function handleSwitchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setTab(next === "offer" ? "bookings" : "sent_bookings");
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

    setTab("home", true);
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
      const preparedFile = await prepareImageForUpload(file, { maxDimension: 1200 });
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
      window.alert(locale === "en" ? "Could not update the profile photo." : "No se pudo actualizar la foto de perfil.");
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
      window.alert(locale === "en" ? "Could not remove the profile photo." : "No se pudo eliminar la foto de perfil.");
    } finally {
      setHeaderPhotoUploading(false);
    }
  }

  function dismissOpportunityWelcome() {
    opportunityWelcomeDismissedRef.current = true;
    if (user) rememberSeenOpportunityKeys(user.id, opportunityWelcomeKeys);
    setOpportunityWelcomeCount(null);
    setOpportunityWelcomeKeys([]);
    clearOpportunityWelcomeParam();
  }

  function closeOpportunityWelcome() {
    dismissOpportunityWelcome();
  }

  function viewOpportunityWelcome() {
    dismissOpportunityWelcome();
    if (mode !== "offer") setMode("offer");
    setTab("proposals");
  }

  // Never render the client dashboard as a temporary fallback for an account
  // marked as a provider whose professional row is still missing. Keep the
  // route behind the loading guard while fetchPro retries, then the effect
  // below sends the account straight to professional registration.
  const professionalRecordResolving = !!user && canOffer(user) && !pro && !proLoadError;
  if (isSigningOut()) return null;
  if (authLoading || loading || !user || (pendingProfessionalSignup && !pro) || professionalRecordResolving) {
    return <DashboardRouteLoading />;
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
  const compactHeaderName = compactDisplayName(displayName);
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
  // Drives the "Verificado" badge below the name, the SAME badge the pro side uses.
  const clientVerified =
    profile?.client_identity_status === "verified" &&
    !!profile?.cedula &&
    detectIdType(String(profile.cedula)) === "cedula";

  // Offer mode without a pro row: a genuine seeker sees the activation gate only
  // after the professional lookup finished; until then the panel shell stays visible.
  const showOfferGate = !loading && mode === "offer" && !pro && !canOffer(user);

  // Keep the primary dashboard navigation focused. Shared surfaces like chat,
  // notifications and support stay routable from the navbar or direct links
  // instead of competing with the core panel tasks.
  const modeTabs = mode === "offer" ? OFFER_TABS : USE_TABS;
  const sidebarTabs = modeTabs;
  const desktopSidebarTabs = sidebarTabs.filter((tab) => tab !== "guides");
  const mobileSectionTabs = sidebarTabs;
  const mobileFullScreenTab = activeTab !== "home";
  const mobileSectionOpen = activeTab !== "home" || mobilePanelOpen;
  const singleSurfaceTab = activeTab === "profile";
  const profileCompletionPercent = proForCompletion ? computeCompletion(proForCompletion).percent : null;
  const showProfileCompletion =
    mode === "offer" &&
    !!proForCompletion &&
    ((profileCompletionPercent ?? 0) < 100 || proForCompletion.verification_status !== "verified");

  function panelTabLabel(tab: Tab) {
    return PANEL_TAB_LABELS[tab]?.[locale === "en" ? "en" : "es"] ?? t(`tabs.${tab}`);
  }

  function openPanelDestination(tab: Tab) {
    setTab(tab);
  }

  function panelModeTitle() {
    return mode === "offer" ? t("panelProfessional") : t("panelClient");
  }

  function changePanelFromHeader(nextMode: Mode) {
    if (nextMode === mode) return;
    const isResponsivePanel = typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;
    if (!isResponsivePanel) {
      handleSwitchMode(nextMode);
      return;
    }
    setMode(nextMode);
    setMobilePanelOpen(false);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", "home");
    params.delete("mode");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    scrollDashboardToPageTop();
  }

  function panelModeSelector() {
    if (!isProvider) return null;

    const options: Array<{ value: Mode; label: string; icon: React.ReactNode }> = [
      {
        value: "use",
        label: locale === "en" ? "Client panel" : "Panel cliente",
        icon: <User className="h-4 w-4" />,
      },
      {
        value: "offer",
        label: locale === "en" ? "Professional panel" : "Panel profesional",
        icon: <BriefcaseBusiness className="h-4 w-4" />,
      },
    ];

    return (
      <details data-panel-mode-selector className="group relative z-30 w-full">
        <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-3 rounded-none bg-white px-4 text-left text-[15px] font-semibold text-[#162543] transition-colors hover:bg-[#f8fbfd] lg:px-5 lg:text-[14px] lg:font-semibold [&::-webkit-details-marker]:hidden">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eef8fc] text-[#009FD9]">
            {mode === "offer" ? <BriefcaseBusiness className="h-4 w-4" /> : <User className="h-4 w-4" />}
          </span>
          <span className="min-w-0 flex-1 truncate">{panelModeTitle()}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[#64748b] transition-transform group-open:rotate-180" />
        </summary>

        <div className="absolute left-0 right-0 top-full overflow-hidden rounded-b-xl border border-t-0 border-[#dfe8f0] bg-white p-1.5 pt-1 shadow-[0_16px_36px_-18px_rgba(15,23,42,0.45)]">
          {options.map((option) => {
            const active = option.value === mode;
            return (
              <button
                key={option.value}
                type="button"
                onClick={(event) => {
                  event.currentTarget.closest("details")?.removeAttribute("open");
                  if (!active) requestUnsavedAction(() => changePanelFromHeader(option.value));
                }}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold transition-colors",
                  active ? "bg-[#eef8fc] text-[#007eae]" : "text-[#162543] hover:bg-[#f4f7f9]",
                )}
              >
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-current">
                  {option.icon}
                </span>
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {active && <Check className="h-4 w-4 shrink-0" />}
              </button>
            );
          })}
        </div>
      </details>
    );
  }

  function navButton(tab: Tab) {
    const badge = tab === "notifications" ? unreadCount : tab === "soporte" ? supportUnread : tab === "chat" ? chatUnread : 0;
    const label = panelTabLabel(tab);
    return (
      <button
        key={tab}
        data-testid={`panel-tab-${tab}`}
        onClick={() => {
          if (tab === "guides") {
            setGuidesOpen(true);
            return;
          }
          requestUnsavedAction(() => openPanelDestination(tab));
        }}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left",
          activeTab === tab ? "bg-[#EBF5FB] text-[#009FD9]" : "text-[#374151] hover:bg-[#f3f4f6]"
        )}
      >
        <span className="relative mr-1.5 inline-flex shrink-0">
          {TAB_ICONS[tab]}
          {badge > 0 && (
            <span className="absolute -right-2.5 -top-2 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-[#009FD9] px-1 text-center text-[9px] font-bold leading-none text-white ring-2 ring-white">
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </span>
        {label}
      </button>
    );
  }

  function topNavButton(tab: Tab) {
    const badge = tab === "notifications" ? unreadCount : tab === "soporte" ? supportUnread : tab === "chat" ? chatUnread : 0;
    const label = panelTabLabel(tab);
    return (
      <button
        key={tab}
        type="button"
        data-testid={`panel-tab-${tab}`}
        onClick={() => {
          if (tab === "guides") {
            setGuidesOpen(true);
            return;
          }
          requestUnsavedAction(() => openPanelDestination(tab));
        }}
        className={cn(
          "relative inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl px-1.5 text-[12px] font-bold transition min-[1180px]:h-11 min-[1180px]:px-2 min-[1180px]:text-[12.5px] xl:px-2.5 xl:text-[13px]",
          activeTab === tab
            ? "text-[#0089bb]"
            : "text-[#526277] hover:bg-[#f3f7fa] hover:text-[#162543]",
        )}
      >
        <span className="relative inline-flex shrink-0">
          {TAB_ICONS[tab]}
          {badge > 0 && (
            <span className="absolute -right-2.5 -top-2 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-[#009FD9] px-1 text-center text-[9px] font-bold leading-none text-white ring-2 ring-white">
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </span>
        <span className="whitespace-nowrap">{label}</span>
      </button>
    );
  }

  function desktopSidebarButton(tab: Tab) {
    const badge = tab === "notifications" ? unreadCount : tab === "soporte" ? supportUnread : tab === "chat" ? chatUnread : 0;
    const label = panelTabLabel(tab);
    return (
      <button
        key={tab}
        type="button"
        data-testid={`panel-tab-${tab}`}
        onClick={() => {
          if (tab === "guides") {
            setGuidesOpen(true);
            return;
          }
          requestUnsavedAction(() => openPanelDestination(tab));
        }}
        className={cn(
          "relative flex min-h-[54px] w-full items-center gap-3 px-5 py-3 text-left text-[14px] font-semibold transition-colors",
          activeTab === tab
            ? "bg-[#f6fbfe] text-[#009FD9]"
            : "text-[#162543] hover:bg-[#f8fbfd] hover:text-[#009FD9]"
        )}
      >
        <span className={cn(
          "relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors [&>svg]:h-4.5 [&>svg]:w-4.5",
          activeTab === tab ? "bg-[#EBF5FB] text-[#009FD9]" : "text-[#64748b]",
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
          <div className="overflow-hidden rounded-[22px] border border-[#dfe8f0] bg-white shadow-[0_12px_34px_-28px_rgba(15,23,42,0.55)]">
            <div className="flex flex-col">
              <nav className="flex flex-col divide-y divide-[#eef3f7]">
                {panelModeSelector()}
                {desktopSidebarTabs.map(desktopSidebarButton)}
              </nav>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  function mobileSectionButton(tab: Tab) {
    const label = panelTabLabel(tab);
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
          if (tab === "guides") {
            setGuidesOpen(true);
            return;
          }
          requestUnsavedAction(() => openPanelDestination(tab));
        }}
        className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left text-[15px] font-semibold text-[#162543] transition-colors hover:bg-[#f8fbfd]"
      >
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#64748b] [&>svg]:h-5 [&>svg]:w-5">
          {TAB_ICONS[tab]}
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </button>
    );
  }

  function mobileUtilityButton({
    keyName,
    label,
    icon,
    onClick,
    danger = false,
  }: {
    keyName: string;
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    danger?: boolean;
  }) {
    return (
      <button
        key={keyName}
        type="button"
        onClick={onClick}
        className={cn(
          "flex min-h-14 w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-[15px] font-semibold transition-colors",
          danger
            ? "text-[#b91c1c] hover:bg-[#fef2f2]"
            : "text-[#374151] hover:bg-[#f8fbfd]",
        )}
      >
        <span
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center [&>svg]:h-5 [&>svg]:w-5",
            danger ? "text-[#b91c1c]" : "text-[#64748b]",
          )}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </button>
    );
  }

  function identityBadge() {
    if (clientVerified || pro?.verification_status === "verified") {
      return (
        <span
          aria-label={t("identityVerified")}
          title={t("identityVerified")}
          className="inline-flex shrink-0 text-[#009FD9]"
        >
          <CheckCircle2 aria-hidden="true" className="h-4 w-4 sm:h-5 sm:w-5" />
        </span>
      );
    }
    // The header badge is a positive trust signal only. Pending, rejected and
    // unverified states belong in the verification section, where there is room
    // to explain the next step without shortening the account name.
    return null;
  }

  // The proxy normally handles this before the page is served. Keep this
  // client-side guard for SPA transitions and stale prefetched dashboard trees.
  if (!authLoading && user && pendingProfessionalSignup) {
    return <DashboardRouteLoading />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#fafafa]">
      <Navbar mobileSearch={false} />
      <QuickGuidesModal
        open={guidesOpen}
        onClose={() => setGuidesOpen(false)}
        isProvider={isProvider}
        onGo={(guide) => {
          requestUnsavedAction(() => {
            if (guide.targetMode) setMode(guide.targetMode);
            setTab(guide.actionTab ?? "home");
          });
        }}
      />
      {networkModal && (
        <FollowNetworkTab initialView={networkModal} onBack={() => setNetworkModal(null)} />
      )}
      {opportunityWelcomeCount !== null && (
        <div className="app-modal-screen app-centered-modal-screen fixed inset-0 z-[90] flex items-center justify-center bg-[#0f172a]/45 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="opportunity-welcome-title"
            aria-describedby="opportunity-welcome-body"
            className="app-centered-modal relative max-h-[calc(var(--app-visual-viewport-height)-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl bg-white px-5 py-6 text-center shadow-[0_24px_80px_rgba(15,23,42,0.28)] sm:px-6"
          >
            <button
              type="button"
              onClick={closeOpportunityWelcome}
              aria-label={t("opportunityWelcome.close")}
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#9ca3af] transition-colors hover:bg-[#f3f4f6] hover:text-[#374151]"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#EBF5FB] text-[#009FD9] ring-1 ring-inset ring-[#009FD9]/15">
              <Handshake className="h-7 w-7" />
            </div>
            <h2 id="opportunity-welcome-title" className="mx-auto max-w-[22rem] text-xl font-bold leading-tight text-[#111827] sm:text-[22px]">
              {t("opportunityWelcome.title", { count: opportunityWelcomeCount })}
            </h2>
            <p id="opportunity-welcome-body" className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[#6b7280]">
              {t("opportunityWelcome.body")}
            </p>

            <div className="mt-6 flex flex-col-reverse items-stretch justify-center gap-2 sm:flex-row sm:items-center">
              <Button type="button" variant="outline" onClick={closeOpportunityWelcome} className="w-full sm:w-auto sm:min-w-[96px]">
                {t("opportunityWelcome.later")}
              </Button>
              <Button type="button" onClick={viewOpportunityWelcome} className="w-full sm:w-auto sm:min-w-[170px]">
                {t("opportunityWelcome.view")}
              </Button>
            </div>
          </div>
        </div>
      )}
      <main className={cn(
        "flex-1 min-h-[calc(100svh-88px)]",
        mobileSectionOpen && "bg-white lg:bg-[#fafafa]",
        mobileFullScreenTab && "bg-white lg:bg-[#fafafa]",
      )}>
        <div className={cn(
          "dashboard-panel-content mx-auto max-w-7xl px-4 pb-6 pt-6 sm:px-6 lg:px-8 lg:pb-8 lg:pt-8",
          mobileSectionOpen && "px-0 pt-0 sm:px-0 lg:px-8 lg:pt-8",
          mobileFullScreenTab && "max-w-none px-0 pb-0 pt-0 sm:px-0 lg:max-w-7xl lg:px-8 lg:pb-8 lg:pt-8",
        )}>
          {/* Header card - identity and status grouped in one surface on desktop. */}
          <div className={cn("mx-auto mb-6 w-full max-w-[79.5rem]", mobileSectionOpen ? "hidden lg:block" : "block")}>
            <div className="rounded-2xl border border-[#dfe8f0] bg-white px-4 py-4 shadow-sm sm:px-6 sm:py-5">
            <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-5">
              <div ref={headerPhotoMenuRef} className="relative h-[72px] w-[72px] shrink-0 sm:h-20 sm:w-20">
                <button
                  type="button"
                  onClick={() => setHeaderPhotoMenuOpen((open) => !open)}
                  disabled={headerPhotoUploading}
                  className="relative block h-[72px] w-[72px] rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-[#009FD9] focus-visible:ring-offset-2 disabled:opacity-70 sm:h-20 sm:w-20"
                  aria-label={locale === "en" ? "Profile photo options" : "Opciones de foto de perfil"}
                >
                  <Avatar className="h-[72px] w-[72px] bg-transparent sm:h-20 sm:w-20">
                    <AvatarImage src={headerAvatar ?? undefined} />
                    <AvatarFallback className="bg-[#EBF5FB] text-lg font-bold text-[#009FD9]">
                      {getInitials(displayName || "?")}
                    </AvatarFallback>
                  </Avatar>
                  <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#009FD9] text-white shadow-sm sm:h-7 sm:w-7">
                    {headerPhotoUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                  </span>
                </button>
                {headerPhotoMenuOpen && (
                  <div className="absolute left-0 top-[calc(100%+0.5rem)] z-40 w-56 overflow-hidden rounded-xl border border-[#dbe7ef] bg-white py-1 shadow-xl">
                    {headerAvatar && (
                      <button type="button" onClick={() => { setHeaderPhotoMenuOpen(false); setHeaderPhotoPreviewOpen(true); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-[#162543] transition-colors hover:bg-[#f8fafc]">
                        <Eye className="h-4 w-4 text-[#009FD9]" />
                        {locale === "en" ? "View photo" : "Ver foto"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setHeaderPhotoMenuOpen(false); headerPhotoInputRef.current?.click(); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-[#162543] transition-colors hover:bg-[#f8fafc]"
                    >
                      <Camera className="h-4 w-4 text-[#009FD9]" />
                      {headerAvatar ? (locale === "en" ? "Change photo" : "Cambiar foto") : (locale === "en" ? "Add photo" : "Agregar foto")}
                    </button>
                    {headerAvatar && (
                      <button
                        type="button"
                        onClick={() => void handleHeaderPhotoRemove()}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        {locale === "en" ? "Remove photo" : "Eliminar foto"}
                      </button>
                    )}
                  </div>
                )}
                <input
                  ref={headerPhotoInputRef}
                  type="file"
                  accept={IMAGE_ACCEPT}
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.currentTarget.value = "";
                    if (file) void handleHeaderPhotoUpload(file);
                  }}
                />
                <ImagePreviewDialog
                  src={headerAvatar}
                  alt={locale === "en" ? "Profile photo" : "Foto de perfil"}
                  closeLabel={locale === "en" ? "Close" : "Cerrar"}
                  open={headerPhotoPreviewOpen}
                  onOpenChange={setHeaderPhotoPreviewOpen}
                />
              </div>
              <div className="min-w-0 self-center">
                <div className="flex min-w-0 items-start gap-1.5 sm:hidden">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <h1 data-testid="dashboard-identity-name" className="line-clamp-2 min-w-0 text-[16px] font-bold leading-[1.15] text-[#162543] [overflow-wrap:anywhere]" title={displayName}>
                      {displayName}
                    </h1>
                    <div className="flex shrink-0 items-center">{identityBadge()}</div>
                  </div>
                </div>
                <div className="hidden min-w-0 max-w-full flex-nowrap items-center gap-2 sm:flex">
                  <h1 className="min-w-0 shrink truncate whitespace-nowrap text-2xl font-bold leading-tight text-[#162543]" title={displayName}>
                    {compactHeaderName}
                  </h1>
                  <div className="flex shrink-0 items-center">{identityBadge()}</div>
                </div>
                <div data-testid="dashboard-identity-actions" className="mt-2 flex min-h-[36px] items-end justify-between gap-3 sm:mt-1 sm:min-h-[22px] sm:justify-start">
                  <div className="flex min-w-0 items-center">
                    <FollowNetworkSummaryLink onOpen={setNetworkModal} />
                  </div>
                  {publicProfileHref && (
                    <Link
                      href={publicProfileHref}
                      onClick={openInNewTabOnDesktop}
                      aria-label={locale === "en" ? "View public profile" : "Ver perfil público"}
                      data-testid="dashboard-mobile-view-profile"
                      className="inline-flex shrink-0 items-center gap-1 pb-0.5 text-xs font-semibold leading-normal text-[#526277] underline-offset-2 transition hover:text-[#009FD9] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9] sm:hidden"
                    >
                      <span>{locale === "en" ? "View profile" : "Ver perfil"}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 self-center text-[#162543]" />
                    </Link>
                  )}
                </div>
              </div>
              <div className="col-span-2 hidden flex-wrap items-center justify-center gap-2 border-t border-[#eef3f7] pt-3 sm:col-span-1 sm:flex sm:justify-end sm:border-t-0 sm:pt-0">
                {publicProfileHref && (
                  <Link
                    href={publicProfileHref}
                    onClick={openInNewTabOnDesktop}
                    aria-label={locale === "en" ? "View public profile" : "Ver perfil público"}
                    className="hidden h-9 items-center gap-1.5 text-sm font-bold text-[#526277] underline-offset-2 transition hover:text-[#0089bb] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9] sm:inline-flex"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {locale === "en" ? "View public profile" : "Ver perfil público"}
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => setGuidesOpen(true)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-[#526277] transition hover:bg-[#f3f7fa] hover:text-[#0089bb]"
                >
                  <FileText className="h-4 w-4" />
                  {locale === "en" ? "Guides" : "Guías"}
                </button>
                <button
                  type="button"
                  onClick={() => signOutToHome(locale)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-[#526277] transition hover:bg-[#fef2f2] hover:text-[#b91c1c]"
                >
                  <LogOut className="h-4 w-4" />
                  {locale === "en" ? "Sign out" : "Cerrar sesión"}
                </button>
              </div>
            </div>
            </div>
          </div>
          {((activeTab === "home") || (mode === "offer" && activeTab !== "completion" && activeTab !== "chat")) && !mobileProfileSectionTitle && showProfileCompletion && proForCompletion && (
            <div className="mx-auto mb-6 hidden w-full max-w-[79.5rem] empty:mb-0 lg:block lg:empty:hidden">
              <ProfileCompletion
                pro={proForCompletion}
                variant="summary"
                onViewSteps={() => setTab("completion", true)}
                onGo={(tab, field) => requestUnsavedAction(() => openCompletionTarget(tab, field))}
              />
            </div>
          )}

          {/* Offer mode, provider row still loading: spinner (avoids gate flash). */}
          {proLoadError ? (
            <Card>
              <CardContent className="px-6 py-12 flex flex-col items-center text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-500">
                  <AlertCircle className="h-7 w-7" />
                </div>
                <h2 className="text-xl font-bold text-[#111827] mb-2">
                  {locale === "en" ? "We couldn't load your panel" : "No pudimos cargar tu panel"}
                </h2>
                <p className="text-sm text-[#6b7280] max-w-md mb-6 leading-relaxed">
                  {locale === "en"
                    ? "Try again. If it continues, contact support so we can review your professional profile."
                    : "Intenta de nuevo. Si continúa, contacta soporte para revisar tu perfil profesional."}
                </p>
                <Button onClick={() => fetchPro()}>
                  {locale === "en" ? "Try again" : "Intentar de nuevo"}
                </Button>
              </CardContent>
            </Card>
          ) : /* Offer mode, not yet a provider: activation gate. */
          showOfferGate ? (
            <Card>
              <CardContent className="px-6 py-12 flex flex-col items-center text-center">
                <div className="h-16 w-16 rounded-full bg-[#EBF5FB] ring-1 ring-inset ring-[#009FD9]/20 flex items-center justify-center mb-5">
                  <Sparkles className="h-8 w-8 text-[#009FD9]" />
                </div>
                <h2 className="text-xl font-bold text-[#111827] mb-2">{t("offerGateTitle")}</h2>
                <p className="text-sm text-[#6b7280] max-w-md mb-6 leading-relaxed">{t("offerGateBody")}</p>
                <Button onClick={() => router.push("/registro/profesional")}>
                  {t("offerGateCta")} <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {activeTab !== "home" && (
                <div className="sticky top-0 z-20 grid min-h-16 grid-cols-[64px_minmax(0,1fr)_64px] items-center border-b border-[#e5e7eb] bg-white px-2 py-2 text-[#162543] lg:hidden">
                  <button
                    type="button"
                    onClick={() => {
                      requestUnsavedAction(() => {
                        if (hasActiveCompletionFlow()) {
                          if (activeTab === "profile" && mobileProfileSectionTitle) {
                            window.dispatchEvent(new Event("ccr:profile-mobile-close-section"));
                          }
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
                        if ((activeTab === "offers" || activeTab === "jobs") && externalReturnTo) {
                          router.push(`/${locale}${externalReturnTo}`);
                          return;
                        }
                        setTab("home");
                      });
                    }}
                    aria-label={t("backToPanel")}
                    className="inline-flex h-10 shrink-0 items-center gap-1 justify-self-start rounded-lg px-2 text-sm font-semibold text-[#374151] transition-colors hover:bg-[#f3f4f6]"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  {supportThreadTitle ? (
                    <h2 className="flex min-w-0 items-baseline justify-center gap-1.5 px-1 text-center text-base font-bold">
                      <span className="min-w-0 truncate">{supportThreadTitle}</span>
                      {supportThreadRef && <span className="shrink-0 text-[11px] font-semibold text-[#6b7280]">#{supportThreadRef}</span>}
                    </h2>
                  ) : (
                    <h2 className="min-w-0 truncate px-2 text-center text-base font-bold">{mobileProfileSectionTitle ?? (activeTab === "services" ? t("servicesHeading") : panelTabLabel(activeTab))}</h2>
                  )}
                  <div className="flex shrink-0 justify-self-end" />
                </div>
              )}

              <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
                {activeTab !== "home" ? desktopPanelNav() : null}
                {/* Main content, min-w-0 so a long unbroken string inside a card can't
                    grow this flex column past the available width and break the page. */}
                <div ref={contentRef} className="flex-1 min-w-0 scroll-mt-20 lg:scroll-mt-0">
                  <SaveStatusProvider>
                    <Card className={cn(
                      activeTab === "home" && "rounded-none border-0 bg-transparent shadow-none lg:hidden",
                      activeTab === "chat" && "overflow-hidden",
                      activeTab !== "chat" && activeTab !== "home" && "lg:max-w-[62rem]",
                      singleSurfaceTab && "!border-0 !bg-transparent !shadow-none",
                      mobileSectionOpen && !singleSurfaceTab && "dashboard-section-card rounded-none border-0 bg-white shadow-none lg:overflow-hidden lg:rounded-[22px] lg:border lg:border-[#dfe8f0] lg:shadow-[0_12px_34px_-28px_rgba(15,23,42,0.55)]",
                    )}>
                      {activeTab !== "chat" && activeTab !== "home" && !singleSurfaceTab && <CardHeader className="hidden border-b border-[#eef3f7] bg-white px-5 py-4 sm:px-6 lg:block">
                        <div className="relative">
                          <div className="flex min-w-0 items-center gap-2 pr-28">
                            <h2 className="min-w-0 truncate text-[17px] font-bold text-[#162543]">{activeTab === "services" ? t("servicesHeading") : panelTabLabel(activeTab)}</h2>
                          </div>
                        </div>
                        {TABS_WITH_SUBTITLE.has(activeTab) && (
                          <div className="mt-1 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <p className="text-sm text-[#6b7280]">{t(`subtitles.${activeTab}`)}</p>
                            {activeTab === "sent_projects" && (
                              <Button
                                size="sm"
                                className="hidden rounded-full px-4 lg:inline-flex"
                                onClick={() => window.dispatchEvent(new Event("contratacr:open-publish-project"))}
                              >
                                <Plus className="h-4 w-4" />
                                {tc("publishProject")}
                              </Button>
                            )}
                          </div>
                        )}
                      </CardHeader>}
                      <CardContent className={mobileSectionOpen ? cn(
                        "min-h-[calc(100svh-var(--ccr-native-header-height,124px)-var(--ccr-responsive-footer-reserve,72px)-64px)] bg-white px-4 pb-6 pt-4 sm:px-5 lg:min-h-0 lg:px-6 lg:pb-6 lg:pt-5",
                        singleSurfaceTab && "!bg-transparent lg:px-0 lg:pb-0 lg:pt-0"
                      ) : cn(
                        "px-4 pt-0 pb-4 sm:px-6 sm:pt-1 sm:pb-6",
                        activeTab === "home" && "px-0 sm:px-0",
                        singleSurfaceTab && "!bg-transparent px-0 pt-0 pb-0 sm:px-0 sm:pt-0 sm:pb-0",
                      )}>
                        {activeTab === "home" && (
                          <>
                            {showProfileCompletion && proForCompletion && !mobileProfileSectionTitle && (
                              <div className="pb-4 empty:pb-0 lg:hidden empty:hidden">
                                <ProfileCompletion
                                  pro={proForCompletion}
                                  variant="summary"
                                  onViewSteps={() => setTab("completion", true)}
                                  onGo={(tab, field) => requestUnsavedAction(() => openCompletionTarget(tab, field))}
                                />
                              </div>
                            )}
                            <div className="lg:hidden">
                              <div>
                                <div className="overflow-hidden rounded-[22px] border border-[#dfe8f0] bg-white shadow-[0_12px_34px_-28px_rgba(15,23,42,0.55)]">
                                  <div className="divide-y divide-[#eef3f7]">
                                    {panelModeSelector()}
                                    {mobileSectionTabs.map(mobileSectionButton)}
                                  </div>
                                  <div className="mx-4 border-t border-[#eef3f7]" />
                                  {mobileUtilityButton({
                                    keyName: "mobile-signout",
                                    label: locale === "en" ? "Sign out" : "Cerrar sesión",
                                    icon: <LogOut className="h-5 w-5" />,
                                    onClick: () => signOutToHome(locale),
                                    danger: true,
                                  })}
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
                              {
                                id: "verificacion",
                                title: t("tabs.verificacion"),
                                desc: t("profileSections.verificationDesc"),
                                children: (
                                  <VerificationPanel
                                    professionalId={pro.id}
                                    status={pro.verification_status ?? "pending"}
                                    reason={pro.verification_reason}
                                    currentCedula={currentCedula}
                                    noCrId={pro.no_cr_id ?? false}
                                    onSaved={() => handleSaved("section")}
                                  />
                                ),
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
                            extraSections={[
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
                            professionalId={pro.id}
                            primaryCategory={pro.category_id}
                            initialProfessions={pro.professions ?? []}
                            initialServices={pro.services ?? []}
                            onSaved={(intent) => handleSaved(intent ?? "section")}
                            focusField={serviceFocus?.field ?? null}
                            focusKey={serviceFocus?.key}
                          />
                        )}
                        {activeTab === "photos" && pro && (
                          <PhotoGallery
                            professionalId={pro.id}
                            initialUrls={pro.portfolio_urls ?? []}
                            initialItems={pro.portfolio_items ?? undefined}
                            professions={(pro.professions && pro.professions.length > 0) ? pro.professions : (pro.category_id ? [pro.category_id] : [])}
                            services={pro.services ?? []}
                            onSaved={() => handleSaved("section")}
                          />
                        )}
                        {activeTab === "availability" && pro && (
                          <AvailabilityEditor
                            professionalId={pro.id}
                            initialPublic={pro.availability_public ?? true}
                            initialContactPreference={pro.contact_preference ?? "ambas"}
                            workplaces={pro.workplaces ?? []}
                            coverageCountry={!!pro.coverage_country}
                            videoConsultationAllowed={anyVideoConsultCategory((pro.professions && pro.professions.length > 0) ? pro.professions : (pro.category_id ? [pro.category_id] : []))}
                            initialVideoConsultation={!!pro.videoconsulta}
                            onSaved={() => handleSaved("section")}
                          />
                        )}
                        {activeTab === "suscripcion" && PAYMENTS_ENABLED && <SubscriptionPanel />}
                        {activeTab === "bookings" && <BookingRequests />}
                        {activeTab === "proposals" && pro && (
                          <ProposalsTab
                            key={`proposals-${pro.id}`}
                            categoryId={pro.category_id}
                            professions={(pro.professions && pro.professions.length > 0) ? pro.professions : (pro.category_id ? [pro.category_id] : [])}
                            services={pro.services ?? []}
                          />
                        )}
                        {/* "Usar servicios", the seek capability. */}
                        {activeTab === "sent_bookings" && <ClientActivity section="bookings" />}
                        {activeTab === "sent_projects" && <ClientActivity section="projects" />}
                        {activeTab === "applications" && <ClientJobApplications />}
                        {activeTab === "saved" && <ClientActivity section="saved" />}
                        {activeTab === "connections" && <ClientConnections />}
                        {activeTab === "network" && <FollowNetworkTab onBack={() => requestUnsavedAction(() => setTab("home"))} />}
                        {activeTab === "notifications" && <NotificationsList />}
                        {activeTab === "soporte" && (
                          <SupportTickets
                            onUnreadChange={setSupportUnread}
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
                      </CardContent>
                    </Card>
                  </SaveStatusProvider>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Footer stays visible on desktop and mobile because the dashboard no longer uses
          the fixed mobile bottom tab bar. */}
      <div>
        <LandingFooter />
      </div>
    </div>
  );
}
