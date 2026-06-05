"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Plus, X } from "lucide-react";
import { BlockedDatesEditor } from "./blocked-dates-editor";

type TimeRange = { start: string; end: string };
type DaySchedule = { enabled: boolean; ranges: TimeRange[] };
type WeeklySchedule = Record<string, DaySchedule>;

const DAYS = [
  { key: "lun", label: "Lunes" },
  { key: "mar", label: "Martes" },
  { key: "mie", label: "Miércoles" },
  { key: "jue", label: "Jueves" },
  { key: "vie", label: "Viernes" },
  { key: "sab", label: "Sábado" },
  { key: "dom", label: "Domingo" },
];

const DEFAULT_RANGE: TimeRange = { start: "08:00", end: "17:00" };

function buildDefaultSchedule(): WeeklySchedule {
  return Object.fromEntries(
    DAYS.map((d) => [d.key, { enabled: false, ranges: [{ ...DEFAULT_RANGE }] }])
  );
}

function migrateOldFormat(raw: unknown): WeeklySchedule {
  if (!raw || typeof raw !== "object") return buildDefaultSchedule();
  const obj = raw as Record<string, unknown>;
  // Already in new format (has 'enabled' key)
  if ("lun" in obj && typeof (obj["lun"] as Record<string, unknown>)?.enabled === "boolean") {
    return obj as unknown as WeeklySchedule;
  }
  // Old format (morning/afternoon/evening) → migrate to new format
  return buildDefaultSchedule();
}

interface AvailabilityEditorProps {
  professionalId: string;
  initialAvailability?: unknown;
  onSaved?: () => void;
}

export function AvailabilityEditor({ professionalId, initialAvailability, onSaved }: AvailabilityEditorProps) {
  const [schedule, setSchedule] = useState<WeeklySchedule>(
    migrateOldFormat(initialAvailability)
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggleDay(key: string) {
    setSchedule((prev) => ({
      ...prev,
      [key]: { ...prev[key], enabled: !prev[key].enabled },
    }));
    setSaved(false);
  }

  function updateRange(dayKey: string, index: number, field: "start" | "end", value: string) {
    setSchedule((prev) => {
      const ranges = [...prev[dayKey].ranges];
      ranges[index] = { ...ranges[index], [field]: value };
      return { ...prev, [dayKey]: { ...prev[dayKey], ranges } };
    });
    setSaved(false);
  }

  function addRange(dayKey: string) {
    setSchedule((prev) => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        ranges: [...prev[dayKey].ranges, { ...DEFAULT_RANGE }],
      },
    }));
    setSaved(false);
  }

  function removeRange(dayKey: string, index: number) {
    setSchedule((prev) => {
      const ranges = prev[dayKey].ranges.filter((_, i) => i !== index);
      return {
        ...prev,
        [dayKey]: { ...prev[dayKey], ranges: ranges.length ? ranges : [{ ...DEFAULT_RANGE }] },
      };
    });
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    await supabase
      .from("professionals")
      .update({ availability: schedule })
      .eq("id", professionalId);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    onSaved?.();
  }

  return (
    <div>
      <p className="text-sm text-[#6b7280] mb-5">
        Activá los días que trabajás y configurá tus horarios.
      </p>

      <div className="flex flex-col gap-3">
        {DAYS.map(({ key, label }) => {
          const day = schedule[key];
          return (
            <div
              key={key}
              className={cn(
                "rounded-xl border-2 transition-all",
                day.enabled ? "border-[#009FD9] bg-[#EBF5FB]/40" : "border-[#e5e7eb] bg-white"
              )}
            >
              {/* Day header */}
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => toggleDay(key)}
                  className={cn(
                    "relative h-6 w-11 rounded-full transition-all duration-200 shrink-0 cursor-pointer",
                    day.enabled ? "bg-[#009FD9]" : "bg-[#d1d5db]"
                  )}
                  aria-label={`${day.enabled ? "Desactivar" : "Activar"} ${label}`}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200",
                      day.enabled ? "left-5" : "left-0.5"
                    )}
                  />
                </button>
                <span
                  className={cn(
                    "text-sm font-semibold w-24",
                    day.enabled ? "text-[#111827]" : "text-[#9ca3af]"
                  )}
                >
                  {label}
                </span>
                {!day.enabled && (
                  <span className="text-xs text-[#9ca3af]">No disponible</span>
                )}
              </div>

              {/* Time ranges */}
              {day.enabled && (
                <div className="px-4 pb-3 flex flex-col gap-2">
                  {day.ranges.map((range, i) => (
                    <div key={i} className="flex items-center gap-2 flex-wrap">
                      <input
                        type="time"
                        value={range.start}
                        onChange={(e) => updateRange(key, i, "start", e.target.value)}
                        className="h-9 px-3 rounded-xl border border-[#e5e7eb] bg-white text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                      />
                      <span className="text-[#9ca3af] text-sm">→</span>
                      <input
                        type="time"
                        value={range.end}
                        onChange={(e) => updateRange(key, i, "end", e.target.value)}
                        className="h-9 px-3 rounded-xl border border-[#e5e7eb] bg-white text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                      />
                      {day.ranges.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRange(key, i)}
                          className="h-8 w-8 rounded-lg flex items-center justify-center text-[#9ca3af] hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addRange(key)}
                    className="flex items-center gap-1.5 text-xs font-medium text-[#009FD9] hover:underline mt-1 w-fit"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Agregar horario
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 mt-6">
        <Button onClick={handleSave} loading={saving} disabled={saving}>
          {saving ? "Guardando…" : "Guardar horario"}
        </Button>
        {saved && (
          <span className="text-sm text-emerald-600 font-medium">✓ Horario guardado</span>
        )}
      </div>

      <BlockedDatesEditor professionalId={professionalId} />
    </div>
  );
}
