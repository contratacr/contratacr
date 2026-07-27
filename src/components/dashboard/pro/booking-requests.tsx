"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { CalendarCheck, CalendarClock, Clock, FileText, Phone, IdCard, Wrench, MapPin, UserRound, Flag } from "lucide-react";
import { getCategoryLabel } from "@/lib/data/categories";
import { formatId } from "@/lib/cedula";
import { computeAge } from "@/lib/age";
import { DirectChatLauncher } from "@/components/professionals/direct-chat-launcher";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn, formatRelativeOrDate } from "@/lib/utils";
import { StatusFilterTabs, SOLICITUD_TABS, solicitudBucket, solicitudStatusRedundant, bucketCounts } from "@/components/dashboard/status-filter-tabs";
import { ExpandToggle } from "@/components/dashboard/expand-toggle";
import { ExpandableText } from "@/components/ui/expandable-text";
import { ReportModal } from "@/components/dashboard/report-modal";
import { AUTO_CONFIRM_DAYS } from "@/lib/completion";
import { useAppDialog } from "@/hooks/use-app-dialog";
import type { BookingStatus } from "@/types";
import { PanelEmptyState, PanelSectionLoading } from "@/components/ui/content-loading";
import { AppTooltip } from "@/components/ui/app-tooltip";

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
  archived_by_professional?: boolean;
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
};

// ONE shared status→colour mapping (sprint 440), identical to the client side:
// active/upcoming + awaiting confirmation = brand-blue (default), finished = green,
// cancelled = red, reprogramada = grey.
const STATUS_VARIANT: Record<BookingStatus, "warning" | "success" | "error" | "default" | "muted"> = {
  pending: "default",
  confirmed: "default",
  in_progress: "default",
  awaiting_confirmation: "default",
  completed: "success",
  cancelled: "error",
  rescheduled: "muted",
};

