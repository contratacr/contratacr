"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Plus, X, Lock, Loader2, MapPin, ChevronDown, ChevronLeft, ChevronRight, Calendar, Pencil, Trash2, Copy } from "lucide-react";
import { type ContactPreference } from "@/lib/constants";
import { crTodayISO, isTooSoonCR } from "@/lib/time-cr";
import { TimeSelect, to12h } from "@/components/ui/time-select";
import { useReportSaveStatus } from "@/components/dashboard/save-status-context";

// Stable id for the optional "A domicilio" (traveling) schedule. Starts with `cov_`
// so /buscar treats it exactly like any coverage zone (an "A domicilio" tab with its
// own slots and no street address).
const A_DOMICILIO_LOC = "cov_domicilio";

// How far ahead the weekly template + exceptions are MATERIALIZED into concrete
// `availability_slots` (the booking-critical table everything downstream reads). The
// window is regenerated on every edit AND when the editor mounts, so it stays fresh.
const HORIZON_DAYS = 70;

// Monday-first display order (JS getDay: 0=Sun … 6=Sat).
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DURATION_OPTIONS = [30, 45, 60, 90, 120];

type Franja = { id: string; start: string; end: string };
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

type Place = { id?: string; name: string };
type Coverage = { level?: "canton" | "provincia" | "country"; provinciaId?: string; cantonId?: string; cantonName?: string; provinceName?: string };

interface AvailabilityEditorProps {
  professionalId: string;
  initialPublic?: boolean;
  initialContactPreference?: ContactPreference;
  workplaces?: Place[];
  coverageAreas?: Coverage[];
  /** True when the pro selected "Me desplazo donde el cliente" (service_type includes
   *  "mobile"). Adds an OPTIONAL "A domicilio" schedulable location. */
  travels?: boolean;
  onSaved?: () => void;
}

