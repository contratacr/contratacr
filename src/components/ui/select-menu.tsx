"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAnchoredPosition } from "@/components/ui/anchored-dropdown";

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
//
// The listbox is PORTALED to <body> (via `useAnchoredPosition`) so it is NEVER clipped
// by an ancestor with `overflow` — e.g. the publicar-proyecto modal's scrolling body or
// the pro panel's accordion, which used to "cut off" the open options. `max-h-72` (≈8 rows
// at ~36px) shows a SHORT list in full (all 7 provinces, no scrollbar) while a LONG list
// (cantones, DOB years) scrolls. Width grows to the longest option but never narrower than
// the trigger. Use it wherever a native <select> would otherwise be (provincia, cantón, …).
export function SelectMenu({ value, onChange, options, placeholder, label, error, id, className, disabled }: SelectMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  // 288px ≈ max-h-72 — the hook clamps it down to the space above the viewport/keyboard.
  const pos = useAnchoredPosition(triggerRef, open, 288);

  // Close on outside click / Escape. The list is portaled (outside rootRef), so it must be
  // checked too — otherwise a click on an option would register as "outside" and close
  // before the option's onClick selects it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  // Scroll the selected option into view once the portal has mounted (keyed on `pos`).
  useEffect(() => {
    if (!open || !pos) return;
    const el = listRef.current?.querySelector<HTMLElement>("[data-selected='true']");
    el?.scrollIntoView({ block: "center" });
  }, [open, pos]);

  return (
    <div ref={rootRef} className={cn("flex flex-col gap-1", className)}>
      {label && <label htmlFor={id} className="text-xs font-medium text-[#6b7280]">{label}</label>}
      <button
        ref={triggerRef}
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
          // Mutually-exclusive states: open → ring + transparent border; error → red;
          // otherwise a neutral border that DARKENS on hover (#cbd5e1, the Input hover spec).
          open ? "ring-2 ring-[#009FD9] border-transparent" : error ? "border-red-400" : "border-[#e5e7eb]",
          !open && !error && !disabled && "hover:border-[#cbd5e1]",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <span className={cn("min-w-0 flex-1 truncate", selected ? "text-[#111827]" : "text-[#9ca3af]")}>
          {selected?.label ?? placeholder ?? ""}
        </span>
        <ChevronDown className={cn("pointer-events-none absolute right-3 h-4 w-4 text-[#9ca3af] transition-transform", open && "rotate-180")} />
      </button>

      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={listRef}
          role="listbox"
          // The popup is portaled to <body> (outside any Radix Dialog). Stop pointerdown so
          // a Radix Dialog's "pointer-down-outside" doesn't treat an option click as outside
          // and close the whole modal (e.g. the booking modal's DOB picker).
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            left: pos.left,
            top: pos.top,
            minWidth: pos.width,
            width: "max-content",
            maxWidth: "min(20rem, calc(100vw - 1.5rem))",
            maxHeight: pos.maxH,
            zIndex: 9999,
          }}
          className="overflow-y-auto overscroll-contain rounded-xl border border-[#e5e7eb] bg-white py-1 shadow-xl"
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
        </div>,
        document.body
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
