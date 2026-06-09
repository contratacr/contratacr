"use client";

import { useEffect, useState } from "react";
import { CalendarOff, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface BlockedDatesEditorProps {
  professionalId: string;
}

export function BlockedDatesEditor({ professionalId }: BlockedDatesEditorProps) {
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [newDate, setNewDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("blocked_dates")
      .select("blocked_date")
      .eq("professional_id", professionalId)
      .order("blocked_date", { ascending: true })
      .then(({ data }) => {
        setBlockedDates((data ?? []).map((r) => r.blocked_date));
        setLoading(false);
      });
  }, [professionalId]);

  async function addDate() {
    if (!newDate || blockedDates.includes(newDate)) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("blocked_dates").insert({
      professional_id: professionalId,
      blocked_date: newDate,
    });
    if (!error) {
      setBlockedDates((prev) => [...prev, newDate].sort());
      setNewDate("");
    }
    setSaving(false);
  }

  async function removeDate(date: string) {
    const supabase = createClient();
    await supabase
      .from("blocked_dates")
      .delete()
      .eq("professional_id", professionalId)
      .eq("blocked_date", date);
    setBlockedDates((prev) => prev.filter((d) => d !== date));
  }

  function formatDisplay(dateStr: string) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("es-CR", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  if (loading) return null;

  return (
    <div className="mt-6 pt-6 border-t border-[#e5e7eb]">
      <div className="flex items-center gap-2 mb-3">
        <CalendarOff className="h-4 w-4 text-[#6b7280]" />
        <h3 className="text-sm font-semibold text-[#374151]">Fechas bloqueadas</h3>
      </div>
      <p className="text-xs text-[#9ca3af] mb-4">
        Marca días específicos en los que no estás disponible (vacaciones, feriados, etc.)
      </p>

      <div className="flex gap-2 mb-4">
        <input
          type="date"
          min={today}
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          className="flex-1 h-9 px-3 rounded-xl border border-[#e5e7eb] bg-white text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
        />
        <Button
          size="sm"
          onClick={addDate}
          disabled={!newDate || saving}
          className="shrink-0"
        >
          <Plus className="h-4 w-4" />
          Agregar
        </Button>
      </div>

      {blockedDates.length === 0 ? (
        <p className="text-xs text-[#9ca3af] text-center py-3">Sin fechas bloqueadas</p>
      ) : (
        <div className="flex flex-col gap-2">
          {blockedDates.map((date) => (
            <div
              key={date}
              className={cn(
                "flex items-center justify-between px-3 py-2 rounded-xl bg-[#fef2f2] border border-[#fee2e2] text-sm"
              )}
            >
              <span className="text-[#374151]">{formatDisplay(date)}</span>
              <button
                onClick={() => removeDate(date)}
                className="text-[#ef4444] hover:text-red-700 transition-colors ml-3"
                aria-label="Eliminar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
