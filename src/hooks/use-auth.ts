"use client";

import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { APP_RESUME_EVENT } from "@/lib/app-events";

// Resolve once the image is decoded (or fails / times out — never hangs). Used to keep
// the avatar skeleton up until the photo can paint INSTANTLY, so the navbar never shows
// an initials/empty circle during the image-download window on a first login.
function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || typeof Image === "undefined") { resolve(); return; }
    const img = new Image();
    const done = () => resolve();
    img.onload = done;
    img.onerror = done;
    img.src = src;
    setTimeout(done, 2000); // safety: don't block the header on a hung request
  });
}

type AuthState = {
  user: User | null;
  avatarUrl: string | null;
  avatarReady: boolean;
  loading: boolean;
  notificationUnread: { offer: number; use: number; neutral: number };
};

const AuthContext = createContext<AuthState | null>(null);

const LAST_AUTH_USER_KEY = "ccr:last-auth-user";

function readCachedUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAST_AUTH_USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function cacheUser(u: User | null) {
  if (typeof window === "undefined") return;
  try {
    if (u) localStorage.setItem(LAST_AUTH_USER_KEY, JSON.stringify(u));
    else localStorage.removeItem(LAST_AUTH_USER_KEY);
  } catch { /* ignore */ }
}

function useAuthState(
  initialUser: User | null = null,
  initialAvatarUrl: string | null | undefined = undefined,
  initialNotificationUnread: { offer: number; use: number; neutral: number } = { offer: 0, use: 0, neutral: 0 },
): AuthState {
  const initialResolvedUser = initialUser ?? readCachedUser();
  const [user, setUser] = useState<User | null>(() => initialResolvedUser);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    if (!initialResolvedUser) return null;
    if (typeof window === "undefined") return initialAvatarUrl ?? null;
    try {
      return localStorage.getItem(`ccr:avatar:${initialResolvedUser.id}`) ?? initialAvatarUrl ?? null;
    } catch {
      return initialAvatarUrl ?? null;
    }
  });
  // Whether the avatar has been RESOLVED yet (a known photo URL, or a confirmed
  // no-photo). Until then the header shows a NEUTRAL skeleton — never the explicit
  // initials/"no-photo" circle — so an account WITH a photo can't flash empty before
  // the photo URL is known (the ~1s `profiles` fetch on a fresh login with no cache).
  const [avatarReady, setAvatarReady] = useState(() => {
    if (initialResolvedUser && initialAvatarUrl !== undefined) return true;
    if (!initialResolvedUser || typeof window === "undefined") return false;
    try {
      return Boolean(localStorage.getItem(`ccr:avatar:${initialResolvedUser.id}`));
    } catch {
      return false;
    }
  });
  const [loading, setLoading] = useState(true);

  async function syncAvatar(u: User) {
    // The SOCIAL photo (Google/Facebook) lives in user_metadata.avatar_url / picture.
    // It must NOT be the seed: for a quick-login account it would paint for ~1s and then
    // get replaced by the app's own profiles.avatar_url — the visible social→app FLASH.
    // So profiles.avatar_url is the SOURCE OF TRUTH; the social photo is only a fallback
    // when the account has NO app photo (better than initials).
    const social =
      (u.user_metadata?.avatar_url as string | undefined) ||
      (u.user_metadata?.picture as string | undefined) ||
      null;
    let cached: string | null = null;
    try { cached = typeof localStorage !== "undefined" ? localStorage.getItem(`ccr:avatar:${u.id}`) : null; } catch { /* ignore */ }
    // Seed instantly ONLY from the per-user cache — the app's OWN resolved avatar from the
    // last session, NEVER the social photo — so a warm reload shows the right photo with
    // no flash. With NO cache (first login), the skeleton holds until the fetch resolves
    // below; we never paint the social photo first (that was the bug).
    if (cached) { setAvatarUrl((prev) => prev ?? cached); setAvatarReady(true); }

    // Reconcile with the canonical profile record (Cloudinary uploads) — authoritative —
    // and refresh the cache so the next load is instant. The social photo is used ONLY if
    // there is no app photo. After this we know the true state, so ready flips true.
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", u.id)
      .single();
    const finalUrl = (data?.avatar_url as string | undefined) || social || null;
    // On a FIRST login (no cache seed yet), hold the skeleton until the image is decoded,
    // so the navbar paints the photo directly — never an initials/empty circle during the
    // image download. Warm reloads (cache already shown + image in HTTP cache) skip this.
    if (finalUrl && !cached) { await preloadImage(finalUrl); }
    setAvatarUrl(finalUrl);
    setAvatarReady(true);
    try {
      if (finalUrl) localStorage.setItem(`ccr:avatar:${u.id}`, finalUrl);
      else localStorage.removeItem(`ccr:avatar:${u.id}`);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    let sessionSettled = false;
    const sessionTimeout = window.setTimeout(() => {
      if (!mounted || sessionSettled) return;
      setUser(null);
      cacheUser(null);
      setAvatarUrl(null);
      setAvatarReady(true);
      setLoading(false);
    }, 4000);

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        sessionSettled = true;
        window.clearTimeout(sessionTimeout);
        const u = data.session?.user ?? null;
        setUser(u);
        cacheUser(u);
        if (u) syncAvatar(u);
        else setAvatarReady(true); // logged out → nothing to load, render immediately
      })
      .catch(() => {
        if (!mounted) return;
        sessionSettled = true;
        window.clearTimeout(sessionTimeout);
        // Corrupt/stale local session — clear it and treat the user as logged
        // out instead of letting the error surface as a broken UI.
        supabase.auth.signOut().catch(() => undefined);
        setUser(null);
        cacheUser(null);
        setAvatarReady(true);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => {
      const u = session?.user ?? null;
      setUser(u);
      cacheUser(u);
      if (u) {
        syncAvatar(u);
      } else {
        setAvatarUrl(null);
        setAvatarReady(true);
      }
    });

    // After a profile change (e.g. cédula verification renames the account, or a
    // new photo), code dispatches `ccr:profile-updated` — re-pull the user so the
    // header name/avatar update IMMEDIATELY even if the metadata change came from a
    // different Supabase client instance that didn't fire our onAuthStateChange.
    const refreshUser = () => {
      supabase.auth.getUser().then(({ data }) => {
        const u = data.user ?? null;
        setUser(u);
        cacheUser(u);
        if (u) {
          syncAvatar(u);
        } else {
          setAvatarUrl(null);
          setAvatarReady(true);
        }
      }).catch(() => { /* ignore */ });
    };
    const onProfileUpdated = () => refreshUser();
    window.addEventListener("ccr:profile-updated", onProfileUpdated);
    window.addEventListener(APP_RESUME_EVENT, refreshUser);

    return () => {
      mounted = false;
      window.clearTimeout(sessionTimeout);
      subscription.unsubscribe();
      window.removeEventListener("ccr:profile-updated", onProfileUpdated);
      window.removeEventListener(APP_RESUME_EVENT, refreshUser);
    };
  }, []);

  return { user, avatarUrl, avatarReady, loading, notificationUnread: initialNotificationUnread };
}

export function AuthProvider({ children, initialUser = null, initialAvatarUrl, initialNotificationUnread }: { children: ReactNode; initialUser?: User | null; initialAvatarUrl?: string | null; initialNotificationUnread?: { offer: number; use: number; neutral: number } }) {
  const value = useAuthState(initialUser, initialAvatarUrl, initialNotificationUnread);
  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
