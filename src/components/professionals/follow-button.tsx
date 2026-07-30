"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { UserCheck, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const PENDING_FOLLOW_KEY = "contratacr:pending-follow-professional";
const LOCAL_FOLLOW_PREFIX = "contratacr:local-professional-follows";

type FollowButtonProps = {
  professionalId: string;
  isOwn?: boolean;
  compact?: boolean;
  className?: string;
  showCount?: boolean;
  initialFollowers?: number;
};

function writePendingFollow(professionalId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PENDING_FOLLOW_KEY, professionalId);
}

export function hasPendingFollow() {
  return typeof window !== "undefined" && Boolean(window.localStorage.getItem(PENDING_FOLLOW_KEY));
}

function localFollowKey(userId: string) {
  return `${LOCAL_FOLLOW_PREFIX}:${userId}`;
}

export function getLocalFollowIds(userId?: string): string[] {
  if (typeof window === "undefined" || !userId) return [];
  try {
    const raw = window.localStorage.getItem(localFollowKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string" && id.length > 0) : [];
  } catch {
    return [];
  }
}

function setLocalFollowIds(userId: string, ids: string[]) {
  window.localStorage.setItem(localFollowKey(userId), JSON.stringify([...new Set(ids)]));
}

function addLocalFollow(userId: string, professionalId: string) {
  setLocalFollowIds(userId, [...getLocalFollowIds(userId), professionalId]);
}

function removeLocalFollow(userId: string, professionalId: string) {
  setLocalFollowIds(userId, getLocalFollowIds(userId).filter((id) => id !== professionalId));
}

export async function applyPendingFollow(userId?: string): Promise<boolean> {
  if (typeof window === "undefined" || !userId) return false;
  const professionalId = window.localStorage.getItem(PENDING_FOLLOW_KEY);
  if (!professionalId) return false;
  const db = createClient();
  const { error } = await db
    .from("professional_follows")
    .insert({ follower_id: userId, professional_id: professionalId });
  if (!error || error.code === "23505") {
    window.localStorage.removeItem(PENDING_FOLLOW_KEY);
    window.dispatchEvent(new CustomEvent("professionalFollowsChanged", { detail: { professionalId, delta: error?.code === "23505" ? 0 : 1 } }));
    return true;
  }
  addLocalFollow(userId, professionalId);
  window.localStorage.removeItem(PENDING_FOLLOW_KEY);
  window.dispatchEvent(new CustomEvent("professionalFollowsChanged", { detail: { professionalId, delta: 1 } }));
  return true;
}

export function FollowButton({ professionalId, isOwn = false, compact = false, className, showCount = false, initialFollowers = 0 }: FollowButtonProps) {
  const locale = useLocale();
  const { user, loading: authLoading } = useAuth();
  const [following, setFollowing] = useState(false);
  const [followers, setFollowers] = useState(initialFollowers);
  const [busy, setBusy] = useState(false);
  const es = locale !== "en";

  const refresh = useCallback(async () => {
    const db = createClient();
    const countQuery = db.from("professional_follows").select("id", { count: "exact", head: true }).eq("professional_id", professionalId);
    const stateQuery = user
      ? db.from("professional_follows").select("id").eq("professional_id", professionalId).eq("follower_id", user.id).maybeSingle()
      : Promise.resolve({ data: null });
    const [countResult, stateResult] = await Promise.all([countQuery, stateQuery]);
    setFollowers(countResult.count ?? initialFollowers);
    setFollowing(Boolean(stateResult.data) || Boolean(user && getLocalFollowIds(user.id).includes(professionalId)));
  }, [initialFollowers, professionalId, user]);

  useEffect(() => {
    void refresh();
    const sync = () => void refresh();
    window.addEventListener("professionalFollowsChanged", sync);
    return () => window.removeEventListener("professionalFollowsChanged", sync);
  }, [refresh]);

  if (isOwn) return null;

  async function toggle(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (busy || authLoading) return;
    if (!user) {
      writePendingFollow(professionalId);
      const redirect = encodeURIComponent("/dashboard/profesional?tab=network&mode=use");
      window.location.assign(`/${locale}/login?redirect=${redirect}`);
      return;
    }

    setBusy(true);
    const db = createClient();
    const result = following
      ? await db.from("professional_follows").delete().eq("follower_id", user.id).eq("professional_id", professionalId)
      : await db.from("professional_follows").insert({ follower_id: user.id, professional_id: professionalId });
    if (!result.error) {
      setFollowing(!following);
      setFollowers((value) => Math.max(0, value + (following ? -1 : 1)));
      window.dispatchEvent(new CustomEvent("professionalFollowsChanged", { detail: { professionalId, delta: following ? -1 : 1 } }));
    } else {
      if (following) removeLocalFollow(user.id, professionalId);
      else addLocalFollow(user.id, professionalId);
      setFollowing(!following);
      setFollowers((value) => Math.max(0, value + (following ? -1 : 1)));
      window.dispatchEvent(new CustomEvent("professionalFollowsChanged", { detail: { professionalId, delta: following ? -1 : 1 } }));
    }
    setBusy(false);
  }

  const label = following ? (es ? "Siguiendo" : "Following") : (es ? "Seguir" : "Follow");
  const countLabel = es
    ? `${followers} ${followers === 1 ? "seguidor" : "seguidores"}`
    : `${followers} ${followers === 1 ? "follower" : "followers"}`;

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-label={`${label}. ${countLabel}`}
        aria-pressed={following}
        title={`${label} · ${countLabel}`}
        className={cn(
          "flex h-7 min-w-7 items-center justify-center gap-1 rounded-full px-1.5 text-[11px] font-extrabold transition-colors disabled:opacity-60",
          following ? "bg-[#e9f7fc] text-[#007eae]" : "bg-white text-[#7c8ba0] hover:bg-[#eef9fd] hover:text-[#0089bb]",
          className,
        )}
      >
        {following ? <UserCheck className="h-[17px] w-[17px]" /> : <UserPlus className="h-[17px] w-[17px]" />}
        <span className="tabular-nums">{followers}</span>
      </button>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={following}
        className={cn(
          "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors disabled:opacity-60",
          following ? "border border-[#b8e3f2] bg-[#eef9fd] text-[#007eae]" : "bg-[#102746] text-white hover:bg-[#1b365d]",
        )}
      >
        {following ? <UserCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
        {label}
      </button>
      {showCount && <span className="text-sm font-semibold text-[#526277]">{countLabel}</span>}
    </div>
  );
}
