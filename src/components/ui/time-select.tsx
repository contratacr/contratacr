"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// A polished 12-hour time picker (custom popover). Each option is a full,
// unambiguous label ("10:00AM", "3:00PM" — UPPERCASE meridiem attached, no
// periods/spaces; this is the app-wide time format), so the meridiem is
// intrinsic — crossing noon flips AM/PM automatically (there is no separate,
// sticky AM/PM control). Stores a 24-hour "HH:MM" value. Earlier-than-`min`
// options are hidden.

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
  const mer = h < 12 ? "AM" : "PM";
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
          "relative flex h-9 w-full items-center rounded-lg border bg-white pl-3 pr-10 text-left text-[13px] font-semibold text-[#111827] shadow-[0_1px_0_rgba(15,23,42,0.02)] transition-all",
          "focus:outline-none focus:ring-2 focus:ring-[#EBF5FB] focus:border-[#009FD9]",
          open && "border-[#009FD9] ring-2 ring-[#EBF5FB]",
          error ? "border-red-400" : "border-[#dfe7f0] hover:border-[#cbd5e1]",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        {to12h(value) || <span className="text-[#9ca3af]">--:--</span>}
        <ChevronDown className={cn("pointer-events-none absolute right-3 h-4 w-4 text-[#9ca3af] transition-transform", open && "rotate-180 text-[#009FD9]")} />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 z-50 mt-1 w-full min-w-[8.75rem] overflow-hidden rounded-lg border border-[#dfe7f0] bg-white shadow-[0_18px_44px_-24px_rgba(15,23,42,0.55)]"
        >
          <div
            ref={listRef}
            role="listbox"
            className="max-h-60 overflow-y-auto overscroll-contain p-1"
            style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
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
                      "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[13px] transition-colors",
                      selected ? "bg-[#EBF5FB] text-[#0089bb] font-semibold" : "text-[#374151] hover:bg-[#f8fafc]"
                    )}
                  >
                    {to12h(v)}
                    {selected && <Check className="h-3.5 w-3.5" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
