"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { isSigningOut } from "@/lib/auth/sign-out";
import { useSearchParams } from "next/navigation";
import {
  User, Award, CalendarCheck, CalendarClock, CalendarDays, ExternalLink, Wrench,
  ShieldCheck, Bell, Handshake, ClipboardList, Bookmark, Settings, Headset, CreditCard,
  ArrowRight, Sparkles, Repeat2, Plus, AlertCircle, X,
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
  | "profile" | "services" | "photos" | "availability" | "bookings" | "proposals" | "verificacion"
  | "suscripcion"
  | "sent_bookings" | "sent_projects" | "saved"
  | "chat" | "notifications" | "soporte" | "cuenta";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProData = Record<string, any>;

function ContrataChatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none">
      <path
        d="M5.25 5.6c1.6-1.35 3.8-2.1 6.2-2.1 4.9 0 8.85 3.3 8.85 7.4s-3.95 7.4-8.85 7.4c-.7 0-1.4-.07-2.05-.2L5 20.35v-4.1C3.45 14.9 2.6 13 2.6 10.9c0-1.65.6-3.55 2.65-5.3Z"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinejoin="round"
      />
      <path
        d="M13.8 14.35c-.8.65-1.82 1.02-2.94 1.02-2.58 0-4.66-1.92-4.66-4.29s2.08-4.3 4.66-4.3c1.48 0 2.8.64 3.65 1.64"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
      <path
        d="M14.05 14.05 16.2 16"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

const TAB_ICONS: Record<Tab, React.ReactNode> = {
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
  chat: <ContrataChatIcon className="h-4 w-4" />,
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
  "bookings", "proposals", "profile", "services", "photos", "availability",
  ...(PAYMENTS_ENABLED ? (["suscripcion"] as Tab[]) : []),
];
const USE_TABS: Tab[] = ["sent_bookings", "sent_projects", "profile", "saved"];
const SHARED_TABS: Tab[] = ["chat", "notifications", "soporte"];

// MOBILE bottom-nav: a horizontally scrollable rail with every mode tab.
const MOBILE_PRIORITY: Record<Mode, Tab[]> = {
  offer: ["bookings", "proposals", "chat", "notifications"],
  use: ["sent_bookings", "sent_projects", "chat", "notifications"],
};
const POST_LOGIN_OPPORTUNITY_TYPES = new Set(["new_project"]);
const POST_LOGIN_PRO_REQUEST_TYPES = new Set([
  "booking_received",
  "booking_cancelled_by_client",
  "booking_completed_by_client",
  "booking_rescheduled",
]);
const POST_LOGIN_CLIENT_REQUEST_TYPES = new Set([
  "booking_confirmed",
  "booking_cancelled",
  "booking_completed",
  "booking_update",
  "review_request",
]);
const POST_LOGIN_PRO_PROPOSAL_TYPES = new Set([
  "proposal_accepted",
  "project_proposal_accepted",
  "project_proposal_declined",
]);
const POST_LOGIN_CLIENT_PROPOSAL_TYPES = new Set([
  "proposal_received",
  "proposal_updated",
  "proposal_withdrawn",
]);
const POST_LOGIN_SUPPORT_TYPES = new Set(["support_reply"]);
const OPPORTUNITY_MODAL_SEEN_STORAGE_PREFIX = "contratacr:seen-opportunity-modal";

type PostLoginActivity = {
  total: number;
  opportunities: number;
  requests: number;
  proposals: number;
  support: number;
  other: number;
  targetTab: Tab;
  targetMode: Mode;
  cta: "opportunities" | "requests" | "proposals" | "support" | "notifications";
};

type UnreadNotificationSummary = {
  id?: string;
  type: string;
  data?: { project_id?: string | null } | null;
};
type OpportunityProjectSummary = { id?: string | null };

function opportunitySeenStorageKey(userId: string) {
  return `${OPPORTUNITY_MODAL_SEEN_STORAGE_PREFIX}:${userId}`;
}

function opportunityItemKey(item: { id?: string; data?: { project_id?: string | null } | null }) {
  const projectId = item.data?.project_id;
  return projectId ? `project:${projectId}` : item.id ? `notification:${item.id}` : null;
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

function unseenOpportunityKeys(userId: string, items: Array<{ id?: string; data?: { project_id?: string | null } | null }>) {
  const seen = readSeenOpportunityKeys(userId);
  return items.map(opportunityItemKey).filter((key): key is string => !!key && !seen.has(key));
}

function buildPostLoginActivity(items: UnreadNotificationSummary[], currentMode: Mode): PostLoginActivity | null {
  if (items.length === 0) return null;

  let opportunities = 0;
  let proRequests = 0;
  let clientRequests = 0;
  let proProposals = 0;
  let clientProposals = 0;
  let support = 0;
  let other = 0;

  for (const item of items) {
    if (POST_LOGIN_OPPORTUNITY_TYPES.has(item.type)) opportunities++;
    else if (POST_LOGIN_PRO_REQUEST_TYPES.has(item.type)) proRequests++;
    else if (POST_LOGIN_CLIENT_REQUEST_TYPES.has(item.type)) clientRequests++;
    else if (POST_LOGIN_PRO_PROPOSAL_TYPES.has(item.type)) proProposals++;
    else if (POST_LOGIN_CLIENT_PROPOSAL_TYPES.has(item.type)) clientProposals++;
    else if (POST_LOGIN_SUPPORT_TYPES.has(item.type)) support++;
    else other++;
  }

  const requests = proRequests + clientRequests;
  const proposals = proProposals + clientProposals;
  let targetTab: Tab = "notifications";
  let targetMode: Mode = currentMode;
  let cta: PostLoginActivity["cta"] = "notifications";

  if (opportunities > 0) {
    targetTab = "proposals";
    targetMode = "offer";
    cta = "opportunities";
  } else if (proRequests > 0) {
    targetTab = "bookings";
    targetMode = "offer";
    cta = "requests";
  } else if (clientRequests > 0) {
    targetTab = "sent_bookings";
    targetMode = "use";
    cta = "requests";
  } else if (proProposals > 0) {
    targetTab = "proposals";
    targetMode = "offer";
    cta = "proposals";
  } else if (clientProposals > 0) {
    targetTab = "sent_projects";
    targetMode = "use";
    cta = "proposals";
  } else if (support > 0) {
    targetTab = "soporte";
    cta = "support";
  }

  return {
    total: items.length,
    opportunities,
    requests,
    proposals,
    support,
    other,
    targetTab,
    targetMode,
    cta,
  };
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
  const shouldCheckPostLoginActivity = searchParams.get("postLogin") === "1";
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
  const [postLoginActivity, setPostLoginActivity] = useState<PostLoginActivity | null>(null);
  const postLoginActivityCheckedRef = useRef(false);
  const postLoginActivityDismissedRef = useRef(false);
  const [opportunityWelcomeCount, setOpportunityWelcomeCount] = useState<number | null>(null);
  const [opportunityWelcomeKeys, setOpportunityWelcomeKeys] = useState<string[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);
  const opportunityWelcomeCheckedRef = useRef(false);
  const opportunityWelcomeDismissedRef = useRef(false);
  const [bottomNavRail, setBottomNavRail] = useState<HTMLDivElement | null>(null);
  const [bottomNavOverflow, setBottomNavOverflow] = useState({ left: false, right: true });
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
  const activeTab: Tab = requestedTab ?? (mode === "offer" ? "bookings" : "sent_bookings");

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

  const clearPostLoginParam = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("postLogin")) return;

    params.delete("postLogin");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
  }, []);

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
      !shouldCheckPostLoginActivity ||
      authLoading ||
      !user ||
      postLoginActivityCheckedRef.current ||
      postLoginActivityDismissedRef.current
    ) return;

    postLoginActivityCheckedRef.current = true;
    let mounted = true;

    void (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("notifications")
          .select("id, type, data")
          .eq("user_id", user.id)
          .eq("read", false)
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        if (!mounted) return;
        const unread = (data ?? []) as UnreadNotificationSummary[];
        const opportunityKeys = unseenOpportunityKeys(user.id, unread.filter((item) => item.type === "new_project"));
        const filtered = unread.filter((item) => item.type !== "new_project" || opportunityKeys.includes(opportunityItemKey(item) ?? ""));
        const activity = buildPostLoginActivity(filtered, mode);
        if (activity?.opportunities) rememberSeenOpportunityKeys(user.id, opportunityKeys);
        if (activity) setPostLoginActivity(activity);
      } catch (error) {
        console.error("[dashboard] post-login activity load failed:", error);
      } finally {
        if (!mounted) return;
        clearPostLoginParam();
      }
    })();

    return () => {
      mounted = false;
    };
  }, [authLoading, clearPostLoginParam, mode, shouldCheckPostLoginActivity, user]);

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
      if (mobile) contentRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
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
    setTab(next === "offer" ? "bookings" : "sent_bookings");
  }

  function handleSaved() {
    setRefreshKey((k) => k + 1);
  }

  function postLoginActivitySummary(activity: PostLoginActivity) {
    return [
      activity.opportunities > 0 ? t("postLoginActivity.parts.opportunities", { count: activity.opportunities }) : null,
      activity.requests > 0 ? t("postLoginActivity.parts.requests", { count: activity.requests }) : null,
      activity.proposals > 0 ? t("postLoginActivity.parts.proposals", { count: activity.proposals }) : null,
      activity.support > 0 ? t("postLoginActivity.parts.support", { count: activity.support }) : null,
      activity.other > 0 ? t("postLoginActivity.parts.notifications", { count: activity.other }) : null,
    ].filter(Boolean).join(", ");
  }

  function dismissPostLoginActivity() {
    postLoginActivityDismissedRef.current = true;
    setPostLoginActivity(null);
    clearPostLoginParam();
  }

  function closePostLoginActivity() {
    dismissPostLoginActivity();
  }

  function viewPostLoginActivity() {
    const activity = postLoginActivity;
    if (!activity) return;
    dismissPostLoginActivity();
    if (mode !== activity.targetMode) setMode(activity.targetMode);
    setTab(activity.targetTab);
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
    if (!bottomNavRail) return;
    let frame = 0;
    const apply = () => {
      const maxScroll = Math.max(0, bottomNavRail.scrollWidth - bottomNavRail.clientWidth);
      const remainingRight = maxScroll - bottomNavRail.scrollLeft;
      const next = {
        left: bottomNavRail.scrollLeft > 2,
        right: remainingRight > 4,
      };
      setBottomNavOverflow((prev) => (
        prev.left === next.left && prev.right === next.right ? prev : next
      ));
    };
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(apply);
    };
    update();
    const timeout = window.setTimeout(update, 250);
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    resizeObserver?.observe(bottomNavRail);
    Array.from(bottomNavRail.children).forEach((child) => resizeObserver?.observe(child));
    bottomNavRail.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      resizeObserver?.disconnect();
      bottomNavRail.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [bottomNavRail, mode, isProvider]);

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

  // Mobile bottom-nav split: the mode's primary tabs in the bar (incl. the shared
  // "notifications" tab, which now has a dedicated slot), then the rest scrolls after.
  const modeTabs = mode === "offer" ? OFFER_TABS : USE_TABS;
  const sidebarTabs = [...modeTabs, ...SHARED_TABS];
  const barTabs = [...modeTabs, ...SHARED_TABS];
  const mobilePriorityTabs = MOBILE_PRIORITY[mode].filter((tab) => barTabs.includes(tab));
  const mobileBarTabs = [...mobilePriorityTabs, ...barTabs.filter((tab) => !mobilePriorityTabs.includes(tab))];
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
        <span className="relative">
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

  function modePanelButton({ mobile = false }: { mobile?: boolean } = {}) {
    const next: Mode = mode === "offer" ? "use" : "offer";
    return (
      <button
        type="button"
        onClick={() => { handleSwitchMode(next); }}
        className={cn(
          "w-full flex items-center gap-3 rounded-xl text-left text-sm font-medium transition-colors",
          mobile ? "px-3 py-3" : "px-3 py-2.5",
          "text-[#374151] hover:bg-[#f3f4f6]"
        )}
      >
        <span className="shrink-0 text-[#111827]"><Repeat2 className="h-4 w-4" /></span>
        <span className="flex-1">{next === "offer" ? t("panelProfessional") : t("panelClient")}</span>
      </button>
    );
  }

  const bottomNavItemClass =
    "relative flex w-[clamp(67px,calc((100vw-60px)/4),94px)] min-w-[clamp(67px,calc((100vw-60px)/4),94px)] max-w-[94px] shrink-0 flex-col items-center justify-center gap-1 px-0.5 py-1.5 transition-colors";

  function modeBottomNavButton() {
    const next: Mode = mode === "offer" ? "use" : "offer";
    return (
      <button
        type="button"
        onClick={() => { handleSwitchMode(next); }}
        className={cn(bottomNavItemClass, "w-[92px] min-w-[92px] max-w-[92px] text-[#374151] hover:text-[#111827]")}
      >
        <Repeat2 className="h-[22px] w-[22px]" />
        <span className="whitespace-nowrap text-center text-[10px] font-semibold leading-none">
          {next === "offer" ? t("panelProfessional") : t("panelClient")}
        </span>
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
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0f172a]/45 px-4 py-6 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="opportunity-welcome-title"
            aria-describedby="opportunity-welcome-body"
            className="relative w-full max-w-md rounded-2xl bg-white px-5 pb-5 pt-6 text-center shadow-[0_24px_80px_rgba(15,23,42,0.28)] sm:px-6 sm:pb-6"
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
        <div className="mx-auto max-w-7xl px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-8 sm:px-6 lg:px-8 lg:pb-8">
          {/* Header — clean, restrained (serious tone): a modest larger avatar with a hairline
              ring, a bold navy name, the plain "modo" eyebrow + verification badge, set off from
              the content by a single hairline divider. No gradient/decoration. */}
          <div className={cn("mb-6 flex-col gap-4 border-b border-[#e5e7eb] pb-5 sm:flex-row sm:items-start sm:justify-between", activeTab === "chat" ? "hidden lg:flex" : "flex")}>
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

          {postLoginActivity && (
            <div className="mb-6 rounded-2xl border border-[#bae6fd] bg-[#f0f9ff] p-4 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#009FD9] ring-1 ring-inset ring-[#bae6fd]">
                    <Bell className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#0f172a]">{t("postLoginActivity.title")}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-[#075985]">
                      {t("postLoginActivity.body", { summary: postLoginActivitySummary(postLoginActivity) })}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button type="button" size="sm" onClick={viewPostLoginActivity} className="flex-1 sm:flex-none">
                    {t(`postLoginActivity.cta.${postLoginActivity.cta}`)}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <button
                    type="button"
                    onClick={closePostLoginActivity}
                    aria-label={t("postLoginActivity.close")}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#64748b] transition-colors hover:bg-white hover:text-[#0f172a]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

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
              {showProfileCompletion && (
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
                      {isProvider && (
                        <div className="mb-2 border-b border-[#f3f4f6] pb-2">
                          {modePanelButton()}
                        </div>
                      )}
                      <div>{sidebarTabs.map(navButton)}</div>
                    </CardContent>
                  </Card>

                  {/* The "Ofrecer mis servicios" invitation lives at the END of "Mi perfil"
                      (BasicProfileSection) for a client-only account — not here in the sidebar. */}
                </nav>

                {/* Main content — min-w-0 so a long unbroken string inside a card can't
                    grow this flex column past the available width and break the page. */}
                <div ref={contentRef} className="flex-1 min-w-0 scroll-mt-20 lg:scroll-mt-0">
                  <SaveStatusProvider>
                    <Card className={cn(activeTab === "chat" && "overflow-hidden")}>
                      {activeTab !== "chat" && <CardHeader className="px-4 pt-4 pb-2 sm:px-6 sm:pt-6 sm:pb-3">
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
                      <CardContent className={activeTab === "chat" ? "p-0 sm:p-0" : "px-4 pt-0 pb-4 sm:px-6 sm:pt-1 sm:pb-6"}>
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

                        {activeTab === "chat" && <DirectChatInbox />}
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
          The rail scrolls horizontally and intentionally peeks the next item, so users can
          tell there are more actions without opening a separate discovery affordance first. */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-[#e5e7eb] bg-white shadow-[0_-14px_34px_-18px_rgba(15,23,42,0.45)] pb-[env(safe-area-inset-bottom)]"
        aria-label={t("title")}
      >
        <div className="relative">
          <div
            ref={setBottomNavRail}
            className="flex min-h-[56px] items-stretch gap-0 overflow-x-auto overscroll-x-contain scroll-smooth hide-scrollbar"
          >
            {isProvider && modeBottomNavButton()}
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
                  <span className="relative [&>svg]:!h-[22px] [&>svg]:!w-[22px]">
                    {TAB_ICONS[tab]}
                    {badge > 0 && (
                      <span className="absolute -right-2 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#009FD9] px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white">{badge > 9 ? "9+" : badge}</span>
                    )}
                  </span>
                  <span className="text-[10px] font-semibold leading-none max-w-full truncate">{t(`bottomNav.${tab}`)}</span>
                </button>
              );
            })}
          </div>
          <span
            className={cn(
              "pointer-events-none absolute bottom-0 left-0 top-0 w-[12vw] min-w-9 max-w-12 bg-gradient-to-r from-white/60 via-white/25 to-transparent backdrop-blur-[1px] transition-opacity duration-150",
              bottomNavOverflow.left ? "opacity-100" : "opacity-0"
            )}
            aria-hidden
          />
          <span
            className={cn(
              "pointer-events-none absolute bottom-0 right-0 top-0 w-[12vw] min-w-9 max-w-12 bg-gradient-to-l from-white/60 via-white/25 to-transparent backdrop-blur-[1px] transition-opacity duration-150",
              bottomNavOverflow.right ? "opacity-100" : "opacity-0"
            )}
            aria-hidden
          />
        </div>
      </nav>
    </div>
  );
}
