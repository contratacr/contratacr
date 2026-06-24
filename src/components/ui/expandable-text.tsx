"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/* Shows user-entered text (descriptions, notes, proposal messages — already char-limited)
   FULLY readable while keeping cards compact: it clamps to `lines` and reveals a
   "Ver más / Ver menos" toggle ONLY when the text actually overflows that many lines.
   Always wraps safely (`whitespace-pre-line` + `[overflow-wrap:anywhere]`) so long unbroken
   strings never overflow or hard-cut. Sprint 521 — the ONE pattern for long panel text. */
export function ExpandableText({
  text,
  className,
  lines = 4,
}: {
  text: string;
  className?: string;
  lines?: number;
}) {
  const t = useTranslations("common");
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Measure ONLY while clamped (collapsed): if the real content is taller than the
    // clamped box, the toggle is needed. Once true it stays true (text is bounded), so
    // "Ver menos" remains available after expanding.
    const measure = () => {
      if (expanded) return;
      setOverflowing(el.scrollHeight - el.clientHeight > 2);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [text, expanded, lines]);

  return (
    <div className={className}>
      <p
        ref={ref}
        className="whitespace-pre-line text-[13px] leading-relaxed text-[#374151] [overflow-wrap:anywhere]"
        style={
          expanded
            ? undefined
            : { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" }
        }
      >
        {text}
      </p>
      {overflowing && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cn("mt-1 text-[12px] font-semibold text-[#0089bb] transition-colors hover:text-[#009FD9]")}
        >
          {expanded ? t("seeLess") : t("seeMore")}
        </button>
      )}
    </div>
  );
}
