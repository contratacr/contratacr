"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { SelfActionModal, SELF_MSG } from "@/components/professionals/self-action-modal";

const STORAGE_PREFIX = "contratacr_saved_pros";

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

function storageKey(): string {
  return `${STORAGE_PREFIX}_${currentUserId()}`;
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
};

export function getSavedPros(): SavedPro[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(storageKey()) ?? "[]");
  } catch {
    return [];
  }
}

export function savePro(pro: SavedPro) {
  const saved = getSavedPros();
  if (!saved.find((p) => p.id === pro.id)) {
    localStorage.setItem(storageKey(), JSON.stringify([...saved, pro]));
  }
}

export function unsavePro(id: string) {
  const saved = getSavedPros().filter((p) => p.id !== id);
  localStorage.setItem(storageKey(), JSON.stringify(saved));
}

export function isSaved(id: string): boolean {
  return getSavedPros().some((p) => p.id === id);
}

/* ─── Save button component ─── */
interface SaveButtonProps {
  pro: SavedPro;
  className?: string;
  /** True when the viewer is looking at their OWN professional profile — block
      self-favoriting with a friendly explanation instead of saving. */
  isOwn?: boolean;
  /** Labeled pill variant for the PROFILE page (icon + "Guardar"/"Guardado").
      Default (cards) is the bare, subtle top-right bookmark icon. Both share the
      exact same favorites logic, storage and self-action block, so the saved state
      stays consistent between a /buscar card and the profile. */
  withLabel?: boolean;
}

export function SaveButton({ pro, className, isOwn = false, withLabel = false }: SaveButtonProps) {
  const t = useTranslations("card");
  const [saved, setSaved] = useState(() => isSaved(pro.id));
  const [selfMsg, setSelfMsg] = useState<string | null>(null);

  useEffect(() => {
    // Stay in sync if the SAME pro is toggled elsewhere in this tab (e.g. another
    // SaveButton instance) — cross-PAGE sync already happens via localStorage on mount.
    const sync = () => setSaved(isSaved(pro.id));
    window.addEventListener("savedProsChanged", sync);
    return () => window.removeEventListener("savedProsChanged", sync);
  }, [pro.id]);

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isOwn) {
      setSelfMsg(SELF_MSG.favorite);
      return;
    }
    if (saved) {
      unsavePro(pro.id);
      setSaved(false);
    } else {
      savePro(pro);
      setSaved(true);
    }
    /* dispatch custom event so saved-tab + any other SaveButton refresh */
    window.dispatchEvent(new CustomEvent("savedProsChanged"));
  }

  return (
    <>
      {withLabel ? (
        <button
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
          <Bookmark className="h-4 w-4 shrink-0" strokeWidth={2} fill={saved ? "currentColor" : "none"} />
          {saved ? t("savedLabel") : t("saveLabel")}
        </button>
      ) : (
        <button
          onClick={toggle}
          aria-label={saved ? t("unsave") : t("save")}
          aria-pressed={saved}
          className={cn(
            "flex items-center justify-center p-1 transition-colors duration-200",
            saved
              ? "text-[#009FD9]"
              : "text-[#9ca3af] hover:text-[#374151]",
            className
          )}
        >
          <Bookmark className="h-[18px] w-[18px]" strokeWidth={2} fill={saved ? "currentColor" : "none"} />
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
      <div className="absolute right-3 top-1.5 z-20">
        <SaveButton pro={pro} isOwn={isOwn} />
      </div>
    </div>
  );
}
