"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Plus, X, Lock, Loader2, MapPin, AlertCircle } from "lucide-react";
import { type ContactPreference } from "@/lib/constants";
import { crTodayISO, isPastDateTimeCR, isTooSoonCR, nextFullHourCR, LEAD_MINUTES } from "@/lib/time-cr";
import { getCategoryLabel } from "@/lib/data/categories";
import { TimeSelect, to12h } from "@/components/ui/time-select";

type Slot = { id?: string; slot_date: string; slot_time: string; location_id?: string | null; category_id?: string | null };

const GENERAL_LOC = "general";
const VIDEO_LOC = "videoconsulta";

const INTERVAL_VALUES = [30, 60, 120, 0];

function hhmm(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

function toMins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function prettyDate(iso: string, dateLocale: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(dateLocale, {
    weekday: "short", day: "numeric", month: "short",
  });
}

// All "today" comparisons use Costa Rica time so past slots are rejected
// consistently regardless of the professional's device timezone.
function todayISO(): string {
  return crTodayISO();
}

const DAY_END_MIN = 23 * 60 + 30; // last selectable time on the 30-min grid

// Sensible default for the "hora puntual" picker: today → the next rounded full
// hour (same logic as "Desde"); a future date → 8:00 a.m. (its next full hour would
// be midnight). The picker's `min` + the insert check still enforce the CR 15-min lead.
function puntualDefault(dateISO: string): string {
  const t = nextFullHourCR(dateISO);
  return t === "00:00" ? "08:00" : t;
}

// Default "Desde": a future day starts at 8:00 a.m.; today starts at the next
// valid rounded full hour (CR, respects the lead). Never returns midnight.
function defaultStartFor(dateISO: string): string {
  const floor = nextFullHourCR(dateISO); // future → "00:00"; today → next full hour
  return floor === "00:00" ? "08:00" : floor;
}

// Default "Hasta" for a given start — ALWAYS strictly after it, so the auto-defaults
// can never trip the "Hasta debe ser después de Desde" validation. Aims at the 5:00
// p.m. workday end, but for a late start it's at least one hour later (capped to the
// end of the grid).
function defaultEndFor(start: string): string {
  const s = toMins(start);
  const end = Math.min(Math.max(17 * 60, s + 60), DAY_END_MIN);
  // Near midnight there may be no room left after `s`; keep it valid by one step.
  return hhmm(end > s ? end : Math.min(s + 30, DAY_END_MIN));
}

type Place = { id?: string; name: string };
// Coverage areas can be cantón-, provincia-, or country-level (item 2): ALL are
// schedulable, not just cantón-level ones.
type Coverage = { level?: "canton" | "provincia" | "country"; provinciaId?: string; cantonId?: string; cantonName?: string; provinceName?: string };

interface AvailabilityEditorProps {
  professionalId: string;
  initialPublic?: boolean;
  initialContactPreference?: ContactPreference;
  workplaces?: Place[];
  coverageAreas?: Coverage[];
  /** The pro's professions (category ids). Schedules are tied to a profession. */
  professions?: string[];
  onSaved?: () => void;
}

export function AvailabilityEditor({ professionalId, initialPublic = true, workplaces = [], coverageAreas = [], professions = [], onSaved }: AvailabilityEditorProps) {
  const locale = useLocale();
  const t = useTranslations("availabilityEditor");
  const dateLocale = locale === "en" ? "en-US" : "es-CR";
  const intervalLabel = (v: number) => t(v === 0 ? "intervalCustom" : (`interval${v}` as "interval30" | "interval60" | "interval120"));
  const rich = { strong: (c: React.ReactNode) => <strong>{c}</strong> };
  const [isPublic, setIsPublic] = useState(initialPublic);

  // ("Permitir contacto por llamada" moved to Mi perfil → Contacto.)

  // Schedules belong to a specific location: each workplace, each travel-coverage
  // area (item 2 — cantón/provincia/país ALL schedulable), and Videoconsulta.
  const locationOptions = useMemo(() => {
    const opts: { id: string; label: string }[] = [];
    for (const w of workplaces) if (w.id) opts.push({ id: w.id, label: w.name });
    // Coverage areas ("me desplazo") are schedulable at every level — a traveling
    // pro must be able to add hours even with only province/country coverage.
    coverageAreas.forEach((c, i) => {
      const level = c.level ?? (c.cantonId ? "canton" : c.provinciaId ? "provincia" : "country");
      const key = c.cantonId ?? c.provinciaId ?? `pais${i}`;
      const label =
        level === "country"
          ? t("covCountry")
          : level === "provincia"
          ? t("covProvincia", { province: c.provinceName ?? "Provincia" })
          : t("covCanton", { canton: `${c.cantonName ?? "Zona"}${c.provinceName ? `, ${c.provinceName}` : ""}` });
      opts.push({ id: `cov_${key}`, label });
    });
    return opts;
  }, [workplaces, coverageAreas, t]);
  const [genLocation, setGenLocation] = useState("");

  // Profession this schedule is for (item 1). Each schedule belongs to a
  // (profession + location) pair. Defaults to the only/primary profession.
  const professionOptions = useMemo(() => professions.filter(Boolean), [professions]);
  const [genCategory, setGenCategory] = useState("");
  useEffect(() => {
    if (professionOptions.length > 0 && !professionOptions.includes(genCategory)) {
      setGenCategory(professionOptions[0]);
    }
  }, [professionOptions, genCategory]);

  // Keep the selected location valid as options change.
  useEffect(() => {
    if (locationOptions.length > 0 && !locationOptions.some((o) => o.id === genLocation)) {
      setGenLocation(locationOptions[0].id);
    }
  }, [locationOptions, genLocation]);

  // Resolve any slot's location id to its human label using the SAME option list
  // used to create them — so workplaces, coverage zones (cov_*) and videoconsulta
  // all display correctly in "Tus horarios próximos" (item 2).
  const locLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of locationOptions) m.set(o.id, o.label);
    return m;
  }, [locationOptions]);
  function locationLabel(id?: string | null): string {
    if (!id || id === GENERAL_LOC) return t("general");
    if (id === VIDEO_LOC) return t("videoconsulta");
    return locLabelById.get(id) ?? workplaces.find((w) => w.id === id)?.name ?? t("locationFallback");
  }

  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [showPrivateConfirm, setShowPrivateConfirm] = useState(false);

  // Close the "hacer privada" confirm on Escape (it already closes on scrim tap).
  useEffect(() => {
    if (!showPrivateConfirm) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowPrivateConfirm(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showPrivateConfirm]);

  // Generator form. Future day → 8:00 a.m.–5:00 p.m.; today → next valid time with a
  // sensible later end. `defaultEndFor` guarantees the end is ALWAYS after the start,
  // so the auto-defaults can never trip the "Hasta debe ser después" validation.
  const [genDate, setGenDate] = useState(todayISO());
  const [genStart, setGenStart] = useState(() => defaultStartFor(todayISO()));
  const [genEnd, setGenEnd] = useState(() => defaultEndFor(defaultStartFor(todayISO())));
  const [interval, setInterval] = useState(60);
  const [customInterval, setCustomInterval] = useState(45);
  const [singleTime, setSingleTime] = useState(puntualDefault(todayISO()));
  const [busy, setBusy] = useState(false);
  const [pastError, setPastError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("availability_slots")
      .select("id, slot_date, slot_time, location_id, category_id")
      .eq("professional_id", professionalId)
      .gte("slot_date", todayISO())
      .order("slot_date")
      .order("slot_time")
      .then(({ data, error }) => {
        // Retry without the optional columns if not migrated yet (location_id/category_id).
        if (error && /location_id|category_id|column/i.test(error.message)) {
          supabase
            .from("availability_slots")
            .select("id, slot_date, slot_time")
            .eq("professional_id", professionalId)
            .gte("slot_date", todayISO())
            .order("slot_date")
            .order("slot_time")
            .then(({ data: d2 }) => {
              setSlots((d2 ?? []).map((s) => ({ id: s.id, slot_date: s.slot_date, slot_time: String(s.slot_time).slice(0, 5), location_id: null, category_id: null })));
              setLoading(false);
            });
          return;
        }
        setSlots(
          (data ?? []).map((s) => ({ id: s.id, slot_date: s.slot_date, slot_time: String(s.slot_time).slice(0, 5), location_id: (s as { location_id?: string }).location_id ?? null, category_id: (s as { category_id?: string }).category_id ?? null }))
        );
        setLoading(false);
      });
  }, [professionalId]);

  // Group slots by date for display
  const grouped = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      if (!map.has(s.slot_date)) map.set(s.slot_date, []);
      map.get(s.slot_date)!.push(s);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, list]) => [date, list.sort((x, y) => x.slot_time.localeCompare(y.slot_time))] as const);
  }, [slots]);

  function toggleVisibility() {
    // Turning OFF requires confirmation (it deletes all schedules).
    if (isPublic) { setShowPrivateConfirm(true); return; }
    makePublic();
  }

  async function makePublic() {
    setIsPublic(true);
    setSavingVisibility(true);
    const supabase = createClient();
    // Keep the stored contact_preference in sync (pública = "ambas") so the
    // /buscar card + schedule logic stay correct now that this is the only control.
    await supabase.from("professionals").update({ availability_public: true, contact_preference: "ambas" }).eq("id", professionalId);
    setSavingVisibility(false);
    onSaved?.();
  }

  async function confirmMakePrivate() {
    setSavingVisibility(true);
    const supabase = createClient();
    // Delete all schedules, mark availability private + WhatsApp-only, then refresh.
    await supabase.from("availability_slots").delete().eq("professional_id", professionalId);
    await supabase.from("professionals").update({ availability_public: false, contact_preference: "solo_whatsapp" }).eq("id", professionalId);
    window.location.reload();
  }

  async function insertSlots(times: string[]) {
    if (times.length === 0) return;
    if (!genLocation) return;
    setPastError(null);
    // Reject past dates outright (CR time).
    if (isPastDateTimeCR(genDate)) {
      setPastError(t("errPastDate"));
      return;
    }
    // Enforce a 15-minute lead time (CR): drop any time less than 15 min ahead.
    // The picker already only offers valid times — this is the safety-net check,
    // and it fires every time (not just once).
    const valid = times.filter((t) => !isTooSoonCR(genDate, t));
    if (valid.length === 0) {
      setPastError(t("errTooSoon", { min: LEAD_MINUTES }));
      return;
    }
    times = valid;
    // A pro can't be in two places at once: any time already scheduled THIS date
    // at a DIFFERENT location (any profession) is a conflict. Skip those times and
    // surface a clear inline error naming the first one + the other location.
    const conflicting = times.filter((time) =>
      slots.some((s) => s.slot_date === genDate && s.slot_time === time && (s.location_id ?? null) !== genLocation)
    );
    if (conflicting.length > 0) {
      const c = conflicting[0];
      const other = slots.find((s) => s.slot_date === genDate && s.slot_time === c && (s.location_id ?? null) !== genLocation);
      setPastError(t("errLocationConflict", { time: to12h(c), location: locationLabel(other?.location_id ?? null) }));
      times = times.filter((time) => !conflicting.includes(time));
      if (times.length === 0) return;
    }
    setBusy(true);
    const supabase = createClient();
    const locId = genLocation;
    const catId = genCategory || null;
    // Skip times that already exist for this date AND location AND profession.
    const existing = new Set(
      slots.filter((s) => s.slot_date === genDate && (s.location_id ?? null) === locId && (s.category_id ?? null) === catId).map((s) => s.slot_time)
    );
    const fresh = times.filter((t) => !existing.has(t));
    if (fresh.length === 0) { setBusy(false); return; }

    const rows = fresh.map((t) => ({ professional_id: professionalId, slot_date: genDate, slot_time: t, location_id: locId, category_id: catId }));
    let { data, error } = await supabase
      .from("availability_slots")
      .insert(rows)
      .select("id, slot_date, slot_time, location_id, category_id");
    // Retry without the optional columns if not migrated yet.
    if (error && /location_id|category_id|column/i.test(error.message)) {
      ({ data, error } = await supabase
        .from("availability_slots")
        .insert(fresh.map((t) => ({ professional_id: professionalId, slot_date: genDate, slot_time: t })))
        .select("id, slot_date, slot_time"));
    }
    setBusy(false);
    if (error) {
      console.error("[availability] insert", error);
      if (/pasado|past/i.test(error.message)) setPastError(t("errPast"));
      return;
    }
    setSlots((prev) => [
      ...prev,
      ...((data ?? []).map((s) => ({ id: s.id, slot_date: s.slot_date, slot_time: String(s.slot_time).slice(0, 5), location_id: (s as { location_id?: string }).location_id ?? locId, category_id: (s as { category_id?: string }).category_id ?? catId }))),
    ]);
    // Adding a schedule automatically makes availability public (+ "ambas").
    if (!isPublic) {
      setIsPublic(true);
      await supabase.from("professionals").update({ availability_public: true, contact_preference: "ambas" }).eq("id", professionalId);
    }
    onSaved?.();
  }

  function generate() {
    setPastError(null);
    const step = interval === 0 ? Math.max(5, customInterval) : interval;
    const start = toMins(genStart);
    const end = toMins(genEnd);
    // Explicit, friendly validation — never a silent no-op (item 1).
    if (end <= start) {
      setPastError(t("errEndBeforeStart"));
      return;
    }
    const times: string[] = [];
    for (let m = start; m + step <= end; m += step) times.push(hhmm(m));
    // Range shorter than one step but still valid → keep the start time.
    if (times.length === 0) times.push(hhmm(start));
    insertSlots(times);
  }

  async function removeSlot(slot: Slot) {
    if (!slot.id) return;
    setSlots((prev) => prev.filter((s) => s.id !== slot.id));
    const supabase = createClient();
    await supabase.from("availability_slots").delete().eq("id", slot.id);
    onSaved?.();
  }

  async function removeDate(date: string) {
    const ids = slots.filter((s) => s.slot_date === date).map((s) => s.id).filter(Boolean) as string[];
    setSlots((prev) => prev.filter((s) => s.slot_date !== date));
    const supabase = createClient();
    await supabase.from("availability_slots").delete().in("id", ids);
    onSaved?.();
  }

  const inputCls =
    "h-9 px-3 rounded-xl border border-[#e5e7eb] bg-white text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all";

  // When the chosen date is today, both "Desde" and "hora puntual" start at the
  // next ROUNDED full hour (e.g. 12:49 → 13:00) and stay in sync.
  const isToday = genDate === todayISO();
  const startMin = isToday ? nextFullHourCR(genDate) : undefined; // Desde / hora puntual floor
  const startMinMins = startMin ? toMins(startMin) : 0;

  // "Hasta" can NEVER be ≤ "Desde": its options start one grid step after "Desde"
  // (and never before today's lead floor). The invalid combo can't be picked.
  const hastaMin = hhmm(Math.min(Math.max(toMins(genStart) + 30, startMinMins), 24 * 60 - 30));

  // Picking "Desde" auto-bumps "Hasta" so the range stays valid.
  function setDesde(v: string) {
    setPastError(null);
    setGenStart(v);
    if (toMins(genEnd) <= toMins(v)) setGenEnd(defaultEndFor(v));
  }

  // Range validity drives the single inline "Hasta" error + the disabled "Generar".
  const rangeInvalid = toMins(genEnd) <= toMins(genStart);
  // Keep the fields valid as time passes / on switching back to today: bump "Desde"
  // up to the next full hour AND bump "Hasta" with it so the defaults never go stale
  // into an invalid range (this was the false-error bug).
  useEffect(() => {
    if (!startMin) return;
    if (toMins(genStart) < toMins(startMin)) {
      setGenStart(startMin);
      if (toMins(genEnd) <= toMins(startMin)) setGenEnd(defaultEndFor(startMin));
    }
    if (toMins(singleTime) < toMins(startMin)) setSingleTime(startMin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startMin]);

  return (
    <div className="flex flex-col gap-4">
      {/* ── ONE control (privada vs pública) decides everything below. Private =
             WhatsApp-only (no agenda); pública = agenda publicada. WhatsApp is
             always available. ── */}
      <div className="rounded-2xl border border-[#e5e7eb] p-4 sm:p-5">
        {/* "Disponibilidad privada" (ON = private; hides + clears slots) */}
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-semibold text-[#111827]">{t("privateLabel")}</p>
          <div className="flex items-center gap-2 shrink-0">
            {savingVisibility && <Loader2 className="h-4 w-4 animate-spin text-[#009FD9]" />}
            <button
              type="button"
              onClick={toggleVisibility}
              disabled={savingVisibility}
              className={cn(
                "relative h-6 w-11 rounded-full transition-all duration-200 shrink-0 cursor-pointer",
                !isPublic ? "bg-[#b45309]" : "bg-[#d1d5db]"
              )}
              aria-label={isPublic ? t("makePrivate") : t("makePublic")}
            >
              <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200", !isPublic ? "left-5" : "left-0.5")} />
            </button>
          </div>
        </div>

        {/* Public agenda → the slot generator lives in the SAME card, under a
            divider (one cohesive flow, fewer borders). */}
        {isPublic && (
        <div className="mt-4 pt-4 border-t border-[#f3f4f6]">
        <h3 className="text-sm font-semibold text-[#111827] mb-4">{t("addHeading")}</h3>

        {locationOptions.length === 0 ? (
          <div className="rounded-xl bg-[#fffbeb] border border-[#fde68a] p-4 text-sm text-[#92400e]">
            {t.rich("needLocation", rich)}
          </div>
        ) : (
        <div className="flex flex-col gap-4">
          {/* Paso 1 — ¿para qué servicio y en qué ubicación? */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {professionOptions.length > 1 && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[#6b7280]">{t("professionService")}</label>
                <select value={genCategory} onChange={(e) => setGenCategory(e.target.value)} className={cn(inputCls, "cursor-pointer w-full")}>
                  {professionOptions.map((p) => <option key={p} value={p}>{getCategoryLabel(p, locale)}</option>)}
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[#6b7280] flex items-center gap-1"><MapPin className="h-3 w-3" /> {t("scheduleLocation")}</label>
              <select value={genLocation} onChange={(e) => setGenLocation(e.target.value)} className={cn(inputCls, "cursor-pointer w-full")}>
                {locationOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Paso 2 — el rango horario. */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[#6b7280]">{t("date")}</label>
              <input type="date" min={todayISO()} value={genDate} onChange={(e) => {
                const d = e.target.value;
                setGenDate(d);
                setPastError(null);
                // Reset to valid defaults for the chosen day (future 8–5; today next
                // valid time + sensible later end) so the range is never invalid.
                const s = defaultStartFor(d);
                setGenStart(s);
                setGenEnd(defaultEndFor(s));
                setSingleTime(puntualDefault(d));
              }} className={cn(inputCls, "h-10")} />
            </div>
            <TimeSelect label={t("from")} min={startMin} value={genStart} onChange={setDesde} className="w-32" />
            {/* Visual "→" between the two pickers. */}
            <span className="text-[#9ca3af] mb-2.5 hidden sm:inline">→</span>
            <TimeSelect label={t("to")} min={hastaMin} value={genEnd} onChange={(v) => { setGenEnd(v); setPastError(null); }} className="w-32" error={rangeInvalid ? t("toAfterFrom") : undefined} />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[#6b7280]">{t("interval")}</label>
              <select value={interval} onChange={(e) => setInterval(Number(e.target.value))} className={cn(inputCls, "h-10 cursor-pointer")}>
                {INTERVAL_VALUES.map((v) => (
                  <option key={v} value={v}>{intervalLabel(v)}</option>
                ))}
              </select>
            </div>
            {interval === 0 && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[#6b7280]">{t("minutes")}</label>
                <input type="number" min={5} step={5} value={customInterval} onChange={(e) => setCustomInterval(Number(e.target.value))} className={cn(inputCls, "h-10 w-24")} />
              </div>
            )}
          </div>

          {/* Generar — its own row, clearly OFF (solid gray) when the range is invalid. */}
          <Button
            type="button"
            size="md"
            onClick={generate}
            disabled={busy || rangeInvalid}
            aria-disabled={busy || rangeInvalid}
            className={cn("w-full sm:w-auto sm:self-start", rangeInvalid && "bg-[#d1d5db] text-white shadow-none hover:bg-[#d1d5db] hover:shadow-none")}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {t("generate")}
          </Button>

          <div className="flex flex-wrap items-end gap-2 pt-3 border-t border-[#f3f4f6]">
            <span className="text-xs text-[#9ca3af] mb-2.5">{t("orSingle")}</span>
            <TimeSelect min={startMin} value={singleTime} onChange={setSingleTime} className="w-36" />
            <button
              type="button"
              onClick={() => insertSlots([singleTime])}
              disabled={busy}
              className="text-xs font-medium text-[#009FD9] hover:underline cursor-pointer mb-2.5"
            >
              {t("addTime", { time: to12h(singleTime) })}
            </button>
          </div>

          {pastError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-100 p-2.5 text-xs text-red-600">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {pastError}
            </div>
          )}
        </div>
        )}
        </div>
        )}
      </div>

      {/* ── Slot list (public agenda only) ───────────────────────── */}
      {isPublic && (
      <div>
        <h3 className="text-sm font-semibold text-[#111827] mb-3">{t("upcomingTitle")}</h3>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[#009FD9]" /></div>
        ) : grouped.length === 0 ? (
          <div className="text-center py-10 rounded-xl bg-[#f4f7fa] border border-dashed border-[#d1d5db]">
            <p className="text-sm text-[#6b7280]">{t("noSlots")}</p>
            <p className="text-xs text-[#9ca3af] mt-1">{t("noSlotsSub")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {grouped.map(([date, list]) => {
              // Within a day, group by (profesión + ubicación) so a pro with several
              // professions/locations can tell each block apart.
              const subMap = new Map<string, Slot[]>();
              for (const s of list) {
                const key = `${s.category_id ?? ""}|${s.location_id ?? ""}`;
                if (!subMap.has(key)) subMap.set(key, []);
                subMap.get(key)!.push(s);
              }
              const subgroups = Array.from(subMap.entries());
              return (
                <div key={date} className="rounded-2xl border border-[#e5e7eb] overflow-hidden">
                  {/* Day header */}
                  <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-[#f9fafb] border-b border-[#eef2f5]">
                    <span className="text-sm font-semibold text-[#111827] capitalize">{prettyDate(date, dateLocale)}</span>
                    <button onClick={() => removeDate(date)} className="text-xs font-medium text-[#9ca3af] hover:text-red-500 transition-colors cursor-pointer">
                      {t("removeDay")}
                    </button>
                  </div>
                  <div className="p-3 sm:p-4 flex flex-col gap-3">
                    {subgroups.map(([key, sg]) => {
                      const cat = sg[0].category_id;
                      const loc = sg[0].location_id ?? null;
                      return (
                        <div key={key} className="flex flex-col gap-2">
                          {(cat || loc) && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {cat && <span className="rounded-md bg-[#EBF5FB] text-[#0089bb] text-[11px] font-medium px-1.5 py-0.5">{getCategoryLabel(cat, locale)}</span>}
                              {loc && <span className="inline-flex items-center gap-1 rounded-md bg-[#f3f4f6] text-[#374151] text-[11px] font-medium px-1.5 py-0.5"><MapPin className="h-3 w-3" />{locationLabel(loc)}</span>}
                            </div>
                          )}
                          {/* Uniform time chips: an even grid → every chip is the SAME
                              width; the full time always fits (no truncation). */}
                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                            {sg.map((s) => (
                              <span key={s.id ?? `${s.slot_time}-${s.location_id ?? ""}-${s.category_id ?? ""}`} className="group inline-flex items-center justify-center gap-1 rounded-lg bg-[#EBF5FB] text-[#0089bb] text-[13px] font-medium tabular-nums whitespace-nowrap pl-2 pr-1 py-1.5">
                                {to12h(s.slot_time)}
                                <button onClick={() => removeSlot(s)} className="rounded-md p-0.5 text-[#0089bb]/60 hover:text-[#0089bb] hover:bg-[#009FD9]/20 transition-colors cursor-pointer shrink-0" aria-label={t("remove")}>
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* Private → a short note instead of the agenda. */}
      {!isPublic && (
        <div className="rounded-xl bg-[#fffbeb] border border-[#fde68a] p-4 text-sm text-[#92400e] flex items-start gap-2">
          <Lock className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            {t.rich("privateNote", { ...rich, call: "" })}
          </span>
        </div>
      )}

      {/* Confirmation modal — making availability private deletes all schedules */}
      {showPrivateConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowPrivateConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 z-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 mb-4">
              <Lock className="h-5 w-5 text-red-500" />
            </div>
            <h3 className="text-lg font-bold text-[#111827] mb-1">{t("confirmTitle")}</h3>
            <p className="text-sm text-[#6b7280] mb-5">{t("confirmBody")}</p>
            <div className="flex gap-3">
              <Button variant="outline" size="md" className="flex-1" onClick={() => setShowPrivateConfirm(false)} disabled={savingVisibility}>
                {t("cancel")}
              </Button>
              <Button
                size="md"
                className="flex-1 bg-red-500 hover:bg-red-600"
                onClick={confirmMakePrivate}
                loading={savingVisibility}
              >
                {t("confirmPrivate")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
