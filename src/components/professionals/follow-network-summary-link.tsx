"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { getLocalFollowIds } from "@/components/professionals/follow-button";

type Counts = {
  following: number;
  followers: number;
};

const followCountsCache = new Map<string, Counts>();

function readCachedCounts(userId?: string): Counts {
  if (!userId) return { following: 0, followers: 0 };
  const memory = followCountsCache.get(userId);
  if (memory) return memory;
  if (typeof window === "undefined") return { following: 0, followers: 0 };
  try {
    const saved = window.localStorage.getItem(`contratacr:follow-counts:${userId}`);
    if (!saved) return { following: 0, followers: 0 };
    const parsed = JSON.parse(saved) as Partial<Counts>;
    const counts = {
      following: Math.max(0, Number(parsed.following) || 0),
      followers: Math.max(0, Number(parsed.followers) || 0),
    };
    followCountsCache.set(userId, counts);
    return counts;
  } catch {
    return { following: 0, followers: 0 };
  }
}

function cacheCounts(userId: string, counts: Counts) {
  followCountsCache.set(userId, counts);
  try {
    window.localStorage.setItem(`contratacr:follow-counts:${userId}`, JSON.stringify(counts));
  } catch {
    // Memory cache still keeps client-side navigation stable when storage is unavailable.
  }
}

export function FollowNetworkSummaryLink({ onOpen }: { onOpen?: (view: "following" | "followers") => void }) {
  const locale = useLocale();
  const es = locale !== "en";
  const { user } = useAuth();
  const [counts, setCounts] = useState<Counts>({ following: 0, followers: 0 });

  const load = useCallback(async () => {
    if (!user) {
      setCounts({ following: 0, followers: 0 });
      return;
    }

    setCounts(readCachedCounts(user.id));

    const db = createClient();
    const { data: ownPro } = await db.from("professionals").select("id").eq("profile_id", user.id).maybeSingle();
    const [followingResult, followersResult] = await Promise.all([
      db.from("professional_follows").select("id", { count: "exact", head: true }).eq("follower_id", user.id),
      ownPro
        ? db.from("professional_follows").select("id", { count: "exact", head: true }).eq("professional_id", ownPro.id)
        : Promise.resolve({ count: 0 }),
    ]);

    const nextCounts = {
      following: followingResult.error ? getLocalFollowIds(user.id).length : followingResult.count ?? 0,
      followers: followersResult.count ?? 0,
    };
    cacheCounts(user.id, nextCounts);
    setCounts((current) => current.following === nextCounts.following && current.followers === nextCounts.followers ? current : nextCounts);
  }, [user]);

  useEffect(() => {
    void load();
    window.addEventListener("professionalFollowsChanged", load);
    return () => window.removeEventListener("professionalFollowsChanged", load);
  }, [load]);

  if (!user) return null;

  return (
    <div className="inline-flex items-center gap-4 text-[14px] font-semibold leading-none text-[#526277] sm:gap-4 sm:text-xs">
      <button
        type="button"
        onClick={() => onOpen?.("following")}
        className="inline-flex !min-h-0 items-baseline gap-1.5 rounded-md transition hover:text-[#009FD9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9] sm:flex sm:min-w-12 sm:flex-col sm:items-center sm:justify-end sm:gap-1 sm:text-center"
      >
        <strong className="text-[15px] leading-none text-[#162543] sm:text-sm">{counts.following}</strong>
        <span className="whitespace-nowrap">{es ? "seguidos" : "following"}</span>
      </button>
      <button
        type="button"
        onClick={() => onOpen?.("followers")}
        className="inline-flex !min-h-0 items-baseline gap-1.5 rounded-md transition hover:text-[#009FD9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9] sm:flex sm:min-w-12 sm:flex-col sm:items-center sm:justify-end sm:gap-1 sm:text-center"
      >
        <strong className="text-[15px] leading-none text-[#162543] sm:text-sm">{counts.followers}</strong>
        <span className="whitespace-nowrap">{es ? "seguidores" : "followers"}</span>
      </button>
    </div>
  );
}
