"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Plus, X, CalendarPlus, Globe, Lock, Loader2, Video, MapPin, AlertCircle } from "lucide-react";
import { CONTACT_PREFERENCES, type ContactPreference } from "@/lib/constants";
import { crTodayISO, isPastDateTimeCR } from "@/lib/time-cr";

type Slot = { id?: string; slot_date: string; slot_time: string; location_id?: string | null };

const GENERAL_LOC = "general";
const VIDEO_LOC = "videoconsulta";

const INTERVAL_OPTIONS = [
  { value: 30, label: "Cada 30 min" },
  { value: 60, label: "Cada hora" },
  { value: 120, label: "Cada 2 horas" },
  { value: 0, label: "Personalizado" },
];

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function hhmm(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

function toMins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][date.getDay()];
  return `${weekday} ${d} ${MONTHS[m - 1]} ${y}`;
}

// All "today" comparisons use Costa Rica time so past slots are rejected
// consistently regardless of the professional's device timezone.
function todayISO(): string {
  return crTodayISO();
}

type Place = { id?: string; name: string };
type Coverage = { cantonId: string; cantonName?: string; provinceName?: string };

interface AvailabilityEditorProps {
  professionalId: string;
  initialPublic?: boolean;
  initialContactPreference?: ContactPreference;
  workplaces?: Place[];
  coverageAreas?: Coverage[];
  initialVideoconsulta?: boolean;
  onSaved?: () => void;
}

