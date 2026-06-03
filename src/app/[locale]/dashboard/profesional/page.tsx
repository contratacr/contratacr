"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { User, Image as ImageIcon, CalendarDays, Inbox, LogOut, ExternalLink } from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProfileEditor } from "@/components/dashboard/pro/profile-editor";
import { PhotoGallery } from "@/components/dashboard/pro/photo-gallery";
import { AvailabilityEditor } from "@/components/dashboard/pro/availability-editor";
import { BookingRequests } from "@/components/dashboard/pro/booking-requests";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/utils";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

type Tab = "profile" | "photos" | "availability" | "bookings";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProData = Record<string, any>;

const TAB_ICONS: Record<Tab, React.ReactNode> = {
  profile: <User className="h-4 w-4" />,
  photos: <ImageIcon className="h-4 w-4" />,
  availability: <CalendarDays className="h-4 w-4" />,
  bookings: <Inbox className="h-4 w-4" />,
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

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from("professionals")
      .select("*, profiles(*), provincia_id, canton_id, address, service_type, category_id")
      .eq("profile_id", user.id)
      .single()
      .then(({ data }) => { setPro(data); setLoading(false); });
  }, [user]);

  function setTab(tab: Tab) {
    const params = new URLSearchParams({ tab });
    router.push(`/dashboard/profesional?${params}`);
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" />
      </div>
    );
  }

  if (!pro) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-[#6b7280]">{t("notPro")}</p>
        </main>
      </div>
    );
  }

  const TABS: Tab[] = ["profile", "photos", "availability", "bookings"];

  return (
    <div className="min-h-screen flex flex-col bg-[#fafafa]">
      <Navbar />
      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14 ring-2 ring-offset-1 ring-[#bbe2d5]">
                <AvatarImage src={pro.profiles?.avatar_url} />
                <AvatarFallback>{getInitials(pro.profiles?.full_name ?? "?")}</AvatarFallback>
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
                  {pro.is_verified && <Badge variant="verified">Verificado</Badge>}
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
                      {t(`nav.${tab}`)}
                    </button>
                  ))}
                </CardContent>
              </Card>
            </nav>

            {/* Main content */}
            <div className="flex-1">
              <Card>
                <CardHeader className="px-6 pt-6 pb-4">
                  <h2 className="text-lg font-semibold text-[#111827]">{t(`nav.${activeTab}`)}</h2>
                </CardHeader>
                <CardContent className="px-6 pb-6">
                  {activeTab === "profile" && (
                    <ProfileEditor
                      professionalId={pro.id}
                      profileId={user!.id}
                      initial={pro}
                    />
                  )}
                  {activeTab === "photos" && (
                    <PhotoGallery
                      professionalId={pro.id}
                      initialUrls={pro.portfolio_urls ?? []}
                    />
                  )}
                  {activeTab === "availability" && (
                    <AvailabilityEditor
                      professionalId={pro.id}
                      initialAvailability={pro.availability}
                    />
                  )}
                  {activeTab === "bookings" && <BookingRequests />}
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
