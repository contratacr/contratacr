"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

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

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  // Whether the avatar has been RESOLVED yet (a known photo URL, or a confirmed
  // no-photo). Until then the header shows a NEUTRAL skeleton — never the explicit
  // initials/"no-photo" circle — so an account WITH a photo can't flash empty before
  // the photo URL is known (the ~1s `profiles` fetch on a fresh login with no cache).
  const [avatarReady, setAvatarReady] = useState(false);
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

    supabase.auth
      .getSession()
      .then(({ data }) => {
        const u = data.session?.user ?? null;
        setUser(u);
        if (u) syncAvatar(u);
        else setAvatarReady(true); // logged out → nothing to load, render immediately
      })
      .catch(async () => {
        // Corrupt/stale local session — clear it and treat the user as logged
        // out instead of letting the error surface as a broken UI.
        try { await supabase.auth.signOut(); } catch { /* ignore */ }
        setUser(null);
        setAvatarReady(true);
      })
      .finally(() => setLoading(false));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => {
      const u = session?.user ?? null;
      setUser(u);
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
    const onProfileUpdated = () => {
      supabase.auth.getUser().then(({ data }) => {
        const u = data.user ?? null;
        if (u) { setUser(u); syncAvatar(u); }
      }).catch(() => { /* ignore */ });
    };
    window.addEventListener("ccr:profile-updated", onProfileUpdated);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("ccr:profile-updated", onProfileUpdated);
    };
  }, []);

  return { user, avatarUrl, avatarReady, loading };
}
