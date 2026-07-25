"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { isSigningOut, signOutToHome } from "@/lib/auth/sign-out";
import { useSearchParams } from "next/navigation";
import {
  User, Award, CalendarCheck, CalendarClock, CalendarDays, Wrench,
  ShieldCheck, Bell, Handshake, ClipboardList, Bookmark, Settings, Headset, CreditCard,
  ArrowLeft, ArrowRight, Bot, Sparkles, Repeat2, Plus, AlertCircle, X, MessageSquareMore, Home, LogOut, ExternalLink,
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
import { PAYMENTS_ENABLED } from "@/lib/payments/config";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/utils";
import { canOffer } from "@/lib/auth/capabilities";
import { anyVideoConsultCategory } from "@/lib/data/categories";
import { useMode, type Mode } from "@/hooks/use-mode";
import { ImagePreviewDialog } from "@/components/ui/image-preview-dialog";
import { notificationContext } from "@/lib/notification-link";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { DashboardRouteLoading } from "@/components/ui/route-loading";
import { AppTooltip } from "@/components/ui/app-tooltip";
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
  "bookings", "proposals", "services", "availability", "photos", "profile",
  ...(PAYMENTS_ENABLED ? (["suscripcion"] as Tab[]) : []),
  "soporte",
];
const USE_TABS: Tab[] = ["sent_bookings", "sent_projects", "profile", "saved", "soporte"];
const OPPORTUNITY_MODAL_SEEN_STORAGE_PREFIX = "contratacr:seen-opportunity-modal";

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
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [preferMobileMenuDefault, setPreferMobileMenuDefault] = useState(false);
  const [opportunityWelcomeCount, setOpportunityWelcomeCount] = useState<number | null>(null);
  const [opportunityWelcomeKeys, setOpportunityWelcomeKeys] = useState<string[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);
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
  const defaultTab: Tab = mode === "offer" ? "bookings" : "sent_bookings";
  const activeTab: Tab = requestedTab ?? (preferMobileMenuDefault ? "home" : defaultTab);

  // When a deep link forces a mode, adopt it globally so the navbar switch + bell follow.
  useEffect(() => {
    if (isProvider && urlForcedMode && urlForcedMode !== globalMode) setMode(urlForcedMode);
  }, [isProvider, urlForcedMode, globalMode, setMode]);

  useEffect(() => {
    const updateDefaultPanelTarget = () => {
      setPreferMobileMenuDefault(!rawRequestedTab && window.matchMedia("(max-width: 1023px)").matches);
    };
    updateDefaultPanelTarget();
    window.addEventListener("resize", updateDefaultPanelTarget);
    return () => window.removeEventListener("resize", updateDefaultPanelTarget);
  }, [rawRequestedTab]);

  useEffect(() => {
    if (!legacyVerificationTab) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "profile");
    params.set("mode", "offer");
    params.set("focus", "verification");
    router.replace(`/dashboard/profesional?${params.toString()}`, { scroll: false });
  }, [legacyVerificationTab, searchParams, router]);

  useEffect(() => {
    if (requestedTab !== "chat") return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tab");
    const qs = params.toString();
    router.replace(`/mensajes${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [requestedTab, searchParams, router]);

  useEffect(() => {
    if (requestedTab !== "assistant") return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tab");
    const qs = params.toString();
    router.replace(`/dashboard/profesional${qs ? `?${qs}` : ""}`, { scroll: false });
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
  }, [cacheDashboardBootstrap, setLoading, setNoProTries, setPro, setProLoadError, user]);

  const fetchProfile = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const { data } = await supabase.rpc("get_my_profile");
    if (data) {
      setProfile((current) => JSON.stringify(current) === JSON.stringify(data) ? current : data);
      cacheDashboardBootstrap({ profile: data });
    }
  }, [cacheDashboardBootstrap, setProfile, user]);

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

  function setTab(tab: Tab) {
    setMobilePanelOpen(false);
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
    scrollDashboardToPageTop();
  }

  function openProfileVerification() {
    if (isProvider && mode !== "offer") setMode("offer");
    setProfileFocus({ field: "verification", key: nextFocusKey() });
    window.history.pushState(null, "", `${window.location.pathname}?tab=profile&mode=offer`);
    scrollDashboardToPageTop();
  }

  // The mode switch now lives in the panel header (sprint 518). Switching flips the global
  // mode AND lands on the destination mode's MAIN tab — which re-asserts the mode via the
  // urlForcedMode effect, so a switch from ANY section (incl. a mode-specific one) sticks.
  function handleSwitchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setTab(next === "offer" ? "bookings" : "sent_bookings");
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

  if (authLoading || loading || !user || (pendingProfessionalSignup && !pro)) {
    return <DashboardRouteLoading title="Cargando panel" />;
  }

  const proProfile = Array.isArray(pro?.profiles) ? pro?.profiles[0] : pro?.profiles;
  const displayName =
    profile?.full_name ||
    proProfile?.full_name ||
    (user.user_metadata?.full_name as string) ||
    user.email?.split("@")[0] ||
    "";
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
          avatar_url: proProfile?.avatar_url || headerAvatar || null,
        },
      }
    : pro;
  const publicProfileHref = activeTab === "profile" && mode === "offer" && typeof pro?.slug === "string" && pro.slug.trim()
    ? `/profesionales/${pro.slug.trim()}`
    : null;
  // Client (use mode) identity: verified via cédula (saved at solicitud/booking or before).
  // Drives the "Verificado" badge below the name — the SAME badge the pro side uses.
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
  const mobileSectionTabs = sidebarTabs;
  const mobileFullScreenTab = false;
  const mobileSectionOpen = activeTab !== "home" || mobilePanelOpen;
  const profileCompletionPercent = proForCompletion ? computeCompletion(proForCompletion).percent : null;
  const showProfileCompletion =
    mode === "offer" &&
    !!proForCompletion &&
    ((profileCompletionPercent ?? 0) < 100 || proForCompletion.verification_status !== "verified");

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

  function signOutButton({ mobile = false }: { mobile?: boolean } = {}) {
    return (
      <button
        type="button"
        onClick={() => signOutToHome(locale)}
        className={cn(
          "w-full flex items-center rounded-xl text-left font-medium transition-colors",
          mobile ? "gap-4 px-4 py-4 text-base font-semibold" : "gap-3 px-3 py-2.5 text-sm",
          "text-[#374151] hover:bg-[#f3f4f6] hover:text-[#111827]",
        )}
      >
        <span className={cn(
          "relative inline-flex shrink-0 items-center justify-center text-[#64748b]",
          mobile ? "h-9 w-9 [&>svg]:h-6 [&>svg]:w-6" : "mr-1.5",
        )}>
          <LogOut className="h-4 w-4" />
        </span>
        {t("signOut")}
      </button>
    );
  }

  function switchPanelButton({ mobile = false }: { mobile?: boolean } = {}) {
    if (!isProvider) return null;
    const nextMode: Mode = mode === "offer" ? "use" : "offer";
    return (
      <button
        type="button"
        onClick={() => {
          if (mobile) {
            setMode(nextMode);
            setMobilePanelOpen(false);
            const params = new URLSearchParams(window.location.search);
            params.set("tab", "home");
            params.delete("mode");
            const qs = params.toString();
            window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
            scrollDashboardToPageTop();
            return;
          }
          handleSwitchMode(nextMode);
        }}
        className={cn(
          "w-full flex items-center rounded-xl text-left font-semibold transition-colors",
          mobile ? "gap-4 px-4 py-4 text-base" : "gap-3 px-3 py-2.5 text-sm",
          "text-[#162543] hover:bg-[#EBF5FB]",
        )}
      >
        <span className={cn(
          "relative inline-flex shrink-0 items-center justify-center text-[#64748b]",
          mobile ? "h-9 w-9 [&>svg]:h-6 [&>svg]:w-6" : "mr-1.5",
        )}>
          <Repeat2 className="h-4 w-4" />
        </span>
        {mode === "offer" ? t("switchToClientPanel") : t("switchToProfessionalPanel")}
      </button>
    );
  }

  function mobileSectionButton(tab: Tab) {
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
          setTab(tab);
        }}
        className="flex w-full items-center gap-4 rounded-xl px-4 py-4 text-left text-base font-semibold text-[#374151] transition-colors hover:bg-[#f8fbfd]"
      >
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center text-[#64748b] [&>svg]:h-6 [&>svg]:w-6">
          {TAB_ICONS[tab]}
        </span>
        <span className="min-w-0 flex-1 truncate">{t(`tabs.${tab}`)}</span>
      </button>
    );
  }

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
      <main className="flex-1 min-h-[calc(100svh-88px)]">
        <div className={cn(
          "dashboard-panel-content mx-auto max-w-6xl px-4 pb-6 pt-6 sm:px-6 lg:px-8 lg:pb-8 lg:pt-8",
          mobileSectionOpen && "px-0 pt-0 sm:px-0 lg:px-8 lg:pt-8",
          mobileFullScreenTab && "max-w-none px-0 pb-0 pt-0 sm:px-0 lg:max-w-7xl lg:px-8 lg:pb-8 lg:pt-8",
        )}>
          {/* Header — clean, restrained (serious tone): a modest larger avatar with a hairline
              ring, a bold navy name, the plain "modo" eyebrow + verification badge, set off from
              the content by a single hairline divider. No gradient/decoration. */}
          <div className={cn("mb-6 flex-col gap-4 border-b border-[#e5e7eb] pb-5 sm:flex-row sm:items-start sm:justify-between", (mobileFullScreenTab || mobileSectionOpen) ? "hidden lg:flex" : "flex")}>
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
                  {compactHeaderName}
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
                <div className={cn(mobileSectionOpen && "hidden lg:block")}>
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
                </div>
              )}

              {activeTab !== "home" && !mobileFullScreenTab && (
                <div className="sticky top-0 z-20 grid min-h-16 grid-cols-[64px_minmax(0,1fr)_64px] items-center border-b border-[#e5e7eb] bg-white px-2 py-2 text-[#162543] lg:hidden">
                  <button
                    type="button"
                    onClick={() => setTab("home")}
                    aria-label={t("backToPanel")}
                    className="inline-flex h-10 shrink-0 items-center gap-1 justify-self-start rounded-lg px-2 text-sm font-semibold text-[#374151] transition-colors hover:bg-[#f3f4f6]"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <h2 className="min-w-0 truncate px-2 text-center text-base font-bold">{activeTab === "services" ? t("servicesHeading") : t(`tabs.${activeTab}`)}</h2>
                  <div className="flex shrink-0 justify-self-end">
                    {publicProfileHref && (
                      <Link
                        href={publicProfileHref}
                        aria-label={t("viewAsClient")}
                        className="grid h-10 w-10 place-items-center rounded-full border border-[#dbeafe] bg-white text-[#64748b] transition active:bg-[#EBF5FB] active:text-[#0089bb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9]"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-col lg:flex-row gap-6">
                {/* Sidebar nav (desktop only); mobile renders the same sections as full-screen entries. */}
                <nav className="hidden lg:block lg:w-60 shrink-0 space-y-3">
                  <Card>
                    <CardContent className="p-2">
                      {switchPanelButton()}
                      {isProvider && <div className="my-2 border-t border-[#f3f4f6]" />}
                      <div>{sidebarTabs.map(navButton)}</div>
                      <div className="my-2 border-t border-[#f3f4f6] pt-2">
                        {signOutButton()}
                      </div>
                    </CardContent>
                  </Card>

                  {/* The "Ofrecer mis servicios" invitation lives at the END of "Mi perfil"
                      (BasicProfileSection) for a client-only account — not here in the sidebar. */}
                </nav>

                {/* Main content — min-w-0 so a long unbroken string inside a card can't
                    grow this flex column past the available width and break the page. */}
                <div ref={contentRef} className="flex-1 min-w-0 scroll-mt-20 lg:scroll-mt-0">
                  <SaveStatusProvider>
                    <HeaderSaveStatus />
                    <Card className={cn(
                      activeTab === "chat" && "overflow-hidden",
                      (mobileFullScreenTab || mobileSectionOpen) && "dashboard-section-card rounded-none border-0 bg-white shadow-none lg:min-h-0 lg:rounded-xl lg:border lg:shadow-sm",
                    )}>
                      {activeTab !== "chat" && activeTab !== "home" && !mobileFullScreenTab && <CardHeader className="hidden px-4 pt-4 pb-2 sm:px-6 sm:pt-6 sm:pb-3 lg:block">
                        <div className="relative">
                          <div className="flex min-w-0 items-center gap-2 pr-28">
                            <h2 className="min-w-0 truncate text-lg font-semibold text-[#111827]">{activeTab === "services" ? t("servicesHeading") : t(`tabs.${activeTab}`)}</h2>
                            {publicProfileHref && (
                              <AppTooltip label={t("viewAsClient")} side="top" align="center">
                                <Link
                                  href={publicProfileHref}
                                  aria-label={t("viewAsClient")}
                                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#dbeafe] bg-white text-[#64748b] transition hover:border-[#9fd8ec] hover:bg-[#EBF5FB] hover:text-[#0089bb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9]"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Link>
                              </AppTooltip>
                            )}
                          </div>
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
                      <CardContent className={mobileFullScreenTab ? "min-h-[calc(100svh-88px)] p-0 sm:p-0" : cn(
                        "px-4 pt-0 pb-4 sm:px-6 sm:pt-1 sm:pb-6",
                        mobileSectionOpen && "dashboard-section-content px-5 pb-8 pt-5 sm:px-6 lg:min-h-0 lg:px-6 lg:pb-6 lg:pt-1",
                      )}>
                        {activeTab === "home" && (
                          <>
                            <div className="lg:hidden">
                              <div className="space-y-1 pt-1">
                                {switchPanelButton({ mobile: true })}
                                {isProvider && <div className="my-2 border-t border-[#e5e7eb]" />}
                                {mobileSectionTabs.map(mobileSectionButton)}
                              </div>
                              <div className="my-3 border-t border-[#e5e7eb]" />
                              <div className="space-y-1 pb-1">
                                {signOutButton({ mobile: true })}
                              </div>
                            </div>
                          </>
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

      {/* Footer stays visible on desktop and mobile because the dashboard no longer uses
          the fixed mobile bottom tab bar. */}
      <div>
        <LandingFooter />
      </div>
    </div>
  );
}
