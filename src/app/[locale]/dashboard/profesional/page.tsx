"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { User, Image as ImageIcon, CalendarDays, Inbox, LogOut, ExternalLink, Wrench, FolderOpen, ShieldCheck, Bell } from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProfileEditor } from "@/components/dashboard/pro/profile-editor";
import { PhotoGallery } from "@/components/dashboard/pro/photo-gallery";
import { AvailabilityEditor } from "@/components/dashboard/pro/availability-editor";
import { ServicesEditor } from "@/components/dashboard/pro/services-editor";
import { BookingRequests } from "@/components/dashboard/pro/booking-requests";
import { ProposalsTab } from "@/components/dashboard/pro/proposals-tab";
import { VerificationPanel } from "@/components/dashboard/pro/verification-panel";
import { NotificationsList } from "@/components/notifications/notifications-list";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/utils";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

type Tab = "profile" | "services" | "photos" | "availability" | "bookings" | "proposals" | "notifications" | "verificacion";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProData = Record<string, any>;

const TAB_ICONS: Record<Tab, React.ReactNode> = {
  profile: <User className="h-4 w-4" />,
  services: <Wrench className="h-4 w-4" />,
  photos: <ImageIcon className="h-4 w-4" />,
  availability: <CalendarDays className="h-4 w-4" />,
  bookings: <Inbox className="h-4 w-4" />,
  proposals: <FolderOpen className="h-4 w-4" />,
  notifications: <Bell className="h-4 w-4" />,
  verificacion: <ShieldCheck className="h-4 w-4" />,
};

const TAB_LABELS: Record<Tab, string> = {
  profile: "Mi perfil",
  services: "Servicios",
  photos: "Casos de éxito",
  availability: "Disponibilidad",
  bookings: "Solicitudes",
  proposals: "Proyectos",
  notifications: "Notificaciones",
  verificacion: "Verificación",
};

export default function ProDashboardPage() {
  const t = useTranslations("dashboard.pro");
  const tCat = useTranslations("categories");
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get("tab") as Tab) ?? "profile";

  const [pro, setPro] = useState<ProData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  const fetchPro = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("professionals")
      .select("*, profiles(*), provincia_id, canton_id, address, service_type, category_id, services")
      .eq("profile_id", user.id)
      .single();
    setPro(data);
    setLoading(false);
  }, [user]);

  // Re-fetch pro data whenever the tab changes OR refreshKey increments.
  // This ensures navigating back to any tab always shows the latest saved data.
  useEffect(() => {
    if (!user) return;
    fetchPro();
  }, [user, activeTab, refreshKey, fetchPro]);

  // No professional record yet (e.g. just signed up) — send them to finish
  // registration. Declared here, BEFORE any early return, so the hook order
  // stays stable across renders (a hook after a conditional return crashes the
  // page with "Rendered more hooks than during the previous render").
  useEffect(() => {
    if (!authLoading && !loading && !pro && user) {
      router.replace("/registro/profesional");
    }
  }, [authLoading, loading, pro, user, router]);

  function setTab(tab: Tab) {
    const params = new URLSearchParams({ tab });
    router.push(`/dashboard/profesional?${params}`);
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

  const TABS: Tab[] = ["profile", "services", "photos", "availability", "bookings", "proposals", "notifications", "verificacion"];

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
                <div className="flex items-center gap-2 mt-1">
                  {pro.category_id && (
                    <Badge variant="default">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {tCat(pro.category_id as any)}
                    </Badge>
                  )}
                  {pro.verification_status === "verified" && (
                    <Badge variant="verified" className="gap-1"><ShieldCheck className="h-3 w-3" />Identidad verificada</Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {pro.slug && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`/es/profesionales/${pro.slug}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Ver mi perfil
                  </a>
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4" />
                Salir
              </Button>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-6">
            {/* Sidebar nav */}
            <nav className="lg:w-52 shrink-0">
              <Card>
                <CardContent className="p-2">
                  {TABS.map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setTab(tab)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left",
                        activeTab === tab
                          ? "bg-[#EBF5FB] text-[#009FD9]"
                          : "text-[#374151] hover:bg-[#f3f4f6]"
                      )}
                    >
                      {TAB_ICONS[tab]}
                      {TAB_LABELS[tab]}
                    </button>
                  ))}
                </CardContent>
              </Card>
            </nav>

            {/* Main content */}
            <div className="flex-1">
              <Card>
                <CardHeader className="px-6 pt-6 pb-4">
                  <h2 className="text-lg font-semibold text-[#111827]">{TAB_LABELS[activeTab]}</h2>
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
                      initialVideoconsulta={pro.videoconsulta ?? false}
                      onSaved={handleSaved}
                    />
                  )}
                  {activeTab === "bookings" && <BookingRequests />}
                  {activeTab === "proposals" && (
                    <ProposalsTab categoryId={pro.category_id} />
                  )}
                  {activeTab === "notifications" && <NotificationsList />}
                  {activeTab === "verificacion" && (
                    <VerificationPanel
                      professionalId={pro.id}
                      status={pro.verification_status ?? "pending"}
                      reason={pro.verification_reason}
                      onSaved={handleSaved}
                    />
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
