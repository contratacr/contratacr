"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { X, Lock, Loader2, MapPin, ChevronDown, ChevronLeft, ChevronRight, Calendar, CalendarClock, Pencil, Trash2, MoreVertical, Video } from "lucide-react";
import { type ContactPreference } from "@/lib/constants";
import { crTodayISO, isTooSoonCR } from "@/lib/time-cr";
import { TimeSelect, to12h } from "@/components/ui/time-select";
import { SelectMenu } from "@/components/ui/select-menu";
import { FormLoadingState } from "@/components/ui/loading-state";
import { useReportSaveStatus } from "@/components/dashboard/save-status-context";
import { Link } from "@/i18n/navigation";
import { stableWorkplaceId } from "@/lib/workplaces";

// How far ahead the weekly template + exceptions are MATERIALIZED into concrete
// `availability_slots` (the booking-critical table everything downstream reads). The
// window is regenerated on every edit AND when the editor mounts, so it stays fresh.
const HORIZON_DAYS = 70;
const VIDEO_LOCATION_ID = "videoconsulta";

// Monday-first display order (JS getDay: 0=Sun … 6=Sat).
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DURATION_OPTIONS = [30, 45, 60, 90, 120];

type Franja = { id: string; start: string; end: string };
// A weekly time block in the UNIFIED per-day view — a franja that CARRIES its own
// location (sprint 238). The day-first UI shows every location's blocks together;
// each block writes its own `location_id` to `availability_weekly` (backend model
// unchanged).
type Block = { id: string; locationId: string; start: string; end: string };
type WeeklyRow = { id?: string; location_id: string; category_id: string | null; weekday: number; start: string; end: string; slot_minutes: number };
type ExcMode = "closed" | "custom" | "extra";
type ExcRow = { id?: string; location_id: string; category_id: string | null; date: string; mode: ExcMode; start: string | null; end: string | null; slot_minutes: number };

function hhmm(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}
function toMins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
// Two half-open minute ranges [aS,aE) and [bS,bE) overlap iff they share any minute.
// Touching ends (e.g. 12:00–13:00 then 13:00–14:00) do NOT overlap — that's a clean
// CONSECUTIVE hand-off between back-to-back blocks (08:00–15:00 then 15:00–17:00 is
// fine), not being in two places at once. No minimum gap/travel time is enforced.
function rangesOverlap(aS: number, aE: number, bS: number, bE: number): boolean {
  return aS < bE && bS < aE;
}
function isVideoLocationId(id: string | null | undefined): boolean {
  return ["videoconsulta", "video_consultation", "video-consultation"].includes(String(id ?? "").toLowerCase());
}
function sharesTimeWithVideo(a: string, b: string): boolean {
  return a !== b && (isVideoLocationId(a) || isVideoLocationId(b));
}
// A franja is COMPLETE (savable) only when BOTH ends are set and end > start. Newly
// enabled days start as INCOMPLETE drafts (empty fields) — kept in the UI so the pro
// can pick freely, but never validated/persisted/materialized until complete.
function isCompleteFranja(f: { start: string; end: string }): boolean {
  return !!f.start && !!f.end && toMins(f.end) > toMins(f.start);
}
// Merge overlapping/touching ranges into the fewest contiguous ranges (sorted) — for a
// clean "already occupied" read (08:00–12:00 + 12:00–15:00 → 08:00–15:00).
function mergeRanges(ranges: [number, number][]): [number, number][] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}
function todayISO(): string {
  return crTodayISO();
}
function genId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}
function toKeyLocal(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toKeyLocal(new Date(y, m - 1, d + n));
}
function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}
// A sensible new franja: after the previous one, else a default 8–5 / 9–12 block.
function nextFranja(existing: Franja[]): Franja {
  if (existing.length === 0) return { id: genId(), start: "08:00", end: "17:00" };
  const last = existing[existing.length - 1];
  const start = toMins(last.end);
  const end = Math.min(start + 60, 23 * 60 + 30);
  return { id: genId(), start: hhmm(Math.min(start, 23 * 60)), end: hhmm(end > start ? end : Math.min(start + 30, 23 * 60 + 30)) };
}

type Place = { id?: string | null; name?: string | null; address?: string | null; provinciaId?: string | null; cantonId?: string | null };

interface AvailabilityEditorProps {
  professionalId: string;
  initialPublic?: boolean;
  initialContactPreference?: ContactPreference;
  workplaces?: Place[];
  videoConsultationAllowed?: boolean;
  initialVideoConsultation?: boolean;
  onSaved?: () => void;
}

