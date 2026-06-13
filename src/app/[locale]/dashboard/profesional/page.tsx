"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import {
  User, Image as ImageIcon, CalendarDays, Inbox, LogOut, ExternalLink, Wrench,
  FolderOpen, ShieldCheck, Bell, Send, ClipboardList, Bookmark, Settings, LifeBuoy,
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
import { BookingRequests } from "@/components/dashboard/pro/booking-requests";
import { ProposalsTab } from "@/components/dashboard/pro/proposals-tab";
import { VerificationPanel } from "@/components/dashboard/pro/verification-panel";
import { ClientActivity } from "@/components/dashboard/client-activity";
import { NotificationsList } from "@/components/notifications/notifications-list";
import { AccountSecuritySection } from "@/components/account/account-security";
import { CloseAccountSection } from "@/components/account/close-account-section";
import { SupportTickets } from "@/components/support/support-tickets";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/utils";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

// Unified professional dashboard (Mercado Libre-style): ONE account, two clearly
// labeled groups — "Mi perfil profesional" (acting as a professional) and
// "Contratar servicios" (acting as a client) — plus a single notifications stream.
type Tab =
  | "profile" | "services" | "photos" | "availability" | "bookings" | "proposals" | "verificacion"
  | "sent_bookings" | "sent_projects" | "saved"
  | "notifications" | "soporte" | "cuenta";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProData = Record<string, any>;

const TAB_ICONS: Record<Tab, React.ReactNode> = {
  profile: <User className="h-4 w-4" />,
  services: <Wrench className="h-4 w-4" />,
  photos: <ImageIcon className="h-4 w-4" />,
  availability: <CalendarDays className="h-4 w-4" />,
  bookings: <Inbox className="h-4 w-4" />,
  proposals: <FolderOpen className="h-4 w-4" />,
  verificacion: <ShieldCheck className="h-4 w-4" />,
  sent_bookings: <Send className="h-4 w-4" />,
  sent_projects: <ClipboardList className="h-4 w-4" />,
  saved: <Bookmark className="h-4 w-4" />,
  notifications: <Bell className="h-4 w-4" />,
  soporte: <LifeBuoy className="h-4 w-4" />,
  cuenta: <Settings className="h-4 w-4" />,
};

// Tabs that show a one-line context note under the section title (translated via
// proPanel.subtitles.<tab>), so it's always obvious which role a section belongs to.
const TABS_WITH_SUBTITLE = new Set<Tab>(["bookings", "proposals", "sent_bookings", "sent_projects", "saved"]);

// Sidebar layout — two labeled groups + a standalone notifications entry.
const GROUP_PRO: Tab[] = ["profile", "services", "photos", "availability", "bookings", "proposals", "verificacion"];
const GROUP_CLIENT: Tab[] = ["sent_bookings", "sent_projects", "saved"];

