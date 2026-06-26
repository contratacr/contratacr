"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { isSigningOut } from "@/lib/auth/sign-out";
import { useSearchParams } from "next/navigation";
import {
  User, Award, CalendarCheck, CalendarClock, CalendarDays, ExternalLink, Wrench,
  ShieldCheck, Bell, Handshake, ClipboardList, Bookmark, Settings, Headset, CreditCard,
  ArrowRight, Sparkles, Menu, X, Repeat2,
} from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProfileEditor } from "@/components/dashboard/pro/profile-editor";
import { ProfileCompletion } from "@/components/dashboard/pro/profile-completion";
import { PhotoGallery } from "@/components/dashboard/pro/photo-gallery";
import { AvailabilityEditor } from "@/components/dashboard/pro/availability-editor";
import { ServicesEditor } from "@/components/dashboard/pro/services-editor";
import { SaveStatusProvider, HeaderSaveStatus } from "@/components/dashboard/save-status-context";
import { BookingRequests } from "@/components/dashboard/pro/booking-requests";
import { ProposalsTab } from "@/components/dashboard/pro/proposals-tab";
import { VerificationPanel } from "@/components/dashboard/pro/verification-panel";
import { ClientActivity } from "@/components/dashboard/client-activity";
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
import { useMode, type Mode } from "@/hooks/use-mode";
import { notificationContext } from "@/lib/notification-link";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

// ONE unified panel for every account (Airbnb model). A MODE SWITCH flips between
// "Usar servicios" (the seek capability — always available) and "Ofrecer servicios"
// (the offer capability — unlocked by completing the professional profile). There
// is no separate client panel; everyone lives here.
type Tab =
  | "profile" | "services" | "photos" | "availability" | "bookings" | "proposals" | "verificacion"
  | "suscripcion"
  | "sent_bookings" | "sent_projects" | "saved"
  | "notifications" | "soporte" | "cuenta";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProData = Record<string, any>;

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
  "profile", "services", "photos", "availability", "bookings", "proposals", "verificacion",
  ...(PAYMENTS_ENABLED ? (["suscripcion"] as Tab[]) : []),
];
const USE_TABS: Tab[] = ["profile", "sent_bookings", "sent_projects", "saved"];
const SHARED_TABS: Tab[] = ["notifications", "soporte", "cuenta"];

