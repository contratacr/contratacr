"use client";

import { useEffect, useState } from "react";
import { MessageCircle, CalendarDays, User, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getWhatsAppLink } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { BookingStatus } from "@/types";

type Booking = {
  id: string;
  client_cedula?: string;
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  service_description: string;
  preferred_date_text?: string;
  scheduled_date?: string;
  scheduled_time?: string;
  status: BookingStatus;
  created_at: string;
  professional_whatsapp?: string;
};

const STATUS_VARIANT: Record<BookingStatus, "warning" | "success" | "error" | "default"> = {
  pending: "warning",
  confirmed: "success",
  in_progress: "success",
  cancelled: "error",
  rescheduled: "warning",
  completed: "default",
};

const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  in_progress: "En progreso",
  completed: "Completada",
  cancelled: "Cancelada",
  rescheduled: "Reprogramada",
};

export function BookingRequests() {
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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" />
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div className="text-center py-16">
        <CalendarDays className="h-12 w-12 text-[#e5e7eb] mx-auto mb-3" />
        <h3 className="font-semibold text-[#374151] mb-1">No tenés solicitudes todavía</h3>
        <p className="text-sm text-[#9ca3af]">Cuando los clientes te contacten, aparecerán aquí.</p>
      </div>
    );
  }

  const upcoming = bookings.filter((b) => ["pending", "confirmed", "in_progress"].includes(b.status));
  const past = bookings.filter((b) => ["completed", "cancelled", "rescheduled"].includes(b.status));

  function BookingCard({ booking }: { booking: Booking }) {
    const dateStr = booking.scheduled_date
      ? (() => {
          const [y, m, d] = booking.scheduled_date.split("-").map(Number);
          const label = new Date(y, m - 1, d).toLocaleDateString("es-CR", {
            weekday: "short", day: "numeric", month: "short",
          });
          return booking.scheduled_time ? `${label} · ${booking.scheduled_time}` : label;
        })()
      : booking.preferred_date_text;

    return (
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <Badge variant={STATUS_VARIANT[booking.status]}>
                  {STATUS_LABEL[booking.status]}
                </Badge>
                <span className="text-xs text-[#9ca3af]">
                  {new Date(booking.created_at).toLocaleDateString("es-CR")}
                </span>
              </div>

              <div className="space-y-2">
                {(booking.client_name) && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-[#6b7280] shrink-0" />
                    <span className="font-medium text-[#111827]">{booking.client_name}</span>
                  </div>
                )}
                {booking.service_description && (
                  <div className="flex items-start gap-2 text-sm">
                    <FileText className="h-4 w-4 text-[#6b7280] shrink-0 mt-0.5" />
                    <span className="text-[#374151]">{booking.service_description}</span>
                  </div>
                )}
                {dateStr && (
                  <div className="flex items-center gap-2 text-sm">
                    <CalendarDays className="h-4 w-4 text-[#6b7280] shrink-0" />
                    <span className="text-[#374151]">{dateStr}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 shrink-0">
              {booking.status === "pending" && (
                <>
                  <Button size="sm" onClick={() => updateStatus(booking.id, "confirmed")}>
                    Confirmar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => updateStatus(booking.id, "cancelled")}>
                    Cancelar
                  </Button>
                </>
              )}
              {booking.status === "confirmed" && (
                <>
                  <Button size="sm" variant="secondary" onClick={() => updateStatus(booking.id, "in_progress")}>
                    En progreso
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => updateStatus(booking.id, "cancelled")}>
                    Cancelar
                  </Button>
                </>
              )}
              {booking.status === "in_progress" && (
                <Button size="sm" onClick={() => updateStatus(booking.id, "completed")}>
                  Completar
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
                    WhatsApp
                  </a>
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {upcoming.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[#374151] mb-3">Próximas y activas</h3>
          <div className="flex flex-col gap-3">
            {upcoming.map((b) => <BookingCard key={b.id} booking={b} />)}
          </div>
        </div>
      )}
      {past.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[#374151] mb-3">Historial</h3>
          <div className="flex flex-col gap-3">
            {past.map((b) => <BookingCard key={b.id} booking={b} />)}
          </div>
        </div>
      )}
    </div>
  );
}
