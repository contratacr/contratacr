"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

// Public "Me gusta" on a caso de éxito. One like per browser (localStorage guard); optimistic
// +1, then reconciles with the server count. The professional sees the total on their own cases.
const KEY = "cc_liked_cases";
function likedSet(): Set<string> {
  try { return new Set<string>(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { return new Set(); }
}

export function CaseLikeButton({
  professionalId,
  caseId,
  initialLikes = 0,
  label,
}: {
  professionalId: string;
  caseId: string;
  initialLikes?: number;
  label: string;
}) {
  const [likes, setLikes] = useState(initialLikes);
  const [liked, setLiked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setLiked(likedSet().has(caseId)); }, [caseId]);

  async function toggle() {
    if (liked || busy) return;
    setBusy(true);
    setLiked(true);
    setLikes((n) => n + 1); // optimistic
    try {
      const s = likedSet(); s.add(caseId);
      try { localStorage.setItem(KEY, JSON.stringify([...s])); } catch { /* ignore */ }
      const res = await fetch("/api/portfolio-like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professionalId, caseId }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data && typeof data.likes === "number") setLikes(data.likes);
    } catch { /* keep optimistic */ } finally { setBusy(false); }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={liked || busy}
      aria-pressed={liked}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors",
        liked ? "border-[#fecdd3] bg-[#fff1f2] text-[#e11d48]" : "border-[#e5e7eb] bg-white text-[#6b7280] hover:border-[#fecdd3] hover:text-[#e11d48]",
        !liked && !busy && "cursor-pointer"
      )}
    >
      <Heart className={cn("h-4 w-4", liked && "fill-current")} />
      {likes > 0 ? <span className="tabular-nums">{likes}</span> : <span>{label}</span>}
    </button>
  );
}