export function AvailabilityEditor({ professionalId, initialPublic = true, initialContactPreference = "ambas", workplaces = [], coverageAreas = [], initialVideoconsulta = false, onSaved }: AvailabilityEditorProps) {
  const [isPublic, setIsPublic] = useState(initialPublic);
  const [contactPreference, setContactPreference] = useState<ContactPreference>(initialContactPreference);
  const [savingContact, setSavingContact] = useState(false);
  const [videoconsulta, setVideoconsulta] = useState(initialVideoconsulta);

  // Schedules belong to a specific location only (item 16): each workplace +
  // Videoconsulta. No "general/all locations" option.
  const locationOptions = useMemo(() => {
    const opts: { id: string; label: string }[] = [];
    for (const w of workplaces) if (w.id) opts.push({ id: w.id, label: w.name });
    // Coverage areas ("me desplazo") are schedulable locations too.
    for (const c of coverageAreas) {
      if (c.cantonId) opts.push({ id: `cov_${c.cantonId}`, label: `${c.cantonName ?? "Zona"}${c.provinceName ? `, ${c.provinceName}` : ""} (a domicilio)` });
    }
    if (videoconsulta) opts.push({ id: VIDEO_LOC, label: "Videoconsulta" });
    return opts;
  }, [workplaces, coverageAreas, videoconsulta]);
  const [genLocation, setGenLocation] = useState("");

  // Keep the selected location valid as options change.
  useEffect(() => {
    if (locationOptions.length > 0 && !locationOptions.some((o) => o.id === genLocation)) {
      setGenLocation(locationOptions[0].id);
    }
  }, [locationOptions, genLocation]);

  function locationLabel(id?: string | null): string {
    if (!id || id === GENERAL_LOC) return "General";
    if (id === VIDEO_LOC) return "Videoconsulta";
    return workplaces.find((w) => w.id === id)?.name ?? "Ubicación";
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

  // Generator form
  const [genDate, setGenDate] = useState(todayISO());
  const [genStart, setGenStart] = useState("08:00");
  const [genEnd, setGenEnd] = useState("17:00");
  const [interval, setInterval] = useState(60);
  const [customInterval, setCustomInterval] = useState(45);
  const [singleTime, setSingleTime] = useState("10:00");
  const [busy, setBusy] = useState(false);
  const [pastError, setPastError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("availability_slots")
      .select("id, slot_date, slot_time, location_id")
      .eq("professional_id", professionalId)
      .gte("slot_date", todayISO())
      .order("slot_date")
      .order("slot_time")
      .then(({ data, error }) => {
        // Retry without location_id if the column isn't migrated yet.
        if (error && /location_id|column/i.test(error.message)) {
          supabase
            .from("availability_slots")
            .select("id, slot_date, slot_time")
            .eq("professional_id", professionalId)
            .gte("slot_date", todayISO())
            .order("slot_date")
            .order("slot_time")
            .then(({ data: d2 }) => {
              setSlots((d2 ?? []).map((s) => ({ id: s.id, slot_date: s.slot_date, slot_time: String(s.slot_time).slice(0, 5), location_id: null })));
              setLoading(false);
            });
          return;
        }
        setSlots(
          (data ?? []).map((s) => ({ id: s.id, slot_date: s.slot_date, slot_time: String(s.slot_time).slice(0, 5), location_id: (s as { location_id?: string }).location_id ?? null }))
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
      setPastError("No podés agregar horarios en una fecha pasada.");
      return;
    }
    // Drop any individual times already in the past today (CR time).
    const notPast = times.filter((t) => !isPastDateTimeCR(genDate, t));
    if (notPast.length === 0) {
      setPastError("Esa hora ya pasó (hora de Costa Rica). Elegí una hora futura.");
      return;
    }
    times = notPast;
    setBusy(true);
    const supabase = createClient();
    const locId = genLocation;
    // Skip times that already exist for this date AND location
    const existing = new Set(
      slots.filter((s) => s.slot_date === genDate && (s.location_id ?? null) === locId).map((s) => s.slot_time)
    );
    const fresh = times.filter((t) => !existing.has(t));
    if (fresh.length === 0) { setBusy(false); return; }

    const rows = fresh.map((t) => ({ professional_id: professionalId, slot_date: genDate, slot_time: t, location_id: locId }));
    let { data, error } = await supabase
      .from("availability_slots")
      .insert(rows)
      .select("id, slot_date, slot_time, location_id");
    // Retry without location_id if the column isn't migrated yet.
    if (error && /location_id|column/i.test(error.message)) {
      ({ data, error } = await supabase
        .from("availability_slots")
        .insert(fresh.map((t) => ({ professional_id: professionalId, slot_date: genDate, slot_time: t })))
        .select("id, slot_date, slot_time"));
    }
    setBusy(false);
    if (error) {
      console.error("[availability] insert", error);
      if (/pasado|past/i.test(error.message)) setPastError("No podés agregar horarios en el pasado (hora de Costa Rica).");
      return;
    }
    setSlots((prev) => [
      ...prev,
      ...((data ?? []).map((s) => ({ id: s.id, slot_date: s.slot_date, slot_time: String(s.slot_time).slice(0, 5), location_id: (s as { location_id?: string }).location_id ?? locId }))),
    ]);
    // Adding a schedule automatically makes availability public.
    if (!isPublic) {
      setIsPublic(true);
      await supabase.from("professionals").update({ availability_public: true }).eq("id", professionalId);
    }
    onSaved?.();
  }

  function generate() {
    const step = interval === 0 ? Math.max(5, customInterval) : interval;
    const start = toMins(genStart);
    const end = toMins(genEnd);
    if (end <= start) return;
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

  return (
    <div className="flex flex-col gap-6">
      {/* ── Contact preference — the FIRST decision; drives everything below ── */}
      <div className="rounded-2xl border border-[#e5e7eb] p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[#111827]">¿Cómo recibís clientes?</h3>
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
            agenda. Cambiá a “Ambas” o “Solo citas” si querés habilitar tu disponibilidad.
          </p>
        )}
      </div>

      {schedulingEnabled && (<>
      {/* ── "Disponibilidad privada" toggle (ON = private; hides + clears slots) ── */}
      <div className="flex items-start justify-between gap-4 rounded-2xl border border-[#e5e7eb] bg-[#f4f7fa] p-4">
        <div className="flex items-start gap-3">
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-full", !isPublic ? "bg-[#fef3c7] text-[#b45309]" : "bg-[#f3f4f6] text-[#6b7280]")}>
            {!isPublic ? <Lock className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
          </div>
          <div>
            <p className="text-sm font-semibold text-[#111827]">Disponibilidad privada</p>
            <p className="text-xs text-[#6b7280] mt-0.5 max-w-md">
              {!isPublic
                ? "Tus horarios NO se muestran en /buscar; tu tarjeta invita a contactarte por WhatsApp."
                : "Tus horarios se muestran y los clientes pueden reservar. Activá esto para ocultarlos (se eliminan los horarios publicados)."}
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

      {/* ── Videoconsulta toggle ────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#e5e7eb] p-4">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-full", videoconsulta ? "bg-[#EBF5FB] text-[#009FD9]" : "bg-[#f3f4f6] text-[#6b7280]")}>
            <Video className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#111827]">Ofrecés videoconsulta</p>
            <p className="text-xs text-[#6b7280]">Atendés en línea. Podés crear horarios específicos para videoconsulta.</p>
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

      {/* ── Slot generator ──────────────────────────────────────── */}
      <div className="rounded-2xl border border-[#e5e7eb] p-5">
        <div className="flex items-center gap-2 mb-4">
          <CalendarPlus className="h-4 w-4 text-[#009FD9]" />
          <h3 className="text-sm font-semibold text-[#111827]">Agregar horarios disponibles</h3>
        </div>

        {locationOptions.length === 0 ? (
          <div className="rounded-xl bg-[#fffbeb] border border-[#fde68a] p-4 text-sm text-[#92400e]">
            Para crear horarios necesitás al menos una ubicación. Agregá un <strong>lugar de trabajo</strong> en
            tu perfil o activá <strong>videoconsulta</strong> arriba. Los horarios se definen por ubicación.
          </div>
        ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[#6b7280] flex items-center gap-1"><MapPin className="h-3 w-3" /> Ubicación de este horario</label>
            <select value={genLocation} onChange={(e) => setGenLocation(e.target.value)} className={cn(inputCls, "cursor-pointer w-full sm:w-72")}>
              {locationOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[#6b7280]">Fecha</label>
              <input type="date" min={todayISO()} value={genDate} onChange={(e) => setGenDate(e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[#6b7280]">Desde</label>
              <input type="time" value={genStart} onChange={(e) => setGenStart(e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[#6b7280]">Hasta</label>
              <input type="time" value={genEnd} onChange={(e) => setGenEnd(e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[#6b7280]">Intervalo</label>
              <select value={interval} onChange={(e) => setInterval(Number(e.target.value))} className={cn(inputCls, "cursor-pointer")}>
                {INTERVAL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {interval === 0 && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[#6b7280]">Minutos</label>
                <input type="number" min={5} step={5} value={customInterval} onChange={(e) => setCustomInterval(Number(e.target.value))} className={cn(inputCls, "w-24")} />
              </div>
            )}
            <Button type="button" size="md" onClick={generate} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Generar
            </Button>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs text-[#9ca3af]">o agregá una hora puntual:</span>
            <input type="time" value={singleTime} onChange={(e) => setSingleTime(e.target.value)} className={cn(inputCls, "h-8")} />
            <button
              type="button"
              onClick={() => insertSlots([singleTime])}
              disabled={busy}
              className="text-xs font-medium text-[#009FD9] hover:underline cursor-pointer"
            >
              + Agregar
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
          <div className="text-center py-10 rounded-2xl bg-[#f4f7fa] border border-dashed border-[#d1d5db]">
            <p className="text-sm text-[#6b7280]">Todavía no agregaste horarios.</p>
            <p className="text-xs text-[#9ca3af] mt-1">Usá el generador de arriba para crear tus espacios disponibles.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {grouped.map(([date, list]) => (
              <div key={date} className="rounded-2xl border border-[#e5e7eb] p-4">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-sm font-semibold text-[#111827] capitalize">{prettyDate(date)}</span>
                  <button onClick={() => removeDate(date)} className="text-xs text-[#9ca3af] hover:text-red-500 transition-colors cursor-pointer">
                    Quitar día
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {list.map((s) => (
                    <span key={s.id ?? `${s.slot_time}-${s.location_id ?? ""}`} className="group inline-flex items-center gap-1.5 rounded-lg bg-[#EBF5FB] text-[#0089bb] text-sm font-medium pl-3 pr-1.5 py-1.5">
                      {s.slot_time}
                      {locationOptions.length > 1 && (s.location_id ?? null) !== null && (
                        <span className="text-[10px] font-normal text-[#0089bb]/70">· {locationLabel(s.location_id)}</span>
                      )}
                      <button onClick={() => removeSlot(s)} className="rounded-md p-0.5 hover:bg-[#009FD9]/20 transition-colors cursor-pointer" aria-label="Quitar">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
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
