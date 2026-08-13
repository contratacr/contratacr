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

export function FollowNetworkSummaryLink({ onOpen }: { onOpen?: (view: "following" | "followers") => void }) {
  const locale = useLocale();
  const es = locale !== "en";
  const { user } = useAuth();
  const [counts, setCounts] = useState<Counts | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setCounts(null);
      return;
    }

    const db = createClient();
    const { data: ownPro } = await db.from("professionals").select("id").eq("profile_id", user.id).maybeSingle();
    const [followingResult, followersResult] = await Promise.all([
      db.from("professional_follows").select("id", { count: "exact", head: true }).eq("follower_id", user.id),
      ownPro
        ? db.from("professional_follows").select("id", { count: "exact", head: true }).eq("professional_id", ownPro.id)
        : Promise.resolve({ count: 0 }),
    ]);

    setCounts({
      following: followingResult.error ? getLocalFollowIds(user.id).length : followingResult.count ?? 0,
      followers: followersResult.count ?? 0,
    });
  }, [user]);

  useEffect(() => {
    void load();
    window.addEventListener("professionalFollowsChanged", load);
    return () => window.removeEventListener("professionalFollowsChanged", load);
  }, [load]);

  if (!user) return null;

  return (
    <div className="inline-flex items-start gap-3 text-xs font-semibold leading-none text-[#526277] sm:gap-4">
      <button
        type="button"
        onClick={() => onOpen?.("following")}
        className="flex min-w-12 flex-col items-center gap-1 rounded-md text-center transition hover:text-[#009FD9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9]"
      >
        {counts ? (
          <strong className="text-sm leading-none text-[#162543]">{counts.following}</strong>
        ) : (
          <span aria-hidden="true" className="h-3.5 w-5 animate-pulse rounded bg-[#e5edf3]" />
        )}
        <span className="whitespace-nowrap">{es ? "seguidos" : "following"}</span>
      </button>
      <button
        type="button"
        onClick={() => onOpen?.("followers")}
        className="flex min-w-12 flex-col items-center gap-1 rounded-md text-center transition hover:text-[#009FD9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9]"
      >
        {counts ? (
          <strong className="text-sm leading-none text-[#162543]">{counts.followers}</strong>
        ) : (
          <span aria-hidden="true" className="h-3.5 w-5 animate-pulse rounded bg-[#e5edf3]" />
        )}
        <span className="whitespace-nowrap">{es ? "seguidores" : "followers"}</span>
      </button>
    </div>
  );
}
