"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { trackInteraction } from "@/lib/analytics/interaction-events";
import { SelfActionModal, SELF_MSG } from "@/components/professionals/self-action-modal";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";

const STORAGE_PREFIX = "contratacr_saved_pros";
const PENDING_SAVE_KEY = "contratacr:pending-save-pro";
const SYNCED_PREFIX = "contratacr_saved_pros_synced";
const syncRequests = new Map<string, Promise<SavedPro[]>>();
const lastSyncAt = new Map<string, number>();

// Favorites are scoped to the signed-in user so two accounts on the same browser
// never see each other's saved pros. We derive the user id synchronously from
// the Supabase auth token in localStorage (the JWT "sub" claim); falls back to
// "guest" when logged out.
function currentUserId(): string {
  if (typeof window === "undefined") return "guest";
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        const token: string | undefined = parsed?.access_token ?? parsed?.currentSession?.access_token;
        if (token) {
          const payload = JSON.parse(atob(token.split(".")[1]));
          if (payload?.sub) return payload.sub as string;
        }
        if (parsed?.user?.id) return parsed.user.id as string;
      }
    }
  } catch {
    /* fall through to guest */
  }
  return "guest";
}

function storageKey(userId?: string): string {
  return `${STORAGE_PREFIX}_${userId || currentUserId()}`;
}

export type SavedPro = {
  id: string;
  slug: string;
  fullName: string;
  avatarUrl?: string;
  categoryIcon: string;
  categoryId: string;
  provinceName: string;
  cantonName: string;
  ratingAvg: number;
  reviewCount: number;
  hourlyRate?: number;
  isVerified: boolean;
  videoconsulta?: boolean;
  coverage?: { country?: boolean } | null;
  followerCount?: number;
};

export function getSavedPros(userId?: string): SavedPro[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(storageKey(userId)) ?? "[]");
  } catch {
    return [];
  }
}

export function savePro(pro: SavedPro, userId?: string) {
  const saved = getSavedPros(userId);
  if (!saved.find((p) => p.id === pro.id)) {
    localStorage.setItem(storageKey(userId), JSON.stringify([...saved, pro]));
  }
}

export function unsavePro(id: string, userId?: string) {
  const saved = getSavedPros(userId).filter((p) => p.id !== id);
  localStorage.setItem(storageKey(userId), JSON.stringify(saved));
}

export function isSaved(id: string, userId?: string): boolean {
  return getSavedPros(userId).some((p) => p.id === id);
}

function setSavedPros(pros: SavedPro[], userId: string) {
  localStorage.setItem(storageKey(userId), JSON.stringify(pros));
}

async function upsertRemoteSavedPros(userId: string, pros: SavedPro[]) {
  if (pros.length === 0) return true;
  const { error } = await createClient().from("saved_professionals").upsert(
    pros.map((pro) => ({ client_id: userId, professional_id: pro.id, snapshot: pro })),
    { onConflict: "client_id,professional_id" },
  );
  return !error;
}

/** Remote favorites are canonical after a one-time upload of this browser's old local favorites. */
export function syncSavedPros(userId: string, force = false): Promise<SavedPro[]> {
  if (!force) {
    const pending = syncRequests.get(userId);
    if (pending) return pending;
    if (Date.now() - (lastSyncAt.get(userId) ?? 0) < 2_000) {
      return Promise.resolve(getSavedPros(userId));
    }
  }

  const request = (async () => {
    const local = getSavedPros(userId);
    const migrationKey = `${SYNCED_PREFIX}_${userId}`;
    const migrated = localStorage.getItem(migrationKey) === "1";
    const supabase = createClient();

    if (!migrated && local.length > 0) {
      const uploaded = await upsertRemoteSavedPros(userId, local);
      if (!uploaded) return local;
    }

    const { data, error } = await supabase
      .from("saved_professionals")
      .select("professional_id, snapshot")
      .eq("client_id", userId)
      .order("created_at", { ascending: false });
    if (error) return local;

    let remote = (data ?? [])
      .map((row) => row.snapshot as SavedPro | null)
      .filter((pro): pro is SavedPro => Boolean(pro?.id && pro?.slug && pro?.fullName));
    if (remote.length > 0) {
      const { data: currentModes } = await supabase
        .from("professionals")
        .select("id, videoconsulta, coverage_country")
        .in("id", remote.map((pro) => pro.id));
      const modesById = new Map((currentModes ?? []).map((row) => [row.id, row]));
      remote = remote.map((pro) => {
        const current = modesById.get(pro.id);
        if (!current) return pro;
        return {
          ...pro,
          videoconsulta: Boolean(current.videoconsulta),
          coverage: { ...pro.coverage, country: Boolean(current.coverage_country) },
        };
      });
    }
    setSavedPros(remote, userId);
    localStorage.setItem(migrationKey, "1");
    lastSyncAt.set(userId, Date.now());
    window.dispatchEvent(new CustomEvent("savedProsChanged"));
    return remote;
  })();

  syncRequests.set(userId, request);
  request.finally(() => {
    if (syncRequests.get(userId) === request) syncRequests.delete(userId);
  });
  return request;
}

async function saveProRemote(pro: SavedPro, userId: string) {
  savePro(pro, userId);
  await upsertRemoteSavedPros(userId, [pro]);
}

async function unsaveProRemote(id: string, userId: string) {
  unsavePro(id, userId);
  await createClient()
    .from("saved_professionals")
    .delete()
    .eq("client_id", userId)
    .eq("professional_id", id);
}

function writePendingSave(pro: SavedPro) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PENDING_SAVE_KEY, JSON.stringify(pro));
}

