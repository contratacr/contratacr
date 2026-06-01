"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MessageCircle, CalendarDays, User, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getWhatsAppLink } from "@/lib/utils";
import { cn } from "@/lib/utils";

type BookingStatus = "pending" | "confirmed" | "cancelled" | "completed";

type Booking = {
  id: string;
  client_cedula: string;
  client_name: string;
  client_email?: string;
  service_description: string;
  preferred_date_text?: string;
  status: BookingStatus;
  created_at: string;
  professional_whatsapp?: string;
};

const STATUS_VARIANT: Record<BookingStatus, "warning" | "success" | "error" | "default"> = {
  pending: "warning",
  confirmed: "success",
  cancelled: "error",
  completed: "default",
};

export function BookingRequests() {
  const t = useTranslations("dashboard.pro.bookings");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/bookings?role=professional")
      .then((r) => r.json())
      .then(({ bookings }) => setBookings(bookings ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function updateStatus(id: string, status: BookingStatus) {
    await fetch("/api/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)));
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#319278] border-t-transparent" />
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div className="text-center py-16">
        <CalendarDays className="h-12 w-12 text-[#e5e7eb] mx-auto mb-3" />
        <h3 className="font-semibold text-[#374151] mb-1">{t("empty")}</h3>
        <p className="text-sm text-[#9ca3af]">{t("emptyHint")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {bookings.map((booking) => (
        <Card key={booking.id}>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <Badge variant={STATUS_VARIANT[booking.status]}>
                    {t(`status.${booking.status}`)}
                  </Badge>
                  <span className="text-xs text-[#9ca3af]">
                    {new Date(booking.created_at).toLocaleDateString("es-CR")}
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-[#6b7280] shrink-0" />
                    <span className="font-medium text-[#111827]">{booking.client_name}</span>
                    {booking.client_cedula && (
                      <span className="text-[#9ca3af] text-xs">({booking.client_cedula})</span>
                    )}
                  </div>

                  {booking.service_description && (
                    <div className="flex items-start gap-2 text-sm">
                      <FileText className="h-4 w-4 text-[#6b7280] shrink-0 mt-0.5" />
                      <span className="text-[#374151]">{booking.service_description}</span>
                    </div>
                  )}

                  {booking.preferred_date_text && (
                    <div className="flex items-center gap-2 text-sm">
                      <CalendarDays className="h-4 w-4 text-[#6b7280] shrink-0" />
                      <span className="text-[#374151]">{booking.preferred_date_text}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 shrink-0">
                {booking.status === "pending" && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => updateStatus(booking.id, "confirmed")}
                    >
                      {t("confirm")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateStatus(booking.id, "cancelled")}
                    >
                      {t("cancel")}
                    </Button>
                  </>
                )}
                {booking.status === "confirmed" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => updateStatus(booking.id, "completed")}
                  >
                    {t("markComplete")}
                  </Button>
                )}
                {booking.client_name && (
                  <Button size="sm" variant="whatsapp" asChild>
                    <a
                      href={getWhatsAppLink(
                        booking.professional_whatsapp ?? "",
                        `Hola ${booking.client_name}, te contacto por tu solicitud en ContrataCR.`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      {t("contact")}
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
