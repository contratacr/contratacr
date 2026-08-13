"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared vertical-ellipsis overflow menu for the panel list cards (sprint 441).
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
      {/* Keep the same vertical-ellipsis trigger at every breakpoint. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#e5e7eb] text-[#718096] transition-colors hover:border-[#b9c8d6] hover:bg-[#f3f4f6] hover:text-[#162543]"
      >
        <MoreVertical className="h-5 w-5" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute bottom-[calc(100%+6px)] right-0 z-50 max-h-[calc(100dvh-2rem)] min-w-[190px] overflow-y-auto rounded-xl border border-gray-100 bg-white py-1 shadow-xl"
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
