"use client";

import { SelectMenu } from "@/components/ui/select-menu";

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export function FutureDatePicker({ value, onChange, yearsAhead = 3 }: { value: string; onChange: (value: string) => void; yearsAhead?: number }) {
  const [year = "", month = "", day = ""] = value.split("-");
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: yearsAhead + 1 }, (_, index) => {
    const option = String(currentYear + index);
    return { value: option, label: option };
  });
  const monthOptions = MONTHS.map((label, index) => ({ value: String(index + 1).padStart(2, "0"), label }));
  const daysInMonth = year && month ? new Date(Number(year), Number(month), 0).getDate() : 31;
  const dayOptions = Array.from({ length: daysInMonth }, (_, index) => {
    const option = String(index + 1).padStart(2, "0");
    return { value: option, label: String(index + 1) };
  });

  function update(nextDay: string, nextMonth: string, nextYear: string) {
    if (!nextDay || !nextMonth || !nextYear) {
      onChange([nextYear, nextMonth, nextDay].some(Boolean) ? `${nextYear}-${nextMonth}-${nextDay}` : "");
      return;
    }
    const maxDay = new Date(Number(nextYear), Number(nextMonth), 0).getDate();
    const safeDay = String(Math.min(Number(nextDay), maxDay)).padStart(2, "0");
    onChange(`${nextYear}-${nextMonth}-${safeDay}`);
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <SelectMenu value={day} onChange={(next) => update(next, month, year)} options={dayOptions} placeholder="Día" />
        <SelectMenu value={month} onChange={(next) => update(day, next, year)} options={monthOptions} placeholder="Mes" />
        <SelectMenu value={year} onChange={(next) => update(day, month, next)} options={yearOptions} placeholder="Año" />
      </div>
      {/^\d{4}-\d{2}-\d{2}$/.test(value) && (
        <button type="button" onClick={() => onChange("")} className="mt-2 text-xs font-semibold text-[#64748b] hover:text-[#162543]">
          Quitar fecha
        </button>
      )}
    </div>
  );
}
