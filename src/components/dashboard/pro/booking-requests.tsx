"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { CalendarDays, User, FileText, Phone, Flag, MapPin } from "lucide-react";
import { getCategoryLabel } from "@/lib/data/categories";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getWhatsAppLink } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { StatusFilterTabs, SOLICITUD_TABS, solicitudMatches } from "@/components/dashboard/status-filter-tabs";
import type { BookingStatus } from "@/types";

type Booking = {
  id: string;
  client_id?: string | null;
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
  profiles?: { full_name?: string; avatar_url?: string; is_flagged?: boolean } | null;
  client_dob?: string | null;
  category_id?: string | null;
  slot_location_label?: string | null;
  for_someone_else?: boolean;
  beneficiary_name?: string | null;
  beneficiary_cedula?: string | null;
  beneficiary_dob?: string | null;
  beneficiary_phone?: string | null;
  beneficiary_is_minor?: boolean;
};

const STATUS_VARIANT: Record<BookingStatus, "warning" | "success" | "error" | "default"> = {
  pending: "warning",
  confirmed: "success",
  in_progress: "success",
  awaiting_confirmation: "warning",
  cancelled: "error",
  rescheduled: "warning",
  completed: "default",
};

const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  in_progress: "En progreso",
  awaiting_confirmation: "Esperando confirmación",
  completed: "Finalizada",
  cancelled: "Cancelada",
  rescheduled: "Reprogramada",
};

