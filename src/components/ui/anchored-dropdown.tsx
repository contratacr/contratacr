"use client";

import { useCallback, useEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export type AnchoredPos = { left: number; width: number; top?: number; bottom?: number; maxH: number };

// Position an autocomplete dropdown so it NEVER covers the field it belongs to.
// It's portaled to <body> (so no ancestor `overflow:hidden`/`transform` can clip
// it) and `position: fixed`, anchored to the field's rect. It opens BELOW the
// field by default and flips ABOVE only when the *visible* space below is too
// small — and "visible" is measured with `visualViewport`, so the MOBILE KEYBOARD
// is accounted for (the old `window.innerHeight` math thought the area behind the
// keyboard was free, so the list rendered behind it / over the field). max-height
// is clamped to the visible space and the list scrolls internally.
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
    // getBoundingClientRect + position:fixed are BOTH layout-viewport coords, so
    // anchoring stays correct; only the *visible* window changes with the keyboard.
    const vv = window.visualViewport;
    const viewTop = vv?.offsetTop ?? 0;
    const viewH = vv?.height ?? window.innerHeight;
    const MARGIN = 6;
    const PAD = 10;
    const spaceBelow = viewTop + viewH - r.bottom;
    const spaceAbove = r.top - viewTop;
    const clamp = (s: number) => Math.max(120, Math.min(maxHeight, s - PAD));
    // Prefer below; flip up only when below is cramped AND above has more room.
    if (spaceBelow < 180 && spaceAbove > spaceBelow) {
      setPos({ left: r.left, width: r.width, bottom: window.innerHeight - r.top + MARGIN, maxH: clamp(spaceAbove) });
    } else {
      setPos({ left: r.left, width: r.width, top: r.bottom + MARGIN, maxH: clamp(spaceBelow) });
    }
  }, [anchorRef, maxHeight]);

  useEffect(() => {
    if (!open) return;
    reposition();
    const onMove = () => reposition();
    window.addEventListener("scroll", onMove, true); // capture → catches scrolling parents
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

// Portaled, keyboard-aware dropdown container. Render the list items as children;
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
        position: "fixed",
        left: pos.left,
        width: pos.width,
        top: pos.top,
        bottom: pos.bottom,
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
