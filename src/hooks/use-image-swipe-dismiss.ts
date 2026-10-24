"use client";
import { useRef, useState, type TouchEvent, type MouseEvent } from "react";
import { dismissImageSwipe } from "@/lib/direct-chat/image-interactions";

export function useImageSwipeDismiss(onDismiss: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const [offset, setOffset] = useState(0);
  const scale = () => window.visualViewport?.scale ?? 1;
  const reset = () => { start.current = null; setOffset(0); };
  return {
    imageStyle: { transform: `translateY(${offset}px)` },
    handlers: {
      style: { touchAction: "pinch-zoom" },
      onTouchStart(event: TouchEvent) {
        suppressClick.current = false;
        start.current = event.touches.length === 1 && scale() <= 1.01
          ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
      },
      onTouchMove(event: TouchEvent) {
        if (event.touches.length !== 1 || scale() > 1.01) { suppressClick.current = true; reset(); return; }
        if (!start.current) return;
        const dx = event.touches[0].clientX - start.current.x;
        const dy = event.touches[0].clientY - start.current.y;
        if (Math.hypot(dx,dy) > 10) suppressClick.current = true;
        setOffset(Math.abs(dy) > Math.abs(dx) * 1.25 ? dy : 0);
      },
      onTouchEnd(event: TouchEvent) {
        const origin = start.current;
        const end = event.changedTouches[0];
        if (origin && end && dismissImageSwipe(end.clientX-origin.x,end.clientY-origin.y,scale())) {
          suppressClick.current = true;
          onDismiss();
        }
        reset();
      },
      onTouchCancel() { suppressClick.current = true; reset(); },
      onClick(event: MouseEvent) {
        if (suppressClick.current) { event.preventDefault(); suppressClick.current = false; return; }
        onDismiss();
      },
    },
  };
}
