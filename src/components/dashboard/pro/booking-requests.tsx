"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, ChevronDown, CalendarClock, Clock, Phone, IdCard, Wrench, MapPin, UserRound } from "lucide-react";
import { getCategoryLabel } from "@/lib/data/categories";
import { formatId } from "@/lib/cedula";
import { ageCategoryFromDob, computeAge } from "@/lib/age";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getWhatsAppLink, getInitials, cn, formatRelativeOrDate } from "@/lib/utils";
import { StatusFilterTabs, SOLICITUD_TABS, solicitudBucket, solicitudStatusRedundant, bucketCounts } from "@/components/dashboard/status-filter-tabs";
import { CardActionsMenu, type CardAction } from "@/components/dashboard/card-actions-menu";
import { ExpandableText } from "@/components/ui/expandable-text";
import { ReportModal } from "@/components/dashboard/report-modal";
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

// ONE shared status→colour mapping (sprint 440), identical to the client side:
// active/upcoming = brand-blue (default), awaiting confirmation = amber, finished =
// green, cancelled = red, reprogramada = grey.
const STATUS_VARIANT: Record<BookingStatus, "warning" | "success" | "error" | "default" | "muted"> = {
  pending: "warning",
  confirmed: "default",
  in_progress: "default",
  awaiting_confirmation: "warning",
  completed: "success",
  cancelled: "error",
  rescheduled: "muted",
};

