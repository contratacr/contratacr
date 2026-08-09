"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
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
  labelOverride?: string;
  onCountChange?: (count: number) => void;
  onSelfAction?: () => void;
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

export function FollowButton({ professionalId, isOwn = false, compact = false, className, showCount = false, initialFollowers = 0, labelOverride, onCountChange, onSelfAction }: FollowButtonProps) {
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
    const nextFollowers = countResult.count ?? initialFollowers;
    setFollowers(nextFollowers);
    onCountChange?.(nextFollowers);
    setFollowing(Boolean(stateResult.data) || Boolean(user && getLocalFollowIds(user.id).includes(professionalId)));
  }, [initialFollowers, onCountChange, professionalId, user]);

  useEffect(() => {
    void refresh();
    const sync = () => void refresh();
    window.addEventListener("professionalFollowsChanged", sync);
    return () => window.removeEventListener("professionalFollowsChanged", sync);
  }, [refresh]);

  async function toggle(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (busy || authLoading) return;
    if (isOwn) {
      onSelfAction?.();
      return;
    }
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
      setFollowers((value) => {
        const nextFollowers = Math.max(0, value + (following ? -1 : 1));
        onCountChange?.(nextFollowers);
        return nextFollowers;
      });
      window.dispatchEvent(new CustomEvent("professionalFollowsChanged", { detail: { professionalId, delta: following ? -1 : 1 } }));
    } else {
      if (following) removeLocalFollow(user.id, professionalId);
      else addLocalFollow(user.id, professionalId);
      setFollowing(!following);
      setFollowers((value) => {
        const nextFollowers = Math.max(0, value + (following ? -1 : 1));
        onCountChange?.(nextFollowers);
        return nextFollowers;
      });
      window.dispatchEvent(new CustomEvent("professionalFollowsChanged", { detail: { professionalId, delta: following ? -1 : 1 } }));
    }
    setBusy(false);
  }

  const label = labelOverride ?? (following ? (es ? "Siguiendo" : "Following") : (es ? "Seguir" : "Follow"));
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
        className={cn(
          "inline-flex h-8 min-w-[96px] items-center justify-center rounded-lg px-4 text-sm font-bold transition-colors disabled:opacity-60",
          following || labelOverride
            ? "bg-[#f0f2f5] text-[#111827] hover:bg-[#e5e9ee]"
            : "bg-[#102746] text-white hover:bg-[#1b365d]",
          className,
        )}
      >
        {label}
      </button>
    );
  }

  return (
    <div className={cn("inline-flex w-fit flex-wrap items-center gap-2.5", className)}>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={following}
        className={cn(
          "inline-flex h-7 min-w-[72px] items-center justify-center rounded-full px-2.5 text-center text-[12px] font-extrabold transition-colors disabled:opacity-60 sm:min-w-[78px] sm:px-3",
          following
            ? "border border-[#d7e3ec] bg-white text-[#162543] hover:bg-[#f5f8fb]"
            : "bg-[#102746] text-white shadow-sm hover:bg-[#1b365d]",
        )}
      >
        <span className="w-full text-center">{label}</span>
      </button>
      {showCount && <span className="text-sm font-semibold text-[#526277]">{countLabel}</span>}
    </div>
  );
}