export async function applyPendingSavedPro(userId?: string): Promise<boolean> {
  const resolvedUserId = userId || currentUserId();
  if (typeof window === "undefined" || resolvedUserId === "guest") return false;
  try {
    const raw = localStorage.getItem(PENDING_SAVE_KEY);
    if (!raw) return false;
    const pro = JSON.parse(raw) as SavedPro;
    if (!pro?.id || !pro?.slug || !pro?.fullName) {
      localStorage.removeItem(PENDING_SAVE_KEY);
      return false;
    }
    await saveProRemote(pro, resolvedUserId);
    localStorage.removeItem(PENDING_SAVE_KEY);
    window.dispatchEvent(new CustomEvent("savedProsChanged"));
    return true;
  } catch {
    localStorage.removeItem(PENDING_SAVE_KEY);
    return false;
  }
}

/* ─── Save button component ─── */
interface SaveButtonProps {
  pro: SavedPro;
  className?: string;
  /** True when the viewer is looking at their OWN professional profile — block
      self-favoriting with a friendly explanation instead of saving. */
  isOwn?: boolean;
  /** Labeled pill variant for the PROFILE page ("Guardar"/"Guardado").
      Default (cards) is the bare, subtle top-right bookmark icon. Both share the
      exact same favorites logic, storage and self-action block, so the saved state
      stays consistent between a /buscar card and the profile. */
  withLabel?: boolean;
}

export function SaveButton({ pro, className, isOwn = false, withLabel = false }: SaveButtonProps) {
  const t = useTranslations("card");
  const locale = useLocale();
  const { user, loading: authLoading } = useAuth();
  const [saved, setSaved] = useState(false);
  const [selfMsg, setSelfMsg] = useState<string | null>(null);

  useEffect(() => {
    // Stay in sync if the SAME pro is toggled elsewhere in this tab (e.g. another
    // SaveButton instance) — cross-PAGE sync already happens via localStorage on mount.
    const sync = () => setSaved(user ? isSaved(pro.id, user.id) : false);
    sync();
    const syncRemote = () => {
      if (user) void syncSavedPros(user.id).then(sync);
    };
    syncRemote();
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") syncRemote();
    };
    window.addEventListener("savedProsChanged", sync);
    window.addEventListener("focus", syncRemote);
    document.addEventListener("visibilitychange", syncWhenVisible);
    return () => {
      window.removeEventListener("savedProsChanged", sync);
      window.removeEventListener("focus", syncRemote);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [pro.id, user]);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isOwn) {
      setSelfMsg(SELF_MSG.favorite);
      return;
    }
    // During hydration `useAuth` may briefly contain a cached user. Revalidate
    // the identity before deciding whether this is a guest action.
    const activeUser = authLoading
      ? (await createClient().auth.getUser()).data.user ?? null
      : user;
    if (!saved && !activeUser) {
      writePendingSave(pro);
      const redirect = encodeURIComponent("/dashboard/profesional?tab=saved&mode=use");
      window.location.assign(`/${locale}/login?redirect=${redirect}`);
      return;
    }
    if (!activeUser) return;
    if (saved) {
      await unsaveProRemote(pro.id, activeUser.id);
      setSaved(false);
      trackInteraction({ type: "favorite_remove", professionalId: pro.id, source: "favorites", locale });
    } else {
      await saveProRemote(pro, activeUser.id);
      setSaved(true);
      trackInteraction({ type: "favorite_add", professionalId: pro.id, source: "favorites", locale });
    }
    /* dispatch custom event so saved-tab + any other SaveButton refresh */
    window.dispatchEvent(new CustomEvent("savedProsChanged"));
  }

  return (
    <>
      {withLabel ? (
        <button
          data-save-button
          onClick={toggle}
          aria-label={saved ? t("unsave") : t("save")}
          aria-pressed={saved}
      className={cn(
        "inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors duration-200",
            saved
              ? "border-[#009FD9] bg-[#EBF5FB] text-[#009FD9]"
              : "border-[#e5e7eb] bg-white text-[#374151] hover:border-[#009FD9] hover:text-[#009FD9]",
        className
      )}
    >
      {saved ? t("savedLabel") : t("saveLabel")}
    </button>
      ) : (
        <button
          data-save-button
          onClick={toggle}
          aria-label={saved ? t("unsave") : t("save")}
          aria-pressed={saved}
          className={cn(
            "flex items-center justify-center p-1 transition-colors duration-200",
            saved
              ? "text-[#009FD9]"
              : "text-[#009FD9] hover:text-[#007fae]",
            className
          )}
        >
          <Bookmark className="h-[18px] w-[18px] text-[#00a7d8]" strokeWidth={2} fill={saved ? "currentColor" : "none"} />
        </button>
      )}
      <SelfActionModal open={!!selfMsg} onClose={() => setSelfMsg(null)} message={selfMsg ?? ""} />
    </>
  );
}

/* ─── Card wrapper: adds save button on top of any card ─── */
interface CardWrapperProps {
  pro: SavedPro;
  children: React.ReactNode;
  isOwn?: boolean;
}

export function SaveableCard({ pro, children, isOwn = false }: CardWrapperProps) {
  return (
    // The /buscar results are a SINGLE-COLUMN list (one card per row), so the card just
    // grows to its content — no equal-height plumbing needed here.
    <div className="relative">
      {children}
      {/* Always-visible favorites button. Keep it INSIDE the card on mobile so the
          search bottom sheet/map container can never clip it. */}
      <div className="absolute right-3 top-4 z-20 lg:right-5 lg:top-4">
        <SaveButton
          pro={pro}
          isOwn={isOwn}
          className="p-0 text-[#009FD9] hover:text-[#007fae]"
        />
      </div>
    </div>
  );
}
