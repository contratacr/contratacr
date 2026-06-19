"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectMenuOption {
  value: string;
  label: string;
}

interface SelectMenuProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectMenuOption[];
  /** Shown (muted) when nothing is selected. */
  placeholder?: string;
  label?: React.ReactNode;
  error?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
}

// A polished single-select popover that matches the Disponibilidad `TimeSelect`:
// a button trigger (the selected label, or a muted placeholder) + a rotating
// ChevronDown, and a listbox where the selected option is highlighted with a Check.
// Closes on outside click / Escape and scrolls the selected option into view.
// Use it wherever a native <select> would otherwise be (provincia, cantón, …) so
// every dropdown in the app opens and reads the same way.
export function SelectMenu({ value, onChange, options, placeholder, label, error, id, className, disabled }: SelectMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

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
          "flex items-center h-11 rounded-xl border bg-white pl-3.5 pr-10 text-sm font-medium relative text-left transition-all",
          "focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent",
          open && "ring-2 ring-[#009FD9] border-transparent",
          error ? "border-red-400" : "border-[#e5e7eb]",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <span className={cn("min-w-0 flex-1 truncate", selected ? "text-[#111827]" : "text-[#9ca3af]")}>
          {selected?.label ?? placeholder ?? ""}
        </span>
        <ChevronDown className={cn("pointer-events-none absolute right-3 h-4 w-4 text-[#9ca3af] transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          className="absolute top-full left-0 z-50 mt-1 max-h-60 w-full min-w-[9rem] overflow-y-auto rounded-xl border border-[#e5e7eb] bg-white py-1 shadow-lg"
        >
          {options.length === 0 ? (
            <p className="px-3 py-2 text-xs text-[#9ca3af]">—</p>
          ) : (
            options.map((opt) => {
              const isSel = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSel}
                  data-selected={isSel}
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors",
                    isSel ? "bg-[#EBF5FB] text-[#0089bb] font-semibold" : "text-[#374151] hover:bg-[#f3f4f6]"
                  )}
                >
                  <span className="min-w-0 truncate">{opt.label}</span>
                  {isSel && <Check className="h-3.5 w-3.5 shrink-0" />}
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
