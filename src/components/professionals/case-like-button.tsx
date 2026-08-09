"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { Heart } from "lucide-react";
import { useLocale } from "next-intl";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

// Public "Me gusta" on a caso de éxito — a SINGLE clickable heart, nothing more (no label,
// no count, no pill). One like per browser (localStorage guard), optimistic, persisted via
// the API. The professional sees the like TOTAL on their own panel cards; a visitor just
// taps the heart. Styling/position come from `className` (used as an overlay on the cover).
const KEY = "cc_liked_cases";
function likedSet(): Set<string> {
  try { return new Set<string>(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { return new Set(); }
}

export function CaseLikeButton({
  professionalId,
  caseId,
  label,
  className,
}: {
  professionalId: string;
  caseId: string;
  label: string;
  className?: string;
}) {
  const locale = useLocale();
  const { user, loading: authLoading } = useAuth();
  const [liked, setLiked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setLiked(likedSet().has(caseId)); }, [caseId]);

  async function toggle(e: MouseEvent) {
    // The heart sits over the cover (which opens the lightbox) — don't trigger that.
    e.preventDefault();
    e.stopPropagation();
    if (liked || busy) return;
    if (authLoading) return;
    if (!user) {
      const redirect = typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}${window.location.hash}`
        : "/";
      window.location.assign(`/${locale}/login?redirect=${encodeURIComponent(redirect)}`);
      return;
    }
    setBusy(true);
    setLiked(true); // optimistic
    try {
      const s = likedSet(); s.add(caseId);
      try { localStorage.setItem(KEY, JSON.stringify([...s])); } catch { /* ignore */ }
      await fetch("/api/portfolio-like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professionalId, caseId }),
      });
    } catch { /* keep optimistic */ } finally { setBusy(false); }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={liked || busy}
      aria-pressed={liked}
      aria-label={label}
      className={cn("transition-colors", !liked && !busy && "cursor-pointer", className)}
    >
      <Heart className={cn("h-5 w-5 transition-transform", liked && "fill-current text-[#e11d48]")} />
    </button>
  );
}