// MOBILE bottom-nav: daily operational sections only. Profile/setup/shared options
// live behind "Más"; the mode switch is a visible first slot.
const MOBILE_PRIMARY: Record<Mode, Tab[]> = {
  offer: ["bookings", "proposals", "notifications"],
  use: ["sent_bookings", "sent_projects", "notifications"],
};

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("proPanel");
  const activeTab = (searchParams.get("tab") as Tab) ?? "profile";

  const [pro, setPro] = useState<ProData | null>(null);
  const [profile, setProfile] = useState<{ full_name?: string; avatar_url?: string; cedula?: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [supportUnread, setSupportUnread] = useState(0);
  const [profileFocus, setProfileFocus] = useState<{ field: string; key: number } | null>(null);
  // Mobile "Más" bottom-sheet (the overflow of the bottom nav bar).
  const [moreOpen, setMoreOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [noProTries, setNoProTries] = useState(0);

  // The account CAN offer if it has a professional profile (authoritative once
  // loaded) — fall back to the metadata capability for an instant first paint.
  const isProvider = !!pro || canOffer(user);

  // Airbnb FULL switch: the active mode is the GLOBAL (persisted) mode shared with the
  // navbar + bell. A mode-specific tab in the URL (a deep link from a notification or a
  // navbar quick link) overrides it — and is persisted below so everything stays in sync.
  // A non-provider has no offer world → always "use".
  const { mode: globalMode, setMode } = useMode(isProvider);
  const urlForcedMode: Mode | null =
    OFFER_ONLY.has(activeTab) ? "offer" : USE_ONLY.has(activeTab) ? "use" : null;
  const mode: Mode = !isProvider ? "use" : urlForcedMode ?? globalMode;

  // When a deep link forces a mode, adopt it globally so the navbar switch + bell follow.
  useEffect(() => {
    if (isProvider && urlForcedMode && urlForcedMode !== globalMode) setMode(urlForcedMode);
  }, [isProvider, urlForcedMode, globalMode, setMode]);

  // Suppress the login-redirect while signing out (from the navbar menu) → straight
  // to main, no /login flash. Logout lives only in the navbar profile menu now.
  useEffect(() => {
    if (!authLoading && !user && !isSigningOut()) router.push("/login");
  }, [user, authLoading, router]);

  // Deep-link focus: `?tab=profile&focus=location` opens the editor at that field.
  useEffect(() => {
    const focus = searchParams.get("focus");
    if (!focus) return;
    setProfileFocus({ field: focus, key: Date.now() });
    const params = new URLSearchParams(searchParams.toString());
    params.delete("focus");
    const qs = params.toString();
    router.replace(`/dashboard/profesional${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [searchParams, router]);

  const fetchPro = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("professionals")
      .select("*, profiles(full_name, avatar_url), provincia_id, canton_id, address, service_type, category_id, services")
      .eq("profile_id", user.id)
      .maybeSingle();
    setPro(data);
    if (!data) setNoProTries((n) => n + 1);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchPro();
  }, [user, activeTab, refreshKey, fetchPro]);

  // Base profile (name/avatar) for the header — works for seekers with no pro row.
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const load = () => supabase.rpc("get_my_profile").then(({ data }) => { if (data) setProfile(data); });
    load();
    window.addEventListener("ccr:profile-updated", load);
    return () => window.removeEventListener("ccr:profile-updated", load);
  }, [user, refreshKey]);

  // Unread notifications, bucketed by mode (per-mode model): the sidebar Notificaciones
  // badge shows the ACTIVE mode's unread (its own + account-level), and the switch shows
  // the OTHER mode's pending count so the user is aware without switching.
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
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
  }, [user, activeTab, refreshKey, mode]);

  // Unread support replies → badge on the Soporte sidebar item.
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("type", "support_reply")
      .eq("read", false)
      .then(({ count }) => setSupportUnread(count ?? 0));
  }, [user, activeTab, refreshKey]);

  // Inconsistent state ONLY: metadata says this account can offer, but no pro row
  // exists yet. A freshly-created pro account can lag (replication/RLS) — retry a
  // few times, then send them to finish the professional profile. A genuine seeker
  // (cannot offer) is never bounced; a missing pro row is normal for them.
  useEffect(() => {
    if (authLoading || loading || pro || !user) return;
    if (!canOffer(user)) return;
    if (noProTries < 4) {
      const id = setTimeout(() => fetchPro(), 700);
      return () => clearTimeout(id);
    }
    router.replace("/registro/profesional");
  }, [authLoading, loading, pro, user, router, noProTries, fetchPro]);

  function setTab(tab: Tab) {
    setMoreOpen(false);
    if (tab === activeTab) return;
    // Mode is persisted globally now, so the tab alone is enough — a mode-specific tab
    // also re-asserts its mode via the effect above, keeping the navbar switch in sync.
    router.push(`/dashboard/profesional?tab=${tab}`, { scroll: false });
    // Reset to the top of the new section INSTANTLY via the window. A smooth scrollIntoView
    // fought the fixed mobile bottom bar (its backdrop-blur made "Más" flicker / feel covered
    // during the animated scroll); an instant window scroll never interferes with it.
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
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

  // Lock the page behind the mobile "Más" sheet while it's open.
  useEffect(() => {
    if (!moreOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [moreOpen]);


  if (authLoading || loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" />
      </div>
    );
  }

  const displayName =
    profile?.full_name ||
    pro?.profiles?.full_name ||
    (user.user_metadata?.full_name as string) ||
    user.email?.split("@")[0] ||
    "";
  const headerAvatar = profile?.avatar_url || pro?.profiles?.avatar_url || null;
  // Client (use mode) identity: verified via cédula (saved at solicitud/booking or before).
  // Drives the "Verificado" badge below the name — the SAME badge the pro side uses.
  const clientVerified = !!profile?.cedula && detectIdType(String(profile.cedula)) === "cedula";

  // Offer mode without a pro row: a genuine seeker (cannot offer) sees the
  // activation gate; an account that CAN offer but whose row is still loading
  // (replication lag) sees a spinner instead of a misleading gate.
  const showOfferGate = mode === "offer" && !pro && !canOffer(user);
  const offerLoading = mode === "offer" && !pro && canOffer(user);

  // Mobile bottom-nav split: the mode's primary tabs in the bar (incl. the shared
  // "notifications" tab, which now has a dedicated slot), the rest under "Más".
  const modeTabs = mode === "offer" ? OFFER_TABS : USE_TABS;
  const barTabs = [...modeTabs, ...SHARED_TABS];
  const primaryTabs = MOBILE_PRIMARY[mode].filter((tab) => barTabs.includes(tab));
  const moreTabs = barTabs.filter((tab) => !primaryTabs.includes(tab));
  const activeInMore = moreTabs.includes(activeTab);

  function navButton(tab: Tab) {
    const badge = tab === "notifications" ? unreadCount : tab === "soporte" ? supportUnread : 0;
    return (
      <button
        key={tab}
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
        onClick={() => { if (mobile) setMoreOpen(false); handleSwitchMode(next); }}
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

  function modeBottomNavButton() {
    const next: Mode = mode === "offer" ? "use" : "offer";
    return (
      <button
        type="button"
        onClick={() => { setMoreOpen(false); handleSwitchMode(next); }}
        className="relative flex flex-1 flex-col items-center justify-center gap-1 px-0.5 pt-2 pb-1.5 text-[#374151] transition-colors hover:text-[#111827]"
      >
        <Repeat2 className="h-[22px] w-[22px]" />
        <span className="max-w-full truncate text-[10px] font-semibold leading-none">
          {next === "offer" ? t("panelProfessional") : t("panelClient")}
        </span>
      </button>
    );
  }

  // Mode switching is now a compact navigation action ("Panel cliente/profesional")
  // instead of a large header control, so the identity header stays clean.

  return (
    <div className="min-h-screen flex flex-col bg-[#fafafa]">
      <Navbar />
      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16 lg:pb-8">
          {/* Header — clean, restrained (serious tone): a modest larger avatar with a hairline
              ring, a bold navy name, the plain "modo" eyebrow + verification badge, set off from
              the content by a single hairline divider. No gradient/decoration. */}
          <div className="mb-6 flex flex-col gap-4 border-b border-[#e5e7eb] pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <Avatar className="h-16 w-16 shrink-0 ring-1 ring-[#e5e7eb]">
                <AvatarImage src={headerAvatar ?? undefined} />
                <AvatarFallback className="bg-[#EBF5FB] text-[#009FD9] font-bold text-lg">
                  {getInitials(displayName || "?")}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                {/* Show the full account name; allow wrapping on mobile instead of truncating. */}
                <h1 className="text-xl sm:text-2xl font-bold leading-tight text-[#162543] [overflow-wrap:anywhere]">
                  {displayName}
                </h1>
                <div className="mt-1.5 flex min-h-[22px] flex-wrap items-center gap-2">
                  {mode === "offer" && pro && (
                    pro.verification_status === "verified" ? (
                      <Badge variant="verified">{t("identityVerified")}</Badge>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setTab("verificacion")}
                        title={t("verifyInvite")}
                        className="inline-flex items-center rounded-full border border-[#e5e7eb] bg-[#f3f4f6] px-2.5 py-0.5 text-xs font-medium text-[#6b7280] hover:bg-[#e5e7eb] transition-colors"
                      >
                        {t("notVerifiedBadge")}
                      </button>
                    )
                  )}
                  {/* Client (use mode): the cédula "Verificado" badge below the name — IDENTICAL
                      to the pro side, shown ONLY when verified (no "sin verificar" state, no cédula). */}
                  {mode === "use" && clientVerified && (
                    <Badge variant="verified">{t("identityVerified")}</Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Offer mode, provider row still loading → spinner (avoids gate flash). */}
          {offerLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" />
            </div>
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
              {mode === "offer" && pro && (
                <ProfileCompletion pro={pro} onGo={(tab, field) => { setTab(tab as Tab); if (field) setProfileFocus({ field, key: Date.now() }); }} />
              )}

              <div className="flex flex-col lg:flex-row gap-6">
                {/* Sidebar nav (DESKTOP only) — tabs for the active mode + a shared block.
                    On mobile this is replaced by the fixed bottom nav bar below. */}
                <nav className="hidden lg:block lg:w-60 shrink-0 space-y-3">
                  <Card>
                    <CardContent className="p-2 space-y-3">
                      {isProvider && (
                        <div className="border-b border-[#f3f4f6] pb-2">
                          {modePanelButton()}
                        </div>
                      )}
                      <div>
                        {(mode === "offer" ? OFFER_TABS : USE_TABS).map(navButton)}
                      </div>
                      <div>
                        {SHARED_TABS.map(navButton)}
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
                    <Card>
                      <CardHeader className="px-4 pt-4 pb-2 sm:px-6 sm:pt-6 sm:pb-3">
                        <div className="relative">
                          <div className="flex min-w-0 items-center gap-2 pr-28">
                            <h2 className="min-w-0 truncate text-lg font-semibold text-[#111827]">{activeTab === "services" ? t("servicesHeading") : t(`tabs.${activeTab}`)}</h2>
                            {activeTab === "profile" && mode === "offer" && pro?.slug && (
                              <a
                                href={`/es/profesionales/${pro.slug}?preview=1`}
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
                          <p className="mt-0.5 text-sm text-[#6b7280]">{t(`subtitles.${activeTab}`)}</p>
                        )}
                      </CardHeader>
                      <CardContent className="px-4 pt-0 pb-4 sm:px-6 sm:pt-1 sm:pb-6">
                        {/* MI PERFIL — pro editor in offer mode, basic identity in use mode. */}
                        {activeTab === "profile" && mode === "offer" && pro && (
                          <ProfileEditor
                            professionalId={pro.id}
                            profileId={user.id}
                            initial={pro}
                            onSaved={handleSaved}
                            focusField={profileFocus?.field ?? null}
                            focusKey={profileFocus?.key}
                          />
                        )}
                        {activeTab === "profile" && mode === "use" && (
                          <BasicProfileSection />
                        )}

                        {activeTab === "services" && pro && (
                          <ServicesEditor
                            professionalId={pro.id}
                            primaryCategory={pro.category_id}
                            initialProfessions={pro.professions ?? []}
                            initialServices={pro.services ?? []}
                            onSaved={handleSaved}
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
                            coverageAreas={pro.coverage_areas ?? []}
                            travels={String(pro.service_type ?? "").includes("mobile")}
                            onSaved={handleSaved}
                          />
                        )}
                        {activeTab === "suscripcion" && PAYMENTS_ENABLED && <SubscriptionPanel />}
                        {activeTab === "bookings" && <BookingRequests />}
                        {activeTab === "proposals" && pro && (
                          <ProposalsTab
                            categoryId={pro.category_id}
                            professions={(pro.professions && pro.professions.length > 0) ? pro.professions : (pro.category_id ? [pro.category_id] : [])}
                            services={pro.services ?? []}
                          />
                        )}
                        {activeTab === "verificacion" && pro && (
                          <VerificationPanel
                            professionalId={pro.id}
                            status={pro.verification_status ?? "pending"}
                            reason={pro.verification_reason}
                            noCrId={pro.no_cr_id ?? false}
                            onSaved={handleSaved}
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

      {/* Footer — hidden on mobile inside the panel: the bottom nav bar takes its place. */}
      <div className="hidden lg:block">
        <LandingFooter />
      </div>

      {/* MOBILE bottom nav bar — a native-app tab bar (icon + label, Instagram-style). Fixed,
          thumb-reachable, always visible while in the panel; replaces the sidebar on phones.
          A capped item set per mode (+ "Más") means it ALWAYS fits — never a horizontal scroll. */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex items-stretch border-t border-[#e5e7eb] bg-white shadow-[0_-14px_34px_-18px_rgba(15,23,42,0.45)] pb-[env(safe-area-inset-bottom)]"
        aria-label={t("title")}
      >
        {isProvider && modeBottomNavButton()}
        {primaryTabs.map((tab) => {
          const active = activeTab === tab && !moreOpen;
          return (
            <button
              key={tab}
              onClick={() => { setMoreOpen(false); setTab(tab); }}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex-1 flex flex-col items-center justify-center gap-1 px-0.5 pt-2 pb-1.5 transition-colors before:absolute before:left-1/2 before:top-0 before:h-0.5 before:w-8 before:-translate-x-1/2 before:rounded-b-full before:bg-[#009FD9] before:transition-opacity",
                active ? "text-[#009FD9] before:opacity-100" : "text-[#6b7280] before:opacity-0 hover:text-[#374151]"
              )}
            >
              <span className="relative [&>svg]:!h-[22px] [&>svg]:!w-[22px]">
                {TAB_ICONS[tab]}
                {/* Dedicated, mode-scoped unread badge on the Notificaciones tab. */}
                {tab === "notifications" && unreadCount > 0 && (
                  <span className="absolute -right-2 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#009FD9] px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white">{unreadCount > 9 ? "9+" : unreadCount}</span>
                )}
              </span>
              <span className="text-[10px] font-semibold leading-none max-w-full truncate">{t(`bottomNav.${tab}`)}</span>
            </button>
          );
        })}
        <button
          onClick={() => setMoreOpen(true)}
          aria-current={activeInMore ? "page" : undefined}
          className={cn(
            "relative flex-1 flex flex-col items-center justify-center gap-1 px-0.5 pt-2 pb-1.5 transition-colors before:absolute before:left-1/2 before:top-0 before:h-0.5 before:w-8 before:-translate-x-1/2 before:rounded-b-full before:bg-[#009FD9] before:transition-opacity",
            (moreOpen || activeInMore) ? "text-[#009FD9] before:opacity-100" : "text-[#6b7280] before:opacity-0 hover:text-[#374151]"
          )}
        >
          {/* "Más" no longer carries a notification dot — notifications now have their own
              dedicated bottom-bar slot (sprint 432). */}
          <Menu className="h-[22px] w-[22px]" />
          <span className="text-[10px] font-semibold leading-none">{t("bottomNav.more")}</span>
        </button>
      </nav>

      {/* "Más" bottom sheet — the overflow sections (setup + shared), reachable from the bar. */}
      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40 animate-in fade-in-0" onClick={() => setMoreOpen(false)} aria-hidden />
          <div className="absolute inset-x-0 bottom-0 max-h-[78vh] overflow-y-auto rounded-t-2xl bg-white shadow-[0_-24px_60px_-18px_rgba(15,23,42,0.45)] pb-[env(safe-area-inset-bottom)] animate-in slide-in-from-bottom duration-200">
            <div className="sticky top-0 bg-white pt-2">
              {/* Drag handle (tap to close too) + a clear X — standard bottom-sheet dismissal. */}
              <button onClick={() => setMoreOpen(false)} aria-label={t("bottomNav.close")} className="mx-auto block h-1 w-10 rounded-full bg-[#d1d5db]" />
              <div className="flex items-center justify-between px-4 pt-2 pb-2">
                {/* NOT the bare "Más" (that's just the button label) — a clearer sheet title. */}
                <p className="text-sm font-semibold text-[#111827]">{t("bottomNav.moreTitle")}</p>
                <button onClick={() => setMoreOpen(false)} aria-label={t("bottomNav.close")} className="-mr-1.5 p-1.5 rounded-lg text-[#6b7280] hover:bg-[#f3f4f6] transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="p-2 pt-0">
              {moreTabs.map((tab) => {
                const badge = tab === "notifications" ? unreadCount : tab === "soporte" ? supportUnread : 0;
                const active = activeTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => { setMoreOpen(false); setTab(tab); }}
                    className={cn(
                      "relative w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:rounded-r-full before:bg-[#009FD9] before:transition-opacity",
                      active ? "bg-[#EBF5FB] text-[#009FD9] before:opacity-100" : "text-[#374151] before:opacity-0 hover:bg-[#f3f4f6]"
                    )}
                  >
                    <span className={cn("shrink-0", active ? "text-[#009FD9]" : "text-[#9ca3af]")}>{TAB_ICONS[tab]}</span>
                    <span className="flex-1">{tab === "services" ? t("servicesHeading") : t(`tabs.${tab}`)}</span>
                    {badge > 0 && (
                      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#009FD9] px-1.5 text-center text-[11px] font-bold leading-none text-white">{badge > 9 ? "9+" : badge}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
