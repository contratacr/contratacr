"use client";

import { useEffect, useState, type RefObject } from "react";

/** A visual cue for touch lists: iOS hides its native scrollbar when idle.
 * Scrolling stays native; this indicator never captures touch or keyboard input. */
export function PersistentScrollIndicator({ scrollRef }: { scrollRef: RefObject<HTMLElement | null> }) {
  const [thumb, setThumb] = useState<{ height: number; top: number } | null>(null);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const range = scroller.scrollHeight - scroller.clientHeight;
      const track = Math.max(0, scroller.clientHeight - 16);
      const height = Math.min(track, Math.max(24, track * scroller.clientHeight / Math.max(1, scroller.scrollHeight)));
      const next = range > 1 && track > 0
        ? { height, top: Math.max(0, Math.min(1, scroller.scrollTop / range)) * (track - height) }
        : null;
      setThumb(previous => previous?.height === next?.height && previous?.top === next?.top ? previous : next);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const resize = new ResizeObserver(schedule);
    const observeSizes = () => {
      resize.disconnect();
      resize.observe(scroller);
      for (const child of scroller.children) resize.observe(child);
      schedule();
    };
    const content = new MutationObserver(observeSizes);
    content.observe(scroller, { childList: true, subtree: true, characterData: true });
    observeSizes();
    scroller.addEventListener("scroll", schedule, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      resize.disconnect();
      content.disconnect();
      scroller.removeEventListener("scroll", schedule);
    };
  }, [scrollRef]);

  if (!thumb) return null;
  return <div aria-hidden="true" data-persistent-scroll-indicator className="pointer-events-none absolute inset-y-2 right-0 w-1 rounded-full bg-[#e5edf2]">
    <div className="absolute inset-x-0 rounded-full bg-[#7a91a6]" style={{ height: thumb.height, top: thumb.top }} />
  </div>;
}
