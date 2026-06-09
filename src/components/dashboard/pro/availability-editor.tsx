"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Plus, X, CalendarPlus, Globe, Lock, Loader2, Video, MapPin, AlertCircle } from "lucide-react";
import { CONTACT_PREFERENCES, type ContactPreference } from "@/lib/constants";
import { crTodayISO, isPastDateTimeCR, isTooSoonCR, nextFullHourCR, crDatePretty, LEAD_MINUTES } from "@/lib/time-cr";
import { getCategoryLabel } from "@/lib/data/categories";
import { TimeSelect, to12h } from "@/components/ui/time-select";

type Slot = { id?: string; slot_date: string; slot_time: string; location_id?: string | null; category_id?: string | null };

const GENERAL_LOC = "general";
const VIDEO_LOC = "videoconsulta";

const INTERVAL_OPTIONS = [
  { value: 30, label: "Cada 30 min" },
  { value: 60, label: "Cada hora" },
  { value: 120, label: "Cada 2 horas" },
  { value: 0, label: "Personalizado" },
];

function hhmm(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

function toMins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Part of the day a slot falls in — used to visually group the chips so a long
// list (5:00, 5:15, 5:30…) is easy to scan. Mañana <12h · Tarde 12–18h · Noche ≥18h.
const DAY_PARTS = ["Mañana", "Tarde", "Noche"] as const;
type DayPart = (typeof DAY_PARTS)[number];
function partOfDay(time: string): DayPart {
  const h = Math.floor(toMins(time) / 60);
  if (h < 12) return "Mañana";
  if (h < 18) return "Tarde";
  return "Noche";
}

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][date.getDay()];
  // Costa Rica style dd/mm/aaaa.
  return `${weekday} ${crDatePretty(iso)}`;
}

// All "today" comparisons use Costa Rica time so past slots are rejected
// consistently regardless of the professional's device timezone.
function todayISO(): string {
  return crTodayISO();
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
  initialVideoconsulta?: boolean;
  initialAllowPhoneCall?: boolean;
  onSaved?: () => void;
}

