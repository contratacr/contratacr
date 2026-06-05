"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Plus, X, CalendarPlus, Globe, Lock, Loader2 } from "lucide-react";

type Slot = { id?: string; slot_date: string; slot_time: string };

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

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface AvailabilityEditorProps {
  professionalId: string;
  initialPublic?: boolean;
  onSaved?: () => void;
}

export function AvailabilityEditor({ professionalId, initialPublic = true, onSaved }: AvailabilityEditorProps) {
  const [isPublic, setIsPublic] = useState(initialPublic);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingVisibility, setSavingVisibility] = useState(false);

  // Generator form
  const [genDate, setGenDate] = useState(todayISO());
  const [genStart, setGenStart] = useState("08:00");
  const [genEnd, setGenEnd] = useState("17:00");
  const [interval, setInterval] = useState(60);
  const [customInterval, setCustomInterval] = useState(45);
  const [singleTime, setSingleTime] = useState("10:00");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("availability_slots")
      .select("id, slot_date, slot_time")
      .eq("professional_id", professionalId)
      .gte("slot_date", todayISO())
      .order("slot_date")
      .order("slot_time")
      .then(({ data }) => {
        setSlots(
          (data ?? []).map((s) => ({ id: s.id, slot_date: s.slot_date, slot_time: String(s.slot_time).slice(0, 5) }))
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

  async function toggleVisibility() {
    const next = !isPublic;
    setIsPublic(next);
    setSavingVisibility(true);
    const supabase = createClient();
    await supabase.from("professionals").update({ availability_public: next }).eq("id", professionalId);
    setSavingVisibility(false);
    onSaved?.();
  }

  async function insertSlots(times: string[]) {
    if (times.length === 0) return;
    setBusy(true);
    const supabase = createClient();
    // Skip times that already exist for this date
    const existing = new Set(slots.filter((s) => s.slot_date === genDate).map((s) => s.slot_time));
    const fresh = times.filter((t) => !existing.has(t));
    if (fresh.length === 0) { setBusy(false); return; }

    const rows = fresh.map((t) => ({ professional_id: professionalId, slot_date: genDate, slot_time: t }));
    const { data, error } = await supabase
      .from("availability_slots")
      .insert(rows)
      .select("id, slot_date, slot_time");
    setBusy(false);
    if (error) { console.error("[availability] insert", error); return; }
    setSlots((prev) => [
      ...prev,
      ...((data ?? []).map((s) => ({ id: s.id, slot_date: s.slot_date, slot_time: String(s.slot_time).slice(0, 5) }))),
    ]);
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
      {/* ── Public / private toggle ─────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 rounded-2xl border border-[#e5e7eb] bg-[#f4f7fa] p-4">
        <div className="flex items-start gap-3">
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-full", isPublic ? "bg-[#EBF5FB] text-[#009FD9]" : "bg-[#f3f4f6] text-[#6b7280]")}>
            {isPublic ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          </div>
          <div>
            <p className="text-sm font-semibold text-[#111827]">
              {isPublic ? "Disponibilidad pública" : "Disponibilidad privada"}
            </p>
            <p className="text-xs text-[#6b7280] mt-0.5 max-w-md">
              {isPublic
                ? "Los clientes pueden ver tus horarios y reservar directamente."
                : "Tu perfil mostrará un mensaje para contactarte por WhatsApp o llamada; tus horarios no se muestran."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={toggleVisibility}
          disabled={savingVisibility}
          className={cn(
            "relative h-6 w-11 rounded-full transition-all duration-200 shrink-0 cursor-pointer mt-1",
            isPublic ? "bg-[#009FD9]" : "bg-[#d1d5db]"
          )}
          aria-label={isPublic ? "Hacer privada" : "Hacer pública"}
        >
          <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200", isPublic ? "left-5" : "left-0.5")} />
        </button>
      </div>

      {/* ── Slot generator ──────────────────────────────────────── */}
      <div className="rounded-2xl border border-[#e5e7eb] p-5">
        <div className="flex items-center gap-2 mb-4">
          <CalendarPlus className="h-4 w-4 text-[#009FD9]" />
          <h3 className="text-sm font-semibold text-[#111827]">Agregar horarios disponibles</h3>
        </div>

        <div className="flex flex-col gap-4">
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
        </div>
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
                    <span key={s.id ?? s.slot_time} className="group inline-flex items-center gap-1.5 rounded-lg bg-[#EBF5FB] text-[#0089bb] text-sm font-medium pl-3 pr-1.5 py-1.5">
                      {s.slot_time}
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
    </div>
  );
}
