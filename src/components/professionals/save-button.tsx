"use client";

import { useEffect, useState } from "react";
import { Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";

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
}

export function SaveButton({ pro, className }: SaveButtonProps) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(isSaved(pro.id));
  }, [pro.id]);

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
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
    <button
      onClick={toggle}
      aria-label={saved ? "Quitar de guardados" : "Guardar profesional"}
      className={cn(
        "group flex items-center justify-center w-9 h-9 rounded-full border transition-all duration-200",
        saved
          ? "bg-[#009FD9] border-[#009FD9] text-white shadow-md"
          : "bg-white/90 border-gray-200 text-gray-400 hover:border-[#009FD9] hover:text-[#009FD9] hover:bg-white shadow-sm",
        className
      )}
    >
      <Bookmark
        className="h-4 w-4 transition-transform duration-200 group-hover:scale-110"
        fill={saved ? "currentColor" : "none"}
      />
    </button>
  );
}

/* ─── Card wrapper: adds save button on top of any card ─── */
interface CardWrapperProps {
  pro: SavedPro;
  children: React.ReactNode;
}

export function SaveableCard({ pro, children }: CardWrapperProps) {
  return (
    <div className="relative">
      {children}
      {/* Always-visible favorites button, pinned to the card's top-right corner. */}
      <div className="absolute top-3 right-3 z-20">
        <SaveButton pro={pro} />
      </div>
    </div>
  );
}
