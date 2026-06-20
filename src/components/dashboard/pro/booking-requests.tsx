"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, FileText, Phone, Flag, MapPin, IdCard } from "lucide-react";
import { getCategoryLabel } from "@/lib/data/categories";
import { ageCategoryFromDob } from "@/lib/age";
import { formatDobDMY } from "@/components/ui/date-of-birth-picker";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getWhatsAppLink, getInitials } from "@/lib/utils";
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

const STATUS_VARIANT: Record<BookingStatus, "warning" | "success" | "error" | "default" | "muted"> = {
  pending: "warning",
  confirmed: "success",
  in_progress: "success",
  awaiting_confirmation: "warning",
  cancelled: "error",
  rescheduled: "warning",
  // Finalizada = settled/terminal → neutral badge, no prominent brand-blue box.
  completed: "muted",
};

export function BookingRequests() {
  const locale = useLocale();
  const t = useTranslations("bookingRequests");
  const dateLocale = locale === "en" ? "en-US" : "es-CR";

  // Age bracket badge for a HEALTH patient (self or beneficiary), derived from the
  // stored DOB. Shown ONLY here in the pro's panel — a minor (guardian/consent) or an
  // older adult (geriatric care) is useful clinical context; a typical adult (18–64)
  // shows nothing. `minorFallback` covers legacy bookings stored before a DOB was kept.
  // BOTH brackets use the SAME amber "note" pill (consistent design) — only the label
  // differs; it reads clearly on both the white card and the brand-tint beneficiary box.
  function ageBadge(dob?: string | null, minorFallback = false) {
    const cat = dob ? ageCategoryFromDob(dob) : minorFallback ? "minor" : null;
    if (!cat) return null;
    return (
      <span className="inline-flex items-center rounded-full bg-[#fef3c7] px-2 py-0.5 text-[10px] font-semibold text-[#92400e]">
        {t(cat)}
      </span>
    );
  }
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
    const reason = window.prompt(t("reportPrompt"));
    if (!reason || !reason.trim()) return;
    const res = await fetch("/api/report-client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: booking.id, clientId: booking.client_id ?? null, reason: reason.trim() }),
    });
    if (res.ok) alert(t("reportThanks"));
    else alert(t("reportError"));
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
        <h3 className="font-semibold text-[#374151] mb-1">{t("empty")}</h3>
        <p className="text-sm text-[#9ca3af]">{t("emptySub")}</p>
      </div>
    );
  }

  const filtered = bookings.filter((b) => solicitudMatches(filter, b.status));

  function BookingCard({ booking }: { booking: Booking }) {
    const dateStr = booking.scheduled_date
      ? (() => {
          const [y, m, d] = booking.scheduled_date.split("-").map(Number);
          const label = new Date(y, m - 1, d).toLocaleDateString(dateLocale, {
            weekday: "short", day: "numeric", month: "short",
          });
          return booking.scheduled_time ? `${label} · ${booking.scheduled_time}` : label;
        })()
      : booking.preferred_date_text;

    return (
      <Card>
        <CardContent className="p-4 sm:p-5">
          {/* Header — status + the REQUEST (created) date, labeled so it's never confused
              with the appointment date shown below. */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <Badge variant={STATUS_VARIANT[booking.status]}>
              {t(`status.${booking.status}`)}
            </Badge>
            <span className="text-xs text-[#9ca3af] shrink-0">
              {t("requestedOn", { date: new Date(booking.created_at).toLocaleDateString(dateLocale) })}
            </span>
          </div>

          {/* Details — client, contact, what & when */}
          <div className="space-y-2">
                {/* When the request is for ANOTHER person, label the requester clearly as
                    "Reservado por" (the patient is the labeled beneficiary box below). For a
                    self booking there's just one person, so no label. */}
                {booking.for_someone_else && booking.client_name && (
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#9ca3af]">{t("bookedByLabel")}</p>
                )}
                {(booking.client_name) && (
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <Avatar className="h-6 w-6 shrink-0">
                      <AvatarImage src={booking.profiles?.avatar_url} className="object-cover" />
                      <AvatarFallback className="text-[10px] bg-[#EBF5FB] text-[#009FD9] font-semibold">{getInitials(booking.client_name)}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-[#111827]">{booking.client_name}</span>
                    {booking.profiles?.is_flagged && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#b45309] bg-[#fef3c7] px-1.5 py-0.5 rounded-md">
                        ⚠ {t("flagged")}
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
                {/* Cédula — shown ONLY if the client provided one (no verified/unverified
                    labels; the pro just sees the number, or a muted "Sin cédula"). */}
                <div className="flex items-center gap-2 text-sm">
                  <IdCard className="h-4 w-4 text-[#6b7280] shrink-0" />
                  {booking.client_cedula
                    ? <span className="text-[#374151]">{t("clientCedula", { cedula: booking.client_cedula })}</span>
                    : <span className="text-[#9ca3af]">{t("noCedula")}</span>}
                </div>
                {/* Client DOB — only stored/shown for HEALTH-category solicitudes, with the
                    age-bracket badge (minor / adulto mayor) when relevant. */}
                {booking.client_dob && (
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <CalendarDays className="h-4 w-4 text-[#6b7280] shrink-0" />
                    <span className="text-[#374151]">{t("birth", { date: formatDobDMY(booking.client_dob) })}</span>
                    {ageBadge(booking.client_dob)}
                  </div>
                )}

                {/* Beneficiary (booking for someone else) — clearly labeled "La cita es para"
                    so the pro instantly sees the requester (above) vs the patient (here). */}
                {booking.for_someone_else && (
                  <div className="rounded-lg bg-[#EBF5FB] border border-[#bfdbfe] p-2.5 text-xs">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-[#0089bb]">{t("apptForLabel")}</p>
                    <p className="mt-0.5 font-semibold text-[#111827] flex items-center gap-1.5 flex-wrap">
                      {booking.beneficiary_name || t("otherPerson")}
                      {/* Age bracket from the beneficiary DOB (minor OR adulto mayor); falls
                          back to the legacy beneficiary_is_minor flag when no DOB is stored. */}
                      {ageBadge(booking.beneficiary_dob, booking.beneficiary_is_minor)}
                    </p>
                    {/* DOB · cédula (or "Sin cédula") · contact — no verified/unverified labels. */}
                    <p className="text-[#374151] mt-0.5">
                      {[
                        booking.beneficiary_dob ? t("benDob", { date: formatDobDMY(booking.beneficiary_dob) }) : null,
                        booking.beneficiary_cedula ? t("benCedula", { cedula: booking.beneficiary_cedula }) : t("noCedula"),
                        booking.beneficiary_phone ? t("benContact", { phone: booking.beneficiary_phone }) : null,
                      ].filter(Boolean).join(" · ")}
                    </p>
                    {booking.beneficiary_phone && (
                      <p className="text-[10px] text-[#6b7280] mt-1">{t("coordinateContact")}</p>
                    )}
                  </div>
                )}
                {/* ── THE APPOINTMENT — separated by a divider from the people above so the
                       pro reads "who" then "what & when" at a glance. The appointment date is
                       the lead line (brand calendar + bold), clearly distinct from the REQUEST
                       date in the header. ── */}
                <div className="mt-1 space-y-2 border-t border-[#f3f4f6] pt-2.5">
                  {dateStr ? (
                    <div className="flex items-center gap-2 text-sm">
                      <CalendarDays className="h-4 w-4 text-[#009FD9] shrink-0" />
                      <span><span className="text-[#6b7280]">{t("appointmentLabel")}:</span> <strong className="font-semibold text-[#111827]">{dateStr}</strong></span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm">
                      <CalendarDays className="h-4 w-4 text-[#6b7280] shrink-0" />
                      <span className="text-[#9ca3af]">{t("noScheduledDate")}</span>
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
                  {booking.service_description && (
                    <div className="flex items-start gap-2 text-sm">
                      <FileText className="h-4 w-4 text-[#6b7280] shrink-0 mt-0.5" />
                      <span className="text-[#374151]">{booking.service_description}</span>
                    </div>
                  )}
                </div>
          </div>

          {/* Actions — full-width stacked on mobile, inline (wrap) on desktop.
              Same footer shape across every status so cards stay uniform. */}
          <div className="mt-4 pt-4 border-t border-[#f3f4f6] flex flex-col gap-2">
            {booking.status === "awaiting_confirmation" && (
              <p className="text-xs text-[#b45309] bg-[#fffbeb] border border-[#fde68a] rounded-lg px-2.5 py-2">
                {t("awaitingConfirmNote")}
              </p>
            )}
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
              {booking.status === "pending" && (
                <>
                  <Button size="sm" className="w-full sm:w-auto" onClick={() => updateStatus(booking.id, "confirmed")}>
                    {t("confirm")}
                  </Button>
                  <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => updateStatus(booking.id, "cancelled")}>
                    {t("cancel")}
                  </Button>
                </>
              )}
              {booking.status === "confirmed" && (
                <>
                  <Button size="sm" className="w-full sm:w-auto" onClick={() => updateStatus(booking.id, "awaiting_confirmation")}>
                    {t("markCompleted")}
                  </Button>
                  <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => updateStatus(booking.id, "cancelled")}>
                    {t("cancel")}
                  </Button>
                </>
              )}
              {booking.status === "in_progress" && (
                <>
                  <Button size="sm" className="w-full sm:w-auto" onClick={() => updateStatus(booking.id, "awaiting_confirmation")}>
                    {t("markCompleted")}
                  </Button>
                  <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => updateStatus(booking.id, "cancelled")}>
                    {t("cancel")}
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
                  ? (booking.beneficiary_name || t("appointmentPerson"))
                  : (booking.client_name || "");
                return (
                  <Button size="sm" variant="whatsapp" asChild className="w-full sm:w-auto">
                    <a
                      href={getWhatsAppLink(contactPhone, t("waMessage", { name: contactName }))}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <WhatsAppIcon className="h-3.5 w-3.5" />
                      {beneficiaryContact ? t("whatsappTo", { name: (booking.beneficiary_name || t("thePerson")).split(" ")[0] }) : t("whatsapp")}
                    </a>
                  </Button>
                );
              })()}
            </div>
            <button
              onClick={() => reportClient(booking)}
              className="inline-flex items-center gap-1.5 text-xs text-[#9ca3af] hover:text-red-500 transition-colors self-start mt-1"
            >
              <Flag className="h-3.5 w-3.5" /> {t("reportClient")}
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
        <p className="text-sm text-[#9ca3af] text-center py-8">{t("noneInView")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((b) => <BookingCard key={b.id} booking={b} />)}
        </div>
      )}
    </div>
  );
}
