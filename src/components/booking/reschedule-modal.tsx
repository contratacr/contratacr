"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { isTooSoonCR } from "@/lib/time-cr";
import { cn } from "@/lib/utils";

/**
 * Client-side RESCHEDULE picker (sprint 433). The CLIENT — the owner of the
 * appointment — picks another AVAILABLE slot for the SAME professional. The
 * PATCH moves the booking to the new slot: the old slot is freed (it's only
 * "taken" while the booking sits on it) and the new one is occupied, guarded
 * atomically by the migration-069 partial unique index (a raced slot → 409).
 *
 * Plain `<div>` overlay (not a Radix modal) — no portaled SelectMenu here, and
 * it keeps the booking flow's pointer-events quirks out of scope.
 */

type DaySchedule = { enabled: boolean; ranges: { start: string; end: string }[] };
type WeeklyAvailability = Record<string, DaySchedule>;

const DAY_KEYS = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"];
const DAY_NAMES_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function formatDateISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function getCalendarDays(year: number, month: number): (Date | null)[] {
  const days: (Date | null)[] = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
  return days;
}
function generateSlots(ranges: { start: string; end: string }[]): string[] {
  const slots: string[] = [];
  for (const range of ranges ?? []) {
    const [sh, sm] = range.start.split(":").map(Number);
    const [eh, em] = range.end.split(":").map(Number);
    let cur = sh * 60 + sm;
    const end = eh * 60 + em;
    while (cur + 60 <= end) {
      slots.push(`${String(Math.floor(cur / 60)).padStart(2, "0")}:${String(cur % 60).padStart(2, "0")}`);
      cur += 60;
    }
  }
  return slots;
}
function to12h(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ap = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}

interface RescheduleModalProps {
  professionalId: string;
  bookingId: string;
  currentWhen?: string | null;
  onClose: () => void;
  onDone: () => void;
}