export function BookingRequests() {
  const locale = useLocale();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("activas");

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

  async function reportClient(booking: Booking) {
    const reason = window.prompt("¿Por qué reportas a este cliente? (no se presentó, datos falsos, trato irrespetuoso, etc.)");
    if (!reason || !reason.trim()) return;
    const res = await fetch("/api/report-client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: booking.id, clientId: booking.client_id ?? null, reason: reason.trim() }),
    });
    if (res.ok) alert("Gracias. Tu reporte fue enviado al equipo de moderación.");
    else alert("No se pudo enviar el reporte. Intenta de nuevo.");
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
        <h3 className="font-semibold text-[#374151] mb-1">No tienes solicitudes todavía</h3>
        <p className="text-sm text-[#9ca3af]">Cuando los clientes te contacten, aparecerán aquí.</p>
      </div>
    );
  }

  const filtered = bookings.filter((b) => solicitudMatches(filter, b.status));

  const todayISO = new Date().toISOString().slice(0, 10);

  function BookingCard({ booking }: { booking: Booking }) {
    // Once the booked date has passed, the pro can mark the service completed.
    const datePassed = booking.scheduled_date ? booking.scheduled_date <= todayISO : false;
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
        <CardContent className="p-4 sm:p-5">
          {/* Header — status + created date */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <Badge variant={STATUS_VARIANT[booking.status]}>
              {STATUS_LABEL[booking.status]}
            </Badge>
            <span className="text-xs text-[#9ca3af] shrink-0">
              {new Date(booking.created_at).toLocaleDateString("es-CR")}
            </span>
          </div>

          {/* Details — client, contact, what & when */}
          <div className="space-y-2">
                {(booking.client_name) && (
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <User className="h-4 w-4 text-[#6b7280] shrink-0" />
                    <span className="font-medium text-[#111827]">{booking.client_name}</span>
                    {booking.profiles?.is_flagged && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#b45309] bg-[#fef3c7] px-1.5 py-0.5 rounded-md">
                        ⚠ Cliente reportado
                      </span>
                    )}
                  </div>
                )}
                {booking.client_phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-[#6b7280] shrink-0" />
                    <span className="text-[#374151]">{booking.client_phone}</span>
                  </div>
                )}
                {/* Client DOB — only stored/shown for HEALTH-category solicitudes. */}
                {booking.client_dob && (
                  <div className="flex items-center gap-2 text-sm">
                    <CalendarDays className="h-4 w-4 text-[#6b7280] shrink-0" />
                    <span className="text-[#374151]">Nacimiento: {booking.client_dob}</span>
                  </div>
                )}

                {/* Beneficiary (booking for someone else): who the service is for */}
                {booking.for_someone_else && (
                  <div className="rounded-lg bg-[#EBF5FB] border border-[#bfdbfe] p-2.5 text-xs">
                    <p className="font-semibold text-[#0089bb] flex items-center gap-1.5 flex-wrap">
                      Para: {booking.beneficiary_name || "otra persona"}
                      {booking.beneficiary_is_minor && (
                        <span className="text-[10px] font-semibold text-[#b45309] bg-[#fef3c7] px-1.5 py-0.5 rounded-md">Menor de edad</span>
                      )}
                    </p>
                    <p className="text-[#374151] mt-0.5">
                      {booking.beneficiary_dob ? `Nac.: ${booking.beneficiary_dob}` : ""}
                      {booking.beneficiary_cedula ? `${booking.beneficiary_dob ? " · " : ""}Cédula: ${booking.beneficiary_cedula}` : ""}
                      {booking.beneficiary_phone ? ` · Contacto: ${booking.beneficiary_phone}` : ""}
                    </p>
                    <p className="text-[10px] text-[#6b7280] mt-0.5">
                      Reservado por {booking.client_name} (responsable).
                      {booking.beneficiary_phone ? " Coordina la cita al contacto de la persona." : ""}
                    </p>
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
                {/* Profession + location the slot belonged to (migration 038). */}
                {(booking.category_id || booking.slot_location_label) && (
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <MapPin className="h-4 w-4 text-[#6b7280] shrink-0" />
                    <span className="text-[#374151]">
                      {[booking.category_id ? getCategoryLabel(booking.category_id, locale) : null, booking.slot_location_label]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                )}
          </div>

          {/* Actions — full-width stacked on mobile, inline (wrap) on desktop.
              Same footer shape across every status so cards stay uniform. */}
          <div className="mt-4 pt-4 border-t border-[#f3f4f6] flex flex-col gap-2">
            {booking.status === "awaiting_confirmation" && (
              <p className="text-xs text-[#b45309] bg-[#fffbeb] border border-[#fde68a] rounded-lg px-2.5 py-2">
                Esperando que el cliente confirme la finalización. Se confirma sola en 7 días.
              </p>
            )}
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
              {booking.status === "pending" && (
                <>
                  <Button size="sm" className="w-full sm:w-auto" onClick={() => updateStatus(booking.id, "confirmed")}>
                    Confirmar
                  </Button>
                  <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => updateStatus(booking.id, "cancelled")}>
                    Cancelar
                  </Button>
                </>
              )}
              {booking.status === "confirmed" && (
                <>
                  {datePassed ? (
                    <Button size="sm" className="w-full sm:w-auto" onClick={() => updateStatus(booking.id, "awaiting_confirmation")}>
                      Marcar como completado
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" className="w-full sm:w-auto" onClick={() => updateStatus(booking.id, "in_progress")}>
                      En progreso
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => updateStatus(booking.id, "cancelled")}>
                    Cancelar
                  </Button>
                </>
              )}
              {booking.status === "in_progress" && (
                <>
                  <Button size="sm" className="w-full sm:w-auto" onClick={() => updateStatus(booking.id, "awaiting_confirmation")}>
                    Marcar trabajo realizado
                  </Button>
                  <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => updateStatus(booking.id, "cancelled")}>
                    Cancelar
                  </Button>
                </>
              )}
              {/* WhatsApp contact: for a third-party booking the appointment contact
                  is the BENEFICIARY's number (that's who the service is for); else
                  the client's. The label makes whose contact it is explicit. */}
              {(() => {
                const beneficiaryContact = !!booking.for_someone_else && !!booking.beneficiary_phone;
                const contactPhone = beneficiaryContact ? booking.beneficiary_phone! : booking.client_phone;
                if (!contactPhone) return null;
                const contactName = beneficiaryContact
                  ? (booking.beneficiary_name || "la persona de la cita")
                  : (booking.client_name || "");
                return (
                  <Button size="sm" variant="whatsapp" asChild className="w-full sm:w-auto">
                    <a
                      href={getWhatsAppLink(contactPhone, `Hola ${contactName}, te contacto por la solicitud en ContrataCR.`)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <WhatsAppIcon className="h-3.5 w-3.5" />
                      {beneficiaryContact ? `WhatsApp a ${(booking.beneficiary_name || "la persona").split(" ")[0]}` : "WhatsApp"}
                    </a>
                  </Button>
                );
              })()}
            </div>
            <button
              onClick={() => reportClient(booking)}
              className="inline-flex items-center gap-1.5 text-xs text-[#9ca3af] hover:text-red-500 transition-colors self-start mt-1"
            >
              <Flag className="h-3.5 w-3.5" /> Reportar cliente
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <StatusFilterTabs tabs={SOLICITUD_TABS} value={filter} onChange={setFilter} />
      {filtered.length === 0 ? (
        <p className="text-sm text-[#9ca3af] text-center py-8">No hay solicitudes en esta vista.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((b) => <BookingCard key={b.id} booking={b} />)}
        </div>
      )}
    </div>
  );
}
