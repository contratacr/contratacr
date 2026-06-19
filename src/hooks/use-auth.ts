"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function syncAvatar(u: User) {
    // Optimistic: show the avatar SYNCHRONOUSLY (same render as setUser) so the
    // header never flashes an empty/initials circle before the photo loads. We try
    // user_metadata (mirrored on upload) first, then a per-user localStorage cache
    // from the last session — so a reload of an account WITH a photo never flashes.
    const metaAvatar =
      (u.user_metadata?.avatar_url as string | undefined) ||
      (u.user_metadata?.picture as string | undefined) ||
      null;
    let cached: string | null = null;
    try { cached = typeof localStorage !== "undefined" ? localStorage.getItem(`ccr:avatar:${u.id}`) : null; } catch { /* ignore */ }
    if (metaAvatar || cached) setAvatarUrl((prev) => prev ?? metaAvatar ?? cached);

    // Then reconcile with the canonical profile record (Cloudinary uploads) and
    // refresh the cache so next load is instant.
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", u.id)
      .single();
    const finalUrl = data?.avatar_url || metaAvatar || cached || null;
    setAvatarUrl(finalUrl);
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
      })
      .catch(async () => {
        // Corrupt/stale local session — clear it and treat the user as logged
        // out instead of letting the error surface as a broken UI.
        try { await supabase.auth.signOut(); } catch { /* ignore */ }
        setUser(null);
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

  return { user, avatarUrl, loading };
}