export function RescheduleModal({ professionalId, bookingId, currentWhen, onClose, onDone }: RescheduleModalProps) {
  const t = useTranslations("reschedule");
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const [availability, setAvailability] = useState<WeeklyAvailability>({});
  const [dateSlots, setDateSlots] = useState<Record<string, string[]>>({});
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [takenSlots, setTakenSlots] = useState<Set<string>>(new Set());
  const [isPrivate, setIsPrivate] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("professionals").select("availability, availability_public").eq("id", professionalId).single(),
      supabase.from("blocked_dates").select("blocked_date").eq("professional_id", professionalId),
      supabase.from("availability_slots").select("slot_date, slot_time").eq("professional_id", professionalId).gte("slot_date", formatDateISO(today)),
      fetch(`/api/bookings?takenFor=${professionalId}`).then((r) => r.json()).catch(() => ({ taken: [] })),
    ]).then(([{ data: proData }, { data: bdData }, { data: slotData }, takenRes]) => {
      const priv = proData?.availability_public === false;
      setIsPrivate(priv);
      if (!priv && proData?.availability) setAvailability(proData.availability as WeeklyAvailability);
      const map: Record<string, string[]> = {};
      if (!priv) {
        for (const s of slotData ?? []) {
          const time = String(s.slot_time).slice(0, 5);
          (map[s.slot_date] ??= []).push(time);
        }
        for (const k of Object.keys(map)) map[k].sort();
      }
      setDateSlots(map);
      setBlockedDates((bdData ?? []).map((r) => r.blocked_date));
      setTakenSlots(new Set<string>((takenRes?.taken as string[]) ?? []));
      setLoaded(true);
    });
  }, [professionalId, today]);

  const usesExplicitSlots = Object.keys(dateSlots).length > 0;

  function getSlotsForDate(dateStr: string): string[] {
    let baseSlots: string[];
    if (usesExplicitSlots) {
      baseSlots = dateSlots[dateStr] ?? [];
    } else {
      const [y, m, d] = dateStr.split("-").map(Number);
      const date = new Date(y, m - 1, d);
      const daySchedule = availability[DAY_KEYS[date.getDay()]];
      if (!daySchedule?.enabled) return [];
      baseSlots = generateSlots(daySchedule.ranges ?? []);
    }
    // Exclude slots taken by ANY active booking (incl. this booking's current slot)
    // and any time inside the 15-min lead. Picking a different free slot is the point.
    return baseSlots.filter((slot) => !takenSlots.has(`${dateStr} ${slot}`) && !isTooSoonCR(dateStr, slot));
  }

  function isDayAvailable(date: Date): boolean {
    if (date < today) return false;
    const dateStr = formatDateISO(date);
    if (blockedDates.includes(dateStr)) return false;
    if (usesExplicitSlots) return getSlotsForDate(dateStr).length > 0;
    return !!availability[DAY_KEYS[date.getDay()]]?.enabled && getSlotsForDate(dateStr).length > 0;
  }

  const hasAnyAvailability = usesExplicitSlots || Object.values(availability).some((d) => d.enabled);
  const slots = selectedDate ? getSlotsForDate(selectedDate) : [];

  const canGoPrev = !(currentYear === today.getFullYear() && currentMonth === today.getMonth());
  const maxMonth = new Date(today.getFullYear(), today.getMonth() + 3, 1);
  const canGoNext = new Date(currentYear, currentMonth + 1, 1) < maxMonth;
  function prevMonth() {
    if (!canGoPrev) return;
    if (currentMonth === 0) { setCurrentYear((y) => y - 1); setCurrentMonth(11); } else setCurrentMonth((m) => m - 1);
    setSelectedDate(""); setSelectedTime("");
  }
  function nextMonth() {
    if (!canGoNext) return;
    if (currentMonth === 11) { setCurrentYear((y) => y + 1); setCurrentMonth(0); } else setCurrentMonth((m) => m + 1);
    setSelectedDate(""); setSelectedTime("");
  }

  async function submit() {
    if (!selectedDate || !selectedTime) return;
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: bookingId, status: "confirmed", scheduledDate: selectedDate, scheduledTime: selectedTime }),
    });
    if (res.ok) {
      setSubmitting(false);
      onDone();
      onClose();
      return;
    }
    setSubmitting(false);
    setError(res.status === 409 ? t("taken") : t("error"));
  }

  const days = getCalendarDays(currentYear, currentMonth);

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("title")}
        className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#f3f4f6] bg-white px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[#111827]">{t("title")}</h2>
            {currentWhen && <p className="text-xs text-[#9ca3af] truncate">{t("current", { when: currentWhen })}</p>}
          </div>
          <button onClick={onClose} aria-label={t("cancel")} className="p-1.5 rounded-lg text-[#6b7280] hover:bg-[#f3f4f6] transition-colors shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4">
          {!loaded ? (
            <div className="flex justify-center py-12">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" />
            </div>
          ) : isPrivate || !hasAnyAvailability ? (
            <p className="py-8 text-center text-sm text-[#6b7280]">{isPrivate ? t("privateNote") : t("noAvailability")}</p>
          ) : (
            <>
              {/* Month nav */}
              <div className="flex items-center justify-between mb-3">
                <button onClick={prevMonth} disabled={!canGoPrev} className="p-1.5 rounded-lg text-[#6b7280] hover:bg-[#f3f4f6] disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="text-sm font-semibold text-[#111827]">{MONTH_NAMES[currentMonth]} {currentYear}</span>
                <button onClick={nextMonth} disabled={!canGoNext} className="p-1.5 rounded-lg text-[#6b7280] hover:bg-[#f3f4f6] disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>

              {/* Day grid */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {DAY_NAMES_SHORT.map((d) => (
                  <div key={d} className="text-center text-[10px] font-semibold text-[#9ca3af] py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {days.map((date, i) => {
                  if (!date) return <div key={`e${i}`} />;
                  const dateStr = formatDateISO(date);
                  const available = isDayAvailable(date);
                  const selected = selectedDate === dateStr;
                  return (
                    <button
                      key={dateStr}
                      disabled={!available}
                      onClick={() => { setSelectedDate(dateStr); setSelectedTime(""); }}
                      className={cn(
                        "aspect-square rounded-lg text-sm font-medium transition-colors",
                        selected ? "bg-[#009FD9] text-white" :
                        available ? "text-[#111827] hover:bg-[#EBF5FB]" : "text-[#d1d5db] cursor-not-allowed",
                      )}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>

              {/* Time slots */}
              {selectedDate && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-[#374151] mb-2">{t("pickTime")}</p>
                  {slots.length === 0 ? (
                    <p className="text-sm text-[#9ca3af] py-2">{t("noSlots")}</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {slots.map((slot) => (
                        <button
                          key={slot}
                          onClick={() => setSelectedTime(slot)}
                          className={cn(
                            "rounded-lg border px-2 py-2 text-[13px] font-semibold transition-colors",
                            selectedTime === slot ? "border-[#009FD9] bg-[#009FD9] text-white" : "border-[#e5e7eb] text-[#374151] hover:bg-[#f9fafb]",
                          )}
                        >
                          {to12h(slot)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

              <div className="mt-5 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 rounded-full" onClick={onClose} disabled={submitting}>{t("cancel")}</Button>
                <Button size="sm" className="flex-1 rounded-full" onClick={submit} disabled={!selectedDate || !selectedTime || submitting} loading={submitting}>
                  {t("confirm")}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