export default function ProDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("proPanel");
  const activeTab = (searchParams.get("tab") as Tab) ?? "profile";

  const [pro, setPro] = useState<ProData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [supportUnread, setSupportUnread] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  // Count of consecutive "no pro row" fetches. A freshly-created account can lag
  // (replication/RLS) — we retry a few times before bouncing to registration so
  // the panel never flashes back to the registration flow (item 6).
  const [noProTries, setNoProTries] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

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

  // Re-fetch pro data whenever the tab changes OR refreshKey increments.
  useEffect(() => {
    if (!user) return;
    fetchPro();
  }, [user, activeTab, refreshKey, fetchPro]);

  // Unread notifications badge (both professional + client notifications — one stream).
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from("notifications")
      .select("id", { count: "exact" })
      .eq("user_id", user.id)
      .eq("read", false)
      .then(({ count }) => setUnreadCount(count ?? 0));
  }, [user, activeTab, refreshKey]);

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

  // No professional record yet — send them to finish registration. Declared
  // BEFORE any early return so the hook order stays stable across renders.
  useEffect(() => {
    if (authLoading || loading || pro || !user) return;
    if (noProTries < 4) {
      const id = setTimeout(() => fetchPro(), 700);
      return () => clearTimeout(id);
    }
    router.replace("/registro/profesional");
  }, [authLoading, loading, pro, user, router, noProTries, fetchPro]);

  function setTab(tab: Tab) {
    const params = new URLSearchParams({ tab });
    // `scroll: false` stops Next's default jump-to-top on navigation — otherwise
    // it fires AFTER our scroll-to-section and bounces the user back up.
    router.push(`/dashboard/profesional?${params}`, { scroll: false });
    // Always bring the chosen section into view. On mobile the menu sits ABOVE the
    // content; on desktop the "Completa tu perfil" widget sits above the row and
    // vanishes on navigate (shifting the layout up) — without this, selecting an
    // item felt like nothing happened. `scroll-mt` on the content clears the header.
    requestAnimationFrame(() => contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function handleSaved() {
    setRefreshKey((k) => k + 1);
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.assign("/es");
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" />
      </div>
    );
  }

  // No professional record — redirect handled by the effect above.
  if (!pro) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" />
      </div>
    );
  }

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
            <span className="absolute -top-2 -right-2.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white">
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </span>
        {t(`tabs.${tab}`)}
      </button>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#fafafa]">
      <Navbar />
      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14">
                <AvatarImage src={pro.profiles?.avatar_url} />
                <AvatarFallback className="bg-[#EBF5FB] text-[#009FD9] font-bold">
                  {getInitials(pro.profiles?.full_name ?? "?")}
                </AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-xl font-bold text-[#111827]">{pro.profiles?.full_name}</h1>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {pro.verification_status === "verified" && (
                    <Badge variant="verified" className="gap-1"><ShieldCheck className="h-3 w-3" />{t("identityVerified")}</Badge>
                  )}
                  {(pro.verification_status === "pending" || pro.verification_status === "under_appeal") && (
                    <Badge variant="warning">{t("identityUnverified")}</Badge>
                  )}
                  {pro.verification_status === "rejected" && (
                    <Badge variant="error">{t("verificationRejected")}</Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {pro.slug && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`/es/profesionales/${pro.slug}?preview=1`}>
                    <ExternalLink className="h-4 w-4" />
                    {t("viewAsClient")}
                  </a>
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4" />
                {t("signOut")}
              </Button>
            </div>
          </div>

          {/* Profile-completion — prominent, full-width at the TOP of the dashboard.
              The component hides itself once everything is done + verified. */}
          <ProfileCompletion pro={pro} onGo={(tab) => setTab(tab as Tab)} />

          <div className="flex flex-col lg:flex-row gap-6">
            {/* Sidebar nav — two clearly-labeled role groups */}
            <nav className="lg:w-60 shrink-0">
              <Card>
                <CardContent className="p-2 space-y-3">
                  <div>
                    <p className="px-3 pt-1 pb-1.5 text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest">
                      {t("groupPro")}
                    </p>
                    {GROUP_PRO.map(navButton)}
                  </div>
                  <div className="border-t border-[#f3f4f6] pt-2">
                    <p className="px-3 pt-1 pb-1.5 text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest">
                      {t("groupClient")}
                    </p>
                    {GROUP_CLIENT.map(navButton)}
                  </div>
                  <div className="border-t border-[#f3f4f6] pt-2">
                    {navButton("notifications")}
                    {navButton("soporte")}
                    {navButton("cuenta")}
                  </div>
                </CardContent>
              </Card>
            </nav>

            {/* Main content */}
            <div ref={contentRef} className="flex-1 scroll-mt-20 lg:scroll-mt-0">
              <Card>
                <CardHeader className="px-6 pt-6 pb-4">
                  <h2 className="text-lg font-semibold text-[#111827]">{t(`tabs.${activeTab}`)}</h2>
                  {TABS_WITH_SUBTITLE.has(activeTab) && (
                    <p className="text-sm text-[#6b7280] mt-0.5">{t(`subtitles.${activeTab}`)}</p>
                  )}
                </CardHeader>
                <CardContent className="px-6 pb-6">
                  {activeTab === "profile" && (
                    <ProfileEditor
                      professionalId={pro.id}
                      profileId={user!.id}
                      initial={pro}
                      onSaved={handleSaved}
                    />
                  )}
                  {activeTab === "services" && (
                    <ServicesEditor
                      professionalId={pro.id}
                      primaryCategory={pro.category_id}
                      initialProfessions={pro.professions ?? []}
                      initialServices={pro.services ?? []}
                      onSaved={handleSaved}
                    />
                  )}
                  {activeTab === "photos" && (
                    <PhotoGallery
                      professionalId={pro.id}
                      initialUrls={pro.portfolio_urls ?? []}
                      initialItems={pro.portfolio_items ?? undefined}
                      professions={(pro.professions && pro.professions.length > 0) ? pro.professions : (pro.category_id ? [pro.category_id] : [])}
                      services={pro.services ?? []}
                      onSaved={handleSaved}
                    />
                  )}
                  {activeTab === "availability" && (
                    <AvailabilityEditor
                      professionalId={pro.id}
                      initialPublic={pro.availability_public ?? true}
                      initialContactPreference={pro.contact_preference ?? "ambas"}
                      workplaces={pro.workplaces ?? []}
                      coverageAreas={pro.coverage_areas ?? []}
                      professions={(pro.professions && pro.professions.length > 0) ? pro.professions : (pro.category_id ? [pro.category_id] : [])}
                      initialAllowPhoneCall={pro.allow_phone_call ?? false}
                      onSaved={handleSaved}
                    />
                  )}
                  {activeTab === "bookings" && <BookingRequests />}
                  {activeTab === "proposals" && (
                    <ProposalsTab categoryId={pro.category_id} />
                  )}
                  {activeTab === "verificacion" && (
                    <VerificationPanel
                      professionalId={pro.id}
                      status={pro.verification_status ?? "pending"}
                      reason={pro.verification_reason}
                      noCrId={pro.no_cr_id ?? false}
                      onSaved={handleSaved}
                    />
                  )}

                  {/* "Contratar servicios" — same account, acting as a client */}
                  {activeTab === "sent_bookings" && <ClientActivity section="bookings" />}
                  {activeTab === "sent_projects" && <ClientActivity section="projects" />}
                  {activeTab === "saved" && <ClientActivity section="saved" />}

                  {activeTab === "notifications" && <NotificationsList />}

                  {activeTab === "soporte" && <SupportTickets onUnreadChange={setSupportUnread} />}

                  {activeTab === "cuenta" && (
                    <div className="space-y-6">
                      <AccountSecuritySection showHeading={false} />
                      <CloseAccountSection />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
