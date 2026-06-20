"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, FileText, Flag, MapPin } from "lucide-react";
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

    // First names for friendly WhatsApp greetings.
    const cliFirst = (booking.client_name || t("thePerson")).split(" ")[0];
    const benFirst = (booking.beneficiary_name || t("thePerson")).split(" ")[0];
    // Contact: the REQUESTER (account holder) is the primary, always-available
    // contact; the beneficiary is offered only when a distinct phone was given.
    const waButton = (phone: string, first: string) => (
      <Button size="sm" variant="whatsapp" asChild className="mt-2.5 w-full sm:w-auto">
        <a href={getWhatsAppLink(phone, t("waMessage", { name: first }))} target="_blank" rel="noopener noreferrer">
          <WhatsAppIcon className="h-3.5 w-3.5" /> {t("whatsappTo", { name: first })}
        </a>
      </Button>
    );

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

          {/* ── PRIMARY: the appointment — WHEN (date, prominent) → WHAT (service,
                 description) → WHO it's for. Grouped so the pro reads the booking at a
                 glance; the request date stays in the header above. ── */}
          <div className="space-y-2.5">
            {/* When — appointment date/time leads (brand, bold), distinct from the
                request date in the header. */}
            {dateStr ? (
              <div className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-[#009FD9] shrink-0" />
                <span className="text-[15px] font-semibold text-[#111827]">{dateStr}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-[#d1d5db] shrink-0" />
                <span className="text-sm text-[#9ca3af]">{t("noScheduledDate")}</span>
              </div>
            )}

            {/* What — profession · location the slot belonged to (migration 038). */}
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

            {/* Reason / description */}
            {booking.service_description && (
              <div className="flex items-start gap-2 text-sm">
                <FileText className="h-4 w-4 text-[#6b7280] shrink-0 mt-0.5" />
                <span className="text-[#374151]">{booking.service_description}</span>
              </div>
            )}

            {/* Who the appointment is FOR */}
            {booking.for_someone_else ? (
              /* Third-party → the patient, in a labeled tint box. The requester who
                 booked is shown after the divider below. */
              <div className="rounded-lg bg-[#EBF5FB] border border-[#bfdbfe] p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#0089bb]">{t("apptForLabel")}</p>
                <p className="mt-1 font-semibold text-[#111827] flex items-center gap-1.5 flex-wrap">
                  {booking.beneficiary_name || t("otherPerson")}
                  {/* Age bracket from the beneficiary DOB (minor OR adulto mayor); falls
                      back to the legacy beneficiary_is_minor flag when no DOB is stored. */}
                  {ageBadge(booking.beneficiary_dob, booking.beneficiary_is_minor)}
                </p>
                <p className="text-xs text-[#374151] mt-0.5">
                  {[
                    booking.beneficiary_dob ? t("benDob", { date: formatDobDMY(booking.beneficiary_dob) }) : null,
                    booking.beneficiary_cedula ? t("benCedula", { cedula: booking.beneficiary_cedula }) : t("noCedula"),
                  ].filter(Boolean).join(" · ")}
                </p>
                {/* Secondary contact: only when the patient has their OWN distinct phone. */}
                {booking.beneficiary_phone && booking.beneficiary_phone !== booking.client_phone && waButton(booking.beneficiary_phone, benFirst)}
              </div>
            ) : (
              /* Self → one person (requester = patient): the appointment is for them. */
              booking.client_name && (
                <div className="flex items-start gap-2.5 pt-0.5">
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={booking.profiles?.avatar_url} className="object-cover" />
                    <AvatarFallback className="text-xs bg-[#EBF5FB] text-[#009FD9] font-semibold">{getInitials(booking.client_name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[#111827] flex items-center gap-1.5 flex-wrap">
                      {booking.client_name}
                      {ageBadge(booking.client_dob)}
                      {booking.profiles?.is_flagged && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#b45309] bg-[#fef3c7] px-1.5 py-0.5 rounded-md">⚠ {t("flagged")}</span>
                      )}
                    </div>
                    <p className="text-xs text-[#6b7280] mt-0.5">
                      {[
                        booking.client_phone || null,
                        booking.client_cedula ? t("clientCedula", { cedula: booking.client_cedula }) : t("noCedula"),
                        booking.client_dob ? t("birth", { date: formatDobDMY(booking.client_dob) }) : null,
                      ].filter(Boolean).join(" · ")}
                    </p>
                    {booking.client_phone && waButton(booking.client_phone, cliFirst)}
                  </div>
                </div>
              )
            )}
          </div>

          {/* ── DIVIDER + RESERVADO POR (third-party only): who actually made the
                 booking — the responsible, reachable contact. ── */}
          {booking.for_someone_else && booking.client_name && (
            <div className="mt-3 pt-3 border-t border-[#f3f4f6]">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#9ca3af]">{t("bookedByLabel")}</p>
              <div className="flex items-start gap-2.5 mt-1.5">
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarImage src={booking.profiles?.avatar_url} className="object-cover" />
                  <AvatarFallback className="text-xs bg-[#f3f4f6] text-[#6b7280] font-semibold">{getInitials(booking.client_name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-[#111827] flex items-center gap-1.5 flex-wrap">
                    {booking.client_name}
                    {booking.profiles?.is_flagged && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#b45309] bg-[#fef3c7] px-1.5 py-0.5 rounded-md">⚠ {t("flagged")}</span>
                    )}
                  </div>
                  <p className="text-xs text-[#6b7280] mt-0.5">
                    {[
                      booking.client_phone || null,
                      booking.client_cedula ? t("clientCedula", { cedula: booking.client_cedula }) : t("noCedula"),
                    ].filter(Boolean).join(" · ")}
                  </p>
                  {booking.client_phone && waButton(booking.client_phone, cliFirst)}
                </div>
              </div>
            </div>
          )}

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
