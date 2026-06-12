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
}

export function SaveButton({ pro, className, isOwn = false }: SaveButtonProps) {
  const t = useTranslations("card");
  const [saved, setSaved] = useState(false);
  const [selfMsg, setSelfMsg] = useState<string | null>(null);

  useEffect(() => {
    setSaved(isSaved(pro.id));
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
    /* dispatch custom event so saved-tab can refresh if open */
    window.dispatchEvent(new CustomEvent("savedProsChanged"));
  }

  return (
    <>
      <button
        onClick={toggle}
        aria-label={saved ? t("unsave") : t("save")}
        className={cn(
          "flex items-center justify-center w-7 h-7 rounded-full border bg-white/90 backdrop-blur transition-colors duration-200",
          saved
            ? "border-[#009FD9] text-[#009FD9]"
            : "border-[#e5e7eb] text-[#9ca3af] hover:text-[#374151] hover:border-[#cbd5e1]",
          className
        )}
      >
        <Bookmark className="h-3.5 w-3.5" fill={saved ? "currentColor" : "none"} />
      </button>
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
    <div className="relative">
      {children}
      {/* Always-visible favorites button, pinned consistently to the card's
          top-right corner (small + subtle; price row clears it via md:pr-10). */}
      <div className="absolute top-2.5 right-2.5 z-20">
        <SaveButton pro={pro} isOwn={isOwn} />
      </div>
    </div>
  );
}
