"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { isSigningOut } from "@/lib/auth/sign-out";
import { useSearchParams } from "next/navigation";
import {
  User, Award, CalendarCheck, CalendarClock, CalendarDays, ExternalLink, Wrench,
  ShieldCheck, Bell, Handshake, ClipboardList, Bookmark, Settings, Headset, CreditCard,
  ArrowRight, Bot, Sparkles, Repeat2, Plus, AlertCircle, X, MessageSquareMore, Home, Search,
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
import { SaveStatusProvider, HeaderSaveStatus } from "@/components/dashboard/save-status-context";
import { BookingRequests } from "@/components/dashboard/pro/booking-requests";
import { ProposalsTab } from "@/components/dashboard/pro/proposals-tab";
import { VerificationPanel } from "@/components/dashboard/pro/verification-panel";
import { ClientActivity } from "@/components/dashboard/client-activity";
import { applyPendingSavedPro } from "@/components/professionals/save-button";
import { BasicProfileSection } from "@/components/dashboard/basic-profile-section";
import { detectIdType } from "@/lib/cedula";
import { NotificationsList } from "@/components/notifications/notifications-list";
import { AccountSecuritySection } from "@/components/account/account-security";
import { CloseAccountSection } from "@/components/account/close-account-section";
import { SupportTickets } from "@/components/support/support-tickets";
import { SubscriptionPanel } from "@/components/dashboard/pro/subscription-panel";
import { DirectChatInbox } from "@/components/dashboard/direct-chat-inbox";
import { AiConcierge } from "@/components/landing/ai-concierge";
import { PAYMENTS_ENABLED } from "@/lib/payments/config";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/utils";
import { canOffer } from "@/lib/auth/capabilities";
import { anyVideoConsultCategory } from "@/lib/data/categories";
import { useMode, type Mode } from "@/hooks/use-mode";
import { ImagePreviewDialog } from "@/components/ui/image-preview-dialog";
import { notificationContext } from "@/lib/notification-link";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { DashboardRouteLoading } from "@/components/ui/route-loading";
import { getDashboardCache, setDashboardCache } from "@/lib/dashboard-prefetch-cache";
import {
  dashboardBootstrapKey,
  type DashboardBootstrap,
  type DashboardProfileData,
} from "@/lib/dashboard-bootstrap-cache";

// ONE unified panel for every account (Airbnb model). A MODE SWITCH flips between
// "Usar servicios" (the seek capability — always available) and "Ofrecer servicios"
// (the offer capability — unlocked by completing the professional profile). There
// is no separate client panel; everyone lives here.
type Tab =
  | "home" | "profile" | "services" | "photos" | "availability" | "bookings" | "proposals" | "verificacion"
  | "suscripcion"
  | "sent_bookings" | "sent_projects" | "saved"
  | "chat" | "assistant" | "notifications" | "soporte" | "cuenta";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProData = Record<string, any>;
type ProPanelTranslator = ReturnType<typeof useTranslations>;

function DashboardHomePanel({
  mode,
  isProvider,
  t,
  onSwitchMode,
  onViewPublicProfile,
  onSearch,
  onPublish,
}: {
  mode: Mode;
  isProvider: boolean;
  t: ProPanelTranslator;
  onSwitchMode: (mode: Mode) => void;
  onViewPublicProfile?: () => void;
  onSearch: () => void;
  onPublish: () => void;
}) {
  const isOffer = mode === "offer";
  const nextMode: Mode = isOffer ? "use" : "offer";
  return (
    <div className="rounded-2xl border border-[#c7eafb] bg-[#f8fbfd] p-5 shadow-sm sm:p-6">
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white text-[#009FD9] ring-1 ring-inset ring-[#009FD9]/15">
          <Repeat2 className="h-6 w-6" />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#009FD9]">
          {isOffer ? t("home.offerEyebrow") : t("home.useEyebrow")}
        </p>
        <h2 className="mt-1 text-xl font-bold text-[#111827] sm:text-2xl">{isOffer ? t("home.offerTitle") : t("home.useTitle")}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#4b5563]">
          {isOffer ? t("home.offerBody") : t("home.useBody")}
        </p>
        <div className="mt-6 flex w-full flex-col justify-center gap-2 sm:w-auto sm:flex-row">
          {isProvider && (
            <Button type="button" onClick={() => onSwitchMode(nextMode)} className="w-full bg-[#009FD9] text-white hover:bg-[#0089BB] sm:w-auto">
              <Repeat2 className="h-4 w-4" />
              {isOffer ? t("home.switchToUse") : t("home.switchToOffer")}
            </Button>
          )}
          {isOffer && onViewPublicProfile && (
            <Button type="button" variant="outline" onClick={onViewPublicProfile} className="w-full sm:w-auto">
              <ExternalLink className="h-4 w-4" />
              {t("viewPublicProfile")}
            </Button>
          )}
          {!isOffer && (
            <>
              <Button type="button" variant={isProvider ? "outline" : "default"} onClick={onSearch} className={cn("w-full sm:w-auto", !isProvider && "bg-[#009FD9] text-white hover:bg-[#0089BB]")}>
                <Search className="h-4 w-4" />
                {t("home.actions.search.title")}
              </Button>
              <Button type="button" variant="outline" onClick={onPublish} className="w-full sm:w-auto">
                <Plus className="h-4 w-4" />
                {t("home.actions.publish.title")}
              </Button>
            </>
          )}
        </div>
        {!isProvider && (
          <div className="mt-4 rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm leading-relaxed text-[#6b7280]">
            {t("home.clientOnlyHint")}
          </div>
        )}
      </div>
    </div>
  );
}

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
  saved: <Bookmark className="h-4 w-4" />,
  chat: <MessageSquareMore className="h-4 w-4" />,
  assistant: <Bot className="h-4 w-4" />,
  notifications: <Bell className="h-4 w-4" />,
  soporte: <Headset className="h-4 w-4" />,
  cuenta: <Settings className="h-4 w-4" />,
};

// Tabs that show a one-line context note under the section title.
const TABS_WITH_SUBTITLE = new Set<Tab>(["bookings", "proposals", "sent_bookings", "sent_projects", "saved"]);

// Mode membership. The first three render only in "offer" mode, the next three
// only in "use" mode; "profile" + the shared tabs are valid in both, so the mode
// for those is taken from the URL (?mode=) or defaults to the account's capability.
const OFFER_ONLY = new Set<Tab>(["services", "photos", "availability", "bookings", "proposals", "verificacion", "suscripcion"]);
const USE_ONLY = new Set<Tab>(["sent_bookings", "sent_projects", "saved"]);

// Sidebar order per mode (+ a shared block appended below).
const OFFER_TABS: Tab[] = [
  "home", "bookings", "proposals", "services", "profile",
  ...(PAYMENTS_ENABLED ? (["suscripcion"] as Tab[]) : []),
];
const USE_TABS: Tab[] = ["home", "sent_bookings", "sent_projects", "profile", "saved"];
const SHARED_TABS: Tab[] = ["chat", "assistant", "notifications", "soporte"];

// MOBILE bottom-nav: five fixed, native-app style destinations.
const MOBILE_PRIORITY: Record<Mode, Tab[]> = {
  offer: ["home", "bookings", "proposals", "services", "profile"],
  use: ["home", "sent_bookings", "sent_projects", "saved", "profile"],
};
const OPPORTUNITY_MODAL_SEEN_STORAGE_PREFIX = "contratacr:seen-opportunity-modal";

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
  const shouldCheckOpportunityWelcome = searchParams.get("welcomeOpportunities") === "1";
  const opportunityWelcomeParamCount = Math.max(0, Number.parseInt(searchParams.get("welcomeOpportunityCount") ?? "0", 10) || 0);
  const searchParamsKey = searchParams.toString();

  const [pro, setPro] = useState<ProData | null>(null);
  const [profile, setProfile] = useState<DashboardProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [supportUnread, setSupportUnread] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);
  const [profileFocus, setProfileFocus] = useState<{ field: string; key: number } | null>(null);
  const [serviceFocus, setServiceFocus] = useState<{ field: string; key: number } | null>(null);
  const [proLoadError, setProLoadError] = useState(false);
  const [opportunityWelcomeCount, setOpportunityWelcomeCount] = useState<number | null>(null);
  const [opportunityWelcomeKeys, setOpportunityWelcomeKeys] = useState<string[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);
  const chatContentRef = useRef<HTMLDivElement>(null);
  const opportunityWelcomeCheckedRef = useRef(false);
  const opportunityWelcomeDismissedRef = useRef(false);
  const [noProTries, setNoProTries] = useState(0);
  const focusKeyRef = useRef(0);
  const bootstrapHydratedForRef = useRef<string | null>(null);
  const nextFocusKey = useCallback(() => {
    focusKeyRef.current += 1;
    return focusKeyRef.current;
  }, []);

  // The account CAN offer if it has a professional profile (authoritative once
  // loaded) — fall back to the metadata capability for an instant first paint.
  const isProvider = !!pro || canOffer(user);
  const pendingProfessionalSignup =
    user?.user_metadata?.professional_signup_started === true &&
    user.user_metadata?.is_provider !== true;

  // Airbnb FULL switch: the active mode is the GLOBAL (persisted) mode shared with the
  // navbar + bell. A mode-specific tab in the URL (a deep link from a notification or a
  // navbar quick link) overrides it — and is persisted below so everything stays in sync.
  // A non-provider has no offer world → always "use".
  const { mode: globalMode, setMode } = useMode(isProvider);
  const urlForcedMode: Mode | null =
    legacyVerificationTab ? "offer" : requestedTab && OFFER_ONLY.has(requestedTab) ? "offer" : requestedTab && USE_ONLY.has(requestedTab) ? "use" : urlModeParam;
  const mode: Mode = !isProvider ? "use" : urlForcedMode ?? globalMode;
  const activeTab: Tab = requestedTab ?? "home";

  // When a deep link forces a mode, adopt it globally so the navbar switch + bell follow.
  useEffect(() => {
    if (isProvider && urlForcedMode && urlForcedMode !== globalMode) setMode(urlForcedMode);
  }, [isProvider, urlForcedMode, globalMode, setMode]);

  useEffect(() => {
    if (!legacyVerificationTab) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "profile");
    params.set("mode", "offer");
    params.set("focus", "verification");
    router.replace(`/dashboard/profesional?${params.toString()}`, { scroll: false });
  }, [legacyVerificationTab, searchParams, router]);

  // Suppress the login-redirect while signing out (from the navbar menu) → straight
  // to main, no /login flash. Logout lives only in the navbar profile menu now.
  useEffect(() => {
    if (!authLoading && !user && !isSigningOut()) router.push("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (authLoading || !user) return;
    applyPendingSavedPro();
  }, [authLoading, user]);

  useEffect(() => {
    if (authLoading || loading || !user || pro || !pendingProfessionalSignup) return;
    router.replace("/registro/profesional");
  }, [authLoading, loading, pendingProfessionalSignup, pro, router, user]);

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
    const id = window.setInterval(onChanged, 30000);
    return () => {
      stopped = true;
      window.removeEventListener("notificationsChanged", onChanged);
      window.clearInterval(id);
      void supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchPro = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!user) return;
    const supabase = createClient();
    setProLoadError(false);
    const { data, error } = await supabase
      .from("professionals")
      .select("*")
      .eq("profile_id", user.id)
      .maybeSingle();

    setPro(data);
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
  }, [cacheDashboardBootstrap, user]);

  const fetchProfile = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const { data } = await supabase.rpc("get_my_profile");
    if (data) {
      setProfile(data);
      cacheDashboardBootstrap({ profile: data });
    }
  }, [cacheDashboardBootstrap, user]);

  useEffect(() => {
    if (!user) return;
    const firstLoadForUser = bootstrapHydratedForRef.current !== user.id;
    bootstrapHydratedForRef.current = user.id;
    const cached = firstLoadForUser
      ? getDashboardCache<DashboardBootstrap>(dashboardBootstrapKey(user.id))
      : null;
    if (cached && firstLoadForUser) {
      queueMicrotask(() => {
        setPro(cached.pro as ProData | null);
        setProfile(cached.profile);
        setLoading(false);
        void fetchPro({ silent: true });
      });
      return;
    }
    queueMicrotask(() => fetchPro({ silent: !firstLoadForUser }));
  }, [user, refreshKey, fetchPro]);

  // Base profile (name/avatar) for the header — works for seekers with no pro row.
  useEffect(() => {
    if (!user) return;
    queueMicrotask(() => fetchProfile());
    window.addEventListener("ccr:profile-updated", fetchProfile);
    return () => window.removeEventListener("ccr:profile-updated", fetchProfile);
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
    const id = window.setInterval(refreshVerificationState, 15000);
    return () => {
      stopped = true;
      window.removeEventListener("focus", refreshVerificationState);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(id);
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
    const id = window.setInterval(loadUnread, 3000);
    return () => {
      window.removeEventListener("notificationsChanged", loadUnread);
      window.clearInterval(id);
    };
  }, [user, mode]);

  // Unread opportunities deserve a front-door modal even when the user did not
  // arrive through the explicit post-login redirect.
  // Unread support replies → badge on the Soporte sidebar item.
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
    const id = window.setInterval(loadSupportUnread, 3000);
    return () => {
      window.removeEventListener("notificationsChanged", loadSupportUnread);
      window.clearInterval(id);
    };
  }, [user]);

  // Inconsistent state ONLY: metadata says this account can offer, but no pro row
  // exists yet. A freshly-created pro account can lag (replication/RLS) — retry a
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

  function setTab(tab: Tab) {
    if (tab === "verificacion") {
      openProfileVerification();
      return;
    }
    if (tab === activeTab) return;
    if (OFFER_ONLY.has(tab)) setMode("offer");
    if (USE_ONLY.has(tab)) setMode("use");
    // Mode is persisted globally now, so the tab alone is enough — a mode-specific tab
    // also re-asserts its mode via the effect above, keeping the navbar switch in sync.
    // Query-only panel navigation should not request the same route again.
    // Next integrates native history with useSearchParams, including Back/Forward.
    window.history.pushState(null, "", `${window.location.pathname}?tab=${tab}`);
    // Reset to the top of the new section INSTANTLY via the window. A smooth scrollIntoView
    // fought the fixed mobile bottom bar (its backdrop-blur made "Más" flicker / feel covered
    // during the animated scroll); an instant window scroll never interferes with it.
    requestAnimationFrame(() => {
      const mobile = window.matchMedia("(max-width: 1023px)").matches;
      if (tab === "chat") chatContentRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
      else if (mobile) contentRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
      else window.scrollTo({ top: 0, behavior: "auto" });
    });
  }

  function openProfileVerification() {
    if (isProvider && mode !== "offer") setMode("offer");
    setProfileFocus({ field: "verification", key: nextFocusKey() });
    window.history.pushState(null, "", `${window.location.pathname}?tab=profile&mode=offer`);
    requestAnimationFrame(() => {
      const mobile = window.matchMedia("(max-width: 1023px)").matches;
      if (mobile) contentRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
      else window.scrollTo({ top: 0, behavior: "auto" });
    });
  }

  // The mode switch now lives in the panel header (sprint 518). Switching flips the global
  // mode AND lands on the destination mode's MAIN tab — which re-asserts the mode via the
  // urlForcedMode effect, so a switch from ANY section (incl. a mode-specific one) sticks.
  function handleSwitchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setTab("home");
  }

  function handleSaved() {
    setRefreshKey((k) => k + 1);
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

  useEffect(() => {
    if (activeTab !== "chat") return;
    let secondFrame = 0;
    const frame = window.requestAnimationFrame(() => {
      chatContentRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
      secondFrame = window.requestAnimationFrame(() => {
        chatContentRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [activeTab, searchParamsKey]);

  if (authLoading || loading || !user || (pendingProfessionalSignup && !pro)) {
    return <DashboardRouteLoading />;
  }

  const proProfile = Array.isArray(pro?.profiles) ? pro?.profiles[0] : pro?.profiles;
  const displayName =
    profile?.full_name ||
    proProfile?.full_name ||
    (user.user_metadata?.full_name as string) ||
    user.email?.split("@")[0] ||
    "";
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
          avatar_url: proProfile?.avatar_url || headerAvatar || null,
        },
      }
    : pro;
  // Client (use mode) identity: verified via cédula (saved at solicitud/booking or before).
  // Drives the "Verificado" badge below the name — the SAME badge the pro side uses.
  const clientVerified =
    profile?.client_identity_status === "verified" &&
    !!profile?.cedula &&
    detectIdType(String(profile.cedula)) === "cedula";

  // Offer mode without a pro row: a genuine seeker sees the activation gate only
  // after the professional lookup finished; until then the panel shell stays visible.
  const showOfferGate = !loading && mode === "offer" && !pro && !canOffer(user);

  // Keep the primary dashboard navigation focused on five destinations. Shared
  // surfaces like chat, notifications and support stay routable from the navbar
  // or direct links instead of competing with the core panel tasks.
  const modeTabs = mode === "offer" ? OFFER_TABS : USE_TABS;
  const sidebarTabs = modeTabs;
  const barTabs: Tab[] = [...modeTabs, ...SHARED_TABS];
  const mobileBarTabs = MOBILE_PRIORITY[mode].filter((tab) => barTabs.includes(tab));
  const mobileFullScreenTab = activeTab === "assistant";
  const showProfileCompletion =
    mode === "offer" &&
    !!proForCompletion &&
    (computeCompletion(proForCompletion).percent < 100 || proForCompletion.verification_status !== "verified");

  function navButton(tab: Tab) {
    const badge = tab === "notifications" ? unreadCount : tab === "soporte" ? supportUnread : tab === "chat" ? chatUnread : 0;
    return (
      <button
        key={tab}
        data-testid={`panel-tab-${tab}`}
        onClick={() => setTab(tab)}
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
        {t(`tabs.${tab}`)}
      </button>
    );
  }

  const bottomNavItemClass =
    "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 py-1.5 transition-colors";

  function identityBadge() {
    if (clientVerified || pro?.verification_status === "verified") {
      return <Badge variant="verified">{t("identityVerified")}</Badge>;
    }
    if (!pro) return null;
    return (
      <button
        type="button"
        onClick={() => {
          openProfileVerification();
        }}
        title={t("verifyInvite")}
        className="inline-flex items-center rounded-full border border-[#e5e7eb] bg-[#f3f4f6] px-2.5 py-0.5 text-xs font-medium text-[#6b7280] hover:bg-[#e5e7eb] transition-colors"
      >
        {t("notVerifiedBadge")}
      </button>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#fafafa]">
      <Navbar />
      {opportunityWelcomeCount !== null && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#0f172a]/45 p-0 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="opportunity-welcome-title"
            aria-describedby="opportunity-welcome-body"
            className="relative w-full rounded-t-2xl bg-white px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-6 text-center shadow-[0_24px_80px_rgba(15,23,42,0.28)] sm:max-w-md sm:rounded-2xl sm:px-6 sm:pb-6"
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
      <main className="flex-1">
        <div className={cn(
          "dashboard-panel-content mx-auto max-w-7xl px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-8 sm:px-6 lg:px-8 lg:pb-8",
          mobileFullScreenTab && "max-w-none px-0 pb-0 pt-0 sm:px-0 lg:max-w-7xl lg:px-8 lg:pb-8 lg:pt-8",
        )}>
          {/* Header — clean, restrained (serious tone): a modest larger avatar with a hairline
              ring, a bold navy name, the plain "modo" eyebrow + verification badge, set off from
              the content by a single hairline divider. No gradient/decoration. */}
          <div className={cn("mb-6 flex-col gap-4 border-b border-[#e5e7eb] pb-5 sm:flex-row sm:items-start sm:justify-between", mobileFullScreenTab ? "hidden lg:flex" : "flex")}>
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <ImagePreviewDialog
                src={headerAvatar}
                alt={locale === "en" ? "Profile photo" : "Foto de perfil"}
                openLabel={locale === "en" ? "View profile photo" : "Ver foto de perfil"}
              >
                <Avatar className="h-16 w-16 shrink-0 ring-1 ring-[#e5e7eb]">
                  <AvatarImage src={headerAvatar ?? undefined} />
                  <AvatarFallback className="bg-[#EBF5FB] text-[#009FD9] font-bold text-lg">
                    {getInitials(displayName || "?")}
                  </AvatarFallback>
                </Avatar>
              </ImagePreviewDialog>
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9ca3af]">
                  {mode === "offer" ? t("panelProfessional") : t("panelClient")}
                </p>
                {/* Keep the account name on one line in responsive; very long names truncate
                    instead of pushing the header into two lines. */}
                <h1 className="truncate whitespace-nowrap text-lg font-bold leading-tight text-[#162543] sm:text-2xl" title={displayName}>
                  {displayName}
                </h1>
                <div className="mt-1.5 flex min-h-[22px] flex-wrap items-center gap-2">
                  {identityBadge()}
                </div>
              </div>
            </div>
          </div>

          {/* Offer mode, provider row still loading → spinner (avoids gate flash). */}
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
          ) : /* Offer mode, not yet a provider → activation gate. */
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
              {/* Profile-completion — offer mode only, hides itself once complete. */}
              {showProfileCompletion && !mobileFullScreenTab && (
                <ProfileCompletion
                  pro={proForCompletion}
                  onGo={(tab, field) => {
                    if (tab === "verificacion" || field === "verification") {
                      openProfileVerification();
                      return;
                    }
                    setTab(tab as Tab);
                    if (field && tab === "services") setServiceFocus({ field, key: nextFocusKey() });
                    else if (field) setProfileFocus({ field, key: nextFocusKey() });
                  }}
                />
              )}

              <div className="flex flex-col lg:flex-row gap-6">
                {/* Sidebar nav (DESKTOP only) — tabs for the active mode + a shared block.
                    On mobile this is replaced by the fixed bottom nav bar below. */}
                <nav className="hidden lg:block lg:w-60 shrink-0 space-y-3">
                  <Card>
                    <CardContent className="p-2">
                      <div>{sidebarTabs.map(navButton)}</div>
                    </CardContent>
                  </Card>

                  {/* The "Ofrecer mis servicios" invitation lives at the END of "Mi perfil"
                      (BasicProfileSection) for a client-only account — not here in the sidebar. */}
                </nav>

                {/* Main content — min-w-0 so a long unbroken string inside a card can't
                    grow this flex column past the available width and break the page. */}
                <div
                  ref={(node) => {
                    contentRef.current = node;
                    if (activeTab === "chat") chatContentRef.current = node;
                  }}
                  className="flex-1 min-w-0 scroll-mt-20 lg:scroll-mt-0"
                >
                  <SaveStatusProvider>
                    <Card className={cn(
                      activeTab === "chat" && "overflow-hidden",
                      mobileFullScreenTab && "rounded-none border-0 shadow-none lg:rounded-2xl lg:border lg:shadow-sm",
                    )}>
                      {activeTab !== "chat" && !mobileFullScreenTab && <CardHeader className="px-4 pt-4 pb-2 sm:px-6 sm:pt-6 sm:pb-3">
                        <div className="relative">
                          <div className="flex min-w-0 items-center gap-2 pr-28">
                            <h2 className="min-w-0 truncate text-lg font-semibold text-[#111827]">{activeTab === "services" ? t("servicesHeading") : t(`tabs.${activeTab}`)}</h2>
                            {activeTab === "profile" && mode === "offer" && pro?.slug && (
                              <a
                                href={`/${locale}/profesionales/${pro.slug}?preview=1`}
                                aria-label={t("viewPublicProfile")}
                                title={t("viewPublicProfile")}
                                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#009FD9]"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                          <HeaderSaveStatus />
                        </div>
                        {TABS_WITH_SUBTITLE.has(activeTab) && (
                          <div className="mt-0.5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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
                      <CardContent className={mobileFullScreenTab ? "p-0 sm:p-0" : "px-4 pt-0 pb-4 sm:px-6 sm:pt-1 sm:pb-6"}>
                        {activeTab === "home" && (
                          <DashboardHomePanel
                            mode={mode}
                            isProvider={isProvider}
                            t={t}
                            onSwitchMode={handleSwitchMode}
                            onViewPublicProfile={mode === "offer" && pro?.slug ? () => router.push(`/profesionales/${pro.slug}?preview=1`) : undefined}
                            onSearch={() => router.push("/buscar")}
                            onPublish={() => {
                              setTab("sent_projects");
                              window.setTimeout(() => window.dispatchEvent(new Event("contratacr:open-publish-project")), 80);
                            }}
                          />
                        )}

                        {/* MI PERFIL — pro editor in offer mode, basic identity in use mode. */}
                        {activeTab === "profile" && mode === "offer" && pro && (
                          <ProfileEditor
                            professionalId={pro.id}
                            profileId={user.id}
                            initial={proForEditor ?? pro}
                            onSaved={handleSaved}
                            focusField={profileFocus?.field ?? null}
                            focusKey={profileFocus?.key}
                            extraSections={[
                              {
                                id: "photos",
                                title: t("tabs.photos"),
                                desc: t("profileSections.photosDesc"),
                                children: (
                                  <PhotoGallery
                                    professionalId={pro.id}
                                    initialUrls={pro.portfolio_urls ?? []}
                                    initialItems={pro.portfolio_items ?? undefined}
                                    professions={(pro.professions && pro.professions.length > 0) ? pro.professions : (pro.category_id ? [pro.category_id] : [])}
                                    services={pro.services ?? []}
                                    onSaved={handleSaved}
                                  />
                                ),
                              },
                              {
                                id: "availability",
                                title: t("tabs.availability"),
                                desc: t("profileSections.availabilityDesc"),
                                children: (
                                  <AvailabilityEditor
                                    professionalId={pro.id}
                                    initialPublic={pro.availability_public ?? true}
                                    initialContactPreference={pro.contact_preference ?? "ambas"}
                                    workplaces={pro.workplaces ?? []}
                                    videoConsultationAllowed={anyVideoConsultCategory((pro.professions && pro.professions.length > 0) ? pro.professions : (pro.category_id ? [pro.category_id] : []))}
                                    initialVideoConsultation={!!pro.videoconsulta}
                                    onSaved={handleSaved}
                                  />
                                ),
                              },
                              {
                                id: "verificacion",
                                title: t("tabs.verificacion"),
                                desc: t("profileSections.verificationDesc"),
                                children: (
                                  <VerificationPanel
                                    professionalId={pro.id}
                                    status={pro.verification_status ?? "pending"}
                                    reason={pro.verification_reason}
                                    noCrId={pro.no_cr_id ?? false}
                                    onSaved={handleSaved}
                                  />
                                ),
                              },
                              {
                                id: "cuenta",
                                title: t("tabs.cuenta"),
                                desc: t("profileSections.accountDesc"),
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
                            onSaved={handleSaved}
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
                            onSaved={handleSaved}
                          />
                        )}
                        {activeTab === "availability" && pro && (
                          <AvailabilityEditor
                            professionalId={pro.id}
                            initialPublic={pro.availability_public ?? true}
                            initialContactPreference={pro.contact_preference ?? "ambas"}
                            workplaces={pro.workplaces ?? []}
                            videoConsultationAllowed={anyVideoConsultCategory((pro.professions && pro.professions.length > 0) ? pro.professions : (pro.category_id ? [pro.category_id] : []))}
                            initialVideoConsultation={!!pro.videoconsulta}
                            onSaved={handleSaved}
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
                        {/* "Usar servicios" — the seek capability. */}
                        {activeTab === "sent_bookings" && <ClientActivity section="bookings" />}
                        {activeTab === "sent_projects" && <ClientActivity section="projects" />}
                        {activeTab === "saved" && <ClientActivity section="saved" />}

                        {activeTab === "chat" && <DirectChatInbox />}
                        {activeTab === "assistant" && (
                          <div className="lg:hidden">
                            <AiConcierge embedded onBack={() => setTab(mode === "offer" ? "bookings" : "sent_bookings")} />
                          </div>
                        )}
                        {activeTab === "notifications" && <NotificationsList />}
                        {activeTab === "soporte" && <SupportTickets onUnreadChange={setSupportUnread} initialTicketId={searchParams.get("ticket")} />}
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

      {/* Footer — hidden on mobile inside the panel: the bottom nav bar takes its place. */}
      <div className="hidden lg:block">
        <LandingFooter />
      </div>

      {/* MOBILE bottom nav bar — a native-app tab bar (icon + label, Instagram-style). Fixed,
          thumb-reachable, always visible while in the panel; replaces the sidebar on phones.
          fixed to five items so there is no hidden horizontal navigation on phones. */}
      {!mobileFullScreenTab && <nav
        className="dashboard-mobile-nav lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-[#e5e7eb] bg-white shadow-[0_-14px_34px_-18px_rgba(15,23,42,0.45)] pb-[env(safe-area-inset-bottom)]"
        aria-label={t("title")}
      >
        <div className="relative flex min-h-[56px] items-stretch gap-0">
            {mobileBarTabs.map((tab) => {
              const badge = tab === "notifications" ? unreadCount : tab === "soporte" ? supportUnread : tab === "chat" ? chatUnread : 0;
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  data-testid={`panel-tab-${tab}`}
                  onClick={() => { setTab(tab); }}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    bottomNavItemClass,
                    "before:absolute before:left-1/2 before:top-0 before:h-0.5 before:w-8 before:-translate-x-1/2 before:rounded-b-full before:bg-[#009FD9] before:transition-opacity",
                    active ? "text-[#009FD9] before:opacity-100" : "text-[#6b7280] before:opacity-0 hover:text-[#374151]"
                  )}
                >
                  <span className="relative inline-flex [&>svg]:!h-[22px] [&>svg]:!w-[22px]">
                    {TAB_ICONS[tab]}
                    {badge > 0 && (
                      <span className="absolute -right-2.5 -top-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#009FD9] px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white">{badge > 9 ? "9+" : badge}</span>
                    )}
                  </span>
                  <span className="text-[10px] font-semibold leading-none max-w-full truncate">{t(`bottomNav.${tab}`)}</span>
                </button>
              );
            })}
        </div>
      </nav>}
    </div>
  );
}
