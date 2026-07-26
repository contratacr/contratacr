"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared "··· / Acciones" overflow menu for the panel list cards (sprint 441).
 * Keeps cards clean: ONE primary action stays visible next to this; the SECONDARY
 * actions live here. Used identically by the professional and client Solicitudes sections and
 * Mis proyectos. Opens UPWARD (the footer sits at the card bottom) so it stays in
 * view, and the cards no longer use `overflow-hidden` (rounded button corners fix the
 * hover-clip instead) so this dropdown is never clipped.
 */
export type CardAction = {
  label: string;
  onClick: () => void;
  destructive?: boolean;
};

export function CardActionsMenu({ actions, label }: { actions: CardAction[]; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <div ref={ref} className="relative shrink-0">
      {/* RESPONSIVE trigger (sprint 442): a compact "···" icon on MOBILE (tight space), a
          labelled "Acciones" + chevron on DESKTOP (clearer with room to spare). */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#e5e7eb] px-2.5 sm:px-3.5 text-xs font-semibold text-[#374151] hover:bg-[#f3f4f6] transition-colors"
      >
        <MoreHorizontal className="h-4 w-4 sm:hidden" />
        <span className="hidden sm:inline">{label}</span>
        <ChevronDown className={cn("hidden sm:block h-3.5 w-3.5 text-[#9ca3af] transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute bottom-full right-0 mb-1.5 z-30 min-w-[190px] overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-xl"
        >
          {actions.map((a, i) => (
            <button
              key={i}
              role="menuitem"
              type="button"
              onClick={() => { setOpen(false); a.onClick(); }}
              className={cn(
                "block w-full px-3.5 py-2.5 text-left text-sm transition-colors",
                a.destructive ? "text-red-600 hover:bg-red-50" : "text-[#374151] hover:bg-[#f9fafb]",
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
