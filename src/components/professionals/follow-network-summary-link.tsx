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
  const [counts, setCounts] = useState<Counts>({ following: 0, followers: 0 });

  const load = useCallback(async () => {
    if (!user) {
      setCounts({ following: 0, followers: 0 });
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
    <div className="inline-flex items-center gap-3 text-xs font-semibold text-[#526277]">
      <button
        type="button"
        onClick={() => onOpen?.("following")}
        className="whitespace-nowrap rounded-md transition hover:text-[#009FD9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9]"
      >
        <strong className="text-[#162543]">{counts.following}</strong> {es ? "seguidos" : "following"}
      </button>
      <button
        type="button"
        onClick={() => onOpen?.("followers")}
        className="whitespace-nowrap rounded-md transition hover:text-[#009FD9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9]"
      >
        <strong className="text-[#162543]">{counts.followers}</strong> {es ? "seguidores" : "followers"}
      </button>
    </div>
  );
}
