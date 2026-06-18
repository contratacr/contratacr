"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// A polished 12-hour time picker (custom popover). Each option is a full,
// unambiguous label ("10:00am", "3:00pm" — lowercase meridiem attached, no
// periods/spaces), so the meridiem is intrinsic — crossing noon flips am/pm
// automatically (there is no separate, sticky AM/PM control). Stores a 24-hour
// "HH:MM" value. Earlier-than-`min` options are hidden.

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
  const mer = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")}${mer}`;
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
  disabled?: boolean;
}

export function TimeSelect({ value, onChange, min, step = 30, label, error, id, className, disabled }: TimeSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const minMins = min ? toMins(min) : 0;
  const options: number[] = [];
  for (let m = 0; m < 24 * 60; m += step) {
    if (m >= minMins) options.push(m);
  }
  const cur = value ? toMins(value) : -1;
  if (cur >= 0 && !options.includes(cur)) {
    options.push(cur);
    options.sort((a, b) => a - b);
  }

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  // Scroll the selected option into view when opening.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>("[data-selected='true']");
    el?.scrollIntoView({ block: "center" });
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative flex flex-col gap-1", className)}>
      {label && <label htmlFor={id} className="text-xs font-medium text-[#6b7280]">{label}</label>}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={!!error}
        className={cn(
          "flex items-center h-10 rounded-xl border bg-white pl-9 pr-9 text-sm font-medium text-[#111827] relative text-left transition-all",
          "focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent",
          open && "ring-2 ring-[#009FD9] border-transparent",
          error ? "border-red-400" : "border-[#e5e7eb]",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <Clock className="pointer-events-none absolute left-3 h-4 w-4 text-[#9ca3af]" />
        {to12h(value) || <span className="text-[#9ca3af]">--:--</span>}
        <ChevronDown className={cn("pointer-events-none absolute right-3 h-4 w-4 text-[#9ca3af] transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          className="absolute top-full left-0 z-50 mt-1 max-h-60 w-full min-w-[9rem] overflow-y-auto rounded-xl border border-[#e5e7eb] bg-white py-1 shadow-lg"
        >
          {options.length === 0 ? (
            <p className="px-3 py-2 text-xs text-[#9ca3af]">No hay horas disponibles</p>
          ) : (
            options.map((m) => {
              const v = hhmm(m);
              const selected = v === value;
              return (
                <button
                  key={m}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-selected={selected}
                  onClick={() => { onChange(v); setOpen(false); }}
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-2 text-sm text-left transition-colors",
                    selected ? "bg-[#EBF5FB] text-[#0089bb] font-semibold" : "text-[#374151] hover:bg-[#f3f4f6]"
                  )}
                >
                  {to12h(v)}
                  {selected && <Check className="h-3.5 w-3.5" />}
                </button>
              );
            })
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
