"use client";

import { Clock, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// A polished 12-hour time picker. Because each option is a full, unambiguous time
// label ("10:00 a.m.", "3:00 p.m."), the meridiem is intrinsic — selecting across
// the noon boundary flips a.m./p.m. automatically (there is no separate, sticky
// AM/PM control). Stores a 24-hour "HH:MM" value.

function toMins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function hhmm(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}
export function to12h(value: string): string {
  if (!value) return "";
  const [h, m] = value.split(":").map(Number);
  const mer = h < 12 ? "a.m." : "p.m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${mer}`;
}

interface TimeSelectProps {
  value: string;
  onChange: (value: string) => void;
  /** Earliest selectable time (HH:MM) — earlier options are hidden. */
  min?: string;
  /** Minutes between options (default 30). */
  step?: number;
  label?: React.ReactNode;
  error?: string;
  id?: string;
  className?: string;
}

export function TimeSelect({ value, onChange, min, step = 30, label, error, id, className }: TimeSelectProps) {
  const minMins = min ? toMins(min) : 0;
  const options: number[] = [];
  for (let m = 0; m < 24 * 60; m += step) {
    if (m >= minMins) options.push(m);
  }
  // Always include the current value so the field never renders blank, even if it
  // falls outside the min/step grid.
  const cur = value ? toMins(value) : -1;
  if (cur >= 0 && !options.includes(cur)) {
    options.push(cur);
    options.sort((a, b) => a - b);
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && <label htmlFor={id} className="text-xs font-medium text-[#6b7280]">{label}</label>}
      <div
        className={cn(
          "relative flex items-center h-10 rounded-xl border bg-white transition-all",
          "focus-within:ring-2 focus-within:ring-[#009FD9] focus-within:border-transparent",
          error ? "border-red-400" : "border-[#e5e7eb]"
        )}
      >
        <Clock className="pointer-events-none absolute left-3 h-4 w-4 text-[#9ca3af]" />
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          className="h-full w-full appearance-none bg-transparent pl-9 pr-9 text-sm font-medium text-[#111827] focus:outline-none cursor-pointer"
        >
          {options.map((m) => (
            <option key={m} value={hhmm(m)}>{to12h(hhmm(m))}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-[#9ca3af]" />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
