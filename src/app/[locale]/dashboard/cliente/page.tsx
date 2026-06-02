"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { CalendarDays, Bookmark, LogOut, MessageCircle, Star } from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { LeaveReviewModal } from "@/components/professionals/leave-review-modal";
import { SavedProfessionalsTab } from "@/components/professionals/saved-professionals-tab";

type Tab = "bookings" | "saved";

type Booking = {
  id: string;
  professional_id: string;
  service_description: string;
  preferred_date_text?: string;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  created_at: string;
  professionals?: {
    slug: string;
    profiles: { full_name: string };
    categories: { id: string; icon: string };
  };
};

const STATUS_VARIANT: Record<string, "warning" | "success" | "error" | "default"> = {
  pending: "warning",
  confirmed: "success",
  cancelled: "error",
  completed: "default",
};

export default function ClientDashboardPage() {
  const t = useTranslations("dashboard.client");
  const tStatus = useTranslations("dashboard.client.bookings.status");
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get("tab") as Tab) ?? "bookings";

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewModal, setReviewModal] = useState<{ professionalId: string; professionalName: string } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/bookings?role=client")
      .then((r) => r.json())
      .then(({ bookings }) => setBookings(bookings ?? []))
      .finally(() => setLoading(false));
  }, [user]);

  function setTab(tab: Tab) {
    const params = new URLSearchParams({ tab });
    router.push(`/dashboard/cliente?${params}`);
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

  const TABS: Tab[] = ["bookings", "saved"];
  const TAB_ICONS: Record<Tab, React.ReactNode> = {
    bookings: <CalendarDays className="h-4 w-4" />,
    saved: <Bookmark className="h-4 w-4" />,
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#fafafa]">
      <Navbar />
      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-bold text-[#111827]">{t("title")}</h1>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
              Salir
            </Button>
          </div>

          {/* Tab nav */}
          <div className="flex gap-1 bg-[#f3f4f6] rounded-xl p-1 mb-6">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setTab(tab)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
                  activeTab === tab
                    ? "bg-white text-[#009FD9] shadow-sm"
                    : "text-[#6b7280] hover:text-[#374151]"
                )}
              >
                {TAB_ICONS[tab]}
                {t(`nav.${tab}`)}
              </button>
            ))}
          </div>

          {/* Bookings tab */}
          {activeTab === "bookings" && (
            <div>
              <h2 className="text-lg font-semibold text-[#111827] mb-4">{t("bookings.title")}</h2>
              {bookings.length === 0 ? (
                <div className="text-center py-16">
                  <CalendarDays className="h-12 w-12 text-[#e5e7eb] mx-auto mb-3" />
                  <p className="font-medium text-[#374151]">{t("bookings.empty")}</p>
                  <p className="text-sm text-[#9ca3af] mt-1">{t("bookings.emptyHint")}</p>
                  <Button className="mt-5" asChild>
                    <a href="/buscar">Buscar profesionales</a>
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {bookings.map((booking) => (
                    <Card key={booking.id}>
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <span className="text-sm font-semibold text-[#111827]">
                                {booking.professionals?.categories?.icon}{" "}
                                {booking.professionals?.profiles?.full_name ?? "Profesional"}
                              </span>
                              <Badge variant={STATUS_VARIANT[booking.status]}>
                                {tStatus(booking.status)}
                              </Badge>
                            </div>
                            <p className="text-sm text-[#374151] mb-1">{booking.service_description}</p>
                            {booking.preferred_date_text && (
                              <p className="text-xs text-[#6b7280]">📅 {booking.preferred_date_text}</p>
                            )}
                            <p className="text-xs text-[#9ca3af] mt-2">
                              {new Date(booking.created_at).toLocaleDateString("es-CR")}
                            </p>
                          </div>
                          {booking.status === "completed" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setReviewModal({
                                  professionalId: booking.professional_id,
                                  professionalName:
                                    booking.professionals?.profiles?.full_name ?? "Profesional",
                                })
                              }
                            >
                              <Star className="h-3.5 w-3.5" />
                              {t("bookings.leaveReview")}
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Saved tab */}
          {activeTab === "saved" && (
            <div>
              <h2 className="text-lg font-semibold text-[#111827] mb-4">{t("saved.title")}</h2>
              <SavedProfessionalsTab />
            </div>
          )}
        </div>
      </main>

      {reviewModal && (
        <LeaveReviewModal
          {...reviewModal}
          onClose={() => setReviewModal(null)}
        />
      )}
    </div>
  );
}
