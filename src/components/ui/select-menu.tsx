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
  // 320px shows short lists (e.g. Todas + 7 provincias) without a scrollbar, while
  // longer lists (cantones, DOB years) still scroll inside the popover.
  const pos = useAnchoredPosition(triggerRef, open, 320);

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

  // Mouse-wheel scroll INSIDE the list. The list is portaled to <body>, OUTSIDE a Radix
  // MODAL Dialog's `react-remove-scroll`, which attaches a non-passive `wheel` listener on
  // `document` and preventDefault()s wheel events whose target is outside the modal — so the
  // portaled list (e.g. the DOB year list) couldn't scroll on wheel at all. We attach a
  // native wheel listener on the LIST itself: it runs at the target, BEFORE react-remove-
  // scroll's document-level bubble listener, and stopPropagation() keeps that listener from
  // ever cancelling it — so the list scrolls natively (overscroll-contain stops chaining).
  // Harmless outside a dialog (just keeps the page still while hovering the open list).
  useEffect(() => {
    const el = listRef.current;
    if (!open || !pos || !el) return;
    let lastTouchY = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      el.scrollTop += e.deltaY;
    };
    const onTouchStart = (e: TouchEvent) => {
      lastTouchY = e.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? lastTouchY;
      e.preventDefault();
      e.stopPropagation();
      el.scrollTop += lastTouchY - y;
      lastTouchY = y;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
    };
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
          style={{
            position: "absolute",
            left: pos.left,
            top: pos.top,
            minWidth: pos.width,
            width: "max-content",
            maxWidth: "min(20rem, calc(100vw - 1.5rem))",
            maxHeight: pos.maxH,
            zIndex: 9999,
            // See (1) above — without this the list is unclickable inside a modal Radix Dialog.
            pointerEvents: "auto",
          }}
          className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-xl"
        >
          <div
            ref={listRef}
            role="listbox"
            // The popup is portaled to <body> (outside any Radix Dialog). THREE things keep it
            // clickable INSIDE a Radix MODAL Dialog:
            //   (1) `pointerEvents: "auto"` — a modal `Dialog.Content` (DismissableLayer with
            //       disableOutsidePointerEvents) sets `body { pointer-events: none }` while open
            //       and re-enables it only on the dialog layer. This list is portaled to <body>,
            //       OUTSIDE that layer, so without this it inherits pointer-events:none and every
            //       option is pointer-dead — clicks pass through and onClick never fires. THIS was
            //       the real "DOB picker won't let me select a date" bug (affects para mí AND para
            //       otra persona — same component, same modal).
            //   (2) stop pointer/mouse-down propagation; and
            //   (3) the `data-selectmenu-list` marker, which lets a Radix `Dialog.Content`
            //       `onInteractOutside`/`onPointerDownOutside`/`onFocusOutside` preventDefault for
            //       it — so now that the option click DOES fire, it doesn't dismiss the modal.
            data-selectmenu-list=""
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              maxHeight: pos.maxH,
              WebkitOverflowScrolling: "touch",
              touchAction: "pan-y",
            }}
            className="overflow-y-auto overscroll-contain py-1"
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
        </div>,
        document.body
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