export function AvailabilityEditor({
  professionalId,
  initialPublic = true,
  workplaces = [],
  videoConsultationAllowed = false,
  initialVideoConsultation = false,
  onSaved,
}: AvailabilityEditorProps) {
  const locale = useLocale();
  const t = useTranslations("availabilityEditor");
  const dateLocale = locale === "en" ? "en-US" : "es-CR";

  const [isPublic, setIsPublic] = useState(initialPublic);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const scheduleSaveInFlightRef = useRef(false);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [savingVideoConsultation, setSavingVideoConsultation] = useState(false);
  const [isVideoConsultation, setIsVideoConsultation] = useState(initialVideoConsultation);
  const [showPrivateConfirm, setShowPrivateConfirm] = useState(false);
  const [showClosedDays, setShowClosedDays] = useState(false);
  // Cross/same-location overlap block — a pro can't be in two places at once.
  const [conflict, setConflict] = useState<{ title: string; body: string; kind?: "location" | "time" } | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  function pulseSaved() { setJustSaved(true); setTimeout(() => setJustSaved(false), 2500); }
  const reportSaveFailure = useCallback((context: string, error: unknown) => {
    console.error(`[availability] ${context}`, error);
    const rawMessage = typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";
    const title = locale === "en" ? "Could not save this schedule" : "No se pudo guardar este horario";
    const isOverlapError = /availability_overlap|overlap|conflict/i.test(rawMessage);
    const body = isOverlapError
      ? locale === "en"
        ? "That time is already used in another in-person location. Check your other locations and choose a different time. Video consultation can share hours with one in-person location."
        : "Ese horario ya está ocupado en otro lugar presencial. Revisa los horarios de tus otros lugares y elige otra hora. La videoconsulta sí puede compartir horario con un lugar presencial."
      : locale === "en"
        ? "The schedule was not saved. Try again in a moment."
        : "El horario no se guardó. Intenta de nuevo en un momento.";
    setConflict({ title, body, kind: isOverlapError ? "location" : "time" });
  }, [locale]);

  // The recurring template + date exceptions are the source of truth (the editor
  // edits these); they MATERIALIZE into availability_slots.
  const [weekly, setWeekly] = useState<WeeklyRow[]>([]);
  const [exceptions, setExceptions] = useState<ExcRow[]>([]);
  // Appointment length is ONE global value (applies to every block/location).
  const [durationPref, setDurationPref] = useState(60);

  // ── Location tabs ("HORARIO PARA") — fixed/base workplaces + videoconsulta ──
  const locationOptions = useMemo(() => {
    const opts: { id: string; label: string }[] = [];
    for (let i = 0; i < workplaces.length; i += 1) {
      const w = workplaces[i];
      const id = stableWorkplaceId(w, i);
      opts.push({ id, label: w.name?.trim() || t("locationFallback") });
    }
    if (isVideoConsultation) opts.push({ id: VIDEO_LOCATION_ID, label: t("videoconsulta") });
    return opts;
  }, [isVideoConsultation, t, workplaces]);
  const schedulableLocationIds = useMemo(() => new Set(locationOptions.map((o) => o.id)), [locationOptions]);

  // Weekly schedules are edited one schedulable location at a time. "A domicilio" is
  // profile coverage, not a separate schedule; videoconsulta is a real schedule tab.
  const isMultiLocation = locationOptions.length > 1;
  const defaultLocationId = locationOptions[0]?.id ?? "";

  // `genLocation` now scopes ONLY the EXCEPTIONS ("¿Un día distinto?") section — its
  // per-location machinery (saveException / DayModal / otherOccupiedForDate) is kept
  // as-is, driven by a small location selector shown there when multi-location.
  const [genLocation, setGenLocation] = useState("");
  useEffect(() => {
    if (locationOptions.length > 0 && !locationOptions.some((o) => o.id === genLocation)) {
      queueMicrotask(() => setGenLocation(locationOptions[0].id));
    }
  }, [locationOptions, genLocation]);
  const activeLocationId = locationOptions.some((o) => o.id === genLocation) ? genLocation : defaultLocationId;

  // Schedules are keyed by LOCATION ONLY. Professions ("what I do") are profile info,
  // never tied to when/where — the specific service is coordinated at contact/booking.
  // New weekly/exception rows write category_id = null; legacy profession-tagged rows
  // are matched by location (any category) and migrate to null as the pro edits.
  const sameLoc = useCallback((loc: string) => loc === activeLocationId, [activeLocationId]);

  function locationLabel(id: string): string {
    if (id === VIDEO_LOCATION_ID) return t("videoconsulta");
    return locationOptions.find((o) => o.id === id)?.label ?? t("locationFallback");
  }

  // ── Overlap guard: a pro can't be available in two places at the same time ──
  // The minute-ranges a location is actually OPEN on a concrete DATE, applying the
  // SAME precedence as materialization (closed → none; a `custom` exception REPLACES
  // the weekly hours; `extra` ADDS to them). Used to compare a proposed schedule
  // against every OTHER location on the affected day(s).
  const rangesForLocOnDate = useCallback((loc: string, date: string, wk: WeeklyRow[], exc: ExcRow[]): [number, number][] => {
    const wd = weekdayOf(date);
    const dayExc = exc.filter((e) => e.location_id === loc && e.date === date);
    if (dayExc.some((e) => e.mode === "closed")) return [];
    const custom = dayExc.filter((e) => e.mode === "custom" && e.start && e.end);
    const extra = dayExc.filter((e) => e.mode === "extra" && e.start && e.end);
    const base: [number, number][] = custom.length > 0
      ? custom.map((e) => [toMins(e.start!), toMins(e.end!)])
      : wk.filter((r) => r.location_id === loc && r.weekday === wd && isCompleteFranja(r)).map((r) => [toMins(r.start), toMins(r.end)]);
    return [...base, ...extra.map((e) => [toMins(e.start!), toMins(e.end!)] as [number, number])];
  }, []);

  // Validate a PROPOSED set of franjas (minute-ranges) placed at `loc`, BEFORE writing.
  // `scope` is a recurring weekday (check every future date that lands on it) or a
  // single exception date. `ownBase` are this location's OTHER ranges the proposal must
  // also clear (e.g. the weekly hours when adding `extra` on the same location/day) —
  // `ownBaseBody` is the message to show when the proposal overlaps that base (defaults
  // to the generic self-overlap copy; `extra` passes a "overlaps your usual hours" one).
  // Returns a localized conflict {title, body, kind} to block with, or null when it's safe.
  function findOverlapConflict(
    loc: string,
    proposed: [number, number][],
    scope: { weekday: number } | { date: string },
    ownBase: [number, number][] = [],
    ownBaseBody: string = t("conflictSelf")
  ): { title: string; body: string; kind?: "location" | "time" } | null {
    // 1) SAME-LOCATION: proposed franjas must not overlap each other or the own base.
    for (let i = 0; i < proposed.length; i++) {
      for (let j = i + 1; j < proposed.length; j++) {
        if (rangesOverlap(proposed[i][0], proposed[i][1], proposed[j][0], proposed[j][1])) {
          return { title: t("conflictTitle"), body: t("conflictSelf"), kind: "time" };
        }
      }
      for (const b of ownBase) {
        if (rangesOverlap(proposed[i][0], proposed[i][1], b[0], b[1])) {
          return { title: t("conflictTitle"), body: ownBaseBody, kind: "time" };
        }
      }
    }
    // 2) CROSS-LOCATION: proposed must not overlap any OTHER location on the same day.
    const otherLocs = [...new Set([...weekly, ...exceptions].map((r) => r.location_id))]
      .filter((l) => l && l !== loc && !sharesTimeWithVideo(l, loc));
    const dates: string[] = "date" in scope
      ? [scope.date]
      : (() => {
          const out: string[] = [];
          const start = todayISO();
          for (let i = 0; i <= HORIZON_DAYS; i++) { const d = addDaysISO(start, i); if (weekdayOf(d) === scope.weekday) out.push(d); }
          return out;
        })();
    for (const date of dates) {
      for (const other of otherLocs) {
        const ranges = rangesForLocOnDate(other, date, weekly, exceptions);
        for (const p of proposed) {
          for (const r of ranges) {
            if (rangesOverlap(p[0], p[1], r[0], r[1])) {
              // Name the EXACT occupied range + place, and suggest a start AFTER it so
              // the pro knows how to adjust (consecutive is allowed).
              return {
                title: t("conflictCrossTitle"),
                kind: "location",
                body: t("conflictCross", {
                  place: locationLabel(other),
                  start: to12h(hhmm(r[0])),
                  end: to12h(hhmm(r[1])),
                }),
              };
            }
          }
        }
      }
    }
    return null;
  }

  // ── "Already occupied elsewhere" guidance (DATE; used by the "Cambiar un día"
  // modal) — other locations' occupied ranges on a specific DATE, applying the full
  // closed/custom/extra precedence via rangesForLocOnDate. (The weekly view no longer
  // needs a per-weekday hint — every location's blocks are shown together.)
  function otherOccupiedForDate(date: string): { label: string; ranges: [number, number][] }[] {
    const otherLocs = [...new Set([...weekly, ...exceptions].map((r) => r.location_id))]
      .filter((l) => l && l !== activeLocationId && !sharesTimeWithVideo(l, activeLocationId));
    return otherLocs
      .map((loc) => ({ label: locationLabel(loc), ranges: mergeRanges(rangesForLocOnDate(loc, date, weekly, exceptions)) }))
      .filter((o) => o.ranges.length > 0);
  }

  // Render a location's occupied ranges as "8:00 AM–3:00 PM, 5:00 PM–7:00 PM".
  function fmtRanges(ranges: [number, number][]): string {
    return ranges.map(([s, e]) => `${to12h(hhmm(s))} – ${to12h(hhmm(e))}`).join(", ");
  }

  // ── MATERIALIZE the template + exceptions into concrete slots ──────────────
  // Keyed by LOCATION (not profession): availability_slots can publish the same
  // pro+date+time for videoconsulta + one physical place. Bookings remain unique by
  // pro+date+time, so one reservation blocks both visible options.
  const computeDesiredSlots = useCallback((wk: WeeklyRow[], exc: ExcRow[]) => {
    const start = todayISO();
    const locs = new Set<string>();
    // weekly franjas keyed by `${loc}|${weekday}`
    const weeklyByKey = new Map<string, { start: string; end: string; dur: number }[]>();
    for (const r of wk) {
      if (!schedulableLocationIds.has(r.location_id)) continue;
      if (!isCompleteFranja(r)) continue; // skip INCOMPLETE drafts (just-enabled, empty fields)
      locs.add(r.location_id);
      const k = `${r.location_id}|${r.weekday}`;
      const arr = weeklyByKey.get(k) ?? [];
      arr.push({ start: r.start, end: r.end, dur: r.slot_minutes });
      weeklyByKey.set(k, arr);
    }
    // exceptions keyed by `${loc}|${date}`
    const excByKey = new Map<string, { closed: boolean; custom: { start: string; end: string; dur: number }[]; extra: { start: string; end: string; dur: number }[] }>();
    for (const e of exc) {
      if (!schedulableLocationIds.has(e.location_id)) continue;
      locs.add(e.location_id);
      const k = `${e.location_id}|${e.date}`;
      const cur = excByKey.get(k) ?? { closed: false, custom: [], extra: [] };
      if (e.mode === "closed") cur.closed = true;
      else if (e.start && e.end) (e.mode === "custom" ? cur.custom : cur.extra).push({ start: e.start, end: e.end, dur: e.slot_minutes });
      excByKey.set(k, cur);
    }

    const seen = new Set<string>(); // date|time|location
    const out: { date: string; time: string; location_id: string; category_id: string | null }[] = [];
    for (let i = 0; i <= HORIZON_DAYS; i++) {
      const date = addDaysISO(start, i);
      const wd = weekdayOf(date);
      for (const loc of locs) {
        const exDay = excByKey.get(`${loc}|${date}`);
        if (exDay?.closed) continue;
        const base = exDay?.custom.length ? exDay.custom : (weeklyByKey.get(`${loc}|${wd}`) ?? []);
        const franjas = [...base, ...(exDay?.extra ?? [])];
        for (const f of franjas) {
          const dur = Math.max(5, f.dur || 60);
          const s = toMins(f.start), e = toMins(f.end);
          if (e <= s) continue;
          const times: string[] = [];
          for (let m = s; m + dur <= e; m += dur) times.push(hhmm(m));
          if (times.length === 0) times.push(hhmm(s)); // a configured franja always yields ≥1 time
          for (const time of times) {
            if (isTooSoonCR(date, time)) continue;
            const key = `${date}|${time}|${loc}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ date, time, location_id: loc, category_id: null });
          }
        }
      }
    }
    return out;
  }, [schedulableLocationIds]);

  const regenerate = useCallback(async (wk: WeeklyRow[], exc: ExcRow[]): Promise<boolean> => {
    setBusy(true);
    try {
      const supabase = createClient();
      const desired = computeDesiredSlots(wk, exc);
      // Rewrite the rolling window: drop future slots, insert the freshly materialized set.
      // (Bookings reference scheduled_date/time, not slot ids, so this never breaks one.)
      const { error: deleteError } = await supabase.from("availability_slots").delete().eq("professional_id", professionalId).gte("slot_date", todayISO());
      if (deleteError) throw deleteError;
      if (desired.length > 0) {
        const rows = desired.map((d) => ({ professional_id: professionalId, slot_date: d.date, slot_time: d.time, location_id: d.location_id, category_id: d.category_id }));
        for (let i = 0; i < rows.length; i += 500) {
          let { error } = await supabase.from("availability_slots").insert(rows.slice(i, i + 500));
          if (error && /location_id|category_id|column/i.test(error.message)) {
            ({ error } = await supabase.from("availability_slots").insert(rows.slice(i, i + 500).map((r) => ({ professional_id: r.professional_id, slot_date: r.slot_date, slot_time: r.slot_time }))));
          }
          if (error) throw error;
        }
      }
      pulseSaved();
      onSaved?.();
      return true;
    } catch (error) {
      reportSaveFailure("materialize failed", error);
      return false;
    } finally {
      setBusy(false);
    }
  }, [professionalId, computeDesiredSlots, onSaved, reportSaveFailure]);

  // ── Initial load: read the template + exceptions; top up the slot window once. ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [{ data: wk }, { data: exc }] = await Promise.all([
        supabase.from("availability_weekly").select("id, location_id, category_id, weekday, start_time, end_time, slot_minutes").eq("professional_id", professionalId),
        supabase.from("availability_exceptions").select("id, location_id, category_id, exception_date, mode, start_time, end_time, slot_minutes").eq("professional_id", professionalId),
      ]);
      if (cancelled) return;
      const allWeeklyRows: WeeklyRow[] = (wk ?? [])
        .map((r) => ({ id: r.id, location_id: r.location_id ?? "", category_id: r.category_id ?? null, weekday: r.weekday, start: String(r.start_time).slice(0, 5), end: String(r.end_time).slice(0, 5), slot_minutes: r.slot_minutes ?? 60 }));
      const allExceptionRows: ExcRow[] = (exc ?? [])
        .map((r) => ({ id: r.id, location_id: r.location_id ?? "", category_id: r.category_id ?? null, date: r.exception_date, mode: r.mode as ExcMode, start: r.start_time ? String(r.start_time).slice(0, 5) : null, end: r.end_time ? String(r.end_time).slice(0, 5) : null, slot_minutes: r.slot_minutes ?? 60 }));
      const wkRows = allWeeklyRows.filter((r) => schedulableLocationIds.has(r.location_id));
      const excRows = allExceptionRows.filter((r) => schedulableLocationIds.has(r.location_id));
      const staleWeeklyIds = allWeeklyRows.filter((r) => r.id && !schedulableLocationIds.has(r.location_id)).map((r) => r.id!);
      const staleExceptionIds = allExceptionRows.filter((r) => r.id && !schedulableLocationIds.has(r.location_id)).map((r) => r.id!);
      if (staleWeeklyIds.length > 0 || staleExceptionIds.length > 0) {
        await Promise.all([
          staleWeeklyIds.length > 0 ? supabase.from("availability_weekly").delete().in("id", staleWeeklyIds) : Promise.resolve({ error: null }),
          staleExceptionIds.length > 0 ? supabase.from("availability_exceptions").delete().in("id", staleExceptionIds) : Promise.resolve({ error: null }),
        ]);
      }
      setWeekly(wkRows);
      setExceptions(excRows);
      setDurationPref(wkRows[0]?.slot_minutes ?? excRows[0]?.slot_minutes ?? 60);
      setLoading(false);
      // Refresh the materialized window from the template (keeps the rolling 70-day
      // horizon current). Skip when there is NO template at all, so a legacy pro's
      // manually-created slots are preserved until they adopt the weekly editor.
      if (isPublic && (wkRows.length > 0 || excRows.length > 0 || staleWeeklyIds.length > 0 || staleExceptionIds.length > 0)) void regenerate(wkRows, excRows);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professionalId]);

  // ── Unified per-day blocks (ALL locations together) ───────────────────────
  // The appointment length is one global value applied to every block.
  const activeDuration = durationPref;

  // Every weekday → ALL its blocks across ALL locations (each carries its location).
  const dayBlocks = useMemo(() => {
    const map = new Map<number, Block[]>();
    for (const r of weekly) {
      if (r.location_id !== activeLocationId) continue;
      const arr = map.get(r.weekday) ?? [];
      arr.push({ id: r.id ?? genId(), locationId: r.location_id, start: r.start, end: r.end });
      map.set(r.weekday, arr);
    }
    // Sort by start, then location; empty drafts (just-added, no time) go LAST.
    for (const arr of map.values()) arr.sort((a, b) => (!a.start ? 1 : !b.start ? -1 : a.start.localeCompare(b.start) || a.locationId.localeCompare(b.locationId)));
    return map;
  }, [weekly, activeLocationId]);
  const blocksFor = (weekday: number): Block[] => dayBlocks.get(weekday) ?? [];

  const activeExceptions = useMemo(() => {
    const byDate = new Map<string, ExcRow[]>();
    for (const e of exceptions) {
      if (!sameLoc(e.location_id)) continue;
      const arr = byDate.get(e.date) ?? [];
      arr.push(e);
      byDate.set(e.date, arr);
    }
    return Array.from(byDate.entries())
      .filter(([d]) => d >= todayISO())
      .sort(([a], [b]) => a.localeCompare(b));
  }, [exceptions, sameLoc]);

  // ── Overlap validation for the UNIFIED day (ALL locations together) ─────────
  // The rule is unchanged (a pro can't be in two places at once), just expressed over
  // every block of the weekday: on each future date of that weekday, NO two effective
  // open ranges (any location, exception-aware via `rangesForLocOnDate`) may overlap.
  // Touching/consecutive ranges are allowed (half-open `rangesOverlap`).
  function validateDayBlocks(weekday: number, complete: Block[], targetLocationId: string = activeLocationId): { title: string; body: string; kind?: "location" | "time" } | null {
    const hypo: WeeklyRow[] = [
      ...weekly.filter((r) => !(r.weekday === weekday && r.location_id === targetLocationId)),
      ...complete.map((b) => ({ location_id: b.locationId, category_id: null, weekday, start: b.start, end: b.end, slot_minutes: durationPref })),
    ];
    const start = todayISO();
    for (let i = 0; i <= HORIZON_DAYS; i++) {
      const date = addDaysISO(start, i);
      if (weekdayOf(date) !== weekday) continue;
      const locs = [...new Set([...hypo, ...exceptions].map((r) => r.location_id))].filter(Boolean);
      const flat: { loc: string; r: [number, number] }[] = [];
      for (const currentLocationId of locs) {
        for (const r of rangesForLocOnDate(currentLocationId, date, hypo, exceptions)) {
          flat.push({ loc: currentLocationId, r });
        }
      }
      for (let a = 0; a < flat.length; a++) for (let b = a + 1; b < flat.length; b++) {
        if (sharesTimeWithVideo(flat[a].loc, flat[b].loc)) continue;
        if (rangesOverlap(flat[a].r[0], flat[a].r[1], flat[b].r[0], flat[b].r[1])) {
          const occupied = flat[a].loc === targetLocationId ? flat[b] : flat[b].loc === targetLocationId ? flat[a] : flat[a];
          return flat[a].loc === flat[b].loc
            ? { title: t("conflictTitle"), body: t("conflictSelf"), kind: "time" }
            : {
              title: t("conflictCrossTitle"),
              body: t("conflictCross", {
                place: locationLabel(occupied.loc),
                start: to12h(hhmm(occupied.r[0])),
                end: to12h(hhmm(occupied.r[1])),
              }),
              kind: "location",
            };
        }
      }
    }
    return null;
  }

  // A new block's SMART default: 8 AM–5 PM when it wouldn't conflict with the day's
  // other blocks, else EMPTY (so the pro freely picks a non-conflicting time).
  function smartDefaultBlock(weekday: number, existing: Block[], loc: string): Block {
    const probe = validateDayBlocks(weekday, [...existing.filter(isCompleteFranja), { id: "_probe", locationId: loc, start: "08:00", end: "17:00" }], loc);
    return probe ? { id: genId(), locationId: loc, start: "", end: "" } : { id: genId(), locationId: loc, start: "08:00", end: "17:00" };
  }

  // ── Persist ALL of a weekday's blocks (every location) at once, then re-materialize. ──
  // Backend model unchanged: each COMPLETE block writes its own `availability_weekly`
  // row (category_id null → absorbs legacy). INCOMPLETE drafts stay in LOCAL state so
  // the row shows, but are NOT validated/written/materialized.
  async function persistDay(weekday: number, blocks: Block[], loc: string = activeLocationId) {
    const complete = blocks.filter(isCompleteFranja);
    const c = validateDayBlocks(weekday, complete, loc);
    if (c) { setConflict(c); return; }
    if (scheduleSaveInFlightRef.current) return;
    scheduleSaveInFlightRef.current = true;

    const next = weekly.filter((r) => !(r.weekday === weekday && r.location_id === loc));
    for (const b of blocks) next.push({ location_id: b.locationId, category_id: null, weekday, start: b.start, end: b.end, slot_minutes: durationPref });
    const supabase = createClient();
    const previousWeekly = weekly;
    setWeekly(next);
    setBusy(true);
    try {
      const { error: deleteError } = await supabase.from("availability_weekly").delete().eq("professional_id", professionalId).eq("weekday", weekday).eq("location_id", loc);
      if (deleteError) throw deleteError;
      if (complete.length > 0) {
        const { error: insertError } = await supabase.from("availability_weekly").insert(complete.map((b) => ({ professional_id: professionalId, location_id: b.locationId, category_id: null, weekday, start_time: b.start, end_time: b.end, slot_minutes: durationPref })));
        if (insertError) throw insertError;
      }
      await regenerate(next, exceptions); // skips incomplete drafts
    } catch (error) {
      setWeekly(previousWeekly);
      reportSaveFailure("weekly save failed", error);
      setBusy(false);
    } finally {
      scheduleSaveInFlightRef.current = false;
    }
  }

  function toggleDay(weekday: number) {
    const cur = blocksFor(weekday);
    if (cur.length > 0) { persistDay(weekday, [], activeLocationId); return; }
    persistDay(weekday, [smartDefaultBlock(weekday, [], activeLocationId)], activeLocationId);
  }
  function addBlock(weekday: number) {
    const cur = blocksFor(weekday);
    persistDay(weekday, [...cur, smartDefaultBlock(weekday, cur, activeLocationId)], activeLocationId);
  }
  function updateBlock(weekday: number, id: string, patch: Partial<Block>) {
    persistDay(weekday, blocksFor(weekday).map((b) => (b.id === id ? { ...b, ...patch, locationId: activeLocationId } : b)), activeLocationId);
  }
  // Copy one configured day's complete ranges to selected destination days.
  async function applyDayToTargets(sourceWeekday: number, targetWeekdays: number[]) {
    if (scheduleSaveInFlightRef.current) return;
    const targets = targetWeekdays.filter((wd) => wd !== sourceWeekday);
    if (targets.length === 0) return;

    const template = blocksFor(sourceWeekday)
      .filter(isCompleteFranja)
      .map((b) => ({ locationId: activeLocationId, start: b.start, end: b.end }));
    if (template.length === 0) return;

    for (const wd of targets) {
      const c = validateDayBlocks(wd, template.map((s) => ({ id: genId(), ...s })), activeLocationId);
      if (c) { setConflict(c); return; }
    }

    const next = weekly.filter((r) => !(targets.includes(r.weekday) && r.location_id === activeLocationId));
    for (const wd of targets) {
      for (const s of template) {
        next.push({ location_id: s.locationId, category_id: null, weekday: wd, start: s.start, end: s.end, slot_minutes: durationPref });
      }
    }

    const supabase = createClient();
    scheduleSaveInFlightRef.current = true;
    setBusy(true);
    try {
      const { error: deleteError } = await supabase.from("availability_weekly").delete().eq("professional_id", professionalId).in("weekday", targets).eq("location_id", activeLocationId);
      if (deleteError) throw deleteError;
      const { error: insertError } = await supabase.from("availability_weekly").insert(
        targets.flatMap((wd) =>
          template.map((s) => ({
            professional_id: professionalId,
            location_id: s.locationId,
            category_id: null,
            weekday: wd,
            start_time: s.start,
            end_time: s.end,
            slot_minutes: durationPref,
          }))
        )
      );
      if (insertError) throw insertError;
      setWeekly(next);
      const ok = await regenerate(next, exceptions);
      if (ok) setApplyModal(null);
    } catch (error) {
      reportSaveFailure("copy day failed", error);
      setBusy(false);
    } finally {
      scheduleSaveInFlightRef.current = false;
    }
  }

  async function setDuration(dur: number) {
    if (scheduleSaveInFlightRef.current) return;
    scheduleSaveInFlightRef.current = true;
    const next = weekly.map((r) => ({ ...r, slot_minutes: dur }));
    const supabase = createClient();
    setBusy(true);
    try {
      const { error } = await supabase.from("availability_weekly").update({ slot_minutes: dur }).eq("professional_id", professionalId);
      if (error) throw error;
      setDurationPref(dur);
      setWeekly(next);
      await regenerate(next, exceptions);
    } catch (error) {
      reportSaveFailure("duration save failed", error);
      setBusy(false);
    } finally {
      scheduleSaveInFlightRef.current = false;
    }
  }

  // ── Exceptions ("¿Un día distinto?") ──────────────────────────────────────
  // Returns false (without writing) when the proposed hours overlap another location
  // — or this location's own weekly hours when ADDING extra — on that date.
  async function saveException(date: string, mode: ExcMode, franjas: Franja[], dur: number): Promise<boolean> {
    if (scheduleSaveInFlightRef.current) return false;
    if (mode !== "closed") {
      const proposed = franjas.map((f) => [toMins(f.start), toMins(f.end)] as [number, number]).filter(([s, e]) => e > s);
      // `extra` ADDS to the weekly hours (they still apply that date), so the extra
      // franjas must not overlap THIS location's weekly base for that weekday — block
      // with a message that names the real conflict (the usual hours). `custom`/`closed`
      // REPLACE the weekly hours, so they get no weekly base to clear (only the
      // cross-location check below applies).
      const ownBase: [number, number][] = mode === "extra"
        ? weekly.filter((r) => r.location_id === activeLocationId && r.weekday === weekdayOf(date) && isCompleteFranja(r)).map((r) => [toMins(r.start), toMins(r.end)])
        : [];
      const c = findOverlapConflict(activeLocationId, proposed, { date }, ownBase, t("conflictExtraWeekly"));
      if (c) { setConflict(c); return false; }
    }

    const next = exceptions.filter((e) => !(sameLoc(e.location_id) && e.date === date));
    if (mode === "closed") {
      next.push({ location_id: activeLocationId, category_id: null, date, mode: "closed", start: null, end: null, slot_minutes: dur });
    } else {
      for (const f of franjas) next.push({ location_id: activeLocationId, category_id: null, date, mode, start: f.start, end: f.end, slot_minutes: dur });
    }
    const supabase = createClient();
    scheduleSaveInFlightRef.current = true;
    setBusy(true);
    try {
      const { error: deleteError } = await supabase.from("availability_exceptions").delete().eq("professional_id", professionalId).eq("location_id", activeLocationId).eq("exception_date", date);
      if (deleteError) throw deleteError;
      const rows: { professional_id: string; location_id: string; category_id: string | null; exception_date: string; mode: ExcMode; start_time: string | null; end_time: string | null; slot_minutes: number }[] =
        mode === "closed"
          ? [{ professional_id: professionalId, location_id: activeLocationId, category_id: null, exception_date: date, mode, start_time: null, end_time: null, slot_minutes: dur }]
          : franjas.map((f) => ({ professional_id: professionalId, location_id: activeLocationId, category_id: null, exception_date: date, mode, start_time: f.start, end_time: f.end, slot_minutes: dur }));
      if (rows.length > 0) {
        const { error: insertError } = await supabase.from("availability_exceptions").insert(rows);
        if (insertError) throw insertError;
      }
      setExceptions(next);
      const ok = await regenerate(weekly, next);
      return ok;
    } catch (error) {
      reportSaveFailure("exception save failed", error);
      setBusy(false);
      return false;
    } finally {
      scheduleSaveInFlightRef.current = false;
    }
  }

  async function removeException(date: string) {
    if (scheduleSaveInFlightRef.current) return;
    scheduleSaveInFlightRef.current = true;
    const next = exceptions.filter((e) => !(sameLoc(e.location_id) && e.date === date));
    const supabase = createClient();
    setBusy(true);
    try {
      const { error } = await supabase.from("availability_exceptions").delete().eq("professional_id", professionalId).eq("location_id", activeLocationId).eq("exception_date", date);
      if (error) throw error;
      setExceptions(next);
      await regenerate(weekly, next);
    } catch (error) {
      reportSaveFailure("exception remove failed", error);
      setBusy(false);
    } finally {
      scheduleSaveInFlightRef.current = false;
    }
  }

  // ── Visibility (privada) ──────────────────────────────────────────────────
  function toggleVisibility() {
    if (isPublic) { setShowPrivateConfirm(true); return; }
    makePublic();
  }
  async function makePublic() {
    setIsPublic(true);
    setSavingVisibility(true);
    const supabase = createClient();
    await supabase.from("professionals").update({ availability_public: true, contact_preference: "ambas" }).eq("id", professionalId);
    setSavingVisibility(false);
    // Re-publish the schedule from the kept template.
    await regenerate(weekly, exceptions);
  }
  async function confirmMakePrivate() {
    setSavingVisibility(true);
    const supabase = createClient();
    // Hide the agenda: remove the published slots but KEEP the weekly template +
    // exceptions, so turning public again restores everything.
    await supabase.from("availability_slots").delete().eq("professional_id", professionalId);
    await supabase.from("professionals").update({ availability_public: false, contact_preference: "solo_whatsapp" }).eq("id", professionalId);
    setSavingVisibility(false);
    setShowPrivateConfirm(false);
    setIsPublic(false);
    pulseSaved();
    onSaved?.();
  }
  async function toggleVideoConsultation() {
    const next = !isVideoConsultation;
    setIsVideoConsultation(next);
    setSavingVideoConsultation(true);
    const supabase = createClient();
    const update = next
      ? { videoconsulta: true, coverage_country: true, coverage_areas: [{ level: "country" }] }
      : { videoconsulta: false, coverage_country: false, coverage_areas: [] };
    const { error } = await supabase.from("professionals").update(update).eq("id", professionalId);
    if (error) {
      console.error("[availability] video consultation update failed:", error);
      setIsVideoConsultation(!next);
    } else {
      if (!next) {
        const nextWeekly = weekly.filter((r) => r.location_id !== VIDEO_LOCATION_ID);
        const nextExceptions = exceptions.filter((r) => r.location_id !== VIDEO_LOCATION_ID);
        setWeekly(nextWeekly);
        setExceptions(nextExceptions);
        await supabase.from("availability_weekly").delete().eq("professional_id", professionalId).eq("location_id", VIDEO_LOCATION_ID);
        await supabase.from("availability_exceptions").delete().eq("professional_id", professionalId).eq("location_id", VIDEO_LOCATION_ID);
        await supabase.from("availability_slots").delete().eq("professional_id", professionalId).eq("location_id", VIDEO_LOCATION_ID);
      }
      pulseSaved();
      onSaved?.();
    }
    setSavingVideoConsultation(false);
  }
  useEffect(() => {
    if (!showPrivateConfirm) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowPrivateConfirm(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showPrivateConfirm]);
  useEffect(() => {
    if (!conflict) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setConflict(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [conflict]);

  // "Cambiar un día" modal
  const [applyModal, setApplyModal] = useState<{ weekday: number } | null>(null);
  const [dayModal, setDayModal] = useState<{ date: string } | null>(null);

  const openWeekdays = WEEKDAY_ORDER.filter((wd) => blocksFor(wd).length > 0);
  const closedWeekdays = WEEKDAY_ORDER.filter((wd) => blocksFor(wd).length === 0);
  const hasSchedulableLocation = locationOptions.length > 0;
  const scheduleControlsDisabled = busy || savingVisibility || savingVideoConsultation;

  // App-wide autosave: report status to the section title row (inline, no layout shift).
  useReportSaveStatus(savingVisibility || savingVideoConsultation || busy, justSaved);

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">

      {/* ── Disponibilidad privada ─────────────────────────────────────────── */}
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4 rounded-xl bg-[#f9fafb] p-3.5">
          <div className="flex min-w-0 items-center gap-3">
            {/* Blue padlock — signals this controls PRIVATE availability. */}
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EBF5FB] text-[#009FD9]">
              <Lock className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#111827]">{t("privateLabel")}</p>
              <p className="mt-0.5 text-xs text-[#6b7280]">
                {isPublic && !hasSchedulableLocation ? t("privateSubNeedsWorkplace") : isPublic ? t("privateSubPublic") : t("privateSubPrivate")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {savingVisibility && <Loader2 className="h-4 w-4 animate-spin text-[#009FD9]" />}
            <button
              type="button"
              onClick={toggleVisibility}
              disabled={savingVisibility}
              className={cn("relative h-6 w-11 rounded-full transition-all duration-200 shrink-0 cursor-pointer", !isPublic ? "bg-[#009FD9]" : "bg-[#d1d5db]")}
              aria-label={isPublic ? t("makePrivate") : t("makePublic")}
            >
              <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200", !isPublic ? "left-5" : "left-0.5")} />
            </button>
          </div>
        </div>
      </div>

      {videoConsultationAllowed && (
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <div className="flex items-center justify-between gap-4 rounded-xl bg-[#f9fafb] p-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EBF5FB] text-[#009FD9]">
                <Video className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#111827]">{t("videoLabel")}</p>
                <p className="mt-0.5 text-xs text-[#6b7280]">{t("videoDesc")}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {savingVideoConsultation && <Loader2 className="h-4 w-4 animate-spin text-[#009FD9]" />}
              <button
                type="button"
                onClick={toggleVideoConsultation}
                disabled={savingVideoConsultation}
                className={cn("relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-all duration-200", isVideoConsultation ? "bg-[#009FD9]" : "bg-[#d1d5db]")}
                aria-label={t("videoLabel")}
              >
                <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200", isVideoConsultation ? "left-5" : "left-0.5")} />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-[#f3f4f6]">
      {loading ? (
        <div className="p-4 sm:p-5">
          <FormLoadingState minHeight="min-h-[300px]" />
        </div>
      ) : !isPublic ? null : !hasSchedulableLocation ? (
        <div className="m-4 rounded-2xl border border-[#bfe3f5] bg-[#f8fbfe] p-4 sm:m-5 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EBF5FB] text-[#009FD9]">
                <MapPin className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#162543]">{t("needLocationTitle")}</p>
                <p className="mt-1 max-w-2xl text-sm leading-5 text-[#526071]">{t("needLocationBody")}</p>
              </div>
            </div>
            <Link
              href="/dashboard/profesional?tab=profile&mode=offer&focus=location"
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#009FD9] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0089bb] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:ring-offset-2"
            >
              <MapPin className="h-4 w-4" />
              {t("needLocationAction")}
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div>
            <div className="grid gap-5 p-4 sm:grid-cols-2 sm:p-5">
              <div>
                <label className="mb-2 block text-xs font-semibold text-[#6b7280]">{t("apptDuration")}</label>
                <div className="w-full sm:max-w-[12rem]">
                  <SelectMenu
                    value={String(activeDuration)}
                    onChange={(v) => setDuration(Number(v))}
                    options={DURATION_OPTIONS.map((d) => ({ value: String(d), label: t(`dur${d}` as `dur${number}`) }))}
                    disabled={scheduleControlsDisabled}
                    className="[&>button]:h-10 [&>button]:rounded-xl [&>button]:pl-3 [&>button]:text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold text-[#6b7280]">{t("scheduleForLabel")}</label>
                {isMultiLocation ? (
                  <SelectMenu
                      value={activeLocationId}
                      onChange={setGenLocation}
                      options={locationOptions.map((option) => ({ value: option.id, label: option.label }))}
                      disabled={scheduleControlsDisabled}
                      className="[&>button]:h-10 [&>button]:rounded-xl [&>button]:pl-3 [&>button]:text-sm"
                    />
                ) : (
                  <div className="flex h-11 items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-3 text-sm font-medium text-[#111827]">
                    <MapPin className="h-4 w-4 shrink-0 text-[#009FD9]" />
                    <span className="min-w-0 truncate">{locationLabel(activeLocationId)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="border-b border-[#f3f4f6] px-4 py-3 sm:px-5">
              <p className="text-xs leading-5 text-[#6b7280]">
                {t("alwaysSubAll")}
              </p>
            </div>

            <div className="hidden grid-cols-[6.25rem_5.75rem_minmax(12rem,1fr)_6.75rem] border-b border-[#f3f4f6] px-5 py-3 text-xs font-semibold text-[#6b7280] lg:grid">
              <span>{t("date")}</span>
              <span>{t("availableColumn")}</span>
              <span className="text-center">{t("scheduleColumn")}</span>
              <span className="text-center">{t("actionsColumn")}</span>
            </div>

            <div className="flex flex-col divide-y divide-[#f3f4f6] lg:divide-y">
              {openWeekdays.map((wd) => {
                const blocks = blocksFor(wd);
                const on = blocks.length > 0;
                const canApply = blocks.some(isCompleteFranja);
                const dayActions = (
                  <div className="flex min-h-9 min-w-0 flex-row flex-wrap items-center justify-start gap-x-3 gap-y-1 lg:shrink-0 lg:flex-nowrap">
                    <button type="button" onClick={() => addBlock(wd)} disabled={scheduleControlsDisabled} className="inline-flex h-9 min-w-0 shrink-0 items-center whitespace-nowrap text-left text-xs font-medium leading-tight text-[#009FD9] hover:underline cursor-pointer disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:no-underline">
                      {t("addFranja")}
                    </button>
                  </div>
                );
                return (
                  <div key={wd} className="min-w-0 px-4 py-4 lg:grid lg:grid-cols-[6.25rem_5.75rem_minmax(12rem,1fr)_6.75rem] lg:items-start lg:gap-3 lg:px-5">
                    <div className="flex min-w-0 items-center justify-between gap-3 lg:block">
                      <span className="min-w-0 text-sm font-semibold text-[#111827]">{t(`weekday${wd}` as `weekday${number}`)}</span>
                      <button
                        type="button"
                        onClick={() => toggleDay(wd)}
                        disabled={scheduleControlsDisabled}
                        className={cn("relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-55 lg:hidden", on ? "bg-[#009FD9]" : "bg-[#d1d5db]")}
                        aria-label={t(`weekday${wd}` as `weekday${number}`)}
                        aria-pressed={on}
                      >
                        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200", on ? "left-5" : "left-0.5")} />
                      </button>
                    </div>

                    <div className="hidden min-w-0 items-center lg:flex">
                      <button
                        type="button"
                        onClick={() => toggleDay(wd)}
                        disabled={scheduleControlsDisabled}
                        className={cn("relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-55", on ? "bg-[#009FD9]" : "bg-[#d1d5db]")}
                        aria-label={t(`weekday${wd}` as `weekday${number}`)}
                        aria-pressed={on}
                      >
                        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200", on ? "left-5" : "left-0.5")} />
                      </button>
                    </div>

                    <div className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 lg:mt-0 lg:contents">
                      <div className="min-w-0 lg:flex lg:justify-center">
                        <div className="flex min-w-0 flex-col gap-2">
                          {blocks.map((b) => (
                            <div key={b.id} className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 md:w-[19rem] md:shrink-0 lg:w-[13.75rem] lg:grid-cols-[minmax(5.875rem,1fr)_auto_minmax(5.875rem,1fr)]">
                              <TimeSelect value={b.start} step={activeDuration} disabled={scheduleControlsDisabled} onChange={(v) => updateBlock(wd, b.id, { start: v, ...(b.end && toMins(b.end) <= toMins(v) ? { end: hhmm(Math.min(toMins(v) + activeDuration, 23 * 60 + 30)) } : {}) })} className="min-w-0 w-full [&>button]:h-8 [&>button]:rounded-md [&>button]:pl-2.5 [&>button]:pr-7 [&>button]:text-[12px] sm:[&>button]:h-9 sm:[&>button]:rounded-lg sm:[&>button]:pl-3 sm:[&>button]:pr-10 sm:[&>button]:text-[13px] [&_svg]:right-2 sm:[&_svg]:right-3" />
                              <span className="mt-1.5 shrink-0 text-xs text-[#9ca3af] sm:mt-2 sm:text-sm">-</span>
                              <TimeSelect value={b.end} step={activeDuration} min={b.start ? hhmm(Math.min(toMins(b.start) + activeDuration, 23 * 60 + 30)) : undefined} disabled={scheduleControlsDisabled} onChange={(v) => updateBlock(wd, b.id, { end: v })} className="min-w-0 w-full [&>button]:h-8 [&>button]:rounded-md [&>button]:pl-2.5 [&>button]:pr-7 [&>button]:text-[12px] sm:[&>button]:h-9 sm:[&>button]:rounded-lg sm:[&>button]:pl-3 sm:[&>button]:pr-10 sm:[&>button]:text-[13px] [&_svg]:right-2 sm:[&_svg]:right-3" error={b.start && b.end && toMins(b.end) <= toMins(b.start) ? t("toAfterFrom") : undefined} />
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex min-w-0 items-start justify-end gap-1 lg:hidden">
                        <button type="button" onClick={() => addBlock(wd)} disabled={scheduleControlsDisabled} className="inline-flex h-8 min-w-0 shrink-0 items-center whitespace-nowrap text-xs font-semibold leading-none text-[#009FD9] hover:underline cursor-pointer disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:no-underline">
                          {t("addFranja")}
                        </button>
                        <button type="button" onClick={() => canApply && setApplyModal({ weekday: wd })} disabled={!canApply || scheduleControlsDisabled} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827] disabled:opacity-35" aria-label={t("applyToOtherDays")}>
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="hidden min-w-0 items-center justify-center gap-2 lg:flex">
                      {dayActions}
                      <button type="button" onClick={() => canApply && setApplyModal({ weekday: wd })} disabled={!canApply || scheduleControlsDisabled} className="flex h-9 w-9 items-center justify-center rounded-lg text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827] disabled:opacity-35" aria-label={t("applyToOtherDays")}>
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {closedWeekdays.length > 0 && (
                <div className="px-4 py-4 lg:px-5">
                  <button type="button" onClick={() => setShowClosedDays((v) => !v)} className="flex w-full items-center gap-2 text-left">
                    <ChevronDown className={cn("h-4 w-4 text-[#374151] transition-transform", showClosedDays && "rotate-180")} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#111827]">{t("closedDays")} ({closedWeekdays.length})</p>
                      <p className="mt-0.5 text-xs text-[#6b7280]">{closedWeekdays.map((wd) => t(`weekday${wd}` as `weekday${number}`)).join(", ")}</p>
                    </div>
                  </button>
                  {showClosedDays && (
                    <div className="mt-3 flex flex-col divide-y divide-[#f3f4f6] border-t border-[#f3f4f6]">
                      {closedWeekdays.map((wd) => (
                        <div key={wd} className="flex items-center justify-between gap-3 py-3">
                          <span className="text-sm font-medium text-[#374151]">{t(`weekday${wd}` as `weekday${number}`)}</span>
                          <button
                            type="button"
                            onClick={() => toggleDay(wd)}
                            disabled={scheduleControlsDisabled}
                            className="relative h-6 w-11 shrink-0 cursor-pointer rounded-full bg-[#d1d5db] transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-55"
                            aria-label={t(`weekday${wd}` as `weekday${number}`)}
                            aria-pressed={false}
                          >
                            <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── ¿Un día distinto? — date exceptions ──────────────────────── */}
          <div className="border-t border-[#f3f4f6] p-4 sm:p-5">
            <div className="mb-6">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-[#111827]">{t("diffDayTitle")}</h3>
                <p className="mt-0.5 text-xs text-[#6b7280]">{t("diffDaySub")}</p>
                <p className="mt-1 text-xs font-medium text-[#6b7280]">{t("appliesTo", { place: locationLabel(activeLocationId) })}</p>
              </div>
            </div>

            <div className="mb-5">
              <button
                type="button"
                onClick={() => setDayModal({ date: todayISO() })}
                className="flex h-11 w-full min-w-0 items-center justify-between rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm font-semibold text-[#111827] transition-all hover:border-[#cbd5e1] focus:outline-none focus:ring-2 focus:ring-[#009FD9] sm:w-[18rem]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Calendar className="h-4 w-4 shrink-0 text-[#009FD9]" />
                  <span className="truncate">{t("changeDay")}</span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-[#9ca3af]" />
              </button>
            </div>

            {activeExceptions.length === 0 ? (
              <p className="text-xs text-[#9ca3af]">{t("noExceptions")}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {activeExceptions.map(([date, rows]) => {
                  const mode = rows[0].mode;
                  const times = rows.filter((r) => r.start && r.end).map((r) => `${to12h(r.start!)} – ${to12h(r.end!)}`).join(", ");
                  const [y, m, d] = date.split("-").map(Number);
                  const dt = new Date(y, m - 1, d);
                  const monthShort = dt.toLocaleDateString(dateLocale, { month: "short" }).replace(".", "").toUpperCase();
                  const weekdayLong = dt.toLocaleDateString(dateLocale, { weekday: "long" });
                  const summary = mode === "closed" ? t("excClosedLabel") : `${mode === "custom" ? t("excCustomLabel") : t("excExtraLabel")} · ${times}`;
                  return (
                    <div key={date} className="flex items-center gap-3 rounded-xl border border-[#e5e7eb] p-2.5">
                      <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-[#f9fafb]">
                        <span className="text-[9px] font-bold uppercase text-[#009FD9] leading-none">{monthShort}</span>
                        <span className="text-base font-bold text-[#111827] leading-tight">{d}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[#111827] capitalize">{weekdayLong}</p>
                        <p className="text-xs text-[#6b7280] truncate">{summary}</p>
                      </div>
                      <button type="button" onClick={() => setDayModal({ date })} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827] transition-colors" aria-label={t("edit")}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => removeException(date)} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-red-500 transition-colors" aria-label={t("removeException")}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
      </div>
      </div>

      {/* "Aplicar a otros días" modal */}
      {applyModal && (
        <ApplyScheduleModal
          sourceWeekday={applyModal.weekday}
          onClose={() => setApplyModal(null)}
          onApply={(targets) => applyDayToTargets(applyModal.weekday, targets)}
        />
      )}

      {dayModal && (
        <DayModal
          initialDate={dayModal.date}
          existing={exceptions.filter((e) => sameLoc(e.location_id))}
          markedDates={new Set(exceptions.filter((e) => sameLoc(e.location_id)).map((e) => e.date))}
          defaultDuration={activeDuration}
          dateLocale={dateLocale}
          // Other locations' occupied ranges on the picked date → guidance to pick a free slot.
          occupiedOnDate={otherOccupiedForDate}
          fmtRanges={fmtRanges}
          onClose={() => setDayModal(null)}
          // Close only when the save actually went through; a blocked overlap keeps the
          // modal open (the conflict notice explains why) so the pro can adjust the hours.
          onSave={async (date, mode, franjas, dur) => { const ok = await saveException(date, mode, franjas, dur); if (ok) setDayModal(null); return ok; }}
        />
      )}

      {/* ── Confirm: hide agenda ─────────────────────────────────────────── */}
      {showPrivateConfirm && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowPrivateConfirm(false)} />
          <div className="relative z-10 w-full rounded-t-2xl bg-white p-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] shadow-2xl sm:max-w-sm sm:rounded-2xl sm:pb-6">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
              <Lock className="h-5 w-5 text-[#b45309]" />
            </div>
            <h3 className="text-lg font-bold text-[#111827] mb-1">{t("confirmTitle")}</h3>
            <p className="text-sm text-[#6b7280] mb-5">{t("confirmBody")}</p>
            <div className="flex gap-3">
              <Button variant="outline" size="md" className="flex-1" onClick={() => setShowPrivateConfirm(false)} disabled={savingVisibility}>{t("cancel")}</Button>
              <Button size="md" className="flex-1 bg-[#b45309] hover:bg-[#92400e]" onClick={confirmMakePrivate} loading={savingVisibility}>{t("confirmPrivate")}</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Overlap conflict notice ──────────────────────────────────────────
          Blocks a schedule that would have the pro in two places at once (or
          overlapping itself). Sits above the "Cambiar un día" modal (z-[210]). */}
      {conflict && (
        <div className="fixed inset-0 z-[210] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConflict(null)} />
          <div className="relative z-10 w-full rounded-t-2xl bg-white p-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] text-center shadow-2xl sm:max-w-sm sm:rounded-2xl sm:pb-6">
            <div className={cn(
              "mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full",
              conflict.kind === "location" ? "bg-[#EBF5FB] text-[#009FD9]" : "bg-[#fff7ed] text-[#b45309]",
            )}>
              {conflict.kind === "location" ? (
                <span className="relative flex h-7 w-7 items-center justify-center">
                  <CalendarClock className="h-7 w-7" />
                  <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-[#EBF5FB] bg-red-500 text-white">
                    <X className="h-2.5 w-2.5 stroke-[3]" />
                  </span>
                </span>
              ) : (
                <span className="relative flex h-6 w-6 items-center justify-center">
                  <Calendar className="h-6 w-6" />
                  <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-[#fff7ed] bg-red-500 text-white">
                    <X className="h-2 w-2 stroke-[3]" />
                  </span>
                </span>
              )}
            </div>
            <h3 className="text-lg font-bold text-[#111827] mb-1.5">{conflict.title}</h3>
            <p className="text-sm text-[#6b7280] mb-5 leading-relaxed">{conflict.body}</p>
            <Button size="md" className="w-full" onClick={() => setConflict(null)}>{t("conflictOk")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function ApplyScheduleModal({ sourceWeekday, onClose, onApply }: {
  sourceWeekday: number;
  onClose: () => void;
  onApply: (targets: number[]) => Promise<void> | void;
}) {
  const t = useTranslations("availabilityEditor");
  const [selected, setSelected] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const targets = WEEKDAY_ORDER.filter((wd) => wd !== sourceWeekday);
  const weekdays = [1, 2, 3, 4, 5].filter((wd) => wd !== sourceWeekday);

  function toggle(wd: number) {
    setSelected((prev) => prev.includes(wd) ? prev.filter((x) => x !== wd) : [...prev, wd]);
  }

  return (
    <div className="app-modal-screen fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="app-bottom-sheet relative z-10 w-full overflow-y-auto overscroll-contain rounded-t-2xl bg-white p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] shadow-2xl sm:max-w-sm sm:rounded-2xl sm:pb-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-[#111827]">{t("applyToDaysTitle", { day: t(`weekday${sourceWeekday}` as `weekday${number}`) })}</h3>
            <p className="mt-1 text-sm text-[#6b7280]">{t("applyToDaysBody")}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-[#111827]" aria-label={t("cancel")}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setSelected(weekdays)} className="rounded-lg border border-[#dbeafe] px-3 py-1.5 text-xs font-semibold text-[#008ce0] hover:bg-[#EBF5FB]">
            {t("mondayToFriday")}
          </button>
          <button type="button" onClick={() => setSelected(targets)} className="rounded-lg border border-[#dbeafe] px-3 py-1.5 text-xs font-semibold text-[#008ce0] hover:bg-[#EBF5FB]">
            {t("allDays")}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {targets.map((wd) => {
            const active = selected.includes(wd);
            return (
              <button
                key={wd}
                type="button"
                onClick={() => toggle(wd)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-colors",
                  active ? "border-[#009FD9] bg-[#EBF5FB] text-[#0089bb]" : "border-[#e5e7eb] bg-white text-[#374151] hover:border-[#cbd5e1]"
                )}
              >
                {t(`weekday${wd}` as `weekday${number}`)}
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex gap-3">
          <Button type="button" variant="outline" size="md" className="flex-1" onClick={onClose} disabled={saving}>{t("cancel")}</Button>
          <Button type="button" size="md" className="flex-1" disabled={selected.length === 0 || saving} loading={saving} onClick={async () => { setSaving(true); await onApply(selected); setSaving(false); }}>
            {t("applyToSelected")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DayModal({ initialDate, existing, markedDates, defaultDuration, dateLocale, occupiedOnDate, fmtRanges, onClose, onSave }: {
  initialDate: string;
  existing: ExcRow[];
  markedDates: Set<string>;
  defaultDuration: number;
  dateLocale: string;
  occupiedOnDate: (date: string) => { label: string; ranges: [number, number][] }[];
  fmtRanges: (ranges: [number, number][]) => string;
  onClose: () => void;
  onSave: (date: string, mode: ExcMode, franjas: Franja[], dur: number) => Promise<boolean> | boolean;
}) {
  const t = useTranslations("availabilityEditor");
  const [date, setDate] = useState(initialDate);
  const [mode, setMode] = useState<ExcMode>("extra");
  const [franjas, setFranjas] = useState<Franja[]>([{ id: genId(), start: "18:00", end: "20:00" }]);
  const [dur, setDur] = useState(defaultDuration);
  const [saving, setSaving] = useState(false);

  // Prefill from any existing exception when the picked date changes.
  useEffect(() => {
    const rows = existing.filter((e) => e.date === date);
    if (rows.length === 0) {
      queueMicrotask(() => {
        setMode("extra");
        setFranjas([{ id: genId(), start: "18:00", end: "20:00" }]);
        setDur(defaultDuration);
      });
      return;
    }
    const m = rows[0].mode;
    queueMicrotask(() => {
      setMode(m);
      setDur(rows[0].slot_minutes ?? defaultDuration);
      setFranjas(m === "closed" ? [] : rows.filter((r) => r.start && r.end).map((r) => ({ id: genId(), start: r.start!, end: r.end! })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function setModeWithDefault(m: ExcMode) {
    setMode(m);
    if (m !== "closed" && franjas.length === 0) setFranjas([{ id: genId(), start: m === "extra" ? "18:00" : "08:00", end: m === "extra" ? "20:00" : "17:00" }]);
  }

  const hhmmLocal = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  const invalid = mode !== "closed" && (franjas.length === 0 || franjas.some((f) => toMins(f.end) <= toMins(f.start)));

  const [y, m, d] = date.split("-").map(Number);
  const selectedLong = new Date(y, m - 1, d).toLocaleDateString(dateLocale, { weekday: "long", day: "numeric", month: "long" });

  const options: { key: ExcMode; label: string; desc: string }[] = [
    { key: "extra", label: t("optExtra"), desc: t("optExtraDesc") },
    { key: "custom", label: t("optCustom"), desc: t("optCustomDesc") },
    { key: "closed", label: t("optClosed"), desc: t("optClosedDesc") },
  ];

  return (
    <div className="app-modal-screen fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="app-bottom-sheet relative z-10 max-h-[92vh] w-full overflow-y-auto overscroll-contain rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[#f3f4f6] p-4 sm:p-5">
          <div>
            <h3 className="text-base font-bold text-[#111827]">{t("modalTitle")}</h3>
            <p className="mt-0.5 text-xs text-[#6b7280]">{t("modalSub")}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#6b7280] hover:bg-[#f3f4f6]" aria-label={t("close")}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-5 p-4 sm:grid-cols-2 sm:p-5">
          <MonthCalendar value={date} onChange={setDate} marked={markedDates} dateLocale={dateLocale} />

          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold text-[#111827] capitalize">{selectedLong}</p>

            {/* Guidance: what OTHER locations already occupy this date → pick a free slot.
                Consecutive (touching) ranges are allowed; only true overlaps are blocked. */}
            {(() => {
              const occupied = occupiedOnDate(date);
              if (occupied.length === 0) return null;
              return (
                <div className="flex flex-col gap-0.5 rounded-xl border border-[#f3f4f6] bg-[#f9fafb] p-2.5">
                  {occupied.map((o) => (
                    <p key={o.label} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-[#6b7280]">
                      <Lock className="h-3 w-3 shrink-0 mt-[3px] text-[#9ca3af]" />
                      <span>{t("occupiedElsewhere", { ranges: fmtRanges(o.ranges), place: o.label })}</span>
                    </p>
                  ))}
                </div>
              );
            })()}

            <div className="flex flex-col gap-2">
              {options.map((o) => {
                const active = mode === o.key;
                return (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => setModeWithDefault(o.key)}
                    className={cn("flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors", active ? "border-[#009FD9] bg-[#EBF5FB]" : "border-[#e5e7eb] hover:bg-[#f9fafb]")}
                  >
                    <span className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2", active ? "border-[#009FD9]" : "border-[#cbd5e1]")}>
                      {active && <span className="h-2 w-2 rounded-full bg-[#009FD9]" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-[#111827]">{o.label}</span>
                      <span className="block text-xs text-[#6b7280]">{o.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {mode !== "closed" && (
              <div className="flex flex-col gap-2">
                {/* time range + its remove "x" on ONE line (x stays right, selects shrink on mobile). */}
                {franjas.map((f) => (
                  <div key={f.id} className="flex items-center gap-1.5">
                    <TimeSelect value={f.start} step={dur} onChange={(v) => setFranjas((prev) => prev.map((x) => (x.id === f.id ? { ...x, start: v, ...(toMins(x.end) <= toMins(v) ? { end: hhmmLocal(Math.min(toMins(v) + dur, 23 * 60 + 30)) } : {}) } : x)))} className="min-w-0 flex-1 sm:flex-none sm:w-32" />
                    <span className="shrink-0 text-[#9ca3af]">–</span>
                    <TimeSelect value={f.end} step={dur} min={hhmmLocal(Math.min(toMins(f.start) + dur, 23 * 60 + 30))} onChange={(v) => setFranjas((prev) => prev.map((x) => (x.id === f.id ? { ...x, end: v } : x)))} className="min-w-0 flex-1 sm:flex-none sm:w-32" error={toMins(f.end) <= toMins(f.start) ? t("toAfterFrom") : undefined} />
                    <button type="button" onClick={() => setFranjas((prev) => prev.filter((x) => x.id !== f.id))} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-red-500 transition-colors" aria-label={t("remove")}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => setFranjas((prev) => [...prev, nextFranja(prev)])} className="inline-flex items-center self-start text-xs font-medium text-[#009FD9] hover:underline cursor-pointer">
                  {t("addFranja")}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-[#f3f4f6] p-4 sm:p-5">
          <Button type="button" variant="outline" size="md" onClick={onClose} disabled={saving}>{t("cancel")}</Button>
          <Button type="button" size="md" disabled={invalid || saving} loading={saving} onClick={async () => { setSaving(true); const ok = await onSave(date, mode, franjas, dur); if (!ok) setSaving(false); }}>{t("saveDay")}</Button>
        </div>
      </div>
    </div>
  );
}

// Compact month calendar (Monday-first). Past days are disabled; the selected day is
// brand-filled; dates with an existing exception get a small dot.
function MonthCalendar({ value, onChange, marked, dateLocale }: { value: string; onChange: (iso: string) => void; marked: Set<string>; dateLocale: string }) {
  const today = todayISO();
  const [vy, vm] = (() => { const [y, m] = value.split("-").map(Number); return [y, m - 1]; })();
  const [view, setView] = useState<{ y: number; m: number }>({ y: vy, m: vm });

  const monthLabel = new Date(view.y, view.m, 1).toLocaleDateString(dateLocale, { month: "long", year: "numeric" });
  const weekdayMini = dateLocale.startsWith("en") ? ["M", "T", "W", "T", "F", "S", "S"] : ["L", "M", "M", "J", "V", "S", "D"];
  const first = new Date(view.y, view.m, 1);
  const startCol = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startCol; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toKeyLocal(new Date(view.y, view.m, d)));

  const canPrev = `${view.y}-${String(view.m + 1).padStart(2, "0")}` > today.slice(0, 7);

  return (
    <div className="rounded-xl border border-[#e5e7eb] p-3">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" disabled={!canPrev} onClick={() => setView((v) => ({ y: v.m === 0 ? v.y - 1 : v.y, m: (v.m + 11) % 12 }))} className="flex h-7 w-7 items-center justify-center rounded-lg text-[#6b7280] enabled:hover:bg-[#f3f4f6] disabled:opacity-30" aria-label="<">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-[#111827] capitalize">{monthLabel}</span>
        <button type="button" onClick={() => setView((v) => ({ y: v.m === 11 ? v.y + 1 : v.y, m: (v.m + 1) % 12 }))} className="flex h-7 w-7 items-center justify-center rounded-lg text-[#6b7280] hover:bg-[#f3f4f6]" aria-label=">">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="mb-1 grid grid-cols-7 gap-0.5">
        {weekdayMini.map((w, i) => <span key={i} className="py-1 text-center text-[10px] font-semibold uppercase text-[#9ca3af]">{w}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((iso, i) => {
          if (!iso) return <span key={i} />;
          const day = Number(iso.slice(8, 10));
          const past = iso < today;
          const selected = iso === value;
          return (
            <button
              key={i}
              type="button"
              disabled={past}
              onClick={() => onChange(iso)}
              className={cn(
                "relative flex h-9 items-center justify-center rounded-lg text-sm transition-colors",
                selected ? "bg-[#009FD9] font-semibold text-white" : past ? "text-[#d1d5db]" : "text-[#374151] hover:bg-[#EBF5FB]"
              )}
            >
              {day}
              {marked.has(iso) && !selected && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[#dc5b4b]" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
