"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Plus, X, Lock, Loader2, MapPin, ChevronDown, ChevronLeft, ChevronRight, Calendar, Pencil, Trash2 } from "lucide-react";
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
  // Appointment length is ONE global value (applies to every block/location).
  const [durationPref, setDurationPref] = useState(60);

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

  // Unified per-day weekly view (sprint 238): blocks carry their own location, so
  // there are NO "HORARIO PARA" tabs. The per-block location dropdown only appears
  // when the pro has 2+ locations; otherwise it's just a simple weekly schedule.
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
  // also clear (e.g. the weekly hours when adding `extra` on the same location/day) —
  // `ownBaseBody` is the message to show when the proposal overlaps that base (defaults
  // to the generic self-overlap copy; `extra` passes a "overlaps your usual hours" one).
  // Returns a localized conflict {title, body} to block with, or null when it's safe.
  function findOverlapConflict(
    loc: string,
    proposed: [number, number][],
    scope: { weekday: number } | { date: string },
    ownBase: [number, number][] = [],
    ownBaseBody: string = t("conflictSelf")
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
          return { title: t("conflictTitle"), body: ownBaseBody };
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

  // ── "Already occupied elsewhere" guidance (DATE; used by the "Cambiar un día"
  // modal) — other locations' occupied ranges on a specific DATE, applying the full
  // closed/custom/extra precedence via rangesForLocOnDate. (The weekly view no longer
  // needs a per-weekday hint — every location's blocks are shown together.)
  function otherOccupiedForDate(date: string): { label: string; ranges: [number, number][] }[] {
    const otherLocs = [...new Set([...weekly, ...exceptions].map((r) => r.location_id))].filter((l) => l && l !== genLocation);
    return otherLocs
      .map((loc) => ({ label: locationLabel(loc), ranges: mergeRanges(rangesForLocOnDate(loc, date, weekly, exceptions)) }))
      .filter((o) => o.ranges.length > 0);
  }

  // Render a location's occupied ranges as "8:00 AM–3:00 PM, 5:00 PM–7:00 PM".
  function fmtRanges(ranges: [number, number][]): string {
    return ranges.map(([s, e]) => `${to12h(hhmm(s))} – ${to12h(hhmm(e))}`).join(", ");
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
      setDurationPref(wkRows[0]?.slot_minutes ?? excRows[0]?.slot_minutes ?? 60);
      setLoading(false);
      // Refresh the materialized window from the template (keeps the rolling 70-day
      // horizon current). Skip when there is NO template at all, so a legacy pro's
      // manually-created slots are preserved until they adopt the weekly editor.
      if (isPublic && (wkRows.length > 0 || excRows.length > 0)) regenerate(wkRows, excRows);
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
      const arr = map.get(r.weekday) ?? [];
      arr.push({ id: r.id ?? genId(), locationId: r.location_id, start: r.start, end: r.end });
      map.set(r.weekday, arr);
    }
    // Sort by start, then location; empty drafts (just-added, no time) go LAST.
    for (const arr of map.values()) arr.sort((a, b) => (!a.start ? 1 : !b.start ? -1 : a.start.localeCompare(b.start) || a.locationId.localeCompare(b.locationId)));
    return map;
  }, [weekly]);
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
  function validateDayBlocks(weekday: number, complete: Block[]): { title: string; body: string } | null {
    const hypo: WeeklyRow[] = [
      ...weekly.filter((r) => r.weekday !== weekday),
      ...complete.map((b) => ({ location_id: b.locationId, category_id: null, weekday, start: b.start, end: b.end, slot_minutes: durationPref })),
    ];
    const start = todayISO();
    for (let i = 0; i <= HORIZON_DAYS; i++) {
      const date = addDaysISO(start, i);
      if (weekdayOf(date) !== weekday) continue;
      const locs = [...new Set([...hypo, ...exceptions].map((r) => r.location_id))].filter(Boolean);
      const flat: { loc: string; r: [number, number] }[] = [];
      for (const loc of locs) for (const r of rangesForLocOnDate(loc, date, hypo, exceptions)) flat.push({ loc, r });
      for (let a = 0; a < flat.length; a++) for (let b = a + 1; b < flat.length; b++) {
        if (rangesOverlap(flat[a].r[0], flat[a].r[1], flat[b].r[0], flat[b].r[1])) {
          return flat[a].loc === flat[b].loc
            ? { title: t("conflictTitle"), body: t("conflictSelf") }
            : { title: t("conflictTitle"), body: t("conflictCross", { place: locationLabel(flat[b].loc), start: to12h(hhmm(flat[b].r[0])), end: to12h(hhmm(flat[b].r[1])) }) };
        }
      }
    }
    return null;
  }

  // A new block's SMART default: 8 AM–5 PM when it wouldn't conflict with the day's
  // other blocks, else EMPTY (so the pro freely picks a non-conflicting time).
  function smartDefaultBlock(weekday: number, existing: Block[], loc: string): Block {
    const probe = validateDayBlocks(weekday, [...existing.filter(isCompleteFranja), { id: "_probe", locationId: loc, start: "08:00", end: "17:00" }]);
    return probe ? { id: genId(), locationId: loc, start: "", end: "" } : { id: genId(), locationId: loc, start: "08:00", end: "17:00" };
  }

  // ── Persist ALL of a weekday's blocks (every location) at once, then re-materialize. ──
  // Backend model unchanged: each COMPLETE block writes its own `availability_weekly`
  // row (category_id null → absorbs legacy). INCOMPLETE drafts stay in LOCAL state so
  // the row shows, but are NOT validated/written/materialized.
  async function persistDay(weekday: number, blocks: Block[]) {
    const complete = blocks.filter(isCompleteFranja);
    const c = validateDayBlocks(weekday, complete);
    if (c) { setConflict(c); return; }

    const next = weekly.filter((r) => r.weekday !== weekday);
    for (const b of blocks) next.push({ location_id: b.locationId, category_id: null, weekday, start: b.start, end: b.end, slot_minutes: durationPref });
    setWeekly(next);

    const supabase = createClient();
    await supabase.from("availability_weekly").delete().eq("professional_id", professionalId).eq("weekday", weekday);
    if (complete.length > 0) {
      await supabase.from("availability_weekly").insert(complete.map((b) => ({ professional_id: professionalId, location_id: b.locationId, category_id: null, weekday, start_time: b.start, end_time: b.end, slot_minutes: durationPref })));
    }
    await regenerate(next, exceptions); // skips incomplete drafts
  }

  function toggleDay(weekday: number) {
    const cur = blocksFor(weekday);
    if (cur.length > 0) { persistDay(weekday, []); return; } // OFF → clear the whole day (all locations)
    persistDay(weekday, [smartDefaultBlock(weekday, [], defaultLocationId)]);
  }
  function addBlock(weekday: number) {
    const cur = blocksFor(weekday);
    persistDay(weekday, [...cur, smartDefaultBlock(weekday, cur, defaultLocationId)]);
  }
  function updateBlock(weekday: number, id: string, patch: Partial<Block>) {
    persistDay(weekday, blocksFor(weekday).map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }
  // Copy one configured day's complete ranges to selected destination days.
  async function applyDayToTargets(sourceWeekday: number, targetWeekdays: number[]) {
    const targets = targetWeekdays.filter((wd) => wd !== sourceWeekday);
    if (targets.length === 0) return;

    const template = blocksFor(sourceWeekday)
      .filter(isCompleteFranja)
      .map((b) => ({ locationId: b.locationId, start: b.start, end: b.end }));
    if (template.length === 0) return;

    for (const wd of targets) {
      const c = validateDayBlocks(wd, template.map((s) => ({ id: genId(), ...s })));
      if (c) { setConflict(c); return; }
    }

    const next = weekly.filter((r) => !targets.includes(r.weekday));
    for (const wd of targets) {
      for (const s of template) {
        next.push({ location_id: s.locationId, category_id: null, weekday: wd, start: s.start, end: s.end, slot_minutes: durationPref });
      }
    }

    setWeekly(next);
    const supabase = createClient();
    await supabase.from("availability_weekly").delete().eq("professional_id", professionalId).in("weekday", targets);
    await supabase.from("availability_weekly").insert(
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
    await regenerate(next, exceptions);
    setApplyModal(null);
  }

  async function setDuration(dur: number) {
    setDurationPref(dur);
    const next = weekly.map((r) => ({ ...r, slot_minutes: dur }));
    setWeekly(next);
    const supabase = createClient();
    await supabase.from("availability_weekly").update({ slot_minutes: dur }).eq("professional_id", professionalId);
    await regenerate(next, exceptions);
  }

  // ── Exceptions ("¿Un día distinto?") ──────────────────────────────────────
  // Returns false (without writing) when the proposed hours overlap another location
  // — or this location's own weekly hours when ADDING extra — on that date.
  async function saveException(date: string, mode: ExcMode, franjas: Franja[], dur: number): Promise<boolean> {
    if (mode !== "closed") {
      const proposed = franjas.map((f) => [toMins(f.start), toMins(f.end)] as [number, number]).filter(([s, e]) => e > s);
      // `extra` ADDS to the weekly hours (they still apply that date), so the extra
      // franjas must not overlap THIS location's weekly base for that weekday — block
      // with a message that names the real conflict (the usual hours). `custom`/`closed`
      // REPLACE the weekly hours, so they get no weekly base to clear (only the
      // cross-location check below applies).
      const ownBase: [number, number][] = mode === "extra"
        ? weekly.filter((r) => r.location_id === genLocation && r.weekday === weekdayOf(date) && isCompleteFranja(r)).map((r) => [toMins(r.start), toMins(r.end)])
        : [];
      const c = findOverlapConflict(genLocation, proposed, { date }, ownBase, t("conflictExtraWeekly"));
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
  const [applyModal, setApplyModal] = useState<{ weekday: number } | null>(null);
  const [dayModal, setDayModal] = useState<{ date: string } | null>(null);

  const selectClass = "h-9 rounded-xl border border-[#e5e7eb] bg-white pl-3 pr-9 text-sm font-medium text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all appearance-none cursor-pointer";

  // App-wide autosave: report status to the section title row (inline, no layout shift).
  useReportSaveStatus(savingVisibility || busy, justSaved);

  return (
    <div className="flex flex-col gap-4">

      {/* ── Disponibilidad privada ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-[#e5e7eb] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {/* Blue padlock — signals this controls PRIVATE availability. */}
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EBF5FB] text-[#009FD9]">
              <Lock className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#111827]">{t("privateLabel")}</p>
              <p className="mt-0.5 text-xs text-[#6b7280]">{isPublic ? t("privateSubPublic") : t("privateSubPrivate")}</p>
            </div>
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
        <div className="rounded-2xl border border-[#ccecf8] bg-[#f5fbfe] p-4 text-sm shadow-[0_14px_36px_-30px_rgba(0,159,217,0.65)] sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#009FD9] shadow-sm ring-1 ring-[#d8eef8]">
              <Lock className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#162543]">{t("privateNoticeTitle")}</p>
              <p className="mt-1 text-sm leading-relaxed text-[#4b5563]">
                {t.rich("privateNote", { ...rich, call: "" })}
              </p>
            </div>
          </div>
        </div>
      ) : locationOptions.length === 0 ? (
        <div className="rounded-xl bg-[#fffbeb] border border-[#fde68a] p-4 text-sm text-[#92400e]">
          {t.rich("needLocation", rich)}
        </div>
      ) : (
        <>
          {/* ── Mis horarios de siempre — UNIFIED per-day weekly schedule ─────
              All locations on one screen: each day lists its time blocks together,
              and (when the pro has 2+ locations) each block picks its own location.
              No "HORARIO PARA" tabs, no "ocupado en otra ubicación" hint — overlaps
              are visible at a glance. */}
          <div className="rounded-2xl border border-[#e5e7eb] p-4 sm:p-5">
            {/* Title row: the heading "Mis horarios de siempre" shares ONE line with the
                "Crear citas cada" select + the "Aplicar horario" button. The "se repite cada
                semana" subtitle drops BELOW the row. Wraps gracefully on small screens; the
                button's behavior hint lives in its tooltip. */}
            <div className="mb-4">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                <h3 className="text-sm font-semibold text-[#111827]">{t("alwaysTitle")}</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs font-medium text-[#6b7280]">{t("apptDuration")}</label>
                  <div className="relative">
                    <select value={activeDuration} onChange={(e) => setDuration(Number(e.target.value))} className={selectClass}>
                      {DURATION_OPTIONS.map((d) => <option key={d} value={d}>{t(`dur${d}` as `dur${number}`)}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af]" />
                  </div>
                </div>
              </div>
              <p className="mt-1.5 text-xs text-[#6b7280]">{t("alwaysSubAll")}</p>
            </div>

            <div className="flex flex-col divide-y divide-[#f3f4f6]">
              {WEEKDAY_ORDER.map((wd) => {
                const blocks = blocksFor(wd);
                const on = blocks.length > 0;
                const canApply = blocks.some(isCompleteFranja);
                return (
                  <div key={wd} className="flex flex-col gap-2 py-3 sm:flex-row sm:gap-3 lg:gap-4">
                    {/* toggle + weekday name */}
                    <div className="flex min-w-0 items-center gap-2.5 sm:w-32 sm:shrink-0 sm:pt-1.5 lg:w-36">
                      <button
                        type="button"
                        onClick={() => toggleDay(wd)}
                        className={cn("relative h-5 w-9 rounded-full transition-all duration-200 shrink-0 cursor-pointer", on ? "bg-[#009FD9]" : "bg-[#d1d5db]")}
                        aria-label={t(`weekday${wd}` as `weekday${number}`)}
                        aria-pressed={on}
                      >
                        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-200", on ? "left-[18px]" : "left-0.5")} />
                      </button>
                      <span className={cn("min-w-0 text-sm font-medium", on ? "text-[#111827]" : "text-[#9ca3af]")}>{t(`weekday${wd}` as `weekday${number}`)}</span>
                    </div>

                    {/* blocks */}
                    <div className="min-w-0 flex-1">
                      {!on ? (
                        <p className="text-sm text-[#9ca3af] sm:pt-1.5">{t("closed")}</p>
                      ) : (
                        <div className="flex min-w-0 flex-col gap-2.5 md:flex-row md:items-start md:gap-4">
                          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                            {blocks.map((b) => {
                            const timeRow = (
                              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:w-fit sm:grid-cols-[6.5rem_auto_6.5rem] sm:gap-1.5">
                                <TimeSelect value={b.start} onChange={(v) => updateBlock(wd, b.id, { start: v, ...(b.end && toMins(b.end) <= toMins(v) ? { end: hhmm(Math.min(toMins(v) + 60, 23 * 60 + 30)) } : {}) })} className="min-w-0 w-full sm:w-[6.5rem]" />
                                <span className="shrink-0 text-[#9ca3af]">–</span>
                                <TimeSelect value={b.end} min={b.start ? hhmm(Math.min(toMins(b.start) + 30, 23 * 60 + 30)) : undefined} onChange={(v) => updateBlock(wd, b.id, { end: v })} className="min-w-0 w-full sm:w-[6.5rem]" error={b.start && b.end && toMins(b.end) <= toMins(b.start) ? t("toAfterFrom") : undefined} />
                              </div>
                            );
                            // Single-location pros: just the time row (clean, compact, no location UI).
                            if (!isMultiLocation) return <div key={b.id}>{timeRow}</div>;
                            const currentLocationLabel = locationOptions.find((o) => o.id === b.locationId)?.label ?? "";
                            // 2+ locations: location first, hours below, with no extra card chrome.
                            // Keep this compact so the day actions stay on the same row; long
                            // addresses truncate in the control but remain available in the option/title.
                            return (
                              <div key={b.id} className="flex w-full flex-col gap-2 sm:w-[14.25rem]">
                                <div className="relative min-w-0">
                                  <MapPin className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#009FD9]" />
                                  <select
                                    value={b.locationId}
                                    onChange={(e) => updateBlock(wd, b.id, { locationId: e.target.value })}
                                    aria-label={t("blockLocationAria")}
                                    title={currentLocationLabel}
                                    className="h-10 w-full appearance-none truncate rounded-xl border border-[#e5e7eb] bg-[#f9fafb] pl-9 pr-8 text-xs font-semibold text-[#374151] hover:border-[#cbd5e1] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent cursor-pointer transition-colors"
                                  >
                                    {locationOptions.map((o) => <option key={o.id} value={o.id} title={o.label}>{o.label}</option>)}
                                  </select>
                                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af]" />
                                </div>
                                {timeRow}
                              </div>
                            );
                            })}
                          </div>
                          <div className="flex min-h-10 w-full min-w-0 flex-row flex-wrap items-center justify-start gap-x-4 gap-y-2 md:w-[clamp(12rem,24vw,17rem)] md:shrink-0 md:justify-end">
                            <button type="button" onClick={() => addBlock(wd)} className="inline-flex min-w-0 items-center justify-end gap-1 text-left text-xs font-medium leading-tight text-[#009FD9] hover:underline cursor-pointer md:text-right">
                              <Plus className="h-3.5 w-3.5 shrink-0" /> <span>{t("addFranja")}</span>
                            </button>
                            {canApply && (
                              <button type="button" onClick={() => setApplyModal({ weekday: wd })} className="min-w-0 text-left text-xs font-medium leading-tight text-[#6b7280] hover:text-[#009FD9] hover:underline cursor-pointer md:text-right">
                                {t("applyToOtherDays")}
                              </button>
                            )}
                          </div>
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
              <div className="flex flex-wrap items-center gap-2">
                {/* Exceptions are per-location — pick which location they apply to. */}
                {isMultiLocation && (
                  <div className="relative">
                    <select value={genLocation} onChange={(e) => setGenLocation(e.target.value)} aria-label={t("excLocationAria")} className={selectClass}>
                      {locationOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af]" />
                  </div>
                )}
                <Button type="button" variant="secondary" size="sm" onClick={() => setDayModal({ date: todayISO() })}>
                  <Calendar className="h-4 w-4" /> {t("changeDay")}
                </Button>
              </div>
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
    <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full rounded-t-2xl bg-white p-5 shadow-2xl sm:max-w-sm sm:rounded-2xl">
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
          <button type="button" onClick={() => setSelected(weekdays)} className="rounded-full border border-[#dbeafe] px-3 py-1.5 text-xs font-semibold text-[#008ce0] hover:bg-[#EBF5FB]">
            {t("mondayToFriday")}
          </button>
          <button type="button" onClick={() => setSelected(targets)} className="rounded-full border border-[#dbeafe] px-3 py-1.5 text-xs font-semibold text-[#008ce0] hover:bg-[#EBF5FB]">
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