// "50688888888" / "88888888" → "+506 8888 8888" (readable). Non-standard → as-is.
function formatPhoneCR(raw?: string | null): string | null {
  if (!raw) return null;
  const d = String(raw).replace(/\D/g, "");
  const local = d.length === 11 && d.startsWith("506") ? d.slice(3) : d;
  if (local.length === 8) return `+506 ${local.slice(0, 4)} ${local.slice(4)}`;
  return String(raw);
}

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
    // Use the shared Badge ("warning" amber) so the clinical age flag (Menor de edad /
    // Adulto mayor) matches every other status badge instead of a one-off smaller pill.
    return <Badge variant="warning" className="text-[11px] font-semibold">{t(cat)}</Badge>;
  }
  function ageLabel(dob?: string | null) {
    const age = dob ? computeAge(dob) : null;
    if (!age) return null;
    if (age.years > 0) return t("yearsOld", { count: age.years });
    const months = Math.max(1, age.months);
    return t("monthsOld", { count: months });
  }
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("activas");
  // Accordion: at most one card expanded at a time (essentials collapsed by default).
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // "Reportar cliente" clean modal (replaces the old window.prompt), one at a time.
  const [reportFor, setReportFor] = useState<Booking | null>(null);

  // Inline cancel-with-reason panel — the pro's only exception tool (the pro does NOT
  // reschedule; sprint 433). One open at a time, keyed by booking id.
  const [actionFor, setActionFor] = useState<{ id: string; mode: "cancel" } | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function openAction(id: string, mode: "cancel") {
    setActionFor({ id, mode });
    setReason("");
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

  async function submitReport(reason: string) {
    if (!reportFor) return;
    const res = await fetch("/api/report-client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: reportFor.id, clientId: reportFor.client_id ?? null, reason }),
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
        <p className="text-sm text-[#6b7280]">{t("emptySub")}</p>
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
    // Contact: the REQUESTER (account holder) is the sole, reachable contact. The WhatsApp
    // button now lives in the unified action row (footer), not next to the contact line.
    const waHref = booking.client_phone
      ? getWhatsAppLink(booking.client_phone, t("waMessage", { name: cliFirst }))
      : null;
    // The BOOKER's identification (always the client who reserved — never the beneficiary,
    // who only has name + DOB). Shown formatted as a CR ID so the pro can confirm who they
    // booked. Absent → no cédula on file → the "Sin verificar" pill speaks instead.
    const cedulaFmt = booking.client_cedula ? formatId(String(booking.client_cedula)) : null;
    const phoneFmt = formatPhoneCR(booking.client_phone);
    const requestedDate = formatRelativeOrDate(booking.created_at, locale);

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
    const showClinicalFlags = isActive;
    const expanded = expandedId === booking.id;
    const panelOpen = actionFor?.id === booking.id;

    return (
      <Card className={cn("relative rounded-2xl border-[#e5e7eb] bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md", expanded && "shadow-md ring-1 ring-[#d8eef8] before:absolute before:inset-y-0 before:left-0 before:w-1 before:rounded-l-2xl before:bg-[#009FD9] before:content-['']")}>
        {/* EXPANDABLE LEAD CARD (sprint 430): COLLAPSED shows only essentials (who · when ·
            status + unverified). Tapping reveals the full identity, the "para otra persona"
            callout, servicio·zona, the note, and the management ACTIONS. Zero icons; text labels.
            The button gets the card's rounded corners (rounded-2xl collapsed / rounded-t when
            expanded) so its hover bg never squares off the corners — sprint 441 (no overflow-hidden,
            which would clip the actions menu). */}
        <button
          type="button"
          onClick={() => setExpandedId(expanded ? null : booking.id)}
          aria-expanded={expanded}
          className={cn("group w-full text-left px-4 py-4 sm:px-5 flex items-start gap-3.5 transition-colors hover:bg-[#f9fbfd]", expanded ? "rounded-t-2xl bg-[#fbfdff]" : "rounded-2xl")}
        >
          <Avatar className={cn("h-12 w-12 shrink-0 ring-2 transition-shadow", expanded ? "ring-[#ccecf8] shadow-sm" : "ring-[#EBF5FB]")}>
            <AvatarImage src={booking.profiles?.avatar_url} className="object-cover" />
            <AvatarFallback className="text-sm font-bold bg-[#EBF5FB] text-[#009FD9]">{getInitials(booking.client_name || "?")}</AvatarFallback>
          </Avatar>
          {/* INBOX ROW (Superhuman/Gmail hierarchy): bold name (+ pills) and the status on line 1,
              the APPOINTMENT date prominent on line 2 (no "Fecha:" label — the date speaks for
              itself), and a muted "servicio · nota" snippet on line 3 for instant context. */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[15px] font-bold text-[#162543] min-w-0 flex items-center gap-2 flex-wrap [overflow-wrap:anywhere] sm:text-base">
                {booking.client_name || t("thePerson")}
              </span>
              {!solicitudStatusRedundant(booking.status, booking.scheduled_date) && (
                <Badge variant={STATUS_VARIANT[booking.status]} className="shrink-0 px-2.5 py-0.5 text-[11px] font-semibold">{t(`status.${booking.status}`)}</Badge>
              )}
            </div>
            <div className="mt-2 flex flex-col items-start gap-2.5 text-[12px] text-[#6b7280]">
              <span className={cn("inline-flex w-full max-w-full items-center gap-2 rounded-xl border px-3 py-2.5 sm:w-auto", dateStr ? "border-[#ccecf8] bg-[#EBF5FB] font-semibold text-[#162543]" : "border-[#e5e7eb] bg-[#f3f4f6] text-[#6b7280]")}>
                <CalendarClock className="h-4 w-4 shrink-0 text-[#009FD9]" />
                <span className="truncate">{dateStr || t("noScheduledDate")}</span>
              </span>
              <span className="flex w-full max-w-full flex-col items-start gap-1.5 text-[13px]">
                {category && (
                  <span className="inline-flex w-full max-w-full items-center gap-2 text-[#374151]">
                    <Wrench className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" />
                    <span className="truncate font-medium">{category}</span>
                  </span>
                )}
                {location && (
                  <span className="inline-flex w-full max-w-full items-center gap-2 text-[#6b7280]">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" />
                    <span className="truncate">{location}</span>
                  </span>
                )}
                {(unverifiedPill || flaggedPill || (!booking.for_someone_else && showClinicalFlags && ageBadge(booking.client_dob))) && (
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    {!booking.for_someone_else && showClinicalFlags && ageBadge(booking.client_dob)}
                    {unverifiedPill}
                    {flaggedPill}
                  </span>
                )}
              </span>
            </div>
          </div>
          <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors duration-200", expanded ? "border-[#ccecf8] bg-[#EBF5FB] text-[#009FD9]" : "border-[#eef2f6] bg-white text-[#9ca3af] group-hover:border-[#d8eef8] group-hover:text-[#009FD9]")}>
            <ChevronDown className={cn("h-[18px] w-[18px] transition-transform duration-200", expanded && "rotate-180")} />
          </span>
        </button>

        {expanded && (
          <div className="rounded-b-2xl border-t border-[#f3f4f6] bg-gradient-to-b from-[#fcfdff] to-white px-4 pb-5 pt-4 sm:px-5 flex flex-col gap-4">
            {requestedDate && (
              <p className="flex items-center gap-1.5 text-[11px] text-[#9ca3af]">
                <Clock className="h-3.5 w-3.5 shrink-0 text-[#374151]" /> {t("requestedOn", { date: requestedDate })}
              </p>
            )}

            {booking.for_someone_else && (() => {
              const beneAge = ageLabel(booking.beneficiary_dob);
              return (
                <div className={cn("flex items-start gap-2.5 rounded-xl border px-3.5 py-3", showClinicalFlags ? "border-[#ccecf8] bg-[#EBF5FB]" : "border-[#e5e7eb] bg-white")}>
                  <UserRound className={cn("mt-0.5 h-4 w-4 shrink-0", showClinicalFlags ? "text-[#0089bb]" : "text-[#9ca3af]")} />
                  <div className="min-w-0">
                    <p className={cn("text-[10px] font-bold uppercase tracking-[0.06em]", showClinicalFlags ? "text-[#0089bb]" : "text-[#9ca3af]")}>{t("apptForLabel")}</p>
                    <p className="mt-0.5 text-sm font-semibold text-[#111827] flex items-center gap-2 flex-wrap [overflow-wrap:anywhere]">
                      {booking.beneficiary_name || t("otherPerson")}
                      {showClinicalFlags && ageBadge(booking.beneficiary_dob, !!booking.beneficiary_is_minor)}
                    </p>
                    {beneAge && (
                      <p className="mt-0.5 text-[12px] text-[#6b7280]"><span className="text-[#9ca3af]">{t("fieldAge")}</span> {beneAge}</p>
                    )}
                  </div>
                </div>
              );
            })()}

            {(category || phoneFmt || cedulaFmt || booking.service_description) && (
              <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e8eef5]">
                {category && (
                  <div className="flex items-start gap-3 px-3.5 py-3.5">
                    <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-[#009FD9]" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("fieldService")}</p>
                      <p className="mt-0.5 text-sm font-semibold text-[#162543] leading-snug [overflow-wrap:anywhere]">{category}</p>
                    </div>
                  </div>
                )}
                {(phoneFmt || cedulaFmt) && (
                  <div className={cn("grid grid-cols-1 border-[#eef2f6] sm:grid-cols-2", category && "border-t")}>
                    {phoneFmt && (
                      <div className="flex min-w-0 items-center gap-2.5 px-3.5 py-3">
                        <Phone className="h-4 w-4 shrink-0 text-[#9ca3af]" />
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("contactPhone")}</p>
                          <p className="mt-0.5 text-[13px] font-medium text-[#374151] truncate">{phoneFmt}</p>
                        </div>
                      </div>
                    )}
                    {cedulaFmt && (
                      <div className={cn("flex min-w-0 items-center gap-2.5 px-3.5 py-3", phoneFmt && "border-t border-[#eef2f6] sm:border-l sm:border-t-0")}>
                        <IdCard className="h-4 w-4 shrink-0 text-[#9ca3af]" />
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("contactCedula")}</p>
                          <p className="mt-0.5 text-[13px] font-medium text-[#374151] truncate">{cedulaFmt}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {booking.service_description && (
                  <div className="border-t border-[#eef2f6] px-3.5 py-3.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("noteEyebrow")}</p>
                    <ExpandableText text={booking.service_description} lines={3} className="mt-1 text-[13px] leading-relaxed text-[#4b5563]" />
                  </div>
                )}
              </div>
            )}

            {booking.status === "awaiting_confirmation" && (
              <p className="text-xs text-[#b45309] bg-[#fffbeb] border border-[#fde68a] rounded-lg px-2.5 py-2">
                {t("awaitingConfirmNote")}
              </p>
            )}

            {/* ACTIONS (sprint 441) — clean PRIMARY-visible + overflow MENU pattern. The most-used
                action (WhatsApp, contacting the client) stays a 1-tap visible button; the secondary
                management actions (Marcar completado · Cancelar · Reportar) live in the "···" menu. */}
            {!panelOpen && (() => {
              const menuActions: CardAction[] = [
                ...(isActive ? [
                  { label: t("markCompleted"), onClick: () => updateStatus(booking.id, "awaiting_confirmation") },
                  { label: t("cancel"), onClick: () => openAction(booking.id, "cancel"), destructive: true },
                ] : []),
                { label: t("reportClient"), onClick: () => setReportFor(booking), destructive: true },
              ];
              return (
                <div className="flex flex-nowrap items-center gap-2 border-t border-[#eef2f6] pt-3">
                  {waHref && (
                    <Button variant="whatsapp" size="sm" asChild className="shrink-0 rounded-lg px-4">
                      <a href={waHref} target="_blank" rel="noopener noreferrer">
                        <WhatsAppIcon className="h-4 w-4" /> {t("whatsappTo", { name: cliFirst })}
                      </a>
                    </Button>
                  )}
                  <div className="ml-auto">
                    <CardActionsMenu actions={menuActions} label={t("actions")} />
                  </div>
                </div>
              );
            })()}

          {/* Cancel-with-reason panel — preset chips fill the note; the client is
              notified with the motivo; the slot is freed. */}
          {actionFor?.id === booking.id && actionFor.mode === "cancel" && (
            <div className="rounded-xl border border-[#e5e7eb] bg-[#fafafa] p-3 flex flex-col gap-2.5">
              <p className="text-sm font-semibold text-[#111827]">{t("cancelTitle")}</p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("cancelReasonPlaceholder")}
                rows={2}
                maxLength={300}
                className="w-full rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#111827] placeholder:text-[#9ca3af] break-words focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent resize-none"
              />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="rounded-lg" onClick={closeAction} disabled={submitting}>{t("back")}</Button>
                <Button size="sm" className="rounded-lg bg-red-600 hover:bg-red-700" onClick={() => submitCancel(booking.id)} disabled={submitting}>
                  {t("cancelConfirm")}
                </Button>
              </div>
            </div>
          )}
          </div>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <StatusFilterTabs tabs={SOLICITUD_TABS} value={filter} onChange={setFilter} counts={counts} />
      {filtered.length === 0 ? (
        <p className="text-sm text-[#6b7280] text-center py-8">{t("noneInView")}</p>
      ) : (
        <div className="flex flex-col gap-3.5">
          {filtered.map((b) => <BookingCard key={b.id} booking={b} />)}
        </div>
      )}

      {reportFor && (
        <ReportModal
          title={t("reportTitle")}
          body={t("reportBody")}
          reasons={[t("reportR1"), t("reportR2"), t("reportR3"), t("reportR4")]}
          detailsPlaceholder={t("reportDetails")}
          backLabel={t("back")}
          submitLabel={t("reportSubmit")}
          onClose={() => setReportFor(null)}
          onSubmit={submitReport}
        />
      )}
    </div>
  );
}