export function AvailabilityEditor({ professionalId, initialPublic = true, initialContactPreference = "ambas", workplaces = [], coverageAreas = [], professions = [], initialVideoconsulta = false, initialAllowPhoneCall = false, onSaved }: AvailabilityEditorProps) {
  const [isPublic, setIsPublic] = useState(initialPublic);
  const [contactPreference, setContactPreference] = useState<ContactPreference>(initialContactPreference);
  const [savingContact, setSavingContact] = useState(false);
  const [videoconsulta, setVideoconsulta] = useState(initialVideoconsulta);
  const [allowPhoneCall, setAllowPhoneCall] = useState(initialAllowPhoneCall);

  async function toggleAllowPhoneCall() {
    const next = !allowPhoneCall;
    setAllowPhoneCall(next);
    const supabase = createClient();
    await supabase.from("professionals").update({ allow_phone_call: next }).eq("id", professionalId);
    onSaved?.();
  }

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
          ? "Todo el país (a domicilio)"
          : level === "provincia"
          ? `${c.provinceName ?? "Provincia"} (a domicilio)`
          : `${c.cantonName ?? "Zona"}${c.provinceName ? `, ${c.provinceName}` : ""} (a domicilio)`;
      opts.push({ id: `cov_${key}`, label });
    });
    if (videoconsulta) opts.push({ id: VIDEO_LOC, label: "Videoconsulta" });
    return opts;
  }, [workplaces, coverageAreas, videoconsulta]);
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
    if (!id || id === GENERAL_LOC) return "General";
    if (id === VIDEO_LOC) return "Videoconsulta";
    return locLabelById.get(id) ?? workplaces.find((w) => w.id === id)?.name ?? "Ubicación";
  }

  async function toggleVideoconsulta() {
    const next = !videoconsulta;
    setVideoconsulta(next);
    if (!next && genLocation === VIDEO_LOC) setGenLocation(GENERAL_LOC);
    const supabase = createClient();
    await supabase.from("professionals").update({ videoconsulta: next }).eq("id", professionalId);
    onSaved?.();
  }
  // "solo_whatsapp" hides all scheduling — those pros only take WhatsApp.
  const schedulingEnabled = contactPreference !== "solo_whatsapp";

  async function changeContactPreference(value: ContactPreference) {
    setContactPreference(value);
    setSavingContact(true);
    const supabase = createClient();
    await supabase.from("professionals").update({ contact_preference: value }).eq("id", professionalId);
    setSavingContact(false);
    onSaved?.();
  }
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [showPrivateConfirm, setShowPrivateConfirm] = useState(false);

  // Generator form. For TODAY the start defaults to the next rounded full hour
  // (e.g. 12:49 → 13:00); "hora puntual" uses the SAME default so both stay in sync.
  const initialStart = nextFullHourCR(todayISO());
  const [genDate, setGenDate] = useState(todayISO());
  const [genStart, setGenStart] = useState(initialStart);
  const [genEnd, setGenEnd] = useState("17:00");
  const [interval, setInterval] = useState(60);
  const [customInterval, setCustomInterval] = useState(45);
  const [singleTime, setSingleTime] = useState(initialStart);
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
    await supabase.from("professionals").update({ availability_public: true }).eq("id", professionalId);
    setSavingVisibility(false);
    onSaved?.();
  }

  async function confirmMakePrivate() {
    setSavingVisibility(true);
    const supabase = createClient();
    // Delete all schedules, then mark availability private, then refresh.
    await supabase.from("availability_slots").delete().eq("professional_id", professionalId);
    await supabase.from("professionals").update({ availability_public: false }).eq("id", professionalId);
    window.location.reload();
  }

  async function insertSlots(times: string[]) {
    if (times.length === 0) return;
    if (!genLocation) return;
    setPastError(null);
    // Reject past dates outright (CR time).
    if (isPastDateTimeCR(genDate)) {
      setPastError("No puedes agregar horarios en una fecha pasada.");
      return;
    }
    // Enforce a 15-minute lead time (CR): drop any time less than 15 min ahead.
    // The picker already only offers valid times — this is the safety-net check,
    // and it fires every time (not just once).
    const valid = times.filter((t) => !isTooSoonCR(genDate, t));
    if (valid.length === 0) {
      setPastError(`Esa hora ya pasó o es muy pronto (hora de Costa Rica). Elige una hora al menos ${LEAD_MINUTES} minutos en el futuro.`);
      return;
    }
    times = valid;
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
      if (/pasado|past/i.test(error.message)) setPastError("No puedes agregar horarios en el pasado (hora de Costa Rica).");
      return;
    }
    setSlots((prev) => [
      ...prev,
      ...((data ?? []).map((s) => ({ id: s.id, slot_date: s.slot_date, slot_time: String(s.slot_time).slice(0, 5), location_id: (s as { location_id?: string }).location_id ?? locId, category_id: (s as { category_id?: string }).category_id ?? catId }))),
    ]);
    // Adding a schedule automatically makes availability public.
    if (!isPublic) {
      setIsPublic(true);
      await supabase.from("professionals").update({ availability_public: true }).eq("id", professionalId);
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
      setPastError("La hora de fin debe ser posterior a la de inicio.");
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
  const DAY_END = 23 * 60 + 30; // last selectable start on a 30-min grid

  // "Hasta" can NEVER be ≤ "Desde": its options start one grid step after "Desde"
  // (and never before today's lead floor). The invalid combo can't be picked.
  const hastaMin = hhmm(Math.min(Math.max(toMins(genStart) + 30, startMinMins), 24 * 60 - 30));

  // Picking "Desde" auto-bumps "Hasta" to stay valid (default span = 1 hour).
  function setDesde(v: string) {
    setPastError(null);
    setGenStart(v);
    if (toMins(genEnd) <= toMins(v)) setGenEnd(hhmm(Math.min(toMins(v) + 60, DAY_END + 30)));
  }

  // Quick presets fill the range (clamped to today's lead floor).
  function applyPreset(s: number, e: number) {
    setPastError(null);
    const ms = Math.max(s, startMinMins);
    const me = Math.max(e, ms + 60);
    setGenStart(hhmm(Math.min(ms, DAY_END)));
    setGenEnd(hhmm(Math.min(me, DAY_END + 30)));
  }
  const PRESETS: { label: string; s: number; e: number }[] = [
    { label: "Mañana", s: 8 * 60, e: 12 * 60 },
    { label: "Tarde", s: 13 * 60, e: 17 * 60 },
    { label: "Noche", s: 17 * 60, e: 21 * 60 },
  ];

  // Live range validity + slot-count preview (item 1) — surfaced inline so an
  // invalid combo never just dead-ends on "Generar".
  const rangeInvalid = toMins(genEnd) <= toMins(genStart);
  const previewCount = (() => {
    if (rangeInvalid) return 0;
    const step = interval === 0 ? Math.max(5, customInterval) : interval;
    const start = toMins(genStart);
    const end = toMins(genEnd);
    let n = 0;
    for (let m = start; m + step <= end; m += step) n++;
    return Math.max(n, 1);
  })();
  // Keep the fields at valid values so the pro never hits an error. Bump anything
  // below the next full hour (covers time passing + switching back to today).
  useEffect(() => {
    if (startMin && toMins(genStart) < toMins(startMin)) setGenStart(startMin);
    if (startMin && toMins(singleTime) < toMins(startMin)) setSingleTime(startMin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startMin]);

  return (
    <div className="flex flex-col gap-4">
      {/* ── Contact preference — the FIRST decision; drives everything below ── */}
      <div className="rounded-xl border border-[#e5e7eb] p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[#111827]">¿Cómo recibes clientes?</h3>
          {savingContact && <Loader2 className="h-4 w-4 animate-spin text-[#009FD9]" />}
        </div>
        <div className="flex flex-col gap-2">
          {CONTACT_PREFERENCES.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => changeContactPreference(opt.value)}
              className={cn(
                "flex items-center justify-between gap-2 p-3 rounded-xl border-2 text-left transition-all",
                contactPreference === opt.value ? "border-[#009FD9] bg-[#EBF5FB]" : "border-[#e5e7eb] hover:border-[#009FD9]/40"
              )}
            >
              <div>
                <p className="text-sm font-medium text-[#111827]">{opt.label}</p>
                <p className="text-xs text-[#9ca3af]">{opt.hint}</p>
              </div>
              <span className={cn("h-4 w-4 rounded-full border-2 shrink-0", contactPreference === opt.value ? "border-[#009FD9] bg-[#009FD9]" : "border-[#d1d5db]")} />
            </button>
          ))}
        </div>
        {!schedulingEnabled && (
          <p className="text-xs text-[#6b7280] mt-3 bg-[#f4f7fa] rounded-lg p-3">
            Elegiste <strong>Solo WhatsApp</strong>: los clientes te escribirán directo y no se mostrarán horarios ni
            agenda. Cambia a “Ambas” o “Solo citas” si quieres habilitar tu disponibilidad.
          </p>
        )}

        {/* Phone-call contact — opt-in (OFF by default) */}
        <div className="flex items-center justify-between gap-4 mt-4 pt-4 border-t border-[#f3f4f6]">
          <div>
            <p className="text-sm font-medium text-[#111827]">Permitir contacto por llamada</p>
            <p className="text-xs text-[#9ca3af]">Si lo activas, los clientes verán la opción “Contáctanos por llamada” a tu número.</p>
          </div>
          <button
            type="button"
            onClick={toggleAllowPhoneCall}
            className={cn("relative h-6 w-11 rounded-full transition-all shrink-0", allowPhoneCall ? "bg-[#009FD9]" : "bg-[#d1d5db]")}
            aria-label="Permitir llamada"
          >
            <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", allowPhoneCall ? "left-5" : "left-0.5")} />
          </button>
        </div>
      </div>

      {schedulingEnabled && (<>
      {/* ── Visibilidad y modalidad — quick settings grouped in ONE card to cut noise ── */}
      <div className="rounded-xl border border-[#e5e7eb]">
        {/* "Disponibilidad privada" (ON = private; hides + clears slots) */}
        <div className="flex items-start justify-between gap-4 p-4">
          <div className="flex items-start gap-3">
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-full shrink-0", !isPublic ? "bg-[#fef3c7] text-[#b45309]" : "bg-[#f3f4f6] text-[#6b7280]")}>
              {!isPublic ? <Lock className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-[#111827]">Disponibilidad privada</p>
              <p className="text-xs text-[#6b7280] mt-0.5 max-w-md">
                {!isPublic
                  ? "Activada: tus horarios están ocultos en las búsquedas y los clientes te contactan por WhatsApp para coordinar. Desactívala para volver a mostrarlos."
                  : "Actívala para ocultar tus horarios. Los clientes deberán contactarte para conocer tu disponibilidad. (Se eliminan los horarios publicados.)"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleVisibility}
            disabled={savingVisibility}
            className={cn(
              "relative h-6 w-11 rounded-full transition-all duration-200 shrink-0 cursor-pointer mt-1",
              !isPublic ? "bg-[#b45309]" : "bg-[#d1d5db]"
            )}
            aria-label={isPublic ? "Hacer privada" : "Hacer pública"}
          >
            <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200", !isPublic ? "left-5" : "left-0.5")} />
          </button>
        </div>

        {/* Videoconsulta */}
        <div className="flex items-center justify-between gap-4 p-4 border-t border-[#f3f4f6]">
          <div className="flex items-center gap-3">
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-full shrink-0", videoconsulta ? "bg-[#EBF5FB] text-[#009FD9]" : "bg-[#f3f4f6] text-[#6b7280]")}>
              <Video className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#111827]">Ofreces videoconsulta</p>
              <p className="text-xs text-[#6b7280]">Atiendes en línea. Puedes crear horarios específicos para videoconsulta.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleVideoconsulta}
            className={cn("relative h-6 w-11 rounded-full transition-all shrink-0", videoconsulta ? "bg-[#009FD9]" : "bg-[#d1d5db]")}
            aria-label="Videoconsulta"
          >
            <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", videoconsulta ? "left-5" : "left-0.5")} />
          </button>
        </div>
      </div>

      {/* ── Slot generator ──────────────────────────────────────── */}
      <div className="rounded-xl border border-[#e5e7eb] p-4">
        <div className="flex items-center gap-2 mb-4">
          <CalendarPlus className="h-4 w-4 text-[#009FD9]" />
          <h3 className="text-sm font-semibold text-[#111827]">Agregar horarios disponibles</h3>
        </div>

        {locationOptions.length === 0 ? (
          <div className="rounded-xl bg-[#fffbeb] border border-[#fde68a] p-4 text-sm text-[#92400e]">
            Para crear horarios necesitas al menos una ubicación. Agrega un <strong>lugar de trabajo</strong> en
            tu perfil o activa <strong>videoconsulta</strong> arriba. Los horarios se definen por ubicación.
          </div>
        ) : (
        <div className="flex flex-col gap-4">
          {/* Paso 1 — ¿para qué servicio y en qué ubicación? */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {professionOptions.length > 1 && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[#6b7280]">Profesión / servicio</label>
                <select value={genCategory} onChange={(e) => setGenCategory(e.target.value)} className={cn(inputCls, "cursor-pointer w-full")}>
                  {professionOptions.map((p) => <option key={p} value={p}>{getCategoryLabel(p)}</option>)}
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[#6b7280] flex items-center gap-1"><MapPin className="h-3 w-3" /> Ubicación de este horario</label>
              <select value={genLocation} onChange={(e) => setGenLocation(e.target.value)} className={cn(inputCls, "cursor-pointer w-full")}>
                {locationOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Paso 2 — el rango horario. Presets above the fields they fill. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-[#9ca3af]">Rápido:</span>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p.s, p.e)}
                className="rounded-full border border-[#e5e7eb] px-3 py-1 text-xs font-medium text-[#374151] hover:border-[#009FD9] hover:text-[#009FD9] transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[#6b7280]">Fecha</label>
              <input type="date" min={todayISO()} value={genDate} onChange={(e) => { setGenDate(e.target.value); setPastError(null); }} className={cn(inputCls, "h-10")} />
            </div>
            <TimeSelect label="Desde" min={startMin} value={genStart} onChange={setDesde} className="w-32" />
            {/* Visual "→" between the two pickers. */}
            <span className="text-[#9ca3af] mb-2.5 hidden sm:inline">→</span>
            <TimeSelect label="Hasta" min={hastaMin} value={genEnd} onChange={(v) => { setGenEnd(v); setPastError(null); }} className="w-32" error={rangeInvalid ? "Debe ser posterior a “Desde”." : undefined} />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[#6b7280]">Intervalo</label>
              <select value={interval} onChange={(e) => setInterval(Number(e.target.value))} className={cn(inputCls, "h-10 cursor-pointer")}>
                {INTERVAL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {interval === 0 && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[#6b7280]">Minutos</label>
                <input type="number" min={5} step={5} value={customInterval} onChange={(e) => setCustomInterval(Number(e.target.value))} className={cn(inputCls, "h-10 w-24")} />
              </div>
            )}
          </div>

          {/* Live preview — shown only when the range is valid. The ONE error for an
              invalid range lives inline on "Hasta" (no duplicate message). */}
          {!rangeInvalid && (
            <p className="text-xs text-[#6b7280]">
              Generas <strong className="text-[#374151]">{previewCount}</strong> {previewCount === 1 ? "espacio" : "espacios"} entre{" "}
              <strong className="text-[#374151]">{to12h(genStart)}</strong> y <strong className="text-[#374151]">{to12h(genEnd)}</strong>.
            </p>
          )}

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
            Generar horarios
          </Button>

          <div className="flex flex-wrap items-end gap-2 pt-3 border-t border-[#f3f4f6]">
            <span className="text-xs text-[#9ca3af] mb-2.5">o agrega una hora puntual:</span>
            <TimeSelect min={startMin} value={singleTime} onChange={setSingleTime} className="w-36" />
            <button
              type="button"
              onClick={() => insertSlots([singleTime])}
              disabled={busy}
              className="text-xs font-medium text-[#009FD9] hover:underline cursor-pointer mb-2.5"
            >
              + Agregar {to12h(singleTime)}
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

      {/* ── Slot list ───────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-[#111827] mb-3">Tus horarios próximos</h3>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[#009FD9]" /></div>
        ) : grouped.length === 0 ? (
          <div className="text-center py-10 rounded-xl bg-[#f4f7fa] border border-dashed border-[#d1d5db]">
            <p className="text-sm text-[#6b7280]">Todavía no agregaste horarios.</p>
            <p className="text-xs text-[#9ca3af] mt-1">Usa el generador de arriba para crear tus espacios disponibles.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {grouped.map(([date, list]) => {
              // Within a day, group by (profesión + ubicación) so a pro with several
              // professions/locations can tell each block apart (item 2).
              const subMap = new Map<string, Slot[]>();
              for (const s of list) {
                const key = `${s.category_id ?? ""}|${s.location_id ?? ""}`;
                if (!subMap.has(key)) subMap.set(key, []);
                subMap.get(key)!.push(s);
              }
              const subgroups = Array.from(subMap.entries());
              return (
                <div key={date} className="rounded-xl border border-[#e5e7eb] p-4">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-sm font-semibold text-[#111827] capitalize">{prettyDate(date)}</span>
                    <button onClick={() => removeDate(date)} className="text-xs text-[#9ca3af] hover:text-red-500 transition-colors cursor-pointer">
                      Quitar día
                    </button>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {subgroups.map(([key, sg]) => {
                      const cat = sg[0].category_id;
                      const loc = sg[0].location_id ?? null;
                      const tags = [
                        cat ? getCategoryLabel(cat) : null,
                        loc ? locationLabel(loc) : null,
                      ].filter(Boolean);
                      return (
                        <div key={key}>
                          {tags.length > 0 && (
                            <p className="text-xs font-medium text-[#374151] mb-1.5 flex items-center gap-1">
                              {cat && <span className="rounded bg-[#EBF5FB] text-[#0089bb] px-1.5 py-0.5">{getCategoryLabel(cat)}</span>}
                              {loc && <span className="inline-flex items-center gap-1 rounded bg-[#f3f4f6] text-[#374151] px-1.5 py-0.5"><MapPin className="h-3 w-3" />{locationLabel(loc)}</span>}
                            </p>
                          )}
                          {/* Slots grouped by Mañana / Tarde / Noche so a long list is
                              easy to scan; each block only renders when it has slots. */}
                          <div className="flex flex-col gap-1.5">
                            {DAY_PARTS.map((part) => {
                              const partSlots = sg.filter((s) => partOfDay(s.slot_time) === part);
                              if (partSlots.length === 0) return null;
                              return (
                                <div key={part} className="flex items-start gap-2">
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[#9ca3af] w-12 shrink-0 pt-2">{part}</span>
                                  <div className="flex flex-wrap gap-2">
                                    {partSlots.map((s) => (
                                      <span key={s.id ?? `${s.slot_time}-${s.location_id ?? ""}-${s.category_id ?? ""}`} className="group inline-flex items-center gap-1.5 rounded-lg bg-[#EBF5FB] text-[#0089bb] text-sm font-medium pl-3 pr-1.5 py-1.5">
                                        {to12h(s.slot_time)}
                                        <button onClick={() => removeSlot(s)} className="rounded-md p-0.5 hover:bg-[#009FD9]/20 transition-colors cursor-pointer" aria-label="Quitar">
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
                </div>
              );
            })}
          </div>
        )}
      </div>

      </>)}

      {/* Confirmation modal — making availability private deletes all schedules */}
      {showPrivateConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowPrivateConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 z-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 mb-4">
              <Lock className="h-5 w-5 text-red-500" />
            </div>
            <h3 className="text-lg font-bold text-[#111827] mb-1">¿Estás seguro?</h3>
            <p className="text-sm text-[#6b7280] mb-5">Tus horarios serán eliminados.</p>
            <div className="flex gap-3">
              <Button variant="outline" size="md" className="flex-1" onClick={() => setShowPrivateConfirm(false)} disabled={savingVisibility}>
                Cancelar
              </Button>
              <Button
                size="md"
                className="flex-1 bg-red-500 hover:bg-red-600"
                onClick={confirmMakePrivate}
                loading={savingVisibility}
              >
                Sí, hacer privada
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