function PendingStatusText({ label }: { label: string }) {
  return <Badge variant="default" className="shrink-0 text-[11px] font-semibold">{label}</Badge>;
}

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
  const searchParams = useSearchParams();
  const dateLocale = locale === "en" ? "en-US" : "es-CR";
  const { dialogNode, showMessage } = useAppDialog();
  const errorTitle = locale === "en" ? "Something went wrong" : "No se pudo completar la acción";

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
  const bookingsSnapshotRef = useRef("");
  const refreshTimerRef = useRef<number | null>(null);
  const lastSilentRefreshRef = useRef(0);
  // Accordion: at most one card expanded at a time (essentials collapsed by default).
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const targetRetryRef = useRef(0);
  const targetBookingRef = useRef<string | null>(null);
  const targetBookingHandledRef = useRef(false);
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

  const loadBookings = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetch("/api/bookings?role=professional", { cache: "no-store" });
      const { bookings: rows } = await res.json();
      const next = rows ?? [];
      const snapshot = JSON.stringify(next.map((b: Booking) => `${b.id}:${b.status}:${b.scheduled_date ?? ""}:${b.scheduled_time ?? ""}`));
      if (silent && bookingsSnapshotRef.current === snapshot) return;
      bookingsSnapshotRef.current = snapshot;
      setBookings(next);
    } catch (error) {
      console.error("[booking-requests] load failed:", error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const refreshSoon = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    const elapsed = Date.now() - lastSilentRefreshRef.current;
    const delay = elapsed < 1600 ? 1600 - elapsed : 700;
    refreshTimerRef.current = window.setTimeout(() => {
      lastSilentRefreshRef.current = Date.now();
      void loadBookings(true);
    }, delay);
  }, [loadBookings]);

  useEffect(() => { queueMicrotask(() => void loadBookings()); }, [loadBookings]);

  useEffect(() => {
    if (loading) return;
    window.addEventListener("notificationsChanged", refreshSoon);
    window.addEventListener("focus", refreshSoon);
    document.addEventListener("visibilitychange", refreshSoon);
    return () => {
      window.removeEventListener("notificationsChanged", refreshSoon);
      window.removeEventListener("focus", refreshSoon);
      document.removeEventListener("visibilitychange", refreshSoon);
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    };
  }, [loading, refreshSoon]);

  useEffect(() => {
    const bookingId = searchParams.get("booking");
    if (!bookingId) return;
    if (targetBookingRef.current !== bookingId) {
      targetBookingRef.current = bookingId;
      targetRetryRef.current = 0;
      targetBookingHandledRef.current = false;
    }
    if (targetBookingHandledRef.current) return;
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) {
      if (targetRetryRef.current >= 8) return;
      targetRetryRef.current += 1;
      const id = window.setTimeout(() => void loadBookings(true), 900);
      return () => window.clearTimeout(id);
    }
    targetRetryRef.current = 0;
    targetBookingHandledRef.current = true;
    const id = window.setTimeout(() => {
      setFilter(solicitudBucket(booking.status, booking.scheduled_date));
      setExpandedId(bookingId);
      window.setTimeout(() => document.getElementById(`booking-${bookingId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
    }, 0);
    return () => window.clearTimeout(id);
  }, [bookings, loadBookings, searchParams]);

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

  async function archiveBooking(id: string) {
    const res = await fetch("/api/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "archive" }),
    });
    if (!res.ok) {
      void showMessage({ title: errorTitle, description: t("archiveError"), tone: "danger" });
      return;
    }
    setBookings((prev) => prev.filter((b) => b.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  async function submitReport(reason: string) {
    if (!reportFor) return false;
    const res = await fetch("/api/report-client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: reportFor.id, clientId: reportFor.client_id ?? null, reason }),
    });
    return res.ok;
  }

  if (loading) {
    return <PanelSectionLoading />;
  }

  if (bookings.length === 0) {
    return (
      <PanelEmptyState icon={CalendarCheck} title={t("empty")} description={t("emptySub")} />
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
    // The BOOKER's identification (always the client who reserved — never the beneficiary,
    // who only has name + DOB). Keep it inside the expanded details so the closed card
    // stays scannable; absent ID reads as "Sin verificar" in the same field.
    const cedulaFmt = booking.client_cedula ? formatId(String(booking.client_cedula)) : null;
    const phoneFmt = formatPhoneCR(booking.client_phone);
    const requestedDate = formatRelativeOrDate(booking.created_at, locale);

    const flaggedPill = booking.profiles?.is_flagged ? (
      <Badge variant="warning" className="text-[11px] font-semibold">
        <Flag className="h-3 w-3" />
        {t("flagged")}
      </Badge>
    ) : null;

    // An ACTIVE booking (still upcoming/ongoing) gets the manage tools.
    const isActive = (["pending", "confirmed", "in_progress"] as string[]).includes(booking.status);
    const expanded = expandedId === booking.id;
    const panelOpen = actionFor?.id === booking.id;

    return (
      <Card id={`booking-${booking.id}`} className={cn("rounded-2xl border-[#e5e7eb] bg-white shadow-sm transition-[box-shadow,border-color] hover:shadow-md", expanded && "shadow-md ring-1 ring-[#d8eef8]")}>
        {/* EXPANDABLE LEAD CARD (sprint 430): COLLAPSED shows only essentials (who · when ·
            status + relevant flags). Tapping reveals the full identity, the "para otra persona"
            callout, servicio·zona, the note, and the management ACTIONS. Zero icons; text labels.
            The button gets the card's rounded corners (rounded-2xl collapsed / rounded-t when
            expanded) so its hover bg never squares off the corners — sprint 441 (no overflow-hidden,
            which would clip the actions menu). */}
        <button
          type="button"
          onClick={() => setExpandedId(expanded ? null : booking.id)}
          aria-expanded={expanded}
          className={cn("group w-full text-left p-4 sm:p-5 flex items-start gap-3.5 transition-colors hover:bg-[#f9fbfd]", expanded ? "rounded-t-2xl bg-[#fbfdff]" : "rounded-2xl")}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#ccecf8] bg-[#EAF7FD] text-[#0089bb] shadow-[0_8px_20px_-18px_rgba(0,159,217,0.9)]">
            <CalendarCheck className="h-[18px] w-[18px]" />
          </div>
          {/* INBOX ROW (Superhuman/Gmail hierarchy): bold name (+ pills) and the status on line 1,
              the APPOINTMENT date prominent on line 2 (no "Fecha:" label — the date speaks for
              itself), and a muted "servicio · nota" snippet on line 3 for instant context. */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 flex flex-1 items-center gap-2 flex-wrap text-[15px] font-bold leading-snug text-[#162543] [overflow-wrap:anywhere] sm:text-base">
                {booking.client_name || t("thePerson")}
              </span>
              {!solicitudStatusRedundant(booking.status, booking.scheduled_date) && (
                booking.status === "pending" ? (
                  <PendingStatusText label={t(`status.${booking.status}`)} />
                ) : (
                  <Badge variant={STATUS_VARIANT[booking.status]} className="shrink-0 text-[11px] font-semibold">{t(`status.${booking.status}`)}</Badge>
                )
              )}
            </div>
            <div className="mt-2 flex flex-col items-start gap-1.5 text-[13px]">
              <span className={cn("inline-flex w-full max-w-full items-center gap-2", dateStr ? "text-[#374151]" : "text-[#9ca3af]")}>
                <CalendarClock className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" />
                <span className="min-w-0 truncate"><span className="font-medium text-[#9ca3af]">{t("fieldDate")}</span> <span className={dateStr ? "text-[#374151]" : "text-[#9ca3af]"}>{dateStr || t("noScheduledDate")}</span></span>
              </span>
              <span className="flex w-full max-w-full flex-col items-start gap-1.5">
                {category && (
                  <span className="inline-flex w-full max-w-full items-center gap-2 text-[#374151]">
                    <Wrench className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" />
                    <span className="min-w-0 truncate"><span className="font-medium text-[#9ca3af]">{t("fieldService")}</span> <span className="text-[#374151]">{category}</span></span>
                  </span>
                )}
                {flaggedPill && (
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    {flaggedPill}
                  </span>
                )}
              </span>
            </div>
          </div>
          <ExpandToggle open={expanded} />
        </button>

        {expanded && (
          <div className="rounded-b-2xl border-t border-[#f3f4f6] bg-gradient-to-b from-[#fcfdff] to-white px-4 pb-5 pt-4 sm:px-5 flex flex-col gap-4">
            {requestedDate && (
              <p className="flex items-center gap-1.5 text-[11px] text-[#9ca3af]">
                <Clock className="h-3.5 w-3.5 shrink-0 text-[#374151]" /> {t("requestedOn", { date: requestedDate })}
              </p>
            )}

            {location && (
              <div className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#9ca3af]" />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("fieldZone")}</p>
                  <p className="mt-0.5 text-[13px] font-medium text-[#374151] [overflow-wrap:anywhere]">{location}</p>
                </div>
              </div>
            )}

            {booking.for_someone_else && (() => {
              const beneAge = ageLabel(booking.beneficiary_dob);
              return (
                <div className="flex items-start gap-2.5">
                  <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-[#9ca3af]" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("apptForLabel")}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      <p className="min-w-0 text-[13px] font-semibold text-[#111827] [overflow-wrap:anywhere]">
                        {booking.beneficiary_name || t("otherPerson")}
                      </p>
                    </div>
                    {beneAge && (
                      <p className="mt-0.5 text-[12px]"><span className="text-[#9ca3af]">{t("fieldAge")}</span> <span className="text-[#374151]">{beneAge}</span></p>
                    )}
                  </div>
                </div>
              );
            })()}
            {phoneFmt && (
              <div className="flex items-start gap-2.5">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-[#9ca3af]" />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("contactPhone")}</p>
                  <p className="mt-0.5 text-[13px] font-medium text-[#374151] truncate">{phoneFmt}</p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-2.5">
              <IdCard className="mt-0.5 h-4 w-4 shrink-0 text-[#9ca3af]" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("contactCedula")}</p>
                <p className={cn("mt-0.5 text-[13px] font-medium truncate", cedulaFmt ? "text-[#374151]" : "text-[#6b7280]")}>
                  {cedulaFmt || t("unverified")}
                </p>
              </div>
            </div>
            {booking.service_description && (
              <div className="flex items-start gap-2.5">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#9ca3af]" />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("noteEyebrow")}</p>
                  <ExpandableText text={booking.service_description} lines={3} className="mt-0.5 text-[13px] leading-relaxed text-[#4b5563]" />
                </div>
              </div>
            )}

            {booking.status === "awaiting_confirmation" && (
              <p className="rounded-lg border border-[#e5e7eb] bg-[#fbfdff] px-2.5 py-2 text-xs font-medium text-[#4b5563]">
                {t("awaitingConfirmNote", { days: AUTO_CONFIRM_DAYS })}
              </p>
            )}

            {/* Actions: primary row first, secondary row second. Mobile keeps a stable
                2-column grid so the buttons do not jump between different widths. */}
            {!panelOpen && (() => {
              const primaryActionClass = "min-h-10 w-full rounded-lg px-3 text-sm font-bold";
              const secondaryActionClass = "min-h-10 w-full rounded-lg px-3 text-sm font-bold";
              return (
                <div className="grid grid-cols-2 gap-2 border-t border-[#eef2f6] pt-3 sm:flex sm:flex-wrap sm:items-center">
                  {isActive && (
                    <DirectChatLauncher bookingId={booking.id} professionalName={booking.client_name || t("thePerson")} contextTitle={booking.service_description} buttonLabel={t("contact")} tone="contrast" className={`${primaryActionClass} sm:min-w-[10rem] sm:flex-1`} />
                  )}
                  {isActive && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        className={`${primaryActionClass} sm:min-w-[10rem] sm:flex-1`}
                        onClick={() => updateStatus(booking.id, "awaiting_confirmation")}
                      >
                        {t("markCompleted")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={`${secondaryActionClass} border-[#fecaca] text-[#dc2626] hover:border-[#fca5a5] hover:bg-[#fef2f2] hover:text-[#b91c1c] sm:min-w-[10rem] sm:flex-1`}
                        onClick={() => openAction(booking.id, "cancel")}
                      >
                        {t("cancel")}
                      </Button>
                    </>
                  )}
                  {booking.status === "cancelled" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={`${secondaryActionClass} border-red-100 text-red-600 hover:bg-red-50 sm:min-w-[10rem] sm:flex-1`}
                      onClick={() => archiveBooking(booking.id)}
                    >
                      {t("archive")}
                    </Button>
                  )}
                  <AppTooltip label={t("reportClient")} className="min-w-0 sm:ml-auto">
                    <button
                      type="button"
                      aria-label={t("reportClient")}
                      onClick={() => setReportFor(booking)}
                      className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[#9ca3af] transition-colors hover:bg-[#f9fafb] hover:text-[#dc2626] sm:w-auto sm:justify-start"
                    >
                      <Flag className="h-3.5 w-3.5" />
                      <span>{t("reportClient")}</span>
                    </button>
                  </AppTooltip>
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
        <div className="ccr-native-safe-list-end flex flex-col gap-3.5">
          {filtered.map((b) => <BookingCard key={b.id} booking={b} />)}
        </div>
      )}

      {reportFor && (
        <ReportModal
          title={t("reportTitle")}
          body={t("reportBody")}
          detailsPlaceholder={t("reportDetails")}
          backLabel={t("back")}
          submitLabel={t("reportSubmit")}
          successLabel={t("reportThanks")}
          errorLabel={t("reportError")}
          onClose={() => setReportFor(null)}
          onSubmit={submitReport}
        />
      )}
      {dialogNode}
    </div>
  );
}
