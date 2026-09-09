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
const mutationEpochs = new Map<string, number>();
const activeMutations = new Map<string, number>();

function bumpMutationEpoch(userId: string) {
  mutationEpochs.set(userId, (mutationEpochs.get(userId) ?? 0) + 1);
}

function beginMutation(userId: string) {
  activeMutations.set(userId, (activeMutations.get(userId) ?? 0) + 1);
  bumpMutationEpoch(userId);
}

function endMutation(userId: string) {
  const remaining = Math.max(0, (activeMutations.get(userId) ?? 1) - 1);
  if (remaining === 0) activeMutations.delete(userId);
  else activeMutations.set(userId, remaining);
  bumpMutationEpoch(userId);
}

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
  businessName?: string;
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
  // The local optimistic value is authoritative until its remote write has
  // completed. Starting a SELECT during that window can only return an older
  // snapshot and must not be allowed to overwrite the current button state.
  if ((activeMutations.get(userId) ?? 0) > 0) {
    return Promise.resolve(getSavedPros(userId));
  }

  if (!force) {
    const pending = syncRequests.get(userId);
    if (pending) return pending;
    if (Date.now() - (lastSyncAt.get(userId) ?? 0) < 2_000) {
      return Promise.resolve(getSavedPros(userId));
    }
  }

  const request = (async () => {
    // A profile can be saved immediately after this background refresh starts.
    // Remember the mutation epoch so an older SELECT can never overwrite that
    // newer optimistic state when it resolves.
    const mutationEpoch = mutationEpochs.get(userId) ?? 0;
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
        .select("id, business_name, videoconsulta, coverage_country")
        .in("id", remote.map((pro) => pro.id));
      const modesById = new Map((currentModes ?? []).map((row) => [row.id, row]));
      remote = remote.map((pro) => {
        const current = modesById.get(pro.id);
        if (!current) return pro;
        return {
          ...pro,
          businessName: current.business_name?.trim() || undefined,
          videoconsulta: Boolean(current.videoconsulta),
          coverage: { ...pro.coverage, country: Boolean(current.coverage_country) },
        };
      });
    }
    if ((mutationEpochs.get(userId) ?? 0) !== mutationEpoch) {
      return getSavedPros(userId);
    }

    localStorage.setItem(migrationKey, "1");
    lastSyncAt.set(userId, Date.now());
    // Una LECTURA que no encontró cambios no anuncia cambios: este evento lo
    // escucha el refresco global de datos, y anunciarlo en cada sincronización
    // re-pedía la ruta entera al servidor justo después de pintarla — el
    // "refresh" fantasma al entrar a una sección tras estar inactivo.
    if (JSON.stringify(getSavedPros(userId)) !== JSON.stringify(remote)) {
      setSavedPros(remote, userId);
      window.dispatchEvent(new CustomEvent("savedProsChanged"));
    }
    return remote;
  })();

  syncRequests.set(userId, request);
  request.finally(() => {
    if (syncRequests.get(userId) === request) syncRequests.delete(userId);
  });
  return request;
}

async function saveProRemote(pro: SavedPro, userId: string) {
  // Bump both before and after the write. A sync that started before this
  // mutation, or while its remote UPSERT was in flight, must discard its
  // potentially stale snapshot instead of reverting the button visually.
  beginMutation(userId);
  try {
    savePro(pro, userId);
    await upsertRemoteSavedPros(userId, [pro]);
  } finally {
    endMutation(userId);
  }
}

export async function unsaveProRemote(id: string, userId: string) {
  beginMutation(userId);
  try {
    unsavePro(id, userId);
    await createClient()
      .from("saved_professionals")
      .delete()
      .eq("client_id", userId)
      .eq("professional_id", id);
  } finally {
    endMutation(userId);
  }
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
  /** Marcador grande dentro de un círculo, para la cabecera de un perfil. */
  bubble?: boolean;
  /** Ícono con rótulo, sin borde: la forma que usan las fichas. */
  sutil?: boolean;
}

export function SaveButton({ pro, className, isOwn = false, withLabel = false, bubble = false, sutil = false }: SaveButtonProps) {
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
      // Sin aviso flotante: el propio botón pasa a "Guardado" y eso ya lo dice.
      setSaved(true);
      trackInteraction({ type: "favorite_add", professionalId: pro.id, source: "favorites", locale });
    }
    /* dispatch custom event so saved-tab + any other SaveButton refresh */
    window.dispatchEvent(new CustomEvent("savedProsChanged"));
  }

  return (
    <>
      {sutil ? (
        // Ícono con rótulo y sin borde: dice qué hace sin pesar como un botón
        // de contacto. Un marcador solo no se entiende (se confunde con el del
        // navegador) y con borde competía con "Ver disponibilidad".
        <button
          data-save-button
          onClick={toggle}
          aria-label={saved ? t("unsave") : t("save")}
          aria-pressed={saved}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-bold transition-colors duration-200",
            saved ? "text-[#0089bb] hover:bg-[#eaf7fc]" : "text-[#52627a] hover:bg-[#eef3f8] hover:text-[#162543]",
            className,
          )}
        >
          <Bookmark className="h-4 w-4 shrink-0" fill={saved ? "currentColor" : "none"} />
          {saved ? t("savedLabel") : t("saveShort")}
        </button>
      ) : bubble ? (
        // Marcador grande: la misma acción que en las tarjetas, con el tamaño de
        // un botón de verdad y el color que dice si ya está guardado.
        <button
          data-save-button
          onClick={toggle}
          aria-label={saved ? t("unsave") : t("save")}
          aria-pressed={saved}
          title={saved ? t("savedLabel") : t("saveLabel")}
          className={cn(
            "grid h-11 w-11 place-items-center rounded-full border transition-colors duration-200",
            saved
              ? "border-[#009FD9] bg-[#eaf7fc] text-[#0089bb]"
              : "border-[#d7e1ea] bg-white text-[#162543] hover:border-[#b9c8d6] hover:bg-[#f6f9fb]",
            className,
          )}
        >
          <Bookmark className="h-5 w-5" fill={saved ? "currentColor" : "none"} />
        </button>
      ) : withLabel ? (
        <button
          data-save-button
          onClick={toggle}
          aria-label={saved ? t("unsave") : t("save")}
          aria-pressed={saved}
      className={cn(
        "inline-flex w-full items-center justify-center gap-2 rounded-full border bg-white px-4 py-2.5 text-sm font-bold transition-colors duration-200",
        saved
          ? "border-[#009FD9] text-[#0089bb] hover:bg-[#f2fbfe]"
          : "border-[#d7e1ea] text-[#162543] hover:border-[#b9c8d6] hover:bg-[#f6f9fb]",
        className
      )}
    >
      <Bookmark className="h-4 w-4 shrink-0" fill={saved ? "currentColor" : "none"} />
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
      <div className="absolute right-3 top-3 z-20 lg:right-5 lg:top-4">
        <SaveButton
          pro={pro}
          isOwn={isOwn}
          className="p-0 text-[#009FD9] hover:text-[#007fae]"
        />
      </div>
    </div>
  );
}
