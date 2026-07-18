"use client";

import { useEffect, type RefObject } from "react";

export function useContainedTouchScroll(
  scrollRef: RefObject<HTMLElement | null>,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    let startY = 0;

    const onTouchStart = (event: TouchEvent) => {
      startY = event.touches[0]?.clientY ?? 0;
    };

    const onTouchMove = (event: TouchEvent) => {
      const target = event.target;
      const startedInsideScroller = target instanceof Node && scrollElement.contains(target);

      if (!startedInsideScroller) {
        event.preventDefault();
        return;
      }

      const currentY = event.touches[0]?.clientY ?? startY;
      const deltaY = currentY - startY;
      const canScroll = scrollElement.scrollHeight > scrollElement.clientHeight + 1;

      if (!canScroll) {
        event.preventDefault();
        return;
      }

      const atTop = scrollElement.scrollTop <= 0;
      const atBottom = scrollElement.scrollTop + scrollElement.clientHeight >= scrollElement.scrollHeight - 1;

      if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
        event.preventDefault();
      }
    };

    document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    document.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });

    return () => {
      document.removeEventListener("touchstart", onTouchStart, { capture: true });
      document.removeEventListener("touchmove", onTouchMove, { capture: true });
    };
  }, [enabled, scrollRef]);
}
