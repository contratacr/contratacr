"use client";

import { useCallback, useEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export type AnchoredPos = { left: number; top: number; width: number; maxH: number };

// Position an autocomplete dropdown so it stays ATTACHED to its field and NEVER
// covers it. It's portaled to <body> (so no ancestor `overflow:hidden`/`transform`
// can clip it) and positioned **`absolute` in DOCUMENT coordinates** (rect +
// scrollX/scrollY). Why absolute-in-document, not `fixed`: a `fixed` panel is
// pinned to the VIEWPORT, so on iOS — where focusing an input opens the keyboard
// and shifts the visual viewport — the panel floats up and OVER the field while
// the input scrolls down with the page (it "detaches"). In document coords the
// panel lives in the same coordinate space as the input, so they move together
// (page scroll, keyboard shift, internal modal scroll) and it always sits DIRECTLY
// BELOW the input. max-height is clamped to the space above the keyboard and the
// list scrolls internally.
export function useAnchoredPosition(
  anchorRef: RefObject<HTMLElement | null>,
  open: boolean,
  maxHeight = 300
): AnchoredPos | null {
  const [pos, setPos] = useState<AnchoredPos | null>(null);

  const reposition = useCallback(() => {
    const el = anchorRef.current;
    if (!el || typeof window === "undefined") return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) { setPos(null); return; } // field hidden (display:none)
    const sx = window.scrollX;
    const sy = window.scrollY;
    const vv = window.visualViewport;
    const viewBottom = (vv?.offsetTop ?? 0) + (vv?.height ?? window.innerHeight);
    const GAP = 6;
    const PAD = 10;
    const width = r.width;
    let left = r.left + sx;
    if (left + width > sx + window.innerWidth - 8) left = Math.max(8 + sx, sx + window.innerWidth - 8 - width);
    const viewTop = vv?.offsetTop ?? 0;
    const spaceBelow = viewBottom - r.bottom - PAD;
    const spaceAbove = r.top - viewTop - PAD;
    const openAbove = spaceBelow < Math.min(220, maxHeight) && spaceAbove > spaceBelow;
    const maxH = Math.max(120, Math.min(maxHeight, openAbove ? spaceAbove : spaceBelow));
    const top = openAbove
      ? Math.max(sy + viewTop + PAD, r.top + sy - GAP - maxH)
      : r.bottom + sy + GAP;
    setPos({ left, top, width, maxH });
  }, [anchorRef, maxHeight]);

  useEffect(() => {
    if (!open) { setPos(null); return; }
    reposition();
    const onMove = () => reposition();
    window.addEventListener("scroll", onMove, true); // capture → catches scrolling parents/modals
    window.addEventListener("resize", onMove);
    window.visualViewport?.addEventListener("resize", onMove); // keyboard show/hide
    window.visualViewport?.addEventListener("scroll", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
      window.visualViewport?.removeEventListener("resize", onMove);
      window.visualViewport?.removeEventListener("scroll", onMove);
    };
  }, [open, reposition]);

  return pos;
}

// Portaled, attached dropdown container. Render the list items as children;
// the box chrome (border/rounded/bg/shadow + internal scroll) is provided here.
export function AnchoredDropdown({
  anchorRef,
  open,
  maxHeight,
  className,
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  maxHeight?: number;
  className?: string;
  children: ReactNode;
}) {
  const pos = useAnchoredPosition(anchorRef, open, maxHeight);
  if (!open || !pos || typeof document === "undefined") return null;
  return createPortal(
    <div
      style={{
        position: "absolute",
        left: pos.left,
        top: pos.top,
        width: pos.width,
        maxHeight: pos.maxH,
        zIndex: 9999,
      }}
      className={cn(
        "overflow-y-auto overscroll-contain rounded-xl border border-[#e5e7eb] bg-white shadow-xl",
        className
      )}
    >
      {children}
    </div>,
    document.body
  );
}