export function AvailabilityEditor({ professionalId, initialPublic = true, workplaces = [], coverageAreas = [], travels = false, onSaved }: AvailabilityEditorProps) {
  const locale = useLocale();
  const t = useTranslations("availabilityEditor");
  const dateLocale = locale === "en" ? "en-US" : "es-CR";
  const rich = { strong: (c: React.ReactNode) => <strong>{c}</strong> };

  const [isPublic, setIsPublic] = useState(initialPublic);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [showPrivateConfirm, setShowPrivateConfirm] = useState(false);
  // Cross/same-location overlap block — a pro can't be in two places at once.
  const [conflict, setConflict] = useState<{ title: string; body: string } | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  function pulseSaved() { setJustSaved(true); setTimeout(() => setJustSaved(false), 2500); }

  // The recurring template + date exceptions are the source of truth (the editor
  // edits these); they MATERIALIZE into availability_slots.
  const [weekly, setWeekly] = useState<WeeklyRow[]>([]);
  const [exceptions, setExceptions] = useState<ExcRow[]>([]);

  // ── Location tabs ("HORARIO PARA") — workplaces + coverage + A domicilio ──
  const locationOptions = useMemo(() => {
    const opts: { id: string; label: string }[] = [];
    for (const w of workplaces) if (w.id) opts.push({ id: w.id, label: w.name });
    coverageAreas.forEach((c, i) => {
      const level = c.level ?? (c.cantonId ? "canton" : c.provinciaId ? "provincia" : "country");
      const key = c.cantonId ?? c.provinciaId ?? `pais${i}`;
      const label =
        level === "country" ? t("covCountry")
        : level === "provincia" ? t("covProvincia", { province: c.provinceName ?? "Provincia" })
        : t("covCanton", { canton: `${c.cantonName ?? "Zona"}${c.provinceName ? `, ${c.provinceName}` : ""}` });
      opts.push({ id: `cov_${key}`, label });
    });
    if (travels && !opts.some((o) => o.id === A_DOMICILIO_LOC)) {
      opts.push({ id: A_DOMICILIO_LOC, label: t("aDomicilio") });
    }
    return opts;
  }, [workplaces, coverageAreas, travels, t]);

  const [genLocation, setGenLocation] = useState("");
  useEffect(() => {
    if (locationOptions.length > 0 && !locationOptions.some((o) => o.id === genLocation)) {
      setGenLocation(locationOptions[0].id);
    }
  }, [locationOptions, genLocation]);

  // Schedules are keyed by LOCATION ONLY. Professions ("what I do") are profile info,
  // never tied to when/where — the specific service is coordinated at contact/booking.
  // New weekly/exception rows write category_id = null; legacy profession-tagged rows
  // are matched by location (any category) and migrate to null as the pro edits.
  const sameLoc = useCallback((loc: string) => loc === genLocation, [genLocation]);

  function locationLabel(id: string): string {
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
  // also clear (e.g. the weekly hours when adding `extra` on the same location/day).
  // Returns a localized conflict {title, body} to block with, or null when it's safe.
  function findOverlapConflict(
    loc: string,
    proposed: [number, number][],
    scope: { weekday: number } | { date: string },
    ownBase: [number, number][] = []
  ): { title: string; body: string } | null {
    // 1) SAME-LOCATION: proposed franjas must not overlap each other or the own base.
    for (let i = 0; i < proposed.length; i++) {
      for (let j = i + 1; j < proposed.length; j++) {
        if (rangesOverlap(proposed[i][0], proposed[i][1], proposed[j][0], proposed[j][1])) {
          return { title: t("conflictTitle"), body: t("conflictSelf") };
        }
      }
      for (const b of ownBase) {
        if (rangesOverlap(proposed[i][0], proposed[i][1], b[0], b[1])) {
          return { title: t("conflictTitle"), body: t("conflictSelf") };
        }
      }
    }
    // 2) CROSS-LOCATION: proposed must not overlap any OTHER location on the same day.
    const otherLocs = [...new Set([...weekly, ...exceptions].map((r) => r.location_id))].filter((l) => l && l !== loc);
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
                title: t("conflictTitle"),
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

  // ── "Already occupied elsewhere" guidance ─────────────────────────────────────
  // Other locations' occupied ranges on a WEEKDAY — the UNION across every future date that
  // lands on it (within HORIZON), computed with the SAME `rangesForLocOnDate` the overlap
  // check uses, so it includes date-specific EXCEPTIONS (closed/custom/extra), not just the
  // recurring weekly. CRITICAL for consistency: a weekly franja recurs on ALL those dates, so
  // it must clear EVERY one — using only the recurring rows here let the smart default
  // suggest a range (e.g. 14:00–17:00) that the exception-aware validator then BLOCKED. Now
  // the guidance + smart default + validation all agree. Grouped by location, merged + sorted.
  function otherOccupiedForWeekday(weekday: number): { label: string; ranges: [number, number][] }[] {
    const otherLocs = [...new Set([...weekly, ...exceptions].map((r) => r.location_id))].filter((l) => l && l !== genLocation);
    const start = todayISO();
    const dates: string[] = [];
    for (let i = 0; i <= HORIZON_DAYS; i++) { const d = addDaysISO(start, i); if (weekdayOf(d) === weekday) dates.push(d); }
    return otherLocs
      .map((loc) => {
        const all: [number, number][] = [];
        for (const d of dates) all.push(...rangesForLocOnDate(loc, d, weekly, exceptions));
        return { label: locationLabel(loc), ranges: mergeRanges(all) };
      })
      .filter((o) => o.ranges.length > 0);
  }

  // Same, for a specific DATE (used in the "Cambiar un día" modal) — applies the full
  // closed/custom/extra precedence via rangesForLocOnDate.
  function otherOccupiedForDate(date: string): { label: string; ranges: [number, number][] }[] {
    const otherLocs = [...new Set([...weekly, ...exceptions].map((r) => r.location_id))].filter((l) => l && l !== genLocation);
    return otherLocs
      .map((loc) => ({ label: locationLabel(loc), ranges: mergeRanges(rangesForLocOnDate(loc, date, weekly, exceptions)) }))
      .filter((o) => o.ranges.length > 0);
  }

  // Render a location's occupied ranges as "8:00 AM–3:00 PM, 5:00 PM–7:00 PM".
  function fmtRanges(ranges: [number, number][]): string {
    return ranges.map(([s, e]) => `${to12h(hhmm(s))}–${to12h(hhmm(e))}`).join(", ");
  }

  // ── MATERIALIZE the template + exceptions into concrete slots ──────────────
  // Keyed by LOCATION (not profession): availability_slots is UNIQUE per pro+date+time
  // (a pro can't be in two places at once), so we dedupe by (date,time) across all
  // locations — first writer wins. Slots are written with category_id = null.
  const computeDesiredSlots = useCallback((wk: WeeklyRow[], exc: ExcRow[]) => {
    const start = todayISO();
    const locs = new Set<string>();
    // weekly franjas keyed by `${loc}|${weekday}`
    const weeklyByKey = new Map<string, { start: string; end: string; dur: number }[]>();
    for (const r of wk) {
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
      locs.add(e.location_id);
      const k = `${e.location_id}|${e.date}`;
      const cur = excByKey.get(k) ?? { closed: false, custom: [], extra: [] };
      if (e.mode === "closed") cur.closed = true;
      else if (e.start && e.end) (e.mode === "custom" ? cur.custom : cur.extra).push({ start: e.start, end: e.end, dur: e.slot_minutes });
      excByKey.set(k, cur);
    }

    const seen = new Set<string>(); // date|time
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
            const key = `${date}|${time}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ date, time, location_id: loc, category_id: null });
          }
        }
      }
    }
    return out;
  }, []);

  const regenerate = useCallback(async (wk: WeeklyRow[], exc: ExcRow[]) => {
    setBusy(true);
    const supabase = createClient();
    const desired = computeDesiredSlots(wk, exc);
    // Rewrite the rolling window: drop future slots, insert the freshly materialized set.
    // (Bookings reference scheduled_date/time, not slot ids, so this never breaks one.)
    await supabase.from("availability_slots").delete().eq("professional_id", professionalId).gte("slot_date", todayISO());
    if (desired.length > 0) {
      const rows = desired.map((d) => ({ professional_id: professionalId, slot_date: d.date, slot_time: d.time, location_id: d.location_id, category_id: d.category_id }));
      for (let i = 0; i < rows.length; i += 500) {
        let { error } = await supabase.from("availability_slots").insert(rows.slice(i, i + 500));
        if (error && /location_id|category_id|column/i.test(error.message)) {
          ({ error } = await supabase.from("availability_slots").insert(rows.slice(i, i + 500).map((r) => ({ professional_id: r.professional_id, slot_date: r.slot_date, slot_time: r.slot_time }))));
        }
        if (error) console.error("[availability] materialize", error);
      }
    }
    setBusy(false);
    pulseSaved();
    onSaved?.();
  }, [professionalId, computeDesiredSlots, onSaved]);

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
      const wkRows: WeeklyRow[] = (wk ?? []).map((r) => ({ id: r.id, location_id: r.location_id ?? "", category_id: r.category_id ?? null, weekday: r.weekday, start: String(r.start_time).slice(0, 5), end: String(r.end_time).slice(0, 5), slot_minutes: r.slot_minutes ?? 60 }));
      const excRows: ExcRow[] = (exc ?? []).map((r) => ({ id: r.id, location_id: r.location_id ?? "", category_id: r.category_id ?? null, date: r.exception_date, mode: r.mode as ExcMode, start: r.start_time ? String(r.start_time).slice(0, 5) : null, end: r.end_time ? String(r.end_time).slice(0, 5) : null, slot_minutes: r.slot_minutes ?? 60 }));
      setWeekly(wkRows);
      setExceptions(excRows);
      setLoading(false);
      // Refresh the materialized window from the template (keeps the rolling 70-day
      // horizon current). Skip when there is NO template at all, so a legacy pro's
      // manually-created slots are preserved until they adopt the weekly editor.
      if (isPublic && (wkRows.length > 0 || excRows.length > 0)) regenerate(wkRows, excRows);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professionalId]);

  // ── Active view (current location + profession) ───────────────────────────
  // Chosen appointment length sticks even before any day is toggled on (a combo with
  // no rows yet falls back to this instead of resetting to 60).
  const [durationPref, setDurationPref] = useState(60);
  const activeDuration = useMemo(() => {
    const row = weekly.find((r) => sameLoc(r.location_id));
    return row?.slot_minutes ?? durationPref;
  }, [weekly, sameLoc, durationPref]);

  const dayFranjas = useMemo(() => {
    const map = new Map<number, Franja[]>();
    for (const r of weekly) {
      if (!sameLoc(r.location_id)) continue;
      const arr = map.get(r.weekday) ?? [];
      arr.push({ id: r.id ?? genId(), start: r.start, end: r.end });
      map.set(r.weekday, arr);
    }
    // Sort by start; empty drafts (just-enabled, no time yet) go LAST so a new row appears
    // below the existing franjas.
    for (const arr of map.values()) arr.sort((a, b) => (!a.start ? 1 : !b.start ? -1 : a.start.localeCompare(b.start)));
    return map;
  }, [weekly, sameLoc]);

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

  // ── Persist the weekly schedule for a single weekday, then re-materialize. ──
  // Delete matches by LOCATION + weekday (any category) so legacy profession-tagged
  // rows are absorbed; new rows are written with category_id = null.
  // INCOMPLETE drafts (a just-enabled day with empty time fields, or a half-typed range)
  // are kept in LOCAL state so the pro can fill them freely, but are NOT validated, NOT
  // written to the DB and NOT materialized — only COMPLETE franjas are. This is what lets
  // the pro pick any free time from scratch: a transient single-field value never trips the
  // overlap guard, and an incomplete slot can never be saved.
  async function persistDay(weekday: number, franjas: Franja[], dur: number) {
    const complete = franjas.filter(isCompleteFranja);
    // Block a save that would put this pro in two places at once — COMPLETE franjas only.
    const proposed = complete.map((f) => [toMins(f.start), toMins(f.end)] as [number, number]);
    const c = findOverlapConflict(genLocation, proposed, { weekday });
    if (c) { setConflict(c); return; }

    // Local state keeps ALL franjas (incl. the empty draft) so the UI shows the open row.
    const next = weekly.filter((r) => !(sameLoc(r.location_id) && r.weekday === weekday));
    for (const f of franjas) next.push({ location_id: genLocation, category_id: null, weekday, start: f.start, end: f.end, slot_minutes: dur });
    setWeekly(next);

    const supabase = createClient();
    await supabase.from("availability_weekly").delete().eq("professional_id", professionalId).eq("location_id", genLocation).eq("weekday", weekday);
    if (complete.length > 0) {
      await supabase.from("availability_weekly").insert(complete.map((f) => ({ professional_id: professionalId, location_id: genLocation, category_id: null, weekday, start_time: f.start, end_time: f.end, slot_minutes: dur })));
    }
    await regenerate(next, exceptions); // computeDesiredSlots skips incomplete drafts
  }

  function toggleDay(weekday: number) {
    const cur = dayFranjas.get(weekday) ?? [];
    // Turning a day ON starts with an EMPTY franja (no pre-filled default time) so the pro
    // picks any free time from scratch — nothing pre-constrains the choice.
    persistDay(weekday, cur.length > 0 ? [] : [{ id: genId(), start: "", end: "" }], activeDuration);
  }
  function addFranja(weekday: number) {
    const cur = dayFranjas.get(weekday) ?? [];
    // New franja starts EMPTY (no pre-filled default) so the pro picks any free time.
    persistDay(weekday, [...cur, { id: genId(), start: "", end: "" }], activeDuration);
  }
  function updateFranja(weekday: number, id: string, patch: Partial<Franja>) {
    const cur = dayFranjas.get(weekday) ?? [];
    persistDay(weekday, cur.map((f) => (f.id === id ? { ...f, ...patch } : f)), activeDuration);
  }
  function removeFranja(weekday: number, id: string) {
    const cur = dayFranjas.get(weekday) ?? [];
    persistDay(weekday, cur.filter((f) => f.id !== id), activeDuration);
  }

  // "Igual a todos los días": copy this day's franjas to EVERY weekday.
  async function copyToAll(weekday: number) {
    // Only COMPLETE franjas are copied — an empty/half-typed draft is ignored (and if the
    // source day has nothing complete, this is a no-op rather than wiping every day).
    const src = (dayFranjas.get(weekday) ?? []).filter(isCompleteFranja).map((f) => ({ start: f.start, end: f.end }));
    if (src.length === 0) return;
    // These franjas would repeat on EVERY weekday — block if any day collides with
    // another location (or itself).
    const proposed = src.map((f) => [toMins(f.start), toMins(f.end)] as [number, number]);
    for (const wd of WEEKDAY_ORDER) {
      const c = findOverlapConflict(genLocation, proposed, { weekday: wd });
      if (c) { setConflict(c); return; }
    }
    const next = weekly.filter((r) => !sameLoc(r.location_id));
    for (const wd of WEEKDAY_ORDER) for (const f of src) next.push({ location_id: genLocation, category_id: null, weekday: wd, start: f.start, end: f.end, slot_minutes: activeDuration });
    setWeekly(next);

    const supabase = createClient();
    await supabase.from("availability_weekly").delete().eq("professional_id", professionalId).eq("location_id", genLocation);
    if (src.length > 0) {
      const rows = WEEKDAY_ORDER.flatMap((wd) => src.map((f) => ({ professional_id: professionalId, location_id: genLocation, category_id: null, weekday: wd, start_time: f.start, end_time: f.end, slot_minutes: activeDuration })));
      await supabase.from("availability_weekly").insert(rows);
    }
    await regenerate(next, exceptions);
  }

  async function setDuration(dur: number) {
    setDurationPref(dur);
    const next = weekly.map((r) => (sameLoc(r.location_id) ? { ...r, slot_minutes: dur } : r));
    setWeekly(next);
    const supabase = createClient();
    await supabase.from("availability_weekly").update({ slot_minutes: dur }).eq("professional_id", professionalId).eq("location_id", genLocation);
    await regenerate(next, exceptions);
  }

  // ── Exceptions ("¿Un día distinto?") ──────────────────────────────────────
  // Returns false (without writing) when the proposed hours overlap another location
  // — or this location's own weekly hours when ADDING extra — on that date.
  async function saveException(date: string, mode: ExcMode, franjas: Franja[], dur: number): Promise<boolean> {
    if (mode !== "closed") {
      const proposed = franjas.map((f) => [toMins(f.start), toMins(f.end)] as [number, number]).filter(([s, e]) => e > s);
      // `extra` keeps the weekly hours, so it must also clear THIS location's weekly base.
      const ownBase: [number, number][] = mode === "extra"
        ? weekly.filter((r) => r.location_id === genLocation && r.weekday === weekdayOf(date)).map((r) => [toMins(r.start), toMins(r.end)])
        : [];
      const c = findOverlapConflict(genLocation, proposed, { date }, ownBase);
      if (c) { setConflict(c); return false; }
    }

    const next = exceptions.filter((e) => !(sameLoc(e.location_id) && e.date === date));
    if (mode === "closed") {
      next.push({ location_id: genLocation, category_id: null, date, mode: "closed", start: null, end: null, slot_minutes: dur });
    } else {
      for (const f of franjas) next.push({ location_id: genLocation, category_id: null, date, mode, start: f.start, end: f.end, slot_minutes: dur });
    }
    setExceptions(next);

    const supabase = createClient();
    await supabase.from("availability_exceptions").delete().eq("professional_id", professionalId).eq("location_id", genLocation).eq("exception_date", date);
    const rows: { professional_id: string; location_id: string; category_id: string | null; exception_date: string; mode: ExcMode; start_time: string | null; end_time: string | null; slot_minutes: number }[] =
      mode === "closed"
        ? [{ professional_id: professionalId, location_id: genLocation, category_id: null, exception_date: date, mode, start_time: null, end_time: null, slot_minutes: dur }]
        : franjas.map((f) => ({ professional_id: professionalId, location_id: genLocation, category_id: null, exception_date: date, mode, start_time: f.start, end_time: f.end, slot_minutes: dur }));
    if (rows.length > 0) await supabase.from("availability_exceptions").insert(rows);
    await regenerate(weekly, next);
    return true;
  }

  async function removeException(date: string) {
    const next = exceptions.filter((e) => !(sameLoc(e.location_id) && e.date === date));
    setExceptions(next);
    const supabase = createClient();
    await supabase.from("availability_exceptions").delete().eq("professional_id", professionalId).eq("location_id", genLocation).eq("exception_date", date);
    await regenerate(weekly, next);
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
  const [dayModal, setDayModal] = useState<{ date: string } | null>(null);

  const selectClass = "h-9 rounded-xl border border-[#e5e7eb] bg-white pl-3 pr-9 text-sm font-medium text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all appearance-none cursor-pointer";

  // App-wide autosave: report status to the section title row (inline, no layout shift).
  useReportSaveStatus(savingVisibility || busy, justSaved);

  return (
    <div className="flex flex-col gap-4">

      {/* ── Disponibilidad privada ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-[#e5e7eb] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#111827]">{t("privateLabel")}</p>
            <p className="mt-0.5 text-xs text-[#6b7280]">{isPublic ? t("privateSubPublic") : t("privateSubPrivate")}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {savingVisibility && <Loader2 className="h-4 w-4 animate-spin text-[#009FD9]" />}
            <button
              type="button"
              onClick={toggleVisibility}
              disabled={savingVisibility}
              className={cn("relative h-6 w-11 rounded-full transition-all duration-200 shrink-0 cursor-pointer", !isPublic ? "bg-[#b45309]" : "bg-[#d1d5db]")}
              aria-label={isPublic ? t("makePrivate") : t("makePublic")}
            >
              <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200", !isPublic ? "left-5" : "left-0.5")} />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#009FD9]" /></div>
      ) : !isPublic ? (
        <div className="rounded-xl bg-[#fffbeb] border border-[#fde68a] p-4 text-sm text-[#92400e] flex items-start gap-2">
          <Lock className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{t.rich("privateNote", { ...rich, call: "" })}</span>
        </div>
      ) : locationOptions.length === 0 ? (
        <div className="rounded-xl bg-[#fffbeb] border border-[#fde68a] p-4 text-sm text-[#92400e]">
          {t.rich("needLocation", rich)}
        </div>
      ) : (
        <>
          {/* ── HORARIO PARA — location tabs ─────────────────────────────── */}
          <div className="rounded-2xl border border-[#e5e7eb] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="h-3.5 w-3.5 text-[#9ca3af]" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[#9ca3af]">{t("scheduleForLabel")}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {locationOptions.map((o) => {
                const active = o.id === genLocation;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setGenLocation(o.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      active ? "bg-[#EBF5FB] text-[#009FD9] border-[#bfdbfe]" : "bg-white text-[#6b7280] border-[#e5e7eb] hover:bg-[#f3f4f6]"
                    )}
                  >
                    <MapPin className="h-3 w-3" /> {o.label}
                  </button>
                );
              })}
              {/* Work locations live in the profile's "Ubicación y cobertura" section, not
                  here — so this jumps to Mi perfil and (via ?focus=location) auto-opens +
                  scrolls to that section, landing the pro ready to add a place. */}
              <Link href="/dashboard/profesional?tab=profile&focus=location" className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-[#009FD9] hover:bg-[#EBF5FB] transition-colors">
                <Plus className="h-3.5 w-3.5" /> {t("addLocation")}
              </Link>
            </div>
          </div>

          {/* ── Mis horarios de siempre — recurring weekly schedule ───────── */}
          <div className="rounded-2xl border border-[#e5e7eb] p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-[#111827]">{t("alwaysTitle")}</h3>
                <p className="mt-0.5 text-xs text-[#6b7280]">{t("alwaysSub", { place: locationLabel(genLocation) })}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <label className="text-xs font-medium text-[#6b7280]">{t("apptDuration")}</label>
                <div className="relative">
                  <select value={activeDuration} onChange={(e) => setDuration(Number(e.target.value))} className={selectClass}>
                    {DURATION_OPTIONS.map((d) => <option key={d} value={d}>{t(`dur${d}` as `dur${number}`)}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af]" />
                </div>
              </div>
            </div>

            <div className="flex flex-col divide-y divide-[#f3f4f6]">
              {WEEKDAY_ORDER.map((wd) => {
                const franjas = dayFranjas.get(wd) ?? [];
                const on = franjas.length > 0;
                // What OTHER locations already occupy this weekday → pick a free slot.
                const occupied = otherOccupiedForWeekday(wd);
                return (
                  <div key={wd} className="flex flex-col gap-2 py-3 sm:flex-row sm:gap-4">
                    {/* toggle + weekday name */}
                    <div className="flex items-center gap-2.5 sm:w-32 sm:shrink-0 sm:pt-1.5">
                      <button
                        type="button"
                        onClick={() => toggleDay(wd)}
                        className={cn("relative h-5 w-9 rounded-full transition-all duration-200 shrink-0 cursor-pointer", on ? "bg-[#009FD9]" : "bg-[#d1d5db]")}
                        aria-label={t(`weekday${wd}` as `weekday${number}`)}
                        aria-pressed={on}
                      >
                        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-200", on ? "left-[18px]" : "left-0.5")} />
                      </button>
                      <span className={cn("text-sm font-medium", on ? "text-[#111827]" : "text-[#9ca3af]")}>{t(`weekday${wd}` as `weekday${number}`)}</span>
                    </div>

                    {/* franjas */}
                    <div className="min-w-0 flex-1">
                      {!on ? (
                        <p className="text-sm text-[#9ca3af] sm:pt-1.5">{t("closed")}</p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {/* time range + its remove "x" on ONE line — the x stays to the
                              RIGHT (never wraps below), the selects shrink on mobile. */}
                          {franjas.map((f) => (
                            <div key={f.id} className="flex items-center gap-1.5">
                              {/* Start: no min (any time pickable). Only bump the END when it's
                                  already set AND now ≤ start — never auto-fill an empty end. */}
                              <TimeSelect value={f.start} onChange={(v) => updateFranja(wd, f.id, { start: v, ...(f.end && toMins(f.end) <= toMins(v) ? { end: hhmm(Math.min(toMins(v) + 60, 23 * 60 + 30)) } : {}) })} className="min-w-0 flex-1 sm:flex-none sm:w-32" />
                              <span className="shrink-0 text-[#9ca3af]">–</span>
                              {/* End: min only once a start is picked (so it never pre-constrains an empty row). */}
                              <TimeSelect value={f.end} min={f.start ? hhmm(Math.min(toMins(f.start) + 30, 23 * 60 + 30)) : undefined} onChange={(v) => updateFranja(wd, f.id, { end: v })} className="min-w-0 flex-1 sm:flex-none sm:w-32" error={f.start && f.end && toMins(f.end) <= toMins(f.start) ? t("toAfterFrom") : undefined} />
                              <button type="button" onClick={() => removeFranja(wd, f.id)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-red-500 transition-colors" aria-label={t("remove")}>
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-0.5">
                            <button type="button" onClick={() => addFranja(wd)} className="inline-flex items-center gap-1 text-xs font-medium text-[#009FD9] hover:underline cursor-pointer">
                              <Plus className="h-3.5 w-3.5" /> {t("addFranja")}
                            </button>
                            <button type="button" onClick={() => copyToAll(wd)} className="inline-flex items-center gap-1 text-xs font-medium text-[#6b7280] hover:text-[#111827] cursor-pointer">
                              <Copy className="h-3.5 w-3.5" /> {t("sameAllDays")}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Guidance: what OTHER locations already occupy this weekday, so the
                          pro picks a free slot. Consecutive (touching) times are allowed. */}
                      {occupied.length > 0 && (
                        <div className="mt-2 flex flex-col gap-0.5">
                          {occupied.map((o) => (
                            <p key={o.label} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-[#9ca3af]">
                              <Lock className="h-3 w-3 shrink-0 mt-[3px]" />
                              <span>{t("occupiedElsewhere", { ranges: fmtRanges(o.ranges), place: o.label })}</span>
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── ¿Un día distinto? — date exceptions ──────────────────────── */}
          <div className="rounded-2xl border border-[#e5e7eb] p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-[#111827]">{t("diffDayTitle")}</h3>
                <p className="mt-0.5 text-xs text-[#6b7280]">{t("diffDaySub")}</p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={() => setDayModal({ date: todayISO() })}>
                <Calendar className="h-4 w-4" /> {t("changeDay")}
              </Button>
            </div>

            {activeExceptions.length === 0 ? (
              <p className="text-xs text-[#9ca3af]">{t("noExceptions")}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {activeExceptions.map(([date, rows]) => {
                  const mode = rows[0].mode;
                  const times = rows.filter((r) => r.start && r.end).map((r) => `${to12h(r.start!)}–${to12h(r.end!)}`).join(", ");
                  const [y, m, d] = date.split("-").map(Number);
                  const dt = new Date(y, m - 1, d);
                  const monthShort = dt.toLocaleDateString(dateLocale, { month: "short" }).replace(".", "").toUpperCase();
                  const weekdayLong = dt.toLocaleDateString(dateLocale, { weekday: "long" });
                  const summary = mode === "closed" ? t("excClosedLabel") : `${mode === "custom" ? t("excCustomLabel") : t("excExtraLabel")} · ${times}`;
                  return (
                    <div key={date} className="flex items-center gap-3 rounded-xl border border-[#e5e7eb] p-2.5">
                      <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-[#f9fafb]">
                        <span className="text-[9px] font-bold uppercase text-[#dc5b4b] leading-none">{monthShort}</span>
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

      {/* ── "Cambiar un día" modal ──────────────────────────────────────── */}
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
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowPrivateConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 z-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 mb-4">
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
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConflict(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#fef3c7]">
              <Calendar className="h-6 w-6 text-[#b45309]" />
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
// "Cambiar un día" — pick a date on a month calendar, then choose: add extra hours,
// replace that day's hours, or close the day. Edits ONE date without touching the
// recurring template.
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
    if (rows.length === 0) { setMode("extra"); setFranjas([{ id: genId(), start: "18:00", end: "20:00" }]); setDur(defaultDuration); return; }
    const m = rows[0].mode;
    setMode(m);
    setDur(rows[0].slot_minutes ?? defaultDuration);
    setFranjas(m === "closed" ? [] : rows.filter((r) => r.start && r.end).map((r) => ({ id: genId(), start: r.start!, end: r.end! })));
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
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
                    <TimeSelect value={f.start} onChange={(v) => setFranjas((prev) => prev.map((x) => (x.id === f.id ? { ...x, start: v, ...(toMins(x.end) <= toMins(v) ? { end: hhmmLocal(Math.min(toMins(v) + 60, 23 * 60 + 30)) } : {}) } : x)))} className="min-w-0 flex-1 sm:flex-none sm:w-32" />
                    <span className="shrink-0 text-[#9ca3af]">–</span>
                    <TimeSelect value={f.end} min={hhmmLocal(Math.min(toMins(f.start) + 30, 23 * 60 + 30))} onChange={(v) => setFranjas((prev) => prev.map((x) => (x.id === f.id ? { ...x, end: v } : x)))} className="min-w-0 flex-1 sm:flex-none sm:w-32" error={toMins(f.end) <= toMins(f.start) ? t("toAfterFrom") : undefined} />
                    <button type="button" onClick={() => setFranjas((prev) => prev.filter((x) => x.id !== f.id))} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-red-500 transition-colors" aria-label={t("remove")}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => setFranjas((prev) => [...prev, nextFranja(prev)])} className="inline-flex items-center gap-1 self-start text-xs font-medium text-[#009FD9] hover:underline cursor-pointer">
                  <Plus className="h-3.5 w-3.5" /> {t("addFranja")}
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
