"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, CalendarClock, FileText, Flag, MapPin, Phone, IdCard, Check } from "lucide-react";
import { getCategoryLabel } from "@/lib/data/categories";
import { ageCategoryFromDob } from "@/lib/age";
import { formatDobDMY } from "@/components/ui/date-of-birth-picker";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getWhatsAppLink, getInitials } from "@/lib/utils";
import { StatusFilterTabs, SOLICITUD_TABS, solicitudBucket, solicitudStatusRedundant, bucketCounts } from "@/components/dashboard/status-filter-tabs";
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

// Status pill colour: Pendiente=amber, Confirmada/En progreso=blue tint,
// Finalizada/Esperando=green, Cancelada=red, Reprogramada=grey.
const STATUS_VARIANT: Record<BookingStatus, "warning" | "success" | "error" | "default" | "muted"> = {
  pending: "warning",
  confirmed: "default",
  in_progress: "default",
  awaiting_confirmation: "success",
  cancelled: "error",
  rescheduled: "muted",
  completed: "success",
};

// "13:00" → "1:00 pm" (12-hour, matches the prototype).
function to12h(time?: string): string | null {
  if (!time) return null;
  const [hRaw, mRaw] = time.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw ?? 0);
  if (Number.isNaN(h)) return null;
  const ap = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(Number.isNaN(m) ? 0 : m).padStart(2, "0")} ${ap}`;
}

export function BookingRequests() {
  const locale = useLocale();
  const t = useTranslations("bookingRequests");
  const dateLocale = locale === "en" ? "en-US" : "es-CR";

  // Age bracket badge for a HEALTH patient (self or beneficiary), derived from the
  // stored DOB. Shown ONLY here in the pro's panel — a minor (guardian/consent) or an
  // older adult (geriatric care) is useful clinical context; a typical adult (18–64)
  // shows nothing. `minorFallback` covers legacy bookings stored before a DOB was kept.
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
  const [filter, setFilter] = useState("pendientes");

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

  // Every tab shows its count.
  const counts = bucketCounts(bookings.map((b) => solicitudBucket(b.status, b.scheduled_date)));
  const filtered = bookings.filter((b) => solicitudBucket(b.status, b.scheduled_date) === filter);

  function BookingCard({ booking }: { booking: Booking }) {
    // Appointment date — "Mar, 23 jun · 1:00 pm" (capitalised weekday, 12-hour time),
    // distinct from the REQUEST date in the status header.
    const dateStr = (() => {
      if (!booking.scheduled_date) return booking.preferred_date_text || null;
      const [y, m, d] = booking.scheduled_date.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      const wdRaw = dt.toLocaleDateString(dateLocale, { weekday: "short" }).replace(".", "");
      const wd = wdRaw.charAt(0).toUpperCase() + wdRaw.slice(1);
      const dm = dt.toLocaleDateString(dateLocale, { day: "numeric", month: "short" }).replace(".", "");
      const time = to12h(booking.scheduled_time);
      return `${wd}, ${dm}${time ? ` · ${time}` : ""}`;
    })();

    const category = booking.category_id ? getCategoryLabel(booking.category_id, locale) : null;
    const location = booking.slot_location_label || null;
    const hasMeta = !!(category || location || booking.service_description);

    // First names for friendly WhatsApp greetings.
    const cliFirst = (booking.client_name || t("thePerson")).split(" ")[0];
    const benFirst = (booking.beneficiary_name || t("thePerson")).split(" ")[0];
    // Contact: the REQUESTER (account holder) is the primary, reachable contact;
    // the beneficiary is offered only when they gave a distinct phone.
    const waButton = (phone: string, first: string) => (
      <Button variant="whatsapp" asChild className="mt-3 rounded-full">
        <a href={getWhatsAppLink(phone, t("waMessage", { name: first }))} target="_blank" rel="noopener noreferrer">
          <WhatsAppIcon className="h-4 w-4" /> {t("whatsappTo", { name: first })}
        </a>
      </Button>
    );

    const flaggedPill = booking.profiles?.is_flagged ? (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#b45309] bg-[#fef3c7] px-1.5 py-0.5 rounded-md">
        ⚠ {t("flagged")}
      </span>
    ) : null;

    return (
      <Card className="rounded-[18px] overflow-hidden">
        {/* 1 — status header: the REQUEST (created) date, plus the status pill ONLY when
               it adds info beyond the active tab (a sub-state like "En progreso"). When the
               status just repeats the tab it's hidden — the tab already says it. */}
        {(() => {
          const showStatus = !solicitudStatusRedundant(booking.status, booking.scheduled_date);
          return (
            <div className={`flex items-center gap-2.5 px-[18px] py-3.5 border-b border-[#f3f4f6] ${showStatus ? "justify-between" : "justify-end"}`}>
              {showStatus && (
                <Badge variant={STATUS_VARIANT[booking.status]} className="px-3 py-1 text-xs font-bold">
                  {t(`status.${booking.status}`)}
                </Badge>
              )}
              <span className="text-xs text-[#9ca3af] shrink-0">
                {t("requestedOn", { date: new Date(booking.created_at).toLocaleDateString(dateLocale) })}
              </span>
            </div>
          );
        })()}

        <div className="px-[18px] py-4 flex flex-col gap-4">
          {/* 2-3 — the appointment: featured date, then service · location + note. */}
          <div className="flex flex-col gap-3">
            {/* 2 — appointment date FEATURED (the most important fact). Clean, no
                   container — a brand-blue calendar-clock icon + eyebrow + bold date. */}
            <div className="flex items-center gap-3">
              <CalendarClock className="h-[22px] w-[22px] text-[#9ca3af] shrink-0" strokeWidth={2} />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#9ca3af]">{t("appointmentDateLabel")}</p>
                <p className={dateStr ? "text-[16px] font-bold text-[#111827] leading-tight" : "text-sm text-[#9ca3af]"}>
                  {dateStr || t("noScheduledDate")}
                </p>
              </div>
            </div>

            {hasMeta && <div className="h-px bg-[#f3f4f6]" />}

            {/* 3 — service · location (pin) */}
            {(category || location) && (
              <div className="flex items-center gap-2.5 text-[13.5px]">
                <MapPin className="h-4 w-4 text-[#9ca3af] shrink-0" />
                <span className="min-w-0">
                  {category && <span className="text-[#374151]">{category}</span>}
                  {category && location && <span className="text-[#9ca3af]"> · </span>}
                  {location && <span className="text-[#9ca3af]">{location}</span>}
                </span>
              </div>
            )}

            {/* 3 — client note (document) */}
            {booking.service_description && (
              <div className="flex items-start gap-2.5 text-[13.5px]">
                <FileText className="h-4 w-4 text-[#9ca3af] shrink-0 mt-0.5" />
                <span className="text-[#374151] min-w-0">{booking.service_description}</span>
              </div>
            )}
          </div>

          {/* 4 — LA CITA ES PARA (only when the appointment is for someone else): the
                 patient / service recipient, in a tinted block. */}
          {booking.for_someone_else && (
            <div className="rounded-[14px] bg-[#EBF5FB] border border-[#bfdbfe] px-4 py-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-[#0089bb]">{t("apptForLabel")}</p>
              <p className="text-[17px] font-bold text-[#111827] mt-1 mb-1.5 flex items-center gap-2 flex-wrap">
                {booking.beneficiary_name || t("otherPerson")}
                {ageBadge(booking.beneficiary_dob, booking.beneficiary_is_minor)}
              </p>
              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px] text-[#374151]">
                {booking.beneficiary_dob && (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-[13px] w-[13px] text-[#9ca3af] shrink-0" />
                    {formatDobDMY(booking.beneficiary_dob)}
                  </span>
                )}
                {booking.beneficiary_dob && <span className="text-[#9ca3af]">·</span>}
                <span className="inline-flex items-center gap-1.5">
                  <IdCard className="h-[13px] w-[13px] text-[#9ca3af] shrink-0" />
                  {booking.beneficiary_cedula ? t("benCedula", { cedula: booking.beneficiary_cedula }) : t("noCedula")}
                </span>
              </div>
              {/* Secondary contact: only when the patient has their OWN distinct phone. */}
              {booking.beneficiary_phone && booking.beneficiary_phone !== booking.client_phone && waButton(booking.beneficiary_phone, benFirst)}
            </div>
          )}

          {/* 5 — the person who made the request. For a third-party booking this is the
                 "Reservado por" contact (whom the pro coordinates with). For a self
                 booking this same person is the patient, so the eyebrow is omitted. */}
          {booking.client_name && (
            <div>
              {booking.for_someone_else && (
                <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-[#9ca3af] mb-2.5">{t("bookedByLabel")}</p>
              )}
              <div className="flex items-center gap-3">
                <Avatar className="h-11 w-11 shrink-0">
                  <AvatarImage src={booking.profiles?.avatar_url} className="object-cover" />
                  <AvatarFallback
                    className={
                      booking.for_someone_else
                        ? "text-sm font-bold bg-[#f3f4f6] text-[#6b7280]"
                        : "text-sm font-bold bg-[#EBF5FB] text-[#009FD9]"
                    }
                  >
                    {getInitials(booking.client_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-bold text-[#111827] flex items-center gap-2 flex-wrap">
                    {booking.client_name}
                    {!booking.for_someone_else && ageBadge(booking.client_dob)}
                    {flaggedPill}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px] text-[#6b7280]">
                    {booking.client_phone && (
                      <span className="inline-flex items-center gap-1.5">
                        <Phone className="h-[13px] w-[13px] text-[#9ca3af] shrink-0" />
                        {booking.client_phone}
                      </span>
                    )}
                    {booking.client_phone && <span className="text-[#9ca3af]">·</span>}
                    <span className="inline-flex items-center gap-1.5">
                      <IdCard className="h-[13px] w-[13px] text-[#9ca3af] shrink-0" />
                      {booking.client_cedula ? t("clientCedula", { cedula: booking.client_cedula }) : t("noCedula")}
                    </span>
                    {/* Self booking → this person is the patient, so show their DOB here. */}
                    {!booking.for_someone_else && booking.client_dob && (
                      <>
                        <span className="text-[#9ca3af]">·</span>
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="h-[13px] w-[13px] text-[#9ca3af] shrink-0" />
                          {formatDobDMY(booking.client_dob)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 6 — actions */}
        <div className="px-[18px] py-3.5 border-t border-[#f3f4f6] flex flex-col gap-3">
          {booking.status === "awaiting_confirmation" && (
            <p className="text-xs text-[#b45309] bg-[#fffbeb] border border-[#fde68a] rounded-lg px-2.5 py-2">
              {t("awaitingConfirmNote")}
            </p>
          )}
          <div className="flex flex-wrap gap-2.5">
            {booking.status === "pending" && (
              <>
                <Button className="rounded-full px-6" onClick={() => updateStatus(booking.id, "confirmed")}>
                  <Check className="h-4 w-4" /> {t("confirm")}
                </Button>
                <Button variant="outline" className="rounded-full px-6" onClick={() => updateStatus(booking.id, "cancelled")}>
                  {t("cancel")}
                </Button>
              </>
            )}
            {(booking.status === "confirmed" || booking.status === "in_progress") && (
              <>
                <Button className="rounded-full px-6" onClick={() => updateStatus(booking.id, "awaiting_confirmation")}>
                  <Check className="h-4 w-4" /> {t("markCompleted")}
                </Button>
                <Button variant="outline" className="rounded-full px-6" onClick={() => updateStatus(booking.id, "cancelled")}>
                  {t("cancel")}
                </Button>
              </>
            )}
            {/* Contact the requester (who booked) — to the RIGHT of Cancelar. */}
            {booking.client_phone && (
              <Button variant="whatsapp" asChild className="rounded-full px-5">
                <a href={getWhatsAppLink(booking.client_phone, t("waMessage", { name: cliFirst }))} target="_blank" rel="noopener noreferrer">
                  <WhatsAppIcon className="h-4 w-4" /> {t("whatsappTo", { name: cliFirst })}
                </a>
              </Button>
            )}
          </div>
          <button
            onClick={() => reportClient(booking)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#9ca3af] hover:text-red-500 transition-colors self-start"
          >
            <Flag className="h-3.5 w-3.5" /> {t("reportClient")}
          </button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <StatusFilterTabs tabs={SOLICITUD_TABS} value={filter} onChange={setFilter} counts={counts} />
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
