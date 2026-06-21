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
import { getWhatsAppLink, getInitials, cn } from "@/lib/utils";
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
  const [filter, setFilter] = useState("confirmadas");

  // Inline "manage exception" panels (the pro's tools instead of an accept gate):
  // cancel-with-reason and reschedule. One open at a time, keyed by booking id.
  const [actionFor, setActionFor] = useState<{ id: string; mode: "cancel" | "reschedule" } | null>(null);
  const [reason, setReason] = useState("");
  const [reDate, setReDate] = useState("");
  const [reTime, setReTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");

  function openAction(id: string, mode: "cancel" | "reschedule") {
    setActionFor({ id, mode });
    setReason(""); setReDate(""); setReTime(""); setActionError("");
  }
  function closeAction() { setActionFor(null); }

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

  // Cancel WITH a reason — the client is notified with the motivo. This is the pro's
  // clean way to decline ANY booking (incl. an unverified client). Frees the slot.
  async function submitCancel(id: string) {
    setSubmitting(true);
    const motivo = reason.trim();
    await fetch("/api/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "cancelled", cancelReason: motivo || undefined }),
    });
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: "cancelled" as BookingStatus } : b)));
    setSubmitting(false); closeAction();
  }

  // Reschedule — the pro proposes a new slot; the client is notified to coordinate.
  async function submitReschedule(id: string) {
    if (!reDate || !reTime) { setActionError(t("reschedNeed")); return; }
    setSubmitting(true); setActionError("");
    const res = await fetch("/api/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "confirmed", scheduledDate: reDate, scheduledTime: reTime }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setActionError(j.error || t("reschedError"));
      setSubmitting(false);
      return;
    }
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, scheduled_date: reDate, scheduled_time: reTime } : b)));
    setSubmitting(false); closeAction();
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

    // First name for the friendly WhatsApp greeting (the requester is the only contact).
    const cliFirst = (booking.client_name || t("thePerson")).split(" ")[0];
    // Contact: the REQUESTER (account holder) is the sole, reachable contact. A
    // beneficiary (a health dependent) has no phone here — name + age only.
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

    // The client has NO cédula on file → identity unverified. Shown clearly so the
    // pro can decide (contact / cancel-with-reason). Auto-confirm is NOT blocked.
    const unverifiedPill = !booking.client_cedula ? (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#6b7280] bg-[#f3f4f6] px-1.5 py-0.5 rounded-md">
        {t("unverified")}
      </span>
    ) : null;

    // An ACTIVE booking (still upcoming/ongoing) gets the manage tools.
    const isActive = (["pending", "confirmed", "in_progress"] as string[]).includes(booking.status);

    return (
      <Card className="rounded-[18px] overflow-hidden">
        {/* 1 — status header: the REQUEST (created) date, plus the status pill ONLY when
               it adds info beyond the active tab (a sub-state like "En progreso"). When the
               status just repeats the tab it's hidden — the tab already says it.
               No bottom border: whitespace alone sets it apart from the appointment below. */}
        {(() => {
          const showStatus = !solicitudStatusRedundant(booking.status, booking.scheduled_date);
          return (
            <div className={`flex items-center gap-2.5 px-[18px] pt-4 pb-1 ${showStatus ? "justify-between" : "justify-end"}`}>
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

        {/* 2-3 — THE APPOINTMENT (shared "what & when", full width): featured date +
               service · location + the client's note. Rows are separated by spacing, not
               hairlines — the bold date vs. lighter meta already reads as a hierarchy. */}
        <div className="px-[18px] pt-2 pb-4 flex flex-col gap-2.5">
          <div className="flex items-center gap-3">
            <CalendarClock className="h-[22px] w-[22px] text-[#9ca3af] shrink-0" strokeWidth={2} />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#9ca3af]">{t("appointmentDateLabel")}</p>
              <p className={dateStr ? "text-[16px] font-bold text-[#111827] leading-tight" : "text-sm text-[#9ca3af]"}>
                {dateStr || t("noScheduledDate")}
              </p>
            </div>
          </div>

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

          {booking.service_description && (
            <div className="flex items-start gap-2.5 text-[13.5px]">
              <FileText className="h-4 w-4 text-[#9ca3af] shrink-0 mt-0.5" />
              <span className="text-[#374151] min-w-0">{booking.service_description}</span>
            </div>
          )}
        </div>

        {/* 4-5 — THE PEOPLE. Third-party → a LEFT/RIGHT split ("La cita es para" | "Reservado
               por") with an aesthetic divider (vertical on desktop, horizontal when it stacks
               on mobile) so each side clearly holds ONE person. Self → one person, no split. */}
        {booking.for_someone_else ? (
          <div className="flex flex-col sm:flex-row">
            {/* LEFT — the patient (service recipient). We collect ONLY name + age now, so
                this side shows just that: who it's for, the age badge, and the birth date.
                No cédula / phone / WhatsApp — the requester (right) is the contact. */}
            <div className="flex-1 min-w-0 px-[18px] py-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-[#0089bb] mb-2.5">{t("apptForLabel")}</p>
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 rounded-full bg-[#EBF5FB] text-[#009FD9] text-sm font-bold flex items-center justify-center shrink-0">
                  {getInitials(booking.beneficiary_name || "?")}
                </span>
                <p className="text-[15px] font-bold text-[#111827] min-w-0 flex items-center gap-2 flex-wrap">
                  {booking.beneficiary_name || t("otherPerson")}
                  {ageBadge(booking.beneficiary_dob, booking.beneficiary_is_minor)}
                </p>
              </div>
              {booking.beneficiary_dob && (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[#6b7280]">
                  <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-[13px] w-[13px] text-[#9ca3af] shrink-0" />{formatDobDMY(booking.beneficiary_dob)}</span>
                </div>
              )}
            </div>

            {/* Aesthetic divider — vertical on desktop, horizontal when stacked on mobile. */}
            <div className="border-t border-[#f3f4f6] sm:border-t-0 sm:border-l shrink-0" />

            {/* RIGHT — who booked (the coordination contact) */}
            <div className="flex-1 min-w-0 px-[18px] py-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-[#9ca3af] mb-2.5">{t("bookedByLabel")}</p>
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarImage src={booking.profiles?.avatar_url} className="object-cover" />
                  <AvatarFallback className="text-sm font-bold bg-[#f3f4f6] text-[#6b7280]">{getInitials(booking.client_name || "?")}</AvatarFallback>
                </Avatar>
                <p className="text-[15px] font-bold text-[#111827] min-w-0 flex items-center gap-2 flex-wrap">
                  {booking.client_name}
                  {unverifiedPill}
                  {flaggedPill}
                </p>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[#6b7280]">
                {booking.client_phone && (
                  <span className="inline-flex items-center gap-1.5"><Phone className="h-[13px] w-[13px] text-[#9ca3af] shrink-0" />{booking.client_phone}</span>
                )}
                {booking.client_phone && <span className="text-[#9ca3af]">·</span>}
                <span className="inline-flex items-center gap-1.5"><IdCard className="h-[13px] w-[13px] text-[#9ca3af] shrink-0" />{booking.client_cedula ? t("clientCedula", { cedula: booking.client_cedula }) : t("noCedula")}</span>
              </div>
              {/* WhatsApp the requester — ALWAYS (their phone is required). */}
              {booking.client_phone && waButton(booking.client_phone, cliFirst)}
            </div>
          </div>
        ) : (
          /* SELF — one person (requester = patient): no split. */
          booking.client_name && (
            <div className="px-[18px] py-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-11 w-11 shrink-0">
                  <AvatarImage src={booking.profiles?.avatar_url} className="object-cover" />
                  <AvatarFallback className="text-sm font-bold bg-[#EBF5FB] text-[#009FD9]">{getInitials(booking.client_name)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-bold text-[#111827] flex items-center gap-2 flex-wrap">
                    {booking.client_name}
                    {ageBadge(booking.client_dob)}
                    {unverifiedPill}
                    {flaggedPill}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[#6b7280]">
                    {booking.client_phone && (
                      <span className="inline-flex items-center gap-1.5"><Phone className="h-[13px] w-[13px] text-[#9ca3af] shrink-0" />{booking.client_phone}</span>
                    )}
                    {booking.client_phone && <span className="text-[#9ca3af]">·</span>}
                    <span className="inline-flex items-center gap-1.5"><IdCard className="h-[13px] w-[13px] text-[#9ca3af] shrink-0" />{booking.client_cedula ? t("clientCedula", { cedula: booking.client_cedula }) : t("noCedula")}</span>
                    {booking.client_dob && <span className="text-[#9ca3af]">·</span>}
                    {booking.client_dob && (
                      <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-[13px] w-[13px] text-[#9ca3af] shrink-0" />{formatDobDMY(booking.client_dob)}</span>
                    )}
                  </div>
                </div>
              </div>
              {booking.client_phone && waButton(booking.client_phone, cliFirst)}
            </div>
          )
        )}

        {/* 6 — actions. Auto-confirm means there's no "accept" — the pro MANAGES the
               booking: mark it done, reschedule, or cancel-with-reason (decline). */}
        <div className="px-[18px] py-3.5 border-t border-[#f3f4f6] flex flex-col gap-3">
          {booking.status === "awaiting_confirmation" && (
            <p className="text-xs text-[#b45309] bg-[#fffbeb] border border-[#fde68a] rounded-lg px-2.5 py-2">
              {t("awaitingConfirmNote")}
            </p>
          )}

          {isActive && actionFor?.id !== booking.id && (
            <div className="flex flex-wrap gap-2.5">
              <Button className="rounded-full px-5" onClick={() => updateStatus(booking.id, "awaiting_confirmation")}>
                <Check className="h-4 w-4" /> {t("markCompleted")}
              </Button>
              <Button variant="outline" className="rounded-full px-5" onClick={() => openAction(booking.id, "reschedule")}>
                <CalendarClock className="h-4 w-4" /> {t("reschedule")}
              </Button>
              <Button variant="outline" className="rounded-full px-5 text-red-600 border-red-200 hover:bg-red-50" onClick={() => openAction(booking.id, "cancel")}>
                {t("cancel")}
              </Button>
            </div>
          )}

          {/* Cancel-with-reason panel — preset chips fill the note; the client is
              notified with the motivo; the slot is freed. */}
          {actionFor?.id === booking.id && actionFor.mode === "cancel" && (
            <div className="rounded-xl border border-[#e5e7eb] bg-[#fafafa] p-3 flex flex-col gap-2.5">
              <p className="text-sm font-semibold text-[#111827]">{t("cancelTitle")}</p>
              <div className="flex flex-wrap gap-2">
                {[t("cancelR1"), t("cancelR2"), t("cancelR3")].map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setReason(label)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      reason === label ? "border-[#009FD9] bg-[#EBF5FB] text-[#0089bb]" : "border-[#e5e7eb] bg-white text-[#374151] hover:bg-[#f3f4f6]"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("cancelReasonPlaceholder")}
                rows={2}
                className="w-full rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent resize-none"
              />
              <p className="text-xs text-[#9ca3af]">{t("cancelHint")}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="rounded-full" onClick={closeAction} disabled={submitting}>{t("back")}</Button>
                <Button size="sm" className="rounded-full bg-red-600 hover:bg-red-700" onClick={() => submitCancel(booking.id)} disabled={submitting}>
                  {t("cancelConfirm")}
                </Button>
              </div>
            </div>
          )}

          {/* Reschedule panel — propose a new slot; the client is notified to coordinate. */}
          {actionFor?.id === booking.id && actionFor.mode === "reschedule" && (
            <div className="rounded-xl border border-[#e5e7eb] bg-[#fafafa] p-3 flex flex-col gap-2.5">
              <p className="text-sm font-semibold text-[#111827]">{t("reschedTitle")}</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-[#374151] mb-1 block">{t("reschedDateLabel")}</label>
                  <input
                    type="date"
                    value={reDate}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setReDate(e.target.value)}
                    className="w-full h-9 rounded-xl border border-[#e5e7eb] bg-white px-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#374151] mb-1 block">{t("reschedTimeLabel")}</label>
                  <input
                    type="time"
                    value={reTime}
                    onChange={(e) => setReTime(e.target.value)}
                    className="w-full h-9 rounded-xl border border-[#e5e7eb] bg-white px-3 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent"
                  />
                </div>
              </div>
              {actionError && <p className="text-xs text-red-600">{actionError}</p>}
              <p className="text-xs text-[#9ca3af]">{t("reschedHint")}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="rounded-full" onClick={closeAction} disabled={submitting}>{t("back")}</Button>
                <Button size="sm" className="rounded-full" onClick={() => submitReschedule(booking.id)} disabled={submitting}>
                  {t("reschedConfirm")}
                </Button>
              </div>
            </div>
          )}

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
